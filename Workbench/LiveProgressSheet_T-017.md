# LiveProgressSheet — T-017: Add rate limit to quiz start and comment PATCH routes
Started: 2026-04-26

## User Intent
Add `checkRateLimit` to two routes:
1. `web/src/app/api/quiz/start/route.js` POST — key=`quiz-start:{userId}:{articleId}` (article-scoped), policyKey=`quiz-start`, max=3, windowSec=600
2. `web/src/app/api/comments/[id]/route.js` PATCH — key=`comment-edit:{userId}`, policyKey=`comment-edit`, max=5, windowSec=60

Both routes are missing rate limiting. A new migration (184) must seed the two `rate_limits` rows so ops can tune at runtime. No iOS changes. No permission changes.

Task entry from Current Tasks.md item 14:
"Add rate limit to quiz start and comment PATCH routes (T-017) — add checkRateLimit to both handlers. Affects: web/src/app/api/quiz/start/route.js, web/src/app/api/comments/[id]/route.js PATCH handler."

## Live Code State

### web/src/app/api/quiz/start/route.js (50 lines total)
- Line 1-9: imports — `requirePermission`, `assertKidOwnership`, `createServiceClient`, `v2LiveGuard`, `safeErrorResponse`. Does NOT import `checkRateLimit`.
- Line 10-24: `requirePermission('quiz.attempt.start')` → user object
- Line 26: body parse → `{ article_id, kid_profile_id }`
- Line 27-29: validates `article_id` present
- Line 31-37: `assertKidOwnership` if `kid_profile_id`
- Line 39: `createServiceClient()`
- Line 40-48: `start_quiz_attempt` RPC → return
- NO `checkRateLimit` call exists. Rate limit must go AFTER body parse (needs `article_id`) + AFTER `createServiceClient` (needs supabase instance). Current structure already has body parse before service client, so insertion point is line 39.5 — after `createServiceClient`, before RPC call.

### web/src/app/api/comments/[id]/route.js (65 lines total)
- Lines 9-37: PATCH handler — `requirePermission('comments.edit.own')` → user → body parse → `createServiceClient` → `edit_comment` RPC
- Lines 39-64: DELETE handler — separate export, must NOT be modified
- Line 5: imports — `requirePermission`, `createServiceClient`, `safeErrorResponse`. Does NOT import `checkRateLimit`.
- Rate limit insertion point: after `createServiceClient` (line 28), before RPC call (line 29). Key only needs `userId` (already in scope from requirePermission).

### web/src/lib/rateLimit.js
- `checkRateLimit(supabase, { key, policyKey, max, windowSec })` — fully implemented
- Looks up policyKey in `rate_limits` table with 60s cache, falls back to code defaults
- Returns `{ limited, remaining, windowSec }`
- Fail-closed in prod; fail-open only if `DEV_FAIL_OPEN` and `RATE_LIMIT_ALLOW_FAIL_OPEN=1`

### DB — rate_limits table
- Columns: id, key, display_name, description, max_requests, window_seconds, scope, applies_to_plans, burst_max, penalty_seconds, is_active, created_at, updated_at
- NO row for `quiz-start` exists
- NO row for `comment-edit` exists
- Last migration: 183 (expert rate limits). Next available: 184.
- Migration 182 pattern: `INSERT INTO public.rate_limits (key, max_requests, window_seconds, scope, is_active) VALUES (...) ON CONFLICT (key) DO NOTHING`

### Key naming conventions
- Existing: `comment_vote` (underscore), `expert-ask` (hyphen), `kids_pair` (underscore)
- Owner-specified: `quiz-start` and `comment-edit` (hyphen style, matching expert-* pattern)

## Helper Brief
Done correctly means:
1. `quiz/start` POST: after `assertKidOwnership` (or after `article_id` validation if no kid), create service client, call `checkRateLimit` with `key: quiz-start:${user.id}:${article_id}`, `policyKey: 'quiz-start'`, `max: 3`, `windowSec: 600`. If limited → 429 with `Retry-After: 600`. Then proceed to RPC.
2. `comments/[id]` PATCH only: after `createServiceClient`, call `checkRateLimit` with `key: comment-edit:${user.id}`, `policyKey: 'comment-edit'`, `max: 5`, `windowSec: 60`. If limited → 429 with `Retry-After: 60`. Then proceed to body parse and RPC.
3. Migration 184 seeds both `rate_limits` rows.
4. Both files add `checkRateLimit` to imports.
5. DELETE handler in comments/[id]/route.js is NOT touched.
6. Error message follows existing pattern: `{ error: 'Too many requests' }` with `Retry-After` header.
7. `tsc --noEmit` passes after changes.

Risks:
- Quiz key includes `articleId` which comes from body parse — must not call checkRateLimit before body is parsed (would need to read body twice). Current structure handles this correctly since body is parsed before service client is created.
- Do not accidentally move the `createServiceClient()` call earlier — it must stay after the permission check.
- PATCH handler pattern differs slightly from comments/route.js (which uses `requireAuth` + separate `hasPermissionServer`). The [id] PATCH uses `requirePermission` directly — maintain that pattern.

## Contradictions
None found. Live code matches expectations.

## Agent Votes
- Planner: APPROVE
- Reviewer: APPROVE
- Final Reviewer: APPROVE
- Consensus: 3/3 APPROVE

## 4th Agent (if needed)
[filled only if vote is split]

## Implementation Progress
- Migration 184 written: `schema/184_seed_quiz_comment_edit_rate_limit_policies.sql`
- `web/src/app/api/quiz/start/route.js`: added `checkRateLimit` import + rate limit block after `createServiceClient()`, before `start_quiz_attempt` RPC
- `web/src/app/api/comments/[id]/route.js`: added `checkRateLimit` import + rate limit block in PATCH handler only after `createServiceClient()`, before body parse + RPC; DELETE handler untouched
- `tsc --noEmit`: clean
- pre-commit hooks (lint-staged + prettier): clean

## Completed
SHIPPED 2026-04-26
Commit: 4040fd6
Files: web/src/app/api/quiz/start/route.js, web/src/app/api/comments/[id]/route.js, schema/184_seed_quiz_comment_edit_rate_limit_policies.sql
DB action pending: owner applies migration 184 via Supabase dashboard. Routes fall back to code defaults (same values) until applied.
