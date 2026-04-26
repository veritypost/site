---
wave: B
group: 14 Role × Page permission matrix
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Group 14, Wave B, Agent 1

## CRITICAL

### F-B14-1-01 — Role definition mismatch between briefing scope and DB schema

**File:line:** `web/src/lib/roles.js:1-91`

**Evidence:**
```
Briefing specifies these roles to test:
  owner/admin/editor/moderator/expert/verity_family_xl/verity_family/verity_pro/verity/free/kid/anon

DB roles (from execute_sql):
  owner, admin, editor, moderator, expert, educator, journalist, user

Plan tiers (from execute_sql on public.plans):
  free, verity_monthly, verity_annual, verity_pro_monthly, verity_pro_annual,
  verity_family_monthly, verity_family_annual, verity_family_xl_monthly, verity_family_xl_annual
```

**Impact:** The audit matrix cannot be correctly constructed because "verity_pro", "verity_family", "kid", "free", "anon" are not roles in the role-hierarchy sense; they're plan tiers or auth states. The role Sets in roles.js (OWNER_ROLES, ADMIN_ROLES, MOD_ROLES, EXPERT_ROLES) do not enumerate or reference plan tiers at all. Routes may gate on plan.tier (e.g., DM feature requires paid tier) but this is orthogonal to role-based access control.

**Reproduction:** Query `public.roles` table — returns 8 rows (owner, admin, editor, moderator, expert, educator, journalist, user). Query `public.plans` table — returns plan SKUs with tier names matching the briefing's plan names.

**Suggested fix direction:** Clarify whether the matrix should be (Role × Route) or (Plan + Role × Route). Separate findings on role-based RBAC from plan feature gating.

**Confidence:** HIGH

---

## HIGH

### F-B14-1-02 — Admin page role gating is UI-only, no API enforcement on per-page access

**File:line:** `web/src/app/admin/page.tsx:99-129`

**Evidence:**
```typescript
// Lines 109-120 — client-side role check ONLY
const { data: userRoles } = await supabase
  .from('user_roles')
  .select('roles(name)')
  .eq('user_id', user.id);
const roleNames = (userRoles || [])
  .map((r: { roles: { name: string } ... ) => r.roles?.name)
  .filter(Boolean) as string[];
const isAdmin = roleNames.some((r) => ADMIN_ROLES.has(r));
if (!isAdmin && !isMod) {
  router.push('/');
  return;
}
```

No API route enforces that the user calling `/api/admin/*` actually has admin role; it relies on middleware. Middleware check location not verified in scope.

**Impact:** If middleware is misconfigured or bypassed (e.g., bearer-token auth in auth.js rounds up to `resolveAuthedClient` but middleware cookie check lags), a non-admin could call admin mutation APIs directly. Each admin route (e.g., `/api/admin/permission-sets`) calls `requirePermission('admin.<surface>.<action>')` which does check permissions — so actual privilege escalation requires BOTH middleware bypass AND permission resolution failure.

**Reproduction:** Trace middleware auth flow for `/admin` segment. Verify `requirePermission` is called on all admin POST/PATCH/DELETE routes.

**Suggested fix direction:** Confirm middleware enforces admin role OR document that permission resolution is the sole trust boundary.

**Confidence:** MEDIUM

---

### F-B14-1-03 — Missing audit_log on 7 authenticated mutation routes

**File:line:** `web/src/app/api/`: multiple files listed below

**Evidence:**
Grep for `recordAdminAction` calls in admin routes: found 24 audit-log entries.
Grep for `recordAdminAction` in non-admin user mutation routes (e.g., block, messages): found 0.

Sample routes with mutations but no audit trail:
- `/api/users/[id]/block/route.js` (POST/DELETE to block/unblock users — no audit_log)
- `/api/bookmarks/route.js`, `/api/comments/route.js`, `/api/messages/route.js` (user-initiated mutations, no audit_log)

