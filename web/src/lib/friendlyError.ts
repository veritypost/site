/**
 * friendlyError — maps known internal API error codes to human-readable copy.
 * Never exposes raw .message from Error objects or server implementation details.
 *
 * Usage:
 *   friendlyError(err)                    // unknown catch value → friendly string
 *   friendlyError(err, 'Custom fallback') // override the default fallback
 *   friendlyHttpError(res)                // map HTTP Response status → friendly string
 */

const CODE_MAP: Record<string, string> = {
  cannot_tag_own_comment: "You can't tag your own comment.",
  invalid_tag_kind: "That tag type isn't recognized.",
  edit_window_expired: 'The edit window has closed for this comment.',
  comment_too_long: 'Your comment is too long.',
  'payload too large': 'Your comment is too long.',
  bookmark_cap_reached: "You've reached your bookmark limit.",
  already_following: "You're already following this person.",
  user_blocked_recipient: "You can't message this user.",
};

const DEFAULT_FALLBACK = 'Something went wrong. Try again.';

/**
 * Maps an unknown caught value (API { error: string } payload, string literal,
 * or anything else) to a safe user-facing string.
 *
 * Intentionally does NOT expose err.message — Supabase/Postgres messages
 * contain column names, constraint names, and RLS policy details.
 */
export function friendlyError(err: unknown, fallback = DEFAULT_FALLBACK): string {
  if (typeof err === 'string') {
    const trimmed = err.trim();
    if (CODE_MAP[trimmed]) return CODE_MAP[trimmed];
    for (const [code, msg] of Object.entries(CODE_MAP)) {
      if (trimmed.toLowerCase().startsWith(code.toLowerCase())) return msg;
    }
    return fallback;
  }
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const code = (err as { error: unknown }).error;
    if (typeof code === 'string') {
      const trimmed = code.trim();
      if (CODE_MAP[trimmed]) return CODE_MAP[trimmed];
      for (const [k, msg] of Object.entries(CODE_MAP)) {
        if (trimmed.toLowerCase().startsWith(k.toLowerCase())) return msg;
      }
    }
  }
  return fallback;
}

/**
 * Maps an HTTP Response status to a safe user-facing string.
 * Use when the call site only has the raw Response (no parsed body).
 */
export function friendlyHttpError(res: Response, fallback = DEFAULT_FALLBACK): string {
  if (res.status === 429) return 'Too many requests. Try again in a moment.';
  return fallback;
}
