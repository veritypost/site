# FACTS — Phase 3 Task 18 (POST /api/admin/pipeline/runs/:id/cancel)

Generated 2026-04-22. Live DB verified via MCP; route patterns re-read from Tasks 12 + 17 (siblings) and Task 10 generate finally block.

---

## 1. Permission (verified live)

`admin.pipeline.runs.cancel` — EXISTS in `permissions` table (MCP verified during Task 17 prep). No seed needed.

## 2. Route location

File: `web/src/app/api/admin/pipeline/runs/[id]/cancel/route.ts` (NEW directory + file).

Co-located with Task 12 (GET) and Task 17 (POST retry). Same `[id]/<action>/route.ts` convention.

## 3. Live state — STAGED dependencies

| Resource | State | Migration |
|---|---|---|
| `release_cluster_lock(p_cluster_id, p_locked_by)` RPC | NOT live | 116 STAGED |
| `claim_cluster_lock` RPC | NOT live | 116 STAGED |
| `feed_clusters.locked_by` column | NOT live | 116 STAGED |
| `feed_clusters.locked_at` column | NOT live | 116 STAGED |
| `feed_clusters.locked_until` column | NOT live | 116 STAGED |
| `feed_clusters.generation_state` column | NOT live | 116 STAGED |
| `feed_clusters.last_generation_run_id` column | NOT live | 116 STAGED |
| `pipeline_runs.error_type` column | NOT live | 120 STAGED |
| `discovery_items.state` CHECK = pending\|clustered\|generating\|published\|ignored | LIVE | (migration 114) |
| `kid_discovery_items.state` same CHECK | LIVE | (migration 114) |

Cancel calls `release_cluster_lock` best-effort (try/catch + log). When migration 116 lands, the call works; before that, it errors and gets logged (silent no-op same as supabase-js error pattern from Task 16 §11).

## 4. Cooperative cancel — design decision (LOCKED)

Per handoff §5: "Can't actually interrupt a live call to the LLM — the worker finishes its current step." Two options:

**A. SOFT cancel (LOCKED for v1):** Mark run `status='failed'`, release lock, reset discovery items. Worker continues current step. When it returns and tries to write the next pipeline_costs row or the final pipeline_runs.update, the row's already in `'failed'` state — generate's finally OVERWRITES (race; final state may toggle back). Document the race.

**B. HARD cancel (NOT this task):** Add mid-chain status polling to all 10 callModel sites in generate route. Worker checks `pipeline_runs.status` between steps and aborts. Out of scope per handoff §5 ("True abort requires the worker to check `run.status='failed'` between steps. Task 10's chain does NOT currently do this — either add the mid-chain status polling OR document cancel as 'soft cancel'").

**Going with A.** Document the race in the route's TSDoc. Flag follow-up for hard cancel as a separate task (would touch 10+ generate call sites + add ~30 lines of polling logic).

## 5. Race window analysis (SOFT cancel)

Two concurrent code paths after cancel fires:
1. Cancel route sets `status='failed', error_type='abort'`.
2. Generate's main `try{}` continues current step → completes step → may even reach `finally{}` block at L1514-1602 → `update({status: finalStatus, ...})` runs.

Outcomes:
- **Cancel fires BEFORE generate's finally**: cancel writes `'failed'`. Generate's finally overwrites with `finalStatus` (`'completed'` if chain succeeded, `'failed'` if it threw). Cancel "lost" if generate completed; cancel "stuck" if generate failed.
- **Cancel fires AFTER generate's finally**: cancel writes `'failed'` over an already-final state. Generates a "post-mortem" cancel — confusing audit trail but not data corruption.
- **Cancel fires DURING generate's finally**: last writer wins. Postgres MVCC handles atomicity per UPDATE statement.

Mitigations baked into Task 18:
- Gate cancel to `status='running'` only (409 if already terminal). Reduces post-mortem cancel.
- Audit trail records the cancel action even if status flipped — admin sees they tried.

Race window is acceptable for v1. Hard cancel is a separate task.

## 6. Route contract (LOCKED)

