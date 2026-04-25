// Resend wrapper + template renderer. Fetch-only; no npm dep.

const RESEND_API = 'https://api.resend.com/emails';

// HTML-escape user-controllable substitutions so a notification title/body
// or metadata field containing `<script>` / event handlers / attribute-break
// payloads lands in the rendered email as inert text rather than live markup.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// `opts.html` controls whether variable substitutions are HTML-escaped.
// Defaults to true (safer) so any forgotten call-site still gets escaping
// in body_html. Callers that only consume `.text` should pass html:false
// so users see raw characters rather than HTML entities.
// Subject is always rendered unescaped regardless of flag — email clients
// treat it as a header, not HTML.
export function renderTemplate(tpl, variables = {}, opts = {}) {
  const htmlMode = opts.html !== false; // default true
  const replace = (s, html) =>
    s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
      const v = variables[k];
      if (v === undefined || v === null) return '';
      const str = String(v);
      return html ? escapeHtml(str) : str;
    });
  return {
    subject: replace(tpl.subject || '', false),
    html: replace(tpl.body_html || '', htmlMode),
    text: replace(tpl.body_text || '', false), // plain-text body never HTML-escaped
    fromName: tpl.from_name || 'Verity Post',
    fromEmail: tpl.from_email || process.env.EMAIL_FROM || 'no-reply@veritypost.com',
    replyTo: tpl.reply_to || null,
  };
}

// Ext-LL2 — RFC 8058 one-click unsubscribe headers. Required for Gmail
// bulk-sender compliance + meaningfully boosts deliverability with
// every major mailbox provider. Caller passes a per-recipient unsub URL
// where possible; otherwise we fall back to the email-prefs section of
// settings (covers every legitimate user without per-template plumbing).
function buildUnsubscribeHeaders(unsubUrl) {
  if (!unsubUrl) return null;
  return {
    'List-Unsubscribe': `<${unsubUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  fromName,
  fromEmail,
  replyTo,
  unsubscribeUrl,
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY missing');

  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
  const body = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html: html || undefined,
    text: text || undefined,
  };
  if (replyTo) body.reply_to = replyTo;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://veritypost.com';
  const fallbackUnsub = `${siteUrl}/profile/settings#emails`;
  const unsubHeaders = buildUnsubscribeHeaders(unsubscribeUrl || fallbackUnsub);
  if (unsubHeaders) body.headers = unsubHeaders;

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json?.message || `Resend ${res.status}`);
    err.resend = json;
    throw err;
  }
  return json; // { id: '...' }
}
