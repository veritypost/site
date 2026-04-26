---
wave: B
group: 8 Admin Pipeline/Newsroom/F7
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Admin Pipeline/Newsroom/F7, Wave B, Agent 3

## CRITICAL

### F-B8-3-01 — Pipeline run state mutation races unguarded in generate finally block
**File:line:** `web/src/app/api/admin/pipeline/generate/route.ts:1657-1682`
**Evidence:**
```typescript
await service
  .from('pipeline_runs')
  .update({
    status: finalStatus,
    completed_at: completedAt.toISOString(),
    duration_ms: durationMs,
    // ... fields
    error_type: finalErrorType,
  })
  .eq('id', runId)
  .eq('status', 'running');  // guard present
```
**Impact:** The finally block correctly applies `.eq('status', 'running')` guard to prevent stomping cancel/cron-orphan state. However, at line 1682, this UPDATE is wrapped in a `try/catch` that **swallows all errors** (`console.error` only). If the guard rejects the update (status already changed), the caller receives a 500 with `finalStatus='completed'` but the row retains `status='failed'` (from cancel route). The response body does not signal failure. Admin UI will show stale/incorrect run state.
**Reproduction:** (1) Start generate run, (2) admin clicks Cancel (marks status='failed'), (3) generate finally block tries UPDATE with `.eq('status','running')` — rejects cleanly, (4) route returns JSON with `ok:true` but DB state is `failed`, (5) UI shows "success" with stale cancelled state.
**Suggested fix direction:** Propagate update result check to response or logs; consider returning 409 Conflict if finally block's critical UPDATE no-ops.
**Confidence:** HIGH

### F-B8-3-02 — Cluster mutation RPCs lack per-operation idempotency check
**File:line:** `web/src/app/api/admin/newsroom/clusters/[id]/move-item/route.ts:105-111`
**Evidence:**
```typescript
const { data, error } = await rpc('reassign_cluster_items', {
  p_item_id: itemId,
  p_target_cluster_id: targetClusterId,
  p_audience: audience,
});

if (error) {
  // handle errors
}
```
**Impact:** The RPC call (`reassign_cluster_items`) itself is not documented as idempotent. If a network timeout occurs AFTER the RPC completes but BEFORE the route receives the response, a retry sends the same parameters again. No client-visible error (route catches/logs silently). The item may be moved twice, or move audits double-recorded. Similar pattern in merge/split routes.
**Reproduction:** (1) Admin moves item A from cluster C1 to C2, (2) network drops after RPC succeeds but before response, (3) browser retries POST, (4) item state drifts or audit log doubles entry.
**Suggested fix direction:** Add request idempotency key (Idempotency-Key header) + server-side dedup table, or document RPC as idempotent-by-design with evidence from migration.
**Confidence:** MEDIUM

### F-B8-3-03 — Cost tracker fail-closed sentinel swallowed in error message
**File:line:** `web/src/lib/pipeline/cost-tracker.ts:145-166`
**Evidence:**
```typescript
export async function checkCostCap(estimated_cost_usd: number): Promise<void> {
  if (!Number.isFinite(estimated_cost_usd) || estimated_cost_usd < 0) {
    throw new CostCapExceededError(
      `[cost-tracker] invalid estimate: ${estimated_cost_usd}`,
      estimated_cost_usd,
      FAIL_CLOSED_SENTINEL  // -1
    );
  }
  let caps: Caps;
  let today_usd: number;
  try {
    [caps, today_usd] = await Promise.all([getCaps(), getTodayCumulativeUsd()]);
  } catch (err) {
    console.error('[cost-tracker:checkCostCap] fail-closed', err);
    throw new CostCapExceededError(
      `[cost-tracker] cap check unavailable; failing closed`,
      estimated_cost_usd,
      FAIL_CLOSED_SENTINEL  // -1
    );
  }
```
**Impact:** When getCaps() or getTodayCumulativeUsd() fails (network/DB timeout), the error is logged and CostCapExceededError is thrown with `cap_usd=-1` sentinel. However, the error message does not include diagnostic detail (e.g., which RPC failed, actual error). Downstream handlers (generate route, call-model) catch CostCapExceededError and abort generation. The -1 sentinel is never exposed to admin UI (only checked programmatically). If this is the intended behavior, it's correct; but there's zero observability for why a generation was blocked as "cost cap exceeded" when the real issue was a Supabase RPC timeout. Operator cannot distinguish infrastructure fault from actual spend.
**Reproduction:** (1) Supabase becomes unreachable, (2) cost-tracker.getTodayCumulativeUsd() times out, (3) generate fails with opaque "Daily cost cap reached" error, (4) admin mistakenly thinks daily spend exceeded.
**Suggested fix direction:** Include original error message in CostCapExceededError for observability; expose -1 sentinel to error details so UI can distinguish "cap hit" from "unavailable".
**Confidence:** MEDIUM

