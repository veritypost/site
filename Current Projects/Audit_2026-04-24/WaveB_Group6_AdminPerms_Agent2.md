---
wave: B
group: 6 Admin Users/Roles/Perms
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Admin Users/Roles/Permissions, Wave B, Agent 2

## CRITICAL

### F-B6-2-01 — DELETE /roles ReferenceError on every revoke (T0-1)
**File:line:** `web/src/app/api/admin/users/[id]/roles/route.js:98-164`
**Evidence:**
```javascript
// Line 130:
const rankErr = await requireAdminOutranks(params.id, user.id);

// Line 58 (POST handler):
const rankErr = await requireAdminOutranks(params.id, user.id);
```
DELETE handler calls `requireAdminOutranks(params.id, user.id)` which is a valid RPC-based rank check. This is correctly implemented and matches the POST handler pattern. The code is NOT broken; MASTER_TRIAGE line 12 incorrectly reports "DELETE calls undefined assertActorOutranksTarget" — the variable actually imported at line 8 is `requireAdminOutranks` and it IS used correctly at line 130. The DELETE handler follows the correct pattern:
1. requirePermission for 'admin.moderation.role.revoke' ✓
2. caller_can_assign_role RPC check ✓
3. requireAdminOutranks rank guard ✓  
4. Rate limit check ✓
5. revoke_role RPC call ✓
6. bump_user_perms_version RPC call ✓

**Confidence:** MEDIUM — code appears correct on inspection, but MASTER_TRIAGE specifically flagged this as T0-1. Re-confirm against actual runtime or test execution.
**Suggested fix direction:** Code appears to be already fixed. Verify no typo exists in the actual deployed version. If the typo DID exist, change `assertActorOutranksTarget` (nonexistent) to `requireAdminOutranks`.

---

### F-B6-2-02 — Admin action audit inconsistency in permission-set membership
**File:line:** `web/src/app/admin/permissions/page.tsx:378-421` & `web/src/app/api/admin/permission-sets/members/route.js:62-69,122-127`
**Evidence:**
```javascript
// removePermFromSet (line 395-421): RECORDS AUDIT TWICE
const { error: auditErr } = await supabase.rpc('record_admin_action', {
  p_action: 'permission_set.remove_member',
  p_target_table: 'permission_set_perms',
  p_target_id: setId,
  p_reason: null,
  p_old_value: { permission_set_id: setId, permission_id: permId },
  p_new_value: null,
});
// ... then DELETE /api/admin/permission-sets/members calls recordAdminAction again (line 122-127)

// addPermToSet (line 378-393): NO UI AUDIT, relies on API audit only
const res = await fetch('/api/admin/permission-sets/members', {
  method: 'POST',
  // ... sends to POST /api/admin/permission-sets/members
  // which DOES call recordAdminAction at line 62-69
});
```

**Impact:** 
- removePermFromSet: Double audit-log entry (one from UI RPC, one from API route). Duplicate rows in audit_log for the same action. 
- addPermToSet: Single audit-log entry (only from API). No inconsistency, but pattern differs from remove (UI vs API audit origin).
- Violates the briefing requirement: "Admin action audit log coverage on every mutation" — the coverage is there but via different paths (client RPC vs server endpoint), creating maintenance fragility.

**Reproduction:** 
1. Admin navigates to /admin/permissions → Sets tab
2. Expand a permission set and click "Remove" on a permission member → triggers removePermFromSet
3. Check admin_audit_log; see TWO entries for the same permission_set.remove_member action
4. Expand a set and click "+ permission" button → triggers addPermToSet
5. Check admin_audit_log; see ONE entry for the permission_set.add_member action via API

**Suggested fix direction:** Either (a) remove the RPC audit call from removePermFromSet UI, or (b) remove the API-side recordAdminAction from DELETE endpoint. Prefer (a): let API endpoints own audit uniformly.

**Confidence:** HIGH

---

## HIGH

### F-B6-2-03 — Audit log missing oldValue on permission PATCH
**File:line:** `web/src/app/api/admin/permissions/[id]/route.js:73-78`
**Evidence:**
```javascript
await recordAdminAction({
  action: 'permission.update',
  targetTable: 'permission',
  targetId: id,
  newValue: patch,  // ← only newValue recorded
});
```
The permission PATCH endpoint records the new values but does NOT record the previous state (`oldValue`). This is inconsistent with:
- permission_set.update (line 64-69): does NOT record oldValue
- permission.delete (line 121-125): records oldValue: { key } but no full old state
- permission_set.delete (line 125-130): records oldValue: { key } only

vs. user_grant audit (user-grants/route.js:67-73): records both newValue
and accept missing oldValue pattern as designed.

**Impact:** Audit trail cannot show what changed during a permission edit; only the new state is recorded. Compliance/forensics issue if auditor needs to reconstruct configuration drift.

**Reproduction:** Admin changes `permission.is_active` from false to true → audit_log shows `newValue: { is_active: true }` but no `oldValue: { is_active: false }`.

**Suggested fix direction:** Fetch the existing permission row before update, record oldValue in audit action.

**Confidence:** MEDIUM — may be by design (only newValue sufficient for audit trail philosophy), but inconsistent with audit patterns elsewhere (e.g., user bans record both).

---

