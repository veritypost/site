---
wave: A
group: 13 (UI Smoke Test — Adult Web)
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Wave A, Group 13, Agent 3

## CRITICAL

### F-A13-3-01 — Story page useEffect missing supabase dependency
**File:line:** `web/src/app/story/[slug]/page.tsx:455-637`
**Evidence:**
```
Line 455: useEffect(() => {
  // Uses supabase.from(), supabase.rpc() throughout
  // ...multiple queries on supabase object...
}, [slug]);  // ← missing supabase in dependency array
```
Lint warning: `637:6 Warning: React Hook useEffect has a missing dependency: 'supabase'`
**Impact:** Stale closure — if supabase client is recreated (rare but possible in dev), the effect runs against the old instance. Comments, quiz status, timeline, sources, bookmarks may fail silently or show wrong data after auth state changes.
**Reproduction:** Code inspection confirmed. Runtime: load article, swap auth state mid-session, supabase ref becomes stale.
**Suggested fix direction:** Add `supabase` to dependency array; wrap supabase creation in useMemo() to prevent infinite loops.
**Confidence:** HIGH

### F-A13-3-02 — Story page event tracking useEffect missing dependencies
**File:line:** `web/src/app/story/[slug]/page.tsx:642-656`
**Evidence:**
```
656: }, [story?.id, quizPoolSize, trackEvent]);
     // But the effect USES:
     //   story.slug (line 650)
     //   story.author_id (line 649)
     //   story.is_breaking (line 652)
     //   story.categories?.slug (line 648)
```
Lint warning: `656:6 Warning: React Hook useEffect has missing dependencies: 'story.author_id', 'story.categories?.slug', 'story.is_breaking', and 'story.slug'`
**Impact:** Stale data in page_view telemetry — author_id, category_slug, is_breaking and article slug sent to tracking may reflect an old article state. Analytics data corrupted.
**Reproduction:** Edit article mid-session while reader is on the page, category or author changes, event fires with old values.
**Suggested fix direction:** Include all accessed properties in dependency array: `[story?.id, story?.slug, story?.author_id, story?.categories?.slug, story?.is_breaking, quizPoolSize, trackEvent]`.
**Confidence:** HIGH

### F-A13-3-03 — Messages page multiple useEffect hooks missing dependencies
**File:line:** `web/src/app/messages/page.tsx:261-263`
**Evidence:**
```
261: useEffect(() => {
262:   loadMessages();  // ← function is missing from dependency array
263: }, []);
```
Lint warnings:
```
263:6 Warning: useEffect missing dependency: 'loadMessages'
324:6 Warning: useEffect missing dependencies: 'currentUser', 'dmReceiptsEnabled', 'supabase'
350:6 Warning: useEffect missing dependencies: 'currentUser', 'supabase'
380:6 Warning: useEffect missing dependencies: 'currentUser', 'supabase'
410:6 Warning: useEffect missing dependencies: 'currentUser', 'supabase'
```
**Impact:** Multiple stale closure risks in messages feature:
- Line 263: messages never reload if loadMessages function is recreated
- Lines 324, 350, 380, 410: user context (currentUser, supabase, dmReceiptsEnabled) may be stale, causing silent failures when loading conversations, receipts, or read-status updates
**Reproduction:** Code inspection confirmed. Runtime: send a message, switch users or reconnect, messages state may not sync.
**Suggested fix direction:** Declare all function/state dependencies. Wrap functions in useCallback() if they must be stable. Consider refactoring to useReducer or external state manager.
**Confidence:** HIGH

## HIGH

### F-A13-3-04 — Comment composer permission check races permission refresh
**File:line:** `web/src/components/CommentComposer.tsx:43-49`
**Evidence:**
```javascript
useEffect(() => {
  (async () => {
    await refreshAllPermissions();
    await refreshIfStale();
    setCanPost(hasPermission(parentId ? 'comments.reply' : 'comments.post'));
    setCanMention(hasPermission('comments.mention.insert'));
    setPermsLoaded(true);
  })();
}, [parentId]);
```
**Impact:** If parentId changes mid-composition, permissions refresh but user sees UI flicker or a brief moment where canPost flag is stale. Not security-critical (server-side RPC enforces anyway) but UX jarring.
**Reproduction:** Open reply composer, change parent comment ID via URL manipulation or hot-reload, canPost toggle may lag.
**Suggested fix direction:** Debounce parentId changes or pre-load permissions on first mount, not per-parentId.
**Confidence:** MEDIUM (UX issue, not a security gap)

### F-A13-3-05 — Settings page missing dependency lint warnings
**File:line:** `web/src/app/profile/settings/page.tsx`
**Evidence:**
```
ESLint reports:
61:8  Warning: 'SkeletonRow' is defined but never used
2083:3  Warning: 'userId' is defined but never used
2252:3  Warning: 'authEmail' is defined but never used
```
**Impact:** Dead code accumulation; suggests incomplete refactoring. Variables extracted but not used — may indicate old feature code left behind.
**Reproduction:** Code inspection — grep confirms zero usage of SkeletonRow, userId, authEmail in rendered output.
**Suggested fix direction:** Remove unused imports/variables or add TODOs if intentionally reserved.
**Confidence:** MEDIUM (code smell, not functional defect)

