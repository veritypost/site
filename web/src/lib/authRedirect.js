// Shared `next`-param resolver used by the login page and OAuth callback.
//
// DA-021 / DA-100 / F-029 — the pre-fix client-side resolver only
// blocked `//` prefix; the server callback validated nothing. The
// Review correctly noted that a bare `next=//evil.com` produces
// `https://veritypost.com//evil.com`, which browsers parse as a
// same-origin path `//evil.com`, not as `evil.com`. So the direct
// open-redirect vector is benign. Three adjacent variants are not:
//
//   1. `next=/\\evil.com` — backslash is URL-separator-equivalent on
//      some clients; browsers may interpret.
//   2. `next=/%5Cevil.com` — URL-encoded backslash, same concern.
//   3. `next=/\u2044evil.com` or similar Unicode fraction slash —
//      homoglyph of `/`, potentially interpreted by clients.
//
// We require `next` to match a strict whitelist regex: start with `/`,
// be followed by letters/digits/`-`/`_`/`/`, optionally followed by
// `?...` query, optionally followed by `#...` fragment. Reject
// `//`, backslash, control characters, and every Unicode escape.
// Anything non-ASCII rejected outright — our internal routes are
// ASCII-only by design.

const NEXT_RX = /^\/[A-Za-z0-9\-_/.]*(?:\?[A-Za-z0-9\-_/.=&%]*)?(?:#[A-Za-z0-9\-_/.=&%]*)?$/;

/**
 * @param {unknown} raw
 * @param {string | null} [fallback]
 * @returns {string | null}
 */
export function resolveNext(raw, fallback = null) {
  if (typeof raw !== 'string') return fallback;
  if (raw.length === 0 || raw.length > 500) return fallback;
  // Reject explicit protocol-relative prefix and backslash tricks.
  if (raw.startsWith('//') || raw.startsWith('\\') || raw.startsWith('/\\')) return fallback;
  // Reject any non-ASCII char (covers Unicode slash homoglyphs).
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) return fallback;
  }
  if (!NEXT_RX.test(raw)) return fallback;
  return raw;
}

// Server-side variant that composes the final absolute URL for a
// redirect after validation. Any rejection falls back to `/` by
// default; callers may override via `fallback`.
export function resolveNextForRedirect(siteUrl, raw, fallback = '/') {
  const safe = resolveNext(raw, fallback);
  // If the fallback was itself invalid, hard-stop to '/'.
  const path =
    typeof safe === 'string' && safe.startsWith('/') && !safe.startsWith('//') ? safe : '/';
  return `${siteUrl}${path}`;
}
