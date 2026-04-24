---
group: 6 Admin Users/Roles/Permissions
reconciler: 1/1
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
phase: 4
---

# Reconciliation — Admin Users/Roles/Permissions

## AGREED findings (≥2 agents, both waves ideally)

### R-6-AGR-01 — Missing audit logging on role grant/revoke (POST/DELETE /api/admin/users/[id]/roles)

**Severity:** CRITICAL

**File:line:** `web/src/app/api/admin/users/[id]/roles/route.js:74–95` (POST grant), `146–163` (DELETE revoke)

**Surfaced by:** WaveA Agent1, WaveA Agent2, WaveB Agent3 (3/6)

**Consensus description:** Both the POST handler (grant_role RPC) and DELETE handler (revoke_role RPC) execute role changes but do not call `recordAdminAction()` to audit the mutations. POST bumps `user_perms_version` but skips audit. DELETE has identical pattern. Comparison endpoints `/api/admin/users/[id]/role-set/route.js:97–102`, `/api/admin/users/[id]/ban/route.js:73–79`, and `/api/admin/users/[id]/plan/route.js` all correctly call `recordAdminAction()` post-mutation. Admin role escalations and demotions leave no audit trail in `admin_audit_log`.

**Suggested disposition:** AUTONOMOUS-FIXABLE

**Implementation:** Add `await recordAdminAction()` call before return in both handlers: POST (after line 91 bump) with action `'user_role.grant'`, DELETE (after line 150 bump) with action `'user_role.revoke'`. Match the targetTable/targetId/newValue pattern from sibling routes.

---

### R-6-AGR-02 — Audit log records BEFORE mutation completes (DestructiveActionConfirm + toggleRoleSet/togglePlanSet)

**Severity:** CRITICAL

**File:line:** `web/src/components/admin/DestructiveActionConfirm.tsx:65`, `web/src/app/admin/permissions/page.tsx:424`, `web/src/app/admin/permissions/page.tsx:456`

**Surfaced by:** WaveB Agent1, WaveB Agent2 (2/6)

**Consensus description:** Client-side mutations (especially DestructiveActionConfirm on permission/set deletion and toggleRoleSet/togglePlanSet on role wiring) call `supabase.rpc('record_admin_action', ...)` BEFORE executing the destructive action (onConfirm callback or fetch to API endpoint). If the subsequent mutation fails (network timeout, 403, 500, rate limit), the audit_log contains a false entry recording an action that never persisted to the database. This creates orphaned audit entries and makes the audit trail untrustworthy for forensics/compliance. Violates the invariant: audit log must only record mutations that actually completed.

**Suggested disposition:** OWNER-ACTION

**Implementation:** Move all client-side audit RPC calls to the END of the mutation chain (after server confirmation) or remove them entirely and rely on server-side `recordAdminAction` calls in API handlers (which already exist for most endpoints). This requires a product decision: should audit originate from client or server? Recommended: server-only, for atomicity guarantees.

---

### R-6-AGR-03 — Double audit logging on permission-set member add/remove and role/plan toggle

**Severity:** HIGH

**File:line:** `web/src/app/admin/permissions/page.tsx:395–421` (removePermFromSet client RPC), `web/src/app/api/admin/permission-sets/members/route.js:122–127` (DELETE audit), `web/src/app/admin/permissions/page.tsx:423–453` (toggleRoleSet client RPC), `web/src/app/api/admin/permission-sets/role-wiring/route.js:68–74` (POST audit)

**Surfaced by:** WaveA Agent3, WaveB Agent1, WaveB Agent2 (3/6)

**Consensus description:** UI handlers for permission-set member removal (`removePermFromSet`) and role/plan set toggling (`toggleRoleSet`, `togglePlanSet`) call `supabase.rpc('record_admin_action', ...)` from the client, then invoke the corresponding API endpoint, which ALSO calls `recordAdminAction()` server-side. Result: two audit_log entries for a single user action, with different action names (e.g., client logs `'permission_set.toggle_role'` while server logs `'permission_set.role.grant'`/`'permission_set.role.revoke'`). This violates audit clarity and makes log forensics noisy. Compare to `user-grants` endpoints (user-grants/route.js) which audit server-side only.

**Suggested disposition:** AUTONOMOUS-FIXABLE

