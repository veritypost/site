// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { renderTemplate, sendEmail } from '@/lib/email';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';
import { getSiteUrl } from '@/lib/siteUrl';

const CRON_NAME = 'send-emails';

// Auth: CRON_SECRET via verifyCronAuth. Fail-closed 403.
// Email delivery worker. Processes unsent notifications in small
// batches, respecting alert_preferences.channel_email per user/type.
// Runs every 10 minutes.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// T-EMAIL-PRUNE — transactional-only direction (per memory + AUTH DIRECTION).
// Engagement types (breaking_news, comment_reply, expert_answer_posted,
// kid_trial_day6) dropped 2026-04-27. Only the 3 transactional types remain;
// they fire on real account events the user can't reasonably opt out of:
//   data_export_ready          — GDPR-class request fulfilled
//   kid_trial_expired          — paid-feature countdown landed
//   expert_reverification_due  — verified-expert lifecycle deadline
// Auth-flow emails (signup confirm, password reset, magic-link) are sent
// by Supabase Auth, not this cron. Stripe receipts are sent by Stripe.
const TYPE_TO_TEMPLATE = {
  data_export_ready: 'data_export_ready',
  kid_trial_expired: 'kid_trial_expired',
  expert_reverification_due: 'expert_reverification_due',
};

const BATCH_SIZE = 50;

