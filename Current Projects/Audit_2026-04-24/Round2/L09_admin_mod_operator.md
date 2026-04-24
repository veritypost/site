---
round: 2
layer: 1
lens: L09-admin-mod-operator
anchor_sha: 10b69cb99552fd22f7cebfcb19d1bbc32ae177fe
---

# Lens Audit — L09 Admin / Moderator / Editor Operator Journeys

## Summary

Walked the full admin operator journey: role assignment, permission grant/revoke, user bans, billing freeze/cancel, penalty application, appeal resolution, report resolution, comment moderation, category ops, breaking news, ad campaigns, and broadcast/alert flows. Found that most routes correctly implement rank guards and rate limits per Round 1 fixes (F-034 through F-036). However, identified 5 audit-log gaps and 1 UI gating regression not fully covered by MASTER_FIX_LIST.

## Findings

### [Severity: CRITICAL]

#### L2-L09-01 — Ad campaign CRUD routes missing audit_log

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/ad-campaigns/route.js:36-95`, `[id]/route.js:25-98`

**What's wrong:** POST (create campaign), PATCH (edit), and DELETE (remove campaign) routes bypass `recordAdminAction()` entirely. No audit trail for ad spend, targeting changes, or campaign deletions.

**Lens applied:** Audit trail is non-negotiable for destructive operator actions. Ad campaigns affect revenue and inventory; changes should be audited per canonical admin-mutation order (step 7 in `/lib/adminMutation.ts`).

**New vs Round 1:** NEW — not covered by C21 (which cited only moderation routes).

**Evidence:**
```javascript
// /api/admin/ad-campaigns/route.js:36-95 (POST)
export async function POST(request) {
  let user; try { user = await requirePermission('admin.ads.campaigns.create'); } catch (err) { ... }
  const service = createServiceClient();
  const rate = await checkRateLimit(service, { ... });
  // ... insert payload ...
  const { data, error } = await service.from('ad_campaigns').insert({ ... }).select('id').single();
  // ← NO recordAdminAction call here
  return NextResponse.json({ id: data.id });
}

// /api/admin/ad-campaigns/[id]/route.js:25-98 (PATCH + DELETE)
// Both routes call service mutations with NO recordAdminAction
```

**Suggested disposition:** AUTONOMOUS-FIXABLE — Add import + one-line call per route, using pattern from `roles/route.js:97-102` and `ban/route.js:73-79`.

---

### [Severity: HIGH]

#### L2-L09-02 — Penalty buttons render without hierarchy gating in UI

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/admin/moderation/page.tsx:326-332`, `/admin/reports/page.tsx:352-355`

**What's wrong:** Penalty buttons (Warn, 24h mute, 7-day mute, Ban) render unconditionally on both pages. Roles buttons correctly disable out-of-scope roles using `outOfScope` check (moderation.tsx line 341). Penalty buttons lack equivalent gating, showing buttons that will always fail per API-side rank checks.

**Lens applied:** C23 from MASTER_FIX_LIST identified this issue. The role-gating pattern is proven and available; penalties must follow identical UX pattern. Showing ungated buttons → operator confusion + unnecessary failed API calls.

**New vs Round 1:** EXTENDS_MASTER_ITEM_C23 — Round 1 flagged penalty gating absence; confirming still present at moderation.tsx:327-332 and reports.tsx:352-355.

**Evidence:**
```typescript
// moderation.tsx:326-333
<div>
  <div style={labelStyle}>Penalties</div>
  <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
    {[1, 2, 3].map((l) => (
      <Button key={l} variant="secondary" size="sm" onClick={() => penalty(l)}>
        {PENALTY_LABELS[l]}
      </Button>
    ))}
    <Button variant="danger" size="sm" onClick={() => penalty(4)}>Ban</Button>
  </div>
</div>

// Compare to role buttons (lines 339-355): 
const outOfScope = (HIERARCHY[r] ?? 0) > actorMaxLevel;
const disabled = outOfScope || busy.startsWith('grant:') || busy.startsWith('revoke:');
// Penalty buttons lack this pattern entirely
```

Same ungated rendering in reports/page.tsx:352-355.

**Suggested disposition:** AUTONOMOUS-FIXABLE — Apply identical `outOfScope` pattern to penalty buttons. Map penalty levels to hierarchy (e.g., Ban = 80, 7-day mute = 60, 24h mute = 60, Warn = 10), disable buttons where `actorMaxLevel < penaltyHierarchy[level]`.

---

