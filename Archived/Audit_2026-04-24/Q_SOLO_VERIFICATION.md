# Q-SOLO Items Verification — 2026-04-24

Against commit SHA: ed4944ed40b865e6daf7fcea065630988a00e9b8

## Q-SOLO-02: Admin role grant/revoke — missing `requireAdminOutranks`?

**Verdict:** STALE (check present in both POST and DELETE)

**File:Line Evidence:**
- `/web/src/app/api/admin/users/[id]/roles/route.js:58` (POST handler): `const rankErr = await requireAdminOutranks(params.id, user.id);`
- `/web/src/app/api/admin/users/[id]/roles/route.js:130` (DELETE handler): `const rankErr = await requireAdminOutranks(params.id, user.id);`

**Justification:** Both POST (grant) and DELETE (revoke) handlers call `requireAdminOutranks` before any role mutation (after permission + RPC checks). Guards are identical and correctly placed.

---

## Q-SOLO-03: Permission-set DELETE cascade — missing outranks re-check on affected users?

**Verdict:** CONFIRMED (no per-role/user re-validation)

**File:Line Evidence:**
- `/web/src/app/api/admin/permission-sets/[id]/route.js:74-133` (DELETE handler): Only checks `requirePermission('admin.permissions.set.edit')` at line 77; NO `requireAdminOutranks` call before deletion at line 118.
- No iteration over affected role_permission_sets or user_permission_sets entries.

**Justification:** Handler deletes permission_set without validating that actor outranks all roles or users who were granted that set. Cascade cleanup via ON DELETE CASCADE happens transparently without re-validation.

---

## Q-SOLO-04: Cluster merge/split RPC idempotency — retry safety?

**Verdict:** STALE (idempotency guards present)

**File:Line Evidence:**
- `/schema/126_newsroom_redesign_clusters_presets_mutations.sql:167-169` (merge_clusters): Source/target equality check + FOR UPDATE locks: `IF p_source_id = p_target_id THEN RAISE EXCEPTION 'source and target must differ'...` + `FOR UPDATE` at lines 171-172.
- `/schema/126_newsroom_redesign_clusters_presets_mutations.sql:244-246` (split_cluster): Item array validation: `IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL OR array_length(p_item_ids, 1) = 0 THEN RAISE EXCEPTION 'item_ids must be non-empty'...`

**Justification:** merge_clusters validates source != target before proceeding; both use FOR UPDATE to serialize access. split_cluster validates non-empty items. No guard makes double-application idempotent, but precondition checks + locks prevent retry-induced duplication at schema level.

---

## Q-SOLO-06: Generate finally-block UPDATE — silent mismatch if status guard fails?

**Verdict:** CONFIRMED (error silently swallowed, 200 OK returned)

**File:Line Evidence:**
- `/web/src/app/api/admin/pipeline/generate/route.ts:1657-1682` (finally block UPDATE): `.eq('id', runId).eq('status', 'running')` guard with catch-only-logs at lines 1683-1685: `catch (updateErr) { console.error('[newsroom.generate.finally.run-update]', updateErr); }`
- `/web/src/app/api/admin/pipeline/generate/route.ts:1706` (response determination): Uses `finalStatus` variable set at 1584/1586 (from main try/catch), NOT from actual DB write result.
- `/web/src/app/api/admin/pipeline/generate/route.ts:1718-1726` (success response): Returns 200 OK with `ok:true` if `finalStatus === 'completed'`, regardless of whether DB UPDATE applied.

**Justification:** If pipeline cancelled between main logic completion (1584 = finalStatus='completed') and finally block execution, the status guard `.eq('status','running')` fails silently. Client receives 200 OK + completed status while DB shows cancelled/failed. No error propagated to caller.

---

## Q-SOLO-07: Retry route — SELECT error_type column without fallback?

**Verdict:** STALE (column read directly with documented dependency)

**File:Line Evidence:**
- `/web/src/app/api/admin/pipeline/runs/[id]/retry/route.ts:48-69` (SELECT statement): Includes `'error_type'` at line 66 in the select array. Line 48-49 comment states: "Load the failed run. error_type is read from the dedicated column (migration 120 applied; the one-cycle output_summary stash was dropped)."

**Justification:** Code reads `error_type` column directly; no fallback to output_summary or other source. Requires migration 120 to be deployed. Code behavior is correct under that assumption (no try-catch or fallback). Blocking risk is infra-side (whether migration 120 is applied), not code logic.

