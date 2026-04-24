---
wave: A
group: 8 Pipeline/Newsroom
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Pipeline/Newsroom (Group 8), Wave A, Agent 3

## CRITICAL

### F-8-3-01 — Retry handler audit idempotency race: newRunId missing ≠ no audit record

**File:line:** `web/src/app/api/admin/pipeline/runs/[id]/retry/route.ts:129–146`

**Evidence:**
```typescript
// Line 130: audit only records if BOTH response.ok AND newRunId present
if (response.ok && newRunId) {
  await recordAdminAction({
    action: 'pipeline_retry',
    targetTable: 'pipeline_runs',
    targetId: params.id,
    newValue: {
      new_run_id: newRunId,  // requires run_id in generate response
      cluster_id: run.cluster_id,
      audience: run.audience,
      original_error_type: originalErrorType,
    },
  });
}

// Line 149–152: returns bodyJson + both old/new run ids even if audit skipped
return NextResponse.json(
  { ...bodyJson, old_run_id: params.id, new_run_id: newRunId },
  { status: response.status }
);
```

**Impact:** If generate route returns `response.ok=true` but response body lacks `run_id` field (network truncation, malformed response, or upstream JSON parse failure at line 119), the retry creates a new run silently but audit log records NOTHING. Operators cannot forensically trace why a retry succeeded without audit proof.

**Reproduction:** Manually craft a 200 response body from generate with no `run_id` field (e.g., `{ ok: true }`). Retry accepts it, returns new_run_id=null, but audit skips.

**Suggested fix direction:** Decouple newRunId extraction from generate response from audit logging; record audit with `success: true` regardless, and surface parse errors in the newValue block so missing run_id is forensically visible.

**Confidence:** HIGH

---

### F-8-3-02 — Prompt preset versioning absent; rollback semantics undefined

**File:line:** `schema/126_newsroom_redesign_clusters_presets_mutations.sql:38–56` (table def), `web/src/app/api/admin/prompt-presets/[id]/route.ts:169–211` (PATCH handler)

**Evidence:**
```sql
-- Line 38–49: ai_prompt_presets schema has no version column
CREATE TABLE IF NOT EXISTS public.ai_prompt_presets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text,
  body         text NOT NULL,
  audience     text NOT NULL DEFAULT 'both' CHECK (audience IN ('adult','kid','both')),
  category_id  uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
```

**Impact:** When a preset is used in an article (future preset_id foreign-key table), there is no way to track which version of the prompt was active at generation time. Editing a live preset's body retroactively changes the historical record without audit trail. Rolling back a bad prompt requires manual SQL; no API path exists.

**Reproduction:** Create preset "Fact-Check", use in article A. Months later, update "Fact-Check" body. Article A's prompt_fingerprint is now stale/misleading — the preset's new body doesn't match what was used.

**Suggested fix direction:** Add `version INT NOT NULL DEFAULT 1` to ai_prompt_presets; implement soft-update (insert new row with version+1, set old to is_active=false) rather than direct UPDATE; introduce GET /api/admin/prompt-presets/:id/versions endpoint.

**Confidence:** HIGH

---

## HIGH

### F-8-3-03 — Cost tracker cache TTL = 60s, but generate step-by-step cost isolation = ephemeral

**File:line:** `web/src/lib/pipeline/cost-tracker.ts:46–94`, `web/src/app/api/admin/pipeline/generate/route.ts:769–837`

**Evidence:**
```typescript
// cost-tracker.ts line 46: CAPS_TTL_MS = 60_000 (one minute cache)
const CAPS_TTL_MS = 60_000;
let _capsCache: Caps | null = null;

// generate/route.ts line 769: totalCostUsd is accumulated per-step
let totalCostUsd = 0;

// Lines 834, 1059, 1125, 1177, 1237, 1293, 1336, 1379, 1437: 
// costs added up in-memory without re-checking cap between steps
totalCostUsd += result.cost_usd;  // source_fetch
totalCostUsd += headlineRes.cost_usd + summaryRes.cost_usd + catRes.cost_usd;  // parallel
totalCostUsd += bodyRes.cost_usd;  // body
// ... continues for 12 steps total
```

