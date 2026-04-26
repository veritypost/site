---
wave: B
group: 4 Profile + Settings + Messages
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Group 4 Settings, Wave B, Agent 3

## CRITICAL

### F-B4-3-01 — ProfileCard metadata clobber on concurrent edits
**File:line:** `web/src/app/profile/settings/page.tsx:1501`

**Evidence:**
```typescript
// Line 1501: ProfileCard.handleSave reads stale metadata from user state
const prevMeta = readMeta(user);
// ...
const { error } = await supabase.rpc('update_own_profile', { p_fields: patch });
```

Compare FeedCard.handleSave at line 2695:
```typescript
// Correct: re-read metadata immediately before writing
const { data: fresh } = await supabase
  .from('users')
  .select('metadata')
  .eq('id', userId)
  .maybeSingle();
const freshMeta = (fresh as { metadata?: Record<string, unknown> } | null)?.metadata...;
```

**Impact:** If user edits Profile (avatar, display_name) after saving Feed or A11y settings in same session, Profile save will overwrite Feed/A11y metadata because it uses stale `user` state from component mount. Settings silently lose concurrent edits.

**Reproduction:** (1) Open settings, navigate to Feed tab, toggle "Kid-safe only", click Save. (2) Go to Profile tab, edit display name, click Save. (3) Reload page or navigate away and back. Feed setting reverts to unchecked — Feed.metadata was clobbered by Profile's stale read.

**Suggested fix direction:** ProfileCard.handleSave should re-fetch `metadata` column before writing, mirroring FeedCard/AccessibilityCard pattern (M16 comment line 2693).

**Confidence:** HIGH

---

### F-B4-3-02 — Feed/A11y concurrent metadata writes undefended
**File:line:** `web/src/app/profile/settings/page.tsx:2690, 3164`

**Evidence:**
Both FeedCard and AccessibilityCard re-read metadata before save (lines 2695, 3169), which defends against *some* concurrent writes. But if two tabs in the same browser (Feed + A11y) save simultaneously:

- Feed writes at line 2717: `metadata = { ...freshMeta, feed: {...} }`
- A11y writes at line 3180: `metadata = { ...freshMeta, a11y: {...} }`

Both fetch `freshMeta` at T=0, T=0 but neither reads the *result* of the other's write.

**Impact:** If user opens settings in two browser tabs, saves Feed in tab 1, then saves A11y in tab 2 before tab 1 reloads, Tab 2's write wins and clobbers Tab 1's feed settings. Silent data loss.

**Reproduction:** (1) Open settings in two tabs. (2) In Tab 1: Feed → toggle category → Save (success). (3) Immediately in Tab 2: A11y → toggle TTS → Save (success). (4) In Tab 1, reload. Feed setting is lost.

**Suggested fix direction:** Merge strategy depends on conflict frequency. Quick fix: RPC wraps both feeds + a11y in single txn. Better: Accept that local concurrency is rare and rely on `onSaved()` → `reloadUser()` → re-hydrate; add visual "Refreshing..." state if a second save fires while first is in-flight.

**Confidence:** MEDIUM (race-condition; depends on user behavior, not code paths)

---

## HIGH

### F-B4-3-03 — Missing permission checks on individual profile fields
**File:line:** `web/src/app/profile/settings/page.tsx:1524-1525`

**Evidence:**
ProfileCard patch includes `allow_messages`, `dm_read_receipts_enabled` (lines 1524-1525), but the RPC `update_own_profile` has no per-field permission guards — it silently accepts any key in the 20-column allowlist. The client does check `hasPermission` for visibility toggles in the UI (e.g., disabled state), but the RPC does not re-verify.

Checked `/api/messages` and `/api/conversations` (POST routes): both call `requirePermission('messages.dm.compose')` correctly, but the settings *write* of `allow_messages` flag itself has no permission gate.

**Impact:** A user with 'messages.dm.compose' permission denied (free tier) could theoretically script a direct RPC call to set `allow_messages=true` (though the UI would show it disabled). On next login, if permission system reloads, the flag would be rejected. Risk is LOW if permission cache is always re-checked on load, but code path is undefended.

**Reproduction:** Code-reading only. `update_own_profile` RPC (schema/085_add_update_own_profile_rpc_2026_04_19.sql) has no permission re-check; it trusts client auth header only.

