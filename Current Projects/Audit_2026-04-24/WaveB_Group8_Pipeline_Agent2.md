---
wave: B
group: 8 Admin Pipeline/Newsroom/F7
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Admin Pipeline/Newsroom/F7, Wave B, Agent 2

## CRITICAL

### F-B8-2-01 — Ingest upsert lacks within-batch deduplication guard
**File:line:** `web/src/app/api/newsroom/ingest/run/route.ts:294-297`
**Evidence:**
```typescript
.upsert(batch, {
  onConflict: 'raw_url',
  ignoreDuplicates: true,
})
```
**Impact:** If the same RSS feed contains multiple articles with identical `raw_url` within a single batch (unlikely but possible if RSS feeds have duplicate links), `ignoreDuplicates: true` will silently drop the later entries without error. The caller has no visibility into which rows were actually persisted vs. silently ignored. Additionally, if ingest run retries after partial failure, the upsert logic may not be fully idempotent—already-clustered items from the first attempt could be re-processed on retry if they fall within the 6-hour clustering window.

**Reproduction:** 
1. Craft an RSS feed with 2+ entries sharing the same `<link>` value
2. Run ingest; observe output says "inserted: N" but doesn't account for within-batch dupes
3. Query `discovery_items` and confirm only one of the duplicate URLs appears (not deterministic which wins)

**Suggested fix direction:** Return the `.select('*')` result and validate inserted count matches expected; or pre-deduplicate within batches client-side before upsert.

**Confidence:** HIGH

### F-B8-2-02 — Clustering fail-open on discovery_items update race
**File:line:** `web/src/app/api/newsroom/ingest/run/route.ts:404-410`
**Evidence:**
```typescript
const updateRes = await service
  .from('discovery_items')
  .update({ state: 'ignored', updated_at: new Date().toISOString() })
  .in('id', itemIds);
if (updateRes.error) {
  throw new Error(`mark-ignored failed: ${updateRes.error.message}`);
}
```
**Impact:** If the ingest run is in-flight and a concurrent admin manually moves one of the items being clustered via the UI's `/move-item` endpoint, the cluster's attempt to `.update({ state: 'ignored' })` may silently affect 0 rows (already moved). The code doesn't check `updateRes.data.length` or the row count returned. The per-cluster try-catch will absorb this silently and log it as a cluster error, but the item has potentially escaped clustering logic mid-stream.

**Reproduction:**
1. Start a long-running ingest (many feeds)
2. While clustering is in-flight, admin moves one of the pending items via cluster UI
3. The cluster batch that contained that item will update 0 rows; cluster error logged but no fatal abort
4. Check audit_log: the item appears to have been moved, but its cluster_id remains linked to the old cluster

**Suggested fix direction:** Check `updateRes.data?.length` and throw if it's 0 (or below expected count); or use an advisory lock on discovery_items during clustering.

**Confidence:** MEDIUM — requires concurrent mutation race; low production frequency but possible under load.

## HIGH

### F-B8-2-03 — Pipeline run update missing status guard in ingest cleanup
**File:line:** `web/src/app/api/newsroom/ingest/run/route.ts:492-504`
**Evidence:**
```typescript
const { error: updateErr } = await service
  .from('pipeline_runs')
  .update({
    status: 'completed',
    completed_at: completedAt.toISOString(),
    ...
  })
  .eq('id', runId);
```
**Impact:** Unlike the generate route's finally block (which uses `.eq('status', 'running')` to guard the terminal update), the ingest endpoint does not re-check that the run is still in `'running'` state before marking it `'completed'`. If an external process (cron, admin cancel future endpoint) marks the run failed between the main body completing and the finally block running, this update will unconditionally overwrite it to `'completed'`, losing the original failure state and timestamps. The audit trail would show a phantom completion instead of the actual failure.

