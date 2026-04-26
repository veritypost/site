# LiveProgressSheet — T-016: Add rate limits to expert claim, ask, and back-channel routes
Started: 2026-04-26

## User Intent

Add `checkRateLimit` to three expert routes that currently have zero rate limiting. Owner-specified limits:
- `ask`: key=`expert-ask:{userId}`, max=5, windowSec=60
- `claim`: key=`expert-claim:{userId}`, max=30, windowSec=60
- `back-channel` POST: key=`expert-back:{userId}`, max=20, windowSec=60

In addition to route changes, seed three new rows into the `rate_limits` DB table (keys: `expert-ask`, `expert-claim`, `expert-back`) via a new migration at `schema/183_seed_expert_rate_limit_policies.sql`. GET on back-channel is read-only and does NOT get rate limiting.

## Live Code State

### Route files (all three confirmed fully read)

**`web/src/app/api/expert/queue/[id]/claim/route.js`** (35 lines)
- POST only. Pattern: `requirePermission('expert.queue.claim')` → `createServiceClient()` → `service.rpc('claim_queue_item', ...)`.
- No rate limiting present. No body parsing.
- Insertion point: after `createServiceClient()` call on line 23, before `service.rpc(...)` on line 24.

**`web/src/app/api/expert/ask/route.js`** (47 lines)
- POST only. Pattern: `v2LiveGuard()` → `requirePermission('expert.ask')` → body parse → `service.rpc('ask_expert', ...)`.
- No rate limiting present.
- Insertion point: after `createServiceClient()` on line 36, before body parse on line 28 (body parse actually comes before service client; reorder needed — see below).
  - Actual order in file: v2LiveGuard → requirePermission → body parse (line 28) → createServiceClient (line 36) → rpc.
  - CLAUDE.md mandate: requirePermission → createServiceClient → checkRateLimit → body parse. Need to move createServiceClient up before body parse and insert checkRateLimit after it.

**`web/src/app/api/expert/back-channel/route.js`** (84 lines)
- GET + POST handlers.
- GET: `requirePermission('expert.back_channel.read')` → query. No rate limiting, no mutation — GET is read-only, owner task specifies POST only.
- POST: `requirePermission('expert.back_channel.post')` → body parse (line 63) → `createServiceClient()` (line 69) → rpc.
  - Same reorder issue: createServiceClient must move before body parse; checkRateLimit inserts after.
- Insertion points:
  - POST handler: after requirePermission block, move createServiceClient up, then insert checkRateLimit, then body parse.

### rateLimit.js
- `checkRateLimit(supabase, { key, policyKey, max, windowSec })` — takes a Supabase client (service client is what all routes use), plus key (user-scoped string), policyKey (matches `rate_limits.key` column), max and windowSec as code defaults.
- Returns `{ limited, remaining, windowSec }`.
- 429 response must include `Retry-After: String(rate.windowSec ?? <windowSec>)` header.
- Fails closed on prod RPC errors, fails open in dev with `RATE_LIMIT_ALLOW_FAIL_OPEN=1`.
- `policyKey` is optional. If supplied, it hits `rate_limits` table by `key` column for DB override.

### Pattern reference (`web/src/app/api/comments/route.js`)
```js
const service = createServiceClient();
const rate = await checkRateLimit(service, {
  key: `comments:${user.id}`,
  policyKey: 'comments_post',
  max: 10,
  windowSec: 60,
});
if (rate.limited) {
  const retryAfter = String(rate.windowSec ?? 60);
  return NextResponse.json(
    { error: 'Posting too quickly. Wait a moment and try again.' },
    { status: 429, headers: { 'Retry-After': retryAfter } }
  );
}
```

### DB state
- `rate_limits` table confirmed via MCP. Columns: `id, key, display_name, description, max_requests, window_seconds, scope, applies_to_plans, burst_max, penalty_seconds, is_active, created_at, updated_at`.
- Current rows: 39 rows, zero expert rows. `expert-ask`, `expert-claim`, `expert-back` are all absent.
- Seed pattern from `schema/182_seed_comment_rate_limit_policies.sql`: `INSERT INTO public.rate_limits (key, max_requests, window_seconds, scope, is_active) VALUES (...) ON CONFLICT (key) DO NOTHING;`
- Next migration number: **183**.

### Import needed in each file
All three files currently import from `@/lib/auth`, `@/lib/supabase/server`. None import `checkRateLimit`. Need to add:
```js
import { checkRateLimit } from '@/lib/rateLimit';
```

## Contradictions

None. All three routes confirmed to have zero rate limiting. DB confirmed to have zero expert rate_limit rows. Plan matches live code.

## Agent Votes
- Planner: APPROVE
- Reviewer: APPROVE
- Final Reviewer: APPROVE
- Consensus: 3/3 APPROVE

## 4th Agent (if needed)
Not needed — unanimous.

## Implementation Progress
[filled during execution]

## Completed
[SHIPPED block written here when done]
