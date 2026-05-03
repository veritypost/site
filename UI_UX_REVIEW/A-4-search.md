# Unit 4 — Search (/search)

**Surface(s):** `web/src/app/search/page.tsx`, `web/src/app/api/search/route.js`
**Status:** fixed
**Date:** 2026-05-02
**Anchor:** Slice 12 shipped 2026-05-02. 29 findings fixed (F20 REFUTED — lte() already correct; F28/F32 deferred). Suspense boundary added for useSearchParams. tsc clean. Smoke PASS.

## Findings

### Main-pass findings (1–16)

1. [crit] `href="#"` fallback on result card when `stories?.slug` is null — `page.tsx:254` — violates DECISION #022 (filter at query layer, no dead links)
2. [crit] No `layout.tsx` / `metadata` export — no OG tags, no canonical, no `noindex` on search results — `web/src/app/search/` directory — DECISION #053 (Browse got layout.tsx)
3. [crit] Advanced filter tease links to `/profile/settings#billing` instead of `/pricing` — `page.tsx:236-237` — violates DECISION #031 pattern + anchor #billing doesn't exist (silent no-op)
4. [crit] No URL state persistence — `q` and filters evaporate on back-nav — `page.tsx:47-51` — DECISION #054 URL-param pattern required for search `q` at minimum
5. [crit] `formatDate` used for publish-time on result cards (always absolute) — `page.tsx:271` — DECISION #029 requires hybrid: <24h → relative, ≥24h → absolute
6. [crit] Search input `outline: 'none'` with no custom focus ring — kills keyboard focus visibility WCAG 2.4.11 — `page.tsx:150`; `filterStyle` reused on all filter inputs kills focus ring on all controls — `page.tsx:119`
7. [polish] `canView` initialized `true` then flips async — flash of full search UI for legitimately restricted users before gate fires — `page.tsx:42`
8. [polish] `ignored_filters` from API response ignored client-side — server tracks silently-dropped filters but UI never shows user which filters were ignored — `page.tsx:106`
9. [polish] All inline colors hardcoded hex (#111, #444, #666, #999, #ccc, #e5e5e5, #f7f7f7) — `page.tsx` throughout — PRINCIPLE §1.1 (→ `dark-mode-token-sweep` candidate)
10. [polish] Source filter input missing `aria-label` — `page.tsx:215`; category `<select>` also unlabelled — `page.tsx:183`
11. [polish] No `aria-live` region for results count / loading state — screen readers get no announcement when results load or search completes — `page.tsx:246-248`
12. [polish] Advanced filter group has no `<fieldset>`/`<legend>` (or equivalent `role="group"` + label) — `page.tsx:173-245`
13. [polish] Result count text `fontSize: 11` — too small, fails contrast (2.85:1 on #999/#fff) — `page.tsx:246`
14. [polish] Advanced filter tease copy ("available on paid plans") wrong for anon users — anon should see "Sign in for filters" per DECISION #032 + #043; free signed-in → "Upgrade for filters" — `page.tsx:235-238`
15. [polish] No loading skeleton during perm hydrate — blank area shows below search bar until effect resolves — PRINCIPLE §3.1 — `page.tsx:57-86`
16. [polish] `canView=false` copy ("Search is disabled on your account") conflates explicit restriction with normal anon state — DECISION #032 branch logic — `page.tsx:123-131`

### Net-new from independent reviewer pass (17–32)

17. [crit] No `<form>` wrapper — mobile keyboard "Go" key and Enter only fire from main input; date/source filter inputs not connected — `page.tsx:138`; search button has no `type` attribute — `page.tsx:154`
18. [crit] Anon users may see "Search unavailable" if `search.articles.free` not seeded in anon permission set — all three `hasPermission` calls at lines 67–69 return false, `canView` flips false — `page.tsx:67`
19. [crit] No `AbortController` — concurrent searches race; last response wins, can display stale results for a prior query — `page.tsx:100`
20. [crit] `to` date filter silently excludes same-day articles — `published_at` is timestamptz but bare `YYYY-MM-DD` string in `.lte()` compares against midnight UTC — `route.js:96`
21. [crit] `sanitizeIlikeTerm` strips double-quotes before `websearch_to_tsquery` on advanced path — breaks phrase search (`"climate change"`) for paid users — `route.js:22-26`
22. [crit] Source sub-query `.in(id_array)` unbounded at 500 IDs — can exceed PostgREST URL length / `max_rows`, silently truncating results with no user error — `route.js:108`
23. [crit] `runSearch` exits early on `!q.trim()` but never clears `results` — user clears input and presses Enter; previous results remain visible with no query context — `page.tsx:89`
24. [polish] Stale results array persists when a follow-up search throws — error banner + previous results simultaneously visible — `page.tsx:91`; result count also never clears between queries — `page.tsx:247`
25. [polish] Disabled Search button missing `aria-disabled` — AT not informed of disabled state — `page.tsx:154`
26. [polish] `aria-label="Browse all categories"` doesn't match visible text "Browse categories" on the no-results CTA — speech recognition users say "Browse categories" but control is labelled "Browse all categories" — `page.tsx:287`
27. [polish] Filter tease block renders immediately on page load before any query is typed — upsell noise in zero-query state — `page.tsx:223`
28. [polish] `subcategory_id` filter supported server-side (with `search.advanced.subcategory` gate) but no client UI — dead API path, parity gap — `route.js:87`
29. [polish] Enter key not wired on date/source filter inputs — inconsistent keyboard UX within the filter row — `page.tsx:197-220`
30. [polish] Pre-search state (no query yet) shows blank content area — no instructional copy, no suggested topics, no zero-query empty state — `page.tsx:277`
31. [polish] From/to date inputs accept inverted ranges (to < from) with no client-side validation — user gets 0 results with no explanation — `page.tsx:197`
32. [parity] `?kids=1` scope flag supported by API but web search page never sets it — kid-profile accounts reaching `/search` on web receive adult articles — `route.js:42`

## Owner-decision questions

None — all findings map to locked decisions or are technical bugs with clear fixes.

## Fixes

Slice 12 — shipped 2026-05-02.

**Stream A (layout.tsx + route.js):**
- F2: Created `web/src/app/search/layout.tsx` with metadata (noindex, OG)
- F21: Split sanitizer into `sanitizeIlikeTerm` (strips `"`) + `sanitizeWebsearchTerm` (preserves `"` for phrase search)
- F22: Source sub-query capped at 200 IDs; `source_partial` added to `ignored_filters`; `.not('stories.slug','is',null)` filter added to main select

**Stream B (page.tsx):**
- F1: Client-side slug filter belt on setResults
- F3: Filter tease link → `/pricing` via `<Link>`
- F4: URL state persistence via `useSearchParams` + `router.replace`; Suspense boundary wrapping the component
- F5: Hybrid timestamp (<24h relative, ≥24h absolute)
- F6: Removed `outline: 'none'` from filterStyle + search input
- F7: `canView` init → `null` (eliminates flash)
- F8: `ignored_filters` surfaced inline; `source_partial` message
- F10: `aria-label` on category select + source input
- F11: `aria-live` on result count; visually-hidden status announcer
- F12: `<fieldset>`/`<legend>` wrapping advanced filter group
- F13: Result count `fontSize` → 12
- F14: Filter tease branches anon (sign-in copy) vs authed (upgrade copy)
- F15: Skeleton when `canView === null`
- F16: canView=false copy branches anon vs restricted
- F17: `<form role="search">` wrapper; `type="submit"` on button
- F18: Anon bypass in canView gate
- F19: AbortController prevents concurrent search races
- F23: Clear stale results on empty `q`
- F24: Clear stale results at start of each search
- F25: `aria-disabled` on search button
- F26: aria-label "Browse categories" matches visible text
- F27: Filter tease gated by `hasInteracted`
- F29: Enter key wired on date/source filter inputs
- F30: Pre-search blank state copy
- F31: from≤to validation in runSearch + `min` attr on to-date input

**F20 REFUTED** — `.lte()` already includes same-day articles (verifier confirmed).
**F28, F32** — deferred per slice doc.

## Mid-session log

- 2026-05-02 — main-session own review pass complete (findings 1–16)
- 2026-05-02 — 3 independent reviewers dispatched (a11y + state-coverage + edge-cases lenses)
- 2026-05-02 — reviewer results merged; findings 17–32 added net-new; status → findings

## Deferred / sweep

- Finding 9 (hardcoded colors) → `dark-mode-token-sweep` candidate (Units 2, 3, 4 — count: 3 units. Promote at 5.)
