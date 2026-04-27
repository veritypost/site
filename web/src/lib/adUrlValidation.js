// Shared URL allowlist for ad units. Used at every server-side write
// path (POST, PATCH) so the regex stays in one place instead of being
// reimplemented per route. Ad.jsx also filters at render-time, but that
// filter is the last line of defense — preventing bad data at insert /
// update time keeps the DB clean and stops a render-filter regression
// from becoming an XSS vector.
//
// Returns true for null/empty (the column is nullable) and for any
// well-formed http/https URL. Returns false for everything else
// (`javascript:`, `data:`, `file:`, malformed strings, non-strings).

export function isSafeAdUrl(u) {
  if (!u || typeof u !== 'string') return true;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
