# LiveProgressSheet — T-012 / Fix messages/conversations brittle error-string status mapping
Started: 2026-04-26

## User Intent
Remove the brittle `msg.includes(...)` substring fallback branches from both messaging routes. Migration 150 is live in the DB — both `post_message` and `start_conversation` RPCs now emit `[CODE]` prefixes on every RAISE. The code-match branch already exists and handles all codes. The substring fallbacks were documented as a temporary bridge; bridge is now dead. Drop them and simplify `isSelf` to the code check alone.

## Live Code State

### messages/route.js (before)
Lines 51-54 contained brittle fallbacks:
- `else if (msg.includes('paid plan')) status = 403;`
- `else if (msg.includes('muted') || msg.includes('banned')) status = 403;`
- `else if (msg.includes('rate limit')) status = 429;`
- `else if (msg.includes('participant')) status = 403;`
Comment on lines 39-42 referenced "pre-migration window — delete once 150 applied everywhere."

### conversations/route.js (before)
Lines 73-76 contained brittle fallbacks:
- `else if (msg.includes('paid plan')) status = 403;`
- `else if (msg.includes('muted') || msg.includes('banned')) status = 403;`
- `else if (msg.includes('not found')) status = 404;`
- `else if (msg.includes('yourself')) status = 400;`
Line 78: `const isSelf = code === 'SELF_CONV' || msg.includes('yourself');` — `msg.includes` half was half-dead.

### DB (live, verified via pg_proc)
Both RPCs confirmed live in DB with [CODE] prefixes matching schema/150 exactly.

## Contradictions
None — live code and DB matched the plan exactly.

## Agent Votes
- Planner: APPROVE
- Reviewer: APPROVE
- Final Reviewer: APPROVE
- Consensus: 3/3 APPROVE

## 4th Agent (if needed)
Not needed.

## Implementation Progress
- messages/route.js: removed 4 msg.includes fallbacks, cleaned stale bridging comment
- conversations/route.js: removed 4 msg.includes fallbacks, cleaned bridging comment, simplified isSelf to `code === 'SELF_CONV'`
- tsc: clean
- commit: 78f8f22

## Completed
SHIPPED 2026-04-26 | commit 78f8f22 | files: web/src/app/api/messages/route.js, web/src/app/api/conversations/route.js
