# Slice 02 — Navigation & Discovery

**Status:** shipped
**Investigated:** 2026-04-30 (session 3)
**Adversarial review:** done (session 3)
**Implementation:** 2026-04-30 (session 4)

---

## Issues

### 02-00 — Home feed Promise.all has no try/catch; no app-root error boundary

**Priority:** P1
**Status:** shipped — `2ce74ae`

**Root cause:**
`web/src/app/page.tsx:156–218` covers the full async data-fetch section of the home feed server component. It starts with a `cookies()` call at line 156, builds a `readLogPromise` chain at lines 171–186, then awaits a `Promise.all([...])` of five Supabase queries at line 188. None of this is wrapped in try/catch.

Supabase normally returns `{data, error}` rather than throwing, so the `.error` path handles query-level failures. But if Supabase client setup throws, the network layer throws, or an RLS violation propagates as a rejection through the `.then()` chain in `readLogPromise`, the server component crashes with an unhandled exception.

No error boundary exists to catch it:
- `web/src/app/error.tsx` — does not exist
- `web/src/app/global-error.tsx` — does not exist
- `web/src/app/layout.js:151` — wraps children in `<NavWrapper>` with no try/catch

The graceful `HomeFetchFailed` component (`web/src/app/_HomeFetchFailed.tsx:18–58`) only wires to the `.error` property path at `page.tsx:235` — it does not catch thrown exceptions.

**What the user sees on a throw:** raw Next.js 500 error page.

**Fix plan:**
Wrap the full async section of `page.tsx` — from the `cookies()` call at line 156 through the end of the Promise.all destructuring at line 218 — in a single try/catch. On catch, set a boolean flag (e.g. `fetchThrew = true`) and merge it into the existing `fetchFailed` condition at line 318 so `<HomeFetchFailed />` renders instead of a 500. The single try/catch covers `readLogPromise` throw risk as well — no separate fix needed there.

**Files:**
- `web/src/app/page.tsx:156–218` (wrap in try/catch)
- `web/src/app/page.tsx:318` (merge `fetchThrew` into `fetchFailed` condition)

---

### 02-01 — Article links use `/story/` prefix in three pages

**Priority:** P2
**Status:** shipped — `4523058`

**Root cause:**
After the stories-as-containers migration, the canonical article URL is `/<slug>`. The `/story/[slug]` route exists only as a legacy redirect shim (`web/src/app/story/[slug]/page.tsx:16` — `redirect(\`/${params.slug}\`)`). Three pages still link with the `/story/` prefix, adding an unnecessary redirect hop on every article click:

- `web/src/app/browse/page.tsx:392` — `href={\`/story/${h.slug}\`}`
- `web/src/app/category/[id]/page.js:395` — `href={story.stories?.slug ? \`/story/${story.stories.slug}\` : '#'}`
- `web/src/app/following/page.tsx:150` — `href={\`/story/${story.slug}\`}`

Search (`search/page.tsx:254`) already uses the correct pattern: `href={a.stories?.slug ? \`/${a.stories.slug}\` : '#'}`.

**Implementation note for following/page.tsx:**
`following/page.tsx:150` accesses `story.slug` directly (not `story.stories?.slug`). Before changing the href, the implementation agent must read `following/page.tsx` in full to verify what `story.slug` actually is — whether it comes from a `stories(slug)` join (nested) or is a flat field on the query result. The href fix depends on the actual query shape.

**Fix plan:**
- `browse/page.tsx:392` — change `\`/story/${h.slug}\`` to `\`/${h.slug}\``
- `category/[id]/page.js:395` — change `\`/story/${story.stories.slug}\`` to `\`/${story.stories.slug}\``
- `following/page.tsx:150` — verify query shape first, then change href to `\`/${correct_slug_field}\`` with appropriate null guard matching the search page pattern

**Files:**
- `web/src/app/browse/page.tsx:392`
- `web/src/app/category/[id]/page.js:395`
- `web/src/app/following/page.tsx:150` (read full file before editing)

---

### 02-02 — _HomeFirstLoginMoment.tsx has two silent catch blocks

**Priority:** P3
**Status:** shipped — `dc6659d`

**Root cause:**
`web/src/app/_HomeFirstLoginMoment.tsx` has two catch blocks that swallow errors with no logging:

1. Line 88–90 — protects the main Supabase fetch chain (user referral metadata + waitlist tenure query). On any throw, `setCopy(null)` is called — the onboarding overlay simply doesn't render. No `console.error`.

2. Line 114–119 — protects the post-animation user update mutation (marks first login moment as shown). On any throw, the mutation silently fails. No `console.error`.

**User impact:** Low — the overlay doesn't render or the update silently skips. The home page is unaffected. The issue is operational: errors here are completely invisible in logs.

**Fix plan:**
Add `console.error('[home.first-login-moment] fetch error', e)` to the catch at line 88–90 and `console.error('[home.first-login-moment] update error', e)` to the catch at line 114–119. No other change — the silent fallback behavior (overlay omitted, update skipped) is correct.

**Files:**
- `web/src/app/_HomeFirstLoginMoment.tsx:88–90`
- `web/src/app/_HomeFirstLoginMoment.tsx:114–119`

---

## Won't-fix (named)

- **Missing route-level `error.js` on browse/category/following** — all three pages have in-component error states (`loadFailed`, `<ErrorState />`). Adding `error.js` files is architectural scope, not a regression.
- **`top_stories` FK force-cast at `page.tsx:231`** — `.filter((r) => r.articles != null)` guard runs before the cast; safe as written.
- **Search slug nullability at `search/page.tsx:254`** — `ArticleHit` types `slug` as `string` (not `string | null`); the `?.` guard is already correct per type.
- **Silent empty-query in search** — submit button is disabled client-side; `api/search/route.js:30` returns `[]` on empty query. No user-visible issue.

---

## Cross-surface finding resolved

**`/community-guidelines` route** (carried from `INDEX.md` cross-surface finding #1): Agent D ran a full-repo grep — zero files in `web/src` link to `/community-guidelines`. Route does not exist, but nothing points to it. Finding closed.
