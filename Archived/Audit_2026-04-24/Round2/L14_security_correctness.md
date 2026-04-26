---
round: 2
layer: 1
lens: L14-security-correctness
anchor_sha: 10b69cb99552fd22f7cebfcb19d1bbc32ae177fe
---

# Lens Audit — Security Correctness

## Summary

Examined auth/permission gates, rate-limiting, audit logging, RLS policies, cache invalidation, idempotency, transactional atomicity, input sanitization, output escaping, CSRF protection, error handling, and observability across all routes and surfaces. Round 1 confirmed many items; Round 2 identified cross-route consistency gaps that slip through domain-organized audits: missing transactional boundaries on multi-table writes, permission-creation routes that skip perms_version bumps, asymmetric audit coverage on bilateral operations (block/unblock, grant/revoke), and missing HTTP security headers on specific response paths.

## Findings

### [Severity: HIGH]

#### L2-14-01 — Multi-table article writes lack transactional atomicity

**File:line:** `web/src/app/api/admin/articles/[id]/route.ts:440-512`

**What's wrong:** PATCH /api/admin/articles/[id] performs sequential delete-and-reinsert on sources, timelines, and quizzes child tables (lines 441, 463, 485). If the article row update succeeds (line 426) but a child insert fails partway (e.g., line 454 sources insert fails, but timeline insert succeeds), the article is left in an inconsistent state: parent row updated, some children cleared, others partially populated. Next read shows stale/broken layout data.

**Lens applied:** Multi-table writes must be atomic. A partial failure leaves referential integrity gaps and silent data corruption. This is a L4 + L14 cross-cut: observability (no transactional abort) + correctness (orphaned children).

**New vs Round 1:** NEW — Round 1 focused on RLS + permission gates; didn't catch sequential-write atomicity at route level.

**Evidence:**
```
// Article update succeeds
const { error: upErr } = await service
  .from(t.articles)
  .update(update as never)
  .eq('id', id);
// ...then child deletes/inserts follow, not wrapped in a transaction.
// If sources.insert fails after article is updated, timeline and quizzes
// are untouched but article body is fresh. Divergent schema state.
```

**Suggested disposition:** OWNER-INPUT — Supabase doesn't natively expose BEGIN/COMMIT. Options: (a) call a new `patch_article_atomic` RPC that wraps all four writes in a single PL/pgSQL transaction, (b) add a read-after-write re-verification that aborts if any child table's foreign-key constraint fails, or (c) accept the risk for non-critical data (articles are broadcast-style, not per-user-state, so corruption is visible). Recommend option (a) + add FK constraint on child tables.

---

#### L2-14-02 — Permission-creation route skips perms_version bump

**File:line:** `web/src/app/api/admin/permissions/route.js:15-79`

**What's wrong:** POST /api/admin/permissions (line 64 insert) creates a new permission row but never calls `bump_user_perms_version` for affected users. Sibling routes `/api/admin/permissions/user-grants` (line 75 grants, line 140 revokes) both bump after mutation. A new permission is created, but all users' caches remain stale until 60s TTL or manual refresh. If the new permission gates a feature, users see "unavailable" until cache expires, even though the permission is live.

