# T73 — Wave 1 → Wave 2 Permissions Retirement Inventory

**Status:** Inventory only. No code changes. Owner-decision required before sequencing the migration PR.

**Source of truth:** `web/src/lib/permissions.js` exposes both the legacy section-scoped path (`getCapabilities(section)` + `getCapability(key)`, backed by `get_my_capabilities` RPC) and the Wave 2 full-resolver path (`refreshAllPermissions()` + `hasPermission(key)` + `getPermission(key)`, backed by `compute_effective_perms` RPC). Version polling via `my_perms_version` invalidates both caches on bump (see L2 comment in `permissions.js`), so the two paths are coherent at runtime — but every call site is paying for whichever path it picked.

The Wave 2 path is strictly more capable: it returns the full `{ granted, granted_via, source_detail, deny_mode, lock_message, label, lock_reason }` row for any permission key, in a single RPC, regardless of section. The legacy path only returns capabilities scoped to a single section, requires the caller to know the section name, and forces an extra RPC per section visited.

This document inventories every legacy call site and assesses the swap.

---

## Direct legacy call sites

### `web/src/lib/permissions.js`
- **Lines 145–168** — definition of `getCapabilities(section)`. Wraps `supabase.rpc('get_my_capabilities', { p_section })`, populates `sectionCache`.
- **Lines 193–199** — definition of `getCapability(key)`. Walks `sectionCache` for any row matching `key`.
- **Status:** retire alongside the last consumer. Leaving the export live until then is harmless.

### `web/src/components/PermissionsProvider.tsx`
- **Line 17** — imports `getCapabilities` from `../lib/permissions`.
- **Line 149** — wires `getCapabilities` into the context as `fetchSection`.
- **Lines 168–189** — defines `useCapabilities(section)` hook, which calls `fetchSection(section)` on mount + on `tick` change.
- **Status:** the hook is the only consumer of `fetchSection`; once `useCapabilities` has no callers, both can be deleted. The provider itself stays — `usePermissionsContext` is still used by `LockedFeatureCTA` and `LockModal` for the `tick`/`reload` plumbing.

### `web/src/components/PermissionGate.tsx`
- **Line 7** — imports `useCapabilities`.
- **Line 38** — `PermissionGate` consumes `useCapabilities(section)` to read `{ get, ready }`, then `get(permission)` to fetch the row for the gated key.
- **Line 116** — `PermissionGateInline` does the same.
- **Status:** the only two `useCapabilities` consumers in the entire codebase. If both are rewritten to read from `getPermission(key)` + a `tick`-aware ready signal, `useCapabilities` and `fetchSection` can be deleted.

### `web/src/lib/permissionKeys.js`
- **Line 12** — comment-only reference: "get_my_capabilities(section)". Cosmetic; update when the legacy path goes away.

### `web/src/types/database.ts`
- **Line 10817** — auto-generated type for `get_my_capabilities` RPC. Will regenerate from `supabase gen types typescript` (script: `web/package.json` → `types:gen`) once the RPC is dropped at the DB level.

### `<PermissionGate>` consumers
None visible in the audit grep — `PermissionGate` was already migrated away from in the surfaces listed below (search for `import.*PermissionGate` returns only the `PermissionCapability` type re-export in `PermissionsProvider.tsx` line 25). The component is currently dead code with respect to JSX usage — kept alive only by its own internal hook reference. Worth confirming with a fresh tree-wide grep before the swap; the `<PermissionGate ...>` JSX form may be in a `.tsx` file that grep variations missed.

---

## Already-migrated surfaces (Wave 2 native)

These call `hasPermission(key)` directly off the full-resolver cache. No legacy path involvement:

- `web/src/app/NavWrapper.tsx` (admin dashboard view, search.basic)
- `web/src/app/page.tsx` (home breaking banner — free + paid variants)
- `web/src/app/recap/page.tsx` (recap.list.view)
- `web/src/app/recap/[id]/page.tsx` (recap.list.view)
- `web/src/app/messages/page.tsx` (messages.dm.compose) — comment at line 15 explicitly notes the former `PermissionGate + SECTIONS.PROFILE` usage was replaced by direct `hasPermission`
- `web/src/app/admin/permissions/page.tsx` (admin.permissions.catalog.view)
- `web/src/app/admin/users/page.tsx` (admin.users.list.view)
- `web/src/app/admin/prompt-presets/page.tsx` (admin.pipeline.presets.manage)
- `web/src/app/admin/categories/page.tsx` (admin.pipeline.categories.manage)
- `web/src/app/u/[username]/page.tsx` (profile.follow, messages.dm.compose, profile.score.view.other.total, profile.card_share, profile.expert.badge.view)
- `web/src/app/leaderboard/page.tsx`

