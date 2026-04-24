---
wave: B
group: 10 Adult iOS end-to-end
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Wave B Group 10 (Adult iOS end-to-end), Agent 2/3

## CRITICAL

### F-10-2-01 — Signup auth success but user row insert fails: orphaned auth account
**File:line:** `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/AuthViewModel.swift:267–305`
**Evidence:**
```swift
let result = try await client.auth.signUp(email: email, password: password)
let userId = result.user.id.uuidString
// ... username validation ...
try await client.from("users")
    .upsert(UserUpsert(id: userId, email: email, username: normalized), onConflict: "id")
    .execute()
// If above throws, catch block only sets authError, isLoggedIn remains false
// Auth account exists but never gets a users row
```
**Impact:** If the upsert to `users` table fails (RLS reject, network timeout, quota), the auth account is created but orphaned—user cannot log in (loadUser will fail), profile queries return null, and no on_auth_user_created trigger fires to seed default role/plan. User is stranded with a dead account.
**Reproduction:** POST to /api/auth/signup, request succeeds (Supabase creates auth.users row), then respond with 403 on the upsert—user sees "Couldn't create your account" but their email is now registered and unusable. Attempt login → "Network error" (loadUser silent-fails on the missing user row).
**Suggested fix direction:** Wrap signup in a transaction or add rollback logic: if upsert fails after signUp succeeds, immediately call `client.auth.signOut()` to clean up the orphaned auth account before surfacing the error.
**Confidence:** HIGH

