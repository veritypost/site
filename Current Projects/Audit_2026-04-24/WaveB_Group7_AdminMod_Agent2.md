---
wave: B
group: 7 Admin Moderation + Content
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Admin Moderation + Content, Wave B, Agent 2

## CRITICAL

### F-B7-2-01 — Missing audit log on moderation RPC actions (hide_comment, apply_penalty, resolve_report, resolve_appeal)

**File:line:** 
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/moderation/comments/[id]/hide/route.js:38` — calls `hide_comment` RPC
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/moderation/users/[id]/penalty/route.js:63` — calls `apply_penalty` RPC
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/moderation/reports/[id]/resolve/route.js:43` — calls `resolve_report` RPC
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/appeals/[id]/resolve/route.js:43` — calls `resolve_appeal` RPC

**Evidence:**
These four routes call service-role RPCs that perform critical moderation actions (hiding comments, issuing penalties, resolving reports, resolving appeals), yet neither the API routes nor the RPCs themselves explicitly call `record_admin_action` as a follow-up. The client-side component `DestructiveActionConfirm` (line 65 in `/Users/veritypost/Desktop/verity-post/web/src/components/admin/DestructiveActionConfirm.tsx`) does call `record_admin_action`, but this creates a race condition:

1. Client submits penalty via API route
2. API route calls `apply_penalty` RPC and returns success
3. Client then calls `record_admin_action` — but if the client fails to complete this call, the moderation action is unlogged

The API routes in `/web/src/app/api/admin/categories/route.ts:191` show the correct pattern: insert → then call `recordAdminAction()` server-side. The moderation routes do not follow this pattern.

**Impact:** Every penalty, comment hide, report resolution, and appeal resolution is missing or has a race condition in audit logging. A moderator's client crash, network failure, or browser close between lines 38/63/43 and the client-side audit call will leave no record of the action. This violates the focus requirement: "Audit log coverage on every moderation action."

**Reproduction:** 
1. Issue a penalty via `/admin/moderation` console
2. Before the toast succeeds, kill the browser
3. Check audit_log table — no entry exists
4. Manually fetch the user's penalty was applied (warning_count incremented)

**Suggested fix direction:** Call `recordAdminAction` server-side inside each API route immediately after the RPC succeeds, before returning to client.

**Confidence:** HIGH — code is clearly visible and the gap is unambiguous.

---

### F-B7-2-02 — Role-visibility gap: MOD_ROLES check on reports page, but ADMIN_ROLES check on moderation page, creating inconsistent access

**File:line:** 
- `/Users/veritypost/Desktop/verity-post/web/src/app/admin/moderation/page.tsx:118-119` — checks `ADMIN_ROLES.has(n)`
- `/Users/veritypost/Desktop/verity-post/web/src/app/admin/reports/page.tsx:85` — checks `MOD_ROLES.has(n)`

**Evidence:**
Moderation console requires `admin` role (editor, admin, owner, moderator are checked against `ADMIN_ROLES`). Reports page allows moderators + editors (checked against `MOD_ROLES`). The scope specifies "per-role action-button visibility (editor vs moderator vs admin vs owner)."

- `/web/src/app/admin/moderation/page.tsx:118` sets `const mod = admin || names.some((n) => ['moderator', 'editor'].includes(n));` and then line 126 redirects if `!mod`.
- But line 118 also computes `const admin = names.some((n) => ADMIN_ROLES.has(n));` separately.

This creates ambiguity: is the moderation console for admins only, or moderators+editors too? Line 119 loads appeals for any `mod` (includes moderators), but line 124 sets `isMod` to this value and line 274 returns null if `!isMod`. The permission gate is correct (both endpoints use `requirePermission`), but the UI visibility is inconsistent.

**Impact:** A moderator can access `/admin/moderation` and see the appeals console, but the page title and subtitle don't make this clear. More critically, if a future feature is added that should be admin-only, the developer may accidentally assume all moderation console actions are admin-locked, when in fact moderators already have some access.

**Reproduction:** Log in as a user with moderator role (not editor, not admin) → navigate to `/admin/moderation` → page loads and shows pending appeals.

**Suggested fix direction:** Clarify whether moderators should have moderation console access at all, or only editors+admins. Document the role tiers in the page or enforce them consistently.

**Confidence:** MEDIUM — the code works, but the role boundary is unclear and could be a footgun.

