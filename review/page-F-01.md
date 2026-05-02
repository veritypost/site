# F-01 Home Feed (Web)

Route: `/`
Platform: web
Tier: flagship

---

## Agent 1 — Inventory

### Files read

- `web/src/app/page.tsx` — server component, main page
- `web/src/app/_homeShared.ts` — shared types and helpers (HomeStory type, color tokens, serif stack, timeShort)
- `web/src/app/_HomeBreakingStrip.tsx` — client island, breaking news banner
- `web/src/app/_HomeFooter.tsx` — client island, anon sign-up CTA at page bottom
- `web/src/app/_HomeFetchFailed.tsx` — client island, retry button on fetch error
- `web/src/app/_HomeFirstLoginMoment.tsx` — client island, first-login welcome overlay
- `web/src/app/_HomeVisitTimestamp.tsx` — client island, writes `vp_last_home_visit_at` cookie
- `web/src/app/NavWrapper.tsx` — read as boundary reference; imported by `_HomeFooter` and `_HomeFirstLoginMoment` for `useAuth()` / `AuthContext`
- `web/src/app/globals.css` — verified `--breaking` token definition

Not recursed into (shared boundaries):
- `@/lib/supabase/server` — server Supabase factory
- `@/lib/supabase/client` — browser Supabase factory
- `@/lib/permissions` — `hasPermission`, `refreshIfStale`, `refreshAllPermissions`
- `@/types/database-helpers` — generated DB types

---

### Components rendered on this page

```
HomePage (server component)
├── HomeFirstLoginMoment (client island — position:fixed overlay, renders null until auth loads)
├── HomeBreakingStrip (client island — conditional: breaking && showBreaking)
│   └── <Link href="/{slug}" | "#"> → article
├── <main>
│   ├── HomeFetchFailed (client island — conditional: fetchFailed)
│   ├── <p>{humanDate}</p> (conditional: !fetchFailed)
│   ├── Hero (server sub-component — conditional: !fetchFailed && hero)
│   │   ├── LifecyclePill (conditional: story.stories?.lifecycle_status)
│   │   ├── inline "New" badge (conditional: isNew)
│   │   └── <Link href="/{slug}" | "#"> → article
│   ├── <section aria-label="Supporting stories"> (conditional: !fetchFailed && supporting.length > 0)
│   │   └── SupportingCard[] (server sub-component, repeated)
│   │       ├── LifecyclePill (conditional)
│   │       ├── Eyebrow (category name, conditional)
│   │       ├── NewPill (conditional: isNew)
│   │       └── <Link href="/{slug}" | "#"> → article
│   └── HomeFooter (client island — conditional: !fetchFailed && hero)
│       └── only renders when !loggedIn; returns null for signed-in users
└── HomeVisitTimestamp (client island — renders null, side-effect only)
```

Server sub-components defined in `page.tsx`: `NewPill`, `LifecyclePill`, `Eyebrow`, `MetaLine`, `Hero`, `SupportingCard`

---

### State managed on this page

**Server (page.tsx — computed once per request, not reactive):**
- `storiesRes`, `breakingRes`, `catsRes`, `topStoriesRes`, `userMetaRes` — mutable holders for Supabase results (declared outside try block)
- `lastVisitMs: number | null` — parsed from `vp_last_home_visit_at` cookie
- `fetchThrew: boolean` — catch-block flag
- `showBreaking: boolean` — derived from `userMetaRes.data?.metadata?.feed?.showBreaking ?? true`
- `topArticles: HomeStory[]` — from top_stories join, filtered for null articles
- `fetchFailed: boolean` — `(topArticles.length === 0 && !!storiesRes.error) || fetchThrew`
- `displayedStories: HomeStory[]` — topArticles if non-empty, else date-sorted articles
- `hero: HomeStory | null` — `displayedStories[0]`
- `supporting: HomeStory[]` — `displayedStories.slice(1)`
- `categoryById: Record<string, CategoryRow>` — built from catsRes

**`_HomeBreakingStrip.tsx` (client):**
- `permsReady: boolean` — useState(false); set true after `refreshIfStale()` resolves
- `canSeePaid: boolean` — useState(false); set from `hasPermission('home.breaking_banner.view.paid')`

**`_HomeFooter.tsx` (client):**
- No local state; reads `loggedIn` from AuthContext via `useAuth()`

**`_HomeFetchFailed.tsx` (client):**
- No local state; uses `useRouter()` for `router.refresh()`

**`_HomeFirstLoginMoment.tsx` (client):**
- `copy: string | null | undefined` — undefined=loading, null=no moment needed, string=show this copy
- `opacity: number` — useState(0); drives CSS opacity for fade animation
- `completedRef: MutableRefObject<boolean>` — useRef(false); prevents double-stamp of `onboarding_completed_at`
- Reads `user`, `authLoaded` from AuthContext

**`_HomeVisitTimestamp.tsx` (client):**
- No state; useEffect on mount writes cookie

---

### Data this page fetches

**Server (all run in Promise.all, page.tsx:196–225):**

1. **Articles (main feed):**
   `articles.select(SELECT_COLS).eq('status','published').eq('browse_only',false).order('published_at', DESC).limit(50)`
   Returns: `HomeStory[]` with `id, title, stories{slug, lifecycle_status}, excerpt, category_id, is_breaking, is_developing, published_at`
   Populates: `storiesRes → dateSorted → displayedStories` (fallback when no top_stories pinned)

2. **Breaking article:**
   `articles.select(SELECT_COLS).eq('status','published').eq('is_breaking',true).eq('browse_only',false).order('published_at', DESC).limit(1)`
   Returns: single `HomeStory | null`
   Populates: `breakingRes → breaking`

3. **Categories:**
   `categories.select('id, name, slug, color_hex').eq('is_active',true).order('sort_order', ASC nullsLast)`
   Returns: `CategoryRow[]`
   Populates: `catsRes → categoryById`

4. **Top stories (pinned):**
   `top_stories.select('position, articles(id, title, stories(...), ...)').order('position')`
   Returns: `{ position: number; articles: HomeStory | null }[]`
   Populates: `topStoriesRes → topArticles → displayedStories` (overrides articles query when non-empty)

