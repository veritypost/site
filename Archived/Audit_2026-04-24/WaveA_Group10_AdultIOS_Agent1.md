---
wave: A
group: 10 (Adult iOS end-to-end)
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24T13:03:54Z
---

# Findings — Adult iOS (Wave A, Group 10), Agent 1/3

## HIGH

### F-A10-1-01 — Signup auth user not rolled back if users.upsert fails
**File:line:** `VerityPost/AuthViewModel.swift:267-283`
**Evidence:**
```swift
let result = try await client.auth.signUp(email: email, password: password)
let userId = result.user.id.uuidString
// ... username validation ...
try await client.from("users")
    .upsert(UserUpsert(id: userId, email: email, username: normalized), onConflict: "id")
    .execute()
```
**Impact:** If the upsert fails (e.g., RLS violation, network error after auth user creation), the auth user is persisted server-side but the user row is not created. The account is broken — the user cannot log back in (no user row to load), and a subsequent signup attempt with the same email will fail on `client.auth.signUp` (email already exists). The app shows generic "Couldn't create your account" without explaining the auth orphan.
**Reproduction:** 1) Sign up successfully through AuthViewModel.signup(). 2) If upsert throws mid-transaction, user gets auth error but auth user exists server-side. 3) Next login attempt with same email fails "already registered" → confusion. 4) Support must manually delete the orphan auth user.
**Suggested fix direction:** Wrap signUp + upsert in a transaction or add a rollback handler that calls `client.auth.admin.deleteUser()` on upsert failure (requires service-role context, not available on client).
**Confidence:** HIGH

### F-A10-1-02 — StoreKit purchase → plan sync → permissions refresh is unobserved after vpSubscriptionSyncFailed
**File:line:** `VerityPost/StoreManager.swift:277-279 && AuthViewModel.swift:46-62`
**Evidence:**
```swift
// StoreManager: posts notification only on 2xx
if syncedOk {
    NotificationCenter.default.post(name: .vpSubscriptionDidChange, object: nil)
}

// AuthViewModel: observer only subscribed to vpSubscriptionDidChange
subscriptionObserver = NotificationCenter.default.addObserver(
    forName: .vpSubscriptionDidChange,
    // ... calls loadUser + invalidate permissions
```
**Impact:** If server sync fails (4xx/5xx or network error), `vpSubscriptionSyncFailed` is posted but AuthViewModel does not observe it. The user's local StoreKit state flips to `purchasedProductIDs` (via `purchase()` or `listenForTransactions()`) but the server's `users.plan_id` is stale. The UI shows paid badges + gated features via `StoreManager.hasAccess()` while server denies the permission. No retry affordance is surfaced — user sees "payment complete" but comments/features fail 403.
**Reproduction:** 1) Purchase a plan on iOS. 2) Trigger server sync failure (e.g., 500, network dropout at sync-start). 3) `vpSubscriptionSyncFailed` notification posted. 4) UI still shows paid (via local StoreKit state). 5) Try to use gated feature → 403 from server. No "Restore Purchases" banner shown.
**Suggested fix direction:** Either (a) observe `vpSubscriptionSyncFailed` and surface a persistent banner with "Restore Purchases" CTA, or (b) pause local entitlement flips until server confirms 2xx.
**Confidence:** HIGH

## MEDIUM

### F-A10-1-03 — APNs token registration races with first login
**File:line:** `VerityPost/PushRegistration.swift:44-46 && ContentView.swift:106-107`
**Evidence:**
```swift
// PushRegistration: guards on lastUserId
func handleDeviceToken(_ token: Data) {
    let hex = token.map { String(format: "%02x", $0) }.joined()
    guard lastUserId != nil else { return }
```

```swift
// ContentView: sets user ID in onChange
.onChange(of: auth.currentUser?.id) { _, newId in
    PushRegistration.shared.setCurrentUser(newId)
```
**Impact:** If APNs device token arrives before the first `loadUser()` completes (or before ContentView's onChange fires), the token is silently dropped. On cold start with slow network, token registration can fail entirely. The user never receives notifications. No error surface to user or logs indicating the race.
**Reproduction:** 1) Fresh install, log in. 2) System delivers APNs token during session check phase. 3) `lastUserId` is nil. 4) handleDeviceToken guards and returns. 5) User never gets registered. 6) Next notification fails silently.
**Suggested fix direction:** Queue or retry token registration with exponential backoff until a user ID is available; or ensure `setCurrentUser()` is called in `loadUser()` directly rather than relying on onChange timing.
**Confidence:** MEDIUM

