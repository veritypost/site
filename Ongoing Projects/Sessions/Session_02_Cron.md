# Session 2 — Cron Routes + vercel.json + cronLog

**Created:** 2026-04-27
**Owner of session:** the agent running this file
**Hermetic scope (strict):**
- `web/src/app/api/cron/**` — every cron handler under here
- `web/vercel.json` — the cron schedule manifest
- `web/src/lib/cronLog.js` — the heartbeat / audit wrapper

This session is **self-contained.** Source docs (`*_READ_ONLY_HISTORICAL.md` in `Ongoing Projects/`) are frozen historical reference. This session file is canonical — every owner decision, every audit citation, every verification command is reproduced inline below. No upstream lookup needed.

---

## Hermetic guarantee

This session edits ONLY the three paths above. Do not touch any other file. If a fix surfaces an off-domain need (e.g., a migration to drop a dead table referenced by a purge cron), do not edit it here — flag the dependency under "Dependencies on peer sessions" inside the affected item, and leave the upstream slice for the owning session to ship.

Hard rules:
1. NEVER edit a file outside `web/src/app/api/cron/**`, `web/vercel.json`, or `web/src/lib/cronLog.js`.
2. Do not break the `withCronLog(name, handler)` public signature in `cronLog.js` — every cron handler imports and wraps with it.
3. New cron handlers ARE in scope (creation), provided the schedule line in `vercel.json` ships in the same commit.
4. Cron BUSINESS LOGIC changes that aren't security/scheduling/heartbeat concerns are out of scope (e.g., changing what `recompute-family-achievements` calculates lives in S6, not S2). The Q4.2 send-push / send-emails redesign IS in scope because it's a scheduling redesign.
5. Final pre-ship grep:
   ```bash
   grep -rn "verifyCronAuth" web/src/app/api/cron/ | grep -v "\.ok"
   ```
   Should return zero hits before commit.

---

## Multi-agent shipping process (per-item, non-negotiable)

Per memory `feedback_4pre_2post_ship_pattern` + `feedback_genuine_fixes_not_patches` + `feedback_batch_mode_4_parallel_implementers`. Every item in this session ships through this pipeline:

**Pre-impl (4 agents, sequential or parallel):**
1. **Investigator** — read the cited file at the cited line, verify the current state matches what this manual claims. Quote the live code in the agent log. If the audit claim is stale (e.g., a Wave 19/20/21 fix already landed), mark the item RESOLVED and skip remaining stages.
2. **Planner** — design the change. For multi-file fixes (A1 across 3 routes, A17 across 2 schedule lines), enumerate every edit. Show a diff sketch.
3. **Big-picture reviewer** — cross-file impact pass. Does this commit touch any caller? Does the change interact with another item in this session? Are there any sessions that depend on this slice landing first?
4. **Independent adversary** — try to break the plan. For schedule changes, ask: "what runs at the same minute now? what shares a Supabase pool connection? what would a misconfigured Vercel project do under this schedule?" For auth fixes, ask: "what's the failure mode if the env var is missing? what does an empty `Authorization` header do? what does a Vercel cron header look like?"

**Implementer(s) (1-N parallel):**
- Use isolated file ownership when parallelizing. A1 across 3 route files = 3 implementers each owning one file. A17 + A18 in `vercel.json` = 1 implementer (same file).

**Post-impl (2 agents):**
1. **Independent code reviewer** — re-read the diffs. Confirm no off-domain edits. Confirm `withCronLog(name, handler)` shape unchanged. Confirm all `verifyCronAuth(request)` calls in changed files use `.ok`.
2. **Security/correctness reviewer** — for security-sensitive items (A1, A71): verify the failure mode is fail-closed. For schedule changes (A17, A18, A34, A35): verify no two crons share a minute, verify the new handlers have heartbeat + auth.

**Divergence resolution (per memory `feedback_divergence_resolution_4_independent_agents`):**
When pre-impl agents disagree (e.g., adversary says "this breaks Vercel cron header detection" but planner disputes), dispatch 4 fresh independent agents on the disputed point. Their verdict decides. Don't bring technical disputes to owner.

**Commit message format:**
```
fix(cron): [S2-Annn] <one-line summary>

<body explaining the why and the verification done>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Genuine fixes, never patches

Per memory `feedback_genuine_fixes_not_patches`. Each item in this session ships as a complete fix:

- **Kill the thing being replaced.** A1 fix doesn't add a wrapper around the broken `verifyCronAuth(request)` call — it changes the call site.
- **No parallel paths.** Don't add a "new" auth check while leaving the old broken one as a fallback.
- **No TODOs / HACKs / "fix later" comments.** Every line shipped is the intended end state.
- **Types + callers + data flow coherent.** If `webhook_log.event_id` becomes random-suffixed, every reader of that column (dashboards, queries, ops scripts) keeps working — `event_id` was never a foreign key, it was just opportunistically deterministic.
- **Surface tradeoffs when a patch is the only option.** A34/A35 drain-until-empty design is a deliberate tradeoff (Vercel function 30s ceiling vs. queue size growth) — that tradeoff is documented inline with the implementation.

---

## Verification authority

Every claim in this manual was verified against:
- `web/vercel.json` — read 2026-04-27
- `web/src/lib/cronLog.js` — read 2026-04-27
- The cited cron handler files (line numbers may shift; verify before editing)

**Before editing any file:** re-read it. Memory rule `feedback_verify_audit_claims_against_current_code` — "~5/35 items in past audits were stale." Quote the current code in the investigator agent's log. If the file's state diverges from this manual, prefer the live file and update this manual in the same commit.

If any item below is observed to already be fixed (Wave 19/20/21 may have touched these), mark it 🟩 RESOLVED with the commit hash + date and move on.

---

## Status legend

- 🟦 = open, ready to ship
- 🟧 = owner decision pending (don't ship until resolved)
- 🟨 = depends on peer session (named in item)
- 🟩 = shipped (commit hash recorded in line item)
- 🟥 = blocked (reason in item)

---

# Items

## S2-A1 — Three cron routes accept any unauthenticated caller

**Title:** Fix `verifyCronAuth(request).ok` check in cron auth gates.
**Source:** TODO A1 (verified 2026-04-27).
**Severity:** P0 — live security hole. Public, attacker-callable cron endpoints running as service-role with billing/DOB/subscription/kid-profile mutation power.
**Status:** 🟦 OPEN.

### Files (current state in production today)

- `web/src/app/api/cron/birthday-band-check/route.ts:95`
- `web/src/app/api/cron/dob-correction-cooldown/route.ts:202`
- `web/src/app/api/cron/subscription-reconcile-stripe/route.ts:163`

⚠️ **Note:** A fourth file (`pro-grandfather-notify/route.ts`) was previously listed but the cron and its handler were **deleted** in the Q1 tier-collapse ship (see OWNER-ANSWERS Q1 / Q1a). Skip that file. If it still exists in your tree, that's a separate cleanup — flag it and confirm Q1's cron deletion was actually executed.

### The bug

`verifyCronAuth(request)` returns an object: `{ ok: boolean, reason: string, vercel_cron: boolean }`. The current code reads:

```ts
if (!verifyCronAuth(request)) {
  return new Response('Forbidden', { status: 403 });
}
```

`!{...}` is always `false` for any non-null object, so the guard NEVER fires. Every unauthenticated request passes through.

### The fix

Change in all three files:

```ts
// BEFORE
if (!verifyCronAuth(request)) {
  return new Response('Forbidden', { status: 403 });
}

