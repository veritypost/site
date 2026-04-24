// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { withApnsSession, resolveApnsEnv } from '@/lib/apns';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';
import { getPlanLimitValue } from '@/lib/plans';

const CRON_NAME = 'send-push';

// Auth: CRON_SECRET via verifyCronAuth. Fail-closed 403.
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

// L3: BATCH_SIZE lowered from 500 → 200 to stay under PostgREST's 8 KB URL
// cap on the downstream `.in('user_id', userIds)` queries. A batch of 500
// distinct UUID v4 strings joins to ~18 KB which PostgREST silently truncates
// mid-list (no 414 error surfaced to the client), so the alert_preferences /
// user_push_tokens / users lookups returned partial data for most batches.
// 200 keeps the URL under ~7.4 KB with a comfortable headroom. maxDuration=60
// still clears a full fan-out in multiple cron ticks.
const BATCH_SIZE = 200;
// H19 — CONCURRENCY lowered from 50 → 20. At 50, a breaking-news
// fan-out could pin ~83% of Supabase's default 60-connection pool for
// the batch duration, starving other routes (reader fetches, RPC
// calls from other crons). 20 is a safer ceiling that still drains
// a 200-row batch in seconds via APNs pipelining. Bump back up once
// we upsize the Supabase pool or confirm the prior saturation
// headroom via live observation.
const CONCURRENCY = 20;

async function run(request) {
  if (!verifyCronAuth(request).ok)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await logCronHeartbeat(CRON_NAME, 'start');
  try {
    return await runInner();
  } catch (err) {
    await logCronHeartbeat(CRON_NAME, 'error', { error: err?.message || String(err) });
    throw err;
  }
}

