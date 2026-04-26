---
wave: B
group: 13 (UI Smoke Test — Adult Web)
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — UI Smoke Test (Adult Web), Wave B, Group 13, Agent 1

## CRITICAL

### F-B13-1-01 — Admin settings numeric inputs do not persist on every keystroke; save is lost if user navigates before onBlur

**File:line:** `web/src/app/admin/comments/page.tsx:276-287`

**Evidence:**
```typescript
// Line 276: onChange fires immediately on every keystroke
onChange={(e) => setNums((prev) => ({ ...prev, [item.num as string]: parseInt(e.target.value, 10) || 0 }))}

// Line 277: onBlur triggers the actual save via updateNum()
onBlur={(e) => updateNum(item.num as string, (e.target as HTMLInputElement).value)}
```

The `onChange` handler updates React state but does NOT call `persistSettings()`. The `updateNum()` function that actually saves is only called on `onBlur`. If a user:
1. Types a value (state updates, UI refreshes)
2. Navigates away without clicking another field (no blur event)
3. Refreshes the page

The numeric value reverts to its pre-edit state. The same pattern appears twice: lines 276–277 and 286–287 (for `num` and `num2` inputs respectively).

**Impact:** Data loss. Admin users editing quiz pass thresholds, health score limits, or other numeric settings lose unsaved edits on tab/window close. Production risk: settings drift, unexplained state inconsistency.

**Reproduction:**
1. Go to `/admin/comments` (discussion settings page)
2. Edit any numeric field (e.g., "of 3 correct" under Quiz Gate > Pass threshold)
3. Type a new value (state updates visually)
4. Close the tab / navigate to another route without clicking blur
5. Return to settings; value reverts to original

**Suggested fix direction:** Debounce `onChange` and trigger `persistSettings()` on debounce timeout, or auto-blur numeric inputs after value confirmation.

**Confidence:** HIGH

---

### F-B13-1-02 — Profile settings visibleSet useMemo suppresses exhaustive-deps but reads uncaptured global function hasPermission()

**File:line:** `web/src/app/profile/settings/page.tsx:642`

**Evidence:**
```typescript
const visibleSet = useMemo(() => {
  const q = debouncedSearch.trim().toLowerCase();
  const out = new Set<string>();
  for (const section of SECTIONS) {
    if (section.gateKey && !hasPermission(section.gateKey)) continue;  // <-- reads global function
    for (const sub of section.subsections) {
      if (sub.gateKey && !hasPermission(sub.gateKey)) continue;
      // ... filtering logic
    }
  }
  return out;
}, [debouncedSearch, permsReady]); // eslint-disable-line react-hooks/exhaustive-deps
```

The `useMemo` calls `hasPermission()` (imported from `@/lib/permissions.js:33`) but does NOT include it in the dependency array. The eslint-disable suppresses the warning. While `hasPermission()` is a pure function reading from module-level caches, the dependency omission creates a stale-closure risk: if the permission cache updates but `permsReady` doesn't change (timing edge case), the `visibleSet` may not recalculate, leaving the user viewing settings sections they no longer have access to.

**Impact:** Permission gate bypass (UI-level only; server enforces). After a role or plan downgrade, settings sections that should be hidden remain visible until next re-render or `permsReady` changes. Mostly cosmetic for settings pages, but misleading UX.

**Reproduction:**
1. Admin logs in with `settings.expert.view` permission enabled
2. Another admin revokes the permission and calls `bump_user_perms_version()`
3. Client calls `refreshIfStale()` and clears cache + refetches
4. `permsReady` toggles → `visibleSet` recalculates → expert section is hidden (works by accident)
5. BUT: if cache invalidation happens WITHOUT `permsReady` toggle, `visibleSet` stale-closes over old permission state

**Suggested fix direction:** Add `hasPermission` as a dependency, or move permission read into a separate `useMemo` with `[permsReady]` dependency, then use that result in `visibleSet`.

**Confidence:** MEDIUM (edge case; cache invalidation + render timing must align badly for user-visible effect)

---

## MEDIUM

### F-B13-1-03 — Admin settings upsert endpoint accepts user-controlled string as setting key with minimal validation

**File:line:** `web/src/app/api/admin/settings/upsert/route.ts:36-38, 57-62`

**Evidence:**
```typescript
const body = (await request.json().catch(() => ({}))) as Body;
const key = typeof body.key === 'string' ? body.key.trim() : '';
if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });
// ... no regex or allowlist check ...
const { error } = await service
  .from('settings')
  .upsert(
    { key, value, updated_by: actor.id, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
```

The endpoint accepts any non-empty string as a settings key and UPSERTs it into the `settings` table. There is no allowlist validation (e.g., `if (!['quiz_pass_min', 'health_max', ...].includes(key))`). An admin with `admin.settings.edit` permission can:
1. POST `{ key: 'arbitrary_config_key', value: '1' }` 
2. Create a new row in the `settings` table
3. Pollute the keyspace or create a denial-of-service if downstream code iterates all settings rows

**Impact:** Unauthorized settings mutation. Admin can create bogus config keys, leading to data integrity issues or confusion. Low severity because permission gate (`requirePermission('admin.settings.edit')`) limits to trusted admins, but violates the principle of least privilege.

**Reproduction:**
1. As an admin, POST `/api/admin/settings/upsert` with `{ key: 'my_custom_key', value: 'foo' }`
2. Check the `settings` table; row is created with the custom key
3. No error or validation failure occurs

**Suggested fix direction:** Maintain an allowlist of valid setting keys (mirror the hardcoded `DEFAULT_SETTINGS` map from admin/comments/page.tsx) and reject any key not in the set.

**Confidence:** MEDIUM (good permission gate mitigates; still a best-practice gap)

---

## LOW

### F-B13-1-04 — CommentComposer useEffect depends only on parentId, but fetches mute state for the current user

**File:line:** `web/src/components/CommentComposer.tsx:43-73`

**Evidence:**
```typescript
useEffect(() => {
  (async () => {
    await refreshAllPermissions();
    await refreshIfStale();
    setCanPost(hasPermission(parentId ? 'comments.reply' : 'comments.post'));
    setCanMention(hasPermission('comments.mention.insert'));
    setPermsLoaded(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('users')
      .select('is_banned, is_muted, mute_level, muted_until')
      .eq('id', user.id)
      .maybeSingle();
    // ... mute state logic ...
  })();
}, [parentId]);  // <-- only parentId
```

The effect runs only when `parentId` changes. However, the effect also fetches mute state for `user.id`, which is determined dynamically at runtime and could change if the user logs out and back in (or session refreshes). If a user logs out without unmounting the component, then logs back in as a different account, the mute state remains stale.

**Impact:** Low. Mute state persists from previous user session in the same browser tab. User may see a "posting is disabled" banner when they shouldn't (or vice versa) immediately after login—until the component re-mounts or parentId changes. Limited scope because most flows reload the page on auth state change.

**Reproduction:**
1. User A logs in; component fetches their mute state (not muted)
2. User A logs out; component does NOT re-run useEffect
3. User B logs in on same browser tab
4. Component still reflects User A's mute state until parentId or component re-mounts

**Suggested fix direction:** Add a dependency on `userId` (derived from `supabase.auth.getUser()`) or refactor to trigger on auth state change event, not just parentId.

**Confidence:** LOW (edge case; most auth flows reload the page)

---

## UNSURE

None identified in the 15-minute scope. All findings above were code-reading only; UI testing of the coming-soon wall and quiz → comment flow was deferred to agents 2 and 3.