// AFTER
const auth = verifyCronAuth(request);
if (!auth.ok) {
  return new Response('Forbidden', { status: 403 });
}
```

Same files may also have wrong-shape `logCronHeartbeat(name, result)` calls (legacy heartbeat helper that predates `withCronLog`). Audit these in the same commit — heartbeats should now flow through `withCronLog(name, handler)` from `cronLog.js`, not via inline calls.

### Why it matters

These routes mutate billing, DOB, subscriptions, kid-profile state with the service-role key. An unauthenticated POST from any IP triggers the full handler. Prior to this fix, an attacker could:
- Force a Stripe sub reconcile run, potentially triggering false downgrades or grace-period clears.
- Run birthday-band-check on demand to flip kid age bands.
- Force DOB-correction-cooldown logic to clear cooldowns.

### Dependencies on peer sessions

None. Pure cron-handler edit. No DB migration, no peer-session coordination.

### Verification

```bash
# 1. Local code grep — should return zero hits after the fix:
grep -rn "verifyCronAuth(request))" web/src/app/api/cron/ | grep -v "\.ok"

# 2. Live curl against deployed cron, no Authorization header — should 403:
curl -i https://veritypost.com/api/cron/birthday-band-check
curl -i https://veritypost.com/api/cron/dob-correction-cooldown
curl -i https://veritypost.com/api/cron/subscription-reconcile-stripe

# 3. Live curl WITH the Vercel cron header simulation (if CRON_SECRET is set):
curl -i -H "Authorization: Bearer $CRON_SECRET" https://veritypost.com/api/cron/birthday-band-check
# expect 200
```

### Multi-agent process

3 implementers in parallel (one per file). Pre-impl investigator confirms each file's current state matches the diff above before edits begin. Post-impl reviewer runs the grep verification across the full `web/src/app/api/cron/` tree, not just the three flagged files.

---

## S2-A17 — Cron schedule overlap collisions

**Title:** Stagger 2 collision pairs in `vercel.json`.
**Source:** TODO A17 / PotentialCleanup §C2 (verified 2026-04-27).
**Severity:** P1 — no symptoms today; will surface at launch when Supabase pool exhaustion under concurrent crons starts queueing connections.
**Status:** 🟦 OPEN.

### Current state in `web/vercel.json`

Two collision pairs share a minute:

| Minute | Cron A | Cron B |
|---|---|---|
| `30 3 * * *` | `recompute-family-achievements` | `anonymize-audit-log-pii` |
| `0 4 * * *` | `process-deletions` | `purge-webhook-log` |

Both pairs target overlapping Postgres tables. The `webhook_log` table is touched by the cron-log wrapper too (every cron run emits a row), so the second pair has triple contention at `0 4`.

### The fix

Edit `web/vercel.json` to stagger:

```json
// BEFORE
{ "path": "/api/cron/anonymize-audit-log-pii", "schedule": "30 3 * * *" },
{ "path": "/api/cron/purge-webhook-log",       "schedule": "0 4 * * *" },

// AFTER
{ "path": "/api/cron/anonymize-audit-log-pii", "schedule": "25 3 * * *" },
{ "path": "/api/cron/purge-webhook-log",       "schedule": "5 4 * * *" },
```

Why these specific minutes: `25` and `5` keep the crons in their existing 5-minute neighborhood, don't collide with any other registered cron, and don't push into the 6am EDT prime-incident window when staffed ops would notice failures fastest.

### Why it matters

At pre-launch traffic this is invisible (60-conn Supabase pool, two concurrent crons each open a few). At any meaningful scale — say, post-AdSense traffic with a user table in the millions — `recompute-family-achievements` opens a long transaction touching `family_achievement_progress` and `family_achievements`; `anonymize-audit-log-pii` opens long-running UPDATEs on `audit_log`. Both crons share the pool with live API traffic. Co-scheduling is a self-inflicted incident waiting to happen.

### Dependencies on peer sessions

None.

### Verification

```bash
# 1. Confirm the JSON parses:
node -e "JSON.parse(require('fs').readFileSync('web/vercel.json'))"

# 2. Confirm no two crons share a minute:
node -e "
  const { crons } = require('./web/vercel.json');
  const seen = {};
  for (const c of crons) {
    const min = c.schedule.split(' ').slice(0,2).join(' ');
    if (seen[min]) console.log('COLLISION:', min, '->', seen[min], 'and', c.path);
    seen[min] = c.path;
  }
