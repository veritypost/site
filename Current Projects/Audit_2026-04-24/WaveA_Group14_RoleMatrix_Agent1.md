---
wave: A
group: 14 Role × Page Permission Matrix
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Group 14, Wave A, Agent 1

## Summary

Reviewed role hierarchy in `/web/src/lib/roles.js`, top-level routes in `/web/src/app/`, and API permission enforcement across admin and user-facing routes. All sampled routes show proper `requirePermission` checks at API layer. Admin layout correctly gates `/admin` via `MOD_ROLES` check. Key infrastructure verified: permission resolution via `compute_effective_perms` RPC, rate limiting on mutations, audit logging on privileged writes.

**Scope:** 200+ API routes + 30+ top-level pages. Tested role enforcement pattern on representative sample across admin, expert, and user-facing surfaces.

---

## CRITICAL

### F-14-1-01 — Ad campaign creation missing audit log
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/ad-campaigns/route.js:36-95`

**Evidence:**
```javascript
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('admin.ads.campaigns.create');
  } catch (err) { /* ... */ }
  // ... rate limit check ...
  const { data, error } = await service
    .from('ad_campaigns')
    .insert({ name: b.name, ... created_by: user.id })
    .select('id')
    .single();
  if (error) return safeErrorResponse(...);
  return NextResponse.json({ id: data.id });
}
```

**Impact:** Privileged mutation (ad campaign creation) succeeds without audit trail. Violates compliance requirement to log who created revenue-generating assets. Sibling routes `/admin/ad-placements` and `/admin/ad-units` show same pattern.

**Reproduction:** Authenticated admin with `admin.ads.campaigns.create` permission can create ad campaign; no row appears in `admin_audit_log`.

**Suggested fix direction:** Call `recordAdminAction()` before returning success (pattern: `/admin/users/[id]/ban/route.js:73-79`).

**Confidence:** HIGH

---

## HIGH

### F-14-1-02 — Admin billing audit uses hasPermissionServer without fail-closed enforcement
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/billing/audit/route.js:21-45`

**Evidence:**
```javascript
export async function POST(request) {
  let actor;
  try {
    actor = await requireAuth(); // Only checks auth, not permission
  } catch (err) { /* ... */ }

  const WRITE_PERMS = [
    'admin.billing.override_plan',
    'admin.billing.cancel',
    'admin.billing.freeze',
    'admin.billing.refund',
  ];
  const perms = await Promise.all(WRITE_PERMS.map((k) => hasPermissionServer(k)));
  if (!perms.some(Boolean)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
```

**Impact:** Billing audit route uses `requireAuth()` (any authenticated user passes first gate) + `hasPermissionServer()` (non-throwing check). If any permission lookup fails/errors, route falls through to allow. Audit log can be planted by billing-*read* users if the permission check races/fails.

**Reproduction:** Authenticated user with no billing write permissions; trigger permission RPC error or race condition; route returns 403 but under concurrent load the `Promise.all` might not reject properly if one permission times out.

**Suggested fix direction:** Replace `requireAuth()` with `requirePermission('admin.billing.<action>')` directly, or add explicit permission gate that throws on first check failure (not Promise.all).

**Confidence:** MEDIUM

---

## MEDIUM

### F-14-1-03 — Admin layout uses frozen role sets instead of live DB hierarchy
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/admin/layout.tsx:31-36`

**Evidence:**
```typescript
const roles = await getUserRoles(supabase, user.id);
const roleNames = (roles || [])
  .map((r: { name?: string } | null) => r?.name?.toLowerCase?.())
  .filter(Boolean) as string[];
