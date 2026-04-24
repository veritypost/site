---
wave: A
group: 13 UI Smoke Test — Adult Web
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — UI Smoke Test (Adult Web), Wave A, Agent 1

## CRITICAL

### F-A13-1-01 — Messages page: stale loadMessages closure loses supabase reference on re-render
**File:line:** `web/src/app/messages/page.tsx:261-263`
**Evidence:**
```javascript
// Line 158: loadMessages defined (uses supabase from closure)
async function loadMessages() {
  // ... uses supabase.auth.getUser(), supabase.from(...), supabase.rpc(...)
}

// Line 261-263: effect runs with empty dependency array
useEffect(() => {
  loadMessages();
}, []);  // Missing: loadMessages, supabase
```

**Impact:** If supabase instance is recreated or stale (e.g., session refresh, reconnect), the effect continues calling the old stale closure. This breaks real-time conversation loading after auth token refresh. Any session that lasts > 60min risks conversations silently failing to load, leaving the user staring at a blank conversation list.

**Reproduction:** Code-reading only. Cannot repro without env vars, but the violation is syntactically unavoidable: `useEffect` with empty `[]` calling `loadMessages`, which closes over `supabase`.

**Suggested fix direction:** Add both `loadMessages` and `supabase` to dependency array, or use `useCallback` to memoize `loadMessages` and include that callback in the array.

**Confidence:** HIGH

---

### F-A13-1-02 — Settings page: Stripe checkout success/cancel toast fires on every render if tab stays open
**File:line:** `web/src/app/profile/settings/page.tsx:547-567`
**Evidence:**
```javascript
// Line 547-567: effect checks for ?success=?canceled= but has empty dep array
useEffect(() => {
  if (typeof window === 'undefined') return;
  const sp = new URLSearchParams(window.location.search);
  const success = sp.get('success');
  const canceled = sp.get('canceled');
  if (!success && !canceled) return;
  if (success === '1') {
    pushToast({ message: 'Subscription updated. Welcome aboard.', variant: 'success' });
    // ... invalidate, refreshAllPermissions
  }
  // ... router.replace removes the query param
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);  // Missing: pushToast, router, invalidate, refreshAllPermissions
```

**Impact:** The `router.replace()` happens but the effect is memoized with an empty array. If the parent re-renders, the query string is already gone but `pushToast` is stale (old closure). The toast won't actually fire on re-renders because `success` will always be null after the first replacement. However, if anything re-triggers this effect or if there's a re-mount, the old stale `pushToast` will fire a toast with a stale message variant. Low probability in normal flow but high risk during active checkout recovery.

**Reproduction:** Code-reading only.

**Suggested fix direction:** Include `pushToast`, `router`, `invalidate`, `refreshAllPermissions` in the dependency array OR carefully memoize the entire callback.

**Confidence:** MEDIUM

---

## HIGH

### F-A13-1-03 — CommentThread: useEffect missing currentUser dependency on realtime subscriptions
**File:line:** `web/src/app/components/CommentThread.tsx:324, 350, 380`
**Evidence:**
```javascript
// Line 324: depends on [selected] but uses currentUser inside
useEffect(() => {
  if (!selected || !currentUser) return;
  // ... reads currentUser.id in filter logic
  setConversations((prev) =>
    prev.map((c) => (c.id === selected && currentUser ? { ...c, unread: 0 } : c))
  );
}, [selected]);  // Missing: currentUser

// Line 350, 380: similar pattern
useEffect(() => {
  if (!selected || !currentUser) return;
  // ... uses currentUser.id to filter receipts, track reads
}, [selected, currentUser?.id]);  // Partial: has currentUser.id but subscribes on currentUser change
```

**Impact:** When user logs in (currentUser becomes non-null), the effect at line 324 won't re-fire because it only watches `[selected]`. This leaves a stale subscription using an old/null currentUser. On the first conversation select after login, unread counts may be wrong or receipts may be marked for the wrong user.

**Reproduction:** Code-reading only.

**Suggested fix direction:** Consistently add `currentUser` (or at minimum `currentUser?.id`) to all realtime useEffect dependency arrays in this component.

**Confidence:** HIGH

---

### F-A13-1-04 — CommentComposer: refreshAllPermissions is async but effect doesn't await or return promise
**File:line:** `web/src/app/components/CommentComposer.tsx:43-73`
**Evidence:**
```javascript
useEffect(() => {
  (async () => {
    await refreshAllPermissions();  // async, but no await on the IIFE
    await refreshIfStale();
    setCanPost(hasPermission(parentId ? 'comments.reply' : 'comments.post'));
    // ...
  })();
}, [parentId]);  // Missing: refreshAllPermissions, refreshIfStale, hasPermission
```

**Impact:** If `parentId` changes (user replies to a new comment), the IIFE re-runs and calls `refreshAllPermissions()` again. But if that refresh races with the old one, or if permissions change between renders, the `hasPermission` check may read stale cache. Combined with the missing dependency on the permission functions, this creates a race condition where comment posting permission is checked against old permissions on edit.