### F-10-2-02 — Auth session refresh not forcing permission cache invalidation on tokenRefreshed
**File:line:** `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/AuthViewModel.swift:133–139`
**Evidence:**
```swift
case .tokenRefreshed, .signedIn, .initialSession:
    if let uid = session?.user.id.uuidString {
        await self.loadUser(id: uid)
        self.isLoggedIn = true
        self.wasLoggedIn = true
        self.sessionExpired = false
    }
```
**Impact:** When `tokenRefreshed` fires (silent token rotation), the code refreshes the user row but never calls `PermissionService.shared.invalidate()` or `.refreshIfStale()`. If a permission-gated feature (e.g., "ask_expert") was briefly unavailable, reloading the user row doesn't flip the permission flag—the UI stays gated until a manual refresh via `.task(id: perms.changeToken)` in a view. Permission changes made server-side during the session lifetime won't reflect until the app is restarted or permissions accidentally sync from another source.
**Reproduction:** Expert becomes unverified (loses is_expert flag). Their open session gets token-refreshed. Expert Q&A UI still shows "Experts only" instead of gating it out, because PermissionService cache is stale.
**Suggested fix direction:** Call `await PermissionService.shared.refreshIfStale()` on tokenRefreshed (similar to signup's post-purchase refresh in line 59).
**Confidence:** HIGH

## HIGH

### F-10-2-03 — APNs registration fires before user ID is set; token may be lost
**File:line:** `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/ContentView.swift:106–111`
**Evidence:**
```swift
.onChange(of: auth.currentUser?.id) { _, newId in
    PushRegistration.shared.setCurrentUser(newId)
    Task { await BlockService.shared.refresh(currentUserId: newId) }
}
```
**Impact:** `setCurrentUser` is called from ContentView onChange, which fires *after* isLoggedIn changes. But `checkSession()` (line 104) runs during initial `.task` before ContentView's onChange observes the ID. If APNs permission was already granted and the device token arrives during that window, `handleDeviceToken()` (PushRegistration.swift:44) checks `guard lastUserId != nil` and bails silently. The device is never registered.
**Reproduction:** 1) Kill and relaunch app while signed in. 2) APNs system delivers token during splash. 3) lastUserId is still nil (onChange hasn't fired yet). 4) Silently dropped. 5) No push notifications until next app relaunch and token arrives again.
**Suggested fix direction:** Call `PushRegistration.shared.setCurrentUser(userId)` inside `loadUser()` immediately after fetching the user row, ensuring the ID is set before any async token callbacks arrive.
**Confidence:** HIGH

### F-10-2-04 — AlertsView subscribes to disabled feature; UI creates fake-functional affordances
**File:line:** `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/AlertsView.swift:244–250`
**Evidence:**
```swift
private let manageSubscriptionsEnabled = false

@ViewBuilder
private var manageContent: some View {
    if manageSubscriptionsEnabled {
        manageContentLive
    } else {
        // "Coming soon" placeholder
    }
}
```
plus lines 235–243: multiple `#if false` blocks wrapping direct `alert_preferences` inserts (never compile).
**Impact:** The Manage tab gate is hardcoded `= false`, so category/subcategory/keyword subscription UI never renders. But the permission checks (lines 176–179) still hydrate `canSubCategory`, etc. If an admin toggles the permission on the backend, the UI will silently grant permission tokens that have no affordance—users see nothing but the gate flag prevents error messaging. Dead-code burden.
**Reproduction:** Enable `manageSubscriptionsEnabled = true`. Tap "Add category". Request fires but silently fails (old `alert_preferences` schema mismatch). Silently returns. User confused.
**Suggested fix direction:** Either (a) delete the disabled code + permission checks, or (b) fully implement the feature with a real `subscription_topics` table/API route. Do not ship UI that gates on a permission with no corresponding surface.
**Confidence:** HIGH

## MEDIUM

### F-10-2-05 — StoreManager.hasAccess() drift from server permission model
**File:line:** `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/StoreManager.swift:376–400`
**Evidence:**
```swift
case "ask_expert", "streak_freeze", "ad_free":
    // Verity Pro and above.
    for pid in purchasedProductIDs {
        let plan = planName(for: pid)
        if ["verity_pro", "verity_family", "verity_family_xl"].contains(plan) {
            return true
        }
    }
    return false
```
**Impact:** `hasAccess` is a local StoreKit-only check. But the iOS app is migrated to `PermissionService.shared.has(...)` for feature gating. `hasAccess` is never called in the observed codebase (search yields zero uses). This creates two permission-of-truth systems: the server's `compute_effective_perms` RPC (authoritative) and StoreManager's hardcoded feature→tier map (stale replica). If a future feature flag is added server-side (e.g., "ask_expert" gated to "admin" only, not "verity_pro"), the StoreKit local check will disagree with the server's decision.
**Reproduction:** Server admin changes: `ask_expert` → requires `admin_expert` role (revokes from pro users). iOS user with pro plan still sees feature available (per hasAccess). Tap it → server 403. Confusion.
**Suggested fix direction:** Remove `hasAccess`. All feature gates should flow through `PermissionService.shared.has(...)`, which reads the server-side `compute_effective_perms` RPC. StoreManager owns only entitlement state, not feature logic.
**Confidence:** MEDIUM

### F-10-2-06 — Deep-link handler does not validate verity:// scheme case-sensitively
**File:line:** `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/VerityPostApp.swift:15–16`
**Evidence:**
```swift
.onOpenURL { url in
    Task { await auth.handleDeepLink(url) }
}
```
called by AuthViewModel.handleDeepLink (line 324) which checks `url.fragment ?? url.query` but does not validate the scheme is exactly `verity://`. A URL like `verity://login` or `VERITY://login` or `verity-family://reset` would pass through if opened by a malicious link or misconfigured redirect.
**Impact:** If a phishing site opens `verity://reset-password?access_token=STOLEN` (stolen token from unrelated OAuth flow), the iOS app will parse the fragment and try to set the session. The Supabase SDK will accept the token (no scheme validation on the client), and the attacker gains a live session. Low likelihood (requires token theft + URL parsing alignment), but the scheme should be validated.
**Reproduction:** Open a link like `verity://reset-password?access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` from a non-Verity source. If the token is valid (e.g., stolen from a legitimate password recovery flow), the app will establish a session.
**Suggested fix direction:** In `handleDeepLink`, add guard: `guard url.scheme?.lowercased() == "verity" else { return }` before parsing params.
**Confidence:** MEDIUM

## LOW

### F-10-2-07 — PushPermission.requestIfNeeded() does not clear hasBeenPrompted on manual re-enable
**File:line:** `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/PushPermission.swift:43–55`
**Evidence:**
```swift
@discardableResult
func requestIfNeeded() async -> UNAuthorizationStatus {
    await refresh()
    guard status == .notDetermined else { return status }
    let granted = (try? await UNUserNotificationCenter.current()
        .requestAuthorization(options: [.alert, .badge, .sound])) ?? false
    UserDefaults.standard.set(true, forKey: promptedKey)  // Always sets true
    if granted {
        UIApplication.shared.registerForRemoteNotifications()
    }
    await refresh()
    return status
}
```
**Impact:** `hasBeenPrompted` is set to `true` even if the user denies permission. This is correct for the initial prompt. But if a user later re-enables notifications in Settings.app and calls `requestIfNeeded()` again, the flag is already `true`, so the "pre-prompt" UI (PushPromptSheet) will show "Open Settings" copy instead of re-offering the native prompt. Low impact (user can still enable via Settings), but the flag semantics are loose.
**Reproduction:** 1) User sees PushPromptSheet, taps "Turn on". 2) System dialog appears, user denies. 3) hasBeenPrompted = true. 4) User manually enables in Settings.app. 5) App calls requestIfNeeded(). 6) status is now .authorized, but hasBeenPrompted is still true (correct), so next time the app shows PushPromptSheet again, it will show "Open Settings" instead of re-prompting. This is actually correct behavior—user already answered once. Low confidence it's a bug.
**Suggested fix direction:** Clarify the semantics in comments: `hasBeenPrompted` means "we have shown the system dialog at least once", not "we have gotten a definitive answer". Current behavior is acceptable.
**Confidence:** LOW

