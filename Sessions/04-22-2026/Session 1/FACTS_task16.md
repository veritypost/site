# FACTS — Phase 3 Task 16 (`pipeline_runs.error_type` column + backfill)

Generated 2026-04-22 by PM pre-flight. Live DB verified via MCP (project `fyiwulqphgmoqullmrfn`); every route reference re-read this session.

---

## 1. Current state (verified 2026-04-22)

- `pipeline_runs.error_type` column — **ABSENT** (MCP `information_schema.columns` returns empty).
- `pipeline_runs` row count — **0** (MCP `SELECT count(*)`). Backfill SQL is effectively a no-op today but must still run for correctness after the table gains rows.
- Existing column `error_message text NULL` — present. Existing `error_stack text NULL` — present. Existing `output_summary jsonb NOT NULL` — present.
- No index on `error_type` (doesn't exist yet).
- No CHECK constraint planned (error_type vocabulary is not fully frozen — adding one creates future-migration burden).

## 2. Handoff §5 Task 16 contract (verbatim)

> Current gap: Task 10 stashes error_type in `output_summary.error_type` jsonb because the column doesn't exist. Migration 120 adds `ALTER TABLE pipeline_runs ADD COLUMN error_type text` + populates from `output_summary->>'error_type'` on existing rows + updates Task 10 route to write the column directly (keep output_summary fallback for backward-compat one cycle).
> Risk tier: Multi-surface (migration 120 + route edit). Also write rollback 121.

## 3. Route write sites to update (verified via grep)

Two DB UPDATE call sites in `web/src/app/api/admin/pipeline/generate/route.ts` that currently stash error_type inside `output_summary`:

| Function | Line | Current field | Action |
|---|---|---|---|
| `failRun` helper | 1656-1667 | `output_summary: { error_type: errorType }` (whole blob replaced) | ADD column `error_type: errorType` **and keep** output_summary stash (one-cycle compat) |
| Main `finally` block | 1558-1581 | `output_summary: outputSummary` where outputSummary includes `final_error_type: finalErrorType` (L1553) | ADD `error_type: finalErrorType` field to UPDATE payload; keep `final_error_type` key in output_summary (one-cycle compat) |

**`failRun` is called from 7 call sites** (L558, L578, L583, L602, L607, L634, L639) — all covered by updating the helper itself. No call site changes needed.

**Log-field usages of `error_type` (NOT DB writes)** at L461, L491, L542, L828, L1095, L1246, L1503, L1510 — these go to `pipelineLog` structured logger. DO NOT TOUCH — out of scope.

**Response body `error_type` field** at L1634 — client API contract. DO NOT TOUCH.

## 4. Backfill coverage

Route stashes error_type in TWO different keys in output_summary:
- `output_summary.error_type` — written by `failRun` at L1665 (early-failure paths)
- `output_summary.final_error_type` — written by main finally at L1553 (catch block fails)

Backfill must cover both:
```sql
UPDATE public.pipeline_runs
   SET error_type = coalesce(
         output_summary->>'error_type',
         output_summary->>'final_error_type'
       )
 WHERE error_type IS NULL
   AND (output_summary ? 'error_type' OR output_summary ? 'final_error_type');
```

Safe on an empty table (`0 rows`). Safe on re-run (idempotent — `WHERE error_type IS NULL` guards).

## 5. Migration numbering (verified via `ls schema/`)

Next feature migration: **120** (after 118). Next rollback: **121** (after 119).

File names (matching existing pattern):
- `schema/120_f7_pipeline_runs_error_type.sql`
- `schema/121_rollback_120_f7_pipeline_runs_error_type.sql`

## 6. Migration 120 contract (LOCKED)

```sql
-- schema/120_f7_pipeline_runs_error_type.sql
-- 2026-04-22 — F7 Phase 3 Task 16: add error_type column to pipeline_runs + backfill
--
-- Before this migration, Task 10's generate route stashed error_type inside
-- output_summary jsonb because pipeline_runs.error_type did not exist. Now
-- promoted to a real text column so Task 12 observability + Phase 4 admin UI
-- can filter/group by error_type without jsonb extraction.
--
-- Route (web/src/app/api/admin/pipeline/generate/route.ts) writes BOTH the
-- real column AND the legacy output_summary keys for one cycle — backward
-- compat for any in-flight consumers. Task 16 follow-up removes the legacy
-- stash.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + WHERE error_type IS NULL guard.
-- STAGED pending owner apply (no MCP apply_migration per §3i).
-- Rollback: schema/121_rollback_120_f7_pipeline_runs_error_type.sql
--
-- No CHECK constraint on error_type: vocabulary may extend (Phase 4 may
-- introduce 'cluster_locked', 'permission_denied', etc. from statusForError
-- switch). Application layer is source of truth; DB stores whatever string
-- the app writes.
--
-- No index on error_type v1: Task 12 observability queries are per-run (key
-- lookup), not per-error_type aggregation. Phase 4 dashboard (Task 26) may
-- want a partial index — tracked as follow-up.

BEGIN;

ALTER TABLE public.pipeline_runs
  ADD COLUMN IF NOT EXISTS error_type text;

COMMENT ON COLUMN public.pipeline_runs.error_type IS
  'Error taxonomy string. Vocabulary owned by classifyError() + statusForError() in web/src/app/api/admin/pipeline/generate/route.ts. NULL for successful runs.';

-- Backfill from legacy output_summary stash. Covers both key names in use:
--   output_summary.error_type        (failRun helper — early failures)
--   output_summary.final_error_type  (main finally — catch block)
UPDATE public.pipeline_runs
   SET error_type = coalesce(
         output_summary->>'error_type',
         output_summary->>'final_error_type'
       )
 WHERE error_type IS NULL
   AND (output_summary ? 'error_type' OR output_summary ? 'final_error_type')
   AND coalesce(
         output_summary->>'error_type',
         output_summary->>'final_error_type'
       ) IS NOT NULL;

COMMIT;
```

## 7. Rollback 121 contract (LOCKED)

```sql
-- schema/121_rollback_120_f7_pipeline_runs_error_type.sql
-- 2026-04-22 — Rollback for schema/120_f7_pipeline_runs_error_type.sql
--
-- Idempotent: DROP COLUMN IF EXISTS. Safe on partial/failed prior apply.
-- Also removes the COMMENT (automatic with DROP COLUMN).
--
-- Data loss warning: rolling back permanently drops the error_type column
-- values. The legacy output_summary stash will still be written by the
-- route (during the one-cycle compat window), so rollback + replay is
-- tolerable.

BEGIN;

ALTER TABLE public.pipeline_runs
  DROP COLUMN IF EXISTS error_type;

COMMIT;
```

## 8. Route edits (LOCKED)

### 8.a `failRun` helper at route.ts:1656-1667

**Before** (L1658-1667):
```ts
await service
  .from('pipeline_runs')
  .update({
    status: 'failed',
    completed_at: completedAt.toISOString(),
    duration_ms: completedAt.getTime() - startedAtMs,
    total_cost_usd: totalCostUsd,
    items_failed: 1,
    error_message: errorMessage.slice(0, 2000),
    output_summary: { error_type: errorType } as unknown as Json,
  })
  .eq('id', runId);
```

**After:**
```ts
await service
  .from('pipeline_runs')
  .update({
    status: 'failed',
    completed_at: completedAt.toISOString(),
    duration_ms: completedAt.getTime() - startedAtMs,
    total_cost_usd: totalCostUsd,
    items_failed: 1,
    error_message: errorMessage.slice(0, 2000),
    error_type: errorType, // migration 120 STAGED — column exists post-apply
    output_summary: { error_type: errorType } as unknown as Json, // one-cycle compat
  } as never)
  .eq('id', runId);
```

**Also drop the misleading comment** at L1654-1655 ("no dedicated column on pipeline_runs") — stale after migration 120 applies. Replace with a `// migration 120 STAGED` pointer.

### 8.b Main finally block at route.ts:1558-1581

**Before** (L1558-1581):
```ts
await service
  .from('pipeline_runs')
  .update({
    status: finalStatus,
    completed_at: completedAt.toISOString(),
    duration_ms: durationMs,
    items_processed: items.length,
    items_created: finalStatus === 'completed' ? 1 : 0,
    items_failed: finalStatus === 'completed' ? 0 : 1,
    step_timings_ms: stepTimings as unknown as Json,
    output_summary: outputSummary as unknown as Json,
    total_cost_usd: totalCostUsd,
    prompt_fingerprint: promptParts.length > 0 ? sha256Hex(...) : null,
    error_message: finalErrorMessage,
    error_stack: finalErrorStack,
  })
  .eq('id', runId);
```

**After:**
```ts
await service
  .from('pipeline_runs')
  .update({
    status: finalStatus,
    completed_at: completedAt.toISOString(),
    duration_ms: durationMs,
    items_processed: items.length,
    items_created: finalStatus === 'completed' ? 1 : 0,
    items_failed: finalStatus === 'completed' ? 0 : 1,
    step_timings_ms: stepTimings as unknown as Json,
    output_summary: outputSummary as unknown as Json,
    total_cost_usd: totalCostUsd,
    prompt_fingerprint: promptParts.length > 0 ? sha256Hex(...) : null,
    error_message: finalErrorMessage,
    error_stack: finalErrorStack,
    error_type: finalErrorType, // migration 120 STAGED — column exists post-apply
  } as never)
  .eq('id', runId);
```

**Do NOT remove** `final_error_type: finalErrorType` from `outputSummary` construction at L1553 — one-cycle compat per handoff §5.

**Also update the stale comment at L1555-1557** to say migration 120 STAGED.

### 8.c Cast rationale

`as never` is used because `SupabaseClient<Database>['public']['Tables']['pipeline_runs']['Update']` does not yet include `error_type` (types:gen runs AFTER owner applies migration). `as never` is assignable to the expected Update type and satisfies tsc. Same pragmatic pattern as elsewhere in the codebase (Task 13 `persist-article.ts` RPC casts, L1482-1487 `feed_clusters.update` cast).

Post-apply + `npm run types:gen`, the cast can be removed. Flag in commit body as a follow-up hygiene item.

## 9. MUST-NOT-TOUCH fence

- `web/src/lib/pipeline/prompt-overrides.ts` — Task 15 just shipped, do not retouch
- `web/src/lib/pipeline/plagiarism-check.ts` — Task 14, do not retouch
- `web/src/lib/pipeline/*` otherwise — out of scope
- `classifyError` at route.ts:438-452 — no edits
- `statusForError` at route.ts:1673 — no edits
- Response-body `error_type` field at L1634 — client contract, no edits
- Log-field `error_type` keys in pipelineLog calls — out of scope (these are structured-log fields, not DB writes)
- Other pipeline_runs columns — only `error_type` added
- `pipeline_costs.error_type` column — already exists (migration 114), separate fix
- `migration 114`, `116`, `118` + rollbacks — no edits
- Permissions, settings, rate_limits — no seeds
- Any other route file — only `generate/route.ts` touched

## 10. Cost / abort / typing summary

- **Cost**: migration is DDL + one UPDATE (empty table today). Route edit adds one field to two existing UPDATE calls — zero new round trips. No LLM cost.
- **Abort**: migration runs in BEGIN/COMMIT; if owner cancels mid-apply, transaction rolls back safely.
- **Typing**: `as never` on the two route UPDATE payloads until owner runs `npm run types:gen` post-apply. Single-line comment flags the temporary cast. Follow-up to remove cast.
- **Idempotency**: migration re-runnable (`ADD COLUMN IF NOT EXISTS` + `WHERE error_type IS NULL`). Rollback re-runnable (`DROP COLUMN IF EXISTS`).

## 11. ADDENDUM 2026-04-22 — adversary YELLOW deploy-order gotcha (P0)

**supabase-js `.update()` resolves with `{ error }`, does NOT throw on PostgREST errors** (verified by adversary). If the route ships BEFORE migration 120 applies, the UPDATE returns `{ error: { code: 'PGRST204' } }`, the existing try/catch at L1582-1584 + L1668-1670 NEVER FIRES (no exception), and the `pipeline_runs` row stays stuck in `status='running'` with no log. Silent data corruption.

**Mitigation:** commit body MUST state explicitly: "Apply migration 120 BEFORE deploying this route." Owner workflow: STAGED migration applies via Supabase SQL editor, then `npm run types:gen`, then push + Vercel deploys. Same ordering as Task 11/13 + the existing `kids-waitlist` pattern.

This is acceptable risk because:
1. The route itself (Task 10) is STAGED — generate endpoint isn't reachable in production yet. Until owner applies 116 + 118 + 120 + types:gen + cuts the gate, no traffic hits.
2. Vercel deploy + Supabase apply are sequential owner actions, not race-prone CI.

Still — surface it loudly.

---

End of FACTS sheet.
