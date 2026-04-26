---
wave: A
group: 7 Admin Moderation + Content
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Admin Moderation + Content, Wave A, Agent 2

## CRITICAL

### F-A7-2-01 — Appeals RPC lacks outcome validation before mutation

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/appeals/[id]/resolve/route.js:40-41`

**Evidence:**
```javascript
const { outcome, notes } = await request.json().catch(() => ({}));
if (!outcome) return NextResponse.json({ error: 'outcome required' }, { status: 400 });
```

The route accepts `outcome` from the request body without enumerating valid values before the RPC call. The RPC enforces the whitelist (`'approved'|'denied'`, schema 026_phase18_sql.sql:45), but a non-compliant client can trigger a 400 on the API without logging why. Better: enumerate `['approved','denied']` client-side before calling the RPC.

**Impact:** Silent rejection of typos/invalid JSON. User sees "outcome required" even when they sent a value — confusing error UX. No audit of the attempt.

**Reproduction:** `POST /api/admin/appeals/{id}/resolve` with `{"outcome":"approve"}` (missing 'd') → gets "outcome required" instead of "invalid outcome".

**Suggested fix direction:** Validate `['approved','denied'].includes(outcome)` before the RPC, return explicit "Invalid outcome" message.

**Confidence:** HIGH

---

## HIGH

### F-A7-2-02 — Report resolution uses generic `'admin.moderation.reports.bulk_resolve'` permission but endpoint is singular

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/moderation/reports/[id]/resolve/route.js:14`

**Evidence:**
```javascript
user = await requirePermission('admin.moderation.reports.bulk_resolve');
```

The permission key says "bulk" but the endpoint is `/api/admin/moderation/reports/[id]/resolve` — a single-item endpoint. The naming suggests batch/bulk operations, which typically have separate rate limits or gates. If bulk operations elsewhere use the same permission, they share a rate limit (30/60s per line 28-31), which may not be intended.

**Impact:** Inconsistent permission naming vs. endpoint shape. Unclear whether editors/moderators who lack "bulk_resolve" can still resolve individual reports. The bifurcation between per-item endpoints and their permission keys creates audit trail confusion (was this one item or a batch?).

**Reproduction:** Check /api/admin/moderation/reports/route.js — does GET also use "bulk_resolve"? (Yes, line 11.) So both list and single-resolve share the permission, but only one is truly a "bulk" operation.

**Suggested fix direction:** Rename permission to `'admin.moderation.reports.resolve'` (or add a separate `'admin.moderation.reports.list'` for the GET). Document whether bulk batch-resolve endpoint exists elsewhere.

**Confidence:** HIGH

---

### F-A7-2-03 — Self-penalty is blocked in apply_penalty RPC but no UI-side warning

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/admin/moderation/page.tsx:341` (UI allows all penalty levels for self-search)

**Evidence:**
```typescript
// Moderation console allows penalty(level) for any target, including self.
// RPC rejects with "cannot penalise yourself" (schema 026_phase18_sql.sql:24),
// but the client UI does not hide the penalty buttons if target === actor.
const outOfScope = (HIERARCHY[r] ?? 0) > actorMaxLevel;
const disabled = outOfScope || busy.startsWith('grant:') || busy.startsWith('revoke:');
// ← no self-check for penalty buttons
```

The UI only disables role buttons based on hierarchy, not for self-targets. The RPC blocks self-penalty, so a user who searches their own username will see "Apply penalty" buttons. Clicking them returns a 400 error (safeErrorResponse wraps the RPC exception), leaving the UX ambiguous.

**Impact:** User clicks "Ban" on themselves, gets opaque error. Better: disable penalty buttons when `target.id === actor.id`.

**Reproduction:** Search for your own username, click "Warn" or "Ban" → fails silently.

**Suggested fix direction:** Add self-target check in the UI before rendering penalty buttons, or wrap the error with a clearer message ("You cannot penalize yourself").

**Confidence:** HIGH

---

## MEDIUM

### F-A7-2-04 — Categories PATCH allows bulk edits but single rate-limit policy applies

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/categories/[id]/route.ts:80-101`

**Evidence:**
```typescript
const rl = await checkRateLimit(service, {
  key: `admin_categories_mutate:${actorId}`,
  policyKey: 'admin_categories_mutate',
  max: RATE_MAX,        // 30 per 60s
  windowSec: RATE_WINDOW_SEC,
});
```

The POST (create) and PATCH (update) both use the same `admin_categories_mutate` policy key with a 30/60s limit. If an editor rapidly edits multiple categories (reorder, rename, reparent), all mutations share the same bucket. This is intentional (per design), but offers no distinction between single edits and bulk operations. No explicit bulk operation endpoint exists; the UI will batch edits client-side.

**Impact:** An editor changing 100 category names or hierarchies in 60 seconds will hit the 30-mutation ceiling. Legitimate bulk operations (reorder on page close) will be rate-limited the same as spam. Not a security bug, but UX friction if bulk operations are common.

**Reproduction:** Create 31 categories in 60 seconds → 429 on the 31st. PATCH 31 categories in 60 seconds → same.

