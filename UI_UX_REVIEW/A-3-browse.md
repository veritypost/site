# Unit 3 — Browse (/browse)

**Surface(s):** `web/src/app/browse/page.tsx`, `web/src/app/browse/loading.tsx`
**Status:** fixed
**Date:** 2026-05-02
**Anchor:** Slice 11 shipped 2026-05-02. All 38 findings fixed (2 streams parallel). tsc clean, lint warnings pre-existing only, smoke test PASS. Unit status: fixed → awaiting Wave A verification (Slice 10).

## Queued questions
*(none)*

---

## Findings (merged — main session + 3 reviewers)

### Accessibility / ARIA (crit)
1. [crit] FilterSheet has no `role="dialog"`, `aria-modal`, `aria-labelledby`; focus not trapped; backdrop click div has no keyboard handler (no ESC) — `web/src/app/browse/page.tsx:361-362`
2. [crit] Search `<input>` has no `aria-label` or `aria-labelledby`; `placeholder` is not an accessible label — `web/src/app/browse/page.tsx:597`
3. [crit] Filters icon-button has no `aria-label` and no `aria-expanded` — `web/src/app/browse/page.tsx:600`
4. [crit] FilterSheet close × button is 28×28px (below 44px) and has no `aria-label` — `web/src/app/browse/page.tsx:374`
5. [crit] Search-clear × button has no `aria-label` — `web/src/app/browse/page.tsx:598`
6. [crit] PillToggle `minHeight: 34`, category chips `minHeight: 32`, active-pill × buttons are near-zero — all below 44px touch-target floor — `web/src/app/browse/page.tsx:331,443,616` — violates PRINCIPLE §2.1
7. [crit] `vp-live-pulse` animation (breaking dot) has no `prefers-reduced-motion` guard — runs unconditionally — `web/src/app/browse/page.tsx:575`
8. [crit] `vp-sk` skeleton pulse animation has no `prefers-reduced-motion` guard in either `BrowseSkeleton` or `loading.tsx` — `web/src/app/browse/page.tsx:455`; `web/src/app/browse/loading.tsx:11`
9. [crit] `SectionHeader` uses a `<div>` not `<h2>`/`<h3>` — document outline broken; section nav for screen readers absent — `web/src/app/browse/page.tsx:315`

### Interaction / broken functionality (crit)
10. [crit] `quiz: QuizKey` in `FilterState` / `DEFAULT_FILTERS` / `hasFilters` — but `isMatch` never evaluates `filters.quiz`, no UI section in `FilterSheet`, not counted in `activeFilterCount`, no pill in `ActiveFilters` — fully dead, silently no-op — `web/src/app/browse/page.tsx:48,357,503,512`
11. [crit] `CoverageTimeline.handleMove` typed for `TouchEvent` but only `onMouseMove` registered on container — touch users never see tooltip; the `'touches' in e` branch is dead code — `web/src/app/browse/page.tsx:182`
12. [crit] Date range filter: no validation that `dateFrom ≤ dateTo`; inverted range returns zero results with generic "No stories match" copy — `web/src/app/browse/page.tsx:396-406`
13. [crit] Date range `isMatch` logic compares `latestMs` vs `dateFrom` and `earliestMs` vs `dateTo` — a story that spans the full range but has articles both before and after the window is always included; semantics mislead users — `web/src/app/browse/page.tsx:521`
14. [crit] Retry handler calls `loadStories()` without resetting `stories` state first and without abort-controller guard — rapid taps fire concurrent fetches; last-resolves-wins overwrites — `web/src/app/browse/page.tsx:566`
15. [crit] Empty state when `stories.length === 0`: clear-filters button only renders when `query || activeFilterCount > 0` — user with a genuinely empty feed has no path forward — `web/src/app/browse/page.tsx:641`

### Architecture (owner-decision — Q1)
16. [crit] Entire page is `'use client'` with data fetched in `useEffect` — story list invisible to search engines; Browse is a public discovery surface that benefits from SSR indexability — `web/src/app/browse/page.tsx:1,490-494` — violates PRINCIPLE §8.1 quality bar

### Dark-mode / visual system (polish)
17. [polish] `C.soft` (`#444444`), `C.muted` (`#999999`), `C.breakingBg` (`rgba(239,68,68,0.04)`), `C.developingBg` (`rgba(245,158,11,0.025)`), `C.resolved` (`#9ca3af`) are hardcoded hex with no CSS variable fallback — all break dark mode — `web/src/app/browse/page.tsx:15-24` — violates PRINCIPLE §1.1
18. [polish] Fixed header background hardcoded `rgba(255,255,255,0.97)` — does not adapt to dark mode — `web/src/app/browse/page.tsx:583`
19. [polish] CoverageTimeline tooltip uses hardcoded `color: '#fff'` over `C.text` background — if dark mode inverts `C.text` toward white, contrast fails — `web/src/app/browse/page.tsx:191`
20. [polish] "Show N stories" button and "Clear all" link use hardcoded `color: '#fff'` over `C.text` background — `web/src/app/browse/page.tsx:370,419`

