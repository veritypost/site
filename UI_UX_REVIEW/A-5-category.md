# Unit 5 — Category (`/category/[id]`)

**Surface(s):** `web/src/app/category/[id]/page.js`, `web/src/app/category/[id]/layout.js`
**Status:** fixed (Slice 13 shipped 2026-05-02)
**Date:** 2026-05-02
**Anchor:** Slice 13 shipped 2026-05-02. 36 findings fixed (F33 refuted — ad placement was already correct). Adversary: 5 gaps found; 2 blocking fixed (deleted_at filter on all category queries, is_kids_safe column used as authoritative kids guard). Non-blocking gaps 3+4 noted below. tsc clean. Smoke PASS. Unit status: fixed → awaiting Wave A verification (Slice 10).

---

## Findings

### Main-pass findings

1. [crit] `<button>` nested inside `<a>` — Save/bookmark button inside article card `<a>` — invalid HTML per spec; many AT refuse to focus the inner button; keyboard Enter on link fires navigation not bookmark — `page.js:522`

2. [crit] `href="#"` on null-slug article cards — `page.js:458` — clicks scroll to page top with no feedback; violates DECISION #022 (filter at query layer). Fix: add `.not('stories.slug', 'is', null)` to the articles select, and client-side guard `setStories(articles.filter(a => a.stories?.slug))`.

3. [crit] Stale category header + article list flash on `[id]` change — `useEffect` resets `loading`/`activeSubcat`/`subcategories` but never calls `setCategory(null)` or `setStories([])` before the async fetch completes; navigating `/category/A` → `/category/B` briefly shows A's content — `page.js:29-33`

4. [crit] Anon bookmark click → raw "Unauthenticated" error toast, no registration wall — `page.js:110` — DECISION #043 (registration wall on anon bookmark click). Fix: check auth before calling the API; if anon, fire the registration wall instead.

5. [crit] Fetch errors silently swallowed (stories / subcategories / bookmarks) — `page.js:63-88` — `error` return values from all three Supabase queries are discarded; failures silently show empty state or absent bookmark states with no user-facing message or retry path.

6. [crit] No try/catch in `fetchData` — any thrown exception (including the uncaught `supabase.auth.getUser()` destructure below) leaves `setLoading(false)` unreached; component stays in infinite skeleton — `page.js:30`

7. [crit] `supabase.auth.getUser()` not error-guarded — `page.js:79` — destructuring `{ data: { user: authUser } }` throws if the auth call itself errors (network timeout); crashes the component with no error boundary.

8. [crit] Invalid `id` navigated FROM a valid previous category shows stale content, not 404 — `page.js:51` — when both UUID and slug lookups return null, the `if (categoryData)` block is skipped; `setCategory` is never called; `category` retains its prior value; the old category renders with an empty article list instead of the not-found screen.

9. [crit] Soft-deleted articles appear in the feed — `page.js:71` — no `.is('deleted_at', null)` filter; `admin_soft_delete_article` RPC sets `deleted_at` without changing `status`, so deleted articles pass the `.eq('status', 'published')` gate and remain visible.

10. [crit] Inactive categories render as live pages — `page.js:36` — no `.eq('is_active', true)` filter on the category query; admin-deactivated categories are fully displayed.

11. [crit] Unbounded article list fetch — `page.js:71` — no `.limit()` on articles query; high-volume categories (100+ articles) fetch all rows; subsequent `.in('article_id', ids)` for bookmarks compounds the URL-length risk at scale. Add `.limit(100)` (configurable); trim bookmark IDs to the same cap.

12. [crit] Static metadata ignores actual category — `layout.js:1` — `title: 'Category — Verity Post'` hardcoded; every category page has an identical `<title>`, breaking WCAG 2.4.2, hurting SEO, and making browser history tabs indistinguishable. Fix: dynamic `generateMetadata` per DECISION #056.

13. [crit] Sort buttons no `aria-pressed` — `page.js:364` — active sort communicated only by background colour; fails WCAG 1.3.1. Add `aria-pressed={sort === s}`.

