---
wave: B
group: 3 — Article + Comments + Quiz
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Wave B, Group 3 (Comments), Agent 1/3

## CRITICAL

### F-B3-1 — Comment status mismatch: RLS policy expects 'published', code sets 'visible'

**File:line:** 
- `schema/013_phase5_comments_helpers.sql:137` (post_comment RPC sets status = 'visible')
- `web/src/components/CommentThread.tsx:100` (client filters status = 'visible')
- `pg_policies` query result (comments_select policy checks status = 'published')

**Evidence:**

post_comment RPC inserts with status = 'visible':
```sql
INSERT INTO comments
  (article_id, user_id, parent_id, root_id, thread_depth, body,
   mentions, status)
VALUES
  (p_article_id, p_user_id, p_parent_id, v_root_id, v_depth, v_body,
   v_mentions, 'visible')
```

CommentThread component filters for 'visible' (line 100):
```typescript
.eq('status', 'visible')
```

But RLS policy comments_select enforces 'published' (from pg_policies):
```
qual: "((((status)::text = 'published'::text) AND (deleted_at IS NULL)) OR (user_id = auth.uid()) OR is_mod_or_above())"
```

**Impact:** Newly posted comments are inserted with `status = 'visible'`, but RLS policy blocks SELECT unless status = 'published'. Comments are silently invisible to the author and other readers (except mods) immediately after posting. The "comments not saving or showing" owner report is a direct consequence: they do appear in the database but are RLS-gated out from view.

**Reproduction:** 
1. Load article anon → quiz gate visible
2. Sign up → verify email
3. Pass quiz (3/5) on article
4. Post comment via CommentComposer
5. Comment persists in DB (service-role RPC succeeds) but does not appear in CommentThread feed
6. Refresh page → still invisible unless user is author (RLS allows author to see own via `user_id = auth.uid()`)

**Suggested fix direction:** Update RLS policy comments_select to check `status = 'visible'` instead of `status = 'published'`, OR change post_comment RPC to insert `status = 'published'` instead. Schema consistency requires only one status enum value be in use for this flow.

**Confidence:** HIGH — direct code read + SQL policy dump + schema RPC definition all confirm the mismatch.

---

## HIGH

### F-B3-2 — Quiz gate enforcement: RPC checks quiz pass, API route does not re-verify after permission check

**File:line:** 
- `web/src/app/api/comments/route.js:19` (POST /api/comments calls requirePermission('comments.post'), no explicit quiz gate)
- `schema/013_phase5_comments_helpers.sql:103` (post_comment RPC enforces quiz gate at line: `IF NOT user_passed_article_quiz(p_user_id, p_article_id)`)

**Evidence:**

API route:
```javascript
user = await requirePermission('comments.post');
```

Then calls RPC:
```javascript
const { data, error } = await service.rpc('post_comment', { ... });
```

RPC enforces quiz gate:
```sql
IF NOT user_passed_article_quiz(p_user_id, p_article_id) THEN
  RAISE EXCEPTION 'quiz not passed — discussion is locked';
END IF;
```

**Impact:** The API route trusts the permission check to imply quiz eligibility. However, `comments.post` permission is role-based (tied to plan tier, not quiz pass status). An authenticated user with the permission but NO quiz pass will hit the RPC check and get a generic "Could not post comment" error (line 61), rather than actionable "You need to pass the quiz first" feedback. Per briefing requirement #5 (Error UX), this is a silent failure for the user.

**Reproduction:** Create test user with verified email + free/paid plan (permission = true) but no passing quiz attempt. Try to POST /api/comments. Receive 400 + "Could not post comment" instead of "Quiz not passed."

**Suggested fix direction:** Add explicit quiz gate check in the API route before calling RPC, returning a 403 + descriptive error to client so UI can display "Pass the quiz to comment" rather than generic failure.

**Confidence:** MEDIUM-HIGH — RPC enforces correctly, but API route error handling masks the actual reason for failure. Briefing #5 requires actionable error UX.

---

### F-B3-3 — Comment votes do not persist to DB via RLS policy for comment_votes_insert

