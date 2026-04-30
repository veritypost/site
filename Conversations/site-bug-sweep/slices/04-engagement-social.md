# Slice 04 — Reader Engagement & Social

**Status:** shipped
**Investigation session:** 7 (2026-04-30)
**Adversarial review:** complete

---

## Surfaces covered

- `web/src/app/bookmarks/page.tsx`
- `web/src/app/following/page.tsx`
- `web/src/app/notifications/page.tsx`
- `web/src/app/u/[username]/page.tsx`
- `web/src/app/leaderboard/page.tsx`
- `web/src/app/expert-queue/page.tsx`
- `web/src/app/recap/page.tsx`
- `web/src/app/api/bookmarks/route.js`
- `web/src/app/api/bookmarks/[id]/route.js`
- `web/src/app/api/follows/route.js`
- `web/src/app/api/notifications/route.js`
- `web/src/app/api/notifications/[id]/read/route.js`

---

## Issues

### 04-01 (P1) — Expert queue action buttons: no per-action loading state

**Status:** shipped (`5cbc050`)

**Files:**
- `web/src/app/expert-queue/page.tsx:362` — Claim button
- `web/src/app/expert-queue/page.tsx:365` — Decline button
- `web/src/app/expert-queue/page.tsx:490` — Post answer button
- `web/src/app/expert-queue/page.tsx:610` — Post back-channel button

**What's broken:** All four buttons call async handlers (`handleClaim`, `handleDecline`, `handleAnswer`, `postBackMessage`) but remain enabled during the in-flight request. Double-click fires duplicate API calls. Expert-queue actions are consequential (session claims, answer submissions) — duplicate fires are an operational bug, not just UX noise.

The Post answer and Post back-channel buttons are disabled when the text field is empty, but not during an in-flight request — a user can click Post, wait a moment, and click again before the first request resolves.

**Fix plan:**
1. Add a `pendingAction` state (or a `Set<string>` of pending IDs for per-item gating).
2. On Claim/Decline: disable that item's buttons while the action is in-flight; re-enable on resolve/reject.
3. On Post answer: additionally disable while `handleAnswer(id)` is awaiting; re-enable after.
4. On Post back-channel: disable `postBackMessage` button while awaiting; re-enable after.
5. Update the `btn()` helper (see 04-06) so disabled state is visually legible.

---

### 04-02 (P2) — Bookmarks delete: double-fire on rapid click

**Status:** shipped (`6577e76`)

**File:** `web/src/app/bookmarks/page.tsx:629-642`

**What's broken:** The Remove button (`onClick={() => removeBookmark(b)}`) has no disabled/loading state. The undo-delete pattern starts a 5-second timer on each click; rapid clicks before the first timer fires each queue a new timer, causing multiple DELETE requests to fire for the same bookmark.

Note: `removeBookmark()` immediately calls `setItems(filter)` which removes the button from the DOM. Rapid clicks must land before that state update propagates. Adding a `deletingId` guard closes the race.

**Fix plan:**
1. Add `const [deletingId, setDeletingId] = useState(null)`.
2. At the top of `removeBookmark(b)`: if `deletingId === b.id`, return early.
3. Before `setItems(filter)`: call `setDeletingId(b.id)`.
4. Clear `deletingId` when the undo timer resolves, is cancelled, or the item is restored.
5. Add `disabled={deletingId === b.id}` to the Remove button.

---

### 04-03 (P2) — Notifications markAllRead: double-fire

**Status:** shipped (`d47bc60`)

**File:** `web/src/app/notifications/page.tsx:354`

**What's broken:** "Mark all read" button has no loading or disabled state. Each click fires a new PATCH to mark all notifications read while prior requests are still in flight. Individual notification mark-read uses fire-and-forget sendBeacon and is fine; only the bulk action is affected.

**Fix plan:**
1. Add `const [markingAll, setMarkingAll] = useState(false)`.
2. In `markAllRead()`: set `markingAll(true)` before the fetch, `markingAll(false)` in `finally`.
3. Add `disabled={markingAll}` to the button at line 354.

---

### 04-04 (P2) — Following page: fetch errors silently become empty state

**Status:** shipped (`4412bec`)

**File:** `web/src/app/following/page.tsx:64-68, 82-88`

**What's broken:** Both queries destructure only `data` and discard the Supabase `error` return:
- Line 64: `const { data: logRows } = await supabase.from('reading_log').select(...)`
- Line 82: `const { data: storyRows } = await supabase.from('stories').select(...)`