async function runInner() {
  if (!process.env.APNS_AUTH_KEY) {
    await logCronHeartbeat(CRON_NAME, 'error', { error: 'APNS_AUTH_KEY not configured' });
    return NextResponse.json({ error: 'APNS_AUTH_KEY not configured', sent: 0 }, { status: 503 });
  }

  const service = createServiceClient();

  // L19: atomic claim via claim_push_batch RPC (FOR UPDATE SKIP LOCKED so
  // overlapping cron invocations see disjoint rows). Replaces the prior
  // SELECT-then-mark pattern, which let two concurrent runs pick up the
  // same 200 notifications and dispatch each one twice. Stale claims
  // (>5 min old) are reclaimable inside the RPC so a crashed prior run
  // doesn't permanently lock notifications.
  const { data: queued, error: loadErr } = await service.rpc('claim_push_batch', {
    p_limit: BATCH_SIZE,
  });
  if (loadErr) {
    console.error('[cron.send-push] claim failed:', loadErr);
    await logCronHeartbeat(CRON_NAME, 'error', { error: loadErr.message, stage: 'claim' });
    return NextResponse.json({ error: 'Claim failed' }, { status: 500 });
  }
  if (!queued?.length) {
    await logCronHeartbeat(CRON_NAME, 'end', { sent: 0, batch: 0 });
    return NextResponse.json({ sent: 0 });
  }

  const userIds = [...new Set(queued.map((n) => n.user_id))];
  // H15 — Promise.allSettled matches send-emails' resilience pattern.
  // Prior Promise.all aborted the entire setup on a single DB failure,
  // leaving the claimed notifications stuck in 'processing' state
  // until the stale-claim reclaim window (5 min) freed them. Any of
  // these three fetches can now fail independently; the batch
  // continues with empty results for the failed queries (downstream
  // logic already tolerates empty prefs / tokens / planRows via the
  // per-notification checks). Log each failure loudly so ops notices.
  const [prefsRes, tokensRes, plansRes] = await Promise.allSettled([
    service
      .from('alert_preferences')
      .select('user_id, alert_type, channel_push, is_enabled, quiet_hours_start, quiet_hours_end')
      .in('user_id', userIds),
    service
      .from('user_push_tokens')
      .select('id, user_id, push_token, environment')
      .in('user_id', userIds)
      .eq('provider', 'apns')
      .is('invalidated_at', null),
    service.from('users').select('id, timezone, plans(tier)').in('id', userIds),
  ]);
  if (prefsRes.status === 'rejected')
    console.error('[cron.send-push] alert_preferences fetch failed', prefsRes.reason);
  if (tokensRes.status === 'rejected')
    console.error('[cron.send-push] user_push_tokens fetch failed', tokensRes.reason);
  if (plansRes.status === 'rejected')
    console.error('[cron.send-push] users fetch failed', plansRes.reason);
  const prefs = prefsRes.status === 'fulfilled' ? (prefsRes.value.data ?? []) : [];
  const tokens = tokensRes.status === 'fulfilled' ? (tokensRes.value.data ?? []) : [];
  const planRows = plansRes.status === 'fulfilled' ? (plansRes.value.data ?? []) : [];

  // Bug 98: belt-and-suspenders quiet-hours check. The create_notification RPC
  // already forces channel='in_app' when quiet hours are active — but it evaluates
  // against server-UTC time. At dispatch we re-check in the caller's timezone so a
  // direct notifications INSERT or a timezone-aware preference is still honoured.
  const userTz = Object.fromEntries((planRows || []).map((u) => [u.id, u.timezone || 'UTC']));
  function nowMinutesInTz(tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      }).formatToParts(new Date());
      const h = Number(parts.find((p) => p.type === 'hour')?.value || 0);
      const m = Number(parts.find((p) => p.type === 'minute')?.value || 0);
      return h * 60 + m;
    } catch {
      return null;
    }
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
    return s < e ? now >= s && now < e : now >= s || now < e;
  }

  // D14: free Verified users get a capped number of breaking-news
  // pushes per day. The cap itself is now DB-driven via
  // plan_features.breaking_alerts (limit_value=1, limit_type='per_day'
  // for the free plan). T-016 — the `>= 1` hardcode lower down reads
  // this resolved value.
  const freeUserIds = (planRows || [])
    .filter((u) => !u.plans?.tier || u.plans.tier === 'free')
    .map((u) => u.id);
  const freePlanId =
    (planRows || []).find((u) => u.plan_id && u.plans?.tier === 'free')?.plan_id ?? null;
  const breakingDailyCap =
    (await getPlanLimitValue(service, freePlanId, 'breaking_alerts', 1)) ?? 1;
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
  const prefsMap = Object.fromEntries(
    (prefs || []).map((p) => [prefKey(p.user_id, p.alert_type), p])
  );

  const tokensByUser = {};
  for (const t of tokens || []) {
    (tokensByUser[t.user_id] ||= []).push(t);
  }

  let sent = 0,
    skipped = 0,
    failed = 0,
    invalidated = 0;

  // First pass: dispositions that don't need APNs at all.
  const needsDispatch = [];
  for (const n of queued) {
    const pref = prefsMap[prefKey(n.user_id, n.type)];
    if (pref && (pref.is_enabled === false || pref.channel_push === false)) {
      await service
        .from('notifications')
        .update({
          push_sent: true,
          push_sent_at: new Date().toISOString(),
          metadata: { ...(n.metadata || {}), push_skip_reason: 'opted_out' },
        })
        .eq('id', n.id);
      skipped++;
      continue;
    }
    // Belt-and-suspenders quiet-hours check at dispatch time.
    if (pref && insideQuietHours(pref, userTz[n.user_id])) {
      await service
        .from('notifications')
        .update({
          channel: 'in_app',
          push_sent: true,
          push_sent_at: new Date().toISOString(),
          metadata: { ...(n.metadata || {}), push_skip_reason: 'quiet_hours' },
        })
        .eq('id', n.id);
      skipped++;
      continue;
    }
    // D14 cap: free users get a capped number of breaking-news pushes
    // per day (DB-driven — see plan_features.breaking_alerts and the
    // `breakingDailyCap` resolution above). Each drop bumps
    // breakingSentToday so same-batch duplicates also honour the cap.
    if (n.type === 'breaking_news' && freeSet.has(n.user_id)) {
      const already = breakingSentToday[n.user_id] || 0;
      if (already >= breakingDailyCap) {
        await service
          .from('notifications')
          .update({
            channel: 'in_app',
            push_sent: true,
            push_sent_at: new Date().toISOString(),
            metadata: { ...(n.metadata || {}), push_skip_reason: 'breaking_news_daily_cap' },
          })
          .eq('id', n.id);
        skipped++;
        continue;
      }
      breakingSentToday[n.user_id] = already + 1;
    }
    const userTokens = tokensByUser[n.user_id];
    if (!userTokens?.length) {
      await service
        .from('notifications')
        .update({
          push_sent: true,
          push_sent_at: new Date().toISOString(),
          metadata: { ...(n.metadata || {}), push_skip_reason: 'no_token' },
        })
        .eq('id', n.id);
      skipped++;
      continue;
    }
    needsDispatch.push({ n, tokens: userTokens });
  }

  if (!needsDispatch.length) {
    await logCronHeartbeat(CRON_NAME, 'end', {
      sent,
      skipped,
      failed,
      invalidated,
      batch: queued.length,
    });
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

    await withApnsSession(
      async ({ send }) => {
        let i = 0;
        while (i < pairs.length) {
          const wave = pairs.slice(i, i + CONCURRENCY);
          i += CONCURRENCY;

          await Promise.all(
            wave.map(async ({ n, token: t }) => {
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
                error_message: r.ok ? null : r.reason || `http ${r.status}`,
                token_invalidated: !!r.invalidated,
                sent_at: new Date().toISOString(),
              });
              if (r.ok) deliveredNotifIds.add(n.id);
              if (r.invalidated) {
                invalidated += 1;
                await service.rpc('invalidate_user_push_token', { p_token: t.push_token });
              }
            })
          );
        }
      },
      { environment: env }
    );
  }

  // Mark every notification push_sent once both envs have drained. A
  // non-retryable failure on any device shouldn't cause replay.
  for (const { n } of needsDispatch) {
    await service
      .from('notifications')
      .update({
        push_sent: true,
        push_sent_at: new Date().toISOString(),
      })
      .eq('id', n.id);
    if (deliveredNotifIds.has(n.id)) sent += 1;
    else failed += 1;
  }

  await logCronHeartbeat(CRON_NAME, 'end', {
    sent,
    skipped,
    failed,
    invalidated,
    batch: queued.length,
  });
  return NextResponse.json({ sent, skipped, failed, invalidated, batch: queued.length });
}

export const GET = withCronLog('send-push', run);
export const POST = withCronLog('send-push', run);