5. **User feed preferences (server-side IIFE):**
   `supabase.auth.getUser()` → if user, `users.select('metadata').eq('id', user.id).single()`
   Returns: `{ metadata: unknown } | null`
   Populates: `userMetaRes → rawFeedMeta → showBreaking`

**Client (`_HomeBreakingStrip.tsx`):**
- `refreshIfStale()` + `hasPermission('home.breaking_banner.view.paid')` — from permissions cache

**Client (`_HomeFirstLoginMoment.tsx`):**
- `users.select('referred_by_user_id, email').eq('id', user.id).maybeSingle()` — gets referral + email
- If referred: `users.select('display_name, username').eq('id', referredById).maybeSingle()` — referrer name
- If email found: `access_requests.select('created_at').eq('email',myEmail).eq('status','approved').order('created_at').limit(1).maybeSingle()` — waitlist date

---

### Data this page mutates

- `_HomeFirstLoginMoment.tsx` → `users.update({ onboarding_completed_at })` — stamps the welcome moment as seen; fired on animation complete (awaited) and in error path (fire-and-forget)

---

### External dependencies

- Supabase (server + browser clients)
- `@/lib/permissions`: `hasPermission`, `refreshIfStale`
- `next/headers`: `cookies()` — reads `vp_last_home_visit_at`
- CSS variable `var(--breaking)` — defined in `globals.css:64` as `#ef4444`
- `@/lib/brand`: `BRAND_NAME`, `BRAND_LEGAL_ENTITY` (via NavWrapper)
- `@/lib/zIndex`: `Z.CRITICAL` (via NavWrapper)

**Feature flags / env vars:**
- `export const dynamic = 'force-dynamic'` — prevents static caching of this route
- `EDITORIAL_TZ = 'America/New_York'` — hardcoded in `_homeShared.ts`
- Cookie: `vp_last_home_visit_at` — "New" pill feature

**Permissions checked:**
- `home.breaking_banner.view.paid` — gates the timestamp display in the breaking strip

---

### Routing

Arrival: direct navigation, top bar logo click (`/` link in NavWrapper), bottom nav "Home" link
Outbound:
- Hero and SupportingCard → `/{story.stories.slug}` (article reader)
- HomeBreakingStrip → `/{story.stories.slug}` (article reader)
- HomeFooter (anon only) → `/signup` (redirects to `/login`)
- Falls back to `href="#"` when `story.stories?.slug` is null/undefined

No server-side redirects on this route.

---

## Agent 2 — First Impression

### Top 5 things that feel off, ranked by gut severity

1. **The edition model is broken — the page shows all articles, not today's.** The design comment says "shows only articles published today (editorial TZ), capped at 12." The query fetches 50 articles with no date filter whatsoever. `editorialToday()` computes `startUtc` and documents it as "used to filter edition" but it's never passed to any query. On a mature site with many published articles, the front page would look like a never-ending archive scroll, not a daily paper. This is the most consequential miss on the page.

2. **The breaking strip causes a layout pop after hydration.** The `_HomeBreakingStrip` client island renders `null` until `refreshIfStale()` resolves (`permsReady: false`). During server render and initial hydration, the strip is invisible. A moment after mount, it pops into view and shifts everything below it downward. This is a CLS event on the flagship surface — it makes the page feel unstable on first load.

3. **Signed-in users hit a dead end.** `HomeFooter` returns `null` for logged-in users. The design comment says it should render a "Browse all categories" link for them, but it doesn't. When a signed-in user finishes reading the supporting cards, the page just… stops. No editorial closer, no invitation to browse, no "that's today's edition." The only thing below is the global footer with legal links.

4. **Hero full-bleed uses `width: 100vw` without compensating for the scrollbar.** On desktop with a vertical scrollbar, `100vw` exceeds the viewport content width by ~15–17px. There's no `overflow-x: hidden` on body in globals.css or layout.js. This causes a horizontal scrollbar on any desktop browser with a long enough page, which looks broken.

5. **Two dates visible simultaneously on the home page.** NavWrapper's top bar shows a center-aligned date (`"May 2, 2026"`) when `path === '/'`. The masthead immediately below also shows the editorial date (`"SATURDAY, MAY 2, 2026"`). The formats differ but both are visible at once, creating unnecessary redundancy in the most prime real estate on the page.

### What this page does well (if anything)

- The server-render architecture is clean: three data fetches run in parallel with a graceful fallback to `top_stories`. The `fetchFailed` branch is thoughtful — if pinned stories exist the page still renders, even when the main articles query errors.
- The "New since last visit" mechanism is well-designed: server-computed from a cookie, zero client state, no hydration mismatch.
- `_HomeFetchFailed` is a genuinely good error state — retry via `router.refresh()` without a full page reload is the right call.
- The `HomeFirstLoginMoment` welcome overlay logic is thorough: referred path, waitlist-day count, bare "you made it" fallback.
- Color tokens are properly shared via `_homeShared.ts` and `globals.css`; no hard-coded strays.

### Devices where this is worse

- **Desktop:** `100vw` hero band causes a horizontal scrollbar when the vertical scrollbar is visible. Most noticeable on Windows browsers.
- **Phone, narrow viewport:** Hero title is 40px with no responsive scaling. On 320px screens (iPhone SE 1st gen), the headline is very large relative to available width. Not broken, but aggressive.
- **Low connection:** `_HomeBreakingStrip` and `_HomeFirstLoginMoment` both make client-side Supabase/permissions calls after mount. On slow connections, the breaking strip will be visibly absent for several seconds.
- **Dark mode:** The page uses `background: C.bg` (`#ffffff`) and inline `color: C.text` (`#111111`) — hardcoded, not respecting `prefers-color-scheme` or `data-theme`. The rest of the UI (NavWrapper, global footer) uses CSS variables that do respond to dark mode. The home feed body will stay white in dark mode while the nav and footer go dark — a jarring mismatch.

### Overall vibe

This page has a strong editorial ambition — the "newspaper front page" model is clear and the implementation of the hero + supporting card hierarchy is clean. The typography scale is deliberate. But at least two things are genuinely broken in ways that matter to the product's core promise: the page isn't showing today's news (it's showing all news), and the landing experience on fast connections still has a layout-pop from the breaking strip. The dark mode gap is particularly jarring because the rest of the product has invested in dark mode tokens and this page sits outside that system entirely. It reads like a page that got built once and didn't get the same polish pass the nav and profile sections got.

