---
group: 8 Admin Pipeline/Newsroom/F7
reconciler: 1/1
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
phase: 4
---

# Reconciliation — Group 8 (Admin Pipeline/Newsroom/F7)

## AGREED findings (≥2 agents, both waves ideally)

### R-8-AGR-01 — Prompt preset versioning and rollback completely absent
**Severity:** CRITICAL  
**File:line:** `web/src/app/api/admin/prompt-presets/[id]/route.ts:196-211` (PATCH handler), `schema/126_newsroom_redesign_clusters_presets_mutations.sql:38–56` (schema)  
**Surfaced by:** WaveA Agent2, WaveA Agent3, WaveB Agent1, WaveB Agent2 (4/6)  
**Consensus description:**  
The `ai_prompt_presets` table has no version tracking column or history table. When an operator updates a preset body, the old body is lost (only audit_log captures a snapshot of old/new at point of audit recording, but the RPC does not snapshot the full body or version number). There is no API to list versions, no rollback button, no way to retrieve the exact prompt text used for a historical article. This breaks the audit chain: if an article is generated with preset "Fact-Check", then the preset body is edited, there is no record of which version the article actually used.

The ai_prompt_presets schema (migration 126) lacks `version INT` or `ai_prompt_presets_versions` table. The PATCH/DELETE handlers call `recordAdminAction()` but do not increment a version or store a body snapshot in a dedicated history table.

**Suggested disposition:** OWNER-ACTION  
*Requires schema design (version column or separate history table) and POST/PATCH route updates to snapshot on mutation.*

---

### R-8-AGR-02 — Cost cap cache (CAPS_TTL_MS = 60s) creates window where policy changes are not enforced real-time
**Severity:** HIGH  
**File:line:** `web/src/lib/pipeline/cost-tracker.ts:46–95` (cache logic)  
**Surfaced by:** WaveA Agent3, WaveB Agent1, WaveB Agent3 (3/6)  
**Consensus description:**  
The cost-tracker caches caps (daily_cost_usd_cap, per_run_usd_cap) for 60 seconds. If an admin updates the daily cap setting in the settings table, the change does not propagate to in-memory cost checks until the cache expires. During a cost spike emergency, this creates a 60-second window where an admin lowers the cap but running/new generations still use the old (higher) cap. Additionally, the generate route reads cost settings twice independently (once in cost-check pre-flight, once in call-model) with no coordination, allowing inconsistency if the cap is changed between reads.

**Suggested disposition:** OWNER-ACTION  
*Requires either: (a) reduce TTL to 10–30s, (b) add cache invalidation signal (Supabase Realtime subscription or webhook), or (c) make TTL tunable via settings.*

---

### R-8-AGR-03 — Discovery items state reset in generate finally block races with cancel and has no guard
**Severity:** HIGH  
**File:line:** `web/src/app/api/admin/pipeline/generate/route.ts:1617-1624` (discovery update in finally), vs. cancel route `web/src/app/api/admin/pipeline/runs/[id]/cancel/route.ts:131-135` (unconditional state reset)  
**Surfaced by:** WaveA Agent2, WaveB Agent3 (2/6)  
**Consensus description:**  
The generate route's finally block updates `discovery_items.state` WITHOUT a status guard (e.g., no `.eq('status', 'running')` check). Meanwhile, the cancel route also updates discovery state unconditionally. If two requests race (cancel + generate finally), or if cancel completes before generate finally executes, the discovery_items can land in the wrong state:
- Generate finally attempts to reset to 'published'/'clustered'/'ignored'
- Cancel has already updated them to 'clustered'
- Both updates are unguarded, resulting in asymmetric state between discovery_items and pipeline_runs.

The generate route does guard the pipeline_runs update (line 1682: `.eq('status', 'running')`), but the discovery_items update earlier does not. The cancel route updates discovery unconditionally without checking the run's current status.

**Suggested disposition:** AUTONOMOUS-FIXABLE  
*Add `.eq('status', 'running')` guard to discovery_items update at line 1617 in generate route; optionally add same guard to cancel route line 131 to ensure idempotency.*

---

