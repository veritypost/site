---
wave: B
group: 4 Profile + Settings + Messages
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Profile + Settings + Messages, Wave B, Agent 1

## CRITICAL

### F-B4-1-01 — Expert Watchlist: Race condition clobbers concurrent metadata edits
**File:line:** `web/src/app/profile/settings/page.tsx:4887-4894`
**Evidence:**
```javascript
const toggle = async (id: string) => {
  const prev = cats;
  const nextCats = cats.map((c) => (c.id === id ? { ...c, watched: !c.watched } : c));
  setCats(nextCats);
  const watched = nextCats.filter((c) => c.watched).map((c) => c.id);
  const { data: u } = await supabase
    .from('users')
    .select('metadata')
    .eq('id', userId)
    .maybeSingle();
  const prevMeta = (u as { metadata?: Record<string, unknown> } | null)?.metadata || {};
  const merged = { ...prevMeta, expertWatchlist: watched };
  const { error } = await supabase.rpc('update_own_profile', { p_fields: { metadata: merged } });
```
Unlike FeedCard (line 2693-2694) and AccessibilityCard (line 3167-3168) which both re-read metadata **immediately before write** with the comment "M16: re-read metadata immediately before writing so concurrent edits on a different sub-key don't get clobbered," ExpertWatchlistCard reads metadata **once at the start of toggle()**, then proceeds with a race window where another tab could save Feed preferences or A11y settings. If user toggles watchlist while feed preferences are being saved elsewhere, the merged expertWatchlist will overwrite whatever feed prefs were just written (or vice versa), silently losing data.

**Impact:** User edits on one settings tab can erase changes made on another tab simultaneously. Owner-reported "settings are fucked" — this is likely the mechanism.

**Reproduction:** 
1. Open settings in two browser windows at the same time
2. In window A: modify Feed categories and click Save
3. In window B (before A completes): toggle an Expert Watchlist category
4. Observe: Feed categories may revert because expertWatchlist merge overwrote the fresh feed metadata

**Suggested fix direction:** Move the `select('metadata')` inside ExpertWatchlistCard.toggle() **after** UI state update but **immediately before** the RPC call, matching the FeedCard/AccessibilityCard pattern.

**Confidence:** HIGH — code pattern is identical to other cards that explicitly document this race condition; ExpertWatchlistCard missed the memo.

## HIGH

### F-B4-1-02 — Profile save does not await reloadUser() callback
**File:line:** `web/src/app/profile/settings/page.tsx:1537`
**Evidence:**
```javascript
pushToast({ message: 'Profile saved', variant: 'success' });
setEditing(false);
markDirty(false);
await onSaved();  // onSaved is reloadUser callback from line 793
```
The save succeeds and fires the success toast, but then **awaits** the reloadUser callback. However, the RPC has already returned (line 1528), so the data is persisted on the server. The await is cosmetic here — the actual user data is already stale in the component's state after the RPC returns. When reloadUser completes (573-595), it re-fetches the user row, but by then the user may have already clicked away or triggered another edit.

**Impact:** Brief window where the component state is stale vs. server truth. If a user edits profile, saves, and immediately opens the profile again in another tab or refreshes, they may see slightly out-of-sync data. Low practical impact but violates the "state is source of truth" principle.

**Reproduction:** Code review only — race is sub-second.

**Suggested fix direction:** Explicitly set the component state with the response from the RPC (if it returns data) rather than relying on async reloadUser.

**Confidence:** MEDIUM — observable but requires specific timing to manifest.

### F-B4-1-03 — Expert Watchlist toggle does not disable button during async save
**File:line:** `web/src/app/profile/settings/page.tsx:4920-4937`
**Evidence:**
```javascript
{cats.map((c) => (
  <button
    key={c.id}
    onClick={() => toggle(c.id)}
    // NO loading or disabled state
    style={{ ... }}
  >
    {c.name}
  </button>
))}
```
The toggle() async function has no associated loading state, and the button has no disabled/loading indicator. A user can tap "Politics" to add it to watchlist, then before the server round-trip completes, tap "Sports" to add that too. The second toggle() call fires while the first is still in-flight, both reading stale metadata and potentially writing conflicting merges. The UI gives no visual feedback of an in-flight request.

**Impact:** Multi-tap race condition on watchlist buttons. UX is confusing (appears instant but silently debounced on server). No indication to user that a save is in-flight.

**Reproduction:** 
1. Open expert watchlist
2. Rapidly click multiple category buttons
3. Observe: UI updates instantly but server processes race conditions silently

**Suggested fix direction:** Track busy state per category ID (like FeedCard does for the whole save, line 2622) and disable clicked buttons during async toggle.

**Confidence:** HIGH — the button implementation is clearly missing the pattern used elsewhere in the same file.

## MEDIUM