---

## Agent 3 — Explanation

### What this page is for

This is the daily front page of Verity Post: a curated "edition" of today's news articles, presented as a single large hero plus a list of supporting cards. Users come here to see what's happening today and click through to read individual articles. The product wants users to build a daily reading habit — the editorial model mirrors a newspaper, finite per day, designed to be completable.

### How it works, narratively

**On server render:**
A visitor hits `/`. The server component calls `editorialToday()` to compute today's editorial date (America/New_York), then fires five Supabase queries in parallel: (1) published articles ordered by recency, (2) the most recent breaking article, (3) active categories, (4) top-pinned stories, (5) the signed-in user's feed preferences. The `vp_last_home_visit_at` cookie is read to compute which articles are "new since last visit."

After fetching, the page decides what to display: if any articles are pinned to `top_stories`, those become the feed (in pin order). Otherwise, the date-sorted articles fallback is used. The first story becomes the hero; the rest become supporting cards. The page renders server-side as static HTML — hero, supporting cards, date masthead — and sends it to the browser.

**Client hydration:**
Three client islands hydrate in parallel:
- `HomeVisitTimestamp` immediately writes a new `vp_last_home_visit_at` cookie (updating "last visit" for next time)
- `HomeBreakingStrip` calls `refreshIfStale()` to prime the permissions cache, then checks `home.breaking_banner.view.paid` to decide whether to show the published-time on the strip. Until permissions resolve, the strip is hidden (`permsReady: false` → returns null).
- `HomeFirstLoginMoment` checks `user.onboarding_completed_at`. If null (first login), it fetches referral data and access-request data to pick the right welcome copy, then fades in/out a full-screen overlay. On animation complete, it stamps `onboarding_completed_at` to prevent re-showing.
- `HomeFooter` reads `loggedIn` from AuthContext and renders a sign-up CTA for anonymous visitors, or nothing for signed-in users.

**User interaction:**
The page has no interactive elements beyond links. Each article card is a full-block `<Link>` pointing to the article reader (`/{slug}`). The `HomeFetchFailed` retry button fires `router.refresh()` which re-runs the server component.

### Key logic and calculations

- **`editorialToday()`** — Computes the editorial date in America/New_York using `Intl.DateTimeFormat`. Returns `isoDate` (YYYY-MM-DD), `startUtc` (midnight ETZ as UTC ISO), and `humanDate` (human-readable string). Only `humanDate` is actually used in the render; `isoDate` and `startUtc` are computed but unused.

- **Top-stories override** — `displayedStories = topArticles.length > 0 ? topArticles : dateSorted` — pinned articles supersede the date-query fallback entirely. The admin controls the front page by pinning articles to `top_stories`.

- **`fetchFailed` logic** — `(topArticles.length === 0 && !!storiesRes.error) || fetchThrew` — the page gracefully shows pinned top stories even if the primary articles query errored. Only shows the retry state if both queries failed.

- **`isNewStory()`** — `lastVisitMs != null && story.published_at && Date.parse(story.published_at) > lastVisitMs` — a story is "new" if its `published_at` is after the last recorded home visit.

- **`heroBg()`** — Returns the hero background color: `category.color_hex` if set, then a hardcoded per-slug `CATEGORY_PALETTE` fallback, then `#1a1a1a`. The DB comment notes `color_hex` is null for all live rows as of 2026-04-26, so the palette is always active.

- **`timeShort()`** — Relative time: "Xm ago" (< 1h), "Xh ago" (< 24h), "Mon DD" (≥ 24h). Computed server-side, not reactive.

### State machine, if any

```
Server render:
  → fetch success + topArticles present  → render top-pinned feed
  → fetch success + topArticles empty    → render date-sorted feed (possibly empty)
  → stories errored + topArticles present → render top-pinned feed (no retry state)
  → stories errored + topArticles empty   → render HomeFetchFailed → user retries

HomeBreakingStrip:
  mounted with permsReady=false → invisible
  → refreshIfStale() resolves → permsReady=true → strip appears

HomeFirstLoginMoment:
  authLoaded=false → null
  → user is null or onboarding_completed_at set → null (no moment)
  → first-login user → fetch referral/waitlist data
    → success → fade in copy → hold 1400ms → fade out → stamp onboarding_completed_at
    → error → stamp onboarding_completed_at (fire-and-forget) → null
```

### Assumptions this page makes

1. The articles query returns articles from "today" — the query has no date filter; this assumption is violated.
2. At least one article exists in `top_stories` OR was published recently — if the DB is empty, the page renders only the date masthead with no content and no designed empty state.
3. `story.stories?.slug` is non-null — falls back to `href="#"` when violated.
4. `story.stories?.lifecycle_status` reflects the Breaking/Developing state of the parent story — this diverges from `article.is_breaking`/`article.is_developing` which are selected but not rendered.
5. The `--breaking` CSS variable is defined globally — true, confirmed at `globals.css:64`.
6. The signed-in user's `metadata.feed.showBreaking` is a boolean — the code casts it: `(rawFeedMeta?.showBreaking ?? true) as boolean`. Any non-boolean value would be treated as truthy.
7. Breaking article is from today — no date filter on the breaking query; a week-old breaking article would still show.

### Connections to other pages

- **F-02 (Article Reader)** — every article link from this page lands here
- **F-03 (Login)** — `HomeFooter` links anon users to `/signup` → redirects to `/login`
- **A-27 (Top Stories Pinning)** — admin tool that controls `top_stories` table, directly controls what this page shows
- **A-02 (Newsroom)** — admin article management; publishing articles here is what populates the feed
- **NavWrapper** — provides AuthContext, top bar, bottom nav, global footer; its `topBarActive` renders the date on `/` specifically

---

## Agent 4 — Deep Technical

### 1. [SURFACE] Edition date filter missing — page shows all articles, not today's

Where: `web/src/app/page.tsx:70–99, 196–203`