"
# expect zero output
```

### Multi-agent process

1 implementer (single file). Adversary checks: does any minute pair (e.g., `25 3` and `30 3`) share Supabase tables AND wall-clock window AND pool capacity? At 3am UTC this is fine. Confirm.

---

## S2-A18 — Two cron handlers exist but never run

**Title:** Register `cleanup-data-exports` and `rate-limit-cleanup` in `vercel.json`.
**Source:** TODO A18 / PotentialCleanup §C3 (verified 2026-04-27).
**Severity:** P2 — no immediate failure; storage and `rate_limit_events` table grow unbounded over time. Becomes P1 after 30-60 days of production traffic.
**Status:** 🟦 OPEN.

### Current state

Files exist:
- `web/src/app/api/cron/cleanup-data-exports/route.ts`
- `web/src/app/api/cron/rate-limit-cleanup/route.ts`

Neither is referenced in `web/vercel.json`. Both run **never** unless someone manually `curl`s them.

### The fix

Add to `web/vercel.json` `crons` array:

```json
{
  "path": "/api/cron/cleanup-data-exports",
  "schedule": "15 5 * * *"
},
{
  "path": "/api/cron/rate-limit-cleanup",
  "schedule": "45 5 * * *"
}
```

Why these times:
- `15 5 * * *` — daily, 1h after `send-push` (`0 5`) and 30min after `sweep-beta` (`30 5`) which is also at 5:30, but the existing `5:30` slot is already in the file (`30 5` for sweep-beta) — pick `15 5` to keep distance.
- `45 5 * * *` — daily, 30min after `cleanup-data-exports`, 30min before `pipeline-cleanup` (`0 6`). No collision.

If `rate-limit-cleanup` should be **hourly** instead of daily (table fills faster), use `0 * * * *`. Audit the route handler before deciding — read what window it sweeps. Default to daily unless the handler explicitly assumes hourly.

### Pre-flight: confirm both handlers have heartbeat + auth

Open each file and confirm:
1. Handler is wrapped in `withCronLog('cleanup-data-exports', async (request) => {...})` (or equivalent name).
2. First check inside the handler is `const auth = verifyCronAuth(request); if (!auth.ok) return new Response('Forbidden', { status: 403 });`.

If either is missing, fix in the same commit. These files were left in an unscheduled state precisely because nobody paid attention to them — assume drift.

### Why it matters

`data_requests` rows produce CSV/JSON exports stored in Supabase Storage. Without `cleanup-data-exports` running, every requested export stays forever. Storage costs grow linearly with user-volume × export frequency. `rate_limit_events` is hot-path — every API call writes to it; without sweep, the table grows by ~1M rows/day at modest scale and tanks query performance on the rate-limit lookups.

### Dependencies on peer sessions

None directly. If S6 (admin/pipeline) is concurrently auditing rate-limit logic and decides to move `rate_limit_events` to a Redis-style ephemeral store, this cron becomes vestigial — but that's a future rewrite, not a blocker.

### Verification

```bash
# 1. Confirm both routes are in vercel.json:
grep -E "cleanup-data-exports|rate-limit-cleanup" web/vercel.json

# 2. Live trigger via curl (with CRON_SECRET):
curl -i -H "Authorization: Bearer $CRON_SECRET" https://veritypost.com/api/cron/cleanup-data-exports
curl -i -H "Authorization: Bearer $CRON_SECRET" https://veritypost.com/api/cron/rate-limit-cleanup
# expect 200 + a `webhook_log` row with source='cron' and event_type='cron:cleanup-data-exports' / 'cron:rate-limit-cleanup'

# 3. DB check post-trigger:
SELECT event_type, processing_status, processing_duration_ms, processing_error
  FROM webhook_log
 WHERE source = 'cron'
   AND event_type IN ('cron:cleanup-data-exports', 'cron:rate-limit-cleanup')
 ORDER BY processed_at DESC LIMIT 4;
```

### Multi-agent process

1 implementer (single `vercel.json` file). Investigator first opens both handler files and confirms auth + heartbeat are present; if missing, that's added to the same commit. Adversary checks: do these new minutes collide with anything already scheduled?

---

## S2-A34 + S2-A35 — `send-push` and `send-emails` cadence (Q4.2 LOCKED)

**Title:** Redesign push + email cron handlers as drain-until-empty per call, scheduled every 5 minutes.
**Source:** TODO A34 + A35 / PotentialCleanup §C1 / OWNER-ANSWERS Q4.2 (verified 2026-04-27).
**Severity:** P0 for `send-push` (breaking-news has 24h SLA today against the comment that promises "every minute"); P1 for `send-emails`.
**Status:** 🟦 OPEN — owner decision LOCKED to Path B (drain-until-empty per Q4.2). Path A (Vercel Pro upgrade for sub-minute cron) was rejected — pre-launch traffic doesn't justify the Pro tier cost.

### Current state

`web/vercel.json`:
```json
{ "path": "/api/cron/send-emails", "schedule": "45 4 * * *" },
{ "path": "/api/cron/send-push",   "schedule": "0 5 * * *"  },
```

`web/src/app/api/cron/send-push/route.js` line 21 docstring says: *"Schedule: every minute (vercel.json)"* — comment lies. The cron runs once per day at 5am UTC.

Same shape for `send-emails`.

Effect today: a "breaking news" push fired at 5:01am UTC has a 23h59m latency. A user-reply notification ("Alice replied to your comment") fired any time after 5am UTC waits until next morning. Hard P0 once any traffic ships.

### Q4.2 LOCKED design — drain-until-empty per call, 5-minute schedule

**Schedule:** `*/5 * * * *` for both `send-push` and `send-emails`.

**Per-call behavior:** loop, claim a batch from the pending queue, send, mark sent, repeat — until either (a) the queue is empty, or (b) the wall clock exceeds a safe budget under the Vercel function 30s hard limit. Claim batches via `FOR UPDATE SKIP LOCKED` to allow safe overlap if a long-running call is still draining when the next 5-minute tick fires.

**Why this design:**
- Vercel free + hobby tiers cap cron resolution at 1/day; only Pro allows arbitrary minute-level. `*/5 * * * *` works on Pro but Q4.2 also assumed paid tier — confirm with owner before flipping the schedule string. If still on a tier that doesn't support `*/5`, this item is 🟧 OWNER PENDING until tier is upgraded; if Pro is provisioned, ship.
- 30s function limit on Vercel hobby/Pro means we can't drain an arbitrarily large queue in one call. The drain loop respects a 25s wall-clock budget — leaves a 5s margin for the cron-log heartbeat to write the `webhook_log` row before the platform kills the function.
- `FOR UPDATE SKIP LOCKED` claims allow the next scheduled tick to start draining while the current one is still finishing, without double-sending.
- 5-minute cadence means a backlog of N items drains in `ceil(N / batch_per_tick) * 5min`. Under expected traffic (breaking news fan-out to ~10k recipients), batch_per_tick can claim ~200 per loop iteration, ~50 iterations per call → 10k drained in one tick. Bigger fan-outs cascade to subsequent ticks.

**Wait for:** confirmation that Pro tier is provisioned. If owner has not yet upgraded, file this as 🟧 OWNER PENDING. **Do NOT ship the schedule change without paid-tier confirmation** — Vercel will silently fail to honor `*/5` on a tier that doesn't support it and the cron will run on its highest available cadence (often daily), reproducing the original bug under a misleading config.

### Drain loop code structure

For `web/src/app/api/cron/send-push/route.js` (analogous shape for `send-emails`):

```js
import { createServiceClient } from '@/lib/supabase/server';
import { withCronLog } from '@/lib/cronLog';
import { verifyCronAuth } from '@/lib/auth';
import { sendPushBatch } from '@/lib/push'; // existing helper, fan out a batch to APNs/FCM

