---
round: 2
layer: 1
lens: L05-settings-deep-walk
anchor_sha: 10b69cb99552fd22f7cebfcb19d1bbc32ae177fe
---

# Lens Audit — Settings Page Deep Walk (L05)

## Summary

Comprehensive audit of `/profile/settings/page.tsx` (5174 lines) across 9 major sections (Profile, Feed, Accessibility, Alerts, Blocked, Data Export, Supervisor, Expert Profile, Billing, Delete Account). Found 3 confirmed CRITICAL/HIGH issues matching Round 1 findings, 3 additional races and gate bypass patterns not yet in the master list, and 1 missing confirmation UX on destructive operation. FeedCard and AccessibilityCard attempt M16 re-read mitigation but ExpertWatchlistCard has incomplete implementation; unblock bypasses server-side permission/rate-limit gates; data export is entirely unprotected server-side; permission cache is not invalidated post-settings-save.

## Findings

### [Severity: CRITICAL]

#### L5-001 — Unblock operation bypasses server permission + rate-limit gates (C3 EXTENDS)
**File:line:** `web/src/app/profile/settings/page.tsx:3281`
**What's wrong:** BlockedCard.unblock() calls `supabase.from('blocked_users').delete().eq('id', id)` directly, bypassing the DELETE `/api/users/[id]/block` route that enforces `requirePermission('settings.privacy.blocked_users.manage')`, email-verified gate, and 30/60s rate limit. Block POST correctly routes through the API; unblock is inconsistent.
**Lens applied:** Security gate consistency across save/revert/load/delete paths per surface. Direct DB access for destructive ops is a privilege escalation vector.
**New vs Round 1:** EXTENDS_MASTER_ITEM_C3 — C3 was flagged but only for the block POST inconsistency; this confirms unblock still uses direct delete.
**Evidence:**
```javascript
// line 3279-3289 — BlockedCard.unblock() implementation
const unblock = async (id: string) => {
  setBusy(id);
  const { error } = await supabase.from('blocked_users').delete().eq('id', id);  // LINE 3281 — DIRECT DELETE
  setBusy('');
  if (error) {
    pushToast({ message: error.message, variant: 'danger' });
    return;
  }
  setRows((prev) => prev.filter((r) => r.id !== id));
  pushToast({ message: 'Unblocked.', variant: 'success' });
};

// Correct API route exists at /api/users/[id]/block:
// DELETE handler enforces: gate(targetId) → requirePermission() + email_verified + rate-limit
// web/src/app/api/users/[id]/block/route.js:87-123
```
**Suggested disposition:** AUTONOMOUS-FIXABLE — Replace line 3281 with `fetch('/api/users/' + id + '/block', { method: 'DELETE' })`.

---

#### L5-002 — Data export request bypasses server permission gate (C4 EXTENDS)
**File:line:** `web/src/app/profile/settings/page.tsx:3393`
**What's wrong:** DataExportCard.requestExport() calls `supabase.from('data_requests').insert(payload)` directly. Permission gate is client-side only (line 3364: `const canExport = hasPermission(PERM.ACTION_DATA_EXPORT)`). Stale permission cache allows downgraded users to still trigger exports; no rate limit; no server re-validation.
**Lens applied:** Server-side gate enforcement for destructive/quota-consuming operations. GDPR data exports should be rate-limited and properly audited.
**New vs Round 1:** EXTENDS_MASTER_ITEM_C4 — C4 was flagged; this confirms direct insert is still in place, C4 fix (POST /api/data/export-request with gate) has not been implemented.
**Evidence:**
```javascript
// line 3386-3401 — DataExportCard.requestExport()
const requestExport = async () => {
  setBusy('export');
  const payload: TableInsert<'data_requests'> = {
    user_id: userId,
    type: 'export',
    status: 'pending',
  };
  const { error } = await supabase.from('data_requests').insert(payload);  // LINE 3393 — NO SERVER GATE
  setBusy('');
  if (error) {
    pushToast({ message: error.message, variant: 'danger' });
    return;
  }
  pushToast({ message: 'Data export requested.', variant: 'success' });
  await load();
};

// No corresponding /api/data/export route exists with permission checks.
```
**Suggested disposition:** AUTONOMOUS-FIXABLE — Create POST `/api/data/export-request` with `requirePermission('settings.data.request_export')` + rate-limit (1 per 30 days). Update requestExport() to call fetch() to this route.

