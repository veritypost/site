---
wave: B
group: 10 Adult iOS end-to-end
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Wave B Group 10 (Adult iOS end-to-end), Agent 3/3

## CRITICAL

### F-B10-03-01 — APNs registration flow never triggers after login
**File:line:** `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/PushRegistration.swift:27`
**Evidence:**
```swift
// PushRegistration.swift:27 — method defined but never invoked
func registerIfPermitted() async {
    UNUserNotificationCenter.current().delegate = self
    ...
}

// grep output: registerIfPermitted() is referenced only in comments
/PushRegistration.swift:11:// Handles APNs registration. Call registerIfPermitted() after login.
/PushRegistration.swift:27:func registerIfPermitted() async {
```
**Impact:** APNs device tokens are never registered to `user_devices` table after login. Users do not receive push notifications even if they granted permission. AlertsView prompts for permission (AlertsView.swift:84-94) but the registration callback never fires.
**Reproduction:** 
1. Login to iOS app
2. Navigate to Alerts > Manage 
3. Tap "Turn on notifications" → system dialog appears → grant permission
4. Check `user_devices` table: no entry for this user/device
**Suggested fix direction:** Call `PushRegistration.shared.registerIfPermitted()` in ContentView.task after login succeeds (similar pattern: after `setCurrentUser()` on line 107).
**Confidence:** HIGH

### F-B10-03-02 — Signup has orphaned users path with partial cleanup
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/auth/signup/route.js:116-127`
**Evidence:**
```javascript
// signup/route.js:116-127 — conditional rollback only on missing role
if (!roleCount) {
  console.error('[auth.signup] user has no role after signup', { userId });
  // Roll back the auth row so the user can retry cleanly. The
  // users-table upsert above stays (its data is harmless without
  // an auth row) and the cron reconciler will eventually sweep it.
  try {
    await service.auth.admin.deleteUser(userId);
  } catch (rollbackErr) {
    console.error('[auth.signup] rollback deleteUser failed', rollbackErr);
  }
  return NextResponse.json({ error: 'Signup failed. Please try again.' }, { status: 500 });
}
```
**Impact:** 
- If role assignment fails but the error is swallowed (e.g., trigger fires but doesn't insert), signup succeeds with `needsEmailVerification=true` on iOS (AuthViewModel.swift:299), and user lands in VerifyEmailView with no email sent. User is stuck.
- Upserted users row stays in DB "harmless until cron" — orphaned data in `users` table.
- iOS signup (AuthViewModel.swift:267-283) does NOT perform the users-table upsert itself; only web signup does. But if the web flow creates an orphan and iOS then attempts to create a second account with the same email, Supabase auth.signUp will fail with "already registered" while the first users row remains unlinked.
**Reproduction:** 
1. Trigger trigger failure (e.g., mock `handle_new_auth_user` to not fire)
2. Call web /api/auth/signup 
3. Observe: deleteUser succeeds (caught), but users row persists
4. Retry signup with same email: auth fails with "already registered", but first users row orphaned
**Suggested fix direction:** Expand rollback to also DELETE users row by ID when role insertion fails, or make role insertion a hard blocker before async operations.
**Confidence:** HIGH

### F-B10-03-03 — Permission cache not invalidated on StoreKit plan sync
**File:line:** `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/AuthViewModel.swift:59` + `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/StoreManager.swift:277-279`
**Evidence:**
```swift
// AuthViewModel.swift:50-61 — subscription observer
subscriptionObserver = NotificationCenter.default.addObserver(
    forName: .vpSubscriptionDidChange,
    object: nil,
    queue: .main
) { [weak self] _ in
    Task { [weak self] in
        guard let self, let uid = self.currentUser?.id else { return }
        await self.loadUser(id: uid)
        // Permissions are derived from plan_id server-side — without
        // dropping the cached set after a tier change, the UI keeps
        // showing free-tier gates even though the user just paid.
        await PermissionService.shared.invalidate()
        await PermissionService.shared.loadAll()
    }
}