### F-B4-1-04 — Blocked users unblock bypasses reloadUser but still updates optimistically
**File:line:** `web/src/app/profile/settings/page.tsx:3279-3289`
**Evidence:**
```javascript
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
Contrast to ProfileCard (line 1537) which calls `await onSaved()` after save success. BlockedCard removes the row from local state but **never** calls the onChanged/onSaved callback (not passed to BlockedCard). If a user unblocks someone and immediately checks the user's profile, or if another tab loads the blocked list, they may briefly see stale data.

**Impact:** Optimistic update is not propagated to parent component. Secondary surfaces (user profile card showing "blocked by you" badge, or iOS sync) may lag. Low severity since unblock is rare and eventual consistency wins within seconds.

**Reproduction:** Unblock a user in settings, immediately check their profile in a new tab — may briefly show as blocked.

**Suggested fix direction:** Pass an onChanged callback to BlockedCard and invoke it after successful unblock, or directly mutate a parent-level blocked list.

**Confidence:** MEDIUM — optimization gap, not a correctness bug, but inconsistent with other card implementations.

### F-B4-1-05 — Account deletion route lacks explicit CSRF origin check for Bearer tokens
**File:line:** `web/src/app/api/account/delete/route.js:62-64`
**Evidence:**
```javascript
const origin = request.headers.get('origin');
if (!isAllowedOrigin(origin)) {
  return { user: null, authClient: null };
}
```
The comment on line 21-23 states: "Bearer branch skips the origin check because mobile clients do not send a trustworthy Origin." However, there is no explicit code path that branches here. If a Bearer token is provided, the code falls through to the origin check anyway and may fail silently (returns null user) instead of failing the Bearer branch gracefully. The intent is clear but the implementation is ambiguous — the Bearer branch (lines 53-59) does NOT check origin, but neither is there a guard that **prevents** the origin check from running after.

**Impact:** Mobile deletion via Bearer token could fail if origin header is present and not in the allowlist. Or conversely, if origin is missing, the Bearer branch succeeds but web origin check is redundantly skipped.

**Reproduction:** Call DELETE /api/account/delete with `Authorization: Bearer <token>` from a non-allowlisted origin; observe behavior.

**Suggested fix direction:** Add explicit return in Bearer branch (line 59) so the function exits before the origin check (lines 61-64). Comment is correct but code doesn't match intent.

**Confidence:** MEDIUM — control flow is unclear but likely works by accident (both branches converge).

## LOW

### F-B4-1-06 — Messages/Conversations RPC error handling does not distinguish DM_MISSING_IDS
**File:line:** `web/src/app/api/conversations/route.js:51`
**Evidence:**
```javascript
else if (code === 'DM_MISSING_IDS') status = 400;
else if (msg.includes('not found')) status = 404;
```
Both "conversation_id missing" (DM_MISSING_IDS, line 51, status 400) and "user not found" (USER_NOT_FOUND, line 49, status 404) resolve to "Recipient not found." (line 60) or "not found" generic message. A user trying to start a conversation with a nonexistent recipient gets the same message as if they omitted a required field. The error is correct but the specificity could be higher.

**Impact:** User UX is slightly less precise. Error codes are stabilized (schema/150, line 41-42) but the userMsg lookup (lines 57-65) conflates them.

**Reproduction:** Try to start conversation with nonexistent user_id vs. missing other_user_id; both show "Recipient not found."

**Suggested fix direction:** Add explicit `else if (code === 'DM_MISSING_IDS') { userMsg = 'Required field missing'; }` branch.

**Confidence:** LOW — cosmetic issue, error handling is correct, just imprecise.

### F-B4-1-07 — Billing section visibility gates on PERM.SECTION_BILLING_VIEW but does not exist in permissions table
**File:line:** `web/src/app/profile/settings/page.tsx:370, 102`
**Evidence:**
```javascript
// Line 102:
ACTION_BILLING_INVOICE_DL: 'billing.view.plan', // no dedicated "invoice download"

// Line 370:
gateKey: PERM.SECTION_BILLING_VIEW, // maps to 'billing.view.plan' (line 77)
```
The comment on lines 105-108 flags that some keys ("settings.profile.edit.own", "settings.expert.edit") could NOT be found in the DB. PERM.SECTION_BILLING_VIEW ('billing.view.plan') is mapped to line 77 and used to gate the entire Billing section (line 370), but the permission key should perhaps be more specific (e.g., 'billing.view' vs 'billing.view.plan'). The comment suggests these mismatches were known during migration but not all resolved.

**Impact:** If a free user has 'billing.view.plan' permission but should NOT see invoices, they'll see the billing section. Unlikely since billing is usually a paid feature, but the permission model is slightly fuzzy.

**Reproduction:** Check permissions table for 'billing.view.plan' and 'billing.view' — confirm which key is actually used.

**Suggested fix direction:** Verify that 'billing.view.plan' is the correct gate for all billing subsections or split into more specific keys.

**Confidence:** LOW — unclear if this is truly a bug or a documented limitation. Needs DB schema audit to confirm.