---

#### L5-003 — Permission cache not invalidated after settings mutations (H8 EXTENDS)
**File:line:** `web/src/app/profile/settings/page.tsx:573-595` (reloadUser definition), lines 1537, 2149, 2725, 3188, 4633 (onSaved calls)
**What's wrong:** All save handlers (ProfileCard, FeedCard, AccessibilityCard, AlertsCard, ExpertProfileCard) call `onSaved()` which maps to `reloadUser()`. reloadUser() re-fetches the user row but does NOT call `invalidate()` or `refreshAllPermissions()`. If a profile change affects downstream permissions (e.g., setting is_expert=false revokes expert-only perms), the permission cache stays stale until 60s TTL expires.
**Lens applied:** Permission gate consistency — gates read cached permissions; mutations that affect permission state must invalidate cache synchronously. Billing route (line 555-556) does this correctly; all other settings sections do not.
**New vs Round 1:** EXTENDS_MASTER_ITEM_H8 — H8 flagged the problem; this survey confirms it affects ProfileCard, FeedCard, AccessibilityCard, ExpertProfileCard. AlertsCard and SupervisorCard do direct API calls without onSaved callback, so they evade this check but may still need per-route cache invalidation.
**Evidence:**
```javascript
// line 573-595 — reloadUser() has no invalidate/refreshAllPermissions
const reloadUser = useCallback(async () => {
  if (!userId) return;
  const { data, error } = await supabase
    .from('users')
    .select(
      'id, email, email_verified, username, display_name, bio, avatar_url, avatar_color, banner_url, metadata, deletion_scheduled_for, is_expert, expert_title, expert_organization, is_verified_public_figure, allow_messages, dm_read_receipts_enabled, profile_visibility, show_activity, show_on_leaderboard, created_at, onboarding_completed_at'
    )
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    pushToast({ message: error.message, variant: 'danger' });
    setLoadingUser(false);
    return;
  }
  setUserRow(data);
  setLoadingUser(false);
  // NO invalidate() or refreshAllPermissions() here!
}, [supabase, userId, pushToast]);

// Contrast with billing checkout success path (line 553-556):
if (success === '1') {
  pushToast({ message: 'Subscription updated. Welcome aboard.', variant: 'success' });
  invalidate();  // ← PRESENT
  void refreshAllPermissions();  // ← PRESENT
}
```
**Suggested disposition:** AUTONOMOUS-FIXABLE — Add `invalidate(); refreshAllPermissions();` to the end of reloadUser() after setUserRow().

---

### [Severity: HIGH]

