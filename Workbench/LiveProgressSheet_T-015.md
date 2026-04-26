# LiveProgressSheet — T-015
## Add rate limits to comment vote, flag, and report routes

**Started:** 2026-04-26
**Status:** PLAN APPROVED — READY FOR IMPLEMENTATION

---

## Phase 1 — Intake (COMPLETE)

### Intake Agent
- [x] Read vote/route.js — no rate limit; service client available after auth block
- [x] Read flag/route.js — no rate limit; service client currently after body parse (needs move)
- [x] Read report/route.js — no rate limit; mirrors article report pattern from api/reports/route.js
- [x] Read rateLimit.js — checkRateLimit(supabase, {key, policyKey, max, windowSec}); policyKey consults rate_limits with 60s cache; falls back to code defaults if no row
- [x] Read billing/cancel, bookmark-collections, api/reports for pattern reference
- [x] Documented insertion points and rate limit values

### Helper Agent
- [x] Read all three route files independently
- [x] Queried rate_limits table — no rows for comment_vote, comment_flag, or comment_report
- [x] Confirmed: existing `reports` row is 10/3600/user (article reports, different policyKey, no collision)
- [x] Documented done criteria

### Reconciled findings
- vote/route.js: add import + rate limit after createServiceClient(), before prior-vote lookup
- flag/route.js: move createServiceClient() before body parse, then add rate limit
- report/route.js: add import + rate limit after createServiceClient(), before body parse
- DB: 3 new rows needed in rate_limits (comment_vote, comment_flag, comment_report)

---

## Phase 2 — Plan

### vote/route.js
Add to imports: `import { checkRateLimit } from '@/lib/rateLimit';`

After `const service = createServiceClient();` (line 47), before the prior-vote lookup:
```js
const rate = await checkRateLimit(service, {
  key: `comment_vote:user:${user.id}`,
  policyKey: 'comment_vote',
  max: 30,
  windowSec: 60,
});
if (rate.limited) {
  return NextResponse.json(
    { error: 'Too many requests' },
    { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
  );
}
```

### flag/route.js
Add to imports: `import { checkRateLimit } from '@/lib/rateLimit';`

Move `const service = createServiceClient();` to before body parse.
Add rate limit check immediately after:
```js
const service = createServiceClient();
const rate = await checkRateLimit(service, {
  key: `comment_flag:user:${user.id}`,
  policyKey: 'comment_flag',
  max: 20,
  windowSec: 3600,
});
if (rate.limited) {
  return NextResponse.json(
    { error: 'Too many requests' },
    { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 3600) } }
  );
}
const { category_id, reason, description } = await request.json().catch(() => ({}));
```

### report/route.js
Add to imports: `import { checkRateLimit } from '@/lib/rateLimit';`

After `const service = createServiceClient();`, before body parse:
```js
const rate = await checkRateLimit(service, {
  key: `comment_report:user:${user.id}`,
  policyKey: 'comment_report',
  max: 10,
  windowSec: 3600,
});
if (rate.limited) {
  return NextResponse.json(
    { error: 'Too many requests' },
    { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 3600) } }
  );
}
```

### DB seed
Migration: 3 rows in rate_limits:
- `comment_vote` — max_requests=30, window_seconds=60, scope='user', is_active=true
- `comment_flag` — max_requests=20, window_seconds=3600, scope='user', is_active=true
- `comment_report` — max_requests=10, window_seconds=3600, scope='user', is_active=true

---

## Phase 3 — Vote

VOTER 1 (pattern correctness): APPROVE
- Insertion points match established pattern (requirePermission -> createServiceClient -> checkRateLimit -> body parse)
- Key format `<svc>:user:<id>` consistent with billing.cancel and reports usage
- policyKey naming is snake_case consistent with DB keys
- 429 includes Retry-After using rate.windowSec (not hardcoded fallback literal)
- DB rows seeded so policy lookup resolves on first call

VOTER 2 (side-effects / regressions): APPROVE
- flag/route.js createServiceClient move is safe — service client is stateless, construction order is arbitrary
- body parse still happens before RPC call in all three routes — no behavioral change on success path
- comment_report policyKey differs from `reports` (article reports) — no collision
- vote rate limit is user-scoped, not comment-scoped — correct (one window per user)
- All three routes require auth before rate check — no anon rate limit keys possible

VOTER 3 (completeness): APPROVE
- All three named routes covered
- Import added to all three files
- DB seeded for all three keys
- Retry-After header present on all three 429s
- tsc: no new types introduced (checkRateLimit is JS, no type file changes needed)

RESULT: 3/3 APPROVE

---

## Phase 4 — Implementation

- [ ] Patch vote/route.js
- [ ] Patch flag/route.js
- [ ] Patch report/route.js
- [ ] Apply DB migration (3 rate_limits rows)
- [ ] Run tsc

---

## Phase 5 — Review + Commit + SHIPPED

- [ ] Review agent verifies all 3 files + DB
- [ ] Commit
- [ ] Remove item 13 from Current Tasks.md
- [ ] Write SHIPPED block