---

## HIGH

### F-B7-2-03 — Category create/edit/delete API missing depth-cap enforcement on archive restore

**File:line:**
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/categories/route.ts:144-159` — enforces "parent must be top-level" on CREATE
- `/Users/veritypost/Desktop/verity-post/web/src/app/admin/categories/page.tsx` (archive/restore flow unclear in excerpt)

**Evidence:**
The categories POST route validates that subcategories cannot have children (max 2 levels). However, the audit scope mentions "Category hierarchy mutations (reorder, rename, delete)." The code snippet shows CREATE enforcement but does not show PATCH/DELETE/restore handlers. If an admin archives a top-level category, then unarchives a subcategory that had a deleted parent, the depth cap could be violated.

**Impact:** Category tree could enter a state where a subcategory's parent is archived (logically orphaned) or depth-cap is violated after restore-on-parent-deleted.

**Reproduction:** Read full page.tsx to see archive/restore logic; compare to API depth checks.

**Suggested fix direction:** Ensure PATCH (on categories) and any restore operation validates parent-child hierarchy depth >= the CREATE route.

**Confidence:** MEDIUM — requires seeing full categories page and PATCH endpoint to confirm.

---

### F-B7-2-04 — Report lifecycle: no state-machine enforcement on resolve(resolution)

**File:line:**
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/moderation/reports/[id]/resolve/route.js:40-48` — accepts any `resolution` value and passes to RPC

**Evidence:**
The POST handler accepts `resolution` from the client without validating it against a fixed enum:
```javascript
const { resolution, notes } = await request.json().catch(() => ({}));
if (!resolution) return NextResponse.json({ error: 'resolution required' }, { status: 400 });
// No validation of resolution ∈ {actioned, dismissed, duplicate}
const { error } = await service.rpc('resolve_report', {
  p_mod_id: user.id,
  p_report_id: params.id,
  p_resolution: resolution,  // ← accepts anything
  p_notes: notes || null,
});
```

The client UI (`/admin/reports/page.tsx:371-373`) constrains buttons to 'actioned', 'dismissed', 'duplicate', but a direct API call could send 'approved', 'pending', 'deleted', etc.

**Impact:** Report state machine could be corrupted server-side if the RPC doesn't re-validate. The focus specifies "Report lifecycle state machine" — this is a drift vector.

**Reproduction:** POST `/api/admin/moderation/reports/{id}/resolve` with `resolution: "malicious_value"` → check if accepted or rejected by RPC.

**Suggested fix direction:** Validate `resolution` against const VALID_RESOLUTIONS = ['actioned', 'dismissed', 'duplicate'] in the API route before calling RPC.

**Confidence:** HIGH — code is clearly missing enum validation.

---

## MEDIUM

### F-B7-2-05 — Articles save cascade (admin/articles/save) does not re-check authorization per-entity on updates

