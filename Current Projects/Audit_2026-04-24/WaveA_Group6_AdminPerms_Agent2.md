---
wave: A
group: 6 Admin Users/Roles/Perms
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Admin Users/Roles/Perms (Wave A, Group 6, Agent 2)

## CRITICAL

### F-G6-2-01 — Missing audit_log on DELETE /api/admin/users/[id]/roles (role revoke)

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/users/[id]/roles/route.js:98-164`

**Evidence:**
```
export async function DELETE(request, { params }) {
  ...
  const { error } = await service.rpc('revoke_role', { ... });
  if (error) return safeErrorResponse(...);
  const { error: bumpErr } = await service.rpc('bump_user_perms_version', { ... });
  if (bumpErr) console.error('[roles.revoke] perms_version bump failed:', ...);
  return NextResponse.json({ ok: true });  // NO recordAdminAction call
}
```

Comparison: `/api/admin/users/[id]/plan/route.js:87-92` correctly calls `recordAdminAction('plan.set', ...)` after its update. The roles DELETE handler lacks this entirely.

**Impact:** Every role revocation bypasses audit_log. Admin moderation actions (escalation/demotion attacks) leave no audit trail. Tier 0 security gap per MASTER_TRIAGE.

**Reproduction:** Call `DELETE /api/admin/users/[target]/roles?role_name=admin` with sufficient permissions. Check admin_audit_log table — no entry exists.

**Suggested fix direction:** Add `recordAdminAction({ action: 'role.revoke', targetTable: 'users', targetId: params.id, newValue: { role_name } })` before the return, matching the POST handler's perms_version bump pattern (line 91-94).

**Confidence:** HIGH

---

### F-G6-2-02 — Missing audit_log on POST /api/admin/users/[id]/roles (role grant)

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/users/[id]/roles/route.js:25-96`

**Evidence:**
Same handler file. POST handler (grant path) has no `recordAdminAction` import or call. Bumps perms_version (line 91) but never logs the grant to audit_log.

**Impact:** Role escalations are invisible to auditors. An admin granting themselves or allies elevated roles leaves zero compliance record.

**Reproduction:** Call `POST /api/admin/users/[target]/roles` with `{ role_name: 'admin' }`. admin_audit_log remains empty.

**Suggested fix direction:** Import `recordAdminAction` and call it with `{ action: 'role.grant', targetTable: 'users', targetId: params.id, newValue: { role_name } }` after the RPC, before the bump (or immediately after, order doesn't matter for non-fatal operations).

**Confidence:** HIGH

---

### F-G6-2-03 — Missing audit_log on POST /api/admin/billing/cancel

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/billing/cancel/route.js:17-64`

**Evidence:**
```
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('admin.billing.cancel');
  } catch (err) { ... }
  const { user_id, reason } = await request.json();
  if (user_id !== user.id) {
    const rankErr = await requireAdminOutranks(user_id, user.id);
    if (rankErr) return rankErr;
  }
  // ... rate limit ...
  const { data, error } = await service.rpc('billing_cancel_subscription', { ... });
  if (error) return safeErrorResponse(...);
  return NextResponse.json(data);  // NO recordAdminAction
}
```

Lines 8, 9 import from `@/lib/adminMutation` but do NOT import `recordAdminAction`. The handler never calls it.

**Impact:** Subscription cancellations (7-day grace period entry, DM lockout) are unaudited. A rogue admin can mass-cancel accounts with no trail.

**Reproduction:** Call `POST /api/admin/billing/cancel` with `{ user_id: <target> }`. Check admin_audit_log — no entry.

**Suggested fix direction:** Add import for `recordAdminAction` and call after the RPC: `recordAdminAction({ action: 'billing.cancel', targetTable: 'subscriptions', targetId: <subscription_id>, reason })`. (Note: the RPC returns subscription_id in its JSONB; extract and pass.)

**Confidence:** HIGH

---

### F-G6-2-04 — Missing audit_log on POST /api/admin/billing/freeze

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/billing/freeze/route.js:15-59`

**Evidence:**
```
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('admin.billing.freeze');
  } catch (err) { ... }
  const { user_id } = await request.json();
  if (user_id !== user.id) {
    const rankErr = await requireAdminOutranks(user_id, user.id);
    if (rankErr) return rankErr;
  }
  // ... rate limit ...
  const { data, error } = await service.rpc('billing_freeze_profile', { p_user_id: user_id });
  if (error) return safeErrorResponse(...);
  return NextResponse.json(data);  // NO recordAdminAction
}
```

Same pattern: no `recordAdminAction` import or call.

**Impact:** Account freezes (immediate payment suspension, access lockout) leave no admin audit trail. T0-2 identified handler crash risk; this audit gap compounds it.

