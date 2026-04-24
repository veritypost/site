---
wave: A
group: 6 Admin Users/Roles/Permissions
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Admin Users/Roles/Permissions, Wave A, Agent 3

## CRITICAL

### F-6-3-01 — Missing audit log in permission-sets/members POST (add member)

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/permission-sets/members/route.js:15–69`

**Evidence:**
```javascript
// POST handler (lines 15–69) records audit action (lines 62–67):
await recordAdminAction({
  action: 'permission_set.add_member',
  targetTable: 'permission_set',
  targetId: permission_set_id,
  newValue: { permission_id },
});

// DELETE handler (lines 72–130) also records audit action (lines 122–127):
await recordAdminAction({
  action: 'permission_set.remove_member',
  targetTable: 'permission_set',
  targetId: permission_set_id,
  oldValue: { permission_id },
});
```

**Impact:** Both paths ARE audited. This is correctly implemented. No finding.

---

### F-6-3-02 — Inconsistent audit logging in role-wiring POST

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/permission-sets/role-wiring/route.js:13–77`

**Evidence:**
```javascript
// Permission-set/role toggle records audit (lines 68–74):
await recordAdminAction({
  action: enabled ? 'permission_set.role.grant' : 'permission_set.role.revoke',
  targetTable: 'permission_set',
  targetId: permission_set_id,
  newValue: enabled ? { role_id } : null,
  oldValue: enabled ? null : { role_id },
});
```

**Impact:** Audit is present and correctly swaps old/new based on enabled flag. No finding.

---

### F-6-3-03 — Unban operation missing oldValue audit context

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/users/[id]/ban/route.js:56–79`

**Evidence:**
```javascript
// Ban path at line 73-79:
await recordAdminAction({
  action: banned ? 'user.ban' : 'user.unban',
  targetTable: 'users',
  targetId: targetId,
  reason: reason,
  newValue: { is_banned: banned },
});
```

**Impact:** When unbanning (banned=false), only newValue={ is_banned: false } is logged; oldValue is missing. Audit trail does not show the prior banned state. This is inconsistent with the destructive-confirm pattern which logs both old and new states. However, the mutation IS audited and the action name distinguishes ban vs unban, so the semantic intent is preserved. Low severity but shows incomplete audit context.

**Reproduction:** Code-reading only. In /admin/users drawer, unban a user → only newValue logged, not oldValue.

**Suggested fix direction:** Pass oldValue: { is_banned: true } when logging user.unban action to restore full before/after context.

**Confidence:** MEDIUM

---

## HIGH

### F-6-3-04 — Role assignment: caller_can_assign_role RPC enforces rank check

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/users/[id]/roles/route.js:25–96` and `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/users/[id]/role-set/route.js:19–110`

**Evidence:**
```javascript
// Both POST (line 47) and DELETE (line 119) call:
const { data: canAssign, error: canErr } = await authed.rpc('caller_can_assign_role', {
  p_role_name: role_name,
});
if (canErr) return NextResponse.json({ error: canErr.message }, { status: 500 });
if (!canAssign) {
  return NextResponse.json(
    { error: 'Unknown role or above your hierarchy level' },
    { status: 403 }
  );
}

// Plus (line 58 POST, 130 DELETE):
const rankErr = await requireAdminOutranks(params.id, user.id);
if (rankErr) return rankErr;
```

**Impact:** Role grant/revoke enforces TWO checks:
1. Caller can assign the role being granted (not above caller's hierarchy)
2. Caller's max rank strictly outranks the target's current max rank

This is correct per F-034 fix. However, assignment UI at /admin/users/page.tsx filters available roles by hierarchy and sends a role change through /api/admin/users/[id]/role-set. The filtering logic (line 121–126 in users/page.tsx) uses ROLE_OPTIONS which only shows roles <= actor's own highest role.

**Verification:** Both endpoints enforce outranks(). The UI-level filter + server-side enforce are aligned. FINDING: This is correct.

**Confidence:** HIGH (no issue found)

---

### F-6-3-05 — Permission grant/revoke chains audit → DB → perms bump

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/permissions/user-grants/route.js:15–146`

**Evidence:**
```javascript
// POST (add grant) at lines 15–81:
// 1. Permission check (line 18)
// 2. Rate limit (lines 31–42)
// 3. Rank check (lines 50–51)
// 4. INSERT into user_permission_sets (lines 60)
// 5. Audit log (lines 67–73)
// 6. Perms version bump (lines 75–78)

// DELETE (revoke) at lines 83–146:
// Same order

await recordAdminAction({
  action: 'user_grant.add' || 'user_grant.revoke',
  targetTable: 'user',
  targetId: user_id,
  oldValue/newValue appropriately set,
});

const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
  p_user_id: user_id,
});
```

**Impact:** Permission mutations are correctly audited. Each grant/revoke goes through record_admin_action. The perms_version bump is called post-mutation to signal client cache invalidation. All three synchronization points (audit, DB, bump) are present and in correct order. No finding.

**Confidence:** HIGH

---

## MEDIUM

### F-6-3-06 — DestructiveActionConfirm always calls record_admin_action before onConfirm

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/components/admin/DestructiveActionConfirm.tsx:59–85`

