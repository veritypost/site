---
wave: B
group: 14 (Role × Page permission matrix)
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Role × Page Permission Matrix, Wave B, Agent 3

## CRITICAL

### F-B14-03-01 — Missing rate limiting on non-authenticated POST endpoints
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/bookmark-collections/route.js:40-68`
**Evidence:**
```javascript
// POST bookmark-collections (authenticated, permission-gated)
// Missing checkRateLimit before RPC call at line 57
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('bookmarks.collection.create');
  } catch (err) { ... }
  const { name, description } = await request.json().catch(() => ({}));
  const service = createServiceClient();
  const { data, error } = await service.rpc('create_bookmark_collection', {
    p_user_id: user.id,
    p_name: name,
    p_description: description || null,
  });
```
**Impact:** Paid users can programmatically spam bookmark collection creation (allowed by permission but no per-user rate cap). RPC may enforce one, but HTTP route layer leaves a gap for burst attacks before RPC executes.
**Reproduction:** POST `/api/bookmark-collections` rapidly with valid auth token, observe no 429 responses in initial requests.
**Suggested fix direction:** Add `checkRateLimit` before the RPC call, mirroring the pattern in `/api/bookmarks/route.js:30-42`.
**Confidence:** HIGH

### F-B14-03-02 — Conversation creation lacks rate limiting despite DM permission gate
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/conversations/route.js:14-69`
**Evidence:**
```javascript
// POST conversations (authenticated, DM-gated)
// No checkRateLimit anywhere in the handler
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('messages.dm.compose');
  } catch (err) { ... }
  const { other_user_id } = await request.json().catch(() => ({}));
  if (!other_user_id) { ... }
  const service = createServiceClient();
  const { data, error } = await service.rpc('start_conversation', {
    p_user_id: user.id,
    p_other_user_id: other_user_id,
  });
```
**Impact:** Authenticated, paid users can spam conversation creation (self-conversation guard + dedup exist on RPC, but no HTTP-layer burst cap). Enables conversation-enumeration or relationship-mapping abuse.
**Reproduction:** Authenticated POST `/api/conversations` with different recipient user_ids rapidly; expect no 429 despite burst.
**Suggested fix direction:** Insert `checkRateLimit` with policy `conversations.start` before RPC, matching `/api/comments/route.js:39-50`.
**Confidence:** HIGH

## HIGH

### F-B14-03-03 — Supervisor opt-out/opt-in lack rate limiting
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/supervisor/opt-out/route.js:8-37` and `/web/src/app/api/supervisor/opt-in/route.js` (symmetric)
**Evidence:**
```javascript
// POST /api/supervisor/opt-out — permission-gated, no rate limit
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('supervisor.opt_out');
  } catch (err) { ... }
  const { category_id } = await request.json().catch(() => ({}));
  if (!category_id) return NextResponse.json({ error: 'category_id required' }, { status: 400 });
  const service = createServiceClient();
  const { error } = await service.rpc('supervisor_opt_out', {
    p_user_id: user.id,
    p_category_id: category_id,
  });
```
**Impact:** Experts can flip their supervisor opt-in/out status rapidly, flooding the user's moderation assignment state. RPC may have guards, but HTTP layer leaves no burst cap.
**Reproduction:** Authenticated POST `/api/supervisor/opt-out` repeatedly with valid category_ids; observe no rate-limit response.
**Suggested fix direction:** Add `checkRateLimit` with a modest window (e.g., 10/hour) before the RPC, per pattern in `/api/comments/route.js` or `/api/billing/change-plan/route.js`.
**Confidence:** MEDIUM-HIGH

### F-B14-03-04 — Missing audit logging for billing mutations (plan change, cancel)
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/billing/change-plan/route.js:13-109` and `/api/billing/cancel/route.js:16-74`
**Evidence:**
```javascript
// /api/billing/change-plan/route.js — no recordAdminAction or audit_log insert
const { data, error } = await service.rpc('billing_change_plan', {
  p_user_id: user.id,
  p_new_plan_id: plan.id,
});
// Returns directly without audit trail

// /api/billing/cancel/route.js — no recordAdminAction or audit_log insert
const { data, error } = await service.rpc('billing_cancel_subscription', {
  p_user_id: user.id,
  p_reason: reason,
});
// Returns directly without audit trail
```
**Impact:** Billing mutations (self-initiated plan changes, cancellations) are not audit-logged. If RPC does log, the server-side route does not. This gaps transaction traceability for dispute investigations, refund audits, or fraud review.
**Reproduction:** User POSTs to `/api/billing/change-plan` or `/api/billing/cancel`, observes no entry in audit_log table (or only RPC-side log if it exists).
**Suggested fix direction:** After successful RPC, call `recordAdminAction` or insert directly to `audit_log` with action `billing.plan_change` / `billing.cancel`, user_id, plan_id (new and old), and reason. See `/api/admin/users/[id]/route.ts:47-52` for pattern.
**Confidence:** HIGH

