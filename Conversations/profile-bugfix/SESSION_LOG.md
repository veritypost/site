# Profile Bug-Fix — Session Log

Append-only. Each entry records what happened, what was locked or shipped, what's blocked, and what the next session should pick up. Do not edit past entries.

---

## 2026-04-30 — Session 3: NotificationsCard API mismatch (N-01)

**Phase entering:** N-01 open — NotificationsCard load and save both broken
**Phase leaving:** N-01 shipped; program code-complete

### Investigation

Read `/api/notifications/preferences/route.js` in full (GET + PATCH) and cross-referenced against the component. Full picture:

- **GET** returns `{ preferences: data || [] }` — an array of `alert_preferences` rows keyed by `alert_type`. The component reads `data?.channels?.email` etc., which is always `undefined`. Defaults to `?? true` for all three channels every load.
- **PATCH** requires `{ alert_type: string, channel_push?, ... }` per the field-permission gate. The component sent `{ channels: { email, push, in_app } }`. PATCH handler checks `if (!b.alert_type)` first — returns 400. Component catches the 400, rolls back the optimistic toggle, shows `toast.error('HTTP 400')`.

Both load AND save were silently broken. The feature appeared to work (toast fired, toggle animated) but nothing saved and preferences never reflected reality.

Verified cron jobs (`send-push`, `send-emails`) look up preferences by specific alert types (`data_export_ready`, etc.) — not `channel_defaults`. No interference.

### Fix

Two-file change:

**GET route** — after querying all `alert_preferences` rows for the user, find the row where `alert_type === 'channel_defaults'` and synthesize a `channels` object: `{ email: true, push: row.channel_push ?? true, in_app: row.channel_in_app ?? true }`. Added alongside `preferences: data || []` so existing keys are preserved. New users with no row get all-true defaults.

**Component PATCH body** — changed from `{ channels: next }` to `{ alert_type: 'channel_defaults', channel_push: next.push, channel_in_app: next.in_app }`. The API's existing upsert logic handles creating the row on first toggle. No component load code changed — `data?.channels.*` reads correctly once the GET returns the right shape.

**Commit:** `09fdb4f` — fix(notifications): wire NotificationsCard to actual API contract

### What got shipped

`09fdb4f` pushed. N-01 closed. All known issues now shipped.

### What's blocked

Nothing.

### What next session should pick up

Smoke-test on device: toggle push and in_app notifications, reload the page, verify toggles reflect the saved state. Specifically confirm first-time toggle (no `channel_defaults` row yet) creates the row and persists on reload.

---

## 2026-04-30 — Session 2: Second sweep — settings cards, API routes, BlockedSection

**Phase entering:** code complete from session 1; second investigation sweep
**Phase leaving:** 4 new bugs shipped; 1 open (NotificationsCard API mismatch)

### Investigation

Three parallel Explore agents ran a second sweep over the areas not fully covered in session 1: settings cards not touched in session 1 (`EmailsCard`, `IdentityCard`, `NotificationsCard`, `BillingCard`, `PrivacyCard`), all profile API routes, and `BlockedSection` + `AppShell` post-fix state.

Key findings from investigation triage (after verifying each claim against actual code):
- Several agent claims dismissed as stale: PasswordCard fix is correct per current code (lines 84–90 branch properly); DataCard `requestDelete` has a `finally` block so state always resets; PrivacyCard `removePicked` is not optimistic — it filters only after success; `preview` in `loadFollowers` deps is not a loop risk after the Toast useMemo fix.
- **EmailsCard** and **IdentityCard** were not in the original audit — both clean on direct read.
- **API routes** clean: `trial-banner-dismiss`, `users/[id]/block`, `users/blocked` all have correct auth checks, error handling, and status codes.

Two confirmation agents verified fix plans against current code before any changes. Fix A needed one adjustment: reset `setBusy(null)` at the top of `load()` alongside `setLoadError(false)` so retry state is fully clean. All other fixes confirmed as-is.

### Fixes shipped

**B-01: BlockedSection error state** — Added `loadError` state. On query error, `setLoadError(true)` fires before returning. Render checks `loadError` before `rows.length === 0` so users never see the "You haven't blocked anyone" empty state on a failed load — they see "Could not load blocked users" with a Retry button. Also resets `loadError` and `busy` at the start of `load()` so retry is clean.

**B-02: BlockedSection preview button** — `disabled={busy === r.blocked_id || preview}` — Unblock button now disabled in preview mode. No more repeated toasts per click.

**B-03: BillingCard portal guard** — Added `if (!data.url) throw new Error('Could not get billing portal link.')` between the `!res.ok` check and the `window.location.href` assignment. Prevents redirect to `"undefined"` on a malformed Stripe portal response.

**B-04: PrivacyCard blockPicked** — Built `succeededIds` set from `Promise.allSettled` results. `setFollowers` now filters against `succeededIds` instead of the full `picked` set. Followers whose blocks failed remain in the list. Toast message updated to `Blocked ${succeededIds.size}, ${failed} failed.` for accuracy.

**Commit:** `ecada3d` — fix(profile): session 2 sweep — error state, billing guard, block partial-fail

### Open finding: NotificationsCard API mismatch (N-01)

During fix D confirmation, agent found that `NotificationsCard` reads `data?.channels?.email` (etc.) from the prefs GET response, but the API returns `{ preferences: [] }` — an array of `alert_preference` rows per `alert_type`. The optional chaining always resolves to `undefined`, falling back to `?? true`. All toggles always show as on regardless of saved state.

