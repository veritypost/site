---
round: 2
layer: 1
lens: L10-pipeline-operator
anchor_sha: 10b69cb99552fd22f7cebfcb19d1bbc32ae177fe
---

# Lens Audit — L10: Pipeline Operator

## Summary

Audited the pipeline operator workflow across add-source → discover → cluster → review → generate (adult/kid) → plagiarism check → publish → observability → cancel → retry. Found 4 actionable findings: a discovery-state race condition during concurrent cancel, cost-cap timing sensitivity on settings changes, discovery items stuck in generating state on source-url-override failures, and poor UX feedback when retrying cost-cap-breached runs. Cost-cap policy itself remains defensible despite caching TTL (fail-closed + per-call enforcement). Prompt-preset versioning absent (Round 1 C24) prevents reproducibility post-edit but doesn't block generation. Idempotent audit logging matches existing patterns.

## Findings

### [Severity: HIGH]

#### L2-L10-01 — Discovery items state race between cancel and generate finally

**File:line:** `web/src/app/api/admin/pipeline/generate/route.ts:1617-1624`

**What's wrong:** The generate route's finally block updates `discovery_items.state` without a status guard:
```typescript
await service
  .from(discoveryTable)
  .update({
    state: nextState,
    ...(articleId ? { article_id: articleId } : {}),
    updated_at: new Date().toISOString(),
  })
  .in('id', itemIds);
```

The cancel route (line 135 of `web/src/app/api/admin/pipeline/runs/[id]/cancel/route.ts`) correctly includes `.eq('state', 'generating')` when resetting items:
```typescript
.eq('state', 'generating')
```

If cancel runs concurrently and resets items to `'clustered'`, the generate finally block can execute afterward and overwrite state to `'published'` or `'ignored'`, clobbering the cancel's state change.

**Lens applied:** Multi-operator collision under concurrent operations. The cancel verb explicitly enumerates state='generating' to avoid stomping parallel finally blocks; generate's finally block violates the same symmetry.

**New vs Round 1:** EXTENDS_MASTER_ITEM_H18 — H18 added state guard to pipeline_runs finally (line 1682: `.eq('status', 'running')`); discovery_items finally remains unguarded.

**Evidence:**
Lines 754-758 mark items state='generating' on entry; lines 1617-1624 reset state without checking current state on exit. Cancel route (line 135) has guard; generate finally does not.

**Suggested disposition:** AUTONOMOUS-FIXABLE — add `.eq('state', 'generating')` to the discovery_items UPDATE at line 1617.

---

### [Severity: HIGH]

#### L2-L10-02 — Discovery items stuck in generating state on source-url-override failure

**File:line:** `web/src/app/api/admin/pipeline/generate/route.ts:754, 1611-1627`

**What's wrong:** When `sourceUrlsOverridden=true` (kid runs with explicit source_urls, or kid runs deriving from cluster discovery_items), the finally block skips discovery state reset:
```typescript
if (!sourceUrlsOverridden) {
  // ... state update ...
} 
// if sourceUrlsOverridden, NO state reset happens
```

However, discovery items that fed the override URLs may have been in 'generating' state in the adult table during an earlier run. If the kid generation fails after the source-url derivation (lines 640-668), those items stay in 'generating' state, blocking future adult generations on the same cluster.

The kid pipeline's use of source_urls override creates a logical inconsistency: the kid run doesn't touch discovery_items state transitions, but the adult pipeline (which owns discovery_items) left them in 'generating' when the kid run started.

**Lens applied:** Operator workflow integrity — adult and kid pipelines share discovery_items but only adult pipeline manages state transitions. On kid-pipeline failure, adult items orphaned in 'generating'.

**New vs Round 1:** NEW — not covered in MASTER_FIX_LIST.

**Evidence:**
Line 676: `const discoveryTable = 'discovery_items' as const;` — both adult and kid pipelines use the same table.
Lines 640-668: kid run may derive URLs from discovery_items without updating their state.
Lines 754: `if (!sourceUrlsOverridden)` — state marked 'generating' only on adult path.
Lines 1611-1627: finally skips all state resets if sourceUrlsOverridden.

**Suggested disposition:** OWNER-INPUT — requires clarification on intended discovery_items lifecycle for kid-audience runs. If kid should be read-only against discovery_items, confirm and document. If kid should reset state on failure, add state reset in finally (guarded by `sourceUrlsOverridden` + failure condition).

---

### [Severity: MEDIUM]

#### L2-L10-03 — Cost cap pre-flight check doesn't reserve margin for generation run

**File:line:** `web/src/app/api/admin/pipeline/generate/route.ts:500-541`

**What's wrong:** Pre-flight cost check at lines 519-530 allows generation to proceed if `today >= cap`:
```typescript
if (Number.isFinite(cap) && today >= cap) {
  // ... return 402 ...
  return NextResponse.json(
    { error: 'Daily cost cap reached', today_usd: today, cap_usd: cap },
    { status: 402 }
  );
}
```

This gate only prevents generation if already *at or above* cap. It doesn't reserve a buffer for the entire run's cost.

Scenario: daily cap=$10, today_usd=$9.99, estimated_run_cost=$0.50. Pre-flight passes. First callModel (audience_safety_check, line 822) succeeds for $0.01. Cumulative=$10.00. Second callModel (headline at line 1024) hits cost cap mid-generation, fails, and orphans pipeline state with partial cost written.

