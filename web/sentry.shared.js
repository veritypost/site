// T-033 — shared PII scrubber for every Sentry.init beforeSend hook.
//
// Raw Sentry payloads from Next.js include request bodies, headers,
// and user context that can carry emails, Authorization bearer tokens,
// Supabase session cookies, and Stripe payloads. None of that needs
// to reach Sentry for error-level observability.
//
// This function mutates the event in place and returns it. If you need
// to drop an event entirely, return null from beforeSend.

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const REDACT_BODY_KEYS = [
  'password',
  'current_password',
  'new_password',
  'old_password',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'api_key',
  'secret',
  'authorization',
  'stripe-signature',
  'pin',
  'pin_hash',
];
const REDACT_HEADER_RE = /^(authorization|cookie|x-.*-(token|secret))$/i;

function redactObject(obj, keys) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const k of Object.keys(out)) {
    if (keys.some((redact) => redact.toLowerCase() === k.toLowerCase())) {
      out[k] = '[redacted]';
    }
  }
  return out;
}

function stripEmails(str) {
  if (typeof str !== 'string') return str;
  return str.replace(EMAIL_RE, '[redacted-email]');
}

function scrubPII(event) {
  if (!event) return event;

  if (event.request) {
    if (event.request.data && typeof event.request.data === 'object') {
      event.request.data = redactObject(event.request.data, REDACT_BODY_KEYS);
    }
    if (event.request.headers && typeof event.request.headers === 'object') {
      const headers = { ...event.request.headers };
      for (const k of Object.keys(headers)) {
        if (REDACT_HEADER_RE.test(k)) headers[k] = '[redacted]';
      }
      event.request.headers = headers;
    }
    if (typeof event.request.query_string === 'string') {
      event.request.query_string = stripEmails(event.request.query_string);
    }
  }

  if (event.user) {
    delete event.user.ip_address;
    delete event.user.email;
  }

  if (typeof event.message === 'string') {
    event.message = stripEmails(event.message);
  }
  if (event.exception && Array.isArray(event.exception.values)) {
    for (const v of event.exception.values) {
      if (typeof v.value === 'string') v.value = stripEmails(v.value);
    }
  }
  if (Array.isArray(event.breadcrumbs)) {
    for (const b of event.breadcrumbs) {
      if (typeof b.message === 'string') b.message = stripEmails(b.message);
      if (b.data && typeof b.data === 'object') {
        b.data = redactObject(b.data, REDACT_BODY_KEYS);
      }
    }
  }

  return event;
}

module.exports = { scrubPII };
