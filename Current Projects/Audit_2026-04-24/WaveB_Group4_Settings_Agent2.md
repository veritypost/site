---
wave: B
group: 4 Profile + Settings + Messages
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Profile + Settings + Messages, Wave B, Agent 2

## CRITICAL

### F-4-2-01 — Unblock mutation bypasses RPC gate, relies on client-side RLS alone

**File:line:** `web/src/app/profile/settings/page.tsx:3281`

**Evidence:**
```typescript
const unblock = async (id: string) => {
  setBusy(id);
  const { error } = await supabase.from('blocked_users').delete().eq('id', id);
  setBusy('');
  if (error) {
    pushToast({ message: error.message, variant: 'danger' });
    return;
  }
  setRows((prev) => prev.filter((r) => r.id !== id));
  pushToast({ message: 'Unblocked.', variant: 'success' });
};
```

**Impact:** All other settings mutations (profile, feed, alerts, accessibility, expert) route through `update_own_profile` RPC (line 1528, 2141, 2717, 3180, 4619), which enforces server-side permission checks via `requirePermission`. The `blocked_users.delete()` on line 3281 does NOT go through an RPC. It relies entirely on table-level RLS. If RLS on `blocked_users` is misconfigured (missing blocker_id=auth.uid() check, overly permissive, or has a security definer bypass), a user can unblock another user's blocks or race-condition with concurrent deletes. The permission key `PERM.ACTION_BLOCKED_UNBLOCK` (line 92) is checked on the UI (line 3256 disables the button), but the mutation does not re-validate server-side.

**Reproduction:** Code-reading only. The unblock flow at `/profile/settings?highlight=blocked` → click Unblock button → fires direct `.delete()` without RPC.

**Suggested fix direction:** Wrap the unblock mutation in a `POST /api/blocked/unblock` route that calls `requirePermission('settings.blocked.unblock')` and uses a SECURITY DEFINER RPC, mirroring the post_message + start_conversation pattern.

**Confidence:** HIGH

### F-4-2-02 — Data export request bypasses RPC, inserts directly into data_requests

**File:line:** `web/src/app/profile/settings/page.tsx:3393`

**Evidence:**
```typescript
const requestExport = async () => {
  setBusy('export');
  const payload: TableInsert<'data_requests'> = {
    user_id: userId,
    type: 'export',
    status: 'pending',
  };
  const { error } = await supabase.from('data_requests').insert(payload);
  setBusy('');
  if (error) {
    pushToast({ message: error.message, variant: 'danger' });
    return;
  }
  pushToast({ message: 'Data export requested.', variant: 'success' });
  await load();
};
```

**Impact:** Like unblock, this mutation is not gated by a server-side `requirePermission` call. The permission key `PERM.ACTION_DATA_EXPORT` (line 93) gates the UI button (line 3441 disables it), but a malicious client or permission cache miss allows repeated export requests. An attacker can also manually craft POST requests to create export records for other users if the table's RLS allows `user_id` injection. GDPR export requests should be rate-limited and audited.

**Reproduction:** Code-reading only. Navigate to `/profile/settings?highlight=data`, click "Request data export".

**Suggested fix direction:** Create `POST /api/data/export-request` with `requirePermission` + rate-limit check (e.g., one export per 30 days per user).

**Confidence:** HIGH

## HIGH

### F-4-2-03 — Settings mutations do not invalidate permission cache after save

**File:line:** `web/src/app/profile/settings/page.tsx:1528–1537` (profile), `2141–2149` (emails), `2717–2725` (feed), `3180–3188` (a11y), `4619–4633` (expert)

**Evidence:**
```typescript
// Profile save (line 1496–1538)
const { error } = await supabase.rpc('update_own_profile', { p_fields: patch });
setSaving(false);
if (error) {
  pushToast({ message: error.message, variant: 'danger' });
  return;
}
pushToast({ message: 'Profile saved', variant: 'success' });
setEditing(false);
markDirty(false);
await onSaved();  // <-- onSaved is reloadUser (line 595), not invalidate()
```