### R-8-AGR-04 — Plagiarism check silently falls back to original body on LLM error, with zero cost
**Severity:** MEDIUM  
**File:line:** `web/src/lib/pipeline/plagiarism-check.ts:114-129` (error handler)  
**Surfaced by:** WaveA Agent3, WaveB Agent2, WaveB Agent3 (3/6)  
**Consensus description:**  
When the plagiarism rewrite LLM call fails (provider timeout, rate limit, etc.), the function catches the error (other than CostCapExceededError and AbortedError), logs a warning, and returns the original body with `cost_usd: 0`. The article proceeds to persist with the original (potentially plagiarized) body, and the cost ledger is underreported (cost of the failed attempt is not charged). The pipeline run shows lower total_cost_usd than actual, skewing spend calculations.

Operators have no explicit signal that plagiarism check failed—the warning is in logs, but the generate route treats `rewritten: false` as normal completion. If plagiarism check is a critical gate, this silent degradation violates fail-closed semantics.

**Suggested disposition:** OWNER-ACTION  
*Decide: (a) fail the entire generation on plagiarism-check error (fail-closed), (b) estimate cost and charge it anyway, or (c) add explicit error signal to output_summary so UI/operators know the check failed.*

---

### R-8-AGR-05 — Ingest endpoint upsert silently drops duplicates without visibility
**Severity:** MEDIUM  
**File:line:** `web/src/app/api/newsroom/ingest/run/route.ts:288–306` (upsert with ignoreDuplicates)  
**Surfaced by:** WaveA Agent3, WaveB Agent2 (2/6)  
**Consensus description:**  
The ingest endpoint uses `upsert(..., { onConflict: 'raw_url', ignoreDuplicates: true })` to insert discovery_items in 500-item batches. When duplicates are encountered (same raw_url), they are silently dropped. The returned `insData.length` reflects only new inserts, not updates or duplicates. Operators receive no telemetry on whether rows were upserted vs. inserted, making it impossible to distinguish growth from re-processing.

This is correct idempotent behavior (duplicates silently skipped), but the output_summary lacks separate `inserted_count` vs. `upserted_count` fields to signal what happened.

**Suggested disposition:** OWNER-ACTION  
*Add explicit upserted_count and inserted_count to output_summary; or track duplicates separately and emit them in the response.*

---

### R-8-AGR-06 — Archive operation is logged unconditionally even though RPC is idempotent
**Severity:** MEDIUM  
**File:line:** `web/src/app/api/admin/newsroom/clusters/[id]/archive/route.ts:105-114` (audit recording)  
**Surfaced by:** WaveA Agent2, WaveB Agent1 (2/6)  
**Consensus description:**  
The cluster archive RPC is idempotent (re-archiving keeps the original archived_at), but the route records the audit action unconditionally. If an admin accidentally calls archive twice, two `cluster.archive` entries appear in admin_audit_log, even though the RPC only mutated the cluster once. This violates audit-trail idempotency: the log should reflect actual mutations, not requests.

**Suggested disposition:** AUTONOMOUS-FIXABLE  
*Query the cluster's archived_at BEFORE calling the RPC; only record audit if archived_at was NULL (i.e., this is the first archive). Or check the audit log post-RPC and skip recording if the previous entry is identical and recent.*

---

## UNIQUE-A findings (Wave A only, needs tiebreaker)

### R-8-UA-01 — Cluster mutation (merge/split) lacks duplicate-operation idempotency guards
**Severity:** MEDIUM  
**File:line:** `web/src/app/api/admin/newsroom/clusters/[id]/merge/route.ts:76–108`, `web/src/app/api/admin/newsroom/clusters/[id]/split/route.ts:129–160`  
**Surfaced by:** WaveA Agent3 only  
**Description:**  
The merge and split RPC calls (`merge_clusters`, `split_clusters`) are made without prior state checks. If a network retry causes the same merge to be replayed, the RPC executes again. While the RPC may be internally idempotent (second call finds no items to move), the audit trail records duplicate actions. The code has no explicit guard (e.g., IF source_cluster.archived_at IS NOT NULL RAISE).

**Tiebreaker question:** Are the merge/split RPCs documented as idempotent-by-design in the migration that defines them? If so, the behavior is correct (audit duplication is acceptable cost of retry safety). If not, idempotency guards are needed.

---