What's wrong: `editorialToday()` computes and returns `startUtc` (midnight ETZ as UTC) with the comment "used to filter edition." But neither the main articles query nor the breaking-story query uses it. The articles query is:
```js
supabase.from('articles').select(SELECT_COLS)
  .eq('status', 'published')
  .eq('browse_only', false)
  .order('published_at', { ascending: false })
  .limit(50)
```
No `.gte('published_at', today.startUtc)` filter. The design comment at line 48 says "shows only articles published today (editorial TZ), capped at 12." Neither constraint is enforced.

Why it matters: The front page will show articles from any date, with the most recent 50. On a live site with a growing archive, the hero could be from yesterday and supporting cards from last week. The "daily paper" edition model the product is built around doesn't function.

Severity: **blocking**

Fix: Add `.gte('published_at', today.startUtc)` to both `storiesRes` and `breakingRes` queries. Also replace `.limit(50)` with `.limit(12)` per the design spec (1 hero + 11 supporting). Remove or document the `isoDate` and `startUtc` returns from `editorialToday()` if they remain unused beyond the filter.

Confidence: HIGH

---

### 2. [SURFACE] Breaking strip causes CLS on every page load

Where: `web/src/app/_HomeBreakingStrip.tsx:37`

What's wrong: `if (!permsReady) return null` means the strip renders nothing until `refreshIfStale()` completes. Since this is a client component, the server HTML doesn't include the strip's visual content. After hydration, the strip pops into view, pushing everything below it downward. This is a Cumulative Layout Shift (CLS) event on every page load where a breaking story exists.

Why it matters: CLS hurts Core Web Vitals and makes the page feel unstable. The strip is ~44px tall (12px top + 12px bottom padding + ~20px text). Content visibly jumps when it appears.

Severity: **blocking** (Core Web Vitals / flagship experience)

Fix: The strip needs to either: (a) render with server-side HTML and hide only the timestamp via JS (the strip itself is shown to everyone; only `canSeePaid` gates the time), or (b) reserve space for the strip height before perms resolve using a placeholder. Option (a) is simpler: render the strip immediately with the story title visible; only wrap the timestamp span in the `canSeePaid` guard. The `permsReady` null-return should be removed.

Confidence: HIGH

---

### 3. [SURFACE] `width: 100vw` hero band causes horizontal scrollbar on desktop

Where: `web/src/app/page.tsx:474–481`

What's wrong:
```js
marginLeft: '-50vw',
marginRight: '-50vw',
width: '100vw',
```
On desktop browsers (Windows, Chrome/Firefox), `100vw` includes the width of the vertical scrollbar (typically 15–17px). When the page is long enough to show a scrollbar, the hero band overflows the viewport by the scrollbar width. `globals.css` and `layout.js` have no `overflow-x: hidden` on `body` or `html`.

Why it matters: A horizontal scrollbar appears on the flagship surface for all desktop users with long-enough content pages. Visually broken.

Severity: **blocking**

Fix: Add `overflow-x: hidden` to `body` in `globals.css`, OR use `width: 100dvw` if supported (still affected by scrollbar), OR apply `overflow-x: clip` to the `<main>` parent. The cleanest fix: `body { overflow-x: hidden; }` in globals.css — this is the standard fix for this technique.

Confidence: HIGH

---

### 4. [SURFACE] `href="#"` fallback when story slug is null

Where: `web/src/app/page.tsx:464` (Hero), `web/src/app/page.tsx:594` (SupportingCard), `web/src/app/_HomeBreakingStrip.tsx:41`

What's wrong: All three link sites use `story.stories?.slug ? `/${story.stories.slug}` : '#'`. An article without a parent story (orphan article) or with a null slug produces an `href="#"` link. Clicking scrolls to the top of the page — unexpected navigation.

Why it matters: An orphan article renders as a clickable card that does nothing useful. If this can happen in production (e.g., a `top_stories` row referencing an article that was created before its story was linked), it presents as a silent dead link.

Severity: **confusing**

Fix: In the `Hero` and `SupportingCard` components, render the card content without a wrapping `<Link>` when the slug is null, or suppress the card entirely. The breaking strip should skip rendering when `!story.stories?.slug`.

Confidence: HIGH

---

### 5. [SURFACE] `HomeFooter` stale comment — signed-in users get nothing, not "Browse all categories"

Where: `web/src/app/_HomeFooter.tsx:1–13, 20–21`

What's wrong: The file header comment says: "Renders the 'Browse all categories' link for signed-in viewers and the warm-lead sign-up pitch for anon." The actual code at line 20:
```js
if (loggedIn) return null;
```
Signed-in users get zero rendered output. No "Browse all categories" link, no editorial closer, no "That's today's edition." message. The page abruptly ends at the last supporting card.

Why it matters: Signed-in users — the core engaged audience — finish the feed and hit a hard stop. There is no designed end state. The sign-up CTA is shown only to anonymous users who already see it in the bottom nav and the global footer.

Severity: **confusing**

Fix: Implement the signed-in branch: render a minimal "That's today's edition." close + "Browse →" link. The comment was written before implementation; the feature was never built.

Confidence: HIGH

---

### 6. [SURFACE] Breaking story query has no recency filter

Where: `web/src/app/page.tsx:206–213`

What's wrong:
```js
supabase.from('articles').select(SELECT_COLS)
  .eq('status', 'published')
  .eq('is_breaking', true)
  .eq('browse_only', false)
  .order('published_at', { ascending: false })
  .limit(1)
```
No date filter. A breaking article that was marked `is_breaking=true` a week ago and never cleared will perpetually dominate the breaking strip.

Why it matters: The breaking strip is supposed to signal live/urgent news. A stale breaking article (e.g., a hurricane warning from 5 days ago) would show indefinitely. Editorial hygiene relies on manually unsetting `is_breaking`, which is a procedural gap.

Severity: **confusing**

Fix: Add `.gte('published_at', today.startUtc)` to the breaking query, consistent with the edition model fix. Or add a separate `breaking_expires_at` column. The simplest fix is the same date filter as the main feed.

Confidence: HIGH

---

### 7. [SURFACE] `article.is_breaking` / `article.is_developing` selected but never rendered on cards

Where: `web/src/app/page.tsx:103, 484–496, 607–609`

