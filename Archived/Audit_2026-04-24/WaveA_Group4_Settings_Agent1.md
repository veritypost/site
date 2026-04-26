---
wave: A
group: 4 (Profile + Settings + Messages)
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Profile + Settings + Messages, Wave A, Agent 1

## CRITICAL

### F-G4-1-01 — Block/Unblock flow bypasses server permission gate and rate limiting

**File:line:** `web/src/app/profile/settings/page.tsx:3281`

**Evidence:**
```javascript
// BlockedCard unblock handler — direct Supabase client delete
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

**Impact:** 
- **Missing permission check:** The DELETE bypasses the `requirePermission('settings.privacy.blocked_users.manage')` gate enforced in `/api/users/[id]/block` route.
- **Email verification gate bypassed:** The API route requires `user.email_verified` before allowing unblock; the client delete skips this.
- **Rate limiting disabled:** The API route enforces rate limiting (`max: 30, windowSec: 60`); the client delete has none.
- **Inconsistent error UX:** Block flow uses the API (can return specific error messages); unblock returns raw Supabase errors.
- **Audit logging gap:** The API path may fire `audit_log` entries on the server; direct delete does not.

**Reproduction:** 
1. Log in as a user with email unverified (test account).
2. Tap unblock on a blocked user in Settings → Privacy & Safety → Blocked users.
3. Confirm unblock succeeds despite missing email verification (BUG — should fail per API gate).
4. Repeat unblock 40 times in 60 seconds: all succeed (BUG — should fail at 30).

**Suggested fix direction:** Replace the direct `supabase.from('blocked_users').delete()` call with a `DELETE /api/users/[id]/block` route call, matching the block POST flow.

**Confidence:** HIGH

---

## HIGH

### F-G4-1-02 — Data export direct RLS insert lacks per-request permission enforcement

**File:line:** `web/src/app/profile/settings/page.tsx:3393`

**Evidence:**
```javascript
const requestExport = async () => {
  setBusy('export');
  const payload: TableInsert<'data_requests'> = {
    user_id: userId,
    type: 'export',
    status: 'pending',
  };
  const { error } = await supabase.from('data_requests').insert(payload);
  // ...
};
```

RLS policy for data_requests INSERT:
```sql
policyname: data_requests_insert, qual: null  (no WHERE clause)
```

**Impact:** 
- The RLS INSERT policy has NO WHERE clause, meaning any authenticated user can INSERT to any user's data_requests row if they know the target user_id.
- Client-side `hasPermission(PERM.ACTION_DATA_EXPORT)` gate exists, but permissions can be stale or cached incorrectly.
- No server-side re-check via `requirePermission` in the mutation path.
- A user with stale permission cache after plan downgrade can still fire export requests for themselves (low-severity, but inconsistent with the block/unblock gate pattern).

**Reproduction:** 
1. Downgrade from Pro to Free plan (or revoke the export permission).
2. Before page reload, if permission cache hasn't invalidated, the "Request data export" button may still be clickable.
3. Click it; the insert likely succeeds (RLS doesn't prevent it).

**Suggested fix direction:** Add a `POST /api/data-requests/export` endpoint that calls `requirePermission('settings.data.request_export')` before inserting.

**Confidence:** MEDIUM (RLS fallback prevents worst case, but inconsistent with other mutations)

---

## MEDIUM

### F-G4-1-03 — Missing "Revert" button on Feed preferences card allows no undo after partial edits

**File:line:** `web/src/app/profile/settings/page.tsx:2728–2850` (FeedCard)

**Evidence:**
```jsx
// FeedCard only has Save, no Cancel/Revert
<div>
  <Button variant="primary" onClick={handleSave} loading={saving} disabled={!dirty}>
    Save changes
  </Button>
</div>
```

Contrast with ProfileCard:
```jsx
{editing && (
  <aside>
    <Button size="sm" onClick={() => setEditing(true)}>
      Edit
    </Button>
  </aside>
)}
// ...
<Button variant="primary" onClick={handleSave} loading={saving}>
  Save