### Interaction / UX (polish)
21. [polish] `* { -webkit-tap-highlight-color: transparent }` suppresses native tap feedback on ALL elements with no replacement visible focus/active indicator — `web/src/app/browse/page.tsx:577`
22. [polish] `::-webkit-scrollbar { display: none }` injected globally via `<style>` tag — hides scrollbars on all containers on the page, not just the category chip rail — `web/src/app/browse/page.tsx:579`
23. [polish] No body scroll lock when `FilterSheet` is open — background scrolls behind overlay — `web/src/app/browse/page.tsx:360`
24. [polish] Active filter pills use raw key values (`"coverage"`, `"duration"`) not human labels ("Most Coverage", "Longest Running") — copy inconsistency between filter sheet and active pill — `web/src/app/browse/page.tsx:435-436`
25. [polish] Search 2-character minimum threshold for filtering is never communicated to user — typing 1 character gives zero visual feedback, appears broken — `web/src/app/browse/page.tsx:527`
26. [polish] Slug-less story card renders identical to clickable cards — no cursor change, no visual affordance that the card is non-interactive — `web/src/app/browse/page.tsx:302-309` — DECISION #022 intent: filter at query layer
27. [polish] `totalMatching` count updates dynamically but is not in an `aria-live` region — screen reader users get no announcement on filter result changes — `web/src/app/browse/page.tsx:586`
28. [polish] `maskImage` gradient fades left 8px of category chip row — partially obscures "All" chip on narrow viewports where no scrolling is possible — `web/src/app/browse/page.tsx:612`
29. [polish] `relTime` returns "Xd ago" for days 1–6, violating DECISION #029 (≥24h should use absolute format "May 2") — `web/src/app/browse/page.tsx:70`

### Loading skeleton (polish)
30. [polish] `BrowseSkeleton` (4 rows, uses `C.border` for bones, shows lifecycle-colored borders) and `loading.tsx` (5 rows, uses `var(--card)`, plain borders) are visually inconsistent — jarring transition as Next.js hands off — `web/src/app/browse/page.tsx:452-468`; `web/src/app/browse/loading.tsx:1-63`
31. [polish] `loading.tsx` uses hardcoded `paddingTop: 188` without `var(--vp-top-bar-h, 0px)` — content clips behind nav bar on devices with a top bar — `web/src/app/browse/loading.tsx:8`
32. [polish] `loading.tsx` uses `paddingBottom: 80` without `env(safe-area-inset-bottom, 0px)` — clips on iPhone with home indicator — `web/src/app/browse/loading.tsx:9`

### Data / logic (polish)
33. [polish] `getDisplayGroup` calls `Date.now()` inside `loadStories` at fetch time — a story fetched just before midnight stays "TODAY" until page reload; groups can drift throughout a session — `web/src/app/browse/page.tsx:78`
34. [polish] `StoryCard` independently re-derives `slug` from `story.articles` (line 248) instead of using `story.slug` already computed in `toStory` — duplicated logic that will drift — `web/src/app/browse/page.tsx:248`
35. [polish] `latestHeadline` sorts by `a.date` (date string `YYYY-MM-DD`) not by full timestamp — articles on the same day have arbitrary order; "Latest" headline may not be the most recently published — `web/src/app/browse/page.tsx:65`
36. [polish] `"Earlier"` section label implies historical depth beyond the 90-day query window; no visible indicator of the cutoff — `web/src/app/browse/page.tsx:128,473`

### Metadata (polish)
37. [polish] Page has no `<title>`, `<meta description>`, or OG tags — client component prevents `export const metadata`; no wrapping layout covers it — `web/src/app/browse/page.tsx:1`

### Filter persistence (owner-decision — Q2)
38. [parity] Filter state (category, query, lifecycle, date, coverage, sort) is pure in-memory React state — navigating to a story and pressing Back resets all filters with no URL param or sessionStorage persistence — `web/src/app/browse/page.tsx:485`

---

## Owner-decision questions (panels — RESOLVED, auto-locked)

### Q1 — SSR architecture (Finding #16) → DECISION #053 (auto-locked 3/3)
Defer RSC refactor post-launch. Ship client-only. Add server-side `layout.tsx` for metadata only. Schedule RSC for first post-launch sprint tied to Google News Publisher Center submission.

### Q2 — URL filter state persistence (Finding #38) → DECISION #054 (auto-locked 3/3)
Implement URL query params via `router.replace` + `useSearchParams()`. All 6 filter dimensions serialized to params. Shareable links + Back-button restore in one pass. `quiz` param omitted until quiz filter is implemented.

---

## Mid-session log
- 2026-05-02 — 3 independent reviewers dispatched in parallel (lens: a11y/dark-mode, state-coverage, edge-cases/interaction). All returned. Merged into unit doc.
- 2026-05-02 — Q1 (SSR) and Q2 (URL state) expert panels run. Both 3/3 convergent. Auto-locked as DECISIONS #053 and #054.

## Notes for Slice 11 (Browse fix)
- Body scroll lock (#23) — same pattern as Slice 5 finding #83. 2nd unit. Sweep candidate count: 2 (need 5 for auto-promotion).
- Dark mode hardcoded hex (#17,#18,#19,#20) — matches `dark-mode-token-sweep` from Unit 2. 2nd unit. Sweep candidate count: 2 (need 5).
- `SectionHeader` `<div>` not heading (#9) — matches `<h2>-section-headings-sweep` from Unit 2. 2nd unit. Sweep candidate count: 2 (need 5).