#### L2-L09-03 — Moderation routes still missing audit_log (C21)

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/moderation/users/[id]/penalty/route.js:63-74`, `reports/[id]/resolve/route.js:43-54`, `comments/[id]/hide/route.js:38-48`, `appeals/[id]/resolve/route.js:43-54`

**What's wrong:** All 4 routes call service RPCs (`apply_penalty`, `resolve_report`, `hide_comment`, `resolve_appeal`) without wrapping in `recordAdminAction()`. CRITICAL destructive actions (penalty application, user bans, appeal outcomes, comment hides) leave zero audit trail.

**Lens applied:** C21 already flagged this. Confirming still present at anchor SHA; no fixes applied. Penalties and appeal outcomes are high-risk — moderators can apply penalties invisibly.

**New vs Round 1:** EXTENDS_MASTER_ITEM_C21 — Round 1 identified all 4 routes; confirming they remain unfixed.

**Evidence:**
```javascript
// /api/admin/moderation/users/[id]/penalty/route.js:63-74
const { data, error } = await service.rpc('apply_penalty', {
  p_mod_id: user.id,
  p_target_id: params.id,
  p_level: levelNum,
  p_reason: reason,
});
if (error) return safeErrorResponse(...);
return NextResponse.json({ warning_id: data });
// ← NO recordAdminAction

// Identical pattern in reports/[id]/resolve, comments/[id]/hide, appeals/[id]/resolve
```

**Suggested disposition:** AUTONOMOUS-FIXABLE — Import `recordAdminAction` + add calls to each route matching `/ban/route.js:73-79` pattern (action, targetTable, targetId, reason, newValue).

---

#### L2-L09-04 — Double-audit on permission toggle (H24)

**File:line:** `/Users/veritypost/Desktop/verity-post/components/admin/DestructiveActionConfirm.tsx:59-78`

**What's wrong:** DestructiveActionConfirm.tsx calls `record_admin_action` RPC directly on submit (line 65-72), THEN downstream handlers in calling pages (e.g., permissions/page.tsx) may also log. Creates dual audit entries per action with possible inconsistent action labels. Also creates orphaned entries if the actual mutation fails after audit is logged.

**Lens applied:** Audit log is forensic evidence. Duplicates obscure intent, inflate cardinality, and violate atomicity: audit should fire AFTER mutation succeeds. H24 flagged this pattern; confirming in component architecture.

**New vs Round 1:** EXTENDS_MASTER_ITEM_H24 — Round 1 identified double-audit on permission-set toggles; confirming in DestructiveActionConfirm component design (shared by permissions, data-requests, and other admin surfaces).

**Evidence:**
```typescript
// /components/admin/DestructiveActionConfirm.tsx:59-78
async function submit() {
  if (!canSubmit) return;
  setBusy(true);
  setError('');
  try {
    const supabase = createClient();
    const { error: rpcErr } = await supabase.rpc('record_admin_action', {
      p_action: action,
      p_target_table: targetTable ?? undefined,
      // ...
    });
    if (rpcErr) { setError(...); setBusy(false); return; } // ← audit logged, then early exit if mutation fails
    await onConfirm?.({ reason: reason.trim() }); // calls handler, which may also audit
  }
}
```

**Suggested disposition:** OWNER-INPUT — Design decision: audit should fire server-side only, inside each route handler, post-mutation. Remove client-side `record_admin_action` call from DestructiveActionConfirm component; rely on route handlers to audit (they already import recordAdminAction). Clients pass action label + context; routes own the audit.

---

### [Severity: MEDIUM]

#### L2-L09-05 — Missing oldValue in permission PATCH audits

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/permissions/[id]/route.js:73-78`

**What's wrong:** Permission PATCH calls `recordAdminAction` with `newValue` only (line 77: `newValue: patch`). No `oldValue` logged. Auditor cannot see what field changed or what the old value was, only the new state.

**Lens applied:** Audit entries should document before/after state for all mutations. Other routes (ban/route.js:78, categories/[id]/route.ts:309-315) include both oldValue + newValue. Permission audits are inconsistent with canonical pattern.

**New vs Round 1:** NEW — M10 flagged missing oldValue abstractly; confirming specific location and extent.

**Evidence:**
```javascript
// /api/admin/permissions/[id]/route.js:73-78 (PATCH)
await recordAdminAction({
  action: 'permission.update',
  targetTable: 'permission',
  targetId: id,
  newValue: patch,  // ← no oldValue
});

// Compare to /api/admin/users/[id]/ban/route.js:73-79 (correct):
await recordAdminAction({
  action: banned ? 'user.ban' : 'user.unban',
  targetTable: 'users',
  targetId: targetId,
  reason: reason,
  oldValue: { is_banned: !banned },  // ← includes before-state
  newValue: { is_banned: banned },
});
```

**Suggested disposition:** AUTONOMOUS-FIXABLE — Load the existing permission row before update (add SELECT query before UPDATE), pass both oldValue + newValue to recordAdminAction.

---

## OUTSIDE MY LENS

- **H15 send-push Promise.all vs allSettled** — Promise pattern consistency lens (not operator-specific).
- **Breaking news fan-out best-effort semantics** — Broadcast fault-tolerance and atomicity lens, not operator journey.
- **Admin session expiry mid-action** — No evidence found in codebase; assumed handled by Supabase auth layer.
- **No page-view telemetry for admin console** — Observability/analytics lens; not operator-specific.