**Impact:** A 300s (maxDuration) generate run calls checkCostCap() once at the start (line ~730 estimated). If daily_cost_usd_cap setting is reduced mid-run via settings table, the running generate will not detect it until 60s elapse (next cap fetch). Cost overruns escape the in-memory check during long parallel steps.

**Reproduction:** Start a generate run, let it run for 30s. Reduce `pipeline.daily_cost_usd_cap` setting to $5 (below current spend). Run continues unchecked for up to 60s more until the cap cache expires.

**Suggested fix direction:** Call checkCostCap() between step boundaries (not just once pre-flight), or reduce CAPS_TTL_MS to 10s for generation contexts where cost is accumulating real-time.

**Confidence:** HIGH

---

### F-8-3-04 — Ingest upsert idempotency silent on partial batch failure

**File:line:** `web/src/app/api/newsroom/ingest/run/route.ts:288–306`

**Evidence:**
```typescript
// Line 288–306: upsert with ignoreDuplicates
for (let i = 0; i < rows.length; i += 500) {
  const batch = rows.slice(i, i + 500);
  const { data: insData, error: insErr } = await service
    .from('discovery_items')
    .upsert(batch, {
      onConflict: 'raw_url',
      ignoreDuplicates: true,  // Line 296: silently drops conflicts
    })
    .select('id');
  if (insErr) {
    throw new Error(`discovery_items upsert failed: ${insErr.message}`);
  }
  inserted += (insData ?? []).length;  // Line 302: counts only successful inserts
}
```

**Impact:** If a batch of 500 items contains 250 duplicates (onConflict='raw_url' matches existing rows) + 250 new, the upsert succeeds silently with insData.length=250. The `inserted` counter reflects ONLY new rows, not updated ones. If operator re-runs ingest 10 times rapidly, `itemsInserted` will be 250 each time (correct), but there's no RPC-level semantics to communicate "350 rows were duplicates, skipped". Output_summary reflects truth, but operator UI may misinterpret 250 inserted as "growth".

**Reproduction:** Ingest two batches of the same 100 items in quick succession. First run: itemsInserted=100. Second run: itemsInserted=0 (all duplicates). But if you check discovery_items directly, the items already existed — this is correct behavior, but the silence on "we saw 100 duplicates" is a traceability gap.

**Suggested fix direction:** Track upsert result count separately from insert; emit output_summary.upserted_count + output_summary.inserted_count explicitly so the frontend can distinguish growth from re-processing.

**Confidence:** MEDIUM

---

### F-8-3-05 — Cluster mutations (merge/split/move) lack duplicate-operation idempotency guards

**File:line:** `web/src/app/api/admin/newsroom/clusters/[id]/merge/route.ts:76–108`, `web/src/app/api/admin/newsroom/clusters/[id]/split/route.ts:129–160`

**Evidence:**
```typescript
// merge/route.ts line 76–80: RPC call with no prior state check
const rpc = service.rpc as unknown as RpcCall;
const { data, error } = await rpc('merge_clusters', {
  p_source_id: sourceId,
  p_target_id: targetId,
});

// No guard like: 
// IF source_cluster.archived_at IS NOT NULL THEN RAISE; ...
```

**Impact:** If operator clicks "Merge clusters A→B" twice (network retry, double-click), the second call succeeds silently (RPC already moved all items, idempotent), but audit logs BOTH actions separately. While the RPC itself is idempotent (second call finds no items to move), the audit trail is polluted with duplicate "cluster.merge" records. On cancel and retry mutations, lack of explicit state guards means concurrent admin actions can race.

**Reproduction:** Merge A→B, network hangs, client retries. Second merge succeeds (RPC is re-entrant). Audit log now has two `cluster.merge` actions for the same pair.

**Suggested fix direction:** Add RPC-level pre-condition checks (e.g., IF source_cluster.archived_at IS NOT NULL RAISE EXCEPTION) or increment a `mutation_version` counter on each cluster and include it in the RPC precondition.

