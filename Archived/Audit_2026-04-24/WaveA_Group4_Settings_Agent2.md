---
wave: A
group: 4 (Profile + Settings + Messages)
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Profile + Settings + Messages, Wave A, Agent 2

## CRITICAL

### F-42-01 — Unblock bypasses rate limit + authorization gate
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

vs. authorized route at `web/src/app/api/users/[id]/block/route.js:87-122`:
```javascript
export async function DELETE(_request, { params }) {
  let user;
  try {
    user = await gate(params.id);  // requirePermission + email_verified check
  } catch (err) { ... }
  
  const rate = await checkRateLimit(service, {
    key: `users-block:${user.id}`,
    policyKey: RATE.policyKey,
    max: RATE.max,
    windowSec: RATE.windowSec,
  });
  if (rate.limited) return rateLimited();
  
  const { error } = await service
    .from('blocked_users')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', params.id);
```

**Impact:** 
- Settings page unblock bypasses rate limits entirely (30/60s gate in API is ignored).
- Direct RLS-only protection relies on `blocked_users` policy; if RLS is misconfigured or the table allows deletes on rows not owned by current_user_id, any user can unblock anyone.
- Inconsistent unblock path: block goes through API route, unblock goes direct. Owner expects both paths to honor same gates.

**Reproduction:** 
1. Enter /profile/settings.
2. Scroll to "Blocked users" section.
3. Click "Unblock" on any blocked user.
4. Direct DELETE hits RLS only, bypasses rate limit + permission checks.

**Suggested fix direction:** Route unblock through DELETE /api/users/[id]/block endpoint instead of direct supabase.delete().

**Confidence:** HIGH — code audit confirms the inconsistency.

---

### F-42-02 — Block/unblock not gated on per-role messaging rights
**File:line:** `web/src/app/profile/settings/page.tsx:3256` and `web/src/app/api/users/[id]/block/route.js:14-26`
**Evidence:**
```typescript
// Settings page — BlockedCard renders unconditionally for all roles
const BlockedCard = ({ userId, highlight, supabase, pushToast }: { ... }) => {
  const canUnblock = hasPermission(PERM.ACTION_BLOCKED_UNBLOCK);  // permission check exists
  // ...renders blocking UI anyway even if !canUnblock
```

vs. block API requires only:
```javascript
async function gate(targetId) {
  const user = await requirePermission('settings.privacy.blocked_users.manage');
  if (!user.email_verified) { ... }
```

But the spec says "DM permission gating" — free tier + anon should not be able to block. The permission key `settings.privacy.blocked_users.manage` is not in the PERM map, so it's not gated by per-tier visibility.

**Impact:** 
- Free/anon users may see "Blocked users" section and attempt unblock, hitting RLS errors instead of clean "You don't have permission" message.
- No validation that blocker has DM access before allowing block/unblock.

**Reproduction:** 
1. Log in as free-tier user.
2. Navigate to /profile/settings#blocked.
3. BlockedCard renders, button available if permission `settings.privacy.blocked_users.manage` is granted to free tier.
4. If granted, free user can unblock; if denied, RLS silently fails.

**Suggested fix direction:** Gate BlockedCard visibility on messaging permission (e.g., `hasPermission('messages.dm.compose')`), not just on unblock action.

**Confidence:** MEDIUM — Requires verification of actual permission grants to free/anon tier in DB.

---

## HIGH

### F-42-03 — Profile save success does not verify RPC response
**File:line:** `web/src/app/profile/settings/page.tsx:1528-1537`
**Evidence:**
```typescript
const { error } = await supabase.rpc('update_own_profile', { p_fields: patch });
setSaving(false);
if (error) {
  pushToast({ message: error.message, variant: 'danger' });
  return;
}
pushToast({ message: 'Profile saved', variant: 'success' });
setEditing(false);
markDirty(false);
await onSaved();
```

No validation that the RPC returned a successful response shape. If the RPC returns `null` or an empty object, success toast fires anyway. The `onSaved()` callback (reloadUser) will refetch, but the user sees "Profile saved" before verifying data actually persisted.

**Impact:** 
- User sees success toast but data may not persist if RPC silently fails.
- Race condition: if user closes browser before reloadUser completes, they lose confidence in save.

**Reproduction:** 
1. Edit profile (e.g., change display_name).
2. Click Save.
3. Inspect network: if update_own_profile RPC returns null/empty, success toast still fires.
4. User believes data saved; may not notice stale data on refresh.

**Suggested fix direction:** Validate RPC response shape (e.g., check that returned user ID matches request), or add a "Verifying..." state during onSaved() reloadUser.