14. [crit] Subcategory filter buttons no `aria-pressed` — `page.js:387` — same issue as #13; add `aria-pressed={activeSubcat === sc.id}` / `aria-pressed={activeSubcat === null}` on the "All" button.

15. [crit] No `<main>` landmark — `page.js:261` — page returns bare `<div>` trees with no `<main>` wrapper; screen reader users can't jump to main content via landmark navigation.

16. [crit] Toast no `aria-live` — `page.js:271` — bookmark success/error messages are visually displayed but never announced to screen readers. Fix: `role="status"` or `aria-live="polite"` on the toast container.

17. [crit] Loading skeleton no `role="status"` — `page.js:156` — no indication to AT that content is loading. Add a visually-hidden `<div role="status">Loading category...</div>` alongside the skeleton.

18. [crit] "Load more" count change not announced — `page.js:563` — after click, article list grows silently; AT users get no feedback. Add an `aria-live="polite"` count announcer (e.g. `"Showing N of M articles"`) that updates when `visibleCount` changes.

19. [crit] Subcategory filtered-empty state not announced — `page.js:550` — the "No articles in this subcategory yet." message appears dynamically but is in a plain `<div>` with no `role="status"` or `aria-live`.

20. [crit] Touch targets < 44px on multiple interactive elements — Sort buttons (padding `6px 14px` ≈ 32px tall), subcategory chips (same), bookmark Save button (padding `2px 8px` ≈ 20px tall), "Back to browse" link (padding `0`) — all fail WCAG 2.5.5 and PRINCIPLE §2.1. Fix: sort/subcat buttons min-height 44px; bookmark button min-height 44px (pad to `8px 12px`); back link add padding.

21. [crit] Category badge contrast 3.8:1 fails WCAG AA — `page.js:482` — `color: '#0369a1'` on `background: '#e0f2fe'` ≈ 3.8:1 for 11px text; AA requires 4.5:1. Fix: darken the text colour to `#025a8e` (~4.5:1) or use CSS variable tokens.

22. [crit] `formatDate` always absolute — `page.js:494` — violates DECISION #029 (hybrid: <24h → relative, ≥24h → absolute). Fix: inline hybrid using existing `timeAgo` function from `lib/dates`.

23. [crit] `visibleCount` not reset on sort change — `page.js:364` — switching sort mode does not call `setVisibleCount(5)`; user who loaded 8 items sees all 8 in the new sort order immediately (inconsistent with subcategory switches which do reset count). Fix: add `setVisibleCount(5)` to the sort button `onClick`.

24. [crit] Sort/subcategory groups no `role="group"` + `aria-label` — `page.js:363-420` — the sort button row and subcategory chip row appear as an undifferentiated sequence of buttons in screen-reader virtual cursor mode. Wrap each in `<div role="group" aria-label="Sort by">` and `<div role="group" aria-label="Filter by topic">`.

25. [crit] Category letter-avatar not `aria-hidden` — `page.js:318` — the decorative initial character (e.g. "T", "P") is read as content by screen readers without context. Add `aria-hidden="true"`.

### Polish findings (26–37)

26. [polish] Empty-state condition wrong — `page.js:427` — checks `stories.length === 0` (all articles ever), not whether anything is currently visible. When a subcategory filter has no matches, the global empty card doesn't trigger; only the smaller plain-text subcategory-empty message shows. Fix: show the styled empty card when `visible.length === 0`, or show it only pre-filter and rely on subcategory-empty for filtered empty.