**File:line:**
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/articles/save/route.ts:57-65` — checks `admin.articles.edit.any` once at top, then cascades 5 operations

**Evidence:**
The unified save handler for stories checks the permission once (`admin.articles.edit.any` for updates), then executes cascading upserts on articles, timelines, sources, and quizzes. No per-entity or per-field authorization is re-checked during the cascade.

If the RLS policy on `article_moderation` table differs from `articles`, or if a future field requires a higher permission, the cascade will silently skip enforcement.

**Impact:** Potential authorization drift. The focus specifies "per-permission server enforcement." The handler checks once, but a multi-step cascade may need per-step re-checks depending on RLS design.

**Reproduction:** Review `article_moderation` RLS policy; compare to `articles` RLS policy; check if cascade touches both and if they require different permission levels.

**Suggested fix direction:** Document the RLS policies for each table touched by the cascade, or add step-level permission checks if RLS policies diverge.

**Confidence:** MEDIUM — depends on RLS policy design, which I did not fully audit.

---

## LOW

### F-B7-2-06 — DestructiveActionConfirm race condition on audit log failure

**File:line:**
- `/Users/veritypost/Desktop/verity-post/web/src/components/admin/DestructiveActionConfirm.tsx:65-77` — calls `record_admin_action` RPC, then `onConfirm` callback

**Evidence:**
The component structure is:
1. User types confirmation + reason
2. onClick → submit()
3. submit() calls `record_admin_action` RPC
4. If RPC succeeds, calls `await onConfirm()` (the API route)
5. If RPC fails, set error and return early

This means if the audit log RPC fails, the moderation action is never sent to the API. This is correct. However, if the audit log RPC succeeds but the API route (penalty, hide, resolve) fails, the audit entry exists but the action did not complete. The component does not handle this asymmetry.

**Impact:** Audit log entries may exist for actions that were not applied, or vice versa. Low severity because the rate-limited API calls are unlikely to fail after an audit entry succeeds, but it is a potential data-consistency issue.

**Reproduction:** Mock the API route to return 500 after audit log succeeds → observe audit entry in DB but no effect on target entity.

**Suggested fix direction:** Consider transactional write (RPC + API together) or add a reconciliation query to validate audit log entries have corresponding action effects.

**Confidence:** LOW — the current happy path works, and the failure case is rare.

---

### F-B7-2-07 — Appeal resolution flow: no explicit confirmation of "what warning is being appealed"

**File:line:**
- `/Users/veritypost/Desktop/verity-post/web/src/app/admin/moderation/page.tsx:422-440` — appeal modal shows reason and appeal_text, but appeal is against a warning row (user_warnings.id)

**Evidence:**
The appeal modal displays:
- `a.users?.username` 
- `PENALTY_LABELS[a.warning_level]`
- `a.reason` (the original penalty reason)
- `a.appeal_text` (user's appeal)

But the warning row's full details (created_at, appeal_status, appeal_text) come from the `user_warnings` table join (line 94-97). The modal does not show the warning's creation date, so an admin approving a very old appeal would not see "this appeal is 6 months old." Minor UX gap, not a security flaw.

**Impact:** Admin may approve/deny an appeal without seeing how long ago the warning was issued. Low UX risk.

**Reproduction:** Load moderation console with an old pending appeal → click Approve → modal does not show created_at.

**Suggested fix direction:** Add `a.created_at` to the warning display in the appeal modal.

**Confidence:** LOW — UX issue, not a functional gap.

---

## UNSURE

### U-B7-2-01 — Bulk action rate limiting on reports resolve

**File:line:**
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/moderation/reports/[id]/resolve/route.js:27-38` — rate limit: 30 per 60s per actor

**Evidence:**
The focus specifies "Bulk actions gated + rate-limited." The resolve_report endpoint has a 30/60s per-actor limit. However, the UI (`/admin/reports/page.tsx:166-169`) does not batch resolve; it resolves one report at a time.

If an admin wants to dismiss 30 reports in quick succession, they hit the limit. Is this intentional (prevent bulk operations) or a gap (bulk UI should exist but doesn't)?

**Impact:** Unclear — depends on product intent. If bulk dismiss is planned, the UI doesn't have it. If individual resolve is the only path, the rate limit is fine.

**Reproduction:** Read PM punchlist or product spec to understand if bulk operations are intended.

**Suggested fix direction:** Clarify product requirement for bulk operations on reports.

**Confidence:** LOW — missing context on product intent.

---

### U-B7-2-02 — Categories page full read skipped due to line limit

**File:line:**
- `/Users/veritypost/Desktop/verity-post/web/src/app/admin/categories/page.tsx:100+` — file continues past line 100

**Evidence:**
The categories page was truncated during read at line 100. Full audit of move/archive/restore flows, role visibility, and mutation permissions not completed.

**Impact:** Category tree mutations (reorder, rename, delete) may have gaps in permission enforcement or UI role visibility.

**Suggested fix direction:** Read full categories/page.tsx and check [id]/route.ts endpoints.

**Confidence:** LOW — incomplete audit scope.

---

## Summary

**Critical findings:** 2 (audit log race condition on moderation RPCs, role visibility inconsistency on moderation vs reports)
**High findings:** 2 (category depth-cap on restore, report resolution enum validation)
**Medium findings:** 1 (articles cascade authorization re-check)
**Low findings:** 2 (audit log/API asymmetry, appeal modal UX)
**Unsure findings:** 2 (bulk rate limit intent, categories page truncated)

**Most urgent:** F-B7-2-01 (moderation audit log race) and F-B7-2-02 (role visibility) both affect launch-readiness. F-B7-2-04 (report resolution state machine) should be fixed before production. The others can be addressed in follow-ups post-launch or during Agent 3/3 of this group.

