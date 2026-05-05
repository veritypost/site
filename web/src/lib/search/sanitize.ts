// Strip PostgREST filter-delimiter chars + wildcards so user input
// can't break out of the enclosing .or()/.ilike() pattern.
//
// Two flavors:
//   - sanitizeIlikeTerm: strips quotes too (used for ILIKE patterns
//     where quote characters have no useful meaning).
//   - sanitizeWebsearchTerm: preserves double-quotes so phrase
//     matching still works under websearch_to_tsquery, but strips
//     the other PostgREST-breaking chars.
//
// Behavior must remain byte-identical to the inline sanitizers that
// previously lived in `web/src/app/api/search/route.js` — the iOS
// FindView and the web /search page both rely on the existing
// matching semantics.
export function sanitizeIlikeTerm(s: unknown): string {
  return String(s || '').replace(/[,.%*()"'\\]/g, ' ').trim();
}

export function sanitizeWebsearchTerm(s: unknown): string {
  // Preserve double-quotes for phrase matching; strip other PostgREST-breaking chars
  return String(s || '').replace(/[,.%*()'\\]/g, ' ').trim();
}