async function run(request) {
  // Cron auth — must verify CRON_SECRET header before any work; see
  // web/src/lib/cronAuth.js for the timing-safe compare history.
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
  if (!process.env.RESEND_API_KEY) {
    await logCronHeartbeat(CRON_NAME, 'error', { error: 'RESEND_API_KEY not configured' });
    return NextResponse.json({ error: 'RESEND_API_KEY not configured', sent: 0 }, { status: 503 });
  }

  const service = createServiceClient();

  const { data: queued, error: loadErr } = await service
    .from('notifications')
    .select('id, user_id, type, title, body, action_url, metadata')
    .eq('email_sent', false)
    .in('type', Object.keys(TYPE_TO_TEMPLATE))
    .order('created_at')
    .limit(BATCH_SIZE);
  if (loadErr) {
    console.error('[cron.send-emails] load failed:', loadErr);
    await logCronHeartbeat(CRON_NAME, 'error', { error: loadErr.message, stage: 'load' });
    return NextResponse.json({ error: 'Load failed' }, { status: 500 });
  }
  if (!queued?.length) {
    await logCronHeartbeat(CRON_NAME, 'end', { sent: 0, batch: 0 });
    return NextResponse.json({ sent: 0 });
  }

  const userIds = [...new Set(queued.map((n) => n.user_id))];
  // L4: allSettled so a single fetch failure doesn't poison the whole batch.
  // If users or templates lookups fail, we bail loudly (no way to render/send
  // without them) but leave email_sent=false so the next cron tick retries.
  // If prefs lookup fails we proceed with an empty prefs map — the default
  // behavior is "send" when there's no explicit opt-out row, matching the
  // RPC side. Every branch logs the underlying error for debugging.
  const [usersRes, prefsRes, templatesRes] = await Promise.allSettled([
    service.from('users').select('id, email, username, email_verified').in('id', userIds),
    service
      .from('alert_preferences')
      .select('user_id, alert_type, channel_email, is_enabled, quiet_hours_start, quiet_hours_end')
      .in('user_id', userIds),
    service
      .from('email_templates')
      .select('*')
      .in('key', Object.values(TYPE_TO_TEMPLATE))
      .eq('is_active', true),
  ]);

  const usersResult = usersRes.status === 'fulfilled' ? usersRes.value : null;
  const prefsResult = prefsRes.status === 'fulfilled' ? prefsRes.value : null;
  const templatesResult = templatesRes.status === 'fulfilled' ? templatesRes.value : null;

  if (!usersResult || usersResult.error || !templatesResult || templatesResult.error) {
    console.error('[cron.send-emails] required fetch failed:', {
      users: usersRes.status === 'rejected' ? usersRes.reason : usersResult?.error,
      templates: templatesRes.status === 'rejected' ? templatesRes.reason : templatesResult?.error,
    });
    await logCronHeartbeat(CRON_NAME, 'error', {
      stage: 'setup_fetch',
      error: 'users or templates fetch failed — batch re-queued',
    });
    return NextResponse.json({ error: 'Setup fetch failed — retrying next tick' }, { status: 500 });
  }

  if (prefsRes.status === 'rejected' || prefsResult?.error) {
    console.warn('[cron.send-emails] prefs fetch failed; proceeding with empty map', {
      error: prefsRes.status === 'rejected' ? prefsRes.reason : prefsResult?.error,
    });
  }

  const users = usersResult.data || [];
  const prefs = prefsResult?.data || [];
  const templates = templatesResult.data || [];

  const userById = Object.fromEntries((users || []).map((u) => [u.id, u]));
  const prefKey = (uid, type) => `${uid}:${type}`;
  const prefsMap = Object.fromEntries(
    (prefs || []).map((p) => [prefKey(p.user_id, p.alert_type), p])
  );
  const templateByKey = Object.fromEntries((templates || []).map((t) => [t.key, t]));

  let sent = 0,
    skipped = 0,
    failed = 0;

  for (const n of queued) {
    const u = userById[n.user_id];
    const pref = prefsMap[prefKey(n.user_id, n.type)];
    const tpl = templateByKey[TYPE_TO_TEMPLATE[n.type]];

    // Skip conditions: unverified, missing email, user opted out, no template.
    if (
      !u ||
      !u.email_verified ||
      !u.email ||
      !tpl ||
      (pref && (pref.is_enabled === false || pref.channel_email === false))
    ) {
      await service
        .from('notifications')
        .update({
          email_sent: true, // stop retrying
          email_sent_at: new Date().toISOString(),
          metadata: { ...(n.metadata || {}), email_skip_reason: 'ineligible' },
        })
        .eq('id', n.id);
      skipped++;
      continue;
    }

    // Ext-LL3 — quiet hours. The notifications table writer already
    // suppresses push during quiet hours; the email cron didn't, so
    // a "send_at midnight" preference still got an email at midnight.
    // Defer instead of skip: leave email_sent=false so the next tick
    // outside quiet hours picks it up. UTC clock here matches what
    // alert_preferences stores; per-user TZ is a future enhancement.
    if (pref && pref.quiet_hours_start && pref.quiet_hours_end) {
      const now = new Date();
      const nowH = now.getUTCHours() * 60 + now.getUTCMinutes();
      const toMin = (t) => {
        const [hh, mm] = String(t).split(':').map(Number);
        return (hh || 0) * 60 + (mm || 0);
      };
      const startMin = toMin(pref.quiet_hours_start);
      const endMin = toMin(pref.quiet_hours_end);
      const inQuiet =
        startMin < endMin ? nowH >= startMin && nowH < endMin : nowH >= startMin || nowH < endMin; // wraps midnight
      if (inQuiet) {
        skipped++;
        continue;
      }
    }

    const variables = {
      username: u.username || 'there',
      title: n.title,
      body: n.body,
      action_url: n.action_url ? absoluteUrl(n.action_url) : '',
      ...(n.metadata || {}),
    };
    const rendered = renderTemplate(tpl, variables);

    try {
      await sendEmail({
        to: u.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        fromName: rendered.fromName,
        fromEmail: rendered.fromEmail,
        replyTo: rendered.replyTo,
      });
      await service
        .from('notifications')
        .update({
          email_sent: true,
          email_sent_at: new Date().toISOString(),
        })
        .eq('id', n.id);
      sent++;
    } catch (err) {
      await service
        .from('notifications')
        .update({
          metadata: { ...(n.metadata || {}), email_error: err.message },
        })
        .eq('id', n.id);
      failed++;
    }
  }

  await logCronHeartbeat(CRON_NAME, 'end', { sent, skipped, failed, batch: queued.length });
  return NextResponse.json({ sent, skipped, failed, batch: queued.length });
}

export const GET = withCronLog('send-emails', run);
export const POST = withCronLog('send-emails', run);

function absoluteUrl(path) {
  if (!path) return '';
  // notifications.action_url is stored data. Raw string lands in an
  // email template's <a href=...>, where HTML-escape doesn't neutralize
  // dangerous URI schemes (javascript:, data:, vbscript:). Allow https,
  // http, and mailto; reject anything else that looks like a scheme and
  // return empty so the template renders a harmless href=''.
  if (/^(https?|mailto):/i.test(path)) return path;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return '';
  // getSiteUrl throws in prod when NEXT_PUBLIC_SITE_URL is unset — fail
  // the cron loud rather than ship preview-branch URLs into outgoing
  // email bodies (which would leak prod when run from a preview env).
  return `${getSiteUrl()}/${path.replace(/^\/+/, '')}`;
}
