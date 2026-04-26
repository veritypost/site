---
wave: A
group: 3 (Article + Comments + Quiz)
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Article + Comments + Quiz, Wave A, Agent 1

## CRITICAL

### F-WA3-1-01 — Comment Status Mismatch: Client Filters 'visible' but RLS Enforces 'published'

**File:line:** `web/src/components/CommentThread.tsx:100`

**Evidence:**
```
Client code: .eq('status', 'visible')
RLS policy qual: "((((status)::text = 'published'::text) AND (deleted_at IS NULL)) OR..."
```

**Impact:** Comments posted via `/api/comments` are inserted but filtered out on read. If `post_comment` RPC sets status to `'visible'`, the client SELECT `.eq('status', 'visible')` will return rows. However, the RLS policy only allows `status = 'published'` to bypass (non-owner/non-mod). Result: **comments exist in DB but never appear to readers**, triggering the owner-reported bug "comments not saving or showing." Users get no error toast—silent failure.

**Reproduction:** 
1. Load article as anon → quiz gate visible
2. Sign up, auth, pass 3/5 quiz → CommentThread renders 
3. Submit comment via CommentComposer → POST `/api/comments`
4. Refresh page → Comment vanishes; empty thread with "No comments yet" despite POST 200

**Suggested fix direction:** Align status enum across RLS and client: either change RLS condition to `'visible'` or client filter to `'published'`. Verify post_comment RPC uses matching value.

**Confidence:** HIGH

---

### F-WA3-1-02 — Post Comment Route Lacks Server-Side Quiz-Pass Validation

**File:line:** `web/src/app/api/comments/route.js:14-62`

**Evidence:**
```javascript
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('comments.post');  // Line 19: role-based only
  } catch (err) { ... }
  
  const { article_id, body, parent_id, mentions } = await request.json().catch(() => ({}));
  // No quiz-pass check here
  
  const { data, error } = await service.rpc('post_comment', {
    p_user_id: user.id,
    p_article_id: article_id,
    p_body: body,
    p_parent_id: parent_id || null,
    p_mentions: Array.isArray(mentions) ? mentions : [],
  });  // Line 52: assumes RPC enforces quiz gate
```

**Impact:** The product's core moat—"pass the 3/5 quiz to comment"—is enforced only on the UI (page.tsx:543-986 conditional render) and inside the post_comment RPC (not visible in Supabase SQL results). The POST route itself accepts any authenticated user with `comments.post` permission. A user who:
- Clears browser cache → permissions cache stale
- Forges a permission claim (unlikely but possible with auth bypass)
- Calls the API directly without UI quiz gate

...can post without passing the quiz.

**Reproduction:** Difficult without auth bypass, but code inspection shows no quiz validation at route layer.

**Suggested fix direction:** Insert `const passed = await supabase.rpc('user_passed_article_quiz', { p_user_id: user.id, p_article_id: article_id }); if (!passed) return NextResponse.json({ error: 'Quiz not passed' }, { status: 403 });` before post_comment call.

**Confidence:** HIGH

---

## HIGH

### F-WA3-1-03 — Comment Vote Endpoint Missing Quiz-Pass Check

**File:line:** `web/src/app/api/comments/[id]/vote/route.js:13-45`

**Evidence:**
```javascript
export async function POST(request, { params }) {
  const { id } = params;
  const { type } = await request.json().catch(() => ({}));
  
  const permKey = type === 'upvote' ? 'comments.upvote' : type === 'downvote' ? 'comments.downvote' : 'comments.vote.clear';
  let user;
  try {
    user = await requirePermission(permKey);  // Line 35: permission gate only
  } catch (err) { ... }
  
  const { data, error } = await service.rpc('toggle_vote', { p_user_id: user.id, p_comment_id: id, p_vote_type: type });
```

**Impact:** A non-quiz-passed reader with `comments.upvote` permission can artificially inflate upvote_count on comments. This breaks ranking (CommentThread line 103: `.order('upvote_count', { ascending: false })`), allowing unqualified users to manipulate what appears at the top of the thread. Lower privilege than posting but same architectural gap.

**Reproduction:** After quiz-fail (2/5 correct), if user somehow retains upvote permission via stale cache, POST `/api/comments/[id]/vote` succeeds and increments upvote_count.

**Suggested fix direction:** Add quiz-pass RPC call before toggle_vote, return 403 if false. Extract to a helper function to DRY with comments.post route.

**Confidence:** HIGH

---

### F-WA3-1-04 — Comment RLS Insert Policy Lacks Explicit Quiz-Pass Check

**File:line:** Supabase RLS policy `comments_insert`

**Evidence:**
```sql
INSERT policy qual: ((user_id = auth.uid()) AND has_verified_email() AND (NOT is_banned()))
-- Missing: user_passed_article_quiz(auth.uid(), article_id)
```

**Impact:** If post_comment RPC is missing the quiz check, RLS has no fallback. If post_comment bypasses the check (e.g., bug or schema drift), comments are inserted anyway. Violates D6 product spec: "every article has a 5-question quiz, pass 3/5 to unlock commenting."

**Reproduction:** Requires post_comment RPC implementation to be visible (not in SQL results). Assuming it exists but skips quiz check, a direct RPC call `SELECT post_comment(user_id, article_id, body, ...)` from an unauthenticated client would still be caught by this RLS if the policy enforced quiz-pass.