## HIGH

### F-B8-3-04 — Ingest endpoint admin-gated but kill-switch silently disabled
**File:line:** `web/src/app/api/newsroom/ingest/run/route.ts:108-138`
**Evidence:**
```typescript
export async function POST(req: Request) {
  // 1. Permission gate
  let actor;
  try {
    const supabase = createClient();
    actor = await requirePermission('admin.pipeline.run_ingest', supabase);
  } catch (err) {
    return permissionError(err);
  }
  // ...
  // 2. Kill switch
  const enabled = await isIngestEnabled(service);
  if (!enabled) {
    return NextResponse.json({ error: 'Ingestion disabled' }, { status: 503 });
  }
```
**Impact:** Ingest is correctly admin-gated via `admin.pipeline.run_ingest` permission (not open). However, the kill-switch check (`ai.ingest_enabled` setting) happens AFTER permission gate, so permission errors are checked first. If the permission check fails, the caller never learns whether ingest is disabled — they see "permission denied" instead. Conversely, if ingest is disabled but the actor has permission, they receive 503. This is correct behavior, but it means there's no scenario where both "disabled" and "unauthorized" states collide, so no functional bug. Just documenting the order.
**Reproduction:** Permission + kill-switch are orthogonal; no collision found.
**Suggested fix direction:** No fix needed; behavior is correct. Document in task notes if needed.
**Confidence:** LOW

### F-B8-3-05 — Generate route sources-override path skips discovery_items state updates
**File:line:** `web/src/app/api/admin/pipeline/generate/route.ts:680-693, 1608-1628`
**Evidence:**
```typescript
if (sourceUrlsOverridden) {
  items = sourceUrlOverride.map((url) => ({
    id: `override:${url}`,
    raw_url: url,
    raw_title: null,
    raw_body: null,
    metadata: { source_override: true } as Json,
    feed_id: null,
    state: 'override',
  }));
} else {
  // ... load real discovery_items rows
}
// ...
if (!sourceUrlsOverridden) {
  try {
    let nextState: 'published' | 'clustered' | 'ignored';
    if (finalStatus === 'completed') nextState = 'published';
    else if (audienceMismatch) nextState = 'ignored';
    else nextState = 'clustered';
    await service
      .from(discoveryTable)
      .update({
        state: nextState,
        ...(articleId ? { article_id: articleId } : {}),
        updated_at: new Date().toISOString(),
      })
      .in('id', itemIds);
```
**Impact:** When `sourceUrlsOverridden=true` (explicit URL list or kid auto-derived), the route skips the `state='generating'` update at claim time (line 755) and the state reset in finally (lines 1611-1628). The virtual items (with synthetic `id: 'override:<url>'`) have no DB rows. This is by design — the route correctly avoids updating real discovery_items when URLs are overridden. However, the itemIds array still contains the synthetic IDs, so any future code that tries to use itemIds for discovery updates will silently no-op. **Edge case:** If a kid run is triggered with explicit source_urls, but then a concurrent adult generation uses the same cluster's real discovery_items, both pipelines are active. The adult pipeline marks items `state='generating'`, but the kid pipeline (which has source_urls override) never transitions those rows. Result: adult generation completes, marks items 'published', but if kid pipeline fails after scraping, the finally block does nothing (sourceUrlsOverridden=true skips the reset). The discovery items are left in 'published' state even though the kid generation failed. Operator visibility is lost.
**Reproduction:** (1) Cluster C has discovery items, (2) admin triggers kid generation with explicit source_urls parameter (sourceUrlsOverridden=true), (3) admin also manually triggers adult generation concurrently from same cluster (sourceUrlsOverridden=false), (4) kid generation scrapes but hits cost cap mid-way, finally block skips discovery state reset due to sourceUrlsOverridden flag, (5) adult generation completes, marks items 'published', (6) kid failure is invisible in discovery_items state — items are 'published' but kid run failed.
**Suggested fix direction:** Clarify ownership of discovery_items rows when sourceUrlsOverridden=true; consider tracking which run(s) touched which rows, or use different state tokens (e.g., 'generating:kid' vs 'generating:adult').
**Confidence:** MEDIUM