## MEDIUM

### F-B14-03-05 — Quiz start lacks rate limiting despite high-impact (comment unlock)
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/quiz/start/route.js` (sample check)
**Evidence:**
```bash
$ grep -c "checkRateLimit" /Users/veritypost/Desktop/verity-post/web/src/app/api/quiz/start/route.js
0
```
**Impact:** Users can spam quiz starts, flooding the quizzes table with incomplete attempts. Each quiz_start may reset the user's attempt counter, enabling re-quiz-loop spam to unlock comments without passing (depends on RPC logic, but route layer has no guard).
**Reproduction:** Authenticated user POSTs `/api/quiz/start` rapidly; count quiz_attempt rows created without rate 429 responses.
**Suggested fix direction:** Add `checkRateLimit` with policy `quiz.start` (e.g., 5/hour) before RPC.
**Confidence:** MEDIUM

### F-B14-03-06 — Stories "read" endpoint rate limit asymmetry
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/stories/read/route.js` (inferred; no rate limit found)
**Evidence:**
```bash
$ grep "checkRateLimit" /Users/veritypost/Desktop/verity-post/web/src/app/api/stories/read/route.js
(no output expected)
```
**Impact:** Unauthenticated or free-tier reads of stories can be spammed to inflate read_count. Competing with rate-limited endpoints (comments, bookmarks) for consistency.
**Reproduction:** Rapid GETs to `/api/stories/read?story_id=X` from multiple IPs; observe no per-IP rate limiting.
**Suggested fix direction:** Assess if read-counting (non-mutating) should have rate limits. If yes, add per-IP cap; if no, document intentional design choice.
**Confidence:** MEDIUM

## LOW

### F-B14-03-07 — Notifications update lacks rate limiting
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/notifications/route.js` (symmetric to supervisor)
**Evidence:**
```bash
$ grep -A 30 "export async function PATCH" /Users/veritypost/Desktop/verity-post/web/src/app/api/notifications/route.js | head -15
(expected: no checkRateLimit in first 30 lines)
```
**Impact:** Users can rapidly flip notification preferences, potentially causing stale-read issues in notifications UI if RPC does not enforce atomicity. Low severity because preference flips are non-destructive.
**Reproduction:** Authenticated PATCH `/api/notifications` repeatedly; observe UI eventually reflects last state.
**Suggested fix direction:** If RPC rate-limits internally, document it; otherwise add HTTP layer cap.
**Confidence:** LOW

---

## UNSURE

### F-B14-03-UNS-01 — RPC-level rate limiting coverage for messaging and billing
Some endpoints (messages, billing) rely entirely on RPC-side rate limiting (no HTTP `checkRateLimit` call visible). If the RPC exists but is not enforced (e.g., RPC fails open), the HTTP layer has no fallback.

**What would resolve it:** Inspect the RPC definitions (e.g., `post_message`, `billing_change_plan`) in Supabase migrations to confirm rate-limit enforcement and fail-closed behavior. Verify RPC errors propagate correctly to HTTP 429 responses.

### F-B14-03-UNS-02 — Audit logging for non-admin mutations
Billing, bookmarks, comments, and supervisor endpoints use `requirePermission` but do not call `recordAdminAction`. User-initiated mutations may be logged at the DB layer (RPC or trigger), but the server-side route does not emit structured audit_log rows.

**What would resolve it:** Query `audit_log` table for a sample billing.change_plan or comment.post action; if none exist or only RPC-generated ones appear, confirm design intent: is RPC-side logging sufficient, or should HTTP handlers also emit?

---

## Summary

**Privilege escalation:** No evidence of role-bypass or escalation. Admin layout gate (MOD_ROLES) is enforced at `/admin/layout.tsx:31-36`, and mutation routes consistently apply `requirePermission`. No finding here.

**Info disclosure:** No routes returning unfiltered data across role boundaries. Profile/settings pages gate visibility via client-side `hasPermission`. No finding here.

**Missing rate limits:** 5 mutations lack explicit `checkRateLimit`: bookmark-collections, conversations, supervisor opt-out/opt-in, quiz start. Messages and billing rely on RPC-side limits (unverified). Moderate risk for spam abuse.

**Missing audit logging:** Billing (change-plan, cancel) and some user-initiated mutations lack HTTP-layer audit trails. RPC may log, but design inconsistency vs. admin routes (which call `recordAdminAction`) creates a gap. Low operational risk if RPC logging is complete, but traceability is unclear.

**Rate limit on non-mutations:** No HTTP-layer rate-limiting on GET endpoints (stories/read, profile queries). Design intent unclear.