What's wrong: `SELECT_COLS` includes `is_breaking, is_developing`. `HomeStory` type includes both fields. But `LifecyclePill` on both Hero and SupportingCard renders from `story.stories?.lifecycle_status` — the parent *story* status — not from the article-level flags:
```js
{story.stories?.lifecycle_status && (
  <LifecyclePill status={story.stories.lifecycle_status} />
)}
```
`article.is_breaking` is used only as a query filter for the breaking strip, not for the card visual.

Why it matters: An article can have `is_breaking=true` (correctly appearing in the strip query) but `stories.lifecycle_status=null` (no pill rendered on the card). The strip and the card can be inconsistent.

Severity: **confusing**

Fix: Either drive `LifecyclePill` from the article flags (`is_breaking || is_developing`) or ensure `stories.lifecycle_status` is always set when an article is marked breaking/developing. If `stories.lifecycle_status` is the canonical source of truth, remove `is_breaking`/`is_developing` from `SELECT_COLS`.

Confidence: HIGH

---

### 8. [SURFACE] No designed empty-day state

Where: `web/src/app/page.tsx:272–275, 306–321`

What's wrong: When `displayedStories` is empty (no top_stories pinned, no published articles), `hero = null` and `supporting = []`. The render path skips the date header check... actually the date header renders when `!fetchFailed` regardless:
```js
{!fetchFailed && (
  <p ...>{today.humanDate}</p>
)}
{!fetchFailed && hero && <Hero ... />}
```
When there are no articles, the page renders only the editorial date string and nothing else. No "No stories today" state, no explanation.

Why it matters: This is an undesigned state. The editorial date alone, with nothing below it, looks broken to a first-time visitor. Scheduled downtime, holidays, or a DB gap would surface this.

Severity: **confusing**

Fix: Add an explicit empty-day check: `if (!fetchFailed && !hero)` render a minimal empty-state — "Nothing published today. Check back later." or similar.

Confidence: HIGH

---

### 9. [SURFACE] `HomeFirstLoginMoment` creates a redundant second Supabase client in the error path

Where: `web/src/app/_HomeFirstLoginMoment.tsx:95`

What's wrong:
```js
} catch (e) {
  ...
  const supabase2 = createClient(); // ← new client
  void supabase2
    .from('users')
    .update({ onboarding_completed_at: ... })
    .eq('id', user.id)
    .then(undefined, () => {});
}
```
`supabase` from line 25 is in scope inside the catch block. Creating `supabase2` is unnecessary and creates a second browser client instance on error.

Why it matters: Minor resource waste; slightly confusing to read.

Severity: **annoying**

Fix: Replace `supabase2` with `supabase` (reuse the existing client).

Confidence: HIGH

---

### 10. [SURFACE] First-login welcome moment is permanently silenced by a network error

Where: `web/src/app/_HomeFirstLoginMoment.tsx:88–100`

What's wrong: In the catch block, `onboarding_completed_at` is stamped fire-and-forget, permanently marking the first-login moment as "seen" even if the user never saw it. The comment acknowledges this: "The user won't see the welcome moment (acceptable), but the flag prevents re-fetching."

Why it matters: A user who had a network error on their exact first home-page load loses the welcome moment forever. If the error was transient (momentary connectivity loss), they'll never get it back. The flag is irrevocable.

Severity: **annoying**

Fix: Consider not stamping `onboarding_completed_at` on fetch error — let the next load retry. The "infinite retry loop" concern in the comment is only a risk if the Supabase query itself errors repeatedly; a clean success path already stamps the flag correctly. The downside of removing the error-path stamp is a potentially repeated animation on subsequent loads until connectivity is stable, which is acceptable.

Confidence: MED (tradeoff acknowledged in code, judgment call)

---

### 11. [SURFACE] Dark mode: home feed body uses hardcoded colors, not CSS variables

Where: `web/src/app/page.tsx:286`, `web/src/app/_homeShared.ts:16–24`

What's wrong:
```js
export const HOME_COLORS = {
  bg: '#ffffff',
  text: '#111111',
  soft: '#444444',
  dim: '#666666',
  muted: '#999999',
  ...
}
```
All home feed colors are hardcoded hex values. `globals.css` defines light/dark theme tokens (`--bg`, `--text`, `data-theme=dark`). The NavWrapper, global footer, and the rest of the product use `var(--bg)`, `var(--text)` etc. The home feed ignores this system entirely.

Why it matters: A user who has dark mode enabled will see the nav and footer go dark while the home feed body stays white. This is a high-contrast mismatch on the flagship surface.

Severity: **confusing** (on the technical side; experience-level severity is distracting)

Fix: Replace `HOME_COLORS.bg` and `HOME_COLORS.text` etc. with `var(--bg)` and `var(--text)` tokens. The hero card background is intentionally dark (editorial tones) — those can stay as hardcoded or per-category values since they're deliberately dark editorial bands.

Confidence: HIGH

---

### 12. [SURFACE] `top_stories` join lacks `!fk_name` hint

Where: `web/src/app/page.tsx:222–224`

What's wrong:
```js
supabase.from('top_stories')
  .select('position, articles(id, title, stories(slug, lifecycle_status), ...)')
```
No `!fk_name` hint on the `articles` join. Per `database.ts:10332`, the FK is `top_stories_article_id_fkey`. If Supabase can infer it unambiguously (only one FK from `top_stories` to `articles`), this works. If a second FK is ever added, the query will error without a hint.

Why it matters: Currently fine, but fragile. The rest of the codebase uses explicit FK hints per the team's memory note.

Severity: **annoying**

Fix: Add `!top_stories_article_id_fkey`: `articles!top_stories_article_id_fkey(...)`.

Confidence: MED (works now, fragile)

---

### 13. [SURFACE] `editorialToday()` default timezone fallback is wrong half the year

Where: `web/src/app/page.tsx:85–86`

What's wrong:
```js
const offHours = offMatch ? Number(offMatch[1]) : -5;
```
The fallback when the regex doesn't match defaults to UTC-5 (EST). During EDT (mid-March through early November), `America/New_York` is UTC-4. If `Intl.DateTimeFormat` with `longOffset` fails (extremely unlikely in modern Node.js), the wrong offset is used for ~7 months of the year, potentially showing yesterday's or today's articles depending on time of day.

