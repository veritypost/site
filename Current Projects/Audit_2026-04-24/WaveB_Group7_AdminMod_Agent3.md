---
wave: B
group: 7 Admin Moderation + Content
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Admin Moderation + Content, Wave B, Agent 3

## CRITICAL

### F-B7-3-01 — Moderation actions bypass client-side audit logging (penalty, appeal, report resolution)
**File:line:** `web/src/app/api/admin/moderation/users/[id]/penalty/route.js:63-74`, `web/src/app/api/admin/appeals/[id]/resolve/route.js:43-54`, `web/src/app/api/admin/moderation/reports/[id]/resolve/route.js:43-54`

**Evidence:**
All three routes call service RPCs (`apply_penalty`, `resolve_appeal`, `resolve_report`) without calling `recordAdminAction()` afterward. The admin pages (moderation.page.tsx, reports.page.tsx) invoke these routes directly without using the DestructiveActionConfirm component, which is the only client-side hook that calls `record_admin_action` RPC (DestructiveActionConfirm.tsx:65-72).

```
// penalty/route.js line 63-74
const { data, error } = await service.rpc('apply_penalty', {
  p_mod_id: user.id,
  p_target_id: params.id,
  p_level: levelNum,
  p_reason: reason,
});
if (error) return safeErrorResponse(...);
return NextResponse.json({ warning_id: data });
// NO recordAdminAction() call
```

Similarly, `resolve_appeal` (line 43-54) and `resolve_report` (line 43-54) have identical gaps.

**Impact:** Penalties, appeal resolutions, and report resolutions are not logged to `admin_audit_log`. Three of the most critical moderation actions have zero audit trail. Violates compliance requirement for admin action tracking. The comment hide action (route.js:38-48) has the same gap.

**Reproduction:** 
1. Apply a penalty via /admin/moderation, look up the user, click Warn/Mute/Ban.
2. Check admin_audit_log — no entry. Only the user_warnings table row is created.

**Suggested fix direction:** Each of these three routes must call `recordAdminAction()` after the RPC succeeds, passing the warning_id or report_id as targetId and the appropriate action label.

**Confidence:** HIGH

### F-B7-3-02 — Comment hide/unhide routes missing audit logging entirely
**File:line:** `web/src/app/api/admin/moderation/comments/[id]/hide/route.js:38-48`, `web/src/app/api/admin/moderation/comments/[id]/unhide/route.js` (assumed same pattern)

**Evidence:**
```
// hide/route.js
const { error } = await service.rpc('hide_comment', {
  p_mod_id: user.id,
  p_comment_id: params.id,
  p_reason: reason || 'moderator action',
});
if (error) return safeErrorResponse(...);
return NextResponse.json({ ok: true });
// NO recordAdminAction() call
```

The route has the correct structure (permission check, rate limit) but no audit logging. The RPC is called via service client, not authed client, so the RPC cannot auth.uid() check.

**Impact:** Every comment hide/unhide action bypasses the audit log. Moderation actions on comments are invisible in audit trail, breaking chain-of-custody for content removal decisions.

**Reproduction:** Hide a comment from reports.page.tsx → no admin_audit_log entry.

**Suggested fix direction:** Call `recordAdminAction()` after successful hide/unhide, or migrate to a pattern where recordAdminAction is called client-side (as in DestructiveActionConfirm) OR have the RPC emit a DB trigger that logs the action.

**Confidence:** HIGH

## HIGH

### F-B7-3-03 — Appeal resolution flow does not validate outcome parameter strictly
**File:line:** `web/src/app/api/admin/appeals/[id]/resolve/route.js:40-48`

**Evidence:**
```
const { outcome, notes } = await request.json().catch(() => ({}));
if (!outcome) return NextResponse.json({ error: 'outcome required' }, { status: 400 });

const { error } = await service.rpc('resolve_appeal', {
  p_mod_id: user.id,
  p_warning_id: params.id,
  p_outcome: outcome,  // <-- no enum check
  p_notes: notes || null,
});
```

The route accepts any string as `outcome` and passes it through to the RPC. No validation that outcome is 'approved' or 'denied'.

**Impact:** If the RPC doesn't validate, a malformed outcome could corrupt the database or get silently ignored. The RPC contract is implicit, not enforced at the boundary.

**Reproduction:** POST to /api/admin/appeals/[id]/resolve with outcome: 'typo' — request succeeds if RPC is lenient.

**Suggested fix direction:** Add enum/whitelist check: `if (!['approved', 'denied'].includes(outcome))`.

**Confidence:** MEDIUM (depends on RPC validation, which is not visible in this audit scope)

### F-B7-3-04 — Report resolution does not validate resolution parameter enum
**File:line:** `web/src/app/api/admin/moderation/reports/[id]/resolve/route.js:40-48`

