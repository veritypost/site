# FACTS — Phase 3 Task 17 (POST /api/admin/pipeline/runs/:id/retry)

Generated 2026-04-22. Live DB verified via MCP; route patterns re-read from Task 12 (GET sibling).

---

## 1. Permission (verified live)

`admin.pipeline.runs.retry` — EXISTS in `permissions` table (MCP 2026-04-22). No seeding needed.
`admin.pipeline.runs.cancel` — also present (Task 18 will use).

## 2. Route location

File: `web/src/app/api/admin/pipeline/runs/[id]/retry/route.ts` (NEW directory + file).

Co-located with Task 12's GET endpoint (`runs/[id]/route.ts`). Next.js app-router convention: per-action sub-segment gets its own directory.

## 3. Route pattern (source: Task 12 GET at `runs/[id]/route.ts`)

```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  // 1. Perm gate (mutation — use requirePermission with user client)
  let actor;
  try {
    const supabase = createClient();
    actor = await requirePermission('admin.pipeline.runs.retry', supabase);
  } catch (err) {
    return permissionError(err);
  }

  // 2. Validate id shape
  if (!UUID_RE.test(params.id)) return NextResponse.json({error:'Invalid run id'}, {status:400});

  // 3. Load failed run (ADDENDUM P1: include error_type for audit context)
  const service = createServiceClient();
  const { data: run, error } = await service
    .from('pipeline_runs')
    .select('id, status, pipeline_type, cluster_id, audience, provider, model, freeform_instructions, output_summary')
    .eq('id', params.id)
    .maybeSingle();
  if (error) { ... 500 ... }
  if (!run) return 404 'Run not found';

  // 4. Gate: only generate runs, only failed
  if (run.pipeline_type !== 'generate') return 400 'Only generate runs can be retried';
  if (run.status !== 'failed') return 409 'Run is not failed';
  if (!run.cluster_id || !run.audience) return 422 'Run has insufficient params';

  // 5. Forward to generate route via internal fetch (ADDENDUM P1: wrap in try/catch)
  const generateUrl = new URL('/api/admin/pipeline/generate', req.url);
  const cookieHeader = req.headers.get('cookie') ?? '';
  let response: Response;
  try {
    response = await fetch(generateUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify({
        cluster_id: run.cluster_id,
        audience: run.audience as 'adult' | 'kid',
        provider: (run.provider as 'anthropic' | 'openai' | null) ?? 'anthropic',
        model: run.model ?? 'claude-sonnet-4-6',
        ...(run.freeform_instructions ? { freeform_instructions: run.freeform_instructions } : {}),
      }),
    });
  } catch (fetchErr) {
    console.error('[admin.pipeline.runs.retry.fetch]', fetchErr);
    Sentry.captureException(fetchErr);
    return NextResponse.json({ error: 'Retry dispatch failed' }, { status: 500 });
  }

  // Parse body safely (may be error shape or success shape)
  let bodyJson: Record<string, unknown> = {};
  try { bodyJson = await response.json(); } catch { /* swallow */ }

  const newRunId = typeof bodyJson.run_id === 'string' ? bodyJson.run_id : null;

  // 6. Audit (only when generate succeeded in starting a run).
  // ADDENDUM P1: include original failure reason so log explains why retry fired.
  // Migration 120 adds pipeline_runs.error_type column — STAGED. Until owner
  // applies it + types:gen, read legacy stash from output_summary jsonb.
  const outputSummary = (run.output_summary ?? {}) as Record<string, unknown>;
  const originalErrorType =
    (outputSummary.error_type as string | undefined) ??
    (outputSummary.final_error_type as string | undefined) ??
    null;
  if (response.ok && newRunId) {
    try {
      await recordAdminAction({
        action: 'pipeline_retry',
        targetTable: 'pipeline_runs',
        targetId: params.id,
        newValue: {
          new_run_id: newRunId,
          cluster_id: run.cluster_id,
          audience: run.audience,
          original_error_type: originalErrorType,
        },
      });
    } catch (auditErr) {
      console.error('[admin.pipeline.runs.retry.audit]', auditErr);
    }
  }

  // 7. Response — pass through generate's status + body, plus old_run_id
  return NextResponse.json(
    { ...bodyJson, old_run_id: params.id, new_run_id: newRunId },
    { status: response.status }
  );
}
```

## 4. Design decisions (LOCKED)

1. **Internal HTTP fetch over refactor.** Generate is 1734 lines; extracting its core into a lib function is out of scope (separate task). Internal fetch reuses all of generate's guards (perm, kill-switch, cost-cap, rate-limit, cluster-lock, body parse, chain, persist). Double perm check (retry + generate) — acceptable, ~1ms overhead.

