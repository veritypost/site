import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { withApnsSession, resolveApnsEnv } from '@/lib/apns';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';

// Push delivery worker. Mirrors /api/cron/send-emails in shape: picks
// unsent notifications whose channel isn't 'in_app' (quiet hours force
// channel='in_app' via create_notification), honours per-user
// alert_preferences.channel_push, and dispatches via APNs.
//
// Schedule: every minute (vercel.json). BATCH_SIZE × concurrency are tuned
// so breaking-news fan-outs to tens of thousands of users drain in a few
// minutes rather than hours.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 500;
const CONCURRENCY = 50;

async function run(request) {
  if (!verifyCronAuth(request).ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!process.env.APNS_AUTH_KEY) {
    return NextResponse.json({ error: 'APNS_AUTH_KEY not configured', sent: 0 }, { status: 503 });
  }

  const service = createServiceClient();

  const { data: queued, error: loadErr } = await service
    .from('notifications')
    .select('id, user_id, type, title, body, action_url, metadata')
    .eq('push_sent', false)
    .neq('channel', 'in_app')
    .order('created_at')
    .limit(BATCH_SIZE);
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!queued?.length) return NextResponse.json({ sent: 0 });

  const userIds = [...new Set(queued.map(n => n.user_id))];
  const [{ data: prefs }, { data: tokens }, { data: planRows }] = await Promise.all([
    service.from('alert_preferences')
      .select('user_id, alert_type, channel_push, is_enabled, quiet_hours_start, quiet_hours_end')
      .in('user_id', userIds),
    service.from('user_push_tokens')
      .select('id, user_id, push_token, environment')
      .in('user_id', userIds)
      .eq('provider', 'apns')
      .is('invalidated_at', null),
    service.from('users')
      .select('id, timezone, plans(tier)')
      .in('id', userIds),
  ]);

  // Bug 98: belt-and-suspenders quiet-hours check. The create_notification RPC
  // already forces channel='in_app' when quiet hours are active — but it evaluates
  // against server-UTC time. At dispatch we re-check in the caller's timezone so a
  // direct notifications INSERT or a timezone-aware preference is still honoured.
  const userTz = Object.fromEntries((planRows || []).map(u => [u.id, u.timezone || 'UTC']));
  function nowMinutesInTz(tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit',
      }).formatToParts(new Date());
      const h = Number(parts.find(p => p.type === 'hour')?.value || 0);
      const m = Number(parts.find(p => p.type === 'minute')?.value || 0);
      return h * 60 + m;
    } catch { return null; }
  }
  function parseTimeToMinutes(t) {
    if (!t) return null;
    const [hh, mm] = String(t).split(':');
    return Number(hh) * 60 + Number(mm || 0);
  }
  function insideQuietHours(pref, tz) {
    const s = parseTimeToMinutes(pref.quiet_hours_start);
    const e = parseTimeToMinutes(pref.quiet_hours_end);
    if (s == null || e == null) return false;
    const now = nowMinutesInTz(tz);
    if (now == null) return false;
    return s < e ? (now >= s && now < e) : (now >= s || now < e);
  }

  // D14: free Verified users get ONE breaking-news push per day. Count
  // today's delivered breaking-news pushes per user so the cron can cap
  // additional queued breaking-news notifications for free callers.
  const freeUserIds = (planRows || [])
    .filter(u => !u.plans?.tier || u.plans.tier === 'free')
    .map(u => u.id);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const breakingSentToday = {};
  if (freeUserIds.length > 0) {
    const { data: sentRows } = await service
      .from('notifications')
      .select('user_id')
      .in('user_id', freeUserIds)
      .eq('type', 'breaking_news')
      .eq('push_sent', true)
      .gte('push_sent_at', todayStart.toISOString());
    for (const r of sentRows || []) {
      breakingSentToday[r.user_id] = (breakingSentToday[r.user_id] || 0) + 1;
    }
  }
  const freeSet = new Set(freeUserIds);

  const prefKey = (uid, type) => `${uid}:${type}`;
  const prefsMap = Object.fromEntries((prefs || []).map(p => [prefKey(p.user_id, p.alert_type), p]));

  const tokensByUser = {};
  for (const t of tokens || []) {
    (tokensByUser[t.user_id] ||= []).push(t);
  }

  let sent = 0, skipped = 0, failed = 0, invalidated = 0;

  // First pass: dispositions that don't need APNs at all.
  const needsDispatch = [];
  for (const n of queued) {
    const pref = prefsMap[prefKey(n.user_id, n.type)];
    if (pref && (pref.is_enabled === false || pref.channel_push === false)) {
      await service.from('notifications').update({
        push_sent: true,
        push_sent_at: new Date().toISOString(),
        metadata: { ...(n.metadata || {}), push_skip_reason: 'opted_out' },
      }).eq('id', n.id);
      skipped++;
      continue;
    }
    // Belt-and-suspenders quiet-hours check at dispatch time.
    if (pref && insideQuietHours(pref, userTz[n.user_id])) {
      await service.from('notifications').update({
        channel: 'in_app',
        push_sent: true,
        push_sent_at: new Date().toISOString(),
        metadata: { ...(n.metadata || {}), push_skip_reason: 'quiet_hours' },
      }).eq('id', n.id);
      skipped++;
      continue;
    }
    // D14 cap: free users get 1 breaking-news push per day. Each time
    // we drop a queued breaking-news push against the day's cap, bump
    // breakingSentToday so same-batch duplicates also honour the cap.
    if (n.type === 'breaking_news' && freeSet.has(n.user_id)) {
      const already = breakingSentToday[n.user_id] || 0;
      if (already >= 1) {
        await service.from('notifications').update({
          channel: 'in_app',
          push_sent: true,
          push_sent_at: new Date().toISOString(),
          metadata: { ...(n.metadata || {}), push_skip_reason: 'breaking_news_daily_cap' },
        }).eq('id', n.id);
        skipped++;
        continue;
      }
      breakingSentToday[n.user_id] = already + 1;
    }
    const userTokens = tokensByUser[n.user_id];
    if (!userTokens?.length) {
      await service.from('notifications').update({
        push_sent: true,
        push_sent_at: new Date().toISOString(),
        metadata: { ...(n.metadata || {}), push_skip_reason: 'no_token' },
      }).eq('id', n.id);
      skipped++;
      continue;
    }
    needsDispatch.push({ n, tokens: userTokens });
  }

  if (!needsDispatch.length) {
    return NextResponse.json({ sent, skipped, failed, invalidated, batch: queued.length });
  }

  // Flatten to (notification, token) pairs and partition by the token's
  // APNs environment. A user with mixed TestFlight-sandbox + App Store-
  // production devices shows up in both buckets; each bucket runs against
  // its own HTTP/2 session so sandbox tokens don't silently get BadDeviceToken
  // on the production host (and vice versa).
  const dispatchByEnv = { production: [], sandbox: [] };
  for (const { n, tokens: userTokens } of needsDispatch) {
    for (const t of userTokens) {
      const env = resolveApnsEnv(t.environment);
      dispatchByEnv[env].push({ n, token: t });
    }
  }

  const deliveredNotifIds = new Set();

  for (const env of ['production', 'sandbox']) {
    const pairs = dispatchByEnv[env];
    if (!pairs.length) continue;

    await withApnsSession(async ({ send }) => {
      let i = 0;
      while (i < pairs.length) {
        const wave = pairs.slice(i, i + CONCURRENCY);
        i += CONCURRENCY;

        await Promise.all(wave.map(async ({ n, token: t }) => {
          const r = await send(t.push_token, {
            title: n.title,
            body: n.body,
            url: n.action_url,
            metadata: n.metadata || undefined,
          });
          await service.from('push_receipts').insert({
            notification_id: n.id,
            user_id: n.user_id,
            provider: 'apns',
            push_token: t.push_token,
            status: r.ok ? 'delivered' : 'failed',
            provider_message_id: r.apnsId || null,
            error_code: r.reason || null,
            error_message: r.ok ? null : (r.reason || `http ${r.status}`),
            token_invalidated: !!r.invalidated,
            sent_at: new Date().toISOString(),
          });
          if (r.ok) deliveredNotifIds.add(n.id);
          if (r.invalidated) {
            invalidated += 1;
            await service.rpc('invalidate_user_push_token', { p_token: t.push_token });
          }
        }));
      }
    }, { environment: env });
  }

  // Mark every notification push_sent once both envs have drained. A
  // non-retryable failure on any device shouldn't cause replay.
  for (const { n } of needsDispatch) {
    await service.from('notifications').update({
      push_sent: true,
      push_sent_at: new Date().toISOString(),
    }).eq('id', n.id);
    if (deliveredNotifIds.has(n.id)) sent += 1;
    else failed += 1;
  }

  return NextResponse.json({ sent, skipped, failed, invalidated, batch: queued.length });
}

export const GET = withCronLog('send-push', run);
export const POST = withCronLog('send-push', run);