**Reproduction:**
1. Trigger a long ingest run
2. In the database, manually `UPDATE pipeline_runs SET status='failed', error_message='external abort'` while ingest is in clustering phase
3. Ingest completes and hits the final update; status reverts to 'completed'
4. Audit log shows `completed` status, original failure reason lost

**Suggested fix direction:** Add `.eq('status', 'running')` guard to the ingest run update (line 504), matching the generate route pattern.

**Confidence:** HIGH

### F-B8-2-04 — Prompt preset body version tracking absent
**File:line:** `web/src/app/api/admin/prompt-presets/route.ts:120-168`; `web/src/app/api/admin/prompt-presets/[id]/route.ts:71-214`
**Evidence:**
Neither the POST (create) nor PATCH (update) handlers increment a version field or store a snapshot of previous body values. The `updated_at` timestamp changes, but there is no `body_version` or `ai_prompt_presets_history` table reference.
```typescript
// POST route L120-129 inserts without versioning
const insertPayload = {
  name,
  description,
  body,
  audience,
  ...
};
```
**Impact:** If an operator updates a preset body and an article was already generated with the old body, there is no way to audit which version was used or roll back a problematic edit. The admin UI has "Archive" (soft-delete) but no version history or "restore to previous body" functionality. This breaks the audit chain for generated articles—if plagiarism or other issues arise post-generation, the operator cannot determine if the root cause was a prompt change.

**Reproduction:**
1. Create preset "Skeptical fact-check" with body "Be very skeptical..."
2. Generate 10 articles using this preset (prompt_fingerprint recorded)
3. Admin edits body to "Be somewhat skeptical..." 
4. Later, articles show plagiarism issues
5. Operator cannot see the original body or restore it without re-editing manually

**Suggested fix direction:** Add `body_version` INT (auto-increment per update) and optionally a `ai_prompt_presets_history` audit table capturing old_body, old_audience, etc. on each PATCH.

**Confidence:** MEDIUM — impacts audit trail completeness, not live functionality. No hard error.

## MEDIUM

### F-B8-2-05 — Cost-tracker soft-alert emits to console.warn, not structured logging
**File:line:** `web/src/lib/pipeline/cost-tracker.ts:194-202`
**Evidence:**
```typescript
if (pct >= caps.soft_alert_pct) {
  console.warn('[cost-tracker:soft-alert] daily spend at', {
    today_usd,
    projected_usd: projected,
    cap_usd: caps.daily_usd,
    pct: Math.round(pct),
    soft_alert_pct: caps.soft_alert_pct,
  });
}
```
**Impact:** The soft cost alert is logged via `console.warn` (unstructured) instead of `pipelineLog` (which is used elsewhere in the pipeline and presumably integrates with observability). This means the cost warning may not reach alerting systems or dashboards, making it hard for ops to detect spend trending toward the cap. The message is developer-facing, not ops-facing.

**Reproduction:**
1. Set `pipeline.daily_cost_soft_alert_pct` to 80%
2. Set `pipeline.daily_cost_usd_cap` to $100
3. Spend $81 on a pipeline run
4. Check Sentry/observability dashboard for the alert—it won't be there (only in Node logs)

**Suggested fix direction:** Replace `console.warn` with `pipelineLog.warn()` call, matching the pattern in plagiarism-check.ts line 117.

**Confidence:** MEDIUM — soft alert is non-blocking; the hard caps still work. But ops visibility gap.

### F-B8-2-06 — Persist article missing empty-body validation before RPC call
**File:line:** `web/src/lib/pipeline/persist-article.ts:132-159`
**Evidence:**
```typescript
export async function persistGeneratedArticle(
  service: SupabaseClient<Database>,
  payload: PersistArticlePayload
): Promise<PersistArticleResult> {
  const { data, error } = await service.rpc('persist_generated_article', {
    p_payload: payload as unknown as Json,
  });
  // ...
}
```
The function comment (line 74-75) states "body_html must be pre-sanitized by the caller (F7 Phase 3 invariant). The RPC rejects empty bodies but does NOT sanitize." However, there is no client-side validation that `body_html` is non-empty before the RPC call. If the caller passes an empty string, the RPC will fail, but the error will only be surfaced after a network round-trip.