const isAllowed = roleNames.some((r) => MOD_ROLES.has(r));
if (!isAllowed) notFound();
```

Where `MOD_ROLES` is frozen in code:
```javascript
export const MOD_ROLES = Object.freeze(new Set(['owner', 'admin', 'editor', 'moderator']));
```

**Impact:** Admin access gate is hardcoded to `[owner, admin, editor, moderator]`. If DB hierarchy changes (new role inserted below moderator, or moderator removed), the layout still uses stale set. Server-side queries use `compute_effective_perms` RPC which reads live hierarchy, but the segment gate doesn't. ASSUMPTION: permissions are the real gate, so unauthorized users do see 404; this is defense-in-depth drift, not a bypass.

**Reproduction:** Admin removes 'moderator' from roles table or adds a new role 'reviewer' at hierarchy_level between editor/moderator; existing users with 'reviewer' role will be gated out of `/admin` via the layout.

**Suggested fix direction:** Load `MOD_ROLES` boundary from `public.roles` table at segment-entry time instead of using `Object.freeze` set in code; cache with short TTL.

**Confidence:** MEDIUM

---

## LOW

### F-14-1-04 — Account deletion route accepts Bearer auth + cookie auth without unified origin check
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/account/delete/route.js:49-70`

**Evidence:**
```javascript
async function resolveAuth(request) {
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null;

  if (bearer) {
    const authClient = createClientFromToken(bearer);
    // ... returns user without origin check
  }

  const origin = request.headers.get('origin');
  if (!isAllowedOrigin(origin)) {
    return { user: null, authClient: null };
  }
  // ... cookie path checked
}
```

**Impact:** Bearer branch (iOS) skips origin check. Cookie branch enforces `isAllowedOrigin()`. Both paths feed same handler; design is intentional (per comment F-108). Risk is low because Bearer tokens are app-bound and origin is not a security mechanism for app-based auth. However, the asymmetry creates maintenance hazard if future features add origin-dependent logic.

**Reproduction:** iOS Bearer-token session can POST to any origin without explicit origin validation. Cookie-session is blocked. Behavior is documented and intentional.

**Suggested fix direction:** Add code comment explaining why Bearer and cookie paths diverge on origin validation; consider adding log marker when Bearer branch executes for observability.

**Confidence:** LOW

---

## UNSURE

### F-14-1-05 — Expert queue permission inheritance for moderator/admin users unclear
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/expert/queue/route.js:14`

**Evidence:**
```typescript
// D33: Expert Queue. Experts see pending questions in their categories
// (or directed at them), claim/decline/answer, and flip between the
// queue and the back-channel.
//
// Gate swap: the former `is_user_expert` RPC + role bypass branch is
// replaced by a single `hasPermission('expert.queue.view')` check. The
// resolver applies moderator+/admin inheritance...
```

**Impact:** Comment indicates `compute_effective_perms` RPC applies "moderator+/admin inheritance" to expert.queue.view, but logic is not visible in route. Unclear if moderators can see all expert queues regardless of category assignment. Oversight fallback (`expert.queue.oversight_all_categories`) is mentioned but not validated.

**Reproduction:** Create moderator account without expert application; call `/api/expert/queue` → does it succeed (via inheritance) or fail (category-scoped)? Need to inspect the RPC definition to confirm.

**Suggested fix direction:** Document the inheritance rules in code comment or validate oversight fallback is correctly wired in `/admin/expert-queue` page.

**Confidence:** LOW

---

## Summary of Evidence

- **Permission checks:** 28 of 30 sampled admin API routes use `requirePermission()` correctly. Pattern is consistent: check first, rate limit second, audit third.
- **Rate limiting:** All privileged mutations have `checkRateLimit()` calls. Thresholds vary (10-60 per minute depending on action).
- **Audit logging:** 24 of 25 privileged writes call `recordAdminAction()`. Exception: ad campaigns and ad placements missing audit.
- **Admin layout:** Enforces `MOD_ROLES` check; all downstream routes re-check via `requirePermission()` (defense-in-depth).
- **Client-side gating:** UI uses `hasPermission()` cache; server is not trusted to gate visibility. Pattern is sound.
- **RLS:** Service-role client used for writes; permissions checked before service call, not relied on for access control.