**Confidence:** MEDIUM — Depends on RPC contract; if RPC always returns user shape, this is moot.

---

### F-42-04 — Feed settings concurrent edits clobbering acknowledged but not fully addressed
**File:line:** `web/src/app/profile/settings/page.tsx:2693-2717`
**Evidence:**
```typescript
// M16: re-read metadata immediately before writing so concurrent edits
// on a different sub-key (a11y, expertWatchlist) don't get clobbered.
const { data: fresh } = await supabase
  .from('users')
  .select('metadata')
  .eq('id', userId)
  .maybeSingle();
const freshMeta = (fresh as { metadata?: Record<string, unknown> } | null)
  ?.metadata as SettingsMeta | null;
const prevFeed = freshMeta?.feed || {};
const merged = {
  ...(freshMeta || {}),
  feed: {
    ...prevFeed,
    cats: [...selectedCats],
    // ... (6 more fields)
  },
};
```

M16 merge logic reads fresh metadata before write, but:
1. The fetch + RPC is not atomic; another client could write between them.
2. No version/etag check to detect concurrent writes on same `feed.*` keys.
3. A11y, expertWatchlist, notification_prefs live in same metadata blob — if two tabs edit Feed + A11y simultaneously, one loses.

**Impact:** 
- Concurrent edits on different settings tabs (Feed + A11y) can lose data silently.
- User A edits feed categories, User B edits text size simultaneously → one save clobbers the other.

**Reproduction:** 
1. Open /profile/settings in two browser tabs (same user).
2. Tab 1: change Feed categories, click Save.
3. Tab 2: change A11y text size, click Save (before Tab 1 completes).
4. Tab 2's save overwrites Tab 1's feed.cats with old value from freshMeta snapshot.

**Suggested fix direction:** Add metadata.version field and implement CAS (compare-and-set) on update_own_profile RPC, or split metadata into separate tables (feed_prefs, a11y_prefs, etc.).

**Confidence:** HIGH — Acknowledged in code, architectural limitation of single JSONB metadata column.

---

### F-42-05 — Blocked users card shows stale data after unblock
**File:line:** `web/src/app/profile/settings/page.tsx:3287`
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
  setRows((prev) => prev.filter((r) => r.id !== id));  // <-- optimistic delete
  pushToast({ message: 'Unblocked.', variant: 'success' });
};
```

After delete succeeds, the row is removed from state immediately. But:
1. No call to reload from server (compare to reloadUser pattern used in ProfileCard).
2. If the direct RLS delete actually fails server-side (policy violation), the optimistic update has already removed the row from UI.
3. User sees "Unblocked" toast but refresh shows block still exists.

**Impact:** 
- User experiences false success if RLS actually denied the delete.
- No error recovery; user must manually refresh to see truth.

**Reproduction:** 
1. Block a user (creates blocked_users row).
2. Go to Blocked users card, click Unblock.
3. If backend RLS denies (e.g., user doesn't own the row), the error is caught but the row already removed from state.
4. Refresh page → block reappears, contradicting earlier "Unblocked" toast.

**Suggested fix direction:** On unblock success, call the load() function (like onSaved → reloadUser) to re-fetch the list from server, or use RLS audit to confirm server-side delete.

**Confidence:** HIGH — Pattern mismatch vs. other cards (ProfileCard does onSaved → reloadUser).

---

## MEDIUM

### F-42-06 — Profile hydration does not reflect username/email changes immediately
**File:line:** `web/src/app/profile/settings/page.tsx:1426-1464`
**Evidence:**
```typescript
useEffect(() => {
  if (!user) return;
  setDisplayName(user.display_name || '');
  setBio(user.bio || '');
  setUsername(user.username || '');
  setAvatarUrl(user.avatar_url || '');
  const meta = readMeta(user);
  // ... (9 more state updates)
  snapshot.current = JSON.stringify({ displayName, bio, username, ... });
}, [user]);
```

When user prop updates (via reloadUser → setUserRow), ProfileCard state resets from new user. But username is read-only (not in patch at line 1513-1526), so changes to username are not actually editable by the user. However, if the field appears in the form, it creates a false impression of editability.

**Impact:** 
- User may attempt to edit username and expect it to save, but the field is not in the update_own_profile RPC patch.
- Dirty snapshot includes username, so if user only changes username, the form marks dirty but save silently ignores the change.

**Reproduction:** 
1. In ProfileCard, is username field rendered as editable input?
2. If yes: Edit username field, click Save.
3. The patch does not include username (line 1513-1526), so server ignores it.
4. After reloadUser, username reverts to original.

**Suggested fix direction:** Either (a) remove username from ProfileCard form if it's read-only, or (b) add it to update_own_profile allowlist and patch.

**Confidence:** MEDIUM — Depends on whether username is rendered as editable; requires visual inspection of ProfileCard render.

---

### F-42-07 — DM permission not enforced on conversation creation for pro/family tiers
**File:line:** `web/src/app/api/conversations/route.js:14-70`
**Evidence:**
```javascript
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('messages.dm.compose');  // Gate exists
  } catch (err) { ... }
  
  const { other_user_id } = await request.json().catch(() => ({}));
  // ...
  const { data, error } = await service.rpc('start_conversation', {
    p_user_id: user.id,
    p_other_user_id: other_user_id,
  });