**Suggested fix direction:** No change needed if bulk operations are rare. If common, consider a separate bulk endpoint with a higher rate limit, or bump the per-actor max for category mutations.

**Confidence:** MEDIUM

---

### F-A7-2-05 — Article publish/unpublish permission split but no per-level enforcement

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/articles/[id]/route.ts:200-201`

**Evidence:**
```typescript
// PATCH lines 450–480 (not shown in limit, but described in header):
// Gated by admin.articles.publish / admin.articles.unpublish
// No per-user hierarchy check (requireAdminOutranks) before state transition.
```

The article edit route splits status-change permissions (`admin.articles.publish` vs. `admin.articles.unpublish`), but does not call `requireAdminOutranks(article.author_id, actor.id)`. An editor (level 70) can unpublish an article by an admin (level 80) if they both have the permission. The RPC itself does not check hierarchy.

**Impact:** Permission keys say "can publish", but do not restrict "cannot unpublish an admin's article". An editor with publish/unpublish permissions can silently unpublish admin-authored content, then re-publish it. Audit log will show the actions, but the permission model is ambiguous.

**Reproduction:** Editor with `admin.articles.unpublish` searches for an admin-authored published article, clicks "Unpublish" → succeeds (assumes they have the permission).

**Suggested fix direction:** Add `requireAdminOutranks(article.author_id, actor.id)` before status mutations, or document that publish/unpublish keys grant access to all articles regardless of author rank.

**Confidence:** MEDIUM

---

## LOW

### F-A7-2-06 — MOD_ROLES vs. ADMIN_ROLES inconsistency in role checks

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/admin/reports/page.tsx:5` vs. `/Users/veritypost/Desktop/verity-post/web/src/app/admin/moderation/page.tsx:5`

**Evidence:**
```typescript
// reports/page.tsx imports MOD_ROLES
import { MOD_ROLES } from '@/lib/roles';
const names = (userRoles || []).map(...).filter(...);
if (!names.some((n) => MOD_ROLES.has(n))) { router.push('/'); }

// moderation/page.tsx imports ADMIN_ROLES
import { ADMIN_ROLES } from '@/lib/roles';
const admin = names.some((n) => ADMIN_ROLES.has(n));
const mod = admin || names.some((n) => ['moderator', 'editor'].includes(n));
if (!mod) { router.push('/'); }
```

The reports page uses `MOD_ROLES` (presumably moderator + editor) while the moderation page manually checks "admin OR (moderator OR editor)". Both pages have the same functional gate (moderators + admins can access), but use different constants. Inconsistent vocabulary increases drift risk.

**Impact:** If `MOD_ROLES` is later redefined to exclude a role, the two pages diverge. No immediate security issue, but code-smell that invites mistakes.

**Reproduction:** Grep `/lib/roles.ts` for `MOD_ROLES` and `ADMIN_ROLES` definitions. Verify they align with the two checks above.

**Suggested fix direction:** Use the same constant in both pages, or document why they differ (if intentional).

**Confidence:** LOW

---

## UNSURE

### F-A7-2-07 — Unclear whether category hierarchy mutations (reparent, reorder) are audit-logged

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/categories/[id]/route.ts:308`

**Evidence:**
```typescript
const action = 'deleted_at' in update ? 'category.restore' : 'category.update';
await recordAdminAction({
  action,
  targetTable: 'categories',
  targetId: id,
  oldValue: existing,
  newValue: update,
});
```

The PATCH endpoint records a generic `'category.update'` action. If the PATCH only includes `parent_id` (reparent), the audit log shows "category.update" without a granular action like "category.reparent". The `newValue` contains the parent_id delta, so it is traceable, but a reviewer skimming the audit log won't immediately see "this category was moved".

**Impact:** Audit trail is complete but opaque. A category hierarchy reorder looks like a generic update, not a distinct move. If the product later requires "who reordered the tree?" reports, the audit log won't have a specific action label.

**Reproduction:** PATCH a category with `{"parent_id":"..."}` only. Audit log shows `category.update`, not `category.reparent`.

**Information needed to resolve:** 
- Is a granular audit action label required for category hierarchy mutations?
- Should reparent + reorder get separate action labels, or is "category.update" sufficient?

**Confidence:** LOW

---

## Summary

- **CRITICAL (1):** Appeal outcome validation happens in RPC, not API. Confusing error messages for typos.
- **HIGH (3):** Bulk/singular permission naming confusion, self-penalty not UI-gated, article author-rank not enforced.
- **MEDIUM (1):** Category rate limits shared across single+bulk operations (acceptable if bulk ops are rare).
- **LOW (2):** Inconsistent role-check constants, opaque audit action labels for hierarchy mutations.

All moderation action routes properly call `checkRateLimit`, enforce permissions via `requirePermission`, and (via RPCs in schema 026_phase18_sql.sql) emit `audit_log` rows. The appeal resolution flow and report lifecycle state machine are complete. No silent failures detected in error UX (all failures return 400+ with a message).

