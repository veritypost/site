---
wave: A
group: 8 (Admin Pipeline/Newsroom/F7)
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Pipeline Admin, Wave A, Agent 2

## CRITICAL

### F-8-2-01 — Cluster mutation finally block update has race condition guard, but discovery_items reset happens before status check

**File:line:** `web/src/app/api/admin/pipeline/generate/route.ts:1617-1624`

**Evidence:**
```
// Code at 1617-1624: UPDATE discovery_items state BEFORE status guard check
await service
  .from(discoveryTable)
  .update({
    state: nextState,
    ...(articleId ? { article_id: articleId } : {}),
    updated_at: new Date().toISOString(),
  })
  .in('id', itemIds);

// But pipeline_runs UPDATE at 1657-1682 HAS .eq('status', 'running') guard
await service
  .from('pipeline_runs')
  .update({...})
  .eq('id', runId)
  .eq('status', 'running');
```

**Impact:** If a concurrent cancel route marks the run as failed before finally block executes, discovery_items.state gets reset (published/clustered/ignored) but pipeline_runs.status remains failed. This creates an asymmetric state: discovery items reflect success branch logic while run shows failure. Client UI will misread cluster state.

**Reproduction:** (1) Start generate run, (2) immediately cancel via cancel endpoint, (3) check discovery_items.state vs pipeline_runs.status at race condition window.

**Suggested fix direction:** Add `.eq('status', 'running')` guard to discovery_items update OR move discovery state reset after pipeline_runs update inside the same guarded block.

**Confidence:** HIGH

### F-8-2-02 — Prompt preset PATCH/DELETE lacks version history; no rollback mechanism

**File:line:** `web/src/app/api/admin/prompt-presets/[id]/route.ts:196-211`

**Evidence:**
```typescript
// PATCH creates audit record but no version snapshot
await recordAdminAction({
  action: archived ? 'ai_prompt_preset.archive' : 'ai_prompt_preset.update',
  targetTable: 'ai_prompt_presets',
  targetId: id,
  oldValue: {
    name: existing.name,
    description: existing.description,
    audience: existing.audience,
    category_id: existing.category_id,
    sort_order: existing.sort_order,
    is_active: existing.is_active,
  },
  newValue: update,
});
```

**Impact:** Audit log captures old/new values but ai_prompt_presets table has no version history column. If a prompt is modified, there is no way to revert to a prior version or fetch version N of a preset that was used for article X. Pipeline_runs.prompt_fingerprint exists but has no reverse lookup to reconstruct the exact prompt text at generation time.

**Reproduction:** (1) Create prompt preset, (2) modify body text, (3) attempt to retrieve the old prompt text → not available except via admin_audit_log JSON.

**Suggested fix direction:** Add ai_prompt_presets_versions table with (id, preset_id, version_num, body, audience, ..., created_at) or a jsonb `version_history` column on ai_prompt_presets; extend PATCH to snapshot before update.

**Confidence:** HIGH

## HIGH

### F-8-2-03 — Cancel route does not check for status='running' when locking discovery_items state reset

**File:line:** `web/src/app/api/admin/pipeline/runs/[id]/cancel/route.ts:131-135`

**Evidence:**
```typescript
// Update discovery_items state unconditionally (no status guard)
await service
  .from(discoveryTable)
  .update({ state: 'clustered', updated_at: new Date().toISOString() })
  .eq('cluster_id', run.cluster_id)
  .eq('state', 'generating');
```

**Impact:** If two admins cancel the same run simultaneously, or if cancel is called after generate's finally block has already reset discovery state, the second cancel's discovery state reset succeeds unconditionally (state='generating' filter still matches on retries). This is idempotent per-item but creates log spam and potential for a slow discovery item to land in the wrong state if timing is unfortunate.

**Reproduction:** (1) Trigger two cancel requests on the same run_id concurrently, (2) observe discovery_items log entries for duplicate state resets.

**Suggested fix direction:** Add `.eq('status', 'running')` guard to the discovery_items update in cancel route, matching generate's finally block pattern.

**Confidence:** MEDIUM

### F-8-2-04 — Cost cap check in generate reads settings twice, missing potential for stale cache between reads

**File:line:** `web/src/app/api/admin/pipeline/generate/route.ts:500-542`

**Evidence:**
```typescript
// Read 1: daily cost via RPC
const { data: todayUsd, error: costErr } = await service.rpc('pipeline_today_cost_usd');

// Read 2: cap value from settings (no caching, inline read)
const { data: capData } = await service
  .from('settings')
  .select('value')
  .eq('key', 'pipeline.daily_cost_usd_cap')
  .maybeSingle();
const cap = Number(capData?.value ?? 10);
```

**Impact:** If the daily cap setting is changed between the RPC read and the settings read (two sequential queries), the pre-flight cost check may use a cap that differs from what checkCostCap() enforces later in call-model.ts. Cost-tracker.ts implements 60s caching; generate route does not. This creates a window where an admin can lower the cap, a generate request passes pre-flight using the old cap, then hits checkCostCap with the new cap and fails mid-pipeline.

**Reproduction:** (1) Start generate, (2) alter pipeline.daily_cost_usd_cap setting between generate's cost-check (line 500) and call-model invocation (line ~1000+), (3) observe inconsistent cap enforcement.

**Suggested fix direction:** Use cost-tracker's getTodayCumulativeUsd() + getCaps() pattern (with caching) instead of inline settings read, or extract cap read to a separate cached function matching cost-tracker.ts design.

**Confidence:** MEDIUM

### F-8-2-05 — Persist article RPC bypasses body_html sanitization; caller responsibility documented but unchecked