These surfaces already prove the swap pattern works.

---

## Swap-safety assessment

### Behavioural delta
The legacy path returns a `PermissionCapability` row scoped to `section`; the Wave 2 path returns the same shape from `compute_effective_perms` for any key in the resolved set. Both surface `granted`, `deny_mode`, `lock_message`, `lock_reason`, `label`. **Field parity is achieved at the resolver level**, so a `PermissionGate` rewritten on top of `getPermission(key)` would render identically.

### Cache-readiness delta
Legacy: `useCapabilities` returns `ready: true` only after `fetchSection(section)` resolves. First-paint deny. Subsequent renders cheap.

Wave 2: `getPermission(key)` returns `null` until `allPermsCache` is populated. `PermissionsProvider` already calls `refreshAllPermissions()` on initial auth and on every auth-state change; by the time a route renders, the cache is populated for any permission the user can hold.

The Wave 2 cache loads ALL permissions at once, not section-by-section, so the round-trip count drops from N (one per section visited per session) to 1 (the initial resolve). This is a strict win.

The only edge case: a synchronous `hasPermission()` reader that runs BEFORE `refreshAllPermissions()` resolves will get `false` (fail-closed by design — see lines 174–182 of `permissions.js`). The L2 comment block (lines 64–80) documents the deliberate asymmetry. Existing Wave 2 surfaces handle this by awaiting `refreshAllPermissions()` in a `useEffect` before reading; the rewritten `PermissionGate` would do the same via `tick`.

### Section identifier risk
Every legacy `<PermissionGate permission="X" section="Y">` site passes a `section` string. After the swap, `section` is unused (Wave 2 doesn't section-scope), so the prop becomes vestigial. Two clean options:
1. Keep the `section` prop, ignore it. Zero churn for callers, slight type lie.
2. Remove the `section` prop, update every `<PermissionGate>` JSX consumer to drop it. More churn, cleaner API.

Owner decision: option 2 is the production-quality call IF the consumer set is small (per the audit: appears to be zero JSX consumers — needs final verification). If it's small, do the full rip.

### Risk of leaving both paths live
- **Cost of doing nothing:** every page that mounts a Wave-2-aware ancestor is paying for one `compute_effective_perms` round-trip per session AND legacy section-scoped round-trips per section visited. The legacy path also keeps an entire RPC (`get_my_capabilities`) in the DB schema.
- **Cost of partial migration:** none — both caches are coherent on version bump (see `refreshIfStale` lines 81–99 of `permissions.js`). The only ongoing cost is dev confusion about which to use.

### Risk of the swap itself
Low. The Wave 2 path is older and more battle-tested at this point (every nav check, every admin gate, every profile/recap surface routes through it). The legacy path's only remaining consumer is `PermissionGate` + `PermissionGateInline`, which themselves appear unused.

---

## Recommended sequencing (NOT EXECUTED)

1. Tree-wide grep for `<PermissionGate` and `<PermissionGateInline` JSX to confirm zero/low consumer count. (Initial grep: zero JSX consumers.)
2. If zero consumers: delete `PermissionGate.tsx` outright. Remove `useCapabilities`, `fetchSection`, the `getCapabilities`/`getCapability` exports, and the `get_my_capabilities` RPC.
3. If small consumer count: rewrite `PermissionGate` against `getPermission(key)` + `usePermissionsContext().tick`, drop the `section` prop, update each consumer site.
4. Regenerate `web/src/types/database.ts` via `npm run types:gen` after the RPC drop.
5. Update the comment in `web/src/lib/permissionKeys.js` line 12.

**Owner decision required:** retire Wave 1 (steps 1–5 above) vs keep both paths indefinitely. Both are technically defensible; the audit calls this DEBT, not bug.
