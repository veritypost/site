---
wave: A
group: 3 (Article + Comments + Quiz)
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Comments & Quiz Gate, Wave A, Agent 3

## CRITICAL

### F-A3-01 — RLS policy mismatch blocks comment visibility after post
**File:line:** 
- `schema/reset_and_rebuild_v2.sql:3803-3804` (RLS policy)
- `schema/013_phase5_comments_helpers.sql:136-137` (INSERT statement)

**Evidence:**
```
RLS Policy (line 3803-3804):
CREATE POLICY "comments_select" ON "comments" FOR SELECT USING (
  (status = 'published' AND deleted_at IS NULL)
  ...
);

post_comment RPC (line 136-137):
VALUES
  (..., v_body,
   v_mentions, 'visible')
```

**Impact:** Comments are inserted with `status='visible'` but RLS only allows selecting rows where `status='published'`. This blocks the owner from seeing their own comment after posting. After refresh, comments never appear because even the direct `.select(...).eq('article_id', articleId)` in CommentThread respects RLS, and the RLS policy requires `status='published'` (status='visible' rows silently fail).

Visible to: authenticated comment author on their own comment + mods who check (`is_mod_or_above()`).
Silent failure: anon viewers, the posting user refreshing the page, any non-mod reader of the thread.

**Reproduction:** 
1. Load article, pass quiz (3/5), auth'd
2. Write comment in composer, click Post
3. API returns the comment object (line 78 in route.js)
4. Composer calls `onPosted(data.comment)` (CommentComposer.tsx:118)
5. handlePosted adds comment to state (CommentThread.tsx:451–453)
6. Comment appears briefly in UI (from client state)
7. Refresh the page
8. `loadAll()` query runs (CommentThread.tsx:92–104)
9. RLS silently filters: only `status='published'` rows pass the SELECT gate
10. `status='visible'` comment is hidden; thread looks empty or incomplete

**Suggested fix direction:** Change `post_comment` RPC to insert `'published'` instead of `'visible'`, or update RLS policy to accept `'visible'` (check product definition for intended status enum values).

**Confidence:** HIGH

---

## HIGH

### F-A3-02 — Comment votes persist in DB but fail RLS SELECT after post due to status mismatch
**File:line:** 
- `web/src/app/api/comments/[id]/vote/route.js:71–101` (toggle_vote RPC call)
- `schema/reset_and_rebuild_v2.sql:3819–3823` (comment_votes RLS)
- `schema/013_phase5_comments_helpers.sql:200–235` (toggle_vote RPC)

**Evidence:**
```
toggle_vote RPC allows any quiz-passed user to vote on the comment (line 187 check).
Vote is inserted/updated in comment_votes table (line 71).
Returns new counts {up, down, your_vote} to the client (line 101).
However, to see the comment being voted on, the voter must pass:
  comments_select RLS → status='published' AND deleted_at IS NULL
```

**Impact:** An author posts a comment (status='visible'). A reader upvotes it. The upvote RPC succeeds (status check is on the comments row itself, which exists). Vote count increments in the DB. But when the reader's client fetches comments, RLS hides the 'visible' comment, so the vote never appears. Vote data is orphaned—present in the DB but invisible via normal queries.

**Reproduction:** Same as F-A3-01, but with a second user voting.

**Suggested fix direction:** Same as F-A3-01; voting is a symptom of the root status mismatch.

**Confidence:** HIGH

---

### F-A3-03 — Comment author's edits and deletes bypass RLS write gates but don't apply to deleted/hidden comments
**File:line:** 
- `web/src/app/api/comments/[id]/route.js:29–36` (PATCH edit), `40–63` (DELETE)
- `schema/reset_and_rebuild_v2.sql:3811–3814` (RLS update/delete)
- `schema/013_phase5_comments_helpers.sql:250–380` (edit_comment, soft_delete_comment RPCs)

**Evidence:**
```
RLS for UPDATE (line 3811–3813):
CREATE POLICY "comments_update" ON "comments" FOR UPDATE USING (
  user_id = auth.uid() OR public.is_mod_or_above()
);

RLS for DELETE (line 3814):
CREATE POLICY "comments_delete" ON "comments" FOR DELETE USING (
  user_id = auth.uid() OR public.is_mod_or_above()
);
```

**Impact:** Author can PATCH/DELETE their own comment by ownership check alone. But if the comment has `status='visible'` (and RLS blocks SELECT), the author never sees the edit/delete UI controls, because CommentRow re-renders based on the filtered comment list from loadAll(). The visible/published mismatch prevents the author from discovering they can edit/delete.