```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;  // cancel is fast — DB writes only

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  // 1. Perm gate
  let actor;
  try {
    const supabase = createClient();
    actor = await requirePermission('admin.pipeline.runs.cancel', supabase);
  } catch (err) {
    return permissionError(err);
  }
  void actor;

  // 2. Validate id shape
  if (!UUID_RE.test(params.id)) return 400 'Invalid run id';

  // 3. Load run
  const service = createServiceClient();
  const { data: run, error } = await service
    .from('pipeline_runs')
    .select('id, status, pipeline_type, cluster_id, audience, started_at')
    .eq('id', params.id)
    .maybeSingle();
  if (error) return 500;
  if (!run) return 404 'Run not found';

  // 4. Gate
  if (run.pipeline_type !== 'generate') return 400 'Only generate runs can be cancelled';
  if (run.status !== 'running') return 409 'Run is not running';

  // 5. Mark cancelled (soft cancel — worker may complete current step)
  const completedAt = new Date();
  const startedAtMs = new Date(run.started_at as string).getTime();
  const durationMs = completedAt.getTime() - startedAtMs;
  const ERROR_MSG = 'Cancelled by admin';
  const ERROR_TYPE = 'abort';

  try {
    await service
      .from('pipeline_runs')
      .update({
        status: 'failed',
        completed_at: completedAt.toISOString(),
        duration_ms: durationMs,
        error_message: ERROR_MSG,
        error_type: ERROR_TYPE,                        // migration 120 STAGED
        // Adversary P1: distinctive cancel marker so log readers can tell
        // cancelled-by-admin apart from any other failed-with-abort run.
        // error_type kept for one-cycle stash compat (Task 16 §11 pattern).
        output_summary: { cancelled_by_admin: true, error_type: ERROR_TYPE } as unknown as Json,
      } as never)
      .eq('id', params.id)
      .eq('status', 'running');                        // re-check inside UPDATE — avoids stomping a finally that beat us
  } catch (markErr) {
    console.error('[admin.pipeline.runs.cancel.mark]', markErr);
    Sentry.captureException(markErr);
    return NextResponse.json({ error: 'Cancel failed' }, { status: 500 });
  }

  // 6. Best-effort lock release (migration 116 STAGED — RPC may not exist yet)
  if (run.cluster_id) {
    try {
      await (
        service.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>
        ) => Promise<{ error: { message: string } | null }>
      )('release_cluster_lock', { p_cluster_id: run.cluster_id, p_locked_by: params.id });
    } catch (lockErr) {
      console.error('[admin.pipeline.runs.cancel.unlock]', lockErr);
    }
  }

  // 7. Reset discovery items state generating → clustered (best-effort).
  // ADDENDUM (investigator): native .from(union) typechecks — drop the cast.
  // Gate on cluster_id AND audience (audience may be null for malformed rows).
  if (run.cluster_id && run.audience) {
    const discoveryTable = run.audience === 'kid' ? 'kid_discovery_items' : 'discovery_items';
    try {
      await service
        .from(discoveryTable)
        .update({ state: 'clustered', updated_at: new Date().toISOString() })
        .eq('cluster_id', run.cluster_id)
        .eq('state', 'generating');                    // only flip mid-flight items, leave terminal states alone
    } catch (stateErr) {
      console.error('[admin.pipeline.runs.cancel.state]', stateErr);
    }
  }

  // 8. Audit. Include was_status + was_started_at for forensic context (P2-B).
  try {
    await recordAdminAction({
      action: 'pipeline_cancel',
      targetTable: 'pipeline_runs',
      targetId: params.id,
      newValue: {
        cluster_id: run.cluster_id,
        audience: run.audience,
        soft_cancel: true,
        was_status: run.status,
        was_started_at: run.started_at,
      },
    });
  } catch (auditErr) {
    console.error('[admin.pipeline.runs.cancel.audit]', auditErr);
  }

  return NextResponse.json({
    ok: true,
    run_id: params.id,
    cancel_kind: 'soft',
    note: 'Worker may complete the current step before exiting',
  });
}
```

## 7. Imports needed

```ts
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import * as Sentry from '@sentry/nextjs';
import type { Json } from '@/types/database';
```

`Json` import for the output_summary cast (existing pattern from generate route).

## 8. MUST-NOT-TOUCH fence

- `generate/route.ts` — do NOT add mid-chain status polling (that's a separate task; out of scope per §5)
- `release_cluster_lock` RPC (migration 116 source) — do not edit
- Tasks 12 (GET) + 17 (retry) sibling routes — coexist
- Migration files — none added
- Permissions / settings / rate_limits seeds — none added
- `web/src/lib/*` — read-only usage

## 9. Error handling / logging

- Perm failure → `permissionError(err)`
- Bad UUID → 400
- DB SELECT fail → log + Sentry + 500
- Run not found → 404
- Wrong type → 400
- Wrong status → 409
- UPDATE pipeline_runs fail → log + Sentry + 500 (this one MATTERS because it's the cancel action itself)
- Lock release fail → log + swallow (best-effort)
- Discovery items state fail → log + swallow (best-effort)
- Audit fail → log + swallow

Use `console.error('[admin.pipeline.runs.cancel.<step>]', err)` + `Sentry.captureException` on the critical paths.

## 10. The `eq('status', 'running')` re-check trick

The UPDATE includes a second `.eq('status', 'running')` to prevent the cancel from stomping a state that generate's finally just wrote. Postgres semantics: rows where status changed since the SELECT will not match → UPDATE affects 0 rows → safe no-op for the post-mortem cancel case.

If this happens, the response is still 200 (the UPDATE succeeded structurally). Admin sees "ok" but the run state didn't change. Acceptable for soft cancel.

If we wanted to surface this, we could check the UPDATE's returned row count and respond differently, but Supabase JS doesn't return count by default. Skip for v1.

## 11. Cost / abort summary

- **Cost**: 1 SELECT + 1 UPDATE pipeline_runs + best-effort RPC + best-effort discovery items UPDATE + audit. ~50ms on warm connection.
- **Abort**: cancel itself doesn't take a signal. Worker abort is cooperative per §4.
- **Idempotency**: re-cancel on already-failed run → 409 from gate. Race-safe.

## 12. Migration 120 dependency (investigator F#8)

Cancel's UPDATE writes `error_type: 'abort'` to the new column added by migration 120 (STAGED). If owner deploys cancel route BEFORE applying migration 120, PostgREST returns column-not-found and the UPDATE fails entirely (PostgREST is row-atomic; a single bad column in the SET clause sinks the whole statement).

This mirrors generate's exact same dependency at route.ts L1581. Both routes need migration 120 applied before they work. Acceptable because:
1. Generate is itself STAGED (no production traffic until 116 + 118 + 120 + types:gen + owner cuts the gate).
2. If generate doesn't work, there are no `running` runs to cancel anyway.
3. Owner workflow per §3i: apply migration → types:gen → push.

Document the symmetry in commit body. Do NOT add a fallback "try without error_type" path — adds complexity for a state we're already actively migrating away from.

---

End of FACTS sheet.
