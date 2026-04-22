# FACTS — Phase 3 Task 19 (orphaned runs cleanup cron)

Generated 2026-04-22. Live DB + codebase verified via MCP/reads.

---

## 1. Cron auth pattern (verified — `web/src/lib/cronAuth.js:18`)

All existing cron routes use `verifyCronAuth(request)` which:
- Trusts `x-vercel-cron: 1` header (Vercel strips this from non-cron requests)
- OR requires `Authorization: Bearer ${CRON_SECRET}` with constant-time compare
- Returns `{ ok: false, reason }` on deny

Fail-closed 403 pattern:
```ts
if (!verifyCronAuth(request).ok) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

`CRON_SECRET` env var is already in use (no new env var needed).

## 2. Cron wrapper (verified — `web/src/lib/cronLog.js:22`)

`withCronLog(name, handler)` wraps a handler for structured logging. Existing routes do:
```ts
export const GET = withCronLog('freeze-grace', run);
export const POST = withCronLog('freeze-grace', run);
```

Vercel scheduler hits `GET` by default; handler accepts both for manual replay.

## 3. File layout

File: `web/src/app/api/cron/pipeline-cleanup/route.ts` (NEW directory + file). Per CLAUDE.md "New files are always TS" — existing crons are `.js` (legacy), but new file is TS.

## 4. Existing `web/vercel.json` state

Current 9 crons, all daily between 3-5 AM UTC:
```json
{
  "crons": [
    {"path": "/api/cron/sweep-kid-trials",          "schedule": "0 3 * * *"},
    {"path": "/api/cron/recompute-family-achievements","schedule": "30 3 * * *"},
    {"path": "/api/cron/check-user-achievements",   "schedule": "45 3 * * *"},
    {"path": "/api/cron/process-deletions",         "schedule": "0 4 * * *"},
    {"path": "/api/cron/freeze-grace",              "schedule": "15 4 * * *"},
    {"path": "/api/cron/process-data-exports",      "schedule": "30 4 * * *"},
    {"path": "/api/cron/send-emails",               "schedule": "45 4 * * *"},
    {"path": "/api/cron/send-push",                 "schedule": "0 5 * * *"},
    {"path": "/api/cron/flag-expert-reverifications","schedule": "30 4 * * 1"}
  ]
}
```

Add a 10th entry for `/api/cron/pipeline-cleanup`. Schedule per handoff §5: every 5 min → `*/5 * * * *`.

**Plan-tier note**: Vercel hobby allows max 2 cron jobs + daily frequency only. Owner already has 9 crons → already on Pro (or Teams tier which allows per-minute). No new plan action needed. Document in commit.

## 5. Handoff §5 Task 19 SQL (verbatim — to be executed via Supabase client)

**Orphan run cleanup:**
```sql
UPDATE pipeline_runs
   SET status='failed',
       completed_at=now(),
       duration_ms=EXTRACT(epoch FROM (now()-started_at))*1000,
       error_message='Orphaned run — auto-cleanup',
       error_type='abort'
 WHERE status='running'
   AND started_at < now() - interval '10 minutes';
```

**Orphan lock cleanup:**
```sql
UPDATE feed_clusters
   SET locked_by=NULL, locked_at=NULL, generation_state=NULL
 WHERE locked_until IS NOT NULL AND locked_until < now();
