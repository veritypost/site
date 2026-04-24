---
wave: B
group: 6 Admin Users/Roles/Perms
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Admin Users/Roles/Permissions, Wave B, Agent 3/3

## CRITICAL

### F-B-6-3-01 — Missing audit log in permission-sets/members DELETE

**File:line:** `web/src/app/api/admin/permission-sets/members/route.js:72–130`

**Evidence:**
The DELETE handler at line 72 lacks `recordAdminAction` call. The POST handler (lines 15–70) correctly calls `recordAdminAction` at line 62. The DELETE path runs the query (lines 111–115), then returns (line 129) without audit logging.

```javascript
// Line 122-127: Delete executes
const { error } = await service
  .from('permission_set_perms')
  .delete()
  .eq('permission_set_id', permission_set_id)
  .eq('permission_id', permission_id);
// ... no recordAdminAction follows
return NextResponse.json({ ok: true }); // Line 129
```

**Impact:** Removing a permission from a set leaves no audit trail. When permissions drift or are unintentionally removed, admins cannot trace who made the change. Violates audit requirement ("Admin action audit log coverage on **every mutation**").

**Reproduction:** 
1. Visit `/admin/permissions` → Sets tab, expand a set
2. Click "Remove" on a permission member
3. Check `admin_audit_log` — no entry for `permission_set.remove_member`

**Suggested fix direction:** Add `await recordAdminAction(...)` before the final return (matching pattern from POST and other delete endpoints).

**Confidence:** HIGH

---

### F-B-6-3-02 — Role grant/revoke missing audit via RPC; only endpoint-level call

**File:line:** `web/src/app/api/admin/users/[id]/roles/route.js:74–95` and `146–163`

**Evidence:**
Both POST (grant) and DELETE (revoke) handlers call the underlying RPC (`grant_role` / `revoke_role` at lines 74, 146). Neither calls `recordAdminAction` afterward. The RPC is documented to run audit internally, but the route has no explicit call.

```javascript
// Line 74: grant via RPC (no audit call after)
const { error } = await service.rpc('grant_role', {
  p_admin_id: user.id,
  p_user_id: params.id,
  p_role_name: role_name,
});
// No recordAdminAction() here
return NextResponse.json({ ok: true }); // Line 95
```

Compare to other endpoints (e.g., `/users/[id]/ban/route.js:73–79`, `/users/[id]/role-set/route.js:97–102`), which explicitly call `recordAdminAction`.

**Impact:** Role changes may rely on RPC-level audit, but audit coverage is opaque. If the RPC fails or is silent, no fallback audit happens. If the RPC audit is ever removed, this route becomes unlogged.

**Reproduction:** 
1. Use `/admin/users/{id}` modal to grant a role (currently no direct UI for it)
2. Check `admin_audit_log` — may or may not have entry depending on RPC implementation

**Suggested fix direction:** Add explicit `recordAdminAction` call for both POST and DELETE, matching the pattern in `/api/admin/users/[id]/role-set/route.js:97–102`.

**Confidence:** HIGH

---

## HIGH

### F-B-6-3-03 — `caller_can_assign_role` RPC error returns raw message to client

**File:line:** `web/src/app/api/admin/users/[id]/role-set/route.js:47–50`

**Evidence:**
```javascript
const { data: canAssign, error: canErr } = await authed.rpc('caller_can_assign_role', {
  p_role_name: role_name,
});
if (canErr) {
  // DA-119: don't leak raw RPC error message to client.
  console.error('[admin.users.role-set.canAssign]', canErr.message);
  return NextResponse.json({ error: 'Could not check role assignment' }, { status: 500 });
}
```