### F-A10-1-04 — Deep-link fallback to verity:// scheme has no 401/network recovery
**File:line:** `VerityPost/AuthViewModel.swift:529 && 568`
**Evidence:**
```swift
// Sign-in with Apple fallback
_ = try await client.auth.signInWithOAuth(
    provider: .apple,
    redirectTo: URL(string: "verity://login")
)
// Same pattern for Google: redirectTo: URL(string: "verity://login")
```
**Impact:** If the OAuth callback fails to invoke `handleDeepLink()` (deep link not delivered, app killed mid-OAuth, URL scheme not registered), the user is left in a partial auth state. The Supabase SDK holds a session internally but the app never receives it. No timeout or fallback to web flow. User sees loading indefinitely or must restart app.
**Reproduction:** 1) Tap "Continue with Apple" on signup. 2) Complete OAuth on Safari. 3) Redirect to verity://login fails to open. 4) App never calls handleDeepLink(). 5) Session stuck, no error surface.
**Suggested fix direction:** Add a timeout in `fallbackToWebSignInWithApple()` (e.g., 30s) after which fall back to a web flow or explicit error; or validate that `verity://` is registered in Info.plist before offering the button.
**Confidence:** MEDIUM

### F-A10-1-05 — Family kid management calls do not re-check server-side permissions before mutation
**File:line:** `VerityPost/FamilyViews.swift:738-811 (KidsAPI functions)`
**Evidence:**
```swift
// No permission check in KidsAPI methods before POST
static func createKid(_ input: CreateKidInput) async throws -> (ok: Bool, id: String?, error: String?) {
    let body: [String: Any] = [
        "display_name": input.displayName,
        // ... fields
    ]
    var req = URLRequest(url: endpoint("api/kids"))
    req.httpMethod = "POST"
    // ... just sends bearer token, no permission assertion
```
**Impact:** The iOS client relies entirely on server-side `requirePermission("family.add_kid")` in the `/api/kids` route. If the permission logic drifts (permissions table becomes stale, server RLS is bypassed), the iOS client cannot enforce the gate. The UI checks permissions before showing the button, but a determined user could disable JavaScript console or modify the app to call the KidsAPI directly. The server-side check is the safety net — but iOS has no redundant client-side permission cache validation before calling.
**Reproduction:** Code-reading only — no user-visible issue if server auth is correct. This is a defense-in-depth gap rather than a bug.
**Suggested fix direction:** Require `await PermissionService.shared.has("family.add_kid")` inside KidsAPI.createKid before building the request; return early with a client-side error if permission denied.
**Confidence:** MEDIUM

## LOW

### F-A10-1-06 — PushPromptSheet pre-prompt dismissal does not clear isRequesting state on decline
**File:line:** `VerityPost/PushPromptSheet.swift:66-69`
**Evidence:**
```swift
Button {
    onDecline()
    dismiss()
} label: {
    Text("Not now")
```
**Impact:** If the user taps "Not now" while `isRequesting = true` (unlikely but possible if user taps decline immediately after tapping Turn On), the sheet dismisses with isRequesting still true. If the sheet is re-presented, the button label shows "Asking…" and is disabled. Minor UX glitch; does not block user flow.
**Reproduction:** 1) Present PushPromptSheet. 2) Tap "Turn on notifications". 3) Immediately (before async completes) tap "Not now". 4) Sheet dismisses. 5) Re-present → button is disabled with "Asking…" label.
**Suggested fix direction:** Set `isRequesting = false` in the decline closure or guard against dismiss-during-request.
**Confidence:** LOW

### F-A10-1-07 — Expert queue back-channel tab always queries with "pending" status
**File:line:** `VerityPost/ExpertQueueView.swift:282-286`
**Evidence:**
```swift
let statusParam: String
switch activeTab {
case .pending: statusParam = "pending"
case .claimed: statusParam = "claimed"
case .answered: statusParam = "answered"
case .backChannel: statusParam = "pending"  // <-- Same as .pending
}
```
**Impact:** The back-channel tab (labeled "Coming soon") fetches pending questions instead of a distinct back-channel query. If/when the feature is implemented, the tab will show the wrong data. Currently moot since the UI displays a placeholder "Coming soon" message, but technical debt.
**Reproduction:** Code-reading only.
**Suggested fix direction:** Once back-channel is fully specified, use the correct status param (or create a dedicated back-channel endpoint).
**Confidence:** LOW

---

**Evidence summary:** All findings carry file:line citations and code quotes. No speculative items included. F-A10-1-01 and F-A10-1-02 are HIGH-severity user-facing bugs with clear reproduction paths and server-side dependencies. F-A10-1-03 through F-A10-1-05 are MEDIUM, covering race conditions, error recovery, and defense-in-depth gaps. F-A10-1-06 and F-A10-1-07 are LOW-impact UX glitches and pre-spec code.