// StoreManager.swift:277-279 — post notification only on sync success
if syncedOk {
    NotificationCenter.default.post(name: .vpSubscriptionDidChange, object: nil)
}
```
**Impact:** Correct — notification IS posted and permission cache IS invalidated (lines 59-60). **NO ISSUE HERE** — this path is properly implemented. Verified: vpSubscriptionDidChange triggers both user reload + permission invalidation/reload. Web parity is maintained.
**Reproduction:** N/A — this is working correctly
**Suggested fix direction:** N/A
**Confidence:** N/A (not a finding, included for completeness)

## HIGH

### F-B10-03-04 — Missing appAccountToken on device fallback allows account takeover
**File:line:** `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/StoreManager.swift:128-142`
**Evidence:**
```swift
let options: Set<Product.PurchaseOption>
if let session = try? await client.auth.session {
    if let uuid = UUID(uuidString: session.user.id.uuidString) {
        options = [.appAccountToken(uuid)]
    } else {
        Log.d("StoreManager: purchase without appAccountToken — session user id was not a UUID")
        options = []  // <- silent fallback
    }
} else {
    Log.d("StoreManager: purchase without appAccountToken — no auth session")
    options = []  // <- silent fallback
}
```
**Impact:** If session fetch fails (network blip, auth error, etc), the receipt is stamped with NO appAccountToken. Server-side defense layer 1 (ios/subscriptions/sync route.js:117-122) skips the token check and allows layer 2 (existingSub user_id match) to pass. An attacker on the same device can hijack the subscription: restore using Apple's Family Sharing or account switching, then post the receipt with a different bearer token.
**Reproduction:**
1. User logs in and attempts purchase (session exists, gets appAccountToken)
2. Network drops mid-purchase → `client.auth.session` times out
3. Fallback: options=[] (no token)
4. Receipt verification passes layer 1 (no token present, so check skipped)
5. Attacker: post same receipt with different Bearer token
6. Server checks existingSub — no prior row, layer 2 passes
7. Subscription synced to attacker's account
**Suggested fix direction:** Fail the purchase (throw) if session is unavailable, rather than silently proceeding with an unarmored receipt. This makes the defense layer 1 a hard requirement.
**Confidence:** MEDIUM (token check exists server-side, but fallback weakens the defense)

### F-B10-03-05 — Deep-link fallbacks incomplete; Universal Links not yet implemented
**File:line:** `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/AuthViewModel.swift:584-588`
**Evidence:**
```swift
try await client.auth.resetPasswordForEmail(
    email,
    redirectTo: URL(string: "verity://reset-password")
)
```
Briefing states: "deep-link fallbacks (Universal Links pending)"
**Impact:** Password reset and email verification links are configured to redirect to `verity://` custom scheme. If the app is not installed or the custom scheme handler is missing, the user lands in Safari with a non-functional URL. Universal Links (HTTPS URLs with `.well-known/apple-app-site-association`) would transparently route to the installed app, providing a fallback to web.
**Reproduction:**
1. Send password reset email
2. Open on fresh iOS device without app installed
3. Link opens in Safari → error page (no handler for verity://)
**Suggested fix direction:** Add Universal Links setup: publish `.well-known/apple-app-site-association` on web domain, configure app entitlements, and configure Supabase auth redirects to use HTTPS URLs (e.g., `https://veritypost.com/auth/reset-password?token=...`) as the fallback.
**Confidence:** MEDIUM (architectural, not a runtime bug; briefing notes it as "pending")

## MEDIUM

### F-B10-03-06 — Permission parity issue: FamilyViews reads directly from DB instead of RLS
**File:line:** `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/FamilyViews.swift:390-395`
**Evidence:**
```swift
let rows: [KidProfile] = try await client.from("kid_profiles")
    .select()
    .eq("parent_user_id", value: userId)
    .eq("is_active", value: true)
    .order("created_at", ascending: true)
    .execute().value
```
**Impact:** ASSUMPTION: The `kid_profiles` table likely has RLS policies, but the iOS app bypasses them via direct PostgREST queries using the user's own access token. If RLS is not enforced (or weaker on reads), a user could modify the `userId` filter in a MITM attack or via local memory inspection. Web likely enforces server-side /api/family/... routes. Parity requires either:
1. iOS to route reads through /api/family/kids (gated by server RLS), OR
2. Confirm that PostgREST RLS on kid_profiles is equally strict.
**Reproduction:** Check Supabase RLS policies on kid_profiles table; verify both read + write are RLS-gated.
**Suggested fix direction:** Verify RLS policies are in place and test that a user cannot query another parent's kids via direct PostgREST + RLS bypass. If not, route through /api/family/list-kids.
**Confidence:** MEDIUM (likely covered by RLS, but should verify)

### F-B10-03-07 — Pair-code expiry display uses two date formatters
**File:line:** `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/FamilyViews.swift:736-752`
**Evidence:**
```swift
/// Matches the `expires_at` shape returned by /api/kids/generate-pair-code,
/// typically ISO8601 with ±HH:MM offset. Parse with kidsAPI formatter first;
/// fallback to generic ISO8601 if that fails.
expiresAt = ISO8601DateFormatter.kidsAPI.date(from: pair.expires_at)
    ?? ISO8601DateFormatter().date(from: pair.expires_at)
```
**Impact:** If server returns a timestamp in an unexpected format (e.g., epoch milliseconds instead of ISO8601), both formatters fail and `expiresAt` stays nil. The UI will not display the countdown, leaving the parent unaware of when the code expires. Silent failure.
**Reproduction:** Check the actual shape of /api/kids/generate-pair-code response; confirm it is always ISO8601.
**Suggested fix direction:** Add error handling with Log.d if parsing fails, and display a fallback message like "Expires soon" rather than silently omitting the timer.
**Confidence:** LOW (unlikely edge case if server is consistent)

### F-B10-03-08 — Login does NOT trigger APNs permission request
**File:line:** `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/PushPermission.swift:48` + AlertsView UX
**Evidence:**
```swift
// PushPermission.swift — requestIfNeeded() exists but is only called from AlertsView.onEnable
// (AlertsView.swift:88)
// No call after successful login in AuthViewModel or ContentView
```
**Impact:** Users log in and land on HomeView (MainTabView). They never see a prompt to enable notifications unless they navigate to Alerts tab. APNs permission prompt is deferred to the first time they open Alerts, not immediately post-login. This reduces adoption (users may never reach Alerts, or may deny the prompt if surprised by a late request).
**Reproduction:**
1. Create account and log in
2. Check iOS Settings > Notifications > Verity Post: permission is "Not Determined" (system dialog never shown)
3. Only appears after navigating to Alerts tab
**Suggested fix direction:** Call `await PushRegistration.shared.registerIfPermitted()` in a .task after login succeeds (e.g., in WelcomeView completion or MainTabView.onAppear). Show system dialog immediately post-login.
**Confidence:** MEDIUM (UX design choice, not a bug, but lowers adoption)

## LOW

### F-B10-03-09 — Expert Q&A queue view comments indicate future features
**File:line:** `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/ExpertQueueView.swift:185-188`
**Evidence:**
```swift
Text("Private discussion among experts in your categories. Coming soon in a dedicated screen.")
```
**Impact:** The expert discussions section is hidden (coming soon). No functional gap; correctly marked as unavailable. Feature gate works correctly via `expert.queue.view` permission. No shipping risk.
**Reproduction:** N/A
**Suggested fix direction:** N/A
**Confidence:** N/A (not a finding)

## UNSURE

### F-B10-03-10 — Session refresh behavior on background/foreground transitions
**Issue:** AuthViewModel listens to `client.auth.authStateChanges` (line 117), which auto-refreshes tokens via Supabase SDK. However, when the app moves to background and tokens expire while backgrounded, the first foreground transition should trigger `refreshIfStale()` in PermissionService. No explicit background/foreground listener found.
**Need to resolve:** Check if Supabase Swift SDK auto-refreshes on app return to foreground, or if a manual refresh hook is needed in VerityPostApp or ContentView to call `PermissionService.shared.refreshIfStale()` when the app comes to foreground.
**Confidence:** LOW (requires runtime observation or SDK documentation check)