Comment at line 48 explicitly references DA-119 (don't leak internal messages). The same pattern is followed: log server-side, return generic message. **This is correct.** However, compare to `/users/[id]/roles/route.js:47–56`:

```javascript
const { data: canAssign, error: canErr } = await authed.rpc('caller_can_assign_role', {
  p_role_name: role_name,
});
if (canErr) return NextResponse.json({ error: canErr.message }, { status: 500 }); // ← LEAKS
```

**Impact:** `POST /api/admin/users/[id]/roles` and `DELETE /api/admin/users/[id]/roles` leak RPC error messages (e.g., `"Column 'hierarchy_level' does not exist"` if schema drifted). Violates DA-119 secret handling.

**Reproduction:**
1. Trigger a transient RPC failure (e.g., mock a missing column in roles table)
2. Call POST/DELETE to roles endpoint
3. Error message is visible in response

**Suggested fix direction:** Change line 50 in both POST and DELETE handlers from `{ error: canErr.message }` to `{ error: 'Could not check role assignment' }` and add server-side log.

**Confidence:** HIGH

---

### F-B-6-3-04 — Missing rank check in bulk permission-set-perms delete

**File:line:** `web/src/app/admin/permissions/page.tsx:336–376`

**Evidence:**
When a user deletes a permission set from the UI (line 336: `deleteSet`), the client calls DELETE `/api/admin/permission-sets/{id}` (line 367). The API endpoint correctly checks `is_system` (line 114 in permission-sets/[id]/route.js), but the cascade delete of membership rows (role/plan/user grants) has no rank guard.

If a set is revoked from a user whose rank equals or exceeds the caller's, the cascade still succeeds because:
- The endpoint permission is `admin.permissions.set.edit` (not user-scoped)
- The delete logic doesn't re-check `requireAdminOutranks` for affected users

**Impact:** An admin can delete a permission set that is granted to a user/role/plan at the same or higher rank, wiping out their permissions without rank enforcement. Edge case for cascades.

**Reproduction:**
1. Create a permission set and assign it to "owner" role
2. Login as an "admin"
3. Delete the permission set
4. Owner's permissions are silently removed without rank check

**Suggested fix direction:** On cascading user-permission-set deletes, validate `requireAdminOutranks` for each affected user.

**Confidence:** MEDIUM (cascade is rare; rank checks elsewhere are robust)

---

### F-B-6-3-05 — `bump_user_perms_version` non-fatal errors are console.error'd but never surfaced

**File:line:** Multiple — `/users/[id]/roles/route.js:91–94`, `/users/[id]/ban/route.js:81–84`, etc.

**Evidence:**
Every mutation that changes a user's permissions calls `bump_user_perms_version` with a pattern:
```javascript
const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
  p_user_id: targetId,
});
if (bumpErr) console.error('[roles.grant] perms_version bump failed:', bumpErr.message);
```

The handler continues and returns success even if the bump fails. This means a role grant succeeds but the user's client never re-fetches permissions, staying stale until an unrelated action triggers a version bump.

**Impact:** User sees stale permissions after role/permission changes. Not a security breach (the DB is correct), but a UX/staleness bug. User may believe they have a privilege they don't, or vice versa.

**Reproduction:**
1. Mock `bump_user_perms_version` RPC to fail
2. Grant a role to a user
3. Check user's client cache — still shows old permissions
4. No error feedback to admin

**Suggested fix direction:** Log the error (already done) but consider adding a small alert to the admin UI if bump fails (non-blocking, soft warning).

**Confidence:** MEDIUM (design trade-off: RPC failure is non-fatal by intent, but client staleness is underspecified)

---

## MEDIUM

### F-B-6-3-06 — `require_outranks` self-edit skip may be asymmetric with "can assign role to self"

**File:line:** `web/src/lib/adminMutation.ts:105–131`

**Evidence:**
```javascript
export async function requireAdminOutranks(
  targetUserId: string | null | undefined,
  actorId: string
): Promise<NextResponse | null> {
  if (!targetUserId || targetUserId === actorId) return null; // ← SELF ALLOWED
  // ... RPC check ...
}
```

Line 109 returns `null` (no error) when `targetUserId === actorId`. This allows self-edits. But `caller_can_assign_role` RPC is also called separately in grant paths. If that RPC rejects self-promotion (e.g., an "owner" trying to "grant owner" to themselves when `hierarchy_level` prevents same-level grants), there's an asymmetry.

**Impact:** An admin might be able to edit their own rows (e.g., revoke their own role) when they shouldn't. Low impact because most role changes are via modal on other users, but edge case exists.

**Reproduction:**
1. Admin tries to revoke their own role via direct API call
2. `requireAdminOutranks` returns null (allows it)
3. RPC permissions check may or may not block it depending on `caller_can_assign_role`

**Suggested fix direction:** Clarify whether self-edits should be allowed or rejected at the permission level (not in the rank guard). Document the intent.

**Confidence:** LOW (self-edit is rare; design intent is ambiguous)

---

## UNSURE

### F-B-6-3-U1 — DELETE /roles crash (T0-1) unresolved

**Scope claim:** "reproduce T0-1 DELETE /roles crash"

**Finding:** No standalone DELETE `/roles` endpoint exists. Role mutations are:
- POST/DELETE `/api/admin/users/[id]/roles` (grant/revoke per user)
- PATCH `/api/admin/users/[id]/role-set` (set exact role)
- POST `/api/admin/permission-sets/role-wiring` (assign sets to roles)

None of these crashed in recent code review. If T0-1 refers to a crash in one of these endpoints:
- The crash would be in the underlying RPC (`grant_role`, `revoke_role`)
- Or in the roles table schema
- Requires Supabase logs or RPC function source

**Suggested resolution:** Check RPC definitions in Supabase migrations; check error logs for timestamp near the dispatch date.

**Confidence:** LOW (insufficient scope)

---

### F-B-6-3-U2 — Ban/freeze flows (T0-2) audit trail completeness unclear

**Scope claim:** "Ban/freeze flows (T0-2)"

**Finding:** Ban endpoint (`/users/[id]/ban/route.js`) is fully audited (line 73–79: `recordAdminAction`). No freeze endpoint found in scope (`/api/admin/billing/freeze` exists but is billing-specific, not user-freeze).

If "freeze" means suspending account access:
- May be conflated with "ban" 
- May be a Supabase Auth state (not in these tables)

**Suggested resolution:** Clarify whether freeze = ban, or if there's a separate freeze RPC/column.

**Confidence:** LOW (terminology ambiguity)