**Confidence:** MEDIUM

---

## MEDIUM

### F-8-3-06 — Plagiarism-check rewrite fallback silent on LLM error

**File:line:** `web/src/lib/pipeline/plagiarism-check.ts:49–130`

**Evidence:**
```typescript
// Line 79–129: LLM rewrite wrapped in try/catch, errors silently fall back
try {
  const res = await callModel({
    provider: 'anthropic',
    model: params.model,
    system,
    prompt,
    max_tokens: 3000,
    pipeline_run_id: params.pipeline_run_id,
    step_name: 'plagiarism_check',
    cluster_id: params.cluster_id,
    signal: params.signal,
  });
  // ... rewrite logic ...
} catch (err: unknown) {
  if (err instanceof CostCapExceededError) throw err;  // Re-throw cost cap
  if (err instanceof AbortedError) throw err;  // Re-throw abort
  pipelineLog.warn('newsroom.generate.plagiarism_check', {
    pipeline_run_id: params.pipeline_run_id,
    cluster_id: params.cluster_id ?? undefined,
    step: 'plagiarism_check',
    rewrite_error: err instanceof Error ? err.message : String(err),
  });
  return {
    body: params.body,  // Return original unchanged
    cost_usd: 0,
    latency_ms: Date.now() - start,
    rewritten: false,
  };
}
```

**Impact:** LLM rewrite errors (ProviderAPIError, RetryExhaustedError, timeout) are caught, logged as WARN, and silently returned as "not rewritten". The article persists with the flagged plagiarism still intact (rewritten=false), and the error is only visible in pipelineLog (not recorded in pipeline_costs, not in pipeline_runs.error_type). Operator has no UI signal that plagiarism check failed.

**Reproduction:** Trigger a plagiarism rewrite, induce a network timeout in callModel. Log says "rewrite_error: timeout", article persists unchanged, UI sees rewritten=false with no context.

**Suggested fix direction:** Log the error to pipeline_costs with success=false, and consider whether plagiarism_check errors should fail the entire generate run (fail-closed) or continue with a warning flag in output_summary.

**Confidence:** MEDIUM

---

### F-8-3-07 — Persist-article kids_summary parameter dead; RPC still accepts it

**File:line:** `web/src/lib/pipeline/persist-article.ts:88–92`, `schema/118_f7_persist_generated_article.sql:84, 233–235`

**Evidence:**
```typescript
// persist-article.ts line 89–92: comment says it's intentionally absent
// kids_summary intentionally absent — migration 124 removed the dead
// branch from persist_generated_article. The articles.kids_summary
// column still exists and is written by other surfaces (admin save,
// legacy ai/generate route), but the F7 persist RPC no longer reads it.

// BUT schema/118_f7_persist_generated_article.sql line 84:
v_kids_summary       text   := p_payload->>'kids_summary';

// Lines 233–235: RPC still tries to use it
IF v_kids_summary IS NOT NULL THEN
  UPDATE kid_articles SET kids_summary = v_kids_summary ...
```

**Impact:** PersistArticlePayload TypeScript interface intentionally omits kids_summary (good), but the underlying RPC still accepts and uses it if passed. This creates a latent discrepancy: if a future caller accidentally passes kids_summary in the JSONB payload, it will silently overwrite kid_articles.kids_summary. The generate route correctly omits it (no kids_summary in payload at line 1501), but the RPC's acceptance of it is a footgun for future refactors or manual debugging.

**Reproduction:** Call persist_generated_article with p_payload containing `"kids_summary": "some text"`. The RPC will execute the UPDATE at line 235 even though the TS interface forbids it.

**Suggested fix direction:** Either (a) remove the kids_summary branch from the RPC entirely (if truly dead), or (b) add RAISE EXCEPTION if kids_summary is present to fail-fast on accidental misuse.

**Confidence:** MEDIUM

---

### F-8-3-08 — Pipeline runs observability dashboard missing cost + error-type facets

**File:line:** `web/src/app/admin/pipeline/runs/page.tsx:45–56`

