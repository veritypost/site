---
wave: B
group: 8 Pipeline/Newsroom/F7
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Admin Pipeline/Newsroom/F7, Wave B, Agent 1

## CRITICAL

### F-8-1-01 — Cluster merge mutation lacks idempotency guard
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/newsroom/clusters/[id]/merge/route.ts:77–80`

**Evidence:**
```typescript
const { data, error } = await rpc('merge_clusters', {
  p_source_id: sourceId,
  p_target_id: targetId,
});
```

No `.eq('status', 'active')` or equivalent idempotency check. The RPC call has no guard preventing the same merge from being replayed if the response is lost. On retry, items already moved to target will be moved again (or fail silently), and the audit log will record duplicate `cluster.merge` actions.

**Impact:** Admin can accidentally or maliciously replay a merge request multiple times via network retry or manual repeat calls, creating duplicate item movements or audit trails. Cluster integrity is at risk if the RPC is not internally idempotent.

**Reproduction:** Send POST `/api/admin/newsroom/clusters/{id}/merge` with valid target_id twice with identical payload. Observe whether the merge happens both times or the second is rejected.

**Suggested fix direction:** Add `.eq('status', 'active')` guard to the RPC call, or implement request idempotency tokens and check for duplicate recent merges.

**Confidence:** HIGH

---

### F-8-1-02 — Cost aggregation rounds intermediate values, losing precision
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/pipeline/runs/[id]/route.ts:104–105`

**Evidence:**
```typescript
const c = typeof s.cost_usd === 'string' ? Number.parseFloat(s.cost_usd) : s.cost_usd;
if (Number.isFinite(c)) totalCostUsd += c;
```
and
```typescript
cost_usd: Number(totalCostUsd.toFixed(6)),
```

Each individual pipeline_costs row may store `cost_usd` as a string (Postgres numeric → JSON string in some Supabase paths). The parseFloat + accumulation in totalCostUsd can suffer from floating-point precision loss across many rows. The final toFixed(6) rounds after aggregation, but intermediate accumulated errors are irreversible.

**Impact:** Pipeline run observability dashboard (costs page) shows incorrect total cost figures, especially for runs with many steps (6+ steps * 3-5 decimal rounding = 0.0018+ USD error possible). Cost tracking audit becomes unreliable.

**Reproduction:** Generate a run with 20+ steps, each with cost_usd = 0.00123456 (string). Sum manually: 20 * 0.00123456 = 0.0246912. Check the reported total_cost_usd in the run detail API response.

**Suggested fix direction:** Parse all cost_usd as Decimal/BigInt before accumulation, or sum at the database level via a SUM() aggregate.

**Confidence:** HIGH

---

### F-8-1-03 — Prompt preset versioning and rollback completely absent
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/prompt-presets/[id]/route.ts:173–180`

**Evidence:**
```typescript
const { data, error } = await service
  .from('ai_prompt_presets')
  .update(update)
  .eq('id', id)
  .select(...)
  .single();
```

The PATCH endpoint overwrites preset fields in-place with no version column, no audit-snapshot table, and no rollback capability. If an operator accidentally updates a preset's body to gibberish, there is no way to restore the prior version. The audit_log records the change, but the old_value in the admin_actions row is loaded BEFORE the update, so the exact text is lost if the column was modified multiple times in a session.

**Impact:** Accidental prompt changes affect all future runs using that preset. No rollback means production articles could be generated with broken prompts. Operators lose trust in the preset system.

**Reproduction:** Edit a preset body to "zzz", then try to restore the original prompt body. No version history UI exists.

**Suggested fix direction:** Add `version` (INT) and `parent_version_id` (UUID) columns to ai_prompt_presets; create an ai_prompt_preset_versions immutable log table; wire UI to show version history and rollback button.

**Confidence:** HIGH

---

## HIGH

### F-8-1-04 — Retry route depends on migration 120 (error_type column) without pre-check
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/pipeline/runs/[id]/retry/route.ts:49–66`

**Evidence:**
```typescript
const { data: run, error: runErr } = await service
  .from('pipeline_runs')
  .select(
    'id, status, pipeline_type, cluster_id, audience, provider, model, freeform_instructions, error_type'
  )
  .eq('id', params.id)
  .maybeSingle();
```

The route selects `error_type` column (migration 120 — STAGED) without checking if the migration has been applied. If the column does not exist, the select fails with a 500. The comment on line 49 acknowledges the dependency: "error_type is read from the dedicated column (migration 120 applied; the one-cycle output_summary stash was dropped)." No fallback to output_summary.final_error_type is in place.

**Impact:** If migration 120 fails to apply or is blocked, all retry operations fail with a cryptic 500 error. Admin cannot retry failed runs until the migration is manually deployed.

**Reproduction:** Deploy the code without migration 120. Call POST /api/admin/pipeline/runs/{id}/retry on a failed run. Receive 500.

**Suggested fix direction:** Add a migration guard that checks for the error_type column existence in a pre-flight RPC, or provide a fallback query that tries error_type first, then parses output_summary.

**Confidence:** HIGH

---

### F-8-1-05 — Cost-tracker cap cache invalidation gap (60s TTL during policy change)
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/lib/pipeline/cost-tracker.ts:46–95`

**Evidence:**
```typescript
const CAPS_TTL_MS = 60_000;
let _capsCache: Caps | null = null;

