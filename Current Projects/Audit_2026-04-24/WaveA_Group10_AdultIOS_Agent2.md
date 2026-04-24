---
wave: A
group: 10 Adult iOS end-to-end
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24T13:03:54Z
---

# Findings — Adult iOS end-to-end (Wave A, Agent 2)

## CRITICAL

### F-10-2-01 — Permissions not loaded after login/signup
**File:line:** `VerityPost/VerityPost/AuthViewModel.swift:149-185` (login), `189-305` (signup)
**Evidence:**
```
func login(email: String, password: String) async {
  ...
  await loadUser(id: session.user.id.uuidString)
  isLoggedIn = true
  // NO: await PermissionService.shared.loadAll()
}

func signup(...) async {
  ...
  if hasSession {
    await loadUser(id: userId)
    isLoggedIn = true
    // NO: await PermissionService.shared.loadAll()
  }
}
```
PermissionService.loadAll() IS called in checkSession (line 60) and on subscription-plan changes (line 60 in init), but NOT on login or signup. Web parity issue: `site/src/lib/permissions.js` refreshes on every auth state change.
**Impact:** User logs in → UI shows stale free-tier gates even though user has a plan. Family views, Pro features, Expert queue all show "not granted" until the next permission refresh trigger (subscription change or manual navigate to Settings/LeaderboardView/MessagesView that call refreshIfStale). Critical for any user sign-up followed by immediate premium feature access.
**Reproduction:** Signup as free user → verify Recap, Messages, Family Dashboard hidden (expected). Purchase Verity Pro → isLoggedIn = true fires, permissions still cached as free → features still gated. Wait for next permission-refresh trigger (navigate to LeaderboardView, etc.) → features appear. Or restart app.
**Suggested fix direction:** Call `await PermissionService.shared.loadAll()` in login(), signup(), and the tokenRefreshed / signedIn branches of startAuthStateListener.
**Confidence:** HIGH

### F-10-2-02 — Signup rollback gap: auth succeeds, profile row upsert fails
**File:line:** `VerityPost/VerityPost/AuthViewModel.swift:267-283`
**Evidence:**
```swift
let result = try await client.auth.signUp(email: email, password: password)
let userId = result.user.id.uuidString
// ... username check succeeded, auth succeeded ...

try await client.from("users")
  .upsert(UserUpsert(id: userId, email: email, username: normalized), onConflict: "id")
  .execute()

// If upsert throws (RLS, network, etc.), catch block on line 302 surfaces
// authError — but auth.signUp has already committed the user to the
// auth system. No rollback.
```
**Impact:** User email exists in auth.users but no row in public.users. When user logs in later, loadUser() returns nil → currentUser is nil → all UI gates behave as if signed out. Silent broken state; user is technically authenticated but app treats them as anon.
**Reproduction:** Mock users.upsert to throw network error mid-signup → watch signup page show error. Try to login with that email/password → splash says "logged in" but currentUser nil → UI broken.
**Suggested fix direction:** Wrap signUp + upsert in explicit transaction or add rollback: on upsert error, call auth.signOut() before surfacing authError.
**Confidence:** HIGH

### F-10-2-03 — APNs token registration silently skipped when user nil
**File:line:** `VerityPost/VerityPost/PushRegistration.swift:44-47`
**Evidence:**
```swift
func handleDeviceToken(_ token: Data) {
  let hex = token.map { String(format: "%02x", $0) }.joined()
  guard lastUserId != nil else { return }  // <-- SILENT RETURN
  // ... rpc call ...
}
```
`setCurrentUser()` called from AlertsView onEnable (line 90: `PushRegistration.shared.setCurrentUser(uid)`), but there's no guarantee handleDeviceToken is called *after* setCurrentUser. If APNs hands the token during the time window before setCurrentUser fires, token is discarded. No error signal to user or logs beyond "Push token upload error" (line 78).
**Impact:** Device registered in APNs system but not in user_devices table → server cannot send push to this device. User thinks they enabled notifications; silently receives none.
**Reproduction:** Trigger push permission prompt in AlertsView → decline → (go offline) → enable again in Settings → come back online. If timing is tight, token may arrive before setCurrentUser completes → skipped.
**Suggested fix direction:** Make setCurrentUser async and await it before completing requestAuthorization, or log+retry on nil userId.
**Confidence:** MEDIUM

