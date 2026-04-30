# Slice 03: Article reading

**Status:** shipped
**Investigated:** 2026-04-30 (session 5)
**Adversarial review:** 2026-04-30 (session 5)
**Implementation:** 2026-04-30 (session 6)

---

## Scope

Everything the reader sees after navigating to a story: `web/src/app/[slug]/page.tsx`, `ArticleSurface`, `SourcesSection`, `TimelineSection`, `ArticleEngagementZone`, `ArticleQuiz`, `ArticleTracker`, `CommentThread`, `CommentComposer`, `CommentRow`, and the API routes at `api/comments/`, `api/quiz/`, and `api/events/batch`.

This is the first systematic verification of the article-lifecycle implementation (sessions 8–10, 2026-04-29).

---

## Confirmed clean

The following areas were investigated and found correct:

- **Quiz flow:** Pool-exhaustion code fully stripped; `selected_answer` sent as option text (not index); `user_passed_article_quiz` RPC takes `article_id` UUID; `ArticleEngagementZone` correctly mounted with all required props; quiz doesn't mount when `hasQuiz=false`; null guards present throughout.
- **T300 realtime fix:** Both initial load AND realtime inserts in `CommentThread.tsx` use `public_profiles_v` — not `users!user_id(...)` which 403s for non-admins. Fix confirmed end-to-end (lines 121–165, 266–289, 314–335).
- **Comment lock/unlock:** Composer shows "Pass the quiz to join the discussion." when `quizPassed=false` (`CommentComposer.tsx:221–235`); unlocks in-place via parent state without page reload (`ArticleEngagementZone.tsx:21–26`).
- **Expert badge + blur paywall:** Expert badge renders (`CommentRow.tsx:243–256`); blur with `filter: blur(6px)` and overlay CTA for non-pro (`CommentRow.tsx:317–340`).
- **Notification URLs:** `post_comment` RPC uses `/<slug>` not `/story/<slug>` (migration `2026-04-29_slice06_fix_post_comment_rpc.sql:115,151`).
- **post_comment story_id:** RPC sets `story_id` on insert via LEFT JOIN to `stories` table (migration SQL:77–90).
- **events/batch auth:** Route is anon-allowed by design (`route.ts:248–260`); sendBeacon on tab-hide works correctly — no silent auth drops.
- **Quiz FK sweep:** No FK hint `!` syntax in `api/quiz/start/route.js` or `api/quiz/submit/route.js`.
- **SourcesSection + TimelineSection null guards:** Both return `null` on empty arrays (`SourcesSection.tsx:51`, `TimelineSection.tsx:99`).
- **stories.slug resolution:** Page queries `stories` table directly with `.eq('slug', slug)` (`page.tsx:66–68`); no reference to `articles.slug`.

---

## Issues

### 03-00 — P0 — No try/catch on article page main data fetch

**Status:** shipped — `fee1eb5`

**File:** `web/src/app/[slug]/page.tsx:126–163`

`Promise.all()` covering six parallel fetches (permission checks, quiz count, quiz pass status, sources, timeline) has no try/catch wrapper. Any thrown exception — network failure, RPC error, unexpected null — produces an unhandled rejection that surfaces as a Next.js 500 page. There is no `error.tsx` inside `web/src/app/[slug]/` (only `loading.tsx` and `not-found.tsx` exist). The only fallback is the root-level `web/src/app/error.js`, which is generic. The home page had the identical pattern and was fixed in session 4 (commit `2ce74ae`).

**Fix plan:**
- Declare typed holders for all six data sets as `let` with safe defaults before the try block.
- Wrap `page.tsx:126–163` in `try { ... } catch (e) { console.error('[article.fetch]', e); fetchFailed = true; }`.
- Add `let fetchFailed = false` before the block.
- Render a user-visible error state (equivalent to `<HomeFetchFailed />` from the home page fix) when `fetchFailed` is true.
- This also subsumes issue 03-05 (see below), because the try/catch will catch thrown errors; `.error` field checks handle the non-throwing Supabase failure path separately.

---

### 03-01 — P1 — ArticleTracker sentinels are document-relative, not article-relative

**Status:** shipped — `9afd119`

**File:** `web/src/components/article/ArticleTracker.tsx:41`

Sentinels are placed at `${pct}vh` from `document.body`, using viewport height as a proxy for article depth. For a short article (e.g. 60vh tall), the 75% sentinel fires after the reader has scrolled well past the article. For a long article (e.g. 300vh), the 25% sentinel fires before the reader is 10% through the content. All `scroll_depth` and `article_read_complete` events in `article_events` are systematically wrong. Confirmed at `ArticleTracker.tsx:41` (comment at line 39 acknowledges it is a proxy, not the real measurement).

**Fix plan:**
- Add a `data-article-body` or `ref`-based handle to locate the article element in the DOM.
- Compute `articleTop = el.getBoundingClientRect().top + window.scrollY` and `articleHeight = el.offsetHeight` after mount.
- Place each sentinel at `articleTop + (pct / 100) * articleHeight` instead of `${pct}vh`.
- Guard against `articleHeight === 0` (e.g. before first paint) by re-computing in a `ResizeObserver` callback.
- Sentinels still appended to `document.body`; only the `top` value changes.

---

### 03-02 — P1 — Wrong FK hint in comments POST response query