**Impact:** Defensive validation should reject empty body_html at the TypeScript layer to fail fast. Currently, a bug in the upstream caller (call-model, render-body, etc.) that produces an empty body will only be caught after the RPC boundary, adding latency and confusion to the error trace.

**Reproduction:**
1. Patch generate route to unconditionally set `body_html: ''` before persist call
2. Generate article; observe RPC error "body_html cannot be empty"
3. Check logs; no client-side validation logged before RPC invocation

**Suggested fix direction:** Add a guard in persistGeneratedArticle: `if (!payload.body_html?.trim()) throw new PersistArticleError('body_html must be non-empty')`.

**Confidence:** MEDIUM — low-impact (RPC catches it); but defensive coding practice.

## LOW

### F-B8-2-07 — Split cluster item deduplication logic absent
**File:line:** `web/src/app/api/admin/newsroom/clusters/[id]/split/route.ts:84-90`
**Evidence:**
```typescript
const itemIds: string[] = [];
for (const raw of body.item_ids) {
  if (typeof raw !== 'string' || !UUID_RE.test(raw)) {
    return NextResponse.json({ error: 'item_ids must all be uuids' }, { status: 422 });
  }
  itemIds.push(raw);
}
```
**Impact:** If the request body includes duplicate item IDs (e.g., `item_ids: ['abc...', 'abc...']`), the route will pass both through to the RPC without deduplicating. The RPC likely handles it idempotently, but the behavior is undefined from the API contract perspective. A client could accidentally move the same item twice by mistake.

**Reproduction:**
1. POST `/api/admin/newsroom/clusters/{id}/split` with `{ item_ids: ['aaa', 'aaa'] }`
2. Observe RPC response; likely succeeds but behavior undefined

**Suggested fix direction:** Add a Set-based dedup pass: `const unique = [...new Set(itemIds)]` before RPC call.

**Confidence:** LOW — RPC likely handles it; minor UX gap.

### F-B8-2-08 — Plagiarism-check silently degrades on LLM error
**File:line:** `web/src/lib/pipeline/plagiarism-check.ts:114-129`
**Evidence:**
```typescript
} catch (err: unknown) {
  if (err instanceof CostCapExceededError) throw err;
  if (err instanceof AbortedError) throw err;
  pipelineLog.warn('newsroom.generate.plagiarism_check', {...});
  return {
    body: params.body,
    cost_usd: 0,
    latency_ms: Date.now() - start,
    rewritten: false,
  };
}
```
**Impact:** Any error other than CostCapExceededError or AbortedError is silently caught, logged as a warn, and the function returns `rewritten: false`. This means if the LLM rewrite call fails due to a provider API error (e.g., rate limit, overload), the article will proceed to persist with the potentially plagiarized body without escalation. The warning is in logs, but the orchestrator (generate route) has no signal that plagiarism-check failed—it just proceeds.

**Reproduction:**
1. Mock callModel to throw `ProviderAPIError('rate limit')` 
2. Generate article; observe plagiarism_check warning in logs
3. Article persists anyway; `rewritten: false` is returned

**Suggested fix direction:** Return `rewritten: false` with an additional `error` field in the response, and have the generate route escalate (halt) if plagiarism-check errored (vs. just returning false).

**Confidence:** LOW — coverage of edge case (provider flakiness). Silent degradation is by design for robustness, but ops visibility could be better.

---

## UNSURE

### Item: Prompt preset version semantics unclear
The scope requirement mentions "prompt preset version + rollback" but no `ai_prompt_presets_version_id` or similar field appears in the schema or codebase. It's possible this is planned (migration not yet applied) or the requirement refers to audit versioning (covered under F-B8-2-04). Recommend clarification: does version tracking mean transaction-level history, or is it covered by the existing soft-delete + archive pattern?