27. [polish] `category.description` null → empty `<p>` with 12px bottom margin — `page.js:348` — layout collapses with unexpected whitespace when description is absent. Fix: render conditionally `{category.description && <p>...`}`.

28. [polish] Toast timer race — `page.js:120, 139` — back-to-back errors each set a new `setTimeout(() => setToast(''), 2400)`; the first timer clears the second message early. Fix: store timer ref, `clearTimeout` on each new toast.

29. [polish] Excerpt `'...'` always appended — `page.js:519` — appended even when `excerpt.length < 60`. Fix: `story.excerpt.length > 60 ? story.excerpt.slice(0, 60) + '…' : story.excerpt`.

30. [polish] Category name badge no overflow/truncation — `page.js:481` — long category names overflow the pill and displace the date label in the same flex row. Add `maxWidth`, `overflow: hidden`, `textOverflow: ellipsis`, `whiteSpace: nowrap`.

31. [polish] No bookmark in-flight state — `page.js:110` — "Save" / "Saved" label doesn't change during the network call; slow connections leave the user uncertain whether the tap registered. Add a local `toggling` boolean state; render "…" while in-flight; disable the button.

32. [polish] `formatDate(null)` produces empty span — `page.js:494` — when `published_at` is null, the date slot is blank, creating a ragged card layout. Fix: render `{story.published_at ? hybridDate(story.published_at) : ''}` (or omit the span when null).

33. [REFUTED] In-feed ad placement — `page.js:454` — pre-flight verifier confirmed `idx === 4` correctly places ad between cards 4 and 5 (0-indexed). No fix needed.

34. [polish] Kids-category copy identical to missing-category copy — `page.js:56` — the `kids-*` slug path calls `setCategory(null)` which shows "Category not found / renamed or removed", which is confusing. The category exists but is iOS-only. Differentiate copy: "This category is available in the Verity Post Kids app."

35. [polish] URL state not persisted for sort + subcategory — `page.js:364-420` — Back navigation resets sort and active subcategory; no shareable filtered view. Fix per DECISION #055: `router.replace` with `?sort=` + `?sub=` params; `useSearchParams()` on mount to initialize.

36. [polish] Article cards use `<a href>` not `<Link>` — `page.js:457` — plain anchor causes full page reload on article navigation; `Next/link` provides prefetch + client-side transition. Same for "Back to browse" `<a href="/browse">` at line 301 and "browse the home feed" `<a href="/">` at line 444.

37. [polish] No `<nav>` landmark for breadcrumb — `page.js:301` — the "Back to browse" link floats in an unlabelled `<div>` with no landmark context. Wrap in `<nav aria-label="Breadcrumb">` or at minimum a `<div role="navigation" aria-label="Back navigation">`.

---

## Decisions consumed by Slice 13

| Decision | Applied by |
|---|---|
| #022 — null-slug filter at query layer | F2 |
| #029 — hybrid timestamps | F22 |
| #043 — registration wall on anon bookmark | F4 |
| #053 — server-side layout metadata pattern | F12 |
| #054 — URL state persistence (extends to category) | F35 |
| #055 — Category URL state (sort + subcat) — NEW | F35 |
| #056 — Category dynamic metadata — NEW | F12 |

---

## iOS parity note

No dedicated iOS Category detail unit is in the current review plan. When Wave D Unit 31 (iOS Browse) is reviewed, flag whether the iOS browse drill-down into a category surfaces the same issues (static metadata is N/A on iOS; URL state is N/A; but `href="#"` dead cards, anon bookmark wall, and touch targets will have iOS analogues).

---

## Slice 13 — shipped 2026-05-02

**Prerequisite:** Slices 1 + 2 done (both shipped 2026-05-02).
**Elevated-care:** NO. Standard adversary pass ran; 5 gaps found, 2 blocking closed.
**File count:** 2 files (`page.js`, `layout.js` → `layout.tsx`)

## Non-blocking adversary gaps (deferred)

- Gap 3: Stale `?sub=` URL param not stripped when subcat ID is invalid — cosmetic UX; fix in next pass.
- Gap 4: `bookmarkingId` scalar races on rapid multi-card clicks — UX cosmetic; upgrade to Set<string> in next pass.

**Streams:** Can run as a single stream (file count is low). Alternatively split:
- Stream A: `layout.tsx` (new, F12 / DECISION #056) + all data-layer fixes (F2, F3, F6, F7, F8, F9, F10, F22, F32)
- Stream B: `page.js` interaction + UX fixes (F1, F4, F5, F13–F25, F23, F26–F37)

See `UI_UX_REVIEW_SLICES.md` Slice 13 entry for per-finding fix recipes.
