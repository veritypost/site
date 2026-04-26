---
group: 10 Adult iOS end-to-end
reconciler: 1/1
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
phase: 4
---

# Reconciliation — Group 10 (Adult iOS end-to-end)

## AGREED findings (≥2 agents, both waves ideally)

### R-10-AGR-01 — Signup auth succeeds but user row insert fails → orphaned auth account
**Severity:** CRITICAL
**File:line:** `VerityPost/AuthViewModel.swift:267-283`
**Surfaced by:** WaveA Agent1, WaveA Agent2, WaveB Agent2 (3/5; WaveB Agent1 missing)
**Consensus description:** If `client.auth.signUp()` succeeds but the subsequent `users` table upsert fails (RLS violation, network error, quota), the auth account is persisted server-side but the users row is never created. On next login attempt, `loadUser()` returns nil → the app treats the authenticated user as anonymous. The account is broken and cannot be recovered without manual intervention (admin deletion of the orphaned auth user). The user sees generic "Couldn't create your account" error but the email is now permanently registered in auth.users and unusable.
**Suggested disposition:** OWNER-ACTION
**Rationale:** Requires transactional wrapping or explicit rollback via `client.auth.signOut()` on upsert failure, which needs service-role context (not available on client) or coordination with backend. The web `/api/auth/signup` endpoint already handles this pattern (rolls back auth user if role insertion fails). iOS must implement symmetric recovery.

### R-10-AGR-02 — StoreKit purchase sync posts vpSubscriptionDidChange without verifying server success
**Severity:** CRITICAL
**File:line:** `VerityPost/StoreManager.swift:277-279, 156`
**Surfaced by:** WaveA Agent1, WaveA Agent3, WaveB Agent3 (3/5)
**Consensus description:** When a StoreKit purchase completes, the transaction is immediately finalized (`transaction.finish()`) and the productID is cached in `purchasedProductIDs`. Only then does the app attempt to sync the receipt to the server. If the server sync fails (500, 4xx, network timeout), the notification `vpSubscriptionDidChange` is never posted. However, the transaction is already finalized, so `StoreManager.hasAccess()` returns true for paid features. The UI renders paid content (comments, features, gated tabs) but the backend denies mutations with 403. User sees "payment complete" in the UI but all API calls fail with permission errors, creating a broken UX.
**Suggested disposition:** AUTONOMOUS-FIXABLE
**Rationale:** Move `transaction.finish()` to occur only after server sync succeeds (2xx response), or emit a separate `vpSubscriptionSyncFailed` notification that AuthViewModel observes to surface a persistent "Restore Purchases" banner. The first option (delay transaction.finish) is safer and aligns with Apple best practices.

### R-10-AGR-03 — APNs device token registration silently dropped when user ID not yet set
**Severity:** HIGH
**File:line:** `VerityPost/PushRegistration.swift:44-47, VerityPost/ContentView.swift:106-107`
**Surfaced by:** WaveA Agent1, WaveA Agent2, WaveB Agent2, WaveB Agent3 (4/5)
**Consensus description:** When APNs delivers a device token, `PushRegistration.handleDeviceToken()` guards on `lastUserId != nil` and returns silently if the user ID is not yet available. On app startup, `ContentView.onChange(of: auth.currentUser?.id)` calls `PushRegistration.shared.setCurrentUser(newId)`, but the timing is not guaranteed. If the APNs token arrives during the window before `onChange` fires, the registration is permanently lost. The device is never registered in the `user_devices` table, and push notifications will never arrive. The user is never notified of this failure.
**Suggested disposition:** AUTONOMOUS-FIXABLE
**Rationale:** Call `PushRegistration.shared.setCurrentUser(userId)` inside `AuthViewModel.loadUser()` immediately after fetching the user, before any async token callbacks. Alternatively, queue pending token registrations and retry with exponential backoff until a user ID is available.

### R-10-AGR-04 — Permission cache not invalidated after login or token refresh
**Severity:** CRITICAL (for login), HIGH (for tokenRefreshed)
**File:line:** `VerityPost/AuthViewModel.swift:149-185 (login), 133-139 (tokenRefreshed)`
**Surfaced by:** WaveA Agent2, WaveB Agent2, WaveB Agent3 (3/5)
**Consensus description:** Two separate permission-cache bugs: (1) Login and signup do NOT call `PermissionService.shared.loadAll()`, so users see stale free-tier gates even after purchase. The permission cache is only refreshed on subscription-plan changes or specific view navigations (like LeaderboardView). (2) When the auth state listener fires `.tokenRefreshed` (Supabase SDK auto-refresh), the code reloads the user row but never invalidates the permission cache. If a permission-gated feature (e.g., "ask_expert") was revoked server-side, or if a user's role was upgraded while the app was backgrounded, the old cached permissions remain until manual refresh (navigation change, app restart, etc.).
**Suggested disposition:** AUTONOMOUS-FIXABLE
**Rationale:** Call `PermissionService.shared.loadAll()` at the end of `login()` and `signup()`. Call `PermissionService.shared.invalidate()` + `loadAll()` (or `refreshIfStale()`) when `.tokenRefreshed` fires in the auth state listener. These are straightforward code additions with no external dependencies.

