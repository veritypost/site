// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { renderTemplate, sendEmail } from '@/lib/email';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';

// Auth: CRON_SECRET via verifyCronAuth. Fail-closed 403.
// Email delivery worker. Processes unsent notifications in small
// batches, respecting alert_preferences.channel_email per user/type.
// Runs every 10 minutes.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const TYPE_TO_TEMPLATE = {
  breaking_news: 'breaking_news_alert',
  weekly_reading_report: 'weekly_reading_report',
  weekly_family_report: 'weekly_family_report',
  kid_trial_day6: 'kid_trial_day6',
  kid_trial_expired: 'kid_trial_expired',
  data_export_ready: 'data_export_ready',
  expert_reverification_due: 'expert_reverification_due',
};

const BATCH_SIZE = 50;

async function run(request) {
  if (!verifyCronAuth(request).ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!process.env.RESEND_API_KEY) {
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
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!queued?.length) return NextResponse.json({ sent: 0 });

  const userIds = [...new Set(queued.map(n => n.user_id))];
  const [{ data: users }, { data: prefs }, { data: templates }] = await Promise.all([
    service.from('users').select('id, email, username, email_verified').in('id', userIds),
    service.from('alert_preferences').select('user_id, alert_type, channel_email, is_enabled').in('user_id', userIds),
    service.from('email_templates').select('*').in('key', Object.values(TYPE_TO_TEMPLATE)).eq('is_active', true),
  ]);

  const userById = Object.fromEntries((users || []).map(u => [u.id, u]));
  const prefKey = (uid, type) => `${uid}:${type}`;
  const prefsMap = Object.fromEntries((prefs || []).map(p => [prefKey(p.user_id, p.alert_type), p]));
  const templateByKey = Object.fromEntries((templates || []).map(t => [t.key, t]));

  let sent = 0, skipped = 0, failed = 0;

  for (const n of queued) {
    const u = userById[n.user_id];
    const pref = prefsMap[prefKey(n.user_id, n.type)];
    const tpl = templateByKey[TYPE_TO_TEMPLATE[n.type]];

    // Skip conditions: unverified, missing email, user opted out, no template.
    if (!u || !u.email_verified || !u.email || !tpl
        || (pref && (pref.is_enabled === false || pref.channel_email === false))) {
      await service.from('notifications').update({
        email_sent: true, // stop retrying
        email_sent_at: new Date().toISOString(),
        metadata: { ...(n.metadata || {}), email_skip_reason: 'ineligible' },
      }).eq('id', n.id);
      skipped++;
      continue;
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
      await service.from('notifications').update({
        email_sent: true, email_sent_at: new Date().toISOString(),
      }).eq('id', n.id);
      sent++;
    } catch (err) {
      await service.from('notifications').update({
        metadata: { ...(n.metadata || {}), email_error: err.message },
      }).eq('id', n.id);
      failed++;
    }
  }

  return NextResponse.json({ sent, skipped, failed, batch: queued.length });
}

export const GET = withCronLog('send-emails', run);
export const POST = withCronLog('send-emails', run);

function absoluteUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://veritypost.com';
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