const BATCH_SIZE = 200;
const WALL_CLOCK_BUDGET_MS = 25_000; // leave 5s for cron-log + Vercel cleanup
const MAX_ITERATIONS = 1_000;        // hard safety bound

async function handler(request) {
  const auth = verifyCronAuth(request);
  if (!auth.ok) return new Response('Forbidden', { status: 403 });

  const service = createServiceClient();
  const t0 = Date.now();

  let totalClaimed = 0;
  let totalSent = 0;
  let totalFailed = 0;
  let iter = 0;

  while (iter < MAX_ITERATIONS) {
    if (Date.now() - t0 > WALL_CLOCK_BUDGET_MS) {
      // Budget exhausted; next tick will continue.
      break;
    }

    // Claim a batch atomically. claim_push_batch should:
    //   SELECT ... FROM push_queue WHERE status='pending'
    //   ORDER BY created_at LIMIT p_limit
    //   FOR UPDATE SKIP LOCKED
    //   then UPDATE status='claimed' RETURNING ...
    const { data: batch, error: claimErr } = await service
      .rpc('claim_push_batch', { p_limit: BATCH_SIZE });

    if (claimErr) {
      // Claim failure is structural; bubble.
      throw new Error(`claim_push_batch failed: ${claimErr.message}`);
    }
    if (!batch || batch.length === 0) {
      // Queue empty; clean exit.
      break;
    }

    totalClaimed += batch.length;

    // Fan out. sendPushBatch returns {sent, failed, results[]}
    const result = await sendPushBatch(batch);
    totalSent += result.sent;
    totalFailed += result.failed;

    // Mark each row's terminal status. ack_push_batch takes the
    // claim ids + per-id outcome and updates push_queue.status to
    // 'sent' or 'failed' (with failure reason).
    await service.rpc('ack_push_batch', {
      p_results: result.results, // [{id, ok, error}]
    });

    iter += 1;
  }

  return Response.json({
    ok: true,
    iterations: iter,
    claimed: totalClaimed,
    sent: totalSent,
    failed: totalFailed,
    duration_ms: Date.now() - t0,
    drained: iter < MAX_ITERATIONS && totalClaimed === 0,
  });
}

export const POST = withCronLog('send-push', handler);
export const GET = withCronLog('send-push', handler); // Vercel cron uses GET
```

**Notes on the design:**
- `claim_push_batch` and `ack_push_batch` are RPCs that must exist (or be created). T0.3 in TODO_READ_ONLY_HISTORICAL.md flags `claim_push_batch` as MISSING in production today — that's an S1 (DB Migrations) deliverable, now expanded to cover all four drain RPCs (`claim_push_batch` + `ack_push_batch` + `claim_email_batch` + `ack_email_batch`) under a single migration in S1-T0.3. Without all four, the redesigned push + email handlers cannot ship. Mark this item 🟨 DEPENDS ON S1-T0.3.
- `sendPushBatch` is the existing fan-out helper. Verify its current signature; if it doesn't return `{sent, failed, results[]}`, either adjust the loop or refactor the helper. Refactor lives in this session ONLY if the helper is in `web/src/lib/` AND owned by S2 — likely not (push helper is shared lib). If outside scope, document the contract this loop expects and coordinate with S5 (which owns push routes) or S6 (which owns shared push libs depending on layout).
- `MAX_ITERATIONS` is a guard against pathological pending queues + buggy ack — it caps a single call to 1000 iterations × 200 = 200k items max regardless of wall clock. In practice the wall-clock budget triggers first.
- `drained: true` in the response indicates "queue was empty when we exited" — useful signal for monitoring (drained-on-every-tick = healthy; never-drained = fan-out outpacing send capacity).

### Update the docstring comments

In `send-push/route.js` and `send-emails/route.js`, replace the lying comments:

```js
// BEFORE
// Schedule: every minute (vercel.json)

