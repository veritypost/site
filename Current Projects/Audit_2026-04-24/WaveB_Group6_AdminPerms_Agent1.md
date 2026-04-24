---
wave: B
group: 6 Admin Users/Roles/Perms
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Admin Users/Roles/Permissions, Wave B, Agent 1

## CRITICAL

### F-B6-1-01 — Audit log records BEFORE destructive action completes; orphaned entries on failure

**File:line:** `web/src/components/admin/DestructiveActionConfirm.tsx:65`, `web/src/app/admin/permissions/page.tsx:424`, `web/src/app/admin/permissions/page.tsx:456`

**Evidence:**
```typescript
// DestructiveActionConfirm:65 — audit log BEFORE onConfirm mutation
const { error: rpcErr } = await supabase.rpc('record_admin_action', { ... });
if (rpcErr) { setError(...); return; }
await onConfirm?.({ reason: reason.trim() }); // mutation here, after audit written

// page.tsx:424 (toggleRoleSet) — same pattern
const { error: auditErr } = await supabase.rpc('record_admin_action', { ... });
if (auditErr) { toast.push(...); return; }
// UI state updated, then API call
setRoleSets([...roleSets, { ... }]);
const res = await fetch('/api/admin/permission-sets/role-wiring', { ... });
if (!res.ok) { setRoleSets(prev); } // revert, but audit already logged
```

**Impact:** If the destructive action handler (permission delete, role revoke, plan unassign) throws after the RPC completes, the audit log contains a false entry for a mutation that never persisted. The audit trail becomes untrustworthy for compliance/forensics. Orphaned entries also appear if the user network fails between RPC and mutation.

**Reproduction:** 
1. Open /admin/permissions, Registry tab.
2. Delete a permission and submit. Audit log writes.
3. If the DELETE /api/admin/permissions/[id] fails (network, 403, 500), the UI reverts the deletion but admin_audit_log contains a 'permission.delete' entry for a row that still exists.

**Suggested fix direction:** Move `recordAdminAction` to the END of the mutation, AFTER the server mutation succeeds (in the API handler) or wrap client mutations in try/catch with audit rollback.

**Confidence:** HIGH

---

### F-B6-1-02 — toggleRoleSet & togglePlanSet: audit+UI+API executed out-of-order; state corruption on failure

**File:line:** `web/src/app/admin/permissions/page.tsx:423-453`, `web/src/app/admin/permissions/page.tsx:455-485`

**Evidence:**
```typescript
// Line 424: RPC audit FIRST
await supabase.rpc('record_admin_action', { ... });

// Line 436: Update client state SECOND (optimistic)
setRoleSets(roleSets.filter(...));  // or setRoleSets([...roleSets, {...}])

// Line 443: API mutation THIRD
const res = await fetch('/api/admin/permission-sets/role-wiring', { ... });
if (!res.ok) {
  setRoleSets(prev);  // revert state
}

// But the role-wiring/route.js line 68 ALSO calls recordAdminAction
// So if API succeeds, there are TWO audit log entries
```

**Impact:** 
1. Double audit logging: Client RPC + API RPC both record the same action (action name differs: `permission_set.toggle_role` client-side vs `permission_set.role.grant/revoke` server-side, but same effect).
2. State reversion on API failure happens too late — if network drops after RPC but before API, audit log is written but role_permission_sets row is NOT modified.
3. Inconsistency with non-destructive mutations: user-grants endpoint (line 67 of user-grants/route.js) ONLY records audit server-side.

**Reproduction:** 
1. In /admin/permissions, Role grants tab, toggle a role's permission set.
2. Open admin_audit_log table and search for the role_id — find TWO entries logged for the same action.
3. Network failure test: Open DevTools Network, throttle to GPRS, toggle a role grant, then block the fetch to /api/admin/permission-sets/role-wiring. The RPC completes, audited; the fetch fails.

**Suggested fix direction:** Remove client-side audit logging from toggleRoleSet and togglePlanSet; let the API handlers record via recordAdminAction only (already done by role-wiring and plan-wiring routes).

**Confidence:** HIGH

---

## MEDIUM

### F-B6-1-03 — Assignable-role filtering per caller's rank: caller_can_assign_role RPC lacks explicit documentation of caller-vs-role ranking

**File:line:** `web/src/app/api/admin/users/[id]/roles/route.js:47-49`, `web/src/app/api/admin/users/[id]/roles/route.js:119-121`

**Evidence:**
```javascript
// POST & DELETE both call:
const { data: canAssign, error: canErr } = await authed.rpc('caller_can_assign_role', {
  p_role_name: role_name,
});
if (!canAssign) {
  return NextResponse.json(
    { error: 'Unknown role or above your hierarchy level' },
    { status: 403 }
  );
}
```