### R-10-AGR-05 — Deep-link OAuth callback fallback missing or unvalidated
**Severity:** HIGH
**File:line:** `VerityPost/AuthViewModel.swift:529, 567, 588`
**Surfaced by:** WaveA Agent1, WaveA Agent2, WaveB Agent2 (3/5)
**Consensus description:** Supabase OAuth for Apple/Google both redirect to `verity://login`. If the custom URL scheme is not registered in Info.plist, misconfigured, or the deep-link handler does not match the URL, the OAuth completes in Safari but the app never receives the session. User is stuck in the authentication sheet with no error surface or fallback. WaveB Agent2 adds that the scheme is not validated case-sensitively, allowing phishing URLs like `VERITY://login` or `verity-family://...` to pass through if opened by a malicious link.
**Suggested disposition:** OWNER-ACTION
**Rationale:** Requires (a) validating that `verity://` is registered in project.yml/CFBundleURLTypes, (b) adding a timeout in the OAuth flow after which a fallback to web auth is triggered, (c) validating `url.scheme?.lowercased() == "verity"` in `handleDeepLink()`. Item (c) is AUTONOMOUS-FIXABLE; items (a) and (b) require architecture/product decision.

### R-10-AGR-06 — Expert Q&A feature flagged off with dead code and schema mismatch
**Severity:** MEDIUM
**File:line:** `VerityPost/StoryDetailView.swift:1907-1933`
**Surfaced by:** WaveA Agent2, WaveA Agent3, WaveB Agent2 (3/5)
**Consensus description:** Expert Q&A submission UI is wrapped in `#if false`, so users cannot submit questions. The comment documents a schema mismatch: `expert_discussions` uses a threaded tree structure (title/body/parent_id/is_expert_question), not flat question/answer columns. The dead code references non-existent columns and is incomplete. ExpertQueueView (viewing questions) is marked `@feature-verified` but the question-submission surface on StoryDetailView is unavailable.
**Suggested disposition:** OWNER-ACTION
**Rationale:** Requires product/PM decision: (a) remove the dead code if feature is deferred, (b) implement the tree traversal logic if feature should ship, or (c) open a GitHub issue with timeline and link the code. Not a runtime bug (code is unreachable), but technical debt.

### R-10-AGR-07 — APNs pre-prompt dismissed without recording user's choice
**Severity:** HIGH
**File:line:** `VerityPost/PushPromptSheet.swift:45-50, VerityPost/AlertsView.swift:83-95`
**Surfaced by:** WaveA Agent1, WaveA Agent3 (2/5; direct mention in WaveB Agent3 but attributed to PushPermission.requestIfNeeded semantics)
**Consensus description:** PushPromptSheet pre-prompt (soft ask before system dialog) does not persist the user's choice if they tap "Not now." The `hasBeenPrompted` flag is only set inside `requestIfNeeded()` after the system dialog is shown, not before. If the user declines the pre-prompt, the flag remains unset, and AlertsView re-presents the sheet on every app session.
**Suggested disposition:** AUTONOMOUS-FIXABLE
**Rationale:** Set `UserDefaults` `hasBeenPrompted` flag before calling the system dialog in `requestIfNeeded()`, not after. Record the flag even if the user denies permission.

## UNIQUE-A findings (Wave A only, needs tiebreaker)

### R-10-UA-01 — Family kid management calls lack client-side permission re-check
**Severity:** MEDIUM
**File:line:** `VerityPost/FamilyViews.swift:738-811 (KidsAPI functions)`
**Surfaced by:** WaveA Agent1 only
**Description:** KidsAPI methods (`createKid`, etc.) do not call `PermissionService.shared.has("family.add_kid")` before sending the request. The iOS client relies entirely on server-side RLS + `requirePermission()` checks. While the server-side check is the safety net, a defense-in-depth approach would add a redundant client-side permission cache validation before building the request.
**Tiebreaker question:** Should iOS add redundant client-side permission checks before every KidsAPI mutation, or is server-side RLS sufficient defense?