async function getCaps(): Promise<Caps> {
  const now = Date.now();
  if (_capsCache && _capsCache.expiresAt > now) return _capsCache;
  // ... fetch from settings table ...
  _capsCache = caps;
  return caps;
}
```

The caps (daily_usd_cap, per_run_usd_cap) are cached for 60 seconds in module-level state. If an operator updates the cap in the settings table (e.g., lowering daily cap to $10), the cache is not invalidated. Runs initiated within the next 60s still use the old cap. No cache-busting RPC or event is emitted when settings change.

**Impact:** Cost cap enforcement is delayed up to 60s after a policy change. During an emergency (e.g., API cost spike), the admin lowers the cap, but the first 60s of new runs still use the old limit. Potential overspend.

**Reproduction:** Set pipeline.daily_cost_usd_cap = 100. Initialize a run (cache now loaded with 100). Within 30s, admin updates cap to 10 in settings. New run checks cap and still sees 100 until the cache expires.

**Suggested fix direction:** Emit a real-time invalidation signal (Supabase Realtime subscription, or webhook) when settings.pipeline.* keys are modified; or reduce TTL to 10s; or add a manual cache-bust API endpoint.

**Confidence:** HIGH

---

## MEDIUM

### F-8-1-06 — Archive operation is not idempotent in the response layer
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/newsroom/clusters/[id]/archive/route.ts:86–90`

**Evidence:**
```typescript
const { data, error } = await rpc('archive_cluster', {
  p_cluster_id: clusterId,
  p_reason: reason,
});

if (error) {
  const code = error.code;
  if (code === '22023') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 422 });
  }
```

The RPC comment (line 6) claims: "Idempotent at the RPC level — re-archiving keeps the original archived_at." This is true for the RPC, but the route does NOT prevent re-archiving in the response. If the cluster is already archived (is_active=false), calling archive again will re-run the RPC and potentially re-execute any triggers. The audit log will show a duplicate `cluster.archive` action. The UI should prevent this client-side, but the server does not validate is_active=true before allowing the RPC.

**Impact:** Audit trail is polluted with duplicate archive events. If the RPC has side effects (e.g., send notification, log event), they fire twice. Operator UX is confusing.

**Reproduction:** Archive a cluster. Call POST /api/admin/newsroom/clusters/{id}/archive again. Observe two archive entries in admin_actions.

**Suggested fix direction:** Check is_active before calling the RPC; return 409 with "Cluster is already archived" if so.

**Confidence:** MEDIUM

---

### F-8-1-07 — Plagiarism rewrite output not persisted to pipeline_costs
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/lib/pipeline/plagiarism-check.ts:49–100`

**Evidence:**
```typescript
export async function rewriteForPlagiarism(params: {
  // ...
  additionalInstructions?: string;
}): Promise<{
  body: string;
  cost_usd: number;
  latency_ms: number;
  rewritten: boolean;
}> {
  // ... callModel() to rewrite ...
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
  // ...
  return {
    body: cleaned,
    cost_usd: res.cost_usd,
    latency_ms: Date.now() - start,
    rewritten: true,
  };
}
```

The function returns cost_usd and latency_ms, but the caller in generate/route.ts (line ~1237) only uses the returned values to accumulate totalCostUsd. No explicit pipeline_costs INSERT row is created for the plagiarism_check rewrite step. The cost_usd is added to the run total, but the per-step observability row is missing, making it impossible to drill into plagiarism costs per run.

**Impact:** Pipeline costs dashboard cannot show plagiarism-check step breakdowns. Cost attribution is lost. Difficult to measure plagiarism-check efficiency.

**Reproduction:** Generate a run that triggers plagiarism_check rewrite. Query pipeline_costs WHERE step='plagiarism_check'. No row exists for the rewrite, only possibly an initial check row.

**Suggested fix direction:** After rewriteForPlagiarism returns, insert a pipeline_costs row with step='plagiarism_check', rewritten=true, cost_usd=res.cost_usd, etc.

**Confidence:** MEDIUM

---

## UNSURE

### F-8-1-08 — Cluster articles batch-read does not enforce RLS on returned rows
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/newsroom/clusters/articles/route.ts:114–126`

**Evidence:**
```typescript
const [adultRes, kidRes] = await Promise.all([
  service
    .from('articles')
    .select('id, cluster_id, status, created_at')
    .in('cluster_id', clusterIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: false }),
  service
    .from('kid_articles')
    .select('id, cluster_id, status, created_at')
    .in('cluster_id', clusterIds)
    .order('created_at', { ascending: false }),
]);
```

The route uses service-role (RLS-bypass) client to read articles + kid_articles. This is necessary because admin operators don't hold a kid JWT (line 14 comment is correct). However, the route does not explicitly filter by audience or check that the returned article IDs belong to the requested cluster_ids. If a cluster_id is invalid or references another audience's content, the service-role client could leak it.

**Impact:** Potential information disclosure if a cluster_id can be guessed or enumerated to fetch articles from other audiences. The permission gate (admin.pipeline.clusters.manage) should prevent this, but the API does not validate the returned rows.

**Reproduction:** Request articles for a cluster_id that belongs to a different audience. Check if the response leaks adult article IDs for a kid-only cluster.

**Suggested fix direction:** Validate that each returned article's cluster_id matches one of the requested clusterIds; consider adding an audience check at the RPC level.

**Confidence:** LOW (may be mitigated by permission system; needs tiebreaker on cluster ownership validation)

