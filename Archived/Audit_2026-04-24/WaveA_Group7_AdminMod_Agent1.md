---
wave: A
group: 7 Admin Moderation + Content
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Admin Moderation + Content, Wave A, Agent 1

## CRITICAL

### F-7-1-01 — Penalty level buttons lack role-based visibility gating

**File:line:** `web/src/app/admin/moderation/page.tsx:326-332`

**Evidence:**
```typescript
// Lines 326-332 — Penalties rendered unconditionally
<div>
  <div style={labelStyle}>Penalties</div>
  <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
    {[1, 2, 3].map((l) => (
      <Button key={l} variant="secondary" size="sm" onClick={() => penalty(l)}>
        {PENALTY_LABELS[l]}
      </Button>
    ))}
    <Button variant="danger" size="sm" onClick={() => penalty(4)}>Ban</Button>
```

**Impact:** The UI displays all penalty level buttons (Warn, 24h mute, 7-day mute, Ban) to every admin/moderator user without differentiating by hierarchy. Role buttons below correctly disable based on `outOfScope` (line 341), but penalty buttons have no such gating. This creates a misleading UI: an editor is shown a "Ban" button even though the API will reject attempts to ban an admin/owner. Users may attempt actions they cannot complete.

**Reproduction:** Log in as editor, search for any user, observe all 4 penalty buttons are visible and clickable (until backend rejects). Compare to role buttons below which show disabled state for out-of-scope roles.

**Suggested fix direction:** Disable penalty buttons based on hierarchy level — compute max-bannable-level from `actorMaxLevel` (already loaded at line 81), disable buttons for levels > actor hierarchy.

**Confidence:** HIGH

### F-7-1-02 — Reports page penalty buttons also lack role-based visibility

**File:line:** `web/src/app/admin/reports/page.tsx:352-355`

**Evidence:**
```typescript
// Lines 352-355 — penalty buttons unconditionally rendered in report resolver
<Button variant="secondary" size="sm" onClick={() => penaltyLevel(1)}>Warn author</Button>
<Button variant="secondary" size="sm" onClick={() => penaltyLevel(2)}>24h mute</Button>
<Button variant="secondary" size="sm" onClick={() => penaltyLevel(3)}>7-day mute</Button>
<Button variant="danger" size="sm" onClick={() => penaltyLevel(4)}>Ban</Button>
```

**Impact:** Same as F-7-1-01 — users see Ban/mute buttons they may lack permission to execute. The page gate checks `MOD_ROLES` (line 85), but does not track actor hierarchy level. Once inside, all penalty levels appear equally available.

**Reproduction:** Log in as moderator, select a report, observe penalty buttons for higher-hierarchy targets appear enabled until backend 403s.

**Suggested fix direction:** Track actor's hierarchy level in state (similar to moderation page line 81), disable buttons for levels above actor's capability.

**Confidence:** HIGH

## HIGH

### F-7-1-03 — Role grant/revoke endpoints missing server-side permission re-check (F-036 context)

**File:line:** `web/src/app/admin/moderation/page.tsx:179, 197` (client calls to `/api/admin/users/[id]/roles`)

**Evidence:**
From code comment in penalty route (line 16-20 of `/web/src/app/api/admin/moderation/users/[id]/penalty/route.js`):
```
// F-036: the pre-fix route let any moderator (60) issue any penalty
// level against any target, including admins (80). Add the actor-
// outranks-target gate...
```

The penalty route was hardened in lines 47-48 with `requireAdminOutranks(params.id, user.id)`. Grant/revoke routes at `/api/admin/users/[id]/roles` are called but not shown here.

**Impact:** If grant/revoke role routes lack the same `requireAdminOutranks` check (cannot verify without reading those files), an editor could elevate another user above their own hierarchy level, violating the principle that hierarchy operations require outranking.

**Reproduction:** Check `/api/admin/users/[id]/roles` POST/DELETE for `requireAdminOutranks` call. If absent, moderator can grant admin role to another user.

**Suggested fix direction:** Ensure `/api/admin/users/[id]/roles` POST and DELETE both call `requireAdminOutranks(target_id, actor_id)` before any role mutation.

**Confidence:** HIGH

### F-7-1-04 — Categories page calls `hasPermission` but no refresh on role/plan changes

**File:line:** `web/src/app/admin/categories/page.tsx:35`