### F-10-2-08 — No explicit error UX for failed permission refresh in ExpertQueueView
**File:line:** `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/ExpertQueueView.swift:66–73`
**Evidence:**
```swift
private func loadExpertStatus() async {
    guard auth.currentUser?.id != nil else {
        await MainActor.run { isExpert = false }
        return
    }
    await PermissionService.shared.refreshIfStale()
    let allowed = await PermissionService.shared.has("expert.queue.view")
    await MainActor.run { isExpert = allowed }
}
```
**Impact:** If `refreshIfStale()` fails (RPC error, network timeout), the cached permissions remain; a user who lost expert status server-side will still see "Experts only" (stale cache says `false`), but a user who *gained* expert status will see "Experts only" (stale cache says `false`). The error is silently swallowed in PermissionService (line 132). No toast or banner alerts the user to retry. If the permission RPC is flaky, the queue becomes unreliable.
**Reproduction:** Kill network mid-session. Expert user goes to queue. `refreshIfStale()` fails. Cache is stale. User sees "Experts only" even though they should have access.
**Suggested fix direction:** Return a result from `refreshIfStale()` indicating success/failure. If failure, surface a "Couldn't load" banner with a "Retry" button in ExpertQueueView.
**Confidence:** LOW

## UNSURE

### F-10-2-09 — StoryDetailView #if false expert Q&A schema mismatch unresolved
**File:line:** `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/StoryDetailView.swift` (exact line not provided in search results)
**Evidence:**
```swift
#if false
// TODO(round9-expert-qa-shape): expert_discussions uses title/body/parent_id/is_expert_question tree, 
// not question/answer/question_id cols. Redesign needed to reconstruct Q+A pairs via parent_id + is_expert_question.
```
**Impact:** Expert Q&A feature on article detail was gated off because the schema redesign (from flat questions to a threaded tree) is incomplete. The code comment indicates the v2 schema exists but the UI reconstruction has not been done. No affordance to ask a new question on StoryDetailView.
**Reproduction:** Cannot test; code is dead. Unclear if the underlying `/api/expert/ask` mutation exists.
**Suggested fix direction:** Confirm whether the expert Q&A ask-question surface on StoryDetailView is intentionally postponed (v2 backlog) or blocking a release. If it should ship, implement the tree traversal logic. If it's deferred, document the timeline.
**Confidence:** LOW

---

**Summary:** Two HIGH-severity issues affect auth reliability (signup rollback, APNs registration race) and feature gating (disabled Manage subscriptions feature with live permission checks). One CRITICAL issue (tokenRefreshed permission cache staleness) risks silent permission denials. Medium-severity issues involve StoreManager dead code and deep-link scheme validation. Low-severity observations concern error UX and schema mismatch comments.