### R-10-UA-02 — Rate-limited username check continues to signup on 429
**Severity:** MEDIUM
**File:line:** `VerityPost/AuthViewModel.swift:236-265`
**Surfaced by:** WaveA Agent2 only
**Description:** The `check-username` endpoint enforces a 20 req/60s rate limit. If the endpoint returns 429, the iOS client surfaces "Too many attempts" error. However, the signup flow continues to call `auth.signUp()` anyway, creating confusion: the user sees "too many attempts" but actually signed up, and the retry will fail with "already registered."
**Tiebreaker question:** Should a 429 on check-username be a hard blocker to signup, or is the current behavior acceptable since the final upsert acts as a constraint check?

### R-10-UA-03 — Purchase receipt lacks local SKU verification
**Severity:** LOW
**File:line:** `VerityPost/StoreManager.swift:117-170`
**Surfaced by:** WaveA Agent2 only
**Description:** The app calls `checkVerified()` to validate the StoreKit transaction signature, but does not verify that `transaction.productID` matches the `product.id` the user tapped. Server-side JWS verification in `lib/appleReceipt.js` will catch spoofing, making this defense-in-depth only. No actual vector since server validates.
**Tiebreaker question:** Should iOS add a local `assert transaction.productID == product.id` check before caching the purchase?

### R-10-UA-04 — Deep-link handler fails silently when OAuth callback doesn't invoke handleDeepLink
**Severity:** MEDIUM
**File:line:** `VerityPost/AuthViewModel.swift:529, 568`
**Surfaced by:** WaveA Agent1 only
**Description:** If the OAuth callback fails to invoke `handleDeepLink()` (app killed mid-OAuth, URL scheme not registered), the user is left in a partial auth state. The Supabase SDK holds a session internally but the app never receives it. No timeout or fallback.
**Tiebreaker question:** Is this covered by the agreed deep-link validation finding, or does it need separate handling for network/app-lifecycle issues?

## UNIQUE-B findings (Wave B only, needs tiebreaker)

### R-10-UB-01 — registerIfPermitted() method defined but never called
**Severity:** HIGH
**File:line:** `VerityPost/PushRegistration.swift:27, VerityPost/AlertsView.swift:83-94`
**Surfaced by:** WaveB Agent3 only
**Description:** PushRegistration has a `registerIfPermitted()` method that sets up the APNs delegate and registers the device. However, this method is never invoked anywhere in the codebase—not after login, not in ContentView, not automatically. Only AlertsView (Manage tab) calls `onEnable()` which triggers the system permission dialog, but the registration callback is never wired.
**Tiebreaker question:** Is this the same as the APNs registration race (R-10-AGR-03), or a distinct failure mode where registration is never attempted at all?

### R-10-UB-02 — StoreManager missing appAccountToken on session fetch failure allows account takeover
**Severity:** HIGH
**File:line:** `VerityPost/StoreManager.swift:128-142`
**Surfaced by:** WaveB Agent3 only
**Description:** If `client.auth.session` fetch fails (network, auth error), the purchase proceeds with `options = []` (no appAccountToken). The server's first defense layer (ios/subscriptions/sync route.js:117-122) skips the token check when token is absent. An attacker on the same device can hijack the subscription by posting the receipt with a different Bearer token.
**Tiebreaker question:** Is the server-side token check sufficient to prevent hijacking, or should iOS fail the purchase entirely if session is unavailable?

### R-10-UB-03 — Universal Links not implemented; password reset redirects only to verity://
**Severity:** MEDIUM
**File:line:** `VerityPost/AuthViewModel.swift:584-588`
**Surfaced by:** WaveB Agent3 only
**Description:** Password reset and email verification links redirect to `verity://reset-password`. If the app is not installed, users land in Safari with a non-functional URL. Universal Links would provide HTTPS-based fallback to web.
**Tiebreaker question:** Is Universal Links implementation in scope for this audit, or is it a known architectural enhancement?

### R-10-UB-04 — FamilyViews reads kid_profiles directly; RLS assumptions not verified
**Severity:** MEDIUM
**File:line:** `VerityPost/FamilyViews.swift:390-400`
**Surfaced by:** WaveB Agent3 only
**Description:** FamilyViews directly queries `reading_log` and `kid_profiles` from the authenticated iOS client. The web `/api/family/...` routes enforce server-side RLS, but iOS assumes direct PostgREST read access is RLS-gated. If RLS is not configured, a user could theoretically query another family's kids.
**Tiebreaker question:** Has RLS on kid_profiles been verified to enforce parent_user_id isolation, or should iOS refactor to use a server-side `/api/family/kids` endpoint?