## MEDIUM

### F-A13-3-06 — Comment display after post unclear on realtime vs initial fetch
**File:line:** `web/src/components/CommentThread.tsx:92-186`
**Evidence:**
```typescript
const loadAll = useCallback(async () => {
  // Fetches all comments for article
  // ...
  setComments(rowsSafe);
}, [articleId, articleCategoryId, currentUserId, canViewScore, supabase]);

useEffect(() => {
  if (!permsLoaded) return;
  loadAll();
}, [loadAll, permsLoaded]);

useEffect(() => {
  // Realtime subscription for new comments (INSERT/UPDATE events)
  if (!articleId || !canSubscribe) return;
  // ...
}, [articleId, canSubscribe, supabase]);
```
**Impact:** If the initial fetch completes slowly (>1-2 sec), realtime events may arrive before initial comment list loaded, causing brief out-of-order display or duplicate attempts. Not critical but can confuse users about comment ordering.
**Reproduction:** Simulate slow network on loadAll fetch, post a comment in another tab mid-fetch, check if the new comment appears twice or in wrong order.
**Suggested fix direction:** Add a "loading" gate in realtime handler; defer realtime subscription until initial load completes.
**Confidence:** MEDIUM

## LOW

### F-A13-3-07 — ArticleQuiz exhaustive-deps warning not present in lint
**File:line:** `web/src/components/ArticleQuiz.tsx:83-86`
**Evidence:**
```javascript
const canStart = hasPermission('quiz.attempt.start');
const canRetake = hasPermission('quiz.retake');
const isPaid = hasPermission('quiz.retake.after_fail');
const seeInterstitialAd = !hasPermission('article.view.ad_free');
// No useEffect dependency on hasPermission — called inline in render
```
**Impact:** These calls happen at render-time (not in useEffect), so they re-evaluate on every render. If hasPermission is expensive or has side-effects, this could cause perf issues. Lint does not flag this as exhaustive-deps warning because there is no hook to flag.
**Reproduction:** Profile render time on ArticleQuiz mounting, check if hasPermission calls are a bottleneck.
**Suggested fix direction:** Memoize hasPermission results or cache at component init; consider moving to useEffect if data-dependent.
**Confidence:** LOW (perf concern, not correctness)

### F-A13-3-08 — Settings page lingering eslint-disable comment without justification
**File:line:** `web/src/app/profile/settings/page.tsx:566-567`
**Evidence:**
```javascript
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```
**Impact:** The comment justifies the disable, but it's unclear if it's truly correct. If dependencies ARE needed, this hides the warning. Best practice: use a proper dependency or document why empty array is safe (e.g., "intentional one-time init").
**Reproduction:** Review the entire effect to confirm no state updates need re-triggering.
**Suggested fix direction:** Add explicit comment explaining why no dependencies are safe, or refactor to extract dependencies properly.
**Confidence:** LOW

## UNSURE

### F-A13-3-09 — Could not fully test comment flow end-to-end
**Evidence:** Dev server requires `.env.local` with Supabase credentials. Unable to start dev server on localhost:3000 to manually test:
- Article → Quiz → Comment submit → persistence flow
- Settings page mutations (save/revert/load each tab)
- Role-based visibility per free/paid/admin users
**Info needed:** Authorization to create .env.local or temporary dev instance to exercise UI interactively.
**Suggested next step:** Provide .env.local or a test instance; re-run full manual smoke test with real browser.
**Confidence:** N/A — unable to reproduce interactively

---

## Summary

**Five critical/high lint warnings** directly correlate with "stale state on re-render" (per PM punchlist, quoted: "33+ `next lint` warnings...react-hooks/exhaustive-deps...stale-closure risk — these directly correlate with 'weird UI shit'"):

1. Story page missing `supabase` → comment/quiz data fetch may use stale client
2. Story page event tracking missing `story.slug`, `story.author_id`, etc. → corrupted telemetry
3. Messages page six useEffect hooks missing dependencies → silent message sync failures
4. Comment composer permission check races permission state → UI lag on reply toggle
5. Settings page unused code → code smell suggesting incomplete refactoring

**Code reading only** — unable to start dev server to verify UI-COMMENTS and UI-SETTINGS interactive flows without `.env.local`. Server-side API routes appear correctly gated (requirePermission enforced at POST /api/comments:19), but client-side state management has closure gaps that could manifest as "not saving or showing" under race conditions.

**Recommendation:** Prioritize react-hooks/exhaustive-deps fixes before launch. These are the highest-leverage findings per the PM punchlist signal.