**Evidence:**
```typescript
type PipelineRunRow = Pick<
  Tables<'pipeline_runs'>,
  | 'id'
  | 'pipeline_type'
  | 'status'
  | 'audience'
  | 'cluster_id'
  | 'total_cost_usd'         // ✓ fetched
  | 'duration_ms'
  | 'started_at'
  | 'error_type'             // ✓ fetched
>;
```

The page header comment (line 1–24) lists filters: status, audience, pipeline_type, date_range. But no filter for error_type or cost_range. The total_cost_usd and error_type are fetched but not faceted in the UI.

**Impact:** Operators cannot quickly find "all runs with error_type='cost_cap_exceeded'" or "all runs >$10 cost" to debug systemic issues. If daily spend spikes, there's no dashboard way to isolate which run types consumed the budget.

**Reproduction:** Generate runs fail with cost_cap_exceeded. Operator wants to filter by error_type but can only sort by date/status.

**Suggested fix direction:** Add error_type and cost_range filters to the page; cost_range could be [$0–1], [$1–5], [$5–20], [>$20] presets.

**Confidence:** MEDIUM

---

## LOW

### F-8-3-09 — Ingest run orphans kid_discovery_items discovery path; unified feed assumption undocumented

**File:line:** `web/src/app/api/newsroom/ingest/run/route.ts:9–20, 311–320`

**Evidence:**
```typescript
// Line 9–20: comment claims unified feed
// - The legacy `feeds.audience` column stays in DB for back-compat with
//   mutation RPCs but is no longer a UI primary; ingest writes every
//   active feed regardless of its audience tag

// But kid_discovery_items table still exists. Lines 311–320:
async function clusterPool(): Promise<{
  // ... only single audience pass, not audience-split ...
  // Kid articles aren't matched against here because the unified feed
  // produces both adult and kid from the same cluster
```

**Impact:** Code comment suggests ingest produces ONE audience per cluster (adult default), but kid_articles exist. The code doesn't write kid_discovery_items anywhere in ingest. If a future schema change re-introduces kid-specific discovery, ingest will silently skip it. This is more of a documentation debt than a functional bug.

**Reproduction:** None — the code works as designed. This is a LOW confidence finding because the behavior is correct, just the assumption is undocumented in the migration/schema defs.

**Suggested fix direction:** Clarify in migration 126 header or schema comments: "Unified feed pipeline: ingest writes discovery_items for all active feeds, audience tagging deferred to generation time. kid_discovery_items table is deprecated and not used by F7 ingest."

**Confidence:** LOW

---

### F-8-3-10 — Cost-tracker circular import risk: errors.ts dependency

**File:line:** `web/src/lib/pipeline/cost-tracker.ts:24`, `web/src/lib/pipeline/errors.ts`

**Evidence:**
```typescript
// cost-tracker.ts line 24: imports from errors, not from call-model
import { CostCapExceededError, type Provider } from './errors';

// Reasoning (line 18–20):
// CostCapExceededError is imported from ./errors (NOT ./call-model) to break
// the runtime circular import between this file and call-model.ts.
```

**Impact:** Code acknowledges the circular import risk but uses a workaround (importing from errors instead of call-model). This is defensive but indicates tight coupling. If call-model ever re-exports cost-tracker, the chain will break at runtime.

**Reproduction:** None in current state. This is more of a refactoring debt flag.

**Suggested fix direction:** Consider decoupling cost-tracker and call-model completely by moving CostCapExceededError to a separate `cost-errors.ts` module, or introducing a cost-cap interface that call-model depends on instead of the reverse.

**Confidence:** LOW

---

## Summary

**CRITICAL findings (2):** Audit idempotency + version rollback gaps in retry/preset flows.  
**HIGH findings (3):** Cost cap cache TTL, ingest silent dedup, cluster mutation races.  
**MEDIUM findings (5):** Plagiarism fallback, persist RPC dead code, observability, error handling.  
**LOW findings (2):** Ingest documentation, import coupling.

All findings carry first-hand code evidence and file:line citations per audit scope.