**File:line:**
- `web/src/app/api/comments/[id]/vote/route.js:71–75` (POST /api/comments/[id]/vote calls toggle_vote RPC)
- `pg_policies` query (comment_votes_insert policy has `with_check: "((user_id = auth.uid()) AND has_verified_email() AND (NOT is_banned()))"`

**Evidence:**

Vote API calls RPC:
```javascript
const { data, error } = await service.rpc('toggle_vote', {
  p_user_id: user.id,
  p_comment_id: id,
  p_vote_type: type,
});
```

RPC uses service role (SECURITY DEFINER), which bypasses RLS. The RPC succeeds and updates vote counts. However, the client-side code in CommentThread.tsx (line 264) calls the same endpoint without explicit error handling for rate limit or permission drift scenarios.

**Impact:** This is lower-risk because the RPC executes as service_role and the RLS policy is only a gate if vote row is ever accessed via normal auth (not via the RPC). Votes will persist. However, if a user's email verification is revoked between vote call and RPC execution, the row is already inserted (no rollback). Minimal risk but worth noting.

**Suggested fix direction:** No fix needed — service role RPC executes atomically before RLS is evaluated. Votes persist correctly. The design is sound here.

**Confidence:** LOW-MEDIUM — This is actually working as intended; flagging as informational rather than a bug.

---

## MEDIUM

### F-B3-4 — Quiz pass check is RPC-dependent; network failure silences locking state

**File:line:**
- `web/src/app/story/[slug]/page.tsx:552–565` (user_passed_article_quiz RPC with error handling)

**Evidence:**

```typescript
let passedQuiz = false;
if (authUser) {
  const { data: passData, error: passErr } = await supabase.rpc(
    'user_passed_article_quiz',
    { p_user_id: authUser.id, p_article_id: storyId }
  );
  if (passErr) {
    console.error('[story.user_passed_article_quiz]', passErr.message);
    setQuizPassError(true);  // Shows retry panel
  } else {
    setQuizPassError(false);
    passedQuiz = !!passData;
    setUserPassedQuiz(passedQuiz);
  }
}
```

Then later (line 979–986):
```typescript
} : userPassedQuiz ? (
  <CommentThread ... />
) : currentUser && currentUser.email_confirmed_at ? (
  // Panel: "Discussion is locked until you pass the quiz"
) : (
  // Panel: "Discussion is for signed-in readers"
);
```

**Impact:** If the RPC fails (network blip, RLS drift, slow DB), `quizPassError = true` and the page shows a retry panel instead of either "pass the quiz" or "discussion locked" panels. The user cannot comment. On refresh, if the RPC succeeds on second try, they see comments. This is a UX inconsistency but the server-side post_comment RPC will still enforce the gate, so no security hole. Per briefing #5, the error UX is appropriate (user gets a "Try again" button).

**Suggested fix direction:** No fix required; error state is handled correctly with a CTA to retry.

**Confidence:** LOW — This is actually correct per the briefing. Flagging for completeness.

---

## LOW

### F-B3-5 — Comment votes cleared on downvote filter but no client feedback

**File:line:**
- `web/src/components/CommentThread.tsx:263–280` (handleVote function)

**Evidence:**

```typescript
async function handleVote(commentId: string, type: VoteType) {
  const res = await fetch(`/api/comments/${commentId}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    setError(data?.error || 'Vote failed');
    return;
  }
  setComments((prev) =>
    prev.map((c) =>
      c.id === commentId ? { ...c, upvote_count: data.up, downvote_count: data.down } : c
    )
  );
  setYourVotes((prev) => ({ ...prev, [commentId]: data.your_vote || undefined }));
}
```

**Impact:** Vote clear (type = 'clear') has no UI affordance or feedback. The button state updates silently. Per briefing #5 (Error UX), there should be a toast or status message confirming the action. Low priority but noted.

**Suggested fix direction:** Add a flash message on vote clear, e.g., "Vote cleared" or similar, so user knows the action succeeded.

**Confidence:** LOW — This is a minor UX polish, not a functional bug.

---

## UNSURE

### F-B3-6 — Rate limit on quiz submit vs. comment post: misaligned policy keys

**File:line:**
- `web/src/app/api/quiz/submit/route.js:74–79` (checkRateLimit with policyKey: 'quiz_submit')
- `web/src/app/api/comments/route.js:39–44` (checkRateLimit with policyKey: 'comments_post')

**Evidence:**

Quiz submit:
```javascript
const rate = await checkRateLimit(service, {
  key: `quiz_submit:${user.id}`,
  policyKey: 'quiz_submit',
  max: 30,
  windowSec: 60,
});
```

Comment post:
```javascript
const rate = await checkRateLimit(service, {
  key: `comments:${user.id}`,
  policyKey: 'comments_post',
  max: 10,
  windowSec: 60,
});
```

**Impact:** UNKNOWN without checking the rate limit policy table. If the policy keys 'quiz_submit' and 'comments_post' do not exist or are misconfigured in the rate_limits table, the checkRateLimit function may fail silently or use defaults. Cannot confirm impact without inspecting rate_limits table schema and content.

**Suggested fix direction:** Verify rate_limits table has rows for policyKey IN ('quiz_submit', 'comments_post') and that max/windowSec match the hardcoded values in the API routes. If they don't match, centralize the policy config in the DB to avoid drift.

**Confidence:** LOW — Requires data inspection to resolve. Flagging as informational.

---

## Summary

**Critical issue:** Comments posted by users are RLS-gated to invisibility due to status mismatch ('visible' vs. 'published'). This is the root cause of the "comments not saving or showing" owner report. Immediate fix required.

**High issue:** Quiz gate is enforced by RPC but API error handling masks the actual reason (quiz not passed), violating Error UX requirement.

**Testing notes:** All findings are code-reading only. No dev server test performed due to 15-min time cap. Recommend reproduction steps for F-B3-1 and F-B3-2 before deploying fixes.

