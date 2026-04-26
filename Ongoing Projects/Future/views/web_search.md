# Web — Search

**File:** `web/src/app/search/page.tsx`
**Owner:** Wroblewski (search UX), Abramov (performance).
**Depends on:** `08_DESIGN_TOKENS.md`, `11_PAYWALL_REWRITE.md`, `10_SUMMARY_FORMAT.md`.
**DB touchpoints:** `articles`, `search_history`.

---

## Current state

Advanced search. Auth + verified email required. Permission gate: `home.search`. Modes: headline, keyword, slug, quiz. Date presets, category/source filters (gated), custom date range.

## What changes

Per `09_HOME_FEED_REBUILD.md`: search moves off home to a dedicated `/search` route. Keyboard shortcut (`/`) focuses search when on any page.

### Simplify the search surface

Current: 4 modes feels like admin tool. For readers, collapse to:

- Main search bar with natural-language query.
- Filter drawer (date range, category) for power users.
- Advanced mode (Verity Pro): slug-search, quiz-search, source filter.

### Result cards use `<SummaryBlock>`

Each result shows the three-beat summary (fact + context visible; stakes revealed on tap). Per `10_SUMMARY_FORMAT.md`.

### Paywall on advanced search

Non-Pro users see advanced-mode inputs greyed with invitation-voice paywall:

```
Advanced search
Search across article slugs, quizzes, and sources.
Included with Verity Pro.

[ Trial timeline ]

[ See what's in Verity Pro ]
[ Not now ]
```

Uses `LockModal` surface="advancedSearch".

### Empty state

"No results for [query]. Try a different term, or browse the [recent articles] feed."

### Performance

- Search results paginated (20 per page).
- Debounce query input 200ms.
- Service-role query (search permission matrix already checked on entry).

## Files

- `web/src/app/search/page.tsx` — simplification + paywall surface.
- `web/src/components/SearchBar.tsx` — shared component (used here and maybe header elsewhere).

## Acceptance criteria

- [ ] Main search is simplified to one input + filter drawer.
- [ ] Advanced mode behind Pro paywall.
- [ ] Results use `<SummaryBlock>`.
- [ ] `/` keyboard focuses search from any page (verify single non-admin keyboard binding is acceptable — this is a standard browser convention, not a custom shortcut).
- [ ] Empty state copy warm.
- [ ] Accessibility: search role, ARIA labels.

## Dependencies

Ship after `10_SUMMARY_FORMAT.md` (SummaryBlock component must exist), `11_PAYWALL_REWRITE.md`.