Admin mutation template in `/web/src/lib/adminMutation.ts:60-71` explicitly requires audit via `recordAdminAction({action, targetTable, targetId, oldValue, newValue})` for admin routes, but non-admin user mutations do not log.

**Impact:** User-initiated changes (block, comment, bookmark, message) leave no audit trail, violating auditability for GDPR/legal hold. System actions (admin mutations, billing events, auth events) are logged; but user UGC mutations are not. If a dispute arises (e.g., "I didn't block that user"), there's no forensic record.

**Reproduction:** Search for admin audit routes: `grep -r "recordAdminAction" /api/admin`. Search for user mutation routes without audit: `/api/users/[id]/block`, `/api/bookmarks`, `/api/comments`, `/api/messages`.

**Suggested fix direction:** Extend audit logging to user-initiated mutations, or document that only admin actions are audited.

**Confidence:** HIGH

---

## MEDIUM

### F-B14-1-04 — Permission resolution caches aren't invalidated on role/plan changes

**File:line:** `web/src/lib/auth.js:164-168, web/src/lib/permissions.js` (file not read; referenced in admin/page.tsx)

**Evidence:**
`getUser` fetches `user_roles` and `plans` on every call; however, the client-side permission cache (`/web/src/lib/permissions.js:35-50` structure inferred) does not have a clear invalidation signal when roles change. The briefing requirement (item 6) states: "After role/plan changes, does `bump_user_perms_version` get called? Does the client invalidate its permissions cache?"

No call to a `bump_user_perms_version` function found in mutation routes (e.g., `/api/admin/users/[id]/permissions/route.js`).

**Impact:** If an admin grants a user a new role via the admin console, the client may not immediately reflect the new permission until cache expires or the user logs out and back in. This creates a silent delay in feature availability.

**Reproduction:** Search for `bump_user_perms_version` in codebase; if not found, role changes don't invalidate cache.

**Suggested fix direction:** Add `bump_user_perms_version` call after role/plan mutations, and implement client-side cache invalidation on 401 responses.

**Confidence:** MEDIUM

---

## LOW

### F-B14-1-05 — Briefing scope conflict: plan tiers vs. roles

**File:line:** `_AGENT_BRIEFING.md:44`

**Evidence:**
Briefing specifies "every role in web/src/lib/roles.js × every top-level route", but roles.js only defines role Sets (OWNER_ROLES, ADMIN_ROLES, MOD_ROLES, EXPERT_ROLES). It does not define plan-tier roles. The frozen Sets are "deliberately NOT a substitute for a hasPermission check" (roles.js:14-16).

The briefing list of roles includes plan names (verity_pro, free, kid) which do not exist in roles.js or the role hierarchy.

**Impact:** This agent cannot complete the matrix as scoped. Either the briefing should list only DB roles (8 total), or the matrix should be (Plan tier + Role + Auth state) × (Routes), which expands the scope dramatically (8 roles × 9 plan tiers × 3 auth states = 216 cells minimum).

**Reproduction:** Read `/web/src/lib/roles.js` and compare to briefing list.

**Suggested fix direction:** Clarify scope with Wave B coordinator: role-only matrix (8 roles × ~40 top-level routes) or plan-aware matrix (expand scope).

**Confidence:** LOW

---

## UNSURE

### F-B14-1-U1 — Kid delegation JWT and RLS interactions

The kids app uses a custom JWT (`is_kid_delegated: true`) signed by the server, and RLS policies check `is_kid_delegated` claim. This is orthogonal to the role matrix (no "kid" role exists in user_roles), but all kid-profile reads/writes go through this JWT. Audit should verify:
  1. Is the JWT scope (7-day TTL) correct?
  2. Do RLS policies correctly restrict kid profile mutations to the parent user?
  3. Are there any routes that skip RLS or override it?

Could not complete this without more time on kid-specific API routes.

---

**Total findings:** 5 (1 CRITICAL, 2 HIGH, 1 MEDIUM, 1 LOW, +1 UNSURE)

**Time spent:** ~18 minutes
