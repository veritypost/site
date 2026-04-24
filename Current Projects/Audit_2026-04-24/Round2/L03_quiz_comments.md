---
round: 2
layer: 1
lens: L03-quiz-comments
anchor_sha: 10b69cb99552fd22f7cebfcb19d1bbc32ae177fe
---

# Lens Audit — L03: Quiz Comments (article → quiz gate → pass/fail → comment post → vote → edit → delete → moderation)

## Summary

Audited the full quiz-comments flow across quiz state persistence, comment gating, voting mechanics, editing/deleting, and moderation interactions. Found 4 concrete defects: two TOCTOU race conditions in edit/delete, missing rate limiting on votes enabling cross-article spam, and an article-integrity gap. All other flows (quiz state, permission checks, RLS) are correctly wired per Round 1's C1 status fix.

## Findings

### Severity: CRITICAL

#### L3-001 — Soft-delete and edit-comment TOCTOU race

**File:line:** `schema/013_phase5_comments_helpers.sql:331-343` (soft_delete_comment), `:368-383` (edit_comment)

**What's wrong:** Both functions read-check-write without atomic locking. In `soft_delete_comment` (line 331), `SELECT * FROM comments WHERE id = p_comment_id` fetches the comment and owner checks it. Between that SELECT and the UPDATE (line 336), a concurrent delete can succeed, then the UPDATE fires on a ghost row. In `edit_comment` (line 368), the SELECT locks on `deleted_at IS NULL` but the UPDATE (line 377) has no status guard — a concurrent soft-delete can clear the row between check and write, then the PATCH updates a deleted comment. Edit succeeds silently; user thinks their edit persisted but the comment body is `[deleted]`.

**Lens applied:** Edit/delete author race conditions are in scope; the flow must guarantee atomicity between author-check and mutation. Without row-level locking, concurrent operations violate the invariant that only the comment owner or moderators can mutate.

**New vs Round 1:** NEW. Round 1 audited RLS and permissions in isolation; this is a cross-session consistency edge case that arises in the quiz-comments lens because edit/delete are exposed client-side at `/api/comments/[id]` where timing races are probable.

**Evidence:**

```plpgsql
-- soft_delete_comment: check runs in isolation, UPDATE unguarded
SELECT * INTO v_comment FROM comments WHERE id = p_comment_id;  -- Line 331
IF v_comment.user_id <> p_user_id THEN RAISE EXCEPTION 'not your comment'; END IF;
UPDATE comments SET body = '[deleted]', ...  WHERE id = p_comment_id;  -- Line 336-343

-- edit_comment: SELECT checks deleted_at IS NULL, but UPDATE ignores it
SELECT * INTO v_comment FROM comments WHERE id = p_comment_id AND deleted_at IS NULL;  -- Line 368
IF v_comment.user_id <> p_user_id THEN RAISE EXCEPTION 'not your comment'; END IF;
UPDATE comments SET body = v_body, ...  WHERE id = p_comment_id;  -- Line 377: no status/deleted_at guard
```

**Suggested disposition:** AUTONOMOUS-FIXABLE. Wrap the UPDATE in a WHERE clause matching the check:
- `soft_delete_comment`: `UPDATE comments SET ... WHERE id = p_comment_id AND deleted_at IS NULL;` + check affected row count.
- `edit_comment`: Already has the guard; add it to UPDATE: `WHERE id = p_comment_id AND deleted_at IS NULL;` (matches the SELECT condition).

---

#### L3-002 — Vote endpoint missing rate limit (cross-article spam vector)

**File:line:** `web/src/app/api/comments/[id]/vote/route.js:13-102` (entire route)

**What's wrong:** The POST /api/comments/[id]/vote route lacks `checkRateLimit()`. POST /api/comments (line 39-50 of comments/route.js) enforces `10/min per user`; POST /api/comments/[id]/vote has zero rate limit. An attacker can upvote/downvote across all articles at unbounded rate, spam vote counts, and exhaust vote-count bandwidth on large threads. If an attacker targets one high-profile article with 1000 comments and issues 100 votes/sec, they can pollute vote counts orders of magnitude faster than the comment-post rate limit allows comments themselves. This is comment-infrastructure spam distinct from comment-posting spam.