**Evidence:**
```javascript
async function submit() {
  // ... validation ...
  try {
    const supabase = createClient();
    const { error: rpcErr } = await supabase.rpc('record_admin_action', {
      p_action: action,
      p_target_table: targetTable ?? undefined,
      p_target_id: targetId ?? undefined,
      p_reason: reason.trim() || undefined,
      p_old_value: (oldValue ?? null) as never,
      p_new_value: (newValue ?? null) as never,
    });
    if (rpcErr) {
      setError(`Audit log write failed: ${rpcErr.message}`);
      setBusy(false);
      return;  // <-- STOPS if audit fails
    }
    await onConfirm?.({ reason: reason.trim() });  // <-- Mutation runs AFTER audit
  }
```

**Impact:** The audit log is written BEFORE the destructive action (onConfirm) runs. If onConfirm fails, the audit record exists but the mutation may not have persisted. This is a divergence from server-side endpoints where mutation is logged after DB write completes (see /api/admin/permissions/[id]/route.js:114–127).

However, the RPC runs on the cookie-scoped client, and the onConfirm handler is the UI-triggered mutation function—the server endpoint will also call recordAdminAction. This means the audit is logged twice: once from the component, once from the server endpoint. This is redundant and semantically confusing (the component's record_admin_action call happens before the server endpoint even receives the request).

**Reproduction:** Open DestructiveActionConfirm on /admin/permissions (delete permission). On line 65–72, the RPC fires. Then onConfirm is called (which is the deleteSet/deletePerm callback that calls fetch(endpoint, DELETE)). The endpoint also logs via recordAdminAction. Two audit entries created.

**Suggested fix direction:** Remove the RPC call from DestructiveActionConfirm and rely on server endpoints to log via recordAdminAction. The component's audit call is premature and causes duplicate logging.

**Confidence:** HIGH

---

### F-6-3-07 — No DELETE /api/admin/roles endpoint exists

**File:line:** Does not exist. Searched `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/` for `roles/route.js` or similar.

**Evidence:**
```
find results:
/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/users/[id]/roles/route.js ✓ (exists)
/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/roles ✗ (does not exist)
/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/roles/route.js ✗ (does not exist)
```

**Impact:** The scope memo mentions "T0-1 DELETE /roles crash". This endpoint does not exist in the codebase. The closest is /api/admin/users/[id]/roles (grant/revoke individual role). There is no bulk role deletion endpoint. If T0-1 refers to a role deletion feature planned but not yet implemented, there is no handler to test. If it refers to a handler that was removed, it's not present in the anchor SHA.

**Reproduction:** Attempted to find a DELETE /api/admin/roles route; does not exist.

**Suggested fix direction:** Clarify T0-1: is this a missing feature, a removed endpoint, or a different path?

**Confidence:** HIGH

---

## LOW

### F-6-3-08 — Permission deny_mode default in permissions/route.js POST

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/permissions/route.js:44–79`

**Evidence:**
```javascript
const row = {
  key,
  display_name,
  category,
  ui_section: body.ui_section ?? null,
  lock_message: body.lock_message ?? null,
  requires_verified: !!body.requires_verified,
  is_public: !!body.is_public,
  is_active: body.is_active !== false,
  deny_mode: body.deny_mode || 'locked',  // <-- defaults to 'locked'
};
```

**Impact:** If deny_mode is not passed, defaults to 'locked'. The UI new-permission drawer sets newPermDenyMode to 'locked' initially (line 112 in /admin/permissions/page.tsx), so the default is intentional. No issue.

**Confidence:** LOW

---

## UNSURE

### F-6-3-09 — perms_version bump error handling

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/users/[id]/role-set/route.js:104–107` and similar in all mutation endpoints

**Evidence:**
```javascript
const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
  p_user_id: targetId,
});
if (bumpErr) console.error('[role-set] perms_version bump failed:', bumpErr.message);
// No error response — function succeeds even if bump fails
```

**Impact:** If bump_user_perms_version RPC fails, the error is logged but the endpoint still returns 200 OK. The mutation persisted, but the client's permission cache won't be invalidated. On next navigation, the client might miss the permission change until unrelated perms_version bumps occur.

Is this acceptable? The mutation is the source of truth; bump is observability. However, the briefing mentions "cache freshness" as a focus area. If bump is critical for correctness (not just optimization), this silent failure is a gap.

**Reproduction:** Inject a failure in bump_user_perms_version RPC; observe console error but 200 response.

**Suggested fix direction:** Needs product spec: is perms_version bump a hard requirement (500 on failure) or best-effort (log, continue)? Currently all endpoints treat it as best-effort.

**Confidence:** MEDIUM — flagged as design clarity issue, not a bug

---

**Summary:**
- No T0-1 DELETE /roles handler found (clarification needed).
- Permission enforcement, audit logging, and perms_version bumps are correctly implemented across all grant/revoke flows.
- Unban audit context missing oldValue (minor).
- DestructiveActionConfirm logs audit before server mutation (redundant; should be removed from component).
- perms_version bump errors are non-fatal (design question).