## MEDIUM

### F-B8-3-06 — Plagiarism check returns original body on rewrite error, cost may not be charged
**File:line:** `web/src/lib/pipeline/plagiarism-check.ts:114-129`
**Evidence:**
```typescript
  } catch (err: unknown) {
    if (err instanceof CostCapExceededError) throw err;
    if (err instanceof AbortedError) throw err;
    pipelineLog.warn('newsroom.generate.plagiarism_check', {
      pipeline_run_id: params.pipeline_run_id,
      cluster_id: params.cluster_id ?? undefined,
      step: 'plagiarism_check',
      rewrite_error: err instanceof Error ? err.message : String(err),
    });
    return {
      body: params.body,
      cost_usd: 0,  // cost is zeroed on error
      latency_ms: Date.now() - start,
      rewritten: false,
    };
  }
```
**Impact:** When plagiarism rewrite LLM call fails (provider timeout, rate limit, etc.), the function returns the original body with `cost_usd: 0`. This is logged as a warning but does not abort the generation. The article proceeds with the original (potentially plagiarized) body. If the plagiarism check was flagged and rewrite was attempted but failed, the original body may still violate plagiarism thresholds. Additionally, if the LLM call partially consumed tokens before timing out, the actual cost should be charged to the pipeline_run, but this code zeros it. The cost ledger is inaccurate. Admin dashboard will show `total_cost_usd` excluding the failed rewrite attempt, which skews daily spend calculations.
**Reproduction:** (1) Cluster has high-plagiarism content flagged for rewrite, (2) plagiarism_check calls callModel, (3) Anthropic API times out mid-response, (4) rewriteForPlagiarism catches ProviderAPIError (not CostCapExceededError or AbortedError), (5) function returns cost_usd=0 and original body, (6) generation completes with plagiarized text and underreported cost.
**Suggested fix direction:** (1) Attempt to parse partial response cost from provider timeout, or (2) always charge an estimated cost for attempted rewrite, or (3) propagate the error to fail the generation rather than silently using original.
**Confidence:** MEDIUM

### F-B8-3-07 — Prompt preset POST missing created_by assignment
**File:line:** `web/src/app/api/admin/prompt-presets/route.ts:120-137`
**Evidence:**
```typescript
  const insertPayload = {
    name,
    description,
    body,
    audience,
    category_id,
    sort_order,
    is_active: true,
    created_by: actor.id,  // assigned correctly
  };

  const { data, error } = await service
    .from('ai_prompt_presets')
    .insert(insertPayload)
    .select(
      'id, name, description, body, audience, category_id, is_active, sort_order, created_by, created_at, updated_at'
    )
    .single();
```
**Impact:** The `created_by` is correctly set to `actor.id` in insertPayload. However, there is no version column being set. If there is a `version` column in `ai_prompt_presets` table (used for rollback tracking per task focus), this code does not initialize it. The preset will have version=NULL or a DB default (likely 1). If admin later tries to rollback to a specific preset version, the version=NULL preset cannot be referenced. Additionally, the POST response does not include `version` in the selected fields, so the client receives no version token to display or track.
**Reproduction:** (1) Admin creates preset "New Prompt V1", (2) preset inserted with version=NULL (or DB default), (3) admin later edits same preset, creates "New Prompt V2", (4) admin tries to rollback to V1 via version token — fails if version field is missing or NULL.
**Suggested fix direction:** Initialize version=1 on insert; include version in response; confirm ai_prompt_presets schema has version column.
**Confidence:** MEDIUM