2. **Only `pipeline_type='generate'` is retryable.** `pipeline_type='ingest'` runs are fire-and-forget feed polls; retrying them doesn't fit the model. Gate at 400.

3. **Only `status='failed'` is retryable.** Retrying `completed` is wasteful; retrying `running` races. Gate at 409.

4. **Rebuild from named columns, not `input_params` jsonb.** `pipeline_runs` has first-class `cluster_id`, `audience`, `provider`, `model`, `freeform_instructions` columns (verified FACTS_task14 §1). No need to parse jsonb.

5. **Audit via `recordAdminAction`**. Action key: `'pipeline_retry'`. Target: the failed run's id (what admin acted on). newValue carries the spawned `new_run_id`.

6. **No new rate-limit policy.** Generate's `newsroom_generate` policy (20/3600s) is the effective cap — retries pass through it. If admin hammers retry, generate's cap kicks in at 429. Simpler; flag follow-up if observed spam.

7. **Response shape.** Pass through generate's response (which includes `ok`, `run_id`, `error_type` on failure, etc.) and add `old_run_id` + `new_run_id` for clarity. Status code mirrors generate's.

8. **maxDuration = 300s.** Generate itself runs up to 300s (matches Task 10 declaration). If we use the default 15, the retry POST will time out while generate is mid-chain. Set `export const maxDuration = 300` on the retry route too.

## 5. Zod request shape for generate (verified route.ts L84-91)

```ts
const RequestSchema = z.object({
  cluster_id: z.string().uuid(),
  audience: z.enum(['adult', 'kid']),
  freeform_instructions: z.string().max(2000).optional(),
  provider: z.enum(['anthropic', 'openai']).default('anthropic'),
  model: z.string().min(3).max(100).default('claude-sonnet-4-6'),
});
```

Retry route's body construction must satisfy this exactly. `freeform_instructions` is optional — omit (don't pass `null`) when run.freeform_instructions is null/undefined.

## 6. Deploy-order / runtime considerations

- Task 10 generate endpoint is STAGED pending migrations 116 + 118 + 120 + types:gen + owner apply. Retry depends on generate — when generate isn't live, retry will return whatever generate returns (likely 500/503 from missing RPCs).
- Task 10 guards its own deployment (via settings kill-switch). Retry passes through.
- **No new migration** for Task 17. Permission already seeded.

## 7. MUST-NOT-TOUCH fence

- Any migration file (no new migration)
- Permissions / settings / rate_limits seed tables (perm already present)
- `generate/route.ts` — do NOT refactor; internal fetch is the chosen coupling
- `classifyError`, `statusForError` in generate/route.ts
- Task 12 GET route at `runs/[id]/route.ts` — coexists
- `web/src/lib/pipeline/*` — no edits (retry doesn't need helpers)
- `web/src/lib/auth.ts`, `rateLimit.ts`, `adminMutation.ts` — read-only usage
- Cancel endpoint (Task 18) — don't stub it here

## 8. Imports needed

```ts
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import * as Sentry from '@sentry/nextjs';
```

All verified exported:
- `requirePermission` — used in Task 12 route
- `createClient`, `createServiceClient` — used in Task 12
- `permissionError`, `recordAdminAction` — `web/src/lib/adminMutation.ts` L96 + L62
- `Sentry.captureException` — used in Task 12

## 9. Error handling / logging

- Perm failure → `permissionError(err)` (returns 403 with cooked message)
- Bad UUID → 400
- DB fetch error → log + Sentry + 500
- Run not found → 404
- Wrong type → 400 "Only generate runs can be retried"
- Wrong status → 409 "Run is not failed"
- Missing required params → 422 "Run has insufficient params"
- Internal fetch failure → pass through generate's response. If fetch itself throws (network error?), log + 500.
- Audit failure → log + swallow (don't fail the retry over audit write)

Use `console.error('[admin.pipeline.runs.retry]', err.message)` + `Sentry.captureException(err)` for server-side errors. Use generic messages in response body (no raw error strings).

## 10. Cost / abort summary

- **Cost**: one DB SELECT (the failed run), one HTTP fetch forwarding to generate. Generate's own cost cap applies inside.
- **Abort**: `req.signal` is NOT plumbed through the internal fetch in v1 (Node fetch supports AbortSignal but generate doesn't accept it from the edge). If admin cancels retry mid-way via Task 18 cancel endpoint, the new run's `status` flips — generate's `runId` gets cancelled, not the fetch. Acceptable.
- **Idempotency**: retry creates a new `pipeline_runs` row every time. Double-submit produces two runs (failed+running or completed). Admin UI can prevent double-click; not our problem at the API layer.

---

End of FACTS sheet.