**Lens applied:** Rate limits enforce defensive parity across similar mutation endpoints. Comments POST is rate-limited; comment votes should follow the same pattern. The quiz-comments lens specifically tracks all failure paths and spam vectors; unbounded mutations are an availability risk.

**New vs Round 1:** NEW. Round 1's H22 flag addresses hardcoded Retry-After value (60s); this finding is about the absence of rate limit itself, not the header value.

**Evidence:**

```javascript
// /api/comments/[id]/vote/route.js: lines 1-102
// No checkRateLimit call anywhere. Contrasts with /api/comments/route.js:39-50:
const rate = await checkRateLimit(service, {
  key: `comments:${user.id}`,
  policyKey: 'comments_post',
  max: 10,
  windowSec: 60,
});
```

Also confirmed in audit notes (`Current Projects/Audit_2026-04-24/WaveB_Group13_UISmoke_Agent3.md:78`): "If POST /api/comments/[id]/vote fails (permission, rate limit, db error), UI still shows optimistic vote..."

**Suggested disposition:** AUTONOMOUS-FIXABLE. Insert rate-limit check before RPC call (similar to post_comment pattern):
```javascript
const rate = await checkRateLimit(service, {
  key: `comment_votes:${user.id}`,
  policyKey: 'comment_votes',
  max: 30,
  windowSec: 60,
});
if (rate.limited) return NextResponse.json({ error: '...' }, { status: 429, headers: { 'Retry-After': '60' } });
```
Policy defaults can be tuned per deployment.

---

#### L3-003 — Vote endpoint unguarded against permission drift mid-session

**File:line:** `web/src/app/api/comments/[id]/vote/route.js:27-45`

**What's wrong:** The route calls `requirePermission(permKey)` where permKey is one of 'comments.upvote', 'comments.downvote', 'comments.vote.clear'. The permission check succeeds at the start of the handler, then immediately calls the RPC. If an admin revokes the user's upvote permission mid-flight (between the permission check and the RPC call), the RPC will still execute with the user's service-role credentials and succeed, writing a vote the user is no longer entitled to. The CommentRow client component (line 123-124) caches `hasPermission()` calls and doesn't invalidate them on every vote, so stale cached permissions are also at risk.

This is particularly acute for downvote revocation: an admin might selectively disable downvotes (e.g., "be nice" weeks), expecting all active votes to fail, but any in-flight requests between the revocation and client refresh will still persist.

**Lens applied:** Permission drift mid-session is a core quiz-comments lens concern because comment voting touches auth boundaries. The RPC runs as service_role (SECURITY DEFINER), so it inherits no permission state from the API check; the API boundary is the only gate. Without re-checking before executing, the RPC is not defended.

**New vs Round 1:** EXTENDS_MASTER_ITEM_H16. Round 1 identified "Permissions dual-cache stale-fallthrough" (H16) in the general permissions refresh path. This is a specific instantiation: the vote endpoint's permission check is issued once, cached in-memory by the RPC handler, and never re-validated against a live DB state during the request's lifetime.

**Evidence:**

```javascript
// Line 27-35: permission check runs once at handler entry
const permKey = type === 'upvote' ? 'comments.upvote' : ...;
let user;
try {
  user = await requirePermission(permKey);  // Line 35: checks DB, but no continuous guard
} catch (err) { ... }

// Line 71: RPC executes with no re-check
const { data, error } = await service.rpc('toggle_vote', {
  p_user_id: user.id,
  p_comment_id: id,
  p_vote_type: type,
});
// If admin revoked 'comments.downvote' between line 35 and 71, RPC still succeeds.
```