### R-8-UA-02 — Cost aggregation in run detail endpoint rounds intermediate values, losing precision
**Severity:** MEDIUM  
**File:line:** `web/src/app/api/admin/pipeline/runs/[id]/route.ts:104–105` (parseFloat + toFixed)  
**Surfaced by:** WaveB Agent1 only  
**Description:**  
The run detail endpoint accumulates costs by parsing each `pipeline_costs.cost_usd` as a float (if string), summing in JavaScript, then rounding the final total via `.toFixed(6)`. With 20+ steps, floating-point rounding errors compound, losing precision. Runs with many steps show incorrect total cost.

**Tiebreaker question:** Is the cost_usd field always stored as numeric in pipeline_costs, or is it sometimes a string (Supabase JSON serialization quirk)? If numeric, can the aggregation be moved to the database (SQL SUM aggregate)?

---

### R-8-UA-03 — Cost-tracker fail-closed sentinel (-1) is swallowed in error messaging
**Severity:** MEDIUM  
**File:line:** `web/src/lib/pipeline/cost-tracker.ts:145-166`  
**Surfaced by:** WaveB Agent3 only  
**Description:**  
When getCaps() or getTodayCumulativeUsd() fails (DB/network timeout), the cost-tracker throws CostCapExceededError with `cap_usd=-1` sentinel and message "cap check unavailable; failing closed". The -1 sentinel is intended to signal "infrastructure failure, not actual cap breach", but the error message does not expose it, and the generate route catches all CostCapExceededError instances the same way. Operators cannot distinguish "daily spend genuinely hit $100 cap" from "Supabase RPC timed out, blocking generation as safety fallback".

**Tiebreaker question:** Is the -1 sentinel visible to admin UI or observability dashboards, or is it only checked programmatically? Should the error message include diagnostic details (original RPC error)?

---

## UNIQUE-B findings (Wave B only, needs tiebreaker)

### R-8-UB-01 — Retry route depends on migration 120 (error_type column) without pre-check
**Severity:** HIGH  
**File:line:** `web/src/app/api/admin/pipeline/runs/[id]/retry/route.ts:49–66`  
**Surfaced by:** WaveB Agent1 only  
**Description:**  
The retry route selects `error_type` column from pipeline_runs, which is defined in migration 120 (STAGED). If migration 120 is not deployed, the SELECT fails with a 500. No fallback to output_summary.final_error_type or schema check is in place. The route's comment acknowledges the dependency but does not guard against it.

**Tiebreaker question:** Has migration 120 been deployed to production? If yes, this is stale (no longer an issue). If no, code is at risk of runtime failure when merged.

---

### R-8-UB-02 — Ingest clustering skip discovery_items state update when sourceUrlsOverridden=true
**Severity:** MEDIUM  
**File:line:** `web/src/app/api/admin/pipeline/generate/route.ts:680-693, 1608-1628`  
**Surfaced by:** WaveB Agent3 only  
**Description:**  
When a kid generation is triggered with explicit source_urls (sourceUrlsOverridden=true), the generate route creates synthetic discovery items (with `id: 'override:<url>'`) and skips all discovery_items DB updates (no claim at start, no reset in finally). This is by design—synthetic items have no DB rows.

However, if a concurrent adult generation uses the same cluster's real discovery_items and completes successfully, those items are marked 'published'. If the kid generation fails after scraping (cost cap, error), the finally block skips the state reset due to sourceUrlsOverridden=true. Result: discovery items are 'published' even though the kid generation failed.

**Tiebreaker question:** Is this a genuine bug (discovery state is misleading) or expected behavior (kid runs are isolated from adult discovery state)? If isolation is intended, the behavior is correct; the documentation should clarify. If discovery state should reflect all active runs, kid/adult runs need coordinated state management.

---

### R-8-UB-03 — Generate finally block swallows UPDATE guard rejection error
**Severity:** HIGH  
**File:line:** `web/src/app/api/admin/pipeline/generate/route.ts:1657-1682`  
**Surfaced by:** WaveB Agent3 only  
**Description:**  
The finally block wraps the critical pipeline_runs UPDATE in a try-catch that swallows all errors (console.error only). If the `.eq('status', 'running')` guard rejects the update (because status is already 'failed' from cancel), the update silently fails but the route returns 200 OK with `finalStatus: 'completed'`. The client and UI believe the run succeeded, but the DB shows `status: 'failed'`. State mismatch.

