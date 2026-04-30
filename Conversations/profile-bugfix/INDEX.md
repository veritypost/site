# Profile Bug-Fix — Index

**Last updated:** 2026-04-30 (session 3 — N-01 shipped; program code-complete again)
**Phase:** complete — no open issues
**Next session should pick up:** smoke-test on device (see checklist below); verify notification toggles save and reload correctly.

---

## Thread 1: CSP spike (2026-04-30)

**Incident:** ~20k CSP violation reports in 5 minutes from one iPhone user in `/profile?section=security`. Flooded Vercel logs, triggered alert.

**Root cause:** The middleware emitted a second `Content-Security-Policy-Report-Only` header (`buildCspStrictReport`) with `style-src` that banned `unsafe-inline`. The profile page uses heavy inline styles (palette system). Safari sends one POST to `report-uri` per violation with no deduplication. Typing in PasswordCard alone generated hundreds of reports per second.

| # | Issue | Status | Commit |
|---|---|---|---|
| C-01 | Remove `buildCspStrictReport` — strict Report-Only header generating flood | **shipped** | `916dc07` |
| C-02 | Rate-limit `/api/csp-report` — 30 reports/min sliding window per instance | **shipped** | `916dc07` |

---

## Thread 2: 14-issue profile audit (2026-04-30)

**Investigation:** 4 parallel Explore agents read every profile component. 4 confirmation agents verified fix plans against actual code before implementation. 4 implementation agents with worktree isolation applied changes.

| # | Issue | File | Status | Commit |
|---|---|---|---|---|
| P-01 | `ProfileApp` blank page on DB load failure — `userRes.error` never checked | `ProfileApp.tsx` | **shipped** | `a548c9a` |
| P-02 | `ProfileApp` banner dismiss always calls `setUser` even on API error | `ProfileApp.tsx` | **shipped** | `a548c9a` |
| P-03 | `MFACard` silently eats `listFactors()` error — no user feedback | `MFACard.tsx` | **shipped** | `a548c9a` |
| P-04 | `PasswordCard.signOut` error swallowed — no fallback feedback on partial success | `PasswordCard.tsx` | **shipped** | `a548c9a` |
| P-05 | `CategoriesSection` query errors never set error state — section hangs | `CategoriesSection.tsx` | **shipped** | `a548c9a` |
| P-06 | `MilestonesSection` same silent failure as P-05 | `MilestonesSection.tsx` | **shipped** | `a548c9a` |
| P-07 | `BookmarksSection` query error swallowed — no error state | `BookmarksSection.tsx` | **shipped** | `a548c9a` |
| P-08 | `BookmarksSection` null slug crash — `b.articles?.stories?.slug` renders `<Link href="/undefined">` | `BookmarksSection.tsx` | **shipped** | `a548c9a` |
| P-09 | `MessagesSection` catch block has no user-facing error — silent failure | `MessagesSection.tsx` | **shipped** | `a548c9a` |
| P-10 | `ActivitySection` null slug crash — `it.slug` can be null/undefined, renders broken link | `ActivitySection.tsx` | **shipped** | `a548c9a` |
| P-11 | `ExpertQueueSection.decline()` — no success toast after successful decline | `ExpertQueueSection.tsx` | **shipped** | `a548c9a` |
| P-12 | `ExpertQueueSection.postBack()` — no success toast after successful message send | `ExpertQueueSection.tsx` | **shipped** | `a548c9a` |
| P-13 | `AccountStateBanner` — `muted` case links to `/community-guidelines` which doesn't exist | `AccountStateBanner.tsx` | **shipped** | `a548c9a` |
| P-14 | `DataCard.cancelDelete()` — no loading state, button stays active during async call | `DataCard.tsx` | **shipped** | `a548c9a` |

---

## Thread 2b: Session 2 fixes (2026-04-30)

**Second investigation sweep** found 5 bugs in cards and sections not fully audited in session 1. Three shipped now; one confirmed (NotificationsCard mismatch) is open in Thread 4.