Contrast: per-run cap enforcement (line 169-176) correctly checks `estimated_cost > caps.per_run_usd` *before* attempting the call.

**Lens applied:** Cost-cap policy enforcement consistency. Daily cap should reserve forward margin like per-run cap does, or document the accept-risk of mid-run failures when today is near threshold.

**New vs Round 1:** EXTENDS_MASTER_ITEM_H17 — H17 flags 60s TTL stale; this is the runtime consequence of landing near threshold.

**Evidence:**
Lines 517-519: `const cap = Number(capData?.value ?? 10);` (reads fresh or cached).
Line 519: `if (Number.isFinite(cap) && today >= cap)` — no margin reserved.
Compare line 169-176: per-run cap uses `>` (greater-than, not >=), correctly excluding estimated cost from cap itself.

**Suggested disposition:** AUTONOMOUS-FIXABLE — either (a) change line 519 condition to `today + estimated_generation_cost > cap` (requires estimating total run cost upfront, complex), or (b) drop pre-flight daily-cap check and rely solely on per-call checkCostCap (simpler, fail-closed on each call). Option (b) aligns with per-run behavior.

---

### [Severity: MEDIUM]

#### L2-L10-04 — Retry allows cost-cap-breached run to retry immediately, may fail identically

**File:line:** `web/src/app/api/admin/pipeline/runs/[id]/retry/route.ts:127-140`

**What's wrong:** Retry route reads `error_type` from the failed run (line 127) but doesn't gate retry on error type. If the run failed with `error_type='cost_cap_exceeded'`, the admin can re-click "Retry," which re-invokes generate, which runs pre-flight cost check again and fails with 402 immediately:

```typescript
const originalErrorType = run.error_type ?? null;
// Line 130: if (response.ok && newRunId) { recordAdminAction(...) }
// No check for originalErrorType='cost_cap_exceeded' here
```

This is not a *policy bypass* (generate's cost check still fires), but it's poor UX feedback. The admin expects a different outcome and gets the same error.

Additionally, if cost cap was temporarily raised between the original failure and retry, the check would pass — but this is correct behavior and not problematic.

**Lens applied:** Operator experience — retrying a cost-cap failure should either (a) warn the operator that cost cap is still active, or (b) require admin to lower cost cap before retry is allowed. Current flow suggests "maybe it'll work now" without explanation.

**New vs Round 1:** NEW — not covered; relates to H17 but is UX-level.

**Evidence:**
Lines 127-140: reads error_type but takes no action based on it.
Line 149: passes response.status through (will be 402 again if cap is unchanged).

**Suggested disposition:** POLISH — add client-side UI logic to show alert if retrying a cost_cap_exceeded run: "Cost cap is still active. Lower it to retry, or wait for tomorrow's cap reset." Alternatively, disable Retry button when error_type='cost_cap_exceeded'. No code change required; UI/UX decision.

---

### [Severity: LOW]

#### L2-L10-05 — Cost-cap cache stale during admin settings change mid-generation

**File:line:** `web/src/lib/pipeline/cost-tracker.ts:46; web/src/app/api/admin/pipeline/generate/route.ts:500-541`

**What's wrong:** Cost tracker caches cap values for 60 seconds (line 46 of cost-tracker.ts). If admin lowers `pipeline.daily_cost_usd_cap` *during* a generation run (after pre-flight but before LLM calls), subsequent callModel invocations use the stale cached cap for 60 seconds before re-fetching.

Scenario:
1. T=0s: admin sets daily_cost_usd_cap=$5 via settings.
2. T=30s: operator triggers generate (pre-flight reads fresh cap, $5 OK, caches until T=90s).
3. T=45s: admin lowers daily_cost_usd_cap to $1 (live in DB).
4. T=46s: first callModel checks cost cap via checkCostCap() → reads cached $5 cap (stale).
5. T=50s: Cost tracker cache expires at T=90s.

**Lens applied:** Admin-time operational safety. Cost cap is a production control; stale enforcement window violates fail-closed principle when operator is trying to *lower* cap mid-run.

**New vs Round 1:** EXTENDS_MASTER_ITEM_H17 — H17 flags 60s TTL as too long; this audit confirms the timing exposure.

**Evidence:**
cost-tracker.ts line 46: `const CAPS_TTL_MS = 60_000;`
cost-tracker.ts lines 49-96: getCaps() caches; TTL checked at line 51.
call-model.ts line 352: checkCostCap(estimated) is called per-step; each call can see stale cap.

**Suggested disposition:** AUTONOMOUS-FIXABLE — reduce CAPS_TTL_MS to 10_000 (10 seconds) or add Realtime subscription for settings changes. Conservative choice: lower TTL to 10s. This is flagged in Round 1 H17; execute fix there.

---

## OUTSIDE MY LENS

- **Prompt-preset versioning (Round 1 C24):** Audit confirms the reproducibility impact but versioning/history design is captured in C24. No new evidence.
- **Cluster unlock audit logging (Round 1 M7 variant):** Found same idempotent logging pattern; consistent with existing codebase style; documented in M7.
- **Prompt-override fetchPromptOverrides snapshotting:** Correctly fetches once per run (line 781 of generate/route.ts); if operator edits presets during generation, changes not reflected — correct behavior. Versioning (C24) needed for audit trail.