### R-10-UB-05 — Pair-code expiry display uses two date formatters without error handling
**Severity:** LOW
**File:line:** `VerityPost/FamilyViews.swift:736-752`
**Surfaced by:** WaveB Agent3 only
**Description:** If the server returns an unexpected timestamp format, both ISO8601 formatters fail and `expiresAt` stays nil. The UI silently omits the countdown timer, leaving the parent unaware of expiry.
**Tiebreaker question:** Should error handling be added with a fallback "Expires soon" message, or is the current behavior acceptable?

### R-10-UB-06 — Login does not trigger APNs permission prompt; adoption deferred to Alerts tab
**Severity:** MEDIUM
**File:line:** `VerityPost/PushPermission.swift:48, VerityPost/AlertsView.swift:83-93`
**Surfaced by:** WaveB Agent3 only
**Description:** APNs permission prompt is only shown from AlertsView.onEnable or SettingsView, not immediately post-login. This reduces adoption: users may never reach the Alerts tab, or may deny the prompt if surprised by a late request.
**Tiebreaker question:** Should APNs permission request be proactive on app launch (post-login), or is deferred request acceptable per product strategy?

### R-10-UB-07 — Signup rollback on iOS does not mirror web's orphan cleanup
**Severity:** MEDIUM
**File:line:** `VerityPost/AuthViewModel.swift:267-283, web/src/app/api/auth/signup/route.js:116-127`
**Surfaced by:** WaveB Agent3 only (as F-B10-03-02, discussing web signup)
**Description:** Web `/api/auth/signup` rolls back the auth user if role assignment fails, but leaves the orphaned users row for cron cleanup. iOS signup does NOT perform its own upsert (web does), but the asymmetry means: if web creates an orphan (auth.users row deleted, users row orphaned), iOS attempting signup with the same email will fail with "already registered" even though the first users row is now unlinked.
**Tiebreaker question:** Should iOS coordinate with web signup to ensure symmetric rollback behavior?

## STALE / CONTRADICTED findings

### R-10-STALE-01 — StoreKit → plan sync permission cache invalidation
**Claimed by:** WaveA Agent1 (implicit), WaveA Agent3 (implicit — no notification posted on failure)
**Disputed by:** WaveB Agent3 confirms CORRECT: lines 59-60 of AuthViewModel show permission cache IS invalidated and reloaded on vpSubscriptionDidChange
**Your verdict:** NOT STALE — the agreed finding R-10-AGR-02 correctly captures the issue (notification not posted on server sync failure), which is the root cause. The permission cache invalidation logic is correct; the problem is the notification is never posted. WaveA agents saw the gap in the notification logic; WaveB Agent3 verified the cache logic is sound.

### R-10-STALE-02 — APNs permission prompt behavior
**Claimed by:** WaveA Agent3 (F-A10-3-01 — prompt re-appears on deny)
**Disputed by:** WaveB Agent2 (F-10-2-07 — `hasBeenPrompted` is always set, so behavior is correct; low-severity semantics issue)
**Your verdict:** NEEDS-TIEBREAKER — WaveA Agent3 reports the pre-prompt shows "Not now" button, which dismisses without recording choice, causing re-prompts on next session. WaveB Agent2 notes that `hasBeenPrompted` is set to true even on deny, making re-prompts correct behavior. The issue is: should the flag mean "we've shown the system dialog once" (current) or "we have a definitive user choice" (WaveA's expectation)? This is covered by R-10-AGR-07.

---

## Summary counts

- **AGREED CRITICAL:** 2 (signup orphan, StoreKit sync failure)
- **AGREED HIGH:** 5 (APNs token race, permission cache on login/tokenRefresh, deep-link fallback, APNs pre-prompt dismiss, Expert Q&A flagged off)
- **AGREED MEDIUM/LOW:** 1 (Expert Q&A schema mismatch, covered under R-10-AGR-06)
- **UNIQUE-A:** 4
- **UNIQUE-B:** 7
- **STALE:** 1 (RLS clarification only, not a finding)

**Total findings reconciled:** 20 (7 AGREED, 11 UNIQUE, 2 UNSURE/TIEBREAKER-DEPENDENT)

---

## Notes for Phase 5 (Owner Review)

1. **Missing input file:** WaveB_Group10_AdultIOS_Agent1.md was not found. This agent's findings (if any) are not represented in this reconciliation. If available, it should be re-analyzed for cross-wave agreement.

2. **Critical path:** AGREED items R-10-AGR-01, R-10-AGR-02, R-10-AGR-04 must be fixed before release. R-10-AGR-03 (APNs race) and R-10-AGR-05 (deep-link validation) block feature reliability.

3. **Tiebreaker items:** UNIQUE-B-01 (registerIfPermitted never called) and UNIQUE-A-04 (deep-link timeout vs. rate-limited-username) may overlap with AGREED findings; clarify before owner review.