#### L5-004 — ExpertWatchlistCard uses stale local state in merge (incomplete M16)
**File:line:** `web/src/app/profile/settings/page.tsx:4882-4901`
**What's wrong:** ExpertWatchlistCard.toggle() performs optimistic update (line 4884-4885), then re-reads metadata (line 4887-4891), but computes `watched` from optimistic nextCats (line 4886, derived BEFORE re-read). If concurrent feed/a11y save happens between optimistic update and re-read, the merge at line 4893 overwrites expertWatchlist with stale local state instead of the fresh metadata's expertWatchlist value.
**Lens applied:** Concurrent save ordering — M16 mitigation requires re-reading before computing the merged value, not after. FeedCard and AccessibilityCard do this correctly (re-read then derive from fresh metadata). ExpertWatchlistCard re-reads but derives from pre-read state.
**New vs Round 1:** NEW — Related to C2 concurrent metadata clobber but specific to ExpertWatchlist's implementation of the partial mitigation. FeedCard and AccessibilityCard correctly re-read and use fresh metadata for deriving their sections; ExpertWatchlist re-reads but ignores it for the computation.
**Evidence:**
```javascript
// line 4882-4901 — ExpertWatchlistCard.toggle()
const toggle = async (id: string) => {
  const prev = cats;  // backup for rollback
  const nextCats = cats.map((c) => (c.id === id ? { ...c, watched: !c.watched } : c));
  setCats(nextCats);  // OPTIMISTIC UPDATE (line 4885)
  const watched = nextCats.filter((c) => c.watched).map((c) => c.id);  // LINE 4886 — COMPUTED FROM nextCats BEFORE RE-READ
  const { data: u } = await supabase  // RE-READ METADATA (line 4887-4891)
    .from('users')
    .select('metadata')
    .eq('id', userId)
    .maybeSingle();
  const prevMeta = (u as { metadata?: Record<string, unknown> } | null)?.metadata || {};
  const merged = { ...prevMeta, expertWatchlist: watched };  // LINE 4893 — MERGES WITH STALE watched
  const { error } = await supabase.rpc('update_own_profile', { p_fields: { metadata: merged } });
  if (error) {
    setCats(prev);
    pushToast({ message: error.message, variant: 'danger' });
  }
};

// Correct pattern (FeedCard, line 2690-2726):
const { data: fresh } = await supabase  // RE-READ FIRST
  .from('users')
  .select('metadata')
  .eq('id', userId)
  .maybeSingle();
const freshMeta = (fresh as { metadata?: Record<string, unknown> } | null)?.metadata as SettingsMeta | null;
const prevFeed = freshMeta?.feed || {};
const merged = {
  ...(freshMeta || {}),  // USE FRESH METADATA
  feed: { ...prevFeed, cats: [...selectedCats], ... }  // THEN COMPUTE FROM FRESH
};
```
**Suggested disposition:** OWNER-INPUT — Decide if ExpertWatchlist should operate at the watch-level (re-read expertWatchlist, merge, write) or tab-level (re-read all metadata, preserve other keys). If tab-level, compute `watched` from fresh metadata. If watch-level, skip the full metadata re-read and use RPC to set just the expertWatchlist key atomically.

---

#### L5-005 — Unblock button lacks destructive-operation confirmation dialog
**File:line:** `web/src/app/profile/settings/page.tsx:3331-3338`
**What's wrong:** BlockedCard renders an "Unblock" button without a ConfirmDialog. While less critical than a security bypass, unblocking is a destructive operation (user re-appears in blocker's view, can message/comment again). Other destructive ops in the same page (sign-out-everywhere, step-down, delete-account) all have confirmation. Unblock is UX-inconsistent.
**Lens applied:** Destructive-operation UX consistency — confirm-on-destructive pattern should apply uniformly across all edit surfaces.
**New vs Round 1:** NEW — Not in master list. Related to missing-confirm-on-destructive family of issues.
**Evidence:**
```javascript
// line 3331-3338 — Unblock button with NO confirmation
<Button
  size="sm"
  disabled={!canUnblock || busy === r.id}
  loading={busy === r.id}
  onClick={() => unblock(r.id)}  // DIRECT CALL, NO CONFIRM DIALOG
>
  Unblock
</Button>

// Contrast with sign-out-everywhere (line 2575-2584):
<ConfirmDialog
  open={confirmAll}
  title="Sign out of every other session?"
  message="You'll stay signed in here. Other devices will be kicked out immediately."
  confirmLabel="Sign out others"
  variant="danger"
  busy={busyAll}
  onCancel={() => !busyAll && setConfirmAll(false)}
  onConfirm={revokeAll}
/>
```
**Suggested disposition:** POLISH — Wrap unblock in ConfirmDialog similar to sign-out-everywhere pattern.

