// Error-response helpers for API routes.
//
// DA-119 / F-134 — many routes return raw `error.message` from Postgres
// or from RPC failures straight to the client. That leaks RLS policy
// names, column names, constraint names, and occasionally partial
// payloads. The helpers below map known error classes to stable,
// generic client-facing copy while preserving the raw message in
// server logs for debugging.

// Sentinel: the mapping should pass `err.message` through to the client
// rather than substituting a generic string. P0001 (RAISE EXCEPTION) is
// the only Postgres error code where this is safe — trigger authors
// write the message intentionally for end users (e.g. enforce_max_kids:
// "Kid profile limit reached for this plan", enforce_bookmark_cap:
// "Free accounts are capped at 10 bookmarks. Upgrade to Verity for
// unlimited."). Constraint names, RLS names, column-level details never
// surface through P0001.
const PASSTHROUGH = Symbol('passthrough');

const PG_ERROR_MAP = Object.freeze({
  P0001: { status: 422, client: PASSTHROUGH },
  23505: { status: 409, client: 'Conflict: record already exists' },
  23503: { status: 400, client: 'Invalid reference' },
  23514: { status: 400, client: 'Constraint violation' },
  '22P02': { status: 400, client: 'Malformed input' },
  22023: { status: 400, client: 'Invalid argument' },
  42501: { status: 403, client: 'Forbidden' },
  '42P01': { status: 500, client: 'Internal error' },
  PGRST116: { status: 404, client: 'Not found' },
});

// Map a Supabase / Postgres error object to a safe client response.
// Logs the raw shape with the route name so server-side debugging is
// still possible.
export function safeErrorResponse(NextResponse, err, options = {}) {
  const {
    route = 'unknown',
    fallbackStatus = 500,
    fallbackMessage = 'Internal server error',
  } = options;
  const code = err?.code || err?.details?.code;
  const mapped = code && PG_ERROR_MAP[code];

  const serverPayload = {
    route,
    code: code || null,
    message: err?.message || null,
    hint: err?.hint || null,
    details: err?.details || null,
  };
  console.error('[api.error]', JSON.stringify(serverPayload));

  if (mapped) {
    const rawMessage = typeof err?.message === 'string' ? err.message.trim() : '';
    const clientMessage =
      mapped.client === PASSTHROUGH ? rawMessage || fallbackMessage : mapped.client;
    return NextResponse.json({ error: clientMessage, code }, { status: mapped.status });
  }
  return NextResponse.json({ error: fallbackMessage }, { status: fallbackStatus });
}

// Truncate an IP to a /24 for logs — enough for abuse correlation,
// not enough to pinpoint the individual. GDPR-friendlier than storing
// the full v4 (F-139).
export function truncateIpV4(ip) {
  if (typeof ip !== 'string' || ip.length === 0) return null;
  // Handle IPv4-mapped IPv6 (::ffff:1.2.3.4) by taking the trailing v4.
  const mapped = ip.match(/:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  const candidate = mapped ? mapped[1] : ip;
  const parts = candidate.split('.');
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) {
    // Non-v4 (likely IPv6): preserve only the first /48 equivalent.
    // Conservative fallback — just drop the last ':' segment.
    const colonIdx = ip.lastIndexOf(':');
    return colonIdx > 0 ? `${ip.slice(0, colonIdx)}:0` : null;
  }
  return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
}