| # | Issue | File | Status | Commit |
|---|---|---|---|---|
| B-01 | `BlockedSection` query error shows "no blocks" empty state instead of error view | `BlockedSection.tsx` | **shipped** | `ecada3d` |
| B-02 | `BlockedSection` preview Unblock button stays enabled, each click fires a toast | `BlockedSection.tsx` | **shipped** | `ecada3d` |
| B-03 | `BillingCard.openPortal` — no guard on `data.url`, navigates to `"undefined"` | `BillingCard.tsx` | **shipped** | `ecada3d` |
| B-04 | `PrivacyCard.blockPicked` — removes all selected followers from UI even on partial fail | `PrivacyCard.tsx` | **shipped** | `ecada3d` |

---

## Thread 3: Toast loop fix (2026-04-30)

**Incident report:** Blocked Users section showed a flood of error toasts on load.

**Root cause:** `ToastProvider` recreated the `value` object on every render (inline arrow functions for `success`/`error`/`info`). Any component with `toast` in a `useCallback` dependency array got a stale dep and re-ran its callback — which fired `toast.error()` — which triggered a re-render — which produced a new `value` — which re-ran the callback. Infinite loop.

**Fix:** Wrapped `value` in `useMemo([show])`. Since `show` is stable via `useCallback([])`, `value` is now stable across re-renders. One-file fix; cures the loop globally for all components, not just `BlockedSection`.

| # | Issue | File | Status | Commit |
|---|---|---|---|---|
| T-01 | `ToastProvider` unstable `value` object causes `useCallback` dep loop | `Toast.tsx` | **shipped** | `780a2ac` |

---

---

## Thread 4: NotificationsCard API mismatch (found 2026-04-30, open)

**Found during session 2 investigation.** The NotificationsCard reads `data?.channels?.email`, `data?.channels?.push`, `data?.channels?.in_app` from the prefs load response (lines 70–73). But `/api/notifications/preferences` GET returns `{ preferences: [] }` — an array of `alert_preference` rows keyed by `alert_type`, not a `channels` object. The optional chaining on `data?.channels.*` always returns `undefined`, which falls back to `?? true`, so all toggles are always shown as on regardless of what's actually saved.

The PATCH (save) correctly sends `{ channels: { email, push, in_app } }` so saves likely work — but the load never reflects them.

**Fix options:**
1. Update the component to aggregate `data.preferences` array into the `{ email, push, in_app }` shape.
2. Update the GET route to return `{ channels: {email, push, in_app} }` directly (simplest contract for this component).

| # | Issue | File | Status |
|---|---|---|---|
| N-01 | NotificationsCard reads `data.channels.*` but API returns `{ preferences: [] }` — preferences never load | `NotificationsCard.tsx` + `/api/notifications/preferences` | **shipped** | `09fdb4f` |

---

## Cross-surface findings

- **`/community-guidelines` route doesn't exist** (confirmed 2026-04-30). The `AccountStateBanner` dead link was fixed (P-13), but if other surfaces link there it will 404. No other callers found in this investigation — flag for a full-repo grep if a future session investigates 404s.
- **`AppShell` has no fallback when `active` is empty.** Added a "No sections available / try refreshing" state as part of the audit. This was always reachable if the permission check returned an empty array.

---

## Smoke-test checklist (owner action, on device)

After the next deploy:

- [ ] Load `/profile?section=security` — type in PasswordCard — check Vercel logs for CSP reports (expect ≤1/keystroke from enforce-mode policy, zero from Report-Only)
- [ ] Load `/profile?section=blocked` — confirm no error toast flood
- [ ] Load each section tab — confirm no blank screens or loading spinners that never resolve
- [ ] Bookmark with a null slug (if one exists in test data) — confirm graceful fallback instead of `/undefined` link
- [ ] Trigger a real DB error (e.g., revoke network) — confirm ProfileApp shows error card instead of blank screen
- [ ] Cancel a scheduled deletion in DataCard — confirm button disables during async call

---

## Deferred items

None. All found issues were either shipped or added to cross-surface findings above.

---

## Open owner-actions

None at this time.