**Reproduction:** Call `POST /api/admin/billing/freeze` with `{ user_id: <target> }`. admin_audit_log is empty.

**Suggested fix direction:** Add import and call `recordAdminAction({ action: 'billing.freeze', targetTable: 'users', targetId: user_id })` after the RPC, before return.

**Confidence:** HIGH

---

## HIGH

### F-G6-2-05 — Missing audit_log coverage for permissions grant/revoke edges

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/permissions/[id]/route.js:83-128` (DELETE)

**Evidence:**
```
export async function DELETE(_request, { params }) {
  let actor;
  try {
    actor = await requirePermission('admin.permissions.set.edit');
  } catch (err) { ... }
  const id = params?.id;
  // ... rate limit ...
  const { error } = await service.from('permissions').delete().eq('id', id);
  if (error) return safeErrorResponse(...);
  await recordAdminAction({
    action: 'permission.delete',
    targetTable: 'permission',
    targetId: id,
  });
  return NextResponse.json({ ok: true });
}
```

Lines 121-125 do call `recordAdminAction`, so DELETE is covered. However, examine PATCH (lines 25-81) similarly — it DOES call recordAdminAction (line 73). Permission edits are logged.

**Impact:** Coverage is actually CORRECT here. This handler properly audits both grant (via user-grants endpoint) and system permission changes. No gap.

**Reproduction:** Audit already present; no fix needed.

**Suggested fix direction:** N/A — already fixed. Flagging as "all good" for completeness.

**Confidence:** HIGH

---

## MEDIUM

### F-G6-2-06 — Penalty RPC audit responsibility unclear; applies_penalty audit depends on RPC internals

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/moderation/users/[id]/penalty/route.js:21-75`

**Evidence:**
```
export async function POST(request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.moderation.penalty.warn');
  } catch (err) { ... }
  const { level, reason } = await request.json();
  // ... validation, rank check, rate limit ...
  const { data, error } = await service.rpc('apply_penalty', {
    p_mod_id: user.id,
    p_target_id: params.id,
    p_level: levelNum,
    p_reason: reason,
  });
  if (error) return safeErrorResponse(...);
  return NextResponse.json({ warning_id: data });  // NO recordAdminAction
}
```

No `recordAdminAction` call in the handler. The RPC (`apply_penalty`) is SECURITY DEFINER; audit may be happening inside the RPC. Cannot verify without reading the RPC body.

**Impact:** If apply_penalty does NOT audit itself, penalties (mutes, bans) are untracked. If it DOES, the pattern is inconsistent with other handlers (every sibling route calls recordAdminAction post-mutation). Clarity needed.

**Reproduction:** Code-reading only. Would require reading the apply_penalty() RPC definition to confirm if it calls record_admin_action() internally.

**Suggested fix direction:** Either (a) confirm apply_penalty() is self-auditing via record_admin_action() RPC, or (b) add explicit recordAdminAction to the handler for parity.

**Confidence:** MEDIUM

---

## LOW

### F-G6-2-07 — require_outranks RPC not present in schema/*.sql migrations

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/lib/adminMutation.ts:119` (usage)

**Evidence:**
```
const { data: outranks, error } = await (
  authed.rpc as unknown as (fn: string, args: Record<string, unknown>) =>
    Promise<{ data: boolean | null; error: { message: string } | null }>
)('require_outranks', { target_user_id: targetUserId });
```

The RPC is called but not defined in any schema/*.sql file. It exists in the live database (confirmed via generated database.ts types, line 10917: `require_outranks: { Args: { target_user_id: string }; Returns: boolean }`), but no migration file contains its CREATE FUNCTION.

ASSUMPTION: This RPC was added via a mechanism outside the normal migrations (e.g., direct SQL execution on Supabase dashboard, or an older migration not present in the schema/ directory).

**Impact:** Loss of source control and auditability. If the RPC ever needs to be debugged or the implementation traced, the canonical definition is unavailable.

**Reproduction:** Code-reading. `grep -r "CREATE.*FUNCTION.*require_outranks" /schema/*.sql` returns no matches.

**Suggested fix direction:** Locate the RPC definition on the live Supabase database and backfill a migration file documenting it, ensuring schema/ is the source of truth going forward.

**Confidence:** LOW (doesn't affect functionality, but impacts auditability of the audit system itself)

---

## Summary

**CRITICAL issues:** 4 audit_log gaps (roles grant/revoke × 2, billing cancel/freeze × 2). All are high-visibility admin mutations affecting account state (role escalation, subscription lockout). Together they represent a Tier 0 compliance / auditability failure.

**Remediation priority:** Fix all 4 critical findings in a single commit; they follow the same pattern and share imports.