Why it matters: Very low probability in practice (Intl.DateTimeFormat supports longOffset in all modern V8 environments), but the fallback is wrong.

Severity: **annoying**

Fix: The fallback could be removed entirely (rely on the regex always matching in Node.js/V8), or changed to `-4` with a comment that EDT is the majority period. Or eliminate the manual offset math entirely: instead of `editorialToday()` computing `startUtc`, use Supabase's server-side date functions or let the query filter by a date string in the editorial timezone.

Confidence: LOW (fallback path is unreachable in practice)

---

### 14. [SURFACE] `SELECT_COLS` and `top_stories` inline select can drift

Where: `web/src/app/page.tsx:102–103, 222–224`

What's wrong: Two different code paths select article fields:
```js
const SELECT_COLS = 'id, title, stories(slug, lifecycle_status), excerpt, category_id, is_breaking, is_developing, published_at';
// used for storiesRes and breakingRes

// topStoriesRes uses inline select:
.select('position, articles(id, title, stories(slug, lifecycle_status), excerpt, category_id, is_breaking, is_developing, published_at)')
```
They're currently identical, but any future change to `SELECT_COLS` must be mirrored manually in the inline select.

Why it matters: Silent field mismatch if one is updated and the other isn't. The TypeScript type (`HomeStory`) enforces the shape at compile time, so the compiler would catch a field drop — but a field addition would silently be missing from one path.

Severity: **annoying**

Fix: Extract the article sub-select into a named constant and reuse it in both places:
```js
const ARTICLE_SELECT = 'id, title, stories(slug, lifecycle_status), excerpt, category_id, is_breaking, is_developing, published_at';
const SELECT_COLS = ARTICLE_SELECT;
// top_stories: `position, articles!top_stories_article_id_fkey(${ARTICLE_SELECT})`
```

Confidence: HIGH

---

### Patterns I noticed on this page

The server-component + client-island architecture is well-executed conceptually, but the breaking strip island breaks the pattern by using the wrong hydration approach — it should defer only the permissions-gated *timestamp*, not the entire strip. The hardcoded `HOME_COLORS` object creates a parallel color system that's isolated from the rest of the site's theming infrastructure. The most critical finding is architectural: the `editorialToday()` function was clearly designed to drive a date filter, the `startUtc` return was documented as such, but the filter was never connected to the queries — this is a missing integration, not a misunderstanding of intent.

---

## Agent 5 — Deep Experience

### 1. [SURFACE] Breaking strip layout pop — content visibly shifts on load

Where: `web/src/app/_HomeBreakingStrip.tsx:37`

What's there: Strip renders `null` until perms hydrate. On a fast connection this is ~200–400ms; on slow connections, 1–2s. During that window, the hero card is positioned at the top of the viewport. When the strip appears, the hero drops by ~44px.

Why it's below the bar: The flagship surface physically shifts content on every page load that has a breaking story. Flagship surfaces should feel stable on first render. The NavWrapper top bar, which uses a similar `mounted &&` gate, avoids this by reserving vertical space via `paddingTop` even before mount.

Fix: Render the strip with story title visible immediately (no perms gate on the whole strip); only gate the timestamp span on `canSeePaid`. Reserve height from the start.

Severity: **distracting**

Affects: all users, all devices, any time a breaking story exists

---

### 2. [SURFACE] Home feed uses hardcoded light colors — dark mode shows a white-on-dark mismatch

Where: `web/src/app/_homeShared.ts:16–24`, `web/src/app/page.tsx:286`

What's there: `HOME_COLORS.bg = '#ffffff'`, `HOME_COLORS.text = '#111111'`. The main content area renders with an explicit white background and black text. The NavWrapper top bar, bottom nav, and global footer all use `var(--bg)` and `var(--text)` which respond to `data-theme=dark`.

Why it's below the bar: On dark mode, the page chrome goes dark while the feed body stays fully white. This is the highest-traffic page on the product and the contrast between a dark nav and a white feed body is visually jarring. Other editorial surfaces in the product (article reader, browse page) have proper dark mode handling via CSS variables.

Fix: Replace `HOME_COLORS.bg` with `'var(--bg)'` and `HOME_COLORS.text` with `'var(--text)'`. Hero editorial bands (dark-by-design) are intentionally dark and should keep their hardcoded values.

Severity: **distracting**

Affects: all users with dark mode enabled, both `prefers-color-scheme: dark` and manual dark toggle

---

### 3. [SURFACE] `100vw` hero causes a horizontal scrollbar on desktop

Where: `web/src/app/page.tsx:474–481`

What's there: The hero band uses `width: 100vw` + negative margins to break out of the 720px column. On desktop Windows browsers, the vertical scrollbar consumes ~15–17px of viewport width. `100vw` includes the scrollbar. No `overflow-x: hidden` on body.

Why it's below the bar: A horizontal scrollbar on the front page looks like a rendering error. Most editorial publications using this technique protect against it with `overflow-x: hidden` on `body`.

Fix: Add `body { overflow-x: hidden; }` to `globals.css`. This is the standard fix.

Severity: **distracting**

Affects: desktop users on Windows (Chrome, Firefox, Edge) — the largest desktop browser share

---

### 4. [SURFACE] Signed-in users hit a dead end at the bottom of the feed

Where: `web/src/app/_HomeFooter.tsx:20–21`

What's there: `if (loggedIn) return null`. The page renders nothing after the last supporting card for authenticated users. The global footer (NavWrapper) is below, with legal links, but there's no editorial closer.

Why it's below the bar: The product's model is "a newspaper you can finish." Finishing the front page should feel like an editorial moment, not an accidental scroll-off. The browse page, profile page, and article end all have designed transition moments. This one doesn't. The anonymous user gets "Create free account →" — the signed-in user gets nothing.

Fix: Render a signed-in footer: "That's today's edition." with a "Browse more →" or "See active stories →" link. Mirrors the closure the article reader has at the end of an article.

Severity: **distracting**

Affects: all signed-in users (the core product audience)

---

### 5. [SURFACE] Double date display on home — top bar + masthead simultaneously

Where: `web/src/app/NavWrapper.tsx:597–605`, `web/src/app/page.tsx:307–321`