## HIGH

### F-10-2-04 — Deep-link scheme fallback missing
**File:line:** `VerityPost/VerityPost/AuthViewModel.swift:529, 567, 588`
**Evidence:**
```swift
_ = try await client.auth.signInWithOAuth(
  provider: .apple,
  redirectTo: URL(string: "verity://login")
)
```
Supabase OAuth for Apple/Google both hardcode `verity://login` redirect. No fallback if the deep-link handler fails to match the URL or the scheme is not registered. App Store rejection risk if CFBundleURLTypes is misconfigured; users can get stuck in the OAuth sheet.
**Impact:** iOS URL scheme registration bug or typo → OAuth completes but deep-link is swallowed → user stuck in Safari/authentication session. Web has a fallback (web origin redirect); iOS doesn't.
**Reproduction:** Disable `verity://` in project.yml → attempt Apple/Google signin → after auth, redirect fails silently.
**Suggested fix direction:** Add fallback redirect URL (e.g., fallbackToAppStore or in-app modal with "tap here if stuck") or validate scheme at app launch.
**Confidence:** HIGH

### F-10-2-05 — Session expiry handling relies on single event source
**File:line:** `VerityPost/VerityPost/AuthViewModel.swift:113-145`
**Evidence:**
```swift
for await (event, session) in client.auth.authStateChanges {
  switch event {
  case .signedOut, .userDeleted:
    let wasSignedIn = self.wasLoggedIn
    self.currentUser = nil
    self.isLoggedIn = false
    if wasSignedIn {
      self.sessionExpired = true  // <-- SINGLE SIGNAL
    }
  ...
  }
}
```
The auth state listener is the sole source of session-expiry truth. If the listener task crashes, orphaned, or the event stream is dropped, token refresh failures are never surfaced. Assumption: Supabase SDK always emits signedOut on token expiry.
**Impact:** Token refresh silently fails → app shows logged-in UI but all API calls 401 → user sees "network error" toasts repeatedly but no "session expired" banner.
**Reproduction:** Mock authStateChanges to drop the event stream after initial signIn → let token expire → observe no sessionExpired banner.
**Suggested fix direction:** Add explicit token-refresh polling or error handling in the listener task.
**Confidence:** MEDIUM

## MEDIUM

### F-10-2-06 — Expert Q&A feature flagged off via #if false
**File:line:** `VerityPost/VerityPost/StoryDetailView.swift:1907-1933` (per PM punchlist)
**Evidence:**
PM Punchlist 2026-04-24, line 61:
```
iOS adult: expert Q&A wrapped in `#if false` at `VerityPost/VerityPost/StoryDetailView.swift:1907-1933`. Feature off, not broken.
```
ExpertQueueView (lines 4-5) marked `@feature-verified expert_queue 2026-04-18`, but question-submission UI is conditionally compiled out.
**Impact:** Users cannot submit expert questions on story detail. Feature works server-side (expert_discussions table, /api/expert/* routes gated), but UI is unavailable.
**Reproduction:** Open any article on iOS → look for "Ask Expert" button → not present.
**Suggested fix direction:** Remove #if false wrapping once feature gate / permission tier is finalized.
**Confidence:** HIGH (confirmed by PM punchlist; no action needed for audit, but flags incomplete feature parity with web)

### F-10-2-07 — Family views permission check delayed until changeToken bump
**File:line:** `VerityPost/VerityPost/FamilyViews.swift:213-219`
**Evidence:**
```swift
.task { await load() }  // <-- loads immediately with stale perms
.task(id: perms.changeToken) {
  canViewFamily = await PermissionService.shared.has("settings.family.view")
  // ...
}
```
On first load, family permissions are checked only on perms.changeToken change, not on initial task. If user is a Family tier subscriber and immediately navigates to Family tab before the first permission refresh, the view shows "upgrade" prompt instead of the dashboard.
**Impact:** UX friction: Family members see upgrade CTA despite active Verity Family plan until they navigate away and back, or subscribe mid-session.
**Reproduction:** Login as Family tier → immediately tap Family tab → see "upgrade" prompt → wait 5s or navigate to another tab and back → permissions load → Family dashboard appears.
**Suggested fix direction:** Call permission hydration in the initial task or eagerly in init when user is loaded.
**Confidence:** MEDIUM

### F-10-2-08 — APNs permission prompt only offered from AlertsView/SettingsView
**File:line:** `VerityPost/VerityPost/AlertsView.swift:83-93`, `SettingsView.swift:1968-1977`
**Evidence:**
Two hardcoded surface offer the push prompt: AlertsView.maybeOfferPush() and SettingsView notifications section. No proactive prompt on app launch or other high-intent moments (e.g., after first article read, quiz pass). Contrast with web, which may offer more opportunistically.
**Impact:** Lower push notification adoption. Feature is gated behind "Notifications inbox" permission, so only subscribers see AlertsView; free users never see the prompt.
**Reproduction:** Free user logs in → navigate app → never prompted for push → only premium users in AlertsView see prompt.
**Suggested fix direction:** Add proactive prompt on first app launch or after earned-comment unlock (quiz pass).
**Confidence:** LOW (product decision, not a bug)

## MEDIUM (continued)

### F-10-2-09 — Rate-limited username check returns 429 but auth already succeeded
**File:line:** `VerityPost/VerityPost/AuthViewModel.swift:236-265`
**Evidence:**
```swift
struct CheckBody: Encodable { let username: String }
let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/auth/check-username")
// ... POST check-username ...
let parsed = (try? JSONDecoder().decode(CheckResponse.self, from: data))
  ?? CheckResponse(available: nil, reserved: nil)