// AFTER
// Schedule: */5 * * * * (drain-until-empty per call; respects 25s wall-clock budget)
// See Sessions/Session_02_Cron.md S2-A34 for design rationale.
```

### Why it matters

Push notifications and transactional emails are the platform's two real-time fan-out paths. A 24h SLA on either is a product-killing bug:
- Breaking-news push 24h late = irrelevant.
- Reply-notification email 24h late = recipient already moved on; engagement loop dies.
- Password-reset email 24h late = user thinks the system is broken; signs up for a competitor.

The cost-side (Vercel Pro) is real but small — owner-locked decision is to pay it once revenue starts, not before. Pre-revenue, the drain-until-empty design with a 5-minute floor is the best fidelity available.

### Dependencies on peer sessions

- **S1 (DB Migrations) — S1-T0.3 covers all four RPCs (`claim_push_batch` + `ack_push_batch` + `claim_email_batch` + `ack_email_batch`) in a single migration as of 2026-04-27.** The 4-RPC dependency is now wholly contained in S1-T0.3; once that ships and `pg_proc` returns four rows for those names, S2 unblocks. Coordinate ship: S1 lands the migration, then S2 ships both redesigned handlers in one PR. Mark this item 🟨 DEPENDS ON S1-T0.3 until confirmed live.
- **S5 (Social) or S6 (Admin/Pipeline)** — if `sendPushBatch` / `sendEmailBatch` helpers live under those sessions' shared libs, the contract this loop expects (`{sent, failed, results[]}`) needs to be honored or the helper refactored. Treat as read-only contract here; flag for the owning session if a refactor is needed.

### Verification

```bash
# 1. After ship, every 5 minutes there should be a webhook_log row:
SELECT event_type, processing_status, processing_duration_ms,
       payload->>'iterations' AS iter, payload->>'claimed' AS claimed,
       payload->>'sent' AS sent, payload->>'drained' AS drained
  FROM webhook_log
 WHERE source = 'cron'
   AND event_type = 'cron:send-push'
   AND processed_at > now() - interval '30 minutes'
 ORDER BY processed_at DESC;
# expect ~6 rows (every 5min × 30min). drained='true' on healthy ticks.

# 2. Insert a test push, force a tick, verify it drains:
INSERT INTO push_queue (user_id, type, payload, status)
  VALUES ('<test-user-id>', 'test', '{"title":"hello"}'::jsonb, 'pending');
# (wait <5min, OR manually curl the cron endpoint with CRON_SECRET)
SELECT status FROM push_queue WHERE user_id='<test-user-id>' AND type='test';
# expect 'sent' or 'failed' (not 'pending' or 'claimed')

# 3. Confirm no overlap deadlock under load — insert 5000 rows, force two
#    overlapping ticks (curl twice within 1s), confirm all 5000 land in
#    a terminal state (sent + failed) within ~5min:
SELECT status, count(*) FROM push_queue WHERE created_at > now() - interval '10 minutes' GROUP BY status;
```

### Multi-agent process

This is the highest-stakes item in this session. Use full 6-agent ship pattern:
- **4 pre-impl agents** (investigator, planner, big-picture, adversary) — adversary specifically probes: "what happens if `claim_push_batch` returns mid-batch failures? what if `ack_push_batch` succeeds but the function dies before returning? what if two overlapping calls both claim the same row (SKIP LOCKED prevents this — verify the RPC body)? what if Vercel kills the function at 30s exactly mid-`ack_push_batch`?"
- **2 implementers in parallel** — one for `send-push/route.js`, one for `send-emails/route.js`. Same loop shape, different helper calls.
- **2 post-impl reviewers** — code reviewer confirms the loop budget math, drain semantics, and `withCronLog` wrapping. Security reviewer confirms `verifyCronAuth(request).ok` is the first thing inside the handler and that `claim_push_batch` is service-role-only (RLS check).

---

## S2-A71 — `webhook_log.event_id` collision under concurrency

**Title:** Append a random suffix to `event_id` in `cronLog.js`.
**Source:** TODO A71 (verified 2026-04-27 against `web/src/lib/cronLog.js:48`).
**Severity:** P1 — under the new `*/5` cadence (S2-A34/A35) two cron ticks can fire within the same `startedAt` ISO second under retry. Current `event_id = cron:${name}:${startedAt}` is deterministic; same-second retries collide on the implicit unique constraint.
**Status:** 🟦 OPEN.

### Current state in `web/src/lib/cronLog.js:48`

```js
event_id: `cron:${name}:${startedAt}`,
```

Where `startedAt = new Date().toISOString()` (millisecond resolution but only as a string; Postgres dedup treats this as text). Under the new 5-minute drain schedule, an overlapping retry (e.g., Vercel retries a failed tick) within the same ISO second triggers a 23505 unique-constraint violation — and the catch block logs `console.error` and moves on. The original cron error is lost; only the duplicate-event_id error gets logged.

Verify the unique constraint:
```sql
SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid = 'public.webhook_log'::regclass
   AND contype IN ('u','p');
```

If `(source, event_id)` is unique (likely is, per the original Stripe webhook dedup design), this collision is real.

### The fix

Edit `web/src/lib/cronLog.js`:

```js
// BEFORE (line 1, top of file):
import { createServiceClient } from '@/lib/supabase/server';
import { captureException, captureMessage } from '@/lib/observability';

// AFTER:
import { createServiceClient } from '@/lib/supabase/server';
import { captureException, captureMessage } from '@/lib/observability';
import { randomBytes } from 'crypto';
```

```js
// BEFORE (line ~48):
event_id: `cron:${name}:${startedAt}`,

// AFTER:
event_id: `cron:${name}:${startedAt}:${randomBytes(4).toString('hex')}`,
```

The 4-byte random suffix gives 32 bits of entropy = ~4B distinct values; collision probability on the same `(name, startedAt)` is negligible.

### Why it matters

The webhook_log row is the only durable trace of cron runs. When the row write fails on a 23505 collision, the catch block logs to `console.error` and returns. The cron RAN — but no audit row, no Sentry event for the run itself (only for the duplicate-key error which is the wrong signal). Ops loses visibility on the second-hit run entirely.

This was tolerable when crons ran daily (collisions impossible); it's a real bug under the 5-minute cadence Q4.2 introduces.

### Dependencies on peer sessions

None — `cronLog.js` is owned by this session.

### Verification

```bash
# 1. Trigger two crons in rapid succession:
curl -H "Authorization: Bearer $CRON_SECRET" https://veritypost.com/api/cron/sweep-beta &
curl -H "Authorization: Bearer $CRON_SECRET" https://veritypost.com/api/cron/sweep-beta &
wait

# 2. Confirm both rows landed:
SELECT event_id, processed_at FROM webhook_log
 WHERE source='cron' AND event_type='cron:sweep-beta'
 ORDER BY processed_at DESC LIMIT 4;