**Impact:** After the profile card saves, it calls `await onSaved()` which is the `reloadUser` callback (set at line 793). `reloadUser` (line 573–595) re-fetches the user row from Supabase and updates React state, but it does NOT call `invalidate()` or `refreshAllPermissions()` from `@/lib/permissions`. If a settings change (e.g., profile visibility → private, allow_messages → false) should gate downstream UI or API permissions, the in-memory permissions cache becomes stale. The billing page correctly calls `invalidate()` + `refreshAllPermissions()` after Stripe checkout success (line 555–556), but all five card mutations here do not. This is a data consistency bug if any permission rule depends on these profile columns.

**Reproduction:** Change `allow_messages` from true → false, save. Then immediately navigate to `/messages` and try to compose a DM to a disabled account. The UI may still show the compose button if `hasPermission('messages.dm.compose')` is cached.

**Suggested fix direction:** Call `invalidate()` after every settings mutation that might affect downstream permissions. At minimum, profile, allow_messages, and dm_read_receipts changes should invalidate.

**Confidence:** HIGH

## MEDIUM

### F-4-2-04 — Alert preferences saved to metadata.notification_prefs with no schema validation

**File:line:** `web/src/app/profile/settings/page.tsx:2128–2149` (EmailsCard)

**Evidence:**
```typescript
const saveNotifs = async () => {
  if (!user) return;
  setSavingNotif(true);
  const prevMeta = readMeta(user);
  const merged = {
    ...(prevMeta || {}),
    notification_prefs: {
      ...(prevMeta.notification_prefs || {}),
      newsletter,
      commentReplies,
      securityAlerts,
    },
  };
  const { error } = await supabase.rpc('update_own_profile', { p_fields: { metadata: merged } });
```

**Evidence (alert toggles at line 2218–2285):** The alerts grid (lines around 2218–2285 in the rendered section) allows toggling per-alert-type × per-channel (push, email, in-app) but there is NO visible save mechanism — no "Save changes" button after toggling. The toggles appear to be independent and stateful only within the AlertsCard component, with no persistence callback shown.

**Impact:** (1) Notification prefs are stored as unstructured JSONB in metadata, not as a first-class `alert_preferences` table row. If a permission rule or feature depends on `metadata.notification_prefs.newsletter`, it must parse JSON, not query a column. (2) The code comment (lines 2100–2102) flags this as a known debt: "No dedicated `notification_prefs` column on `users`... flagged for owner." (3) The alerts section rendering (lines 2218–2285) may not save at all — need to verify alert toggles actually persist.

**Reproduction:** Navigate to `/profile/settings?highlight=emails`, toggle newsletter on/off, close the browser, reopen. Check if the toggle state persists. (Cannot fully test without starting dev server.)

**Suggested fix direction:** Promote `notification_prefs` to a proper `alert_preferences` table with per-user rows and RLS, or ensure the AlertsCard has a visible save button and calls `await onSaved()` after each toggle group change.

**Confidence:** MEDIUM

## LOW

### F-4-2-05 — Profile section has no gateKey; all roles can enter edit mode

**File:line:** `web/src/app/profile/settings/page.tsx:307–311`

**Evidence:**
```typescript
{
  id: 'profile',
  label: 'Profile',
  keywords: 'profile display name username bio avatar banner visibility',
  // <-- no gateKey, unlike password (PERM.ACTION_PASSWORD_CHANGE) or alerts (PERM.ACTION_ALERTS_VIEW)
},
```

**Impact:** The Profile subsection renders for all authenticated users (no permission gate). The ProfileCard itself checks no permissions on individual fields (display_name, bio, avatar are free-tier, allow_messages is gated by permission key PERM.* but no explicit permission check in the component). If profile edits should be restricted by role (e.g., kids cannot edit bio, experts-only have title field), the lack of a gateKey means visibility is all-or-nothing. Need to verify: (1) Does the RPC `update_own_profile` re-check permissions on each field? (2) Are there role-based restrictions on profile visibility or allow_messages toggle?

**Reproduction:** Code-reading only. Inspect the SECTIONS tree and ProfileCard component props.

**Suggested fix direction:** If profile edits should be gated by role, add a gateKey to the profile subsection. Otherwise, confirm the RPC applies per-field permission checks.

**Confidence:** LOW

---

**Summary:** Two CRITICAL mutations (unblock, data export request) bypass RPC gates and rely on table-level RLS alone. One HIGH issue: settings mutations do not invalidate the permission cache after save, risking stale cached permissions. One MEDIUM: alert preferences lack a visible save mechanism and persist to unstructured metadata. One LOW: profile section has no role-based visibility gate.