if parsed.reserved == true {
  authError = "That username is reserved. Try a different one."
  return  // <-- early return, NO auth.signUp
}
if parsed.available == false {
  authError = "That username is already taken."
  return  // <-- early return, NO auth.signUp
}
// Only now does auth happen:
let result = try await client.auth.signUp(email: email, password: password)
```
Good: username check happens *before* signUp. But if check-username returns 429 (rate limit), flow continues to signUp, user gets an auth account but signup page shows "too many attempts" error.
**Impact:** User sees "too many attempts" but actually signed up successfully. Confusing on retry.
**Reproduction:** Spam signup attempts from same IP → hit 429 on check-username → signup continues anyway → show error message → retry → user already exists.
**Suggested fix direction:** Check rate-limit response before falling through to signUp, or make check-username a non-blocking pre-flight.
**Confidence:** MEDIUM

## LOW

### F-10-2-10 — Purchase receipt signed locally, not server-verified for SKU
**File:line:** `VerityPost/VerityPost/StoreManager.swift:117-170`
**Evidence:**
```swift
let result = try await product.purchase(options: options)
switch result {
case .success(let verification):
  let transaction = try checkVerified(verification)
  purchasedProductIDs.insert(product.id)
  await syncPurchaseToServer(
    productID: product.id,
    transactionID: transaction.id,
    receipt: transaction.jsonRepresentation.base64EncodedString(),
    price: product.price
  )
```
App calls checkVerified (line 314) to validate the StoreKit transaction signature, but does not verify that transaction.productID matches the Product.id the user tapped. A compromised local cache could theoretically allow SKU spoofing (user taps $3.99 plan, receipt claims $99.99).
**Impact:** Low — server will re-verify the receipt via JWS in `lib/appleReceipt.js` before committing plan change. But a local/client-side check would be defense-in-depth.
**Reproduction:** Modify local transaction.productID before syncPurchaseToServer → server signature check blocks it. No actual vector.
**Suggested fix direction:** Assert `transaction.productID == product.id` before insertion into purchasedProductIDs.
**Confidence:** LOW

---

**Summary:** 2 CRITICAL issues (permission-cache gap on auth, signup rollback), 4 HIGH issues (silent APNs skip, deep-link fallback, session-listener isolation, expert Q&A feature flag), 4 MEDIUM issues (family permission timing, push prompt surface, rate-limit edge case, receipt SKU verification). No LOW findings beyond suggestion for defense-in-depth. Primary concern: **user can complete signup and login successfully but have stale permission caches or missing profile rows**, blocking all paid-tier access.