**Suggested fix direction:** Add a pre-RPC permission check in settings.page.tsx before calling update_own_profile for `allow_messages` changes, or move validation into an RPC wrapper.

**Confidence:** MEDIUM

---

### F-B4-3-04 — No validation on `profile_visibility` enum
**File:line:** `web/src/app/profile/settings/page.tsx:1521`

**Evidence:**
Profile visibility is a string enum stored directly from dropdown (line 1985-1986 shows options: 'public', 'followers', 'private'). The client Select component enforces enum, but if a user edits the network request, arbitrary string is accepted by RPC and stored without validation.

SQL migration 085 stores `profile_visibility` as `varchar` with no CHECK constraint.

**Impact:** Invalid enum values (e.g., `profile_visibility: 'admin_only'`) silently persist and may cause rendering bugs on reader surfaces that switch on visibility.

**Reproduction:** (1) Open DevTools, find profile save request. (2) Intercept and change `profile_visibility` to `'invalid'`. (3) Request succeeds. (4) Reload profile — visibility is corrupted.

**Suggested fix direction:** Add CHECK constraint to `users.profile_visibility` column, or validate in RPC before update.

**Confidence:** MEDIUM

---

## MEDIUM

### F-B4-3-05 — Alerts preferences saved per-key, not batched
**File:line:** `web/src/app/profile/settings/page.tsx:2980-3035`

**Evidence:**
AlertsCard iterates alert rows, each with a Switch and per-channel Checkboxes (lines 2990-3028). Each checkbox change calls `update(r.key, ...)` which triggers a per-key save (not shown in excerpt but visible at lines ~2950). Each save is a separate RPC call, not batched.

**Impact:** If user disables multiple alerts in quick succession, multiple in-flight requests queue up. If one fails mid-batch, partial state corruption is possible (some prefs saved, others not). UI doesn't show which saves succeeded/failed per alert.

**Reproduction:** (1) Alerts tab. (2) Rapidly toggle 3 different alerts. (3) Network throttle to 2G. (4) Observe multiple pending requests. Close settings before all complete. (5) Reopen — some alerts reverted, others stuck in new state.

**Suggested fix direction:** Batch all alert changes and commit with a single RPC call, or debounce per-alert saves and show "Saving..." badge until debounce fires.

**Confidence:** MEDIUM

---

### F-B4-3-06 — BlockedCard unblock has no RLS re-check at API layer
**File:line:** `web/src/app/profile/settings/page.tsx:3281`

**Evidence:**
```typescript
const { error } = await supabase.from('blocked_users').delete().eq('id', id);
```

Direct client DELETE to `blocked_users` table. RLS policy should prevent unblocking others' blocks, but client library is auth-header-only; no re-permission check.

**Impact:** If RLS policy on `blocked_users` is misconfigured, a user could unblock someone else's blocks (though unlikely given the schema; actual risk is LOW if RLS is enforced).

**Reproduction:** Code-reading only.

**Suggested fix direction:** Move unblock through an RPC with explicit user_id match check, or verify RLS policy audit logs.

**Confidence:** LOW

---

## UNSURE

### F-B4-3-07 — onSaved() callback timing after ProfileCard save
**File:line:** `web/src/app/profile/settings/page.tsx:1535-1537`

**Evidence:**
```typescript
setEditing(false);   // line 1535
markDirty(false);    // line 1536
await onSaved();     // line 1537
```

ProfileCard calls `setEditing` before `await onSaved()`. The `dirty` state computed at line 1482 is `editing && current !== snapshot.current`. When editing flips to false, dirty becomes false *immediately*, even though onSaved (reloadUser) is still in-flight.

**Question:** Is the beforeunload handler (line 661-667) truly protected if a second save fires while onSaved is pending? 

**Evidence:** The handler checks `dirtyKeys.size === 0`. If user (1) saves, (2) immediately closes tab before onSaved completes, the handler may incorrectly think there's no dirty state and allow unload without warning.

**Reproduction:** (1) Edit Profile. (2) Click Save. (3) Immediately hit Cmd+W to close tab, before toast appears. (4) Observe whether beforeunload fires a warning.

**Resolution:** Test actual behavior. If unprotected, move `markDirty(false)` to *after* `await onSaved()`.

**Confidence:** LOW

---