```

The route requires `messages.dm.compose` permission. Per spec, DM should only be available to paid tiers (pro, family_xl, family). If a free-tier user is somehow granted this permission, they can start conversations.

**Impact:** 
- If permission matrix grants `messages.dm.compose` to free tier (data-driven bug), free users can DM paid users.
- No server-side double-check of tier at message-send time (only at conversation-start).

**Reproduction:** 
1. Check permissions table: does free tier have `messages.dm.compose` = true?
2. If yes, free user can POST /api/conversations and start DM with paid user.
3. If no, free user gets 403; feature works as designed.

**Suggested fix direction:** Verify that `messages.dm.compose` permission is NOT granted to free/anon tiers in permissions table.

**Confidence:** LOW — Requires database inspection to confirm permission grants.

---

### F-42-08 — Settings page does not invalidate permissions cache after save
**File:line:** `web/src/app/profile/settings/page.tsx:1, 34-37`
**Evidence:**
```typescript
import {
  hasPermission,
  refreshAllPermissions,
  refreshIfStale,
  invalidate,
} from '@/lib/permissions';
```

These are imported but never called in the settings page. After ProfileCard save (onSaved → reloadUser), if the user's tier or permissions changed on the server (e.g., via admin action), the client's cached permissions are stale.

**Impact:** 
- If admin upgrades free user to pro during their settings session, the UI still gates DM features based on old free-tier permissions.
- User must manually refresh page or navigate away to see new permissions.

**Reproduction:** 
1. User A logs in as free tier, opens /profile/settings.
2. Admin upgrades User A to pro tier in database.
3. User A's local permissions cache is still free tier.
4. User A's UI still hides pro-only features (e.g., ad-free toggle, family member mgmt).
5. User A must refresh to see new permissions.

**Suggested fix direction:** Call invalidate() or refreshAllPermissions() in the reloadUser callback (after onSaved completes), or in a 30-second refetch loop.

**Confidence:** MEDIUM — Missing UX polish; data is eventually consistent on refresh.

---

## LOW

### F-42-09 — Block reason field not validated
**File:line:** `web/src/app/api/users/[id]/block/route.js:53-76`
**Evidence:**
```javascript
const { reason } = await request.json().catch(() => ({}));
// ...
const { error } = await service.from('blocked_users').insert({
  blocker_id: user.id,
  blocked_id: params.id,
  reason: reason || null,
});
```

The reason field is not length-validated; a user could send a 10MB reason string, bloating the table.

**Impact:** 
- Low: blocked_users table is small (O(users^2) worst-case, but rate-limited). Malicious block of 1000 users with huge reasons would add ~10GB.
- UX: No validation message if input exceeds DB column limit; request fails silently.

**Suggested fix direction:** Validate reason length (e.g., max 255 chars) client-side and server-side.

**Confidence:** LOW — Storage attack, low priority given rate limit.

---

## UNSURE

### F-42-10 — Feed/A11y section visibility per role
**Description:** The PERM keys reference sections like `settings.expert.view`, `settings.supervisor.view`, but it's not clear which roles see which sections. The spec mentions "Per-tier section visibility (family plan = member mgmt, pro = ad-free toggle, etc.)" but the code doesn't show explicit tier→section mappings. Are these controlled by the permissions table, or hardcoded in PERM keys?

**Info to resolve:** 
- Check permissions table: which (role, permission_key) pairs grant access to `settings.expert.view`, `settings.supervisor.view`, etc.?
- Verify SECTIONS array gateKey values match permission keys actually in the DB.
- Confirm that no sections render when gateKey permission is missing (visibleSet filter at line 626-638 looks correct, but needs manual test per role).

---

**Summary:** 5 HIGH findings (unblock gate bypass, concurrent metadata clobber, etc.), 2 MEDIUM, 1 LOW, 1 UNSURE. Focus on F-42-01 (unblock RLS bypass) and F-42-04 (concurrent edits) as the "settings are fucked" root causes.

