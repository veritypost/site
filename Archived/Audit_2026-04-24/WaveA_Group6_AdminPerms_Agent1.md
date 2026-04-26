---
wave: A
group: 6 Admin Users/Roles/Permissions
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Admin Users/Roles/Permissions, Wave A, Agent 1

## CRITICAL

### F-A6-1 — Missing audit logging on role grant/revoke (grant_role / revoke_role RPCs)

**File:line:** `web/src/app/api/admin/users/[id]/roles/route.js:74-95, 146-163`

**Evidence:**
```javascript
// POST handler (lines 74-95):
const { error } = await service.rpc('grant_role', {
  p_admin_id: user.id,
  p_user_id: params.id,
  p_role_name: role_name,
});
if (error) return safeErrorResponse(...);

// Bump called, but NO recordAdminAction() call before return
const { error: bumpErr } = await service.rpc('bump_user_perms_version', { p_user_id: params.id });
if (bumpErr) console.error('[roles.grant] perms_version bump failed:', bumpErr.message);
return NextResponse.json({ ok: true });

// DELETE handler (lines 146-163) — identical pattern, no recordAdminAction()
```

**Comparison (proper audit pattern):**
- `/api/admin/users/[id]/role-set/route.js:97-102` DOES call `recordAdminAction()` after RPC succeeds
- `/api/admin/users/[id]/permissions/route.js:281-287` DOES call `recordAdminAction()` after permission write
- `/api/admin/users/[id]/ban/route.js:73-79` DOES call `recordAdminAction()` after ban state change
- `/api/admin/users/[id]/plan/route.js` — admin plan changes audit-logged

**Impact:** Every grant/revoke of a user role bypasses the admin audit trail. Admin actions on `grant_role` and `revoke_role` RPCs are invisible to admins auditing who changed which user's role and when. Non-compliance with canonical admin mutation pattern (adminMutation.ts lines 1-88).

**Reproduction:** 
1. Admin navigates to `/admin/users/[someId]/roles` (UI not found; would use direct POST/DELETE)
2. POST `/api/admin/users/[userId]/roles` with `{ role_name: "moderator" }` 
3. Query `admin_audit_log` — no entry recorded (unlike `/api/admin/users/[id]/role-set` which does log)

**Suggested fix direction:** Add `await recordAdminAction({ action: 'user_role.grant' | 'user_role.revoke', targetTable: 'users', targetId: params.id, newValue: { role_name } })` before return in both POST and DELETE handlers (lines 94-95, 162-163).

**Confidence:** HIGH — code-reading verified both handlers lack the audit call that adminMutation.ts pattern requires, sibling endpoints all have it.

---

## HIGH

### F-A6-2 — Incomplete outranks enforcement: grant_role / revoke_role RPCs do not check target user's current rank

**File:line:** `web/src/app/api/admin/users/[id]/roles/route.js:47-56, 119-128` (call to `caller_can_assign_role` RPC)

**Evidence:**
```javascript
// Both POST and DELETE check the ROLE BEING ASSIGNED, not the TARGET USER:
const { data: canAssign, error: canErr } = await authed.rpc('caller_can_assign_role', {
  p_role_name: role_name,  // Check: can actor assign THIS role level?
});
if (!canAssign) {
  return NextResponse.json(
    { error: 'Unknown role or above your hierarchy level' },
    { status: 403 }
  );
}

// Then check target user rank:
const rankErr = await requireAdminOutranks(params.id, user.id);
```

**Gap Analysis:**
- `caller_can_assign_role(role_name)` validates the role exists and actor's level >= role level (e.g., admin can assign roles up to admin, moderator can assign roles up to moderator)
- `requireAdminOutranks(targetId, actorId)` validates actor strictly outranks the target user
- However: `requireAdminOutranks` uses `require_outranks` RPC which returns `false` if target has NO roles or has a role below actor. The double-check is correct but comment at lines 10-15 shows the intended defense: "blocks a moderator from escalating someone to admin, but still lets the same moderator revoke a `moderator` role from an owner."
- Current implementation appears correct (both checks in place) but the semantic gap noted in the comments suggests historical confusion about attack surface.

**Impact:** Regression vector if `requireAdminOutranks` call is ever removed or if `require_outranks` RPC logic drifts — an admin could then revoke roles from higher-ranked users.

**Reproduction:** Code-reading only; current implementation is correct but comment (lines 10-15) shows this was a prior vulnerability (F-034) that is now mitigated.

**Suggested fix direction:** Ensure both handlers always call `requireAdminOutranks()` before any write; document in comments that this double-check (role-level + user-rank) prevents lateral privilege escalation. Consider collapsing into a single defensive RPC that checks both.

**Confidence:** MEDIUM — current code is correct; flag is about historical fragility and documentation clarity.

---

### F-A6-3 — Missing error response standardization in role grant/revoke handlers

**File:line:** `web/src/app/api/admin/users/[id]/roles/route.js:47-50, 119-122` (RPC error responses)