# expect two distinct event_id rows with different random suffixes

# 3. Schema invariants intact:
SELECT count(*) FROM webhook_log WHERE event_id LIKE 'cron:%' AND length(event_id) < 30;
# expect 0 (every new event_id includes the 8-char hex suffix; min length increases)
```

### Multi-agent process

1 implementer (single file, surgical edit). Adversary check: does any downstream consumer parse `event_id` to extract `name` or `startedAt`? Grep:

```bash
grep -rn "event_id" web/src/ | grep -v webhook_log | grep cron
```

If any consumer split-parses, account for the new third segment (suffix) — likely no downstream parser exists, but verify before ship.

---

## S2-D6 (partial verify) — `pipeline-cleanup` archive_cluster cast through unknown

**Title:** Confirm `archive_cluster` RPC cast in `pipeline-cleanup` is not in S2 scope; flag for S1.
**Source:** PotentialCleanup §D6 (INHERITED, verify against current code).
**Severity:** P2 — fragile pattern; types-regen lives in S6 deliverables (or S1 depending on owner allocation). This session VERIFIES the cron handler is in our path and either fixes the type cast inline or hands off.
**Status:** 🟨 DEPENDS — pre-impl investigator decides.

### Current state

PotentialCleanup §D6 cites `web/src/app/api/cron/pipeline-cleanup/route.ts:256-265` as casting `service.rpc('archive_cluster', ...)` through `unknown` because `web/src/types/database.ts` hasn't been regenerated since migration 126.

### Investigator action

Open `web/src/app/api/cron/pipeline-cleanup/route.ts` lines 256-265. Confirm the cast is still there:

```ts
// Look for shape like:
const { data, error } = await (service.rpc as unknown as (...) => ...)('archive_cluster', { ... });
// or:
const { data } = await (service as unknown).rpc('archive_cluster', { ... });
```

If present and the RPC is real (verify in `pg_proc`), the genuine fix is types regeneration — which is OUT OF S2 SCOPE (touches `web/src/types/database.ts`, owned by S1 or S6 depending on layout).

### Resolution paths

- **(A)** If the cast IS in our cron file but types-regen is the right fix → mark this item 🟨 DEPENDS ON S1 (or S6, whoever owns `types/database.ts` regeneration). Do not ship a workaround in this session.
- **(B)** If the cast was already cleaned up by a prior wave → mark 🟩 RESOLVED.
- **(C)** If the cast is in our cron file AND types-regen is delayed AND the cast is causing a real runtime issue → an inline narrow type assertion is acceptable as a stopgap, but document it as "pending types regen" and remove the comment as soon as S1/S6 lands the regen.

### Why it matters

The cast isn't broken at runtime — it works because TypeScript erases at compile, and the RPC name + payload shape match what the DB function expects. The risk is silent regression: someone reorders the RPC's argument list or drops a column, the cast hides the type error, and the cron silently fails or no-ops on the next run.

### Dependencies

- **S1 or S6** — types regeneration from current production schema. Until that lands, this item stays 🟨.

### Verification

```bash
# 1. Confirm RPC exists in production:
# (run via Supabase MCP execute_sql)
SELECT proname FROM pg_proc WHERE proname = 'archive_cluster';

# 2. Confirm types match (post-regen):
grep -A 5 "archive_cluster" web/src/types/database.ts
# should show full Args + Returns shape, not 'unknown'
```

---

## S2-§D6-CAST — `pipeline-cleanup` `archive_cluster` cast removal (post-types-regen)

**Title:** Remove the `as unknown` cast in `pipeline-cleanup/route.ts:256-265` once `web/src/types/database.ts` includes `archive_cluster`.
**Source:** Moved here from `Session_06_Admin.md` S6-Cleanup-§D6 because the cron-route file is S2-owned per `00_INDEX.md`. Original audit: PotentialCleanup §D6.
**Severity:** P2 — fragile pattern that silently regresses to no-op the day someone reorders the RPC's argument list or drops a column; the cast hides the type error and the cron silently fails or no-ops on the next run.
**Status:** 🟨 DEPENDS ON S6 (`S6-database-types`, which itself depends on S1's schema migrations landing).

### File:line current state

`web/src/app/api/cron/pipeline-cleanup/route.ts:256-265` — casts `service.rpc('archive_cluster', ...)` through `unknown` because `web/src/types/database.ts` hasn't been regenerated against the most recent migrations.

### Fix

Once S6 has shipped `S6-database-types` (regenerated `web/src/types/database.ts` against the live S1 schema and confirmed `archive_cluster` appears with full Args + Returns shape):

1. Open `web/src/app/api/cron/pipeline-cleanup/route.ts` lines 256-265.
2. Drop the `as unknown` cast (and any companion `as ...` chain). The call should compile as a plain `service.rpc('archive_cluster', { ... })` against the regenerated typed `Database` type.
3. Run `tsc --noEmit` — must be clean.
4. Run `grep -n "as unknown" web/src/app/api/cron/pipeline-cleanup/route.ts` — must return zero hits.

### Coordination

- **S6** ships `S6-database-types` first.
- **S2** removes the cast in this item.
- The existing **`S2-D6 (partial verify)`** item above covers the verify branch (confirm cast still exists / is still relevant); this `S2-§D6-CAST` item covers the actual removal once unblocked. Both close together.

### Verification

```bash
grep -n "as unknown" web/src/app/api/cron/pipeline-cleanup/route.ts
# expect zero hits
tsc --noEmit
# expect clean
```

### Multi-agent process

1 implementer + 1 reviewer (small mechanical change post-codegen).

---

## S2-COPPA — COPPA consent versioning re-consent cron handler (PotentialCleanup §I11)

**Title:** Implement the cron handler that flags parents for re-consent when COPPA consent text version changes.
**Source:** PotentialCleanup §I11 (verified 2026-04-27).
**Severity:** P1 — when consent text changes (e.g., new data category added, new sub-processor), existing kids stay bound to old version with no re-consent path. GDPR-K + COPPA evidentiary gap.
**Status:** 🟨 DEPENDS ON S1 — schema for the consent-version table lives in S1 (Session 1, DB Migrations).

### Current state

No cron handler exists today. PotentialCleanup §I11 cites the gap; the schema half (a `consent_versions` or equivalent table tracking the canonical current version, plus an `outdated_consent` flag or join logic on `parental_consents.consent_version`) is owned by S1.

### Once S1 schema lands (cron handler design)

New file: `web/src/app/api/cron/coppa-reconsent-sweep/route.ts` (in S2 scope).

Handler shape:

```ts
import { createServiceClient } from '@/lib/supabase/server';
import { withCronLog } from '@/lib/cronLog';
import { verifyCronAuth } from '@/lib/auth';