```

**Key points:**
- 10-minute orphan threshold. A run that's been 'running' longer is either:
  - Vercel lambda killed mid-chain (unclean death)
  - Actually still running in a Vercel function that hasn't timed out (rare but possible if `maxDuration=300`)
- The threshold MUST be greater than generate's `maxDuration=300s` (5 min). 10 min gives a 5-min buffer. Correct.
- Lock cleanup is independent: any lock with `locked_until` in the past is fair game, regardless of the run's status. This catches the case where the run was completed but somehow left the lock.

## 6. Schema dependencies (STAGED)

| Column / RPC | Status | Migration |
|---|---|---|
| `pipeline_runs.error_type` | NOT LIVE | 120 STAGED |
| `feed_clusters.locked_by` | NOT LIVE | 116 STAGED |
| `feed_clusters.locked_at` | NOT LIVE | 116 STAGED |
| `feed_clusters.locked_until` | NOT LIVE | 116 STAGED |
| `feed_clusters.generation_state` | NOT LIVE | 116 STAGED |

Cron UPDATE will fail with column-not-found until 116 + 120 apply. Same symmetry as Task 18. Cron is a no-op safety-net; if migrations haven't applied, nothing to clean up anyway. Acceptable.

## 7. Implementation approach — Supabase JS vs raw SQL

Option A: direct Supabase JS `.from().update()` with `.lt('started_at', ...)` — typed, predictable, works with `.eq('status', 'running')`.

Option B: raw SQL via RPC — needs a new RPC function (out of scope per fence).

**Choice: Option A.** Same pattern as Task 17/18. Two independent updates (runs, locks). Neither is transactional with the other — if one fails, log and continue. Log both counts.

## 7a. ADDENDUM 2026-04-22 — adversary YELLOW fixes

- **P1-A (must land)**: add a **third sweep** for orphaned `discovery_items + kid_discovery_items` stuck in `state='generating'`. When generate's lambda is killed mid-chain, its finally-block may not reach the discovery state reset at L1518-1528, leaving items indefinitely in `'generating'` — next ingest skips them forever (state filter is `in ['pending','clustered']` per ingest route). Reset to `'clustered'` so items requeue.
- **P2-C**: cron response should emit generic `{ code: 'orphan_runs_failed' }` etc. — not raw PostgREST error strings. Full message goes to `console.error` only.
- **P2-D**: vercel.json append uses the multi-line shape matching the existing 9 entries (2-space object indent, 4-space property indent).
- **P2-A (out of scope)**: add `.eq('status','running')` guard to generate's finally UPDATE so cron's state isn't overwritten by a late-running lambda. Follow-up task (would edit generate/route.ts — out of fence).
- **Investigator notes folded in**: simplify cask cast to `as never`, drop `duration_ms` from orphan runs payload (accept NULL — code comment explains), `maxDuration=15`.

## 8. Route contract (LOCKED)

```ts
/**
 * F7 Phase 3 Task 19 — GET /api/cron/pipeline-cleanup
 *
 * Every-5-min safety net. Two idempotent best-effort sweeps:
 *
 *   1. Orphan runs:  pipeline_runs rows in status='running' for > 10 min are
 *      marked 'failed' with error_type='abort'. Threshold MUST exceed
 *      generate's maxDuration=300s; 10 min gives a 5-min grace buffer.
 *
 *   2. Orphan locks: feed_clusters rows with locked_until < now() are cleared
 *      (locked_by/locked_at/generation_state → NULL). Catches the case where
 *      a run completed but left its lock; also double-insurance against
 *      release_cluster_lock failures.
 *
 * Auth: verifyCronAuth (x-vercel-cron OR CRON_SECRET bearer).
 *
 * Depends on migrations 116 + 120 (locked_* cols + error_type). Until applied,
 * updates fail silently and log; cron remains a no-op pending apply.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

async function run(request: Request) {
  if (!verifyCronAuth(request).ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const now = new Date();
  const thresholdIso = new Date(now.getTime() - 10 * 60 * 1000).toISOString();

  // 1. Orphan runs
  let orphanRunsResult: { count: number; error: string | null };
  try {
    const { data, error } = await service
      .from('pipeline_runs')
      .update({
        status: 'failed',
        completed_at: now.toISOString(),
        error_message: 'Orphaned run — auto-cleanup',
        error_type: 'abort',
      } as never)
      .eq('status', 'running')
      .lt('started_at', thresholdIso)
      .select('id');
    orphanRunsResult = { count: data?.length ?? 0, error: error?.message ?? null };
  } catch (err) {
    orphanRunsResult = { count: 0, error: err instanceof Error ? err.message : String(err) };
  }
  if (orphanRunsResult.error) {
    console.error('[cron.pipeline-cleanup.orphan_runs]', orphanRunsResult.error);
  }

  // 2. Orphan locks (only if migration 116 has applied — locked_until col exists)
  let orphanLocksResult: { count: number; error: string | null };
  try {
    const { data, error } = await (
      service.from('feed_clusters').update as unknown as (v: Record<string, unknown>) => {
        lt: (col: string, val: string) => { select: (cols: string) => Promise<{ data: Array<{ id: string }> | null; error: { message: string } | null }> };
      }
    )({
      locked_by: null,
      locked_at: null,
      generation_state: null,
    })
      .lt('locked_until', now.toISOString())
      .select('id');
    orphanLocksResult = { count: data?.length ?? 0, error: error?.message ?? null };
  } catch (err) {
    orphanLocksResult = { count: 0, error: err instanceof Error ? err.message : String(err) };
  }
  if (orphanLocksResult.error) {
    console.error('[cron.pipeline-cleanup.orphan_locks]', orphanLocksResult.error);
  }

  return NextResponse.json({
    ok: true,
    ran_at: now.toISOString(),
    orphan_runs_cleaned: orphanRunsResult.count,
    orphan_locks_cleaned: orphanLocksResult.count,
    errors: {
      orphan_runs: orphanRunsResult.error,
      orphan_locks: orphanLocksResult.error,
    },
  });
}

export const GET = withCronLog('pipeline-cleanup', run);
export const POST = withCronLog('pipeline-cleanup', run);
```

## 9. vercel.json edit

Append one entry (last position so minimal diff):

```json
{
  "path": "/api/cron/pipeline-cleanup",
  "schedule": "*/5 * * * *"
}
```

Preserve JSON formatting (2-space indent, trailing newline).

## 10. Imports

```ts
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
```

NO `safeErrorResponse` — we log errors per-sweep rather than return 500 (cron should stay "succeeded" to avoid repeated alerting on the same transient issue).

## 11. MUST-NOT-TOUCH fence

- `generate/route.ts` — no edits
- Other cron routes (`freeze-grace`, etc.) — no edits
- Migrations — no new migration
- Permissions / settings / rate_limits — no seeds (cron auth is separate mechanism)
- `release_cluster_lock` RPC — not called (direct UPDATE on feed_clusters is simpler)
- Tasks 17 + 18 sibling routes — coexist

## 12. Cost / idempotency / schedule

- **Cost**: 2 UPDATEs per run, ~10ms each on warm connection, zero LLM. At `*/5 * * * *` that's 288 runs/day = negligible.
- **Idempotency**: each UPDATE is idempotent — filters exclude already-processed rows. Repeated runs are safe.
- **Threshold tuning**: 10 min orphan threshold vs generate's 300s maxDuration = 5-min grace buffer. If lambda completes at second 299, the finally block might take a moment; 600s threshold gives room.
- **Schedule drift**: `*/5 * * * *` ≠ exactly every 5 min on Vercel (scheduler can jitter by tens of seconds). Fine for a safety-net cron.

## 13. Response shape

```json
{
  "ok": true,
  "ran_at": "2026-04-22T14:00:00.000Z",
  "orphan_runs_cleaned": 0,
  "orphan_locks_cleaned": 0,
  "errors": { "orphan_runs": null, "orphan_locks": null }
}
```

Always return 200 (even when an underlying UPDATE errored). Vercel cron will retry on non-2xx — we don't want that. Errors surface via log + Sentry (implicit via withCronLog).

---

End of FACTS sheet.