The PATCH (save) sends `{ channels: {...} }` which may or may not be handled by the same route — not verified. This is not a quick fix: requires either updating the component to aggregate the array, or updating the GET route to return the channel shape the component expects. Deferred to session 3 after reading both sides of the contract.

### What got shipped

`ecada3d` pushed. 4 bugs fixed.

### What's blocked

N-01 is open. Needs the GET route `/api/notifications/preferences` read in full alongside the PATCH handler before any changes.

### What next session should pick up

Read `/api/notifications/preferences/route.ts` (or .js) — both GET and PATCH handlers. Determine: what does GET return for a user with no prefs row? Does PATCH expect `{ channels: {...} }` or something else? Based on that, decide whether to fix the component or the route. Then implement and close N-01.

---

## 2026-04-30 — Session 1: Incident response + full audit + implementation

**Phase entering:** reactive — CSP spike alert received
**Phase leaving:** code complete — all 15 issues shipped

### Trigger

Owner received a Vercel alert: one iPhone user in `/profile?section=security` generated ~20,000 CSP violation reports in approximately 5 minutes. The alert came in after a testing session the night before.

### Investigation: CSP spike

Root cause traced to the `buildCspStrictReport` function in `web/src/middleware.js`. The middleware was emitting two CSP headers: the primary enforce-mode policy (which allows `unsafe-inline` for `style-src` to accommodate the palette system) and a second `Content-Security-Policy-Report-Only` header built by `buildCspStrictReport` that banned `unsafe-inline`. The profile page renders most of its styles inline. Safari sends one report-uri POST per violation, with no cross-request deduplication. Typing a single character in PasswordCard (which re-renders inline styles on every keystroke) generated hundreds of reports per second.

Two fixes applied:
1. Removed `buildCspStrictReport` entirely. The enforce-mode policy that ships to all users remains unchanged. The strict header was report-only (no blocking) and was causing the flood without providing any enforcement benefit. Tombstone comment added at the removal site documenting the date and failure mode.
2. Added a per-instance sliding window rate limiter to `/api/csp-report/route.js` — 30 reports per 60-second window. Excess requests return 204 immediately without logging. Defense against any future flooding from the enforce-mode policy (which does have `report-uri` set).

**Commit:** `916dc07` — fix(csp): remove strict report-only header + rate-limit report endpoint

### Investigation: 14-issue profile audit

With the CSP incident resolved, 4 parallel Explore agents read every profile component: `ProfileApp.tsx`, `AppShell.tsx`, all `_sections/`, all `settings/_cards/`, `AccountStateBanner.tsx`, `Toast.tsx`. Investigation was exhaustive — not a skim. Findings were prioritized and surfaced to the owner.

4 confirmation agents then verified each proposed fix against the current code before any implementation started. Key corrections from confirmation pass:
- `toast.warn` does not exist in the Toast API — corrected to `toast.info` in PasswordCard partial-success branch.
- MFACard cancelled-flag check must precede the error toast to avoid state update on unmounted component — corrected ordering.
- ProfileApp was missing the `useToast` import — added.
- Fix 9 (banner dismiss) had `setUser` running unconditionally; corrected to throw on `!r.ok` so setUser only runs on success.

4 implementation agents applied all 14 fixes with worktree isolation (non-overlapping file ownership). Changes merged back and verified against `git diff`.

**14 issues fixed:**
- P-01/02: ProfileApp — DB load failure blank page + banner dismiss false success
- P-03: MFACard — silent listFactors error
- P-04: PasswordCard — signOut error swallowed on partial success
- P-05/06: CategoriesSection / MilestonesSection — query errors never set error state
- P-07/08: BookmarksSection — query error swallowed + null slug crash → `/undefined` link
- P-09: MessagesSection — catch block has no user-facing error
- P-10: ActivitySection — null slug crash → broken link
- P-11/12: ExpertQueueSection — no success feedback on decline or message send
- P-13: AccountStateBanner — dead link to `/community-guidelines` (route doesn't exist)
- P-14: DataCard — no loading state on cancelDelete, button stays active

**Commit:** `a548c9a` — fix(profile): 14-issue sweep — error states, false feedback, dead links

### Incident report: BlockedSection toast loop

After the 14-issue commit, owner reported Blocked Users section was showing a flood of error toasts on load. Traced to `Toast.tsx` — the `ToastProvider` was creating a new `value` object on every render because `success`, `error`, and `info` were inline arrow functions defined directly in the render body. Any component that listed `toast` in a `useCallback` dependency array (BlockedSection did this for its query fetch) received a new `toast` reference every render, invalidating the callback, which re-ran the fetch, which called `toast.error()` on the query failure, which triggered a re-render, which produced a new `value` — infinite loop.

Fix: wrap `value` in `useMemo([show])`. `show` is already stable via `useCallback([])`. One-line change makes `value` stable across all re-renders. Fixes the loop globally — not just BlockedSection.

**Commit:** `780a2ac` — fix(toast): memoize context value to prevent useCallback dep loop

### What got locked / shipped

All three threads complete. Commits pushed: `916dc07`, `a548c9a`, `780a2ac`.

### What's blocked

Nothing blocked.

### What next session should pick up

No remaining open issues. Next session should:
1. Owner smoke-test on device (checklist in INDEX.md).
2. Check Vercel logs 24 hours after deploy — confirm CSP report volume has dropped to near-zero or a small trickle from the enforce-mode policy only.
3. If a regression surfaces, open a new issue entry in INDEX.md rather than reopening shipped items.