What's there: NavWrapper renders a centered date string in the top bar when `path === '/'` (e.g., "May 2, 2026" at 12px). The masthead directly below renders `today.humanDate` (e.g., "SATURDAY, MAY 2, 2026" at 11px uppercase). Both are visible simultaneously in the viewport on load.

Why it's below the bar: Two dates in close proximity signal either confusion or redundancy. The masthead date is the editorial dateline — it should own that role alone. The top bar date was likely added as a quick UX signal but doubles what's already said in the first 100px of content.

Fix: Remove the date from the NavWrapper top bar for the home route. The masthead dateline handles this role. The top bar on the home page already has the wordmark on the left; nothing is needed on the right beyond the Sign in / Search icon.

Severity: **off**

Affects: all users on desktop and tablet where both are visible simultaneously; less noticeable on mobile where the top bar is fixed and the masthead is below scroll fold

---

### 6. [SURFACE] No hero or card hover state — interactive elements feel inert

Where: `web/src/app/page.tsx:462–575, 577–648`

What's there: Hero and SupportingCard wrap all content in `<Link>` with `textDecoration: 'none', color: 'inherit'`. Inline styles can't express `:hover` pseudo-states. No CSS class-based hover is applied. On desktop, hovering over a card produces no visual feedback — no color shift, no underline, no shadow.

Why it's below the bar: Every other linked card surface in the product (Browse, Following, Bookmarks) has some hover feedback. The home feed's editorial cards are the primary navigation targets on the page; the absence of hover feedback makes them feel like static content, not interactive links.

Fix: Add a CSS class to the `<Link>` with a `:hover` rule in globals.css or a CSS module — e.g., a subtle background tint (`#fafafa`) on supporting cards, or a text-decoration underline on the title on hover. The hero could dim slightly on hover to signal clickability.

Severity: **off**

Affects: desktop users (hover is not applicable on touch)

---

### 7. [SURFACE] Hero title has no responsive font scaling — 40px on 320px screens

Where: `web/src/app/page.tsx:533–542`

What's there:
```js
fontSize: 40,
lineHeight: 1.1,
letterSpacing: '-0.02em',
```
No responsive breakpoint, no `clamp()`, no viewport-relative unit. On 320px iPhone SE (effective content width after 20px padding = 280px), a 40px serif title with tight leading fills the width with 2–3 words per line. Long headlines break into many lines.

Why it's below the bar: The article reader uses `clamp()` for its headline type. The hero headline is the most important typographic element on the page and should feel like a headline, not like a broken layout.

Fix: Replace with `fontSize: 'clamp(28px, 5.5vw, 40px)'` — shrinks on small viewports, caps at 40px on wide.

Severity: **off**

Affects: small phones (320–360px viewport width)

---

### 8. [SURFACE] `NewPill` component defined twice with inverted colors

Where: `web/src/app/page.tsx:365–387` (NewPill component), `web/src/app/page.tsx:511–530` (inline in Hero)

What's there: `NewPill` function uses `background: '#111111', color: '#ffffff'` (dark pill). The Hero inlines its own "New" badge with `background: '#ffffff', color: '#111111'` (light pill). Both render the same "New" label but with inverted colors.

Why it's below the bar: The inversion is functionally correct (dark pill on light cards, light pill on dark hero), but having two different implementations for the same semantic element is a maintenance risk. If the design of the "New" badge changes, both must be updated.

Fix: Refactor `NewPill` to accept a `dark` prop (same pattern as `LifecyclePill`) and reuse it in Hero: `<NewPill dark />`.

Severity: **refinement**

Affects: maintenance, design consistency

---

### 9. [SURFACE] `LifecyclePill` shows "Developing" in amber but `is_developing` flag is ignored

Where: `web/src/app/page.tsx:389–414`

What's there: `LifecyclePill` renders "Developing" (amber) for any `status` that isn't `'breaking'`. But the rendered value comes from `story.stories?.lifecycle_status`, not from `article.is_developing`. If a story's `lifecycle_status` is, say, `'active'` or `'closed'`, `LifecyclePill` would render it as a "Developing" pill with amber styling (since `isBreaking` would be false for anything other than `'breaking'`).

Why it's below the bar: `LifecyclePill` is a two-value component (Breaking = red, Developing = amber) but the prop it receives is a free-form `string | null`. Any non-`'breaking'` lifecycle_status (e.g. `'active'`, `'closed'`, `'archived'`) would render as a "Developing" amber pill, which is semantically wrong.

Fix: Add a guard: only render the pill when `status === 'breaking' || status === 'developing'`. Return null for any other value.

Severity: **off**

Affects: any card whose parent story has a lifecycle_status other than 'breaking' or 'developing'

---

### 10. [SURFACE] `timeShort` shows relative time but won't update — "5m ago" stays stale

Where: `web/src/app/_homeShared.ts:30–43`

What's there: `timeShort` computes relative time at server-render time. The result is baked into the static HTML. After hydration, `MetaLine` and `Hero` are server components with no re-render triggers. A user who leaves the tab open for an hour will still see "5m ago" for an article that is now "65m ago."

Why it's below the bar: Relative timestamps that don't update feel broken when users notice them. News sites typically update relative times client-side.

Fix: Move `MetaLine` to a client component with a periodic re-render (e.g., a 1-minute interval), or accept the limitation and render absolute timestamps ("3:42 PM") that don't become incorrect over time. Absolute timestamps would be more honest.

Severity: **refinement**

Affects: users who keep the home tab open; more noticeable on articles published in the last hour

---

### Persona walkthroughs

**First-time visitor (anonymous, arriving from a social share):**
She lands on the home page. The top bar logo appears after hydration. If a breaking story exists, the strip pops in ~400ms later and all content shifts down — her eye was already tracking the hero headline and the shift is disorienting. She reads the hero headline, clicks through to the article. On return, she scrolls to the bottom and sees the sign-up CTA — clear and functional. The experience is mostly functional but the layout shift and the dark-mode mismatch (she uses system dark mode) leave her with a slight "unpolished" impression.