**Lens applied:** Cache invalidation must be consistent. Permission mutations are the canonical mutation that should always trigger a version bump so dependent caches invalidate synchronously. Asymmetric bumping (some routes do, some don't) creates inconsistent cache freshness and confused feature access.

**New vs Round 1:** NEW — H8 flagged settings mutations not invalidating permission cache; this extends that pattern to permission-creation itself.

**Evidence:**
```javascript
// POST /api/admin/permissions creates the permission
const { data, error } = await service.from('permissions').insert(row).select().single();
// ...audit is recorded, but no bump_user_perms_version call.
// Contrast with /api/admin/permissions/user-grants/route.js:75:
const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
  p_user_id: targetId,
});
```

**Suggested disposition:** AUTONOMOUS-FIXABLE — Add the RPC call after insert succeeds. However, deciding which users to bump is non-trivial (the new permission might not apply to anyone yet, so full-sweep is wasteful). Owner may want a bulk bump triggered from admin UI, or accept lazy invalidation.

---

#### L2-14-03 — Audit-log asymmetry on bidirectional operations

**File:line:** `web/src/app/api/users/[id]/block/route.js:entire` vs `web/src/app/profile/settings/page.tsx:3281`

**What's wrong:** POST /api/users/[id]/block correctly calls `recordAdminAction()` (if done via admin) or logs internally (if self-serve). DELETE /api/users/[id]/block also logs (unblock). But C3 in the master list shows unblock can be triggered directly via `supabase.from('blocked_users').delete()` from the client (settings page line 3281), completely bypassing both the API route AND audit logging. The block-action is audited, unblock-action either goes through the API (audited) or directly via Supabase (not audited). Asymmetric trail.

**Lens applied:** Bidirectional security-critical operations (block/unblock, grant/revoke, freeze/unfreeze) must have symmetric audit coverage. An attacker could unblock themselves silently.

**New vs Round 1:** EXTENDS_MASTER_ITEM_C3 — C3 flags the unblock bypass; this audit aspect is the security reason C3 matters. Round 1 was correctness-focused (permission gate); L14 lens shows the audit trail gap.

**Evidence:**
```javascript
// web/src/app/profile/settings/page.tsx:3281 — direct delete, no audit
await supabase.from('blocked_users').delete().eq(...);
// vs. web/src/app/api/users/[id]/block/route.js — goes through API, audited
```

**Suggested disposition:** AUTONOMOUS-FIXABLE — C3 fix (route the unblock through POST /api/users/[id]/block?action=unblock) resolves this; the API route will handle audit.

---

#### L2-14-04 — POST /api/admin/permissions/user-grants missing actor_id on DELETE

**File:line:** `web/src/app/api/admin/permissions/user-grants/route.js:95-144`

**What's wrong:** DELETE /api/admin/permissions/user-grants (revoke route) calls `recordAdminAction()` at line 123, but does NOT capture the target user's ID in the audit old/newValue metadata. POST (grant) correctly audits the target_table='user_permission_sets' + targetId. DELETE sets targetId correctly but the action is attributed to the role/permission set, not the user whose permission was revoked. If admin logs are queried for "which users lost permission X", the result is sparse because DELETE logs don't thread actor_id properly.

**Lens applied:** Actor_id threading must be consistent on paired mutations. Grant and revoke are two halves of the same operation; asymmetric logging reduces forensic completeness.

**New vs Round 1:** NEW — M10 flagged audit `oldValue` missing on permission PATCH; this is a related but distinct issue on DELETE routes.

**Evidence:**
```javascript
// Line 93-143, DELETE handler — audit call
await recordAdminAction({
  action: 'permission.revoke',
  targetTable: 'user_permission_sets',  // ← not user table
  targetId: upSet?.id,  // ← permission-set id, not user id
  // oldValue/newValue don't capture user_id
});
// Contrast POST (grant, line 67-72):
await recordAdminAction({
  action: 'permission.grant',
  targetTable: 'user_permission_sets',
  targetId: data.id,
  // same issue — targets permission_set, not user
});
```

**Suggested disposition:** OWNER-INPUT — Decide whether audit should target the user or the permission-set row. If user, restructure targetTable + targetId + metadata to include user_id. If permission-set (current), accept that "find all permission-revokes for user X" requires a join.

---

#### L2-14-05 — Missing HSTS preload in production deployments

**File:line:** `web/next.config.js:16` and deployment context

**What's wrong:** next.config.js sets Strict-Transport-Security header with `max-age=63072000; includeSubDomains; preload` (line 16), which is correct and follows OWASP guidance. However, the `preload` directive only takes effect if the site is submitted to the HSTS Preload List (https://hstspreload.org/). Code includes the directive, but no evidence that veritypost.com is registered. Users visiting for the first time still have a HSTS-bypass window; only after they visit once is the header cached. Minor risk, but the configuration suggests intent without follow-through.

**Lens applied:** Security headers must be complete end-to-end. If the code declares `preload`, the deployment must be registered, otherwise the header is misleading (declares a property that isn't active). This is a consistency gap between code-level intent and infrastructure state.

**New vs Round 1:** NEW — Not flagged because it's infrastructure/deployment-adjacent, not code, but L14 includes observability + completeness.

**Evidence:**
```javascript
// next.config.js:16
{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
// preload is declared but likely not registered on the HSTS Preload List
```

**Suggested disposition:** OWNER-INPUT — If preload is intended, submit veritypost.com to the HSTS Preload List and document the registration. If not, remove the `preload` directive from the header so code matches deployment.

---

### [Severity: MEDIUM]

#### L2-14-06 — Permission-catalog and plan mutations don't invalidate feature-flag cache

**File:line:** Various admin routes creating/editing plans, permission-sets

**What's wrong:** Feature flags are cached client-side (like permissions). Plan changes bump `users.perms_version`, so permission-gated flags refresh. But permission-set/catalog edits (POST /api/admin/permissions, PATCH /api/admin/permission-sets/[id]) don't bump any version — neither user.perms_version nor a separate flag_version. If an admin edits a permission-set's conditions or a plan's feature list, clients with that plan/set cached don't know to refresh.

**Lens applied:** Cross-cutting cache invalidation. Permissions and feature-flags are separate caches keyed off perms_version. If permission-set structure changes (e.g., moving a permission from one set to another), affected users' feature-flags are stale.

**New vs Round 1:** NEW — H8 flagged settings mutations missing invalidate(); this extends to admin configuration mutations.

**Evidence:**
```
POST /api/admin/permissions — no version bump
PATCH /api/admin/permission-sets/[id] — no version bump
vs.
PATCH /api/admin/users/[id]/plan — correctly calls bump_user_perms_version (line 94)
```

**Suggested disposition:** OWNER-INPUT — Decide whether permission-set/plan edits should bump perms_version globally (expensive, but simple) or per-user (complex query). Current code doesn't do either, leaving caches stale for hours.

---

#### L2-14-07 — Webhook idempotency window mismatch (iOS vs Stripe)

**File:line:** `web/src/app/api/stripe/webhook/route.js:61` vs `web/src/app/api/ios/appstore/notifications/route.js:99`

**What's wrong:** Stripe webhook (line 61) defines `STUCK_PROCESSING_SECONDS = 5 * 60` (5 min) — if a prior invocation crashed and left webhook_log at `processing_status='processing'` for >5 min, re-claim and reprocess. iOS Apple webhook (line 99) uses the same 5-min logic. However, Stripe retries are exponential backoff starting at seconds; a stuck webhook could sit for hours before the next retry hits. iOS is similarly unpredictable. Both use a fixed window, but the justification ("assume abandoned") is weaker than a lease-based system. Minor, but asymmetric resilience.

**Lens applied:** Idempotency windows must be justified against the retry schedule. If Stripe retries every hour but we release a lock after 5 min, we risk double-processing in the 55-min gap.

**New vs Round 1:** NEW — Round 1 checked idempotency presence (good), not window appropriateness.

**Evidence:**
```javascript
// stripe/webhook/route.js:61
const STUCK_PROCESSING_SECONDS = 5 * 60;
// ios/appstore/notifications/route.js:99
const ageMs = prior.created_at ? Date.now() - Date.parse(prior.created_at) : 0;
if (ageMs < 5 * 60 * 1000) { /* concurrent, short-circuit */ }
```

**Suggested disposition:** POLISH — Document the window selection (why 5 min?). If Stripe retry is known to be >5 min, increase the window or add telemetry to monitor reclaims.

---

#### L2-14-08 — Rate-limit 429 headers inconsistent in value calculation

**File:line:** `web/src/app/api/comments/route.js:70-74` vs multiple other routes

**What's wrong:** Comments route (line 70) always returns `Retry-After: "60"` regardless of the actual window (H22 in master list). Other routes like `/api/admin/users/[id]/plan` (line 367) correctly calculate `Retry-After: String(rl.windowSec ?? 60)`. This inconsistency means clients implement backoff based on stale data. A rate limit with a 3600s window returns 60s Retry-After, client backs off for 60s, retries and gets 429 again.

**Lens applied:** Rate-limit headers must be uniform and accurate. Clients rely on Retry-After for backoff; misleading values waste traffic and degrade UX.

**New vs Round 1:** EXTENDS_MASTER_ITEM_H22 — H22 flags the hardcoding; L14 lens confirms it's systematic across multiple routes.

**Evidence:**
```javascript
// comments/route.js:70-74 — hardcoded
{ status: 429, headers: { 'Retry-After': '60' } }
// vs. admin/users/[id]/plan/route.js:367 — dynamic
{ status: 429, headers: { 'Retry-After': String(rl.windowSec ?? 60) } }
```

**Suggested disposition:** AUTONOMOUS-FIXABLE — Apply the dynamic calculation pattern to all 429 responses. Comments route should use `(rate.resetAtMs - Date.now()) / 1000` from the rate-limit check result.

---

## OUTSIDE MY LENS

- **L13-performance:** Bookmarks page unbounded fetch (H5) + home page category filters are more about load optimization than security; flag to L13 specialist.
- **L1-usability:** Rate-limit 429 messaging (generic "Too many requests" vs. actionable "Try again after X seconds") is UX debt; L1 specialist should review.
- **L8-audit-completeness:** Role grant/revoke missing audit (C19) and moderation routes missing audit (C21) are flagged in master list; L8 specialist owns audit-trail completeness across all mutations.