**Implementation:** Remove the client-side `supabase.rpc('record_admin_action', ...)` calls from `removePermFromSet`, `toggleRoleSet`, and `togglePlanSet` functions in `permissions/page.tsx`. Rely on the API handlers' existing `recordAdminAction` calls. This consolidates audit to server-only (canonical).

---

### R-6-AGR-04 — RPC error messages leak internal schema/policy names to client

**Severity:** HIGH

**File:line:** `web/src/app/api/admin/users/[id]/roles/route.js:50, 122` (both POST and DELETE handlers in `caller_can_assign_role` error handling)

**Surfaced by:** WaveA Agent1, WaveB Agent3 (2/6)

**Consensus description:** When `caller_can_assign_role` RPC fails in POST/DELETE `/api/admin/users/[id]/roles`, the handlers return `{ error: canErr.message }` directly to the client (line 50: `return NextResponse.json({ error: canErr.message }, { status: 500 })`). This exposes raw Supabase/PostgreSQL error messages (e.g., "Column 'hierarchy_level' does not exist", "permission_denied: user_is_banned") violating DA-119 (don't leak internal identifiers). Compare to `/api/admin/users/[id]/role-set/route.js:47–50`, which correctly logs server-side and returns generic "Could not check role assignment" to client.

**Suggested disposition:** AUTONOMOUS-FIXABLE

**Implementation:** In `/roles/route.js` POST (line 50) and DELETE (line 122), change `{ error: canErr.message }` to `{ error: 'Could not check role assignment' }` and add server-side `console.error()` to preserve debugging. Match the pattern in role-set/route.js:48–49.

---

### R-6-AGR-05 — Missing audit logging on billing freeze and cancel (T0-2)

**Severity:** CRITICAL

**File:line:** `web/src/app/api/admin/billing/freeze/route.js:110` (no recordAdminAction), `web/src/app/api/admin/billing/cancel/route.js:75` (no recordAdminAction)

**Surfaced by:** WaveA Agent2 (1/6, but uncontradicted and unambiguous)

**Consensus description:** Both `POST /api/admin/billing/freeze` (line 15–59) and `POST /api/admin/billing/cancel` (line 17–64) execute destructive billing mutations (account freeze suspends payment/access, cancel enters 7-day grace period with DM lockout) but neither imports nor calls `recordAdminAction()`. Freeze handler at line 110 calls `service.rpc('billing_freeze_profile', ...)` and returns success without audit. Cancel handler at line 75 calls `service.rpc('billing_cancel_subscription', ...)` and returns without audit. Both handlers verify `requireAdminOutranks` and apply rate limits (correctly), but audit trail is absent. A rogue admin can mass-freeze/cancel accounts invisibly.

**Suggested disposition:** AUTONOMOUS-FIXABLE

**Implementation:** Add imports for `recordAdminAction` (from `@/lib/adminMutation`) to both handlers. After each RPC succeeds, call `recordAdminAction({ action: 'billing.freeze' | 'billing.cancel', targetTable: 'subscriptions' | 'users', targetId: <affected_id>, reason: <optional> })` before returning success. Matches pattern in `/api/admin/users/[id]/ban/route.js`.

---

## UNIQUE-A findings (Wave A only, needs tiebreaker)

### R-6-UA-01 — Incomplete outranks enforcement: grant_role / revoke_role RPCs do not validate target user current rank relative to caller

**Severity:** MEDIUM

**File:line:** `web/src/app/api/admin/users/[id]/roles/route.js:47–56, 119–128`

**Surfaced by:** WaveA Agent1 only

**Description:** POST and DELETE both call `caller_can_assign_role(role_name)` to verify actor can assign the *role being granted*, then call `requireAdminOutranks(params.id, user.id)` to verify actor strictly outranks the target *user*. WaveA Agent1 flags this as a "semantic gap noted in comments" (lines 10–15) suggesting historical confusion about attack surface. Current implementation appears correct (both checks in place, preventing lateral privilege escalation per F-034 fix), but the defensive double-check suggests this was a prior vulnerability. Agent1 notes this is MEDIUM confidence because code is correct but the fragility warrants documentation.

**Tiebreaker question:** Is the dual check (role-level + user-rank) intentional defensive-in-depth, or can it be collapsed into a single RPC that validates both? Does removing either check expose a regression vector?

---

### R-6-UA-02 — Orphaned POST/DELETE roles endpoints with no UI entry point

**Severity:** MEDIUM

**File:line:** `web/src/app/api/admin/users/[id]/roles/route.js` (exists but unused), `web/src/app/admin/users/page.tsx:381` (uses PATCH `/role-set` instead)

**Surfaced by:** WaveA Agent1 only

**Description:** The `/api/admin/users/[id]/roles` endpoint (POST grant + DELETE revoke) exists in the codebase but has no UI calling it. The admin users drawer uses `PATCH /api/admin/users/{id}/role-set` for single-role assignment instead (line 381 in users/page.tsx). This creates two role-change mechanisms: `/roles` for grant/revoke individual roles (orphaned), `/role-set` for atomic "set to exactly one role". Maintenance debt: unclear if the `/roles` endpoints are an intentional API surface for mobile/CLI tools, or dead code that should be removed.

**Tiebreaker question:** Are the POST/DELETE `/roles` endpoints intended for multi-role assignment or legacy? Should they be removed, or wired into the UI if multi-role is a feature?

---

### R-6-UA-03 — Rate limits not differentiated for destructive role revokes vs. grants

**Severity:** LOW

**File:line:** `web/src/app/api/admin/users/[id]/roles/route.js:134–145, 62–67`

**Surfaced by:** WaveA Agent1 only

**Description:** Role revoke uses `max: 30` per-minute limit (same as role grant), whereas ban endpoint uses `max: 10` for a similarly destructive operation. Role revoke on a high-ranked user is privilege escalation + access reduction, arguably closer to ban semantics. The rate limit difference is minor but suggests possible oversight in threat model.

**Tiebreaker question:** Should role revoke rate limit be lowered to `max: 10` to match ban, or is 30/min appropriate for administrative convenience?

---

## UNIQUE-B findings (Wave B only, needs tiebreaker)

### R-6-UB-01 — Missing audit on DELETE /api/admin/permission-sets/members

**Severity:** CRITICAL

**File:line:** `web/src/app/api/admin/permission-sets/members/route.js:72–130` (no recordAdminAction call)

**Surfaced by:** WaveB Agent3 only

**Description:** The DELETE handler for permission-set member removal (lines 72–130) deletes a row from `permission_set_perms` but does not call `recordAdminAction()`. The corresponding POST handler (lines 15–70) correctly calls `recordAdminAction` at lines 62–67. The DELETE path is missing audit coverage entirely. When permissions drift or are unintentionally removed, admins cannot trace who made the change.

**Tiebreaker question:** Confirm DELETE handler in permission-sets/members/route.js truly lacks `recordAdminAction` call, or was it added in a recent commit?

---

### R-6-UB-02 — Assignable-role dropdown filtering lacks client-side validation; server rejects with cryptic error

**Severity:** MEDIUM

**File:line:** `web/src/app/admin/users/page.tsx:121–126` (ROLE_OPTIONS filtering), `web/src/app/api/admin/users/[id]/roles/route.js:47–56` (API validation)

**Surfaced by:** WaveB Agent1, WaveB Agent2 (2/6, but both Wave B, so UNIQUE-B)

**Description:** The admin UI (users/page.tsx) filters assignable roles client-side: `roleNamesOrdered.slice(0, idx + 1)` shows only roles at or below the actor's rank. However, the UI does not call `caller_can_assign_role` RPC to validate each role is assignable by the caller; API does this validation and may reject with 403 "Unknown role or above your hierarchy level" if the role is restricted. Creates silent denial UX: button appears enabled, request fails.

**Tiebreaker question:** Should UI pre-validate assignability (fetch `/api/admin/roles/assignable`), or is post-submit validation acceptable UX?

---

### R-6-UB-03 — Audit missing oldValue context on permission PATCH

**Severity:** MEDIUM

**File:line:** `web/src/app/api/admin/permissions/[id]/route.js:73–78` (PATCH audit)

**Surfaced by:** WaveB Agent2 only

**Description:** When updating a permission via PATCH, `recordAdminAction` is called with `newValue: patch` but no `oldValue`. Audit log cannot show what changed during edit, only the new state. Inconsistent with some endpoints (e.g., user bans) that record both old and new. May be by design (only newValue sufficient for audit philosophy), but undermines forensic completeness.

**Tiebreaker question:** Is audit philosophy "record only changes" (oldValue omitted) or "record before/after state" (both required)?

---

### R-6-UB-04 — Missing rank check in cascading permission-set delete

**Severity:** MEDIUM

**File:line:** `web/src/app/admin/permissions/page.tsx:336–376` (deleteSet), `web/src/app/api/admin/permission-sets/[id]/route.js:114` (cascade deletes role/plan/user grants)

**Surfaced by:** WaveB Agent3 only

**Description:** Deleting a permission set cascades to delete all role/plan/user grants of that set. The delete endpoint checks `is_system` but does not re-validate `requireAdminOutranks` for affected users when revoking grants from users of equal or higher rank than the caller. An admin could delete a set granted to an owner role, wiping out owner permissions without rank enforcement.

**Tiebreaker question:** Should cascading user-permission-set deletes validate `requireAdminOutranks` for each affected user?

---

### R-6-UB-05 — `bump_user_perms_version` non-fatal errors are silent; clients remain stale

**Severity:** MEDIUM

**File:line:** `web/src/app/api/admin/users/[id]/roles/route.js:91–94` (and all mutation endpoints)

**Surfaced by:** WaveB Agent3 (also flagged by WaveA Agent3 as UNSURE)

**Description:** Every permission mutation calls `bump_user_perms_version` but treats errors as non-fatal: `if (bumpErr) console.error(...); // continue`. Handler returns 200 OK even if bump fails. Result: mutation persists in DB, but client cache is not invalidated. User sees stale permissions until an unrelated action triggers a bump. This is a design trade-off (graceful degrade vs. correctness), but underspecified.

**Tiebreaker question:** Is `bump_user_perms_version` failure a hard requirement (return 500) or best-effort (log, continue)? Should admins be notified if bump fails?

---

## STALE / CONTRADICTED findings

### R-6-STALE-01 — T0-1 DELETE /roles crash

**Claimed by:** MASTER_TRIAGE briefing ("T0-1 and T0-2 from MASTER_TRIAGE — multiple agents report these as already fixed in commit 4a59752 prior to anchor")

**Disputed by:** WaveB Agent2, WaveB Agent3 (code review shows no crash)

**Evidence:** WaveB Agent2 states: "DELETE handler calls `requireAdminOutranks(params.id, user.id)` which is a valid RPC-based rank check. The code is NOT broken; MASTER_TRIAGE line 12 incorrectly reports 'DELETE calls undefined assertActorOutranksTarget'—the variable is `requireAdminOutranks` and it IS used correctly at line 130." WaveB Agent3 confirms: "No standalone DELETE `/roles` endpoint crashes in recent code review."

**Your verdict:** STALE

The briefing states T0-1 was fixed in commit 4a59752 (prior to anchor). Code at anchor SHA shows the fix is present: role revoke handler correctly calls `requireAdminOutranks`. No crash found. Briefing note is accurate.

---

## Summary counts

- **AGREED CRITICAL:** 3 (role grant/revoke audit gap, audit-before-mutation, billing freeze/cancel audit gap)
- **AGREED HIGH:** 2 (double audit on toggles, RPC error leakage)
- **AGREED MEDIUM:** 1 (consensus from multiple agents but different evidence)
- **UNIQUE-A:** 3 (dual-check fragility, orphaned roles endpoints, rate limit disparity)
- **UNIQUE-B:** 5 (permission-set member delete audit, role dropdown UX, permission patch oldValue, cascade rank check, perms_version silent failure)
- **STALE:** 1 (T0-1 already fixed per briefing, confirmed in code)

**Total findings reconciled:** 15

---

## Key Observations

1. **Audit logging is the dominant concern:** 4 CRITICAL findings all stem from missing `recordAdminAction` calls on high-visibility mutations (roles, billing, permissions). These represent a Tier 0 compliance gap.

2. **Client-side audit is premature:** Wave B surfaces a fundamental design issue: audit RPC calls from client before server mutation completes, creating orphaned entries. Moving audit to server-only (after mutation succeeds) is the correct fix.

3. **T0-1/T0-2 status:** T0-1 is confirmed fixed. T0-2 (billing freeze/cancel) has audit gaps that need fixing.

4. **Rank enforcement is generally correct:** Dual-check pattern (role-level + user-rank) is sound; no privilege escalation regression found. Only design clarity questions remain.