async function handler(request: Request) {
  const auth = verifyCronAuth(request);
  if (!auth.ok) return new Response('Forbidden', { status: 403 });

  const service = createServiceClient();

  // 1. Find the canonical current consent version.
  const { data: cur } = await service
    .from('consent_versions')
    .select('version')
    .eq('is_current', true)
    .single();

  if (!cur) {
    return Response.json({ ok: false, reason: 'no current consent version' }, { status: 500 });
  }

  // 2. Find parents whose any-kid consent is on an older version
  //    AND who haven't already been notified for the current version.
  const { data: stale, error: staleErr } = await service.rpc(
    'find_outdated_consent_parents',
    { p_current_version: cur.version }
  );
  if (staleErr) throw staleErr;

  let queued = 0;
  for (const row of stale ?? []) {
    // Idempotent: notification helper checks for an existing
    // unread notification of type='reconsent_required' for the
    // (parent_user_id, consent_version) pair.
    const { error } = await service.rpc('queue_reconsent_notification', {
      p_parent_user_id: row.parent_user_id,
      p_required_version: cur.version,
    });
    if (!error) queued += 1;
  }

  return Response.json({ ok: true, queued, current_version: cur.version });
}

export const GET = withCronLog('coppa-reconsent-sweep', handler);
export const POST = withCronLog('coppa-reconsent-sweep', handler);
```

Schedule entry in `vercel.json` (add when handler ships):
```json
{ "path": "/api/cron/coppa-reconsent-sweep", "schedule": "20 5 * * *" }
```

(`20 5` is daily, between `cleanup-data-exports` at `15 5` and `sweep-beta` at `30 5`. No collision.)

### Why it matters

When a new sub-processor is added, a new data category is collected, or scope of kid-data processing changes, COPPA + GDPR require fresh consent. Without this sweep, the platform silently relies on old consent for new processing — direct FTC enforcement target.

### Dependencies on peer sessions

- **S1 (DB Migrations)** — must ship:
  - `consent_versions(version text PK, effective_at timestamptz, is_current bool, body_text text)` table (or equivalent).
  - `find_outdated_consent_parents(p_current_version text)` RPC returning `{parent_user_id uuid}[]`.
  - `queue_reconsent_notification(p_parent_user_id, p_required_version)` RPC — idempotent insert into `notifications` table.
- **S5 or S7** — UI for the parent-side re-consent flow (notification → settings page → consent acknowledgement → write a new `parental_consents` row at the current version). Out of S2 scope.

S2 ships the cron handler ONLY when the S1 schema half is live. Until then, this item stays 🟨.

### Verification

```bash
# 1. After S1 lands, manually bump the consent version:
INSERT INTO consent_versions (version, effective_at, is_current, body_text)
  VALUES ('2026-05-15-v2', now(), true, '...');
UPDATE consent_versions SET is_current=false WHERE version='2026-04-15-v1';

# 2. Trigger the cron:
curl -H "Authorization: Bearer $CRON_SECRET" https://veritypost.com/api/cron/coppa-reconsent-sweep

# 3. Verify queued notifications:
SELECT user_id, type, metadata->>'required_version' AS req_v, created_at
  FROM notifications
 WHERE type='reconsent_required'
   AND created_at > now() - interval '10 minutes';
# expect rows for every parent whose any-kid consent_version != '2026-05-15-v2'

# 4. Re-trigger and confirm idempotency:
curl -H "Authorization: Bearer $CRON_SECRET" https://veritypost.com/api/cron/coppa-reconsent-sweep
# expect: same row count in notifications (idempotent — no duplicates)
```

### Multi-agent process

When this ships:
- 4 pre-impl + 1 implementer + 2 post-impl (security reviewer is mandatory — COPPA-relevant).
- Adversary specifically probes: "what if `find_outdated_consent_parents` returns the same parent twice (multiple kids on different old versions)? what if `queue_reconsent_notification` is called concurrently from a re-tick? what if a parent ALREADY has a current-version consent for a different kid — do we still notify?"

---

## S2-coordination — Cron handlers referencing dead tables (S1 dependency)

**Title:** When S1 ships orphan-table drops (e.g., A114 / T55), audit cron purge handlers for dead references.
**Source:** TODO sequencing notes + Sessions/00_INDEX.md cross-cutting items (verified 2026-04-27).
**Severity:** P2 — purge crons referencing dropped tables fail at runtime; failure rolls into the wrapper's Sentry capture.
**Status:** 🟨 DEPENDS ON S1.

### Current state

S1 owns several orphan-table-drop migrations (T55 `ai_prompt_preset_versions`, A114 orphan tables). Some purge handlers may still reference these tables.

### Investigator pass (run before each S1 drop migration ships)

```bash
# Given a table about to be dropped, e.g. ai_prompt_preset_versions:
grep -rn "ai_prompt_preset_versions" web/src/app/api/cron/
# Expect zero hits if it was always a write-only orphan.
# If hits exist, those crons need to be edited or the table can't drop.
```

### Resolution

If a cron references a dropping table:
- (A) The reference is dead code (table was never read in this cron's logic) → remove the reference, ship in this session.
- (B) The reference is live (cron actually purges/reads the table) → the table can't be safely dropped; flag back to S1 to revisit.

### Dependencies

- **S1 (DB Migrations)** — must publish the list of tables it intends to drop, in advance, so this session can audit cron handlers before the drop ships.

### Verification

After each S1 drop:
```sql
-- Confirm cron heartbeat health post-drop:
SELECT event_type, processing_status, processing_error, processed_at
  FROM webhook_log
 WHERE source='cron'
   AND processed_at > now() - interval '24 hours'
   AND processing_status = 'failed'
 ORDER BY processed_at DESC;