**Status:** shipped — `8166fde`

**File:** `web/src/app/api/comments/route.js:185`

The POST response query uses `users!user_id(id, username, ...)`. Per `web/src/types/database.ts`, the `comments → users` relationship has `foreignKeyName: "fk_comments_user_id"`. The correct hint is `users!fk_comments_user_id(...)`. The schema uses `fk_` prefixed names; `!user_id` is not a valid FK constraint name and PostgREST will fail the relation lookup silently, returning no author data in the response. Two callers in the codebase use the correct form: `web/src/app/admin/reports/page.tsx:185–186` and `web/src/app/api/expert/queue/route.js`.

The comment itself is still saved — this is a POST response corruption bug, not a write bug. The client's optimistic update may render the new comment without author data or silently show a broken state.

**Fix plan:**
- `web/src/app/api/comments/route.js:185`: change `users!user_id(` to `users!fk_comments_user_id(`.
- One character change; no other callers affected.

---

### 03-03 — P2 — Timeline fetch excludes `type='article'` entries

**Status:** shipped — `9df8ca5`

**File:** `web/src/app/[slug]/page.tsx:161`

The timeline query hardcodes `.eq('type', 'event')`. The `timelines` table schema defines `type` as `'event' | 'article'` — `type='article'` rows link to related articles in the timeline spine. Those rows are never fetched and never displayed. If any `type='article'` timeline entries exist in the DB, they are silently dropped and the timeline renders with gaps.

**Fix plan:**
- Remove the `.eq('type', 'event')` filter from the timeline query at `page.tsx:161`.
- Verify `TimelineSection.tsx` handles `type='article'` entries — if it doesn't, that rendering logic must also be added.
- If `TimelineSection.tsx` only renders `type='event'`, the filter removal alone is not sufficient; both must be updated together.

**Note:** If no `type='article'` timeline entries currently exist in production data, this is a latent bug (future data would silently disappear). Verify via DB query before implementation if in doubt.

---

### 03-04 — P2 — `incrementViewCount` failure silently swallowed with no logging

**Status:** shipped — `9df8ca5`

**File:** `web/src/app/[slug]/page.tsx:175`

`.catch(() => {})` with an empty catch body. When the RPC fails, the failure is invisible — no log line, no observable signal. View count data is quietly lost with no way to detect or diagnose the failure.

**Fix plan:**
- Change `.catch(() => {})` to `.catch((e) => { console.error('[article] incrementViewCount failed', e); })`.
- Fallback behavior (page continues rendering) unchanged.

---

### 03-05 — P2 — Supabase result `.error` fields not checked before accessing `.count` / `.data`

**Status:** shipped — `fee1eb5`

**File:** `web/src/app/[slug]/page.tsx:167–170`

Supabase query errors are returned as `{ data: null, error: {...} }` — they do not throw, so they bypass the try/catch added for 03-00. Accessing `.count` or `.data` on a result that returned `{ data: null, error }` yields `undefined`, which silently corrupts downstream logic (e.g. `quizCount` might be `undefined` rather than `0`, affecting the `hasQuiz` prop passed to `ArticleEngagementZone`).

**Fix plan:**
- After the try/catch block, add `.error` checks for the quiz count and quiz pass status results.
- If `quizzesResult.error` is truthy, default `quizCount` to `0` and log `[article] quiz count query failed`.
- If `quizPassResult.error` is truthy, default `initialPassed` to `false` and log `[article] quiz pass query failed`.

---

### 03-06 — P3 — Invalid `?a=` deep-link param silently falls through to first article

**Status:** shipped — `291b354`

**File:** `web/src/app/[slug]/page.tsx:119`

`found.articles.find((a) => a.id === searchParams.a) ?? found.article` — if the article ID doesn't match any article in the story (deleted article, wrong UUID, stale share link), the page silently renders the first article. No 404, no user feedback, no query param cleanup. A user following a broken share link sees the wrong article with no indication.

**Fix plan (minimal):**
- If `searchParams.a` is present and `found.articles.find(...)` returns `undefined`, strip the `?a=` param from the URL via a redirect to `/<slug>` (using `redirect()` from `next/navigation`).
- This gives a clean canonical URL and shows the most recent article without the confusing ghost param.
- Alternative (wont-fix): silent fallback is acceptable for a share link that pointed to a deleted article. Discuss with owner if the redirect adds unacceptable complexity.

---

## Wont-fix

### `userTier` prop in ArticleQuiz — dead prop

`web/src/components/article/ArticleQuiz.tsx` declares `userTier?: string` in its props interface but never destructures or reads it anywhere in the component body. `ArticleEngagementZone` does not forward `currentUserTier` to `ArticleQuiz`. No functionality is affected — the prop is inert. No fix needed.

---

## Implementation notes

- Fix order: 03-00 first (P0, crash risk), then 03-02 (P1, live data corruption), then 03-01 (P1, analytics), then 03-03/04/05 together (all touch `page.tsx`), then 03-06 last.
- 03-00 and 03-05 both touch `page.tsx` — implement together in one commit.
- 03-01 touches only `ArticleTracker.tsx` — one commit.
- 03-02 touches only `api/comments/route.js` — one commit.
- 03-03, 03-04 touch `page.tsx` — combine with 03-05 commit.
- TypeScript check after each commit.