---

### [Severity: MEDIUM]

#### L5-006 — Unblocked stale gate guards on permission checks
**File:line:** `web/src/app/profile/settings/page.tsx:3256, 3364, 3513, etc.`
**What's wrong:** Permission gates are read once at component mount via `hasPermission(PERM.*)` (e.g., line 3256: `const canUnblock = hasPermission(PERM.ACTION_BLOCKED_UNBLOCK)`). These values are never re-checked after a settings mutation that might affect permissions. If user downgrades plan mid-session, disabled buttons may become enabled again without refresh. Buttons themselves disable correctly based on stale `can*` values, so the gate is in place, but the gate value doesn't reflect live permission state.
**Lens applied:** Permission gate staleness — each section reads gates once and never refreshes. With 60s permission cache TTL, a downgraded user might see inconsistent UI for up to 60s.
**New vs Round 1:** NEW — Related to H8 but distinct: H8 is about cache invalidation; this is about re-reading gates within a living component. Low-priority because API routes also gate, so the bypass isn't fully open, but UX is inconsistent.
**Evidence:**
```javascript
// line 3256 — BlockedCard gate read once
const canUnblock = hasPermission(PERM.ACTION_BLOCKED_UNBLOCK);  // NEVER RE-CHECKED

// line 3364 — DataExportCard gate read once
const canExport = hasPermission(PERM.ACTION_DATA_EXPORT);  // NEVER RE-CHECKED

// Buttons disable based on stale can* values (line 3333, 3441)
disabled={!canUnblock || busy === r.id}
disabled={!canExport}
```
**Suggested disposition:** POLISH — Use `useEffect` with permission cache invalidation as dependency, or call `refreshIfStale()` before rendering each card.

---

#### L5-007 — Missing rate-limit confirmation on data export
**File:line:** `web/src/app/profile/settings/page.tsx:3386-3401`
**What's wrong:** DataExportCard.requestExport() has no rate-limit check or feedback to user. Multiple requests in quick succession all go through to the API. While server-side rate-limiting should prevent abuse, the client gives no indication that exports are limited to once per 30 days (once that server route is implemented). UX should pre-emptively disable button or show cooldown timer.
**Lens applied:** Rate-limit UX visibility — users should know when an action is rate-limited before attempting it.
**New vs Round 1:** NEW — Depends on C4 fix (server route creation). Once C4 is fixed, add client-side cooldown tracking to UI.
**Evidence:**
```javascript
// No rate-limit state or cooldown timer in component
const [requests, setRequests] = useState<DataRequestRow[]>([]);  // Tracks export history
const [busy, setBusy] = useState<'export' | ''>('');  // Only tracks in-flight state

// UI should disable button if there's an active export or within cooldown window
const activeExport = requests.find(
  (r) => r.type === 'export' && r.status !== 'completed' && r.status !== 'cancelled'
);
// Already disables for activeExport; could extend to track last-completed timestamp
```
**Suggested disposition:** POLISH — Once C4 server-side route is implemented with 30-day rate-limit, update DataExportCard to parse rate-limit response headers and show "Available again in X days" message.

---

## OUTSIDE MY LENS

- **L04-concurrent-mutations:** FeedCard and AccessibilityCard M16 pattern is correct; full end-to-end concurrent-mutation testing would belong to a dedicated concurrency lens.
- **L06-permission-matrix:** Permission key definitions (PERM constants, lines 74-105) map to `permissions` table keys; some mappings are imperfect (e.g., SECTION_BILLING_VIEW maps to 'billing.view.plan' but the spec may expect a different key). This belongs to permission-audit lens.
- **L02-form-validation:** PasswordCard, ProfileCard avatar+initials validation, PwField strength checking all appear present. Form validation strictness isn't within deep-walk scope.
- **L03-error-messages:** Settings pages surface generic error messages correctly (e.g., 'Could not save alert preference.'); no error-message leakage detected.