**Daily signed-in reader:**
He opens the app each morning. The top bar shows the date, the masthead shows it again — minor friction. He reads the hero and a few supporting cards. He scrolls to the bottom expecting "that's it for today" and gets nothing — just the legal footer. He's left wondering if he missed something or if the page failed to load more. The non-scrolling, finite edition model he expects from the product's editorial framing isn't reinforced at all. With no date filter on the feed, on days without admin-pinned top stories, he might see yesterday's articles as today's hero.

---

### Device matrix

Phone: Functionally navigable; hero is large but readable; no hover states (expected); breaking strip CLS is most visible on a slow mobile connection.
Tablet: Two-date problem most visible here (both dates in viewport simultaneously); `100vw` hero breakout may or may not cause horizontal overflow depending on browser/OS scrollbar behavior.
Desktop: Horizontal scrollbar on long-content pages due to `100vw` without `overflow-x: hidden`; no hover states on article cards.
Dark mode: White feed body against dark nav and footer — highly visible mismatch; this is the worst experience on the page.
Dynamic type / accessibility settings: The `prefers-reduced-motion` global rule in globals.css collapses the `HomeFirstLoginMoment` fade to 0.01ms — accessibility handled correctly. Focus outlines are set globally. No `alt` text concerns (no images on this surface).

---

## Agent 6 — Connections

### Shared findings — where else they live

**Missing date filter on articles query**
Also affects: iOS Adult HomeView (`VerityPost/VerityPost/HomeView.swift`) — if it fetches articles without a date filter, it has the same non-edition behavior. iOS Kids `ArticleListView.swift` likely also fetches all published articles without a date gate.
How to verify: grep for `published_at` filters in HomeView.swift and ArticleListView.swift; check whether `.gte("published_at", ...)` appears.

**`href="#"` fallback for missing story slugs**
Also affects: F-02 (Article Reader) — `StoryArticlePicker` and `NextStoryFooter` components that render article links; I-04 (Browse) — article card links; S-14 (Category page) — article list links; I-08 (Following) — followed stories links. The `HomeStory.stories` join returning null is a data-model edge case that every article-link surface must handle.
How to verify: grep for `stories?.slug ? ` across `web/src/app/` and `web/src/components/`.

**Hardcoded colors bypassing the CSS variable theme system**
Also affects: The `_homeShared.ts` `HOME_COLORS` object is imported by `_HomeBreakingStrip`, `_HomeFooter`, `_HomeFetchFailed`. All three client islands use hardcoded hex values for their colors too. Any dark-mode fix to `HOME_COLORS` automatically propagates to all four files.
How to verify: grep for `HOME_COLORS` — all consumers are within the home feed module.

**`LifecyclePill` rendering any non-'breaking' status as "Developing"**
Also affects: F-02 (Article Reader) likely uses the same `LifecyclePill` component or its own version for story status rendering; check `web/src/components/article/ArticleSurface.tsx`. The pill guard fix (only render for 'breaking'/'developing') should be applied wherever `lifecycle_status` is rendered.
How to verify: grep `LifecyclePill` across `web/src/components/`.

---

### Patterns this page uses that other pages also use

- **Top-bar + masthead double-date** — unique to the home route (`topBarActive = path === '/'`), so not a cross-page pattern. But if similar per-route date logic is added elsewhere, the same double-display could recur.
- **`force-dynamic` + server Supabase + client island hydration** — this three-layer pattern (SSR data + client perm checks + `refreshIfStale`) is used on the article reader (F-02) and likely on other data-heavy pages. The CLS problem in the breaking strip is a consequence of this pattern applied incorrectly; any other page using client-side permission gating on above-the-fold elements has the same risk.
- **Cookie-based "last visit" state** — `vp_last_home_visit_at` is written by `HomeVisitTimestamp` and read by the server. This pattern doesn't appear elsewhere currently, but the cookie architecture is reusable.
- **`editorialToday()` utility** — only used on this page. If a "daily digest" email or other "today's edition" surface is ever built, this function is the right extraction point.

---

### Cross-platform parity

**iOS Adult (F-04 HomeView):**
- If HomeView.swift fetches articles without a date filter, it has the same edition model gap as the web home. Verify whether `HomeView.swift` uses a `gte` filter on `published_at`.
- iOS doesn't have a "breaking strip" equivalent exposed as a separate UI surface — breaking is conveyed through the `is_breaking` article attribute on the card. The web/iOS breaking indicator representations are already split.
- Dark mode: iOS HomeView uses SwiftUI's `@Environment(\.colorScheme)` or system colors — almost certainly handles dark mode correctly by default. The web home is the outlier here.
- The "end of feed" experience is likely similar: SwiftUI list ends where it ends.

**iOS Kids (F-06 ArticleListView):**
- `ArticleListView.swift` is a flat list of articles — no edition model by design (kids content is evergreen). The missing date filter is not applicable there.

---

### Pages that would break if this changes

- **A-27 (Top Stories Pinning)** — directly controls `top_stories` table, which drives `displayedStories`. If the home feed query is changed to filter by date, the pinned top stories query must also be verified to return articles within the date window (or be exempt from the filter).
- **`_homeShared.ts` consumers** — `HomeBreakingStrip`, `HomeFooter`, `HomeFetchFailed` all import `HOME_COLORS`. A refactor of `HOME_COLORS` to CSS variables must propagate to all three islands.
- **`vp_last_home_visit_at` cookie** — read server-side in `page.tsx:173`. If the cookie name or format changes, both the server read and the `HomeVisitTimestamp` client write must change atomically.

---

### Pages that should be re-reviewed because of what was found here

- **F-04 (iOS Home Feed)** — verify date filter on the articles query and the breaking story indicator logic.
- **F-02 (Article Reader)** — verify `LifecyclePill` handling; verify `href="#"` fallback behavior on story card links.
- **I-04 (Browse)** — verify `href="#"` fallback and article card link patterns.
- **S-14 (Category Page)** — same.

---

### Cross-page worklist additions

- The `_HomeBreakingStrip` CLS fix (render strip immediately, gate only the timestamp) should be verified against any other surface that renders a permission-gated element above the fold — particularly the article reader's paywall and expert-answer buttons. These may have the same null-until-perms-hydrate pattern.
- The NavWrapper `topBarActive` date display should be audited: it was added specifically for the home route but is a NavWrapper behavior, meaning it could affect any future route that sets `path === '/'` in testing or Storybook.