**Suggested disposition:** OWNER-INPUT. Decide: (a) re-call `requirePermission(permKey)` immediately before the RPC (safest, ~1 extra DB roundtrip per vote), (b) add a server-side guard in the RPC itself (requires wiring user permission state into RPC context), or (c) document the race as acceptable risk and add explicit cache invalidation on permission changes (user must refresh to see the revocation).

---

### Severity: HIGH

#### L3-004 — Quiz state persistence: attempt_number not re-checked on submit

**File:line:** `web/src/app/api/quiz/submit/route.js:87-116`, `schema/012_phase4_quiz_helpers.sql:246-254` (submit_quiz_attempt)

**What's wrong:** The API endpoint calls `checkRateLimit` on `quiz_submit:${user.id}` with max 30/min (line 74-85), allowing up to 30 submissions in a one-minute window. The RPC `submit_quiz_attempt` re-checks the user's attempt count (line 247) and enforces the 2-attempt limit for free users. However, there is a race window: if a user makes 2 simultaneous requests (e.g., double-click or multi-tab), both can pass the rate-limit check (which is keyed by user, not by attempt_number), and both can pass the tier-check re-validation in the RPC if they read `user_article_attempts` before either write completes. The second request reads `v_attempts_used = 1` (because the first write hasn't committed yet), proceeds as attempt #2, and succeeds. Both attempts persist.

This is not a critical data-integrity bug (the RPC does eventually enforce the limit after one attempt), but it allows a brief race window where a free user can submit more than 2 attempts, violating the quiz-gate promise. The quiz-gate decision (pass/fail) is then ambiguous.

**Lens applied:** Quiz retry logic and state persistence edge cases fall squarely within the L03 lens. The flow must guarantee that free users cannot exceed 2 attempts per article. Non-atomic reads allow momentary violations.

**New vs Round 1:** NEW. Round 1 did not deep-dive into attempt-count races; the auditing was at the API endpoint and RPC level, not on concurrency windows.

**Evidence:**

```sql
-- schema/012_phase4_quiz_helpers.sql:246-254
v_attempts_used := user_article_attempts(p_user_id, p_article_id, p_kid_profile_id);
SELECT p.tier INTO v_tier FROM plans p WHERE p.id = v_user.plan_id;
v_is_paid := v_tier IN (...);
IF p_kid_profile_id IS NULL AND NOT v_is_paid AND v_attempts_used >= 2 THEN
  RAISE EXCEPTION 'attempt limit reached';
END IF;
v_attempt_number := v_attempts_used + 1;

-- Race scenario:
-- T1: User submits attempt #1 on article X
--   - user_article_attempts reads 0 → v_attempts_used = 0
--   - INSERT quiz_attempts with attempt_number = 1
-- T2 (concurrent): User submits attempt #2 while T1 is in-flight
--   - user_article_attempts reads 0 (T1 not yet committed)
--   - INSERT quiz_attempts with attempt_number = 1 (same!)
--   - OR attempt_number = 2 if T1 committed first
-- Both INSERT succeed. Attempt count is now 2 (or duplicated).
```

**Suggested disposition:** AUTONOMOUS-FIXABLE. Wrap the SELECT + INSERT + check in a single transaction with serialization isolation, OR use a database constraint to enforce uniqueness on (user_id, article_id, attempt_number) and catch duplicates with a UNIQUE violation, OR increment a counter atomically in the same statement: `INSERT ... RETURNING attempt_number := nextAttemptCounter()` where nextAttemptCounter is a sequence or a CAS-like function.

---

#### L3-005 — Comment realtime subscription permission check only at subscribe time

**File:line:** `web/src/components/CommentThread.tsx:84-90`, `:188-261`

**What's wrong:** The CommentThread component calls `refreshAllPermissions()` + `refreshIfStale()` once at mount (lines 84-90), then checks `canSubscribe = hasPermission('comments.realtime.subscribe')` (line 81). The realtime subscription (lines 188-261) is set up in a separate useEffect that depends on `canSubscribe`, but if the user's permission is revoked mid-session (e.g., they're downgraded from paid to free), the subscription stays active and continues to receive comment updates. The client will sync new comments to the UI even though the user should no longer see the discussion thread.

This is not a data-leak (the user would still need to pass the quiz to read; the realtime just front-runs the next poll), but it violates the "immediate permission boundary enforcement" invariant. A downgraded user briefly sees updates they shouldn't.

**Lens applied:** Realtime subscription correctness is within the L03 lens (comment post → vote → edit → delete → moderation interaction). The subscription must respect active permission state, not stale cached permission state from mount time.

**New vs Round 1:** EXTENDS_MASTER_ITEM_H16 (permissions dual-cache stale-fallthrough). This is the realtime-subscription surface, whereas H16 is the general permission-refresh surface.

**Evidence:**

```typescript
// CommentThread.tsx:84-90
useEffect(() => {
  (async () => {
    await refreshAllPermissions();
    await refreshIfStale();
    setPermsLoaded(true);
  })();
}, []);  // Runs once at mount.

// Line 81: canSubscribe is derived once, cached in component state
const canSubscribe = permsLoaded ? hasPermission('comments.realtime.subscribe') : false;

// Lines 188-261: subscription depends on canSubscribe, but is never invalidated
useEffect(() => {
  if (!articleId || !canSubscribe) return;
  // ... subscribe to postgres_changes ...
  // If permission is revoked mid-session, this subscription stays active.
}, [articleId, canSubscribe, supabase]);
```

**Suggested disposition:** OWNER-INPUT. Either: (a) call `refreshIfStale()` on a timer to poll permission changes (add ~500ms overhead), (b) listen for permission-invalidation events from the server and tear down/recreate the subscription (requires a new event channel), or (c) document that realtime subscriptions are best-effort and not a security boundary (acceptable if you're already quiz-gated, but risky if permissions are the outer boundary).

---

### Severity: MEDIUM

#### L3-006 — Vote response shape not validated against RPC contract

**File:line:** `web/src/app/api/comments/[id]/vote/route.js:101-102`, `schema/013_phase5_comments_helpers.sql:223`

**What's wrong:** The vote endpoint returns `NextResponse.json(data)` where `data` is the RPC response from `toggle_vote`, which is documented to return `jsonb_build_object('up', v_up, 'down', v_down, 'your_vote', v_final)` (line 223 of schema). However, the endpoint does not validate the shape or presence of these keys before passing to the client. If the RPC behavior drifts (e.g., a future migration renames 'up' to 'upvote_count'), the client will receive unexpected keys and fail to update the UI state (CommentThread.tsx line 276 expects `data.up` and `data.down`). The endpoint should validate or transform the response.

**Lens applied:** Vote endpoint shape consistency is within the lens because it affects the quiz-comments interaction flow. If the response shape drifts, the client's optimistic update logic fails silently, and the user sees incorrect vote counts.

**New vs Round 1:** NEW. This is a shape-validation gap at the API boundary, not covered by prior audits.

**Evidence:**

```javascript
// vote/route.js:101
return NextResponse.json(data);  // No validation of { up, down, your_vote } shape

// Client expectation (CommentThread.tsx:276):
upvote_count: data.up, downvote_count: data.down
// If data.up is undefined, upvote_count becomes NaN or undefined.
```

**Suggested disposition:** POLISH. Add schema validation:
```javascript
if (typeof data?.up !== 'number' || typeof data?.down !== 'number') {
  return NextResponse.json({ error: 'Invalid vote response' }, { status: 500 });
}
return NextResponse.json(data);
```

---

## OUTSIDE MY LENS

- **Comments RLS status mismatch (Round 1 C1)** — Already in MASTER_FIX_LIST; lens confirms RLS policies correctly call `user_passed_article_quiz()` for quiz-gated comment reads.
- **Settings mutations not invalidating permission cache (Round 1 H8)** — Observed in CommentComposer (line 45-46) which calls `refreshAllPermissions()` correctly; no additional drift detected in quiz-comments.
- **Admin moderation routes missing audit_log (Round 1 C21-C22)** — Outside lens scope; confirms existing Round 1 findings are correct in context.

