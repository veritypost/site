// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { requirePermission } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

// F-020 — the pre-fix route accepted arbitrary `to / subject / html`
// from any admin, sent it via Resend with the platform's noreply
// sender, and wrote nothing to the audit log. A compromised admin
// session could dispatch veritypost.com-branded phishing to any
// address list at full authenticity. Layers applied here:
//
//   1. Admin-only (was already in place).
//   2. Per-admin rate limit (5 sends / hour).
//   3. Subject length cap (200) + HTML length cap (50 KB) to prevent
//      storage/bandwidth abuse inside the sendgrid/resend path.
//   4. HTML-content allowlist: reject any `<script>`, event-handler
//      attribute, or javascript:/data: URI. A future template-id
//      regime (tracked as follow-up) will supersede this — the
//      current ban-list is the minimum defensible filter that still
//      lets legitimate announcement HTML through.
//   5. Per-send audit_log row with actor_id, recipients count, subject
//      excerpt, IP — so post-incident review can reconstruct what was
//      sent, to whom, and when.
//
// Recipients are still caller-supplied. Domain allowlisting was
// considered and deferred: Verity Post legitimately emails
// third-party addresses (press, support, expert applicants), so a
// strict domain allowlist would block normal work. The audit trail
// plus rate limit are the substitute control.

const MAX_SUBJECT = 200;
const MAX_HTML_BYTES = 50 * 1024;
const MAX_RECIPIENTS = 100;

// Narrow ban-list — each expression is a pattern known to carry
// executable payloads when rendered in an email client that supports
// it. Matches are case-insensitive. The intent is to block scripted
// phishing, not to sanitize arbitrary HTML.
const HTML_DANGER_PATTERNS = [
  /<\s*script\b/i,
  /<\s*iframe\b/i,
  /<\s*object\b/i,
  /<\s*embed\b/i,
  /\son[a-z]+\s*=/i,              // onclick=, onerror=, onload=, ...
  /javascript\s*:/i,
  /data\s*:\s*text\/html/i,
];

function htmlLooksDangerous(html) {
  return HTML_DANGER_PATTERNS.some((rx) => rx.test(html));
}

export async function POST(request) {
  let user;
  try { user = await requirePermission('admin.email.send_manual'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const ip = await getClientIp();
  const rl = await checkRateLimit(service, {
    key: `admin_send_email:user:${user.id}`,
    policyKey: 'admin_send_email',
    max: 5,
    windowSec: 3600,
  });
  if (rl.limited) {
    return NextResponse.json({ error: 'Too many sends, try again later' }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const { to, subject, html } = body || {};

  if (!to || !subject || !html) {
    return NextResponse.json({ error: 'to, subject, and html are required' }, { status: 400 });
  }
  if (typeof subject !== 'string' || subject.length === 0 || subject.length > MAX_SUBJECT) {
    return NextResponse.json({ error: `subject must be 1..${MAX_SUBJECT} chars` }, { status: 400 });
  }
  if (typeof html !== 'string' || html.length === 0) {
    return NextResponse.json({ error: 'html must be a non-empty string' }, { status: 400 });
  }
  const htmlBytes = new TextEncoder().encode(html).length;
  if (htmlBytes > MAX_HTML_BYTES) {
    return NextResponse.json({ error: `html exceeds ${MAX_HTML_BYTES} bytes` }, { status: 413 });
  }
  if (htmlLooksDangerous(html)) {
    return NextResponse.json(
      { error: 'html contains disallowed content (<script>, event handlers, javascript: URIs)' },
      { status: 400 }
    );
  }

  const recipients = Array.isArray(to) ? to : [to];
  if (recipients.length === 0) {
    return NextResponse.json({ error: 'to must contain at least one address' }, { status: 400 });
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return NextResponse.json({ error: `Max ${MAX_RECIPIENTS} recipients per request` }, { status: 400 });
  }
  const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (recipients.some((r) => typeof r !== 'string' || !EMAIL_RX.test(r))) {
    return NextResponse.json({ error: 'recipients must be valid email addresses' }, { status: 400 });
  }

  try {
    const result = await sendEmail({ to: recipients, subject, html });
    if (!result?.ok) {
      return NextResponse.json({ error: result?.reason || 'Failed to send email' }, { status: 500 });
    }

    // F-020 audit record. Stores recipient count + first 200 chars of
    // subject. Full html body is not persisted (storage cost + PII);
    // the provider-side record (Resend) has the full payload.
    try {
      await service.from('audit_log').insert({
        actor_id: user.id,
        action: 'admin:send_email',
        target_type: 'email',
        target_id: null,
        metadata: {
          recipient_count: recipients.length,
          subject: subject.slice(0, MAX_SUBJECT),
          html_bytes: htmlBytes,
          provider_id: result.id || null,
          ip,
        },
      });
    } catch (err) {
      console.error('[admin/send-email] audit write failed:', err?.message || err);
    }

    return NextResponse.json({ success: true, id: result.id });
  } catch (err) {
    console.error('[admin/send-email]', err?.message || err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