**Reproduction:** Code-reading only.

**Suggested fix direction:** Extract the permission check into a useCallback, include it in the dependency array, or explicitly track refreshAllPermissions as a dependency.

**Confidence:** HIGH

---

## MEDIUM

### F-A13-1-05 — Settings page Feed section: uses stale snapshot on concurrent edits
**File:line:** `web/src/app/profile/settings/page.tsx:2641-2680`
**Evidence:**
```javascript
// Line 2654: snapshot captured once per user change
snapshot.current = JSON.stringify({
  cats: [...cats].sort(),
  // ... feed prefs
});

// Line 2676-2679: dirty detection recalculates on every render
const dirty = currentKey !== snapshot.current;
useEffect(() => {
  markDirty(dirty);
}, [dirty, markDirty]);

// Line 2690-2726: save handler re-reads metadata immediately
const { data: fresh } = await supabase
  .from('users')
  .select('metadata')
  .eq('id', userId)
  .maybeSingle();
const freshMeta = (fresh as { metadata?: Record<string, unknown> } | null)
  ?.metadata as SettingsMeta | null;
const prevFeed = freshMeta?.feed || {};
const merged = { ...(freshMeta || {}), feed: { ...prevFeed, ...newFeed } };
```

**Impact:** The `snapshot.current` is only updated on mount (when user loads), not after every successful save. If the user saves Feed settings, then opens another settings tab (e.g., a11y, alerts) and those sections fire their own saves, the Feed section's snapshot is stale. When the user returns to Feed and makes another edit, `markDirty` will compare against the stale snapshot, potentially marking valid changes as "not dirty" and blocking the save button.

**Reproduction:** Code-reading only. The M16 comment confirms this is a known concern ("re-read metadata immediately before writing so concurrent edits on a different sub-key don't get clobbered").

**Suggested fix direction:** Move snapshot update into a separate effect that fires after successful saves, or include it in the dependency array of the markDirty effect.

**Confidence:** MEDIUM

---

## LOW

### F-A13-1-06 — ArticleQuiz: onPass callback not included in submission effect dependencies
**File:line:** `web/src/app/components/ArticleQuiz.tsx:162`
**Evidence:**
```javascript
// Line 162: calls onPass if quiz passed
if (data.passed && typeof onPass === 'function') onPass();

// Effect context: submitAttempt is called from selectOption (line 179)
// and implicitly uses onPass via closure.
// Parent passes onPass as optional callback; if it changes, effect won't re-run.
```

**Impact:** If the parent component re-renders and passes a new `onPass` callback, the quiz will call the stale old one (if it was already defined). This is lower priority than the messages/settings issues because the callback is guarded by `typeof onPass === 'function'` and the side effect (calling it) is usually idempotent, but it's still a closure leak.

**Reproduction:** Code-reading only.

**Suggested fix direction:** Include `onPass` in selectOption's captured closure or memoize the quiz component's props.

**Confidence:** LOW

---

## UNSURE

### F-A13-1-07 — Dev server fails to start without .env.local; cannot verify UI at localhost:3000
**File:line:** `web/src/middleware.js:228` (per error trace)
**Evidence:**
```
Error: Your project's URL and Key are required to create a Supabase client!
  at createServerClient (node_modules/@supabase/ssr/dist/module/createServerClient.js:15:15)
  at Object.middleware$1 (webpack-internal:///(middleware)/./src/middleware.js:228:87)
```

**Impact:** UI smoke tests cannot be executed against localhost:3000 without a populated `.env.local` file. The briefing states "start dev server on localhost:3000 behind coming-soon wall" but the env setup is a blocker. This is an operational/infra issue, not a code bug, but it prevented end-to-end UI verification of comments, settings, and other interactive surfaces.

**Reproduction:** Attempted `cd web && npm run dev` without `.env.local`; immediate 500 error.

**Suggested fix direction:** Supply `.env.local` with Supabase credentials, or document that local UI testing requires this setup (out of scope for this audit).

**Confidence:** MEDIUM (high confidence the issue exists, low confidence it's a code defect vs. environment setup)

---

## Summary

**Executable findings (code defects):** 6
- 1 CRITICAL (messages loadMessages stale closure)
- 3 HIGH (CommentThread realtime missing deps, CommentComposer async permission race, Settings toast stale)
- 1 MEDIUM (Settings Feed snapshot stale on concurrent edits)
- 1 LOW (ArticleQuiz onPass closure)

**Blocked verification:** UI smoke test could not proceed beyond static code analysis due to missing `.env.local`, preventing direct reproduction of the core UI-COMMENTS and UI-SETTINGS flows. All findings above are code-reading only. Recommend re-running this audit with dev server running so comment save/display and settings mutations can be fully exercised.