</Button>
<Button onClick={handleCancel}>Cancel</Button>  // <-- Has revert
```

**Impact:** 
- User can toggle 8+ switches/selects (categories, kid-safe, credibility score, display density, etc.), realize a mistake mid-edit, but has NO Cancel button.
- Must save the wrong state, then load the page again and redo it.
- Dirty tracking exists (`markDirty`), so the "Unsaved changes" floating reminder fires, but no actionable button.

**Reproduction:** 
1. Go to Settings → Preferences → Feed.
2. Deselect 5 categories, toggle Kid-safe ON, raise min score to 80.
3. Realize you want to keep the old settings.
4. Look for a Cancel/Revert button — none exists.
5. Must Save (losing old prefs) or close tab/back (losing nothing but with friction).

**Suggested fix direction:** Add a `<Button onClick={handleRevert}>Cancel</Button>` button next to Save in FeedCard (and check A11y, Alerts, and other metadata-mutating cards for the same gap).

**Confidence:** MEDIUM (UX friction, not a security bug, but impacts user satisfaction)

---

## MEDIUM

### F-G4-1-04 — Settings metadata (feed, a11y, avatar) uses concurrent-edit-unsafe pattern

**File:line:** `web/src/app/profile/settings/page.tsx:2693–2717` (FeedCard save logic)

**Evidence:**
```javascript
const handleSave = async () => {
  if (!user) return;
  setSaving(true);
  // M16 comment says this was added to prevent clobbering concurrent edits,
  // but the read-then-merge-then-write is still vulnerable to lost updates.
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
    feed: { ...prevFeed, cats: [...selectedCats], ... },
  };
  const { error } = await supabase.rpc('update_own_profile', { p_fields: { metadata: merged } });
  // ...
};
```

**Impact:** 
- If user edits Feed on Tab A and A11y on Tab B simultaneously:
  - Tab A reads `metadata`, merges `feed`, writes full `metadata` (loses a11y changes from Tab B).
  - Tab B reads `metadata`, merges `a11y`, writes full `metadata` (loses feed changes from Tab A).
  - Last write wins, earlier changes lost (non-fatal, but confusing).
- The M16 comment says this was added to fix clobbering, but it's still a TOCTOU (time-of-check-to-time-of-use) race.

**Reproduction:** 
1. Open two browser tabs on Settings.
2. In Tab A, go to Preferences → Feed, deselect all categories, click Save.
3. In Tab B, go to Preferences → Accessibility, toggle TTS ON, click Save.
4. Check the final state: either feed is reset (a11y won) or a11y is reset (feed won).

**Suggested fix direction:** Use a server-side RPC with atomic `jsonb_set` to update nested keys (e.g., `update_user_feed_prefs(cats[], ...)`) instead of read-merge-write on the client.

**Confidence:** MEDIUM (race window is narrow, but possible under concurrent editing; M16 comment suggests owner is aware)

---

## LOW

### F-G4-1-05 — Email notifications preferences use client-read-only pattern without explicit server validation

**File:line:** `web/src/app/profile/settings/page.tsx:2141` (EmailsCard saveNotifs)

**Evidence:**
```javascript
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
  // No validation that these three flags are valid booleans (though TypeScript helps).
};
```

**Impact:** 
- No explicit whitelist/validation of which keys can be set in `notification_prefs` on the server.
- If a future bug or client-side injection allows extra keys (`spamMe: true`, `exfiltrateEmails: true`), the server may persist them without validation.
- `update_own_profile` RPC does not enumerate allowed metadata keys (unlike the spec'd 20-column allowlist for profile fields).

**Reproduction:** 
- Code-reading only. Cannot easily test without modifying client code or intercepting the RPC call.

**Suggested fix direction:** Document or enforce the shape of `metadata.notification_prefs` in the RPC's SQL (e.g., via a CHECK constraint or a schema comment).

**Confidence:** LOW (TypeScript + RLS provides defense-in-depth, but explicit validation would be safer)

---

## UNSURE

### F-G4-1-06 — Unclear if `profile_visibility` toggle properly hides profile on backend surfaces

**Description:** 
The ProfileCard allows toggling `profile_visibility` between 'public' and 'hidden'. The setting persists to the `users` table and is read by the settings page, but there is no tracing of:
- Whether the iOS app respects this flag (e.g., does `GET /api/users/[id]` return 403 or 404 if viewer is not the owner and profile is hidden?).
- Whether search / directory / leaderboard queries have a WHERE clause filtering hidden profiles.
- Whether the setting is cached on the client and can become stale (e.g., user hides profile, but is still visible in cached search results for 5 minutes).

**Suggested next steps:** 
- Trace `profile_visibility` usage in the API layer (e.g., `grep -r profile_visibility /web/src/app/api`).
- Confirm that profile-reading endpoints (user/[id], search, leaderboard) have a server-side check.

**Confidence:** LOW (setting exists and persists, but full enforcement unknown without API audit)