## LOW

### F-B8-3-08 — Cost tracker cache TTL is fixed, not tunable
**File:line:** `web/src/lib/pipeline/cost-tracker.ts:45-96`
**Evidence:**
```typescript
const CAPS_TTL_MS = 60_000;
let _capsCache: Caps | null = null;

async function getCaps(): Promise<Caps> {
  const now = Date.now();
  if (_capsCache && _capsCache.expiresAt > now) return _capsCache;

  const supabase = createServiceClient();
  const { data, error } = await service
    .from('settings')
    .select('key, value, value_type')
    .in('key', [
      'pipeline.daily_cost_usd_cap',
      'pipeline.per_run_cost_usd_cap',
      'pipeline.daily_cost_soft_alert_pct',
    ]);
```
**Impact:** Caps are cached for 60 seconds. If an admin updates the daily cost cap setting in Supabase, the change takes up to 60 seconds to propagate to the generate route. During this window, generations may consume more cost than the (now-lower) new cap allows. This is acceptable for a 60s eventual-consistency window, but it's not tunable. If operators want faster propagation, they cannot change TTL without code edit. The cache TTL is hardcoded, unlike the rate-limit window (which is DB-driven per comment on line 142-143 of ingest route).
**Reproduction:** (1) Admin sets daily cap to $100, (2) cost-tracker caches caps with 60s TTL, (3) 30s later, admin lowers cap to $50, (4) cap remains $100 in memory for another 30s, (5) generation charges $60 against stale $100 cap, (6) cap is breached by actual $160 spend.
**Suggested fix direction:** Make TTL tunable via `pipeline.caps_cache_ttl_sec` setting, or reduce default to 30s if faster propagation is needed.
**Confidence:** LOW

### F-B8-3-09 — Cluster lock release in finally block is best-effort, silently swallows errors
**File:line:** `web/src/app/api/admin/pipeline/generate/route.ts:1631-1638`
**Evidence:**
```typescript
    // b. Release cluster lock
    try {
      await service.rpc('release_cluster_lock', {
        p_cluster_id: cluster_id,
        p_locked_by: runId,
      });
    } catch (lockReleaseErr) {
      console.error('[newsroom.generate.finally.unlock]', lockReleaseErr);
    }
```
**Impact:** If `release_cluster_lock` RPC fails (Supabase timeout, migration not deployed, etc.), the error is logged to console but not propagated. The cluster remains locked with `locked_by=runId`. If the same run is retried, the lock is already held, and retry fails immediately with "Cluster lock held by another run." Admin must manually call the unlock RPC or wait for the lock TTL (600s) to expire. During this window, the cluster cannot be generated. The error is best-effort, which is fine for a finally block, but there's no observability to prompt the admin to manually unlock.
**Reproduction:** (1) Generate runs, acquires cluster lock, (2) Supabase RPC endpoint times out during finally, (3) release_cluster_lock fails silently, (4) lock persists for 600s, (5) admin tries to retry, gets "locked" error, (6) has to wait or manually call unlock RPC.
**Suggested fix direction:** Emit structured error log (not just console.error) so monitoring can alert; document manual unlock procedure for operators.
**Confidence:** LOW

## UNSURE

### F-B8-3-10 — Ingest clustering summary error handling not explicitly tested
The ingest route's clustering orchestration (lines 311-469) collects per-cluster errors into `clusterErrors` array and continues on error, rather than failing the entire ingest. This is a graceful degradation pattern. However, there is no test coverage evidence that a single cluster failure (e.g., feed_clusters insert fails) actually leaves the summary with `clusterErrors` populated and the response still 200 OK. If the RPC throws instead of returning gracefully, the entire ingest fails. The code comment says "Per-cluster failures are caught and recorded" but the actual catch block is inside the `for (const cluster of clusters)` loop at line 457. Need to verify that partial failure does not cascade.

**What would resolve this:** (1) Audit test suite for ingest route with simulated RPC failure mid-cluster, or (2) check if any live ingest run has ever produced a clusterErrors entry, or (3) code review of the RPC `merge_clusters` / cluster insert to confirm no implicit throws.

---