### F-B6-2-04 — Role assignment filtering via ROLE_OPTIONS doesn't re-validate against caller's max rank  
**File:line:** `web/src/app/admin/users/page.tsx:121-126`
**Evidence:**
```typescript
const ROLE_OPTIONS = (() => {
  if (!currentUserRole || roleNamesOrdered.length === 0) return [];
  const idx = roleNamesOrdered.indexOf(currentUserRole);
  if (idx < 0) return [];
  return roleNamesOrdered.slice(0, idx + 1);  // ← up to and including actor's role
})();
```
The dropdown on the admin UI shows roles up to the caller's own rank. This is a client-side filter. The API endpoint `/api/admin/users/[id]/roles/route.js:47-56` re-validates via `caller_can_assign_role` RPC, which correctly blocks assignment of roles the caller cannot assign. However, the UI does NOT call `caller_can_assign_role` to validate that the specific role in the dropdown is assignable *by this caller*. The endpoint enforces it, but the UX is:
1. Admin sees role options up to their rank
2. Admin selects a role
3. Admin submits → API re-checks and might reject

This is not a security gap (API enforces), but creates silent denial UX (button enabled, request fails).

**Impact:** User-facing silent failure. Admin clicks "set role to X", submits, gets error toast. The UI implied the role was valid but it wasn't.

**Reproduction:** (Hypothetical) If role hierarchy ever includes a "restricted_admin" role that only the owner can assign, a regular admin sees it in the dropdown (because it's ≤ their rank value), but API rejects the grant with 403.

**Suggested fix direction:** Before rendering ROLE_OPTIONS, call the same RPC check on each candidate role, or accept the post-submit validation (current design is acceptable).

**Confidence:** LOW — UI/UX observation, not a functional bug. The API guard is correct.

---

## MEDIUM

### F-B6-2-05 — Permissions UI calls record_admin_action from client for role/plan toggles
**File:line:** `web/src/app/admin/permissions/page.tsx:423-453, 455-485`
**Evidence:**
```javascript
// toggleRoleSet (line 423-453) — RECORDS AUDIT FROM UI VIA RPC
const { error: auditErr } = await supabase.rpc('record_admin_action', {
  p_action: 'permission_set.toggle_role',
  p_target_table: 'role_permission_sets',
  p_target_id: setId,
  p_reason: null,
  p_old_value: { role_id: roleId, permission_set_id: setId, enabled: !!currentlyOn },
  p_new_value: { role_id: roleId, permission_set_id: setId, enabled: !currentlyOn },
});
// Then calls POST /api/admin/permission-sets/role-wiring
```
The audit action is recorded from the client BEFORE the actual DB mutation. If the API call fails (network, permissions, rate limit), the audit_log shows an action that never actually persisted. This is a TOCTOU race.

**Impact:** Audit log contains "enabled role permission set for role X" but the DB update failed → orphaned audit entry. Forensics noise.

**Reproduction:**
1. Admin toggles a role permission set on/off
2. record_admin_action RPC succeeds (mutation succeeds in DB)
3. POST /api/admin/permission-sets/role-wiring fails (e.g., rate limit hit after client permission check)
4. Audit log shows action, but permission_set not actually toggled

**Suggested fix direction:** Move audit recording to the API endpoint (as is done in permission-sets/members/route.js). The endpoint already has proper error handling and can audit only on success. Let POST handler own the audit.

**Confidence:** MEDIUM — existing pattern in permission-sets/members/route.js shows the better design.

---

### F-B6-2-06 — Missing per-user-role audit context in permission mutations
**File:line:** `web/src/app/api/admin/permissions/user-grants/route.js:67-73, 133-138`
**Evidence:**
```javascript
// POST — grants permission set to user
await recordAdminAction({
  action: 'user_grant.add',
  targetTable: 'user',
  targetId: user_id,
  reason: row.reason,
  newValue: { permission_set_id, expires_at: row.expires_at },
  // Missing: which admin role assigned it? (granted_by is stored in user_permission_sets but not in audit)
});

// DELETE — revokes permission set from user  
await recordAdminAction({
  action: 'user_grant.revoke',
  targetTable: 'user',
  targetId: user_id,
  oldValue: { permission_set_id },
  // Missing: who revoked it? (granted_by not tracked here)
});
```

The `granted_by` field in `user_permission_sets` table captures the admin's ID, but the audit_log action does NOT include it in `oldValue`/`newValue`. An auditor reviewing who made permission changes must cross-reference the user_permission_sets row's timestamp and granted_by column, then hope it wasn't already deleted.

**Impact:** Weak audit trail for permission grant/revoke. Cannot definitively match "who did this action" to the admin_audit_log entry in a single row.

**Suggested fix direction:** Include `granted_by: actor.id` in the newValue/oldValue of the audit action, or accept that the audit_log itself carries the `actor` in auth context (if schema includes it). Verify audit_log schema includes actor_id column.

**Confidence:** LOW — may be mitigated by audit_log.actor_id if present in schema, but explicit audit trail is cleaner.

---

## UNSURE

### F-B6-2-07 — Ban/freeze workflows not audited in this agent's scope
**Briefing focus:** "Ban/freeze flows (T0-2)". 
**Status:** Reviewed `/api/admin/users/[id]/ban/route.js:20-87`. The route:
- Calls requirePermission('admin.users.ban') ✓
- Calls requireAdminOutranks ✓
- Calls checkRateLimit ✓
- Updates users.is_banned/banned_at/banned_by/ban_reason ✓
- Calls recordAdminAction ✓
- Calls bump_user_perms_version ✓

No obvious crash. MASTER_TRIAGE T0-2 references `/api/admin/billing/cancel/route.js` and `freeze/route.js` (not in scope for this agent). Need a separate agent to audit the billing freeze path.

---

## Summary

- **T0-1 (DELETE /roles crash):** Code appears correct; MASTER_TRIAGE claim may be stale or referring to a fixed version.
- **Audit coverage:** Generally good. Pattern inconsistency on permission-set member add/remove (client vs API audit origin).
- **Rank enforcement:** API-side validation is correct; UI filtering is adequate.
- **Permission cache bumping:** Consistently called in all mutation endpoints (POST role grant, DELETE role revoke, POST/DELETE permission grants, ban/unban).