# expect zero rows mentioning the dropped table
```

---

# Out of session scope (don't touch)

- **Cron BUSINESS LOGIC** that isn't security/scheduling/heartbeat. Examples: changing what `recompute-family-achievements` calculates → S6. Changing the kid-trial sweep semantics → S10 + S1.
- **RPC creation** (e.g., `claim_push_batch`, `ack_push_batch`, `find_outdated_consent_parents`) → S1.
- **Type regeneration** (`web/src/types/database.ts`) → S1 or S6.
- **Push / email helper libs** (e.g., `sendPushBatch`) — likely owned by S5 or S6 depending on layout. This session calls them as a contract, doesn't refactor them.
- **`web/src/lib/auth.js`** (where `verifyCronAuth` is defined) → S3. This session uses it, doesn't edit it.

---

# Session-completion checklist

Run every box before marking this session shipped.

- [ ] **S2-A1** — Three cron routes (birthday-band-check, dob-correction-cooldown, subscription-reconcile-stripe) use `verifyCronAuth(request).ok`. `pro-grandfather-notify` confirmed deleted (Q1 ship); if still present, escalate.
- [ ] **S2-A17** — `vercel.json` no two crons share a minute. `anonymize-audit-log-pii` at `25 3`, `purge-webhook-log` at `5 4`.
- [ ] **S2-A18** — `cleanup-data-exports` at `15 5`, `rate-limit-cleanup` at `45 5` registered in `vercel.json`. Both handlers verified to have `verifyCronAuth(request).ok` + `withCronLog` wrap.
- [ ] **S2-A34 + S2-A35** — `send-push` and `send-emails` redesigned as drain-until-empty with 25s wall-clock budget; scheduled `*/5 * * * *` IF Vercel Pro is provisioned (else 🟧 OWNER PENDING). Docstring comments updated to match. RPCs `claim_push_batch`/`ack_push_batch`/`claim_email_batch`/`ack_email_batch` confirmed live in `pg_proc` (S1 dependency).
- [ ] **S2-A71** — `cronLog.js` event_id includes 4-byte random hex suffix.
- [ ] **S2-D6** — `pipeline-cleanup` `archive_cluster` cast either resolved by S1 types-regen OR documented as deferred with explicit "pending S1" comment.
- [ ] **S2-COPPA** — `coppa-reconsent-sweep` handler shipped IF AND ONLY IF S1 has shipped `consent_versions` table + `find_outdated_consent_parents` RPC + `queue_reconsent_notification` RPC. If not yet, item stays 🟨.
- [ ] **S2-coordination** — for every S1 table-drop migration that lands, grep cron handlers for the dropped table name; remove dead refs in same window.
- [ ] **Final hermetic check:**
  ```bash
  git diff --stat | grep -v "web/src/app/api/cron/\|web/vercel.json\|web/src/lib/cronLog.js"
  # expect zero hits — only owned files modified
  ```
- [ ] **Final auth grep:**
  ```bash
  grep -rn "verifyCronAuth" web/src/app/api/cron/ | grep -v "\.ok"
  # expect zero hits
  ```
- [ ] **Final JSON parse:**
  ```bash
  node -e "JSON.parse(require('fs').readFileSync('web/vercel.json'))"
  # expect no error
  ```
- [ ] **Final collision check:**
  ```bash
  node -e "
    const { crons } = require('./web/vercel.json');
    const seen = {};
    for (const c of crons) {
      const min = c.schedule.split(' ').slice(0,2).join(' ');
      if (seen[min]) console.log('COLLISION:', min, '->', seen[min], 'and', c.path);
      seen[min] = c.path;
    }
  "
  # expect no output
  ```
- [ ] **Heartbeat smoke** — for each cron edited, manually trigger via curl + CRON_SECRET, confirm a `webhook_log` row landed with the expected `event_type`, `processing_status`, and (post-A71) random-suffixed `event_id`.
- [ ] **Commits tagged** `[S2-Annn]` per item; co-author trailer present per project convention.
- [ ] **00_INDEX.md status** — mark each S2 item 🟩 with commit hash as it ships.

---

# Appendix — current `vercel.json` cron inventory (verified 2026-04-27)

```
sweep-kid-trials                 0 3 * * *
recompute-family-achievements    30 3 * * *   ← collides with anonymize-audit-log-pii (S2-A17)
anonymize-audit-log-pii          30 3 * * *   ← move to 25 3
check-user-achievements          45 3 * * *
purge-audit-log                  35 3 * * *
process-deletions                0 4 * * *    ← collides with purge-webhook-log (S2-A17)
purge-webhook-log                0 4 * * *    ← move to 5 4
freeze-grace                     15 4 * * *
process-data-exports             30 4 * * *
flag-expert-reverifications      30 4 * * 1   (Mondays only)
send-emails                      45 4 * * *   ← redesign per Q4.2 → */5 * * * * (S2-A35)
send-push                        0 5 * * *    ← redesign per Q4.2 → */5 * * * * (S2-A34)
sweep-beta                       30 5 * * *
pipeline-cleanup                 0 6 * * *
birthday-band-check              15 6 * * *
dob-correction-cooldown          30 6 * * *
subscription-reconcile-stripe    45 6 * * *
[NEW] cleanup-data-exports       15 5 * * *   (S2-A18)
[NEW] rate-limit-cleanup         45 5 * * *   (S2-A18)
[NEW] coppa-reconsent-sweep      20 5 * * *   (S2-COPPA, when S1 schema lands)
```

Total registered crons after S2 ships: 17 (current) + 2 (A18) + 1 (COPPA when S1 ready) = **20**. Reality: 17 registered in `vercel.json` + 19 handler dirs + 2 unregistered (`cleanup-data-exports`, `rate-limit-cleanup`). Future state with new COPPA cron: 18 registered, 20 handler dirs.

---

End of Session 2.