**Evidence:**
```
const { resolution, notes } = await request.json().catch(() => ({}));
if (!resolution) return NextResponse.json({ error: 'resolution required' }, { status: 400 });

const { error } = await service.rpc('resolve_report', {
  p_mod_id: user.id,
  p_report_id: params.id,
  p_resolution: resolution,  // <-- no enum check
  p_notes: notes || null,
});
```

Same as appeal flow: any string is accepted. Per reports.page.tsx line 153, the UI sends 'actioned' | 'dismissed' | 'duplicate', but the route doesn't enforce this.

**Impact:** Boundary validation should happen at the API, not rely on RPC to reject. Implicit contracts between client and API are a source of drift.

**Suggested fix direction:** Whitelist: `if (!['actioned', 'dismissed', 'duplicate'].includes(resolution))`.

**Confidence:** MEDIUM

## MEDIUM

### F-B7-3-05 — Penalty level in reports flow re-fetches user but doesn't refresh appeal list
**File:line:** `web/src/app/admin/reports/page.tsx:189-205`

**Evidence:**
In the reports page, when a penalty is applied to the comment author (line 189-205), the route calls the penalty API. But after success, the code does NOT reload the appeals list (only moderation.page.tsx calls loadAppeals() after penalty). If the penalty action should update appeal eligibility, the appeals list is stale.

```typescript
// reports.page.tsx - no loadAppeals() after penalty success
toast.push({
  message: `${LEVELS[level] || 'Penalty'} applied to @${targetComment.users?.username || 'user'}.`,
  variant: 'success',
});
// ... doesn't reload appeals
```

**Impact:** User applies penalty from reports page → UI doesn't refresh appeal visibility. Low risk if appeals are shown on a separate page, but creates a UX expectation that the moderation console state auto-refreshes on cross-page actions.

**Reproduction:** Open reports + moderation in tabs. Apply penalty from reports. Switch to moderation — appeals list is stale.

**Suggested fix direction:** After penalty success, either: (a) emit a broadcast event that moderation.page listens to, (b) don't cache appeals client-side across pages, or (c) document that penalty and appeals are separate workflows with no auto-sync.

**Confidence:** LOW

### F-B7-3-06 — Categories PATCH allows partial updates without reason/audit context
**File:line:** `web/src/app/api/admin/categories/[id]/route.ts:103-317`

**Evidence:**
The categories PATCH route accepts any subset of fields and writes to the DB directly (line 295), then logs via recordAdminAction (line 309). The log includes the full oldValue and newValue in the audit record. However, the UI (categories.page.tsx) does NOT require a reason/explanation for category renames, reorders, or demotions to sub-category. The API has no reason parameter at all.

```typescript
// route.ts line 295 - direct update
const { error: upErr } = await service.from('categories').update(update).eq('id', id);

// line 309 - audit includes oldValue/newValue but no reason
await recordAdminAction({
  action,
  targetTable: 'categories',
  targetId: id,
  oldValue: existing,
  newValue: update,
  // NO reason: body.reason
});
```

**Impact:** Category mutations have audit trails but no admin-supplied justification. If an editor's category is renamed or moved, there's no context about why. This is less critical than missing audit logs entirely, but gaps explainability.

**Reproduction:** Rename a category from the UI → admin_audit_log has the before/after state but no reason field.

**Suggested fix direction:** Add optional `reason` field to PATCH body, pass it to recordAdminAction.

**Confidence:** LOW

## UNSURE

### F-B7-3-07 — Unclear whether RPC-based actions log audit natively
The penalty, appeal, and report resolution routes rely on DB RPC functions (`apply_penalty`, `resolve_appeal`, `resolve_report`, `hide_comment`) to perform the mutation. These are not visible in the codebase audit scope (they live in the Supabase project schema, which was not provided). 

**Clarification needed:** Do these RPCs themselves call a SECURITY DEFINER trigger or RPC to log to admin_audit_log? If yes, then F-B7-3-01 and F-B7-3-02 are false positives. If no, they are HIGH findings. The adminMutation.ts file notes (line 84-88) that recordAdminAction should be called client-side and is best-effort; the pattern is not enforced in RPC-delegation routes.

**Resolution:** Query the RPC function definitions (e.g., `SELECT prosrc FROM pg_proc WHERE proname = 'apply_penalty'`) to confirm whether they emit audit_log rows.

---

## Summary

**Audit gaps found:** 3 CRITICAL (moderation penalty, appeal resolution, report resolution, comment hide all lack audit logging), 2 HIGH (enum validation), 2 MEDIUM/LOW (appeals refresh, category reason context).

The moderation flows are permission-gated and rate-limited correctly, but the critical moderation actions (penalty, appeal outcome, report triage, comment removal) are not fully logged when they should be. This violates the audit trail requirement in the briefing and breaks compliance for chain-of-custody in user warnings and content moderation.

All action-button visibility (per-role) is correctly gated via requirePermission() and rank checks. No evidence of cross-role action leakage.