**Tiebreaker question:** Should the finally block's UPDATE failure be surfaced as a non-200 status code (409 Conflict) or at least logged with structured observability? Or is silent failure acceptable to avoid breaking the response after all generation work is done?

---

### R-8-UB-04 — Prompt preset POST missing created_by assignment in insert payload
**Severity:** MEDIUM  
**File:line:** `web/src/app/api/admin/prompt-presets/route.ts:120-137`  
**Surfaced by:** WaveB Agent3 only  
**Description:**  
The POST endpoint correctly assigns `created_by: actor.id` in the insert payload and includes it in the response selection. However, if the `ai_prompt_presets` table has a `version` column (per audit scope), the insert does not initialize it. The preset is created with `version=NULL` or a DB default. The response also does not include `version` in the selected fields, so the client receives no version token.

**Tiebreaker question:** Does `ai_prompt_presets` have a `version` column in the schema? If yes, POST should initialize it to 1 and include it in response. If no, this is STALE (no version column exists to initialize).

---

## STALE / CONTRADICTED findings

### R-8-STALE-01 — Retry handler audit idempotency race
**Claimed by:** WaveA Agent3 (F-8-3-01)  
**Evidence:** WaveA Agent3 flagged that if generate response lacks `run_id` field, audit logging is skipped; the retry succeeds with `newRunId=null` but no audit proof.  
**Reconciler verdict:** NEEDS-TIEBREAKER  
*This is a valid edge case (malformed generate response), but it's unclear whether retry should log "audit success but newRunId missing" or if the current decouple-on-error is acceptable. The suggested fix (decouple newRunId extraction from audit logging) makes sense, but requires owner decision on audit scope.*

---

### R-8-STALE-02 — Persist article body_html sanitization invariant
**Claimed by:** WaveA Agent2  
**Evidence:** The `persistGeneratedArticle` function documents that body_html must be pre-sanitized but does not validate.  
**Reconciler verdict:** STALE (owner-decision already made)  
*This is documented as an invariant, implying the owner has decided sanitization is the caller's responsibility (renderBodyHtml). Adding defensive validation is a hardening, but is not a bug if the invariant is enforced upstream.*

---

### R-8-STALE-03 — Move-item endpoint audience validation
**Claimed by:** WaveA Agent2 (F-8-2-09)  
**Evidence:** Move-item accepts audience but does not pre-validate against cluster's actual audience; RPC enforces and returns 409.  
**Reconciler verdict:** STALE (acceptable UX gap)  
*The route validates audience is 'adult' or 'kid', and the RPC enforces audience match. The caller gets a 409 error. This is correct behavior; the suggested improvement (pre-check audience) is a UX enhancement, not a bug.*

---

## Summary counts
- **AGREED CRITICAL:** 1 (prompt preset versioning)
- **AGREED HIGH:** 2 (cost cache TTL, discovery state race)
- **AGREED MEDIUM:** 3 (plagiarism fallback, ingest dedup, archive idempotency)
- **UNIQUE-A:** 3 (merge/split idempotency, cost precision, cost-tracker sentinel)
- **UNIQUE-B:** 4 (retry migration dependency, sourceUrlsOverridden isolation, finally UPDATE catch, prompt POST version)
- **STALE:** 3 (retry audit race, sanitization invariant, audience validation)

**Total findings reconciled: 16** (6 AGREED + 7 UNIQUE + 3 STALE)

---

## Key themes

1. **Prompt preset versioning** is a cross-wave consensus (4 agents). Critical blocker for audit trail and rollback.
2. **Cost cap enforcement** has three inter-related issues: cache TTL (60s), settings read twice without coordination, and fail-closed sentinel hiding infrastructure faults.
3. **Discovery items state management** in generate finally block races with cancel and lacks proper guards.
4. **Plagiarism check resilience** silently degrades on LLM errors, returning zero cost and original body, skewing spend tracking and potentially leaving plagiarized content.
5. **Idempotency and audit trail** are recurring themes: merge/split mutations, archive double-logging, discovery state updates without guards.