A network failure or permission error produces `data: null` + a non-null `error`. The page renders `setStories([])` and shows the empty-state message ("Stories you've read articles from will appear here...") — indistinguishable from legitimately having no followed activity. No retry is offered.

**Fix plan:**
1. Destructure `error` from both queries.
2. If either `error` is non-null, call `setError(error.message)` (or a fixed string) and return early from the load function.
3. The page already has a `const [error, setError] = useState(null)` or equivalent — if not, add one.
4. Render `<ErrorState>` with a retry callback when `error` is set.

---

### 04-05 (P3) — Recap: fetch error silently swallowed

**Status:** shipped (`ae6eb00`)

**File:** `web/src/app/recap/page.tsx:112-123`

**What's broken:** The fetch at line 113 ends with `.catch(() => ({}))`. Any network error or non-200 response from `/api/recap` resolves as an empty object. The page subsequently renders the "No recaps ready yet" empty state. Users cannot distinguish a transient server error from having no data. No error state is tracked or displayed.

**Fix plan:**
1. Replace the `.catch(() => ({}))` with a try/catch block.
2. Add `const [fetchError, setFetchError] = useState(null)`.
3. On catch: `setFetchError(message)` instead of swallowing.
4. Render `<ErrorState>` with retry when `fetchError` is set (before the empty-state check).

---

### 04-06 (P3) — Expert queue disabled-button CSS: disabled state invisible

**Status:** shipped (`5cbc050`)

**File:** `web/src/app/expert-queue/page.tsx:623-644`

**What's broken:** The `btn()` helper (line 623) returns `cursor: 'pointer'` unconditionally. When a button has `disabled={true}`, the browser's default `cursor: not-allowed` is overridden — buttons appear interactive when they are not. `btn()` is local to `expert-queue/page.tsx` only; modifying it cannot regress other pages.

**Fix plan:**
1. Add an optional `disabled` parameter to `btn()`:
   ```ts
   function btn(color: string, disabled = false): CSSProperties {
     return {
       ...existing properties...,
       cursor: disabled ? 'not-allowed' : 'pointer',
       opacity: disabled ? 0.5 : 1,
     };
   }
   ```
2. Update all four button callsites (lines 362, 365, 490, 610) to pass the disabled state expression as the second argument.
3. Implement 04-06 in the same commit as 04-01 since both touch the same four buttons.

---

## Won't-fix

### Follows API — ownership verified only at RPC boundary

**File:** `web/src/app/api/follows/route.js:42-45`

**Why wont-fix:** The route calls `toggle_follow(p_follower_id: user.id, p_target_id: target_user_id)`. The `user.id` is auth-derived and cannot be spoofed. The route already enforces `requirePermission('profile.follow')` at line 14, gating non-paid users. The `target_user_id` parameter is the follow target — correct behavior, not impersonation. Adversarial review confirmed there is no second user ID in the request that could be substituted to follow as someone else. Adding a redundant API-layer check would test a threat vector that doesn't exist in this shape.

---

## Clean surfaces (no bugs found)

- **Bookmarks page:** correct `b.articles?.stories?.slug` slug pattern; loading, error, and empty states all present; FK hints `fk_bookmarks_article_id` and `fk_articles_category_id` verified correct.
- **Bookmarks API:** DELETE verifies `user_id = auth user` before deleting; PATCH verifies ownership before writing; POST handles duplicate via `deduped: true` (no constraint error).
- **Notifications API:** PATCH scoped to `user_id = auth user`; mark-read verifies `user_id` before write. No FK hints.
- **Following page:** article links use correct `/<slug>` pattern (not `/story/<slug>`); empty state present.
- **Notifications page:** anon CTA renders for unauthenticated visitors; loading skeleton present; error state present; individual mark-read uses fire-and-forget sendBeacon correctly.
- **Public profile (`/u/[username]`):** reads only `public_profiles_v`; no private fields exposed; `notFound()` called for missing username; private/hidden profiles rejected for non-self viewers. FK hints `fk_follows_follower_id` and `fk_follows_following_id` verified correct.
- **Leaderboard:** anon CTA present (shows top 3, gated modal for full list); loading and error states present; all queries bounded (`.limit(50)` or `.limit(3)` for anon).
- **Expert queue:** permission gate correct (`expert.queue.view`); rejection UI for non-experts present; loading and error states present.
- **Recap:** empty state present; launch-hide gate correct; paywall for non-entitled users present; loading state present.
- **Follows API:** no FK hints (uses RPC).
- **Notifications API:** no FK hints.
