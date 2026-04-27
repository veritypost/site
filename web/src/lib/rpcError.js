// Lightweight RPC error mapper for API routes (T179).
//
// Returns a plain `{ status, body }` shape — caller wraps in
// NextResponse.json(body, { status }). Prefer this over returning the
// raw Supabase RPC error to the client: `error.details` / `error.hint`
// can leak schema (constraint names, RLS policy names, column names).
//
// If you need a one-call "respond now" helper that emits a NextResponse
// directly (with no-store headers, optional fallback copy), use
// `safeErrorResponse` in `./apiErrors.js` instead — both helpers share
// the same intent; this one is for routes that want to compose the
// response themselves.
//
// Migration pattern for raw RPC error returns:
//
//   const { data, error } = await supabase.rpc('something', { ... });
//   if (error) {
//     console.error('[route]', error);            // keep raw log
//     const { status, body } = mapRpcError(error, {
//       fallback: 'Could not complete the request.',
//     });
//     return NextResponse.json(body, { status });
//   }
//
// The PG -> HTTP map below covers the codes most RPCs raise. Anything
// unmapped falls through to 500 with the caller's fallback copy.

const PG_CODE_MAP = Object.freeze({
  // Unique violation -> conflict
  23505: { status: 409 },
  // Check constraint violation -> bad request
  23514: { status: 400 },
  // Insufficient privilege (RLS / GRANT) -> forbidden
  42501: { status: 403 },
  // RAISE EXCEPTION (custom message authored in PL/pgSQL) -> bad request,
  // pass the trigger-author's message through verbatim (sanitized).
  P0001: { status: 400, passthrough: true },
  // invalid_parameter_value -> bad request
  22023: { status: 400 },
});

// Sanitize a passthrough message: collapse whitespace, cap length so a
// runaway RAISE EXCEPTION can't dump megabytes or embed control chars.
function sanitize(msg) {
  if (typeof msg !== 'string') return '';
  return msg.replace(/\s+/g, ' ').trim().slice(0, 240);
}

/**
 * Map a Supabase RPC error to a safe HTTP response shape.
 *
 * @param {{code?: string, message?: string, details?: string, hint?: string} | null | undefined} error
 * @param {{ fallback?: string, fallbackStatus?: number }} [context]
 * @returns {{ status: number, body: { error: string, code?: string } }}
 */
export function mapRpcError(error, context = {}) {
  const fallback = context.fallback || 'Internal server error';
  const fallbackStatus = context.fallbackStatus || 500;

  if (!error) {
    return { status: fallbackStatus, body: { error: fallback } };
  }

  const code = error.code || null;
  const mapped = code ? PG_CODE_MAP[code] : null;

  if (!mapped) {
    return { status: fallbackStatus, body: { error: fallback } };
  }

  // Default: use caller's fallback copy. Never expose `error.details` or
  // `error.hint` — those are written for DBAs and routinely contain
  // constraint names, column names, or partial row payloads.
  let clientMessage = fallback;
  if (mapped.passthrough) {
    const cleaned = sanitize(error.message);
    if (cleaned) clientMessage = cleaned;
  }

  const body = { error: clientMessage };
  if (code) body.code = code;
  return { status: mapped.status, body };
}