Non-blocking from a permission standpoint (the RPC will execute), but creates UX dead-end.

**Reproduction:** Comment author posts a comment, it's stuck in status='visible', refresh, no comment row appears → no menu to click → can't edit/delete even though they own it.

**Suggested fix direction:** Ensure comment reaches 'published' state consistently, or change RLS to recognize both statuses as "viewable by owner".

**Confidence:** HIGH

---

## MEDIUM

### F-A3-04 — Quiz pass check is expensive, cached but stale on role/permission changes
**File:line:** 
- `web/src/app/story/[slug]/page.tsx:552–565` (user_passed_article_quiz RPC call)
- `web/src/components/CommentThread.tsx:84–90` (refreshAllPermissions, refreshIfStale)
- `schema/013_phase5_comments_helpers.sql:72–150` (post_comment enforces quiz check again)

**Evidence:**
```
page.tsx calls user_passed_article_quiz RPC once on load (line 553).
If RPC fails, sets quizPassError=true (line 559), renders lock panel with Retry button (line 970–977).
CommentThread independently calls refreshAllPermissions (line 86), refreshIfStale (line 87).
But quiz pass status is checked via RPC, not in the permissions layer.
If the status becomes stale (e.g., quiz attempt is invalidated server-side), the client doesn't re-check until page reload.
```

**Impact:** User passes quiz, comments unlock. If an admin revokes/resets their quiz attempt server-side (e.g., for audit), the client still believes they passed until next page load. They can submit a comment, which succeeds if the RPC runs, but if the attempt was deleted, post_comment RPC will fail with "quiz not passed" midway through a user's compose flow.

Silent failure risk: if checkRateLimit succeeds but post_comment's quiz check fails, the user sees "Could not post comment" (line 116 in route.js) without knowing why.

**Reproduction:** 
1. User passes quiz, comments visible
2. Admin manually deletes the quiz_attempt row for user+article
3. User composes and posts (composer still shows because canPost was cached)
4. API rejects with "quiz not passed — discussion is locked" (from post_comment line 104)
5. CommentComposer shows "Could not post" — opaque error message

**Suggested fix direction:** Add a quiz-invalidation signal (e.g., bump `perms_version` when an attempt is deleted/revoked) and refresh quiz status if perms_version changes. Or surface the actual RPC error message to the user.

**Confidence:** MEDIUM

---

## LOW

### F-A3-05 — Rate limit enforces per-user burst but doesn't distinguish article or category context
**File:line:** 
- `web/src/app/api/comments/route.js:36–50` (checkRateLimit call)

**Evidence:**
```
const rate = await checkRateLimit(service, {
  key: `comments:${user.id}`,
  policyKey: 'comments_post',
  max: 10,
  windowSec: 60,
});
```

**Impact:** User can post 10 comments in 60 seconds across all articles/conversations. No per-article or per-thread burst limit. A user could spam 10 comments on one article, then 10 more on another, in rapid succession. Moderation team can't distinguish spam from legitimate high-engagement users without looking at timestamps.

Not a security hole (the per-minute cap exists), but a moderation affordance gap.

**Reproduction:** Post 10 comments in 60 seconds on article A, then post 10 on article B in the next 60s. Both succeed.

**Suggested fix direction:** If spam-prevention is a goal, add per-article or per-thread window, or use exponential backoff after first few posts in rapid succession.

**Confidence:** LOW (product tradeoff, not a bug)

---

## UNSURE

### F-A3-06 — Comment status enum consistency
**File:line:** 
- `schema/reset_and_rebuild_v2.sql:1743–1800` (comments table DDL)

**Observation:** RLS uses `status='published'` (line 3803); `post_comment` inserts `'visible'` (line 136 in 013); CommentThread filters for `'visible'` (line 100 in CommentThread.tsx). No `CHECK` constraint on the status column visible in the schema dump, so the mismatch isn't caught at the database layer. 

**What would resolve it:** 
- Check the comments table DDL for status column type/constraint (enum vs. text, allowed values)
- Determine which status is the intended "normal published state" (visible? published? both?)
- Audit all INSERT/UPDATE statements that touch status to ensure consistency

Likely a migration/schema drift: an older codebase used 'published', it was changed to 'visible' in post_comment RPC, but RLS wasn't updated.

**Confidence:** LOW (needs schema clarification, but high confidence it's the root cause of F-A3-01)