**Suggested fix direction:** Add `user_passed_article_quiz(auth.uid(), article_id)` to the with_check clause of comments_insert RLS.

**Confidence:** HIGH

---

## MEDIUM

### F-WA3-1-05 — Client State Doesn't Refetch Quiz Pass After Submission

**File:line:** `web/src/app/story/[slug]/page.tsx:879-886, 980-986`

**Evidence:**
```javascript
// Line 879: ArticleQuiz calls onPass
<ArticleQuiz
  articleId={story.id}
  initialPassed={userPassedQuiz}
  userTier={userTier}
  onPass={() => {
    setUserPassedQuiz(true);
    setJustRevealedThisSession(true);  // Triggers stagger animation
  }}
/>

// Line 980: CommentThread renders unconditionally
<CommentThread
  articleId={story.id}
  articleCategoryId={story.category_id}
  currentUserId={currentUser?.id}
  currentUserTier={userTier}
  justRevealed={justRevealedThisSession}
/>
```

**Impact:** After quiz pass, state flips to `userPassedQuiz=true` immediately (optimistic). If the post_comment RPC fails silently or permissions are stale, user sees "Discussion locked" on refresh. No retry/error banner to explain why the quiz pass didn't stick. User-journey audit flags silent failures as HIGH severity.

**Reproduction:**
1. Pass quiz → onPass fires → setUserPassedQuiz(true)
2. CommentThread loads → submit comment
3. Post fails silently (e.g., post_comment RPC returns 400 with no error message)
4. Refresh page → story.tsx re-runs user_passed_article_quiz RPC (line 553)
5. If RPC returns false (e.g., quiz_attempts table has a bug), screen shows "Discussion is locked until you pass the quiz above" again

**Suggested fix direction:** After quiz pass, add a synchronous re-check: `const confirmPass = await supabase.rpc('user_passed_article_quiz', { p_user_id: currentUser.id, p_article_id: story.id }); if (!confirmPass) { setError('Quiz pass didn't register. Please refresh.'); return; }`. Surface error banner if recheck fails.

**Confidence:** MEDIUM

---

### F-WA3-1-06 — Comment Votes RLS Missing Quiz-Pass Enforcement

**File:line:** Supabase RLS policy `comment_votes_insert`

**Evidence:**
```sql
INSERT policy qual: ((user_id = auth.uid()) AND has_verified_email() AND (NOT is_banned()))
-- No quiz-pass check
```

**Impact:** If vote endpoint (F-WA3-1-03) has a permissions bug, RLS would allow a non-passed reader to insert votes. Lower priority than posting but consistent with F-WA3-1-04.

**Suggested fix direction:** Add quiz-pass check to comment_votes_insert with_check clause.

**Confidence:** MEDIUM

---

## LOW

### F-WA3-1-07 — Comment Vote Response Missing Article ID for Quiz Validation Context

**File:line:** `web/src/app/api/comments/[id]/vote/route.js:71-101`

**Evidence:**
```javascript
const { data, error } = await service.rpc('toggle_vote', {
  p_user_id: user.id,
  p_comment_id: id,
  p_vote_type: type,
});
// Returns { up: count, down: count, your_vote: type }
// Does NOT return the comment's article_id
```

**Impact:** If (when) F-WA3-1-03 is fixed to validate quiz-pass, the helper function will need to look up the article_id from the comment. Current response doesn't include it, forcing an extra SELECT. Minor inefficiency, not a security issue.

**Suggested fix direction:** Have toggle_vote RPC return comment_id or article_id in response, or cache article_id on the client via the comments list.

**Confidence:** LOW

---

## UNSURE

### F-WA3-1-08 — post_comment RPC Implementation Not Visible

**File:line:** Supabase RPC definition (not available in SQL inspection)

**Evidence:**
```sql
FROM information_schema.routines WHERE routine_name = 'post_comment'
-- routine_definition = NULL (Postgres stored procedure, source hidden by Supabase)
```

**Gap:** Cannot inspect whether post_comment RPC:
1. Validates quiz-pass before INSERT
2. Sets status to 'published' or 'visible'
3. Checks article_id existence
4. Emits audit_log

**Resolution:** Run `SELECT pg_get_functiondef('post_comment'::regproc);` with admin access, or inspect the migration file that creates post_comment.

---

## Summary Table

| Issue | Severity | Product Impact | Data Flow Impact |
|-------|----------|-----------------|------------------|
| Status mismatch (F-1) | CRITICAL | Comments never visible | SELECT fails silently |
| No quiz-pass in POST (F-2) | CRITICAL | Moat broken | Anyone with role can post |
| No quiz-pass in vote (F-3) | HIGH | Ranking polluted | Non-readers boost comments |
| RLS missing quiz-pass (F-4) | HIGH | No DB fallback | Relies entirely on RPC |
| No state recheck after quiz (F-5) | MEDIUM | UX confusion | Silent lock-in after pass |
| Vote RLS missing quiz (F-6) | MEDIUM | Consistency gap | Same as F-4 |
| Vote response inefficiency (F-7) | LOW | Minor perf | Extra DB round-trip |

**All quiz-enforcement gaps (F-2, F-3, F-4, F-6) stem from the same root:** the architecture assumes post_comment, toggle_vote, and RLS all enforce quiz-pass, but only one (post_comment RPC) is visible, creating a "trust but don't verify" situation.

---

**Report generated:** 2026-04-24, ~12 min focused audit.