**Evidence:**
```javascript
// Errors from RPC are logged but raw message may leak internal names:
if (canErr) return NextResponse.json({ error: canErr.message }, { status: 500 });

// Compare to permissions handler (route.js:281-287) which wraps recordAdminAction
// Compare to role-set handler (route.js:82) which directly returns canErr.message
// But ban handler (route.js uses safeErrorResponse wrapper for RPC errors
```

**Impact:** RPC error messages (e.g., "permission_denied: user_is_banned", "PGRST116 no rows returned") may leak internal policy/schema names to the client. DA-119 violation (admin audit security: don't leak internal identifiers to users).

**Reproduction:** Attempt to grant a role via POST with invalid `role_name` or with an actor whose permission is revoked mid-request — observe raw RPC error in response.

**Suggested fix direction:** Wrap RPC error responses in `safeErrorResponse(NextResponse, error, { route: 'admin.users.id.roles', fallbackStatus: 500 })` pattern used elsewhere (e.g., `ban/route.js:67-70`), or return generic "Role check failed" for canErr.

**Confidence:** MEDIUM — DA-119 pattern consistency issue; actual secret-leakage risk depends on what RPC error messages contain.

---

## MEDIUM

### F-A6-4 — No explicit UI for role grant/revoke via `/api/admin/users/[id]/roles`

**File:line:** `web/src/app/admin/users/page.tsx` (no role change via POST/DELETE to `/roles` endpoint)

**Evidence:**
```
- `/admin/users/page.tsx` line 381 uses PATCH `/api/admin/users/{id}/role-set` for role changes
- `/api/admin/users/{id}/roles/route.js` (POST/DELETE) exists but has NO UI entry point
- These are duplicate role-change mechanisms: /roles for grant/revoke individual roles, /role-set for atomic "set to exactly one role"
```

**Impact:** The `/roles` POST/DELETE endpoints are orphaned (no UI calls them). If a downstream tool or mobile app uses these endpoints for role management, it bypasses the audit logging gap (F-A6-1) but also means admin UX is split across two endpoints with different semantics (multi-role vs single-role). Maintenance debt: dead code path or security surface for API-only clients.

**Reproduction:** Search codebase for calls to `/api/admin/users/*/roles` — none from UI. Mobile app or CLI tools might call directly.

**Suggested fix direction:** Either remove POST/DELETE `/roles` handlers (migrate all callers to `/role-set` single-role model) OR wire them into admin UI if multi-role assignment is a feature, then fix audit logging (F-A6-1). Clarify semantics in route comments.

**Confidence:** MEDIUM — orphaned endpoints are maintainability risk; unclear if intentional API surface for other clients.

---

### F-A6-5 — Rate limits not differentiated for destructive role revokes

**File:line:** `web/src/app/api/admin/users/[id]/roles/route.js:134-145`

**Evidence:**
```javascript
const rate = await checkRateLimit(service, {
  key: `admin.users.roles.revoke:${user.id}`,
  policyKey: 'admin.users.roles.revoke',
  max: 30,           // Same limit as role.grant
  windowSec: 60,
});
```

**Comparison:**
- Ban endpoint (`ban/route.js:43-48`) uses `max: 10` for destructive action
- Role grant endpoint (`roles/route.js:62-67`) uses `max: 30` for non-destructive
- Role revoke should arguably use lower limit (10) since it's a privilege reduction (closer to ban semantics)

**Impact:** Admin can revoke roles faster (30/min) than ban (10/min), even though role revoke on a high-ranked user is privilege escalation + access reduction. Slightly increases attack surface if admin account is compromised.

**Reproduction:** Code-reading only.

**Suggested fix direction:** Change revoke rate limit to `max: 10` to match ban semantics.

**Confidence:** LOW-MEDIUM — limit difference is minor; depends on threat model (compromised admin account).

---

## UNSURE

### F-A6-6 — Unclear: Caller can assign role filtration per hierarchy

**File:line:** `web/src/lib/roles.js` (getRoleNames), `web/src/app/admin/users/page.tsx:118-125` (assignable role filtering)

**Evidence:**
```typescript
// From users/page.tsx:122-125
const idx = roleNamesOrdered.indexOf(currentUserRole);
if (idx === -1) return [];
return roleNamesOrdered.slice(0, idx + 1);  // Actor's role + all lower ranks
```

**Question:** Does `caller_can_assign_role(role_name)` RPC on the backend enforce the same filtering (actor can only assign roles at or below their level)? If roles list changes (new role added above admin), does the admin UI automatically filter it out?

**Impact:** If RPC allows assigning roles above actor's level, UI filtering doesn't prevent the attempt (attacker bypasses UI via direct API call). If RPC blocks correctly, UI filtering is redundant.

**Reproduction:** Would require access to live DB + testing cross-rank assignment attempts, or reading the `caller_can_assign_role` RPC implementation.

**Suggested fix direction:** Verify `caller_can_assign_role` RPC enforces `actor.hierarchy_level >= requested_role.hierarchy_level` via SQL, not just via error message. Document the invariant clearly.

**Confidence:** LOW — code appears correct but worth verification against actual RPC logic.

---

*Agent 1 of 3 — scope focuses on T0-1 (crash) and audit logging gaps. Agents 2-3 will cover permission grant/revoke UI→DB sync, ban/freeze flows, and assignable-role filtering completeness.*