**File:line:** `web/src/lib/pipeline/persist-article.ts:14-17`

**Evidence:**
```typescript
/**
 *   - `body_html` must be pre-sanitized by the caller (F7 Phase 3
 *     invariant). The RPC rejects empty bodies but does NOT sanitize.
```

And in generate route, the body is rendered via renderBodyHtml but there is no explicit sanitization call before passing to persistGeneratedArticle.

**Impact:** If renderBodyHtml produces unsafe HTML (e.g., unescaped script tags, onclick handlers), the persist RPC will store it directly. The invariant is documented but not enforced. A bug in renderBodyHtml or a future change to skip sanitization would lead to XSS on article render.

**Reproduction:** Inject a markdown body with `<script>alert('xss')</script>` through the generate pipeline and check if articles.body_html contains it post-persist.

**Suggested fix direction:** Add an explicit sanitization step (e.g., DOMPurify or similar) in the generate route before passing body_html to persistGeneratedArticle, or add a CHECK constraint in the RPC to reject known-unsafe patterns.

**Confidence:** MEDIUM

## MEDIUM

### F-8-2-06 — Cluster archive RPC is idempotent at RPC level but audit log is not

**File:line:** `web/src/app/api/admin/newsroom/clusters/[id]/archive/route.ts:105-114`

**Evidence:**
```typescript
// Comment says RPC is idempotent: "re-archiving keeps the original archived_at"
// But audit is recorded unconditionally
await recordAdminAction({
  action: 'cluster.archive',
  targetTable: 'feed_clusters',
  targetId: clusterId,
  reason,
  oldValue: null,
  newValue: data ?? { cluster_id: clusterId, reason },
});
```

**Impact:** If an admin accidentally calls archive twice, two audit_log entries are created for the same cluster (both logged as cluster.archive action). The RPC deduplicates the write, but the audit trail duplicates. Not a breaking bug, but violates audit trail idempotency expectation (audit should reflect the actual number of mutations, not requests).

**Reproduction:** (1) Archive a cluster, (2) call the same endpoint again with same cluster_id, (3) check admin_audit_log for duplicate entries.

**Suggested fix direction:** Query the cluster's archived_at before recording audit; only log if archived_at was null (i.e., this is the first archive). Alternatively, include a dedup check in the route.

**Confidence:** MEDIUM

### F-8-2-07 — Ingest endpoint rate limit uses DB policy but fallback max=5 is hardcoded

**File:line:** `web/src/app/api/newsroom/ingest/run/route.ts:144-149`

**Evidence:**
```typescript
const rl = await checkRateLimit(service, {
  key: `newsroom_ingest:user:${actorId}`,
  policyKey: 'newsroom_ingest',
  max: 5,
  windowSec: 600,
});
```

**Impact:** If the DB rate_limits row for newsroom_ingest is missing, the fallback (5/600s) is used. If the policy is intended to be 10/600s and the DB row gets deleted, the route silently reverts to 5/600s instead of failing loudly. This could mask a DB integrity issue or a configuration loss.

**Reproduction:** (1) Delete the rate_limits row for newsroom_ingest, (2) call ingest, (3) observe that the fallback max=5 is used silently.

**Suggested fix direction:** Log a warning when the DB policy is missing and fallback is used, or raise an error in production if the policy cannot be loaded.

**Confidence:** MEDIUM

## LOW

### F-8-2-08 — Pipeline runs detail endpoint sorts costs by created_at but does not preserve order-of-execution semantics

**File:line:** `web/src/app/api/admin/pipeline/runs/[id]/route.ts:128-130`

**Evidence:**
```typescript
steps: steps.sort(
  (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
),
```

**Impact:** If two steps are created within the same millisecond (unlikely but possible in high-concurrency scenarios), the sort order is undefined. The UI will display them in an unpredictable order. The cost and latency totals are still correct, but the step sequence will be misleading.

**Reproduction:** (1) Create a pipeline run with steps that have the same created_at timestamp (requires DB-level insertion), (2) fetch run detail and check step order.

**Suggested fix direction:** Add a secondary sort by step_name or step_index (if available) to break ties, or use a dedicated sort_order column.

**Confidence:** LOW

### F-8-2-09 — Move-item endpoint accepts audience parameter in body but does not validate against cluster's actual audience

**File:line:** `web/src/app/api/admin/newsroom/clusters/[id]/move-item/route.ts:101-103`

**Evidence:**
```typescript
if (audience !== 'adult' && audience !== 'kid') {
  return NextResponse.json({ error: "audience must be 'adult' or 'kid'" }, { status: 422 });
}
```

The audience is validated as a string, but the route does not verify that the audience matches the source cluster's actual audience. The RPC (reassign_cluster_items) enforces audience match, but the caller provides an audience parameter that could mismatch, leading to a 409 error from the RPC with a generic "Invalid request" message.

**Impact:** If a client passes the wrong audience for the item's actual cluster, the request fails with a confusing error. No silent failure, but poor UX (error message could be clearer).

**Reproduction:** (1) Move an item from an adult cluster, (2) pass audience='kid' in the request, (3) observe RPC error with code 22023 mapped to generic "Invalid request".

**Suggested fix direction:** Query the item or cluster to verify audience before calling the RPC, and return a more specific error message (e.g., "Item's cluster is adult; cannot move to kid context").

**Confidence:** LOW

---

**Summary:** 9 findings across 2 CRITICAL, 4 HIGH, 2 MEDIUM, 1 LOW. Key themes: (1) Finally block race conditions on discovery_items state, (2) Missing prompt preset versioning/rollback, (3) Cost cap caching inconsistency, (4) Sanitization invariant documentation gap, (5) Audit trail idempotency misalignment.