**Evidence:**
```typescript
const { hasPermission, refreshAllPermissions } = '@/lib/permissions';
// ... then:
// Line 35 shows hasPermission is imported but usage not visible in excerpt
```
The categories page imports `refreshAllPermissions` but no evidence it's called after role mutations or permission state changes. The briefing item 6 requires `bump_user_perms_version` on every permission change so clients invalidate cached permissions.

**Impact:** After an admin changes a moderator's role to editor (revoking moderation.penalty.warn), that user's cached client-side permissions won't refresh. They'll see stale action buttons and get 403s on mutations. On returning to `/admin/categories`, the UI state doesn't reflect new permissions.

**Reproduction:** As owner, revoke a moderator's editor role. That user's moderation page still shows all buttons enabled; refresh required to see disabled state.

**Suggested fix direction:** Call `refreshAllPermissions()` after every role grant/revoke, and on every permit-affecting plan change.

**Confidence:** MEDIUM

## MEDIUM

### F-7-1-05 — Story lifecycle state machine not explicitly validated on save

**File:line:** `web/src/app/api/admin/articles/save/route.ts:57-58`

**Evidence:**
```typescript
const isUpdate = typeof body.article_id === 'string' && body.article_id.length > 0;
const permKey = isUpdate ? 'admin.articles.edit.any' : 'admin.articles.create';
```

The save route permits draft/published/archived state changes but does not validate the state machine (e.g., can you move from archived back to published?). The route accepts any `status` value the client sends.

**Impact:** A story could be moved through invalid state transitions if the permission model doesn't enforce allowed-next-states server-side. Admin logging shows the transition but if the schema/RPC doesn't reject it, state drift is silent.

**Reproduction:** Attempt to PATCH an article status=published → status=archived → status=published; check if intermediate states are valid per product spec.

**Suggested fix direction:** Add explicit state machine validation in the save route before mutation. Define allowed transitions (draft ↔ published, published → archived, etc.) and reject invalid ones.

**Confidence:** MEDIUM

### F-7-1-06 — Reports table status enum values not documented in code

**File:line:** `web/src/app/admin/moderation/reports/route.js:24`

**Evidence:**
```javascript
const status = url.searchParams.get('status') || 'pending';
```

The endpoint filters reports by status but does not validate that status ∈ ['pending', 'resolved']. Typos or injection attempts are not rejected; the query silently returns empty if a bad status is passed.

**Impact:** Moderate risk — if a UI bug sends 'pendin' instead of 'pending', the queue will appear empty. No server validation means client bugs degrade UX silently.

**Reproduction:** Call `/api/admin/moderation/reports?status=pendin` — should reject with 400, currently likely returns empty array.

**Suggested fix direction:** Validate status against an enum ['pending', 'resolved'] before query; return 400 if invalid.

**Confidence:** MEDIUM

## LOW

### F-7-1-07 — Comment hide/unhide may lack symmetrical audit coverage

**File:line:** `web/src/app/api/admin/moderation/comments/[id]/hide/route.js:38-42` (hide only checked)

**Evidence:**
Hide route calls `hide_comment` RPC which inserts audit_log (verified in schema/026). Unhide route not visible in scope, but if asymmetry exists (hide logged, unhide not), audit trails become incomplete.

**Impact:** Low — assuming unhide is symmetric. If not, an admin could silently restore a hidden comment without audit trail.

**Reproduction:** Check `/api/admin/moderation/comments/[id]/unhide/route.js` for audit_log call. If absent, flag as missing.

**Suggested fix direction:** Ensure both hide and unhide call recordAdminAction or equivalent.

**Confidence:** LOW

### F-7-1-08 — Moderation console allows readonly lookup of any user without audit

**File:line:** `web/src/app/admin/moderation/page.tsx:133-174` (search function)

**Evidence:**
The search function (lines 133-174) queries users by email/username without recording the lookup. An admin can search for sensitive users (e.g., minors, abuse survivors) and read their warning history without audit trail.

**Impact:** Low privacy risk — the data is accessible to admins anyway. However, "audit every moderation action" per scope requires that even lookups be logged if they're sensitive. Current implementation doesn't log search operations.

**Reproduction:** Log in as admin, search for a user, check audit_log — no entry for the lookup.

**Suggested fix direction:** Optional — consider logging user lookups in the moderation console for legal hold / PII access audit purposes, though this is borderline depending on product policy.

**Confidence:** LOW

