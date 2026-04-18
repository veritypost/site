// Resend wrapper + template renderer. Fetch-only; no npm dep.

const RESEND_API = 'https://api.resend.com/emails';

export function renderTemplate(tpl, variables = {}) {
  const replace = (s) => s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) =>
    variables[k] !== undefined && variables[k] !== null ? String(variables[k]) : ''
  );
  return {
    subject: replace(tpl.subject || ''),
    html: replace(tpl.body_html || ''),
    text: replace(tpl.body_text || ''),
    fromName: tpl.from_name || 'Verity Post',
    fromEmail: tpl.from_email || process.env.EMAIL_FROM || 'no-reply@veritypost.com',
    replyTo: tpl.reply_to || null,
  };
}

export async function sendEmail({ to, subject, html, text, fromName, fromEmail, replyTo }) {
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
