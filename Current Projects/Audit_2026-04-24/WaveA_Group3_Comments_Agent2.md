---
wave: A
group: 3 Article + Comments + Quiz
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Article + Comments + Quiz, Wave A, Agent 2/3

## CRITICAL

### F-A3-2-01 — RLS status mismatch: comments inserted 'visible' but RLS requires 'published'

**File:line:** `schema/reset_and_rebuild_v2.sql:3804` + `schema/013_phase5_comments_helpers.sql:137`

**Evidence:**

RLS SELECT policy (reset_and_rebuild_v2.sql:3804):
```sql
CREATE POLICY "comments_select" ON "comments" FOR SELECT USING (
  (status = 'published' AND deleted_at IS NULL)
  OR user_id = auth.uid()
  OR public.is_mod_or_above()
);
```

post_comment RPC inserts (013_phase5_comments_helpers.sql:137):
```sql
INSERT INTO comments
  (article_id, user_id, parent_id, root_id, thread_depth, body,
   mentions, status)
VALUES
  (p_article_id, p_user_id, p_parent_id, v_root_id, v_depth, v_body,
   v_mentions, 'visible')
RETURNING id INTO v_new_id;
```

CommentThread component queries for 'visible' (CommentThread.tsx:100):
```typescript
.eq('status', 'visible')
```

**Impact:** Comments created via /api/comments → post_comment RPC are inserted with `status='visible'` but the RLS policy only exposes rows where `status='published'`. Authenticated users cannot SELECT their own comments they just posted (except via the author bypass `user_id = auth.uid()`). However, realtime subscriptions in CommentThread listen for new INSERT events and fetch the row directly, which succeeds because the author can read their own rows. The comment appears in the local state via `onPosted` callback but does NOT persist in the realtime subscription or subsequent reloads—RLS blocks the SELECT unless the comment is later promoted to 'published' (which never happens in the current code).

**Reproduction:** 
1. Authenticated user passes quiz on an article
2. User posts a comment via the CommentComposer
3. API returns success + the comment object (from the service-role re-fetch)
4. Component adds it to state via `onPosted` callback
5. User refreshes the page or closes/reopens the tab
6. Comment does not appear because `loadAll()` in CommentThread queries with RLS, which blocks the SELECT for 'visible' rows

**Suggested fix direction:** Change RLS policy to accept `status = 'visible'` OR migrate the post_comment RPC to insert `status = 'published'` and ensure all status transition logic uses one of these two values consistently.

**Confidence:** HIGH

---

## MEDIUM

### F-A3-2-02 — Quiz pass state not re-checked on comment load, stale gate possible

**File:line:** `web/src/components/CommentThread.tsx:183-186`

**Evidence:**

The `loadAll` callback is gated by `permsLoaded` but not by quiz-pass status. The story page checks `user_passed_article_quiz` once (story/[slug]/page.tsx:553-564) and sets `userPassedQuiz` state, which is passed to CommentThread as an implicit gate via the parent's conditional render. However, if the RPC fails transiently, `quizPassError` is set and a "couldn't check" panel is shown to the user instead of the thread. The thread never re-attempts the RPC check.

```typescript
useEffect(() => {
  if (!permsLoaded) return;
  loadAll();
}, [loadAll, permsLoaded]);
```

The `loadAll` callback depends on `permsLoaded` but never gates on the result of the quiz-pass RPC. If a user's quiz_attempts table is modified server-side (e.g., an admin revokes their pass), the client will not detect the change until a manual reload.

**Impact:** Minor UX gap: users with a transient RPC failure on story load see a locked state ("Couldn't check your quiz status") with a retry button that triggers a full page reload, rather than allowing CommentThread to attempt its own fetch. Less of a bug, more of a missing synchronization point.

**Reproduction:** Code-reading only. The quiz-pass check is not re-invoked within CommentThread's lifecycle.

**Suggested fix direction:** Pass the quiz-pass result down to CommentThread and re-validate on mount or add a retry mechanism within the "couldn't check" panel.

**Confidence:** MEDIUM

---

## LOW

### F-A3-2-03 — Vote persistence via comment_votes unclear on RLS enforcement

**File:line:** `web/src/app/api/comments/[id]/vote/route.js` + database RLS policies

**Evidence:**

The vote toggle is called from CommentThread (line 263-280) and posts to `/api/comments/{commentId}/vote`, which calls the `toggle_vote` RPC. The RPC in schema/013 checks `user_passed_article_quiz` before allowing a vote. However, the client-side state update (line 274-279) happens optimistically before the API response is validated.

```typescript
setComments((prev) =>
  prev.map((c) =>
    c.id === commentId ? { ...c, upvote_count: data.up, downvote_count: data.down } : c
  )
);
setYourVotes((prev) => ({ ...prev, [commentId]: data.your_vote || undefined }));
```

If the server rejects the vote (e.g., quiz check fails), the client state is already mutated. The error banner is shown, but the UI does not roll back the vote count or `yourVotes` map.

**Impact:** Silent mismatch between client-optimistic state and server-rejected vote. User sees the vote as applied, but on reload the vote is not present.

**Reproduction:** Create a scenario where the toggle_vote RPC fails (quiz revoked) and observe the UI state after error.

**Suggested fix direction:** Add rollback on vote error, or fetch the current vote state from the server on error to re-sync.

**Confidence:** LOW — the quiz check before voting is strong, but the optimistic update without rollback is a potential UX trap.

---

## UNSURE

### F-A3-2-04 — 'visible' vs 'published' status semantics unclear

No schema migration or comment in the code explains why `post_comment` inserts `status = 'visible'` while the RLS policy expects `'published'`. Is 'visible' a transient pre-moderation state? Is there a background job that promotes 'visible' to 'published'? The FindAndReplace across the codebase shows no evidence of automatic status promotion.

**Info needed:** Code search for any UPDATE or trigger that moves comments from 'visible' → 'published', or a clarification in comments/docs on the intended lifecycle.

---

**Summary:** The critical RLS status mismatch (F-A3-2-01) directly causes the owner-reported bug "comments not showing" after a page refresh. Votes and edits work optimistically but lack rollback on server rejection (F-A3-2-03). Quiz-pass validation is not re-checked within the comment thread lifecycle (F-A3-2-02).
