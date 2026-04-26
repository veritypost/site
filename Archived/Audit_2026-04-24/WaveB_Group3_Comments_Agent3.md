---
wave: B
group: 3 Comments & Quiz
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Wave B, Group 3 (Comments + Quiz), Agent 3/3

## CRITICAL

### F-B3-03-01 — RLS policy status mismatch blocks comment visibility for non-owners

**File:line:**
- `web/src/app/api/comments/route.js:137` — post_comment RPC inserts `status = 'visible'`
- `schema/013_phase5_comments_helpers.sql:137` — post_comment sets `status = 'visible'`
- RLS policy (pg_policies) — comments_select checks `status = 'published'`

**Evidence:**

Post_comment RPC at schema/013 line 137:
```sql
INSERT INTO comments
  (article_id, user_id, parent_id, root_id, thread_depth, body, mentions, status)
VALUES
  (p_article_id, p_user_id, p_parent_id, v_root_id, v_depth, v_body, v_mentions, 'visible')
```

Comments RLS select policy (from pg_policies):
```
qual: ((((status)::text = 'published'::text) AND (deleted_at IS NULL)) 
       OR (user_id = auth.uid()) 
       OR is_mod_or_above())
```

Column default is 'visible' (verified via information_schema.columns).

**Impact:** 
When a user posts a comment, it's saved with `status='visible'`. The RLS policy's SELECT clause allows non-owners to see only `status='published'` comments. This creates a visibility gap:
- The posting user sees their own comment immediately (RLS allows owner to see own comments regardless of status)
- Other readers cannot see the comment unless status is changed to 'published' 
- The comment appears to save successfully (API returns 200 + comment object) but is invisible to other readers except the author
- Owner-reported bug "comments not saving or showing" is likely this: they see their own comment save, but when they refresh/reload, it doesn't appear in the thread for other readers to see

This is a classic "silent failure" where the UI shows success but the data is invisible to the intended audience.

**Reproduction:** 
Code-reading only (no live data in test DB). 
Expected repro steps: (1) Auth as user A (2) pass quiz (3) post comment → see own comment in thread (4) refresh page (5) comment appears; (6) Auth as user B on same article (7) comment from A is not visible → bug confirmed.

**Suggested fix direction:** 
Change post_comment RPC to insert with `status = 'published'` instead of `status = 'visible'`, OR update the RLS select policy's qual to allow `status = 'visible'` for all verified readers (matching the expectation set by post_comment's default and the logic at CommentThread.tsx line 100).

**Confidence:** HIGH

---

## HIGH

### F-B3-03-02 — Comments SELECT query filters by 'visible' but RLS policy expects 'published'

**File:line:**
- `web/src/components/CommentThread.tsx:100` — `.eq('status', 'visible')`
- RLS policy — comments_select qual references only `'published'`

**Evidence:**

CommentThread.loadAll() at line 94-104:
```typescript
const { data: rows, error: loadErr } = await supabase
  .from('comments')
  .select(...)
  .eq('article_id', articleId)
  .eq('status', 'visible')  // Expects 'visible'
  .is('deleted_at', null)
  .order('is_context_pinned', { ascending: false })
  .order('upvote_count', { ascending: false })
  .order('created_at', { ascending: true });
```

RLS policy SELECT qual:
```
(status = 'published' AND deleted_at IS NULL) OR (user_id = auth.uid()) OR is_mod_or_above()
```

The client explicitly queries for `status='visible'`, but the RLS policy's first OR clause only permits `status='published'`. For non-owners/non-mods, the WHERE clause becomes:
```
WHERE status='visible' AND user_id=auth.uid() [because other conditions fail]
```
This only returns comments the reader authored, not the thread.

**Impact:** 
Threads will appear empty for readers other than the comment authors and moderators. Even though post_comment is working (inserting records), the subsequent SELECT to populate the thread will fail silently due to RLS filtering.

**Reproduction:** 
Code-reading only; consistent with F-B3-03-01.

**Suggested fix direction:** 
Align the RLS policy and the comment insertion logic: either both use 'visible' or both use 'published'. The RPC already uses 'visible', so the RLS should be updated to accept 'visible' in the published case.

**Confidence:** HIGH

---

## MEDIUM

### F-B3-03-03 — Quiz-unlock gate enforced at RPC level; API route does not re-verify

**File:line:**
- `web/src/app/api/comments/route.js:19` — calls `requirePermission('comments.post')`
- `schema/013_phase5_comments_helpers.sql:102-105` — post_comment RPC calls `user_passed_article_quiz(p_user_id, p_article_id)`

**Evidence:**

API route at comments/route.js line 19:
```javascript
user = await requirePermission('comments.post');
```

Then calls the RPC (line 52-58). The RPC itself enforces the quiz gate at lines 102-105:
```sql
IF NOT user_passed_article_quiz(p_user_id, p_article_id) THEN
  RAISE EXCEPTION 'quiz not passed — discussion is locked';
END IF;
```

The API route also re-checks via requirePermission('comments.post'), which runs the permissions system. This is correctly defense-in-depth: both the API and the RPC verify.

**Impact:** NONE observed. The quiz gate is properly enforced at both layers.

**Reproduction:** 
(1) Auth as user who has not passed the article's quiz (2) attempt POST /api/comments with valid article_id (3) should receive 401/403 + error message.

**Suggested fix direction:** 
No fix needed; this is correctly implemented.

**Confidence:** MEDIUM (checking implementation of documented gates, not a bug)

---

## LOW

### F-B3-03-04 — Comment vote RLS allows insert without quiz pass; toggle_vote RPC enforces gate

**File:line:**
- RLS policy comment_votes_insert: `with_check: ((user_id = auth.uid()) AND has_verified_email() AND (NOT is_banned()))`
- `schema/013_phase5_comments_helpers.sql:187-189` — toggle_vote RPC enforces quiz gate

**Evidence:**

comment_votes RLS insert policy does NOT check quiz pass:
```
((user_id = auth.uid()) AND has_verified_email() AND (NOT is_banned()))
```

But the toggle_vote RPC at line 187-189:
```sql
IF NOT user_passed_article_quiz(p_user_id, v_comment.article_id) THEN
  RAISE EXCEPTION 'quiz not passed — cannot vote';
END IF;
```

The API route at web/src/app/api/comments/[id]/vote/route.js:35 enforces requirePermission('comments.upvote' | 'comments.downvote' | 'comments.vote.clear'), which indirectly validates via the permissions system.

**Impact:** NONE. Even though RLS does not enforce quiz, the API route re-checks via requirePermission, and the RPC enforces the gate. The RLS should ideally also enforce to be belt-and-suspenders, but the current layering is safe.

**Reproduction:** 
Code-reading only.

**Suggested fix direction:** 
Optional: add quiz pass check to comment_votes RLS insert with_check for consistency, though it's currently safe due to API+RPC layers.

**Confidence:** LOW

---

## Summary

The root cause of the owner-reported "comments not saving or showing" bug is the mismatch between the post_comment RPC's insertion of `status='visible'` and the RLS select policy's authorization of only `status='published'` records for non-owners. This creates a scenario where comments appear to post successfully but are invisible to other readers due to RLS filtering, matching the exact symptom reported. The secondary finding (client filtering by 'visible' vs RLS expecting 'published') reinforces the same root cause. Both findings are HIGH/CRITICAL.