**Impact:** The RPC enforces that the caller cannot assign/revoke a role above their hierarchy level. However, there's no UI-level filtering of the roles dropdown to show only assignable roles. An admin's UI client shows all roles (filtering happens server-side on mutation). This causes user confusion: they see roles they cannot grant and only discover the error when they try.

The code comment on line 17-20 mentions the RPC reads `roles.hierarchy_level` but there's no explanation of what "above your hierarchy level" means.

**Reproduction:** 
1. Log in as an editor (rank ~70).
2. Go to /admin/users/[some-user-id]/permissions or admin console.
3. Try to assign an 'admin' role (rank 80).
4. Server rejects with 403 "Unknown role or above your hierarchy level".
5. Expected: role dropdown should have been pre-filtered to only editor-level and below.

**Suggested fix direction:** Add a computed list of assignable roles to the UI context (fetch /api/admin/roles/assignable or add to /api/admin/users/[id] endpoint) and filter the role dropdown client-side.

**Confidence:** MEDIUM

---

### F-B6-1-04 — Ban/freeze audit logging inconsistency: ban records audit, but freezing may not

**File:line:** `web/src/app/api/admin/users/[id]/ban/route.js:73-79`, `web/src/app/api/admin/billing/freeze/route.js`

**Evidence:**
```javascript
// ban/route.js line 73 — correctly records audit
await recordAdminAction({
  action: banned ? 'user.ban' : 'user.unban',
  targetTable: 'users',
  targetId: targetId,
  reason: reason,
  newValue: { is_banned: banned },
});

// Need to verify freeze/route.js calls recordAdminAction too
```

**Impact:** If freeze/route.js does NOT call recordAdminAction, then ban audit logs are recorded but freeze audit logs are not, creating an inconsistency in the audit trail. Bans and freezes are both account-suppression actions that should be equally audited.

**Reproduction:** Code-reading only; requires reading freeze/route.js to confirm.

**Suggested fix direction:** Verify freeze and cancel routes call recordAdminAction with appropriate action names (e.g., 'user.freeze', 'user.unfreeze').

**Confidence:** MEDIUM

---

## LOW

### F-B6-1-05 — Permission bump_user_perms_version is non-fatal; permissibility changes may not propagate to iOS clients

**File:line:** `web/src/app/api/admin/users/[id]/roles/route.js:91-94`, `web/src/app/api/admin/permissions/user-grants/route.js:75-78`

**Evidence:**
```javascript
// Every permission change bumps version but errors are logged, not thrown
const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
  p_user_id: params.id,
});
if (bumpErr) console.error('[roles.grant] perms_version bump failed:', bumpErr.message);
// continues to return 200 anyway
```

**Impact:** If bump_user_perms_version fails (RPC syntax error, DB timeout, RLS block), the mutation still succeeds (200) and the user's client will not refetch permissions on next navigation. This is a graceful degrade but could leave the target user with stale capabilities for up to their next background permission check. On iOS, if the app is backgrounded and never re-opens, the stale cache is permanent until a forced version bump.

**Reproduction:** Add a RLS block to bump_user_perms_version, grant a role, check server logs — bump fails but client gets 200.

**Suggested fix direction:** Monitor the error logs for bump_user_perms_version failures; consider a background job that periodically re-bumps users whose perms_version drifted.

**Confidence:** LOW

---

## UNSURE

### F-B6-1-06 — recordAdminAction: p_ip and p_user_agent parameters unused

**File:line:** `web/src/lib/adminMutation.ts:141`, `web/src/app/api/admin/users/[id]/ban/route.js:73`, (every recordAdminAction call)

**Evidence:**
```typescript
// adminMutation.ts:141 — RPC is called with no p_ip, p_user_agent
await authed.rpc('record_admin_action', {
  p_action: args.action,
  p_target_table: args.targetTable ?? null,
  p_target_id: args.targetId ?? null,
  p_reason: args.reason ?? null,
  p_old_value: (args.oldValue ?? null) as never,
  p_new_value: (args.newValue ?? null) as never,
  // missing: p_ip, p_user_agent
});
```

**Impact:** The comment at adminMutation.ts:84-88 acknowledges this gap (DA-119). Audit logs lack IP and user agent, which are useful for fraud detection (e.g., detecting admin account hijacks). The underlying RPC function likely accepts these params but they're not passed.

**Reproduction:** Code-reading only.

**Suggested fix direction:** Extract user agent from Request headers and caller IP from X-Forwarded-For, pass to recordAdminAction helper.

**Confidence:** LOW — acknowledged in code comment; is a known backlog item, not a regression.

---

## Summary

**Critical findings:** 2 (audit logging order, double-audit on role/plan toggles)
**Needs verification:** Ban vs. freeze audit consistency 
**Known backlog:** p_ip / p_user_agent audit enrichment (DA-119)

The T0-1 (DELETE /roles crash) was fixed in commit 4a59752; the current code uses `requireAdminOutranks(params.id, user.id)` which is correct.

