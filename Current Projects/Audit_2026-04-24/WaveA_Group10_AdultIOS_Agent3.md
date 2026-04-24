---
wave: A
group: 10 Adult iOS end-to-end
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Adult iOS end-to-end, Wave A, Agent 3

## CRITICAL

### F-A10-3-01 — APNs permission prompt UX lacks dismiss state recovery
**File:line:** `VerityPost/PushPromptSheet.swift:45–50`, `VerityPost/AlertsView.swift:83–95`
**Evidence:**
```swift
// PushPromptSheet.swift
Button {
    Task {
        isRequesting = true
        await onEnable()
        isRequesting = false
        dismiss()
    }
}
```
The pre-prompt sheet (PushPromptSheet) calls `onEnable()` which triggers `PushPermission.requestIfNeeded()`, dispatching the iOS system dialog. Once dismissed by the user (regardless of grant/deny), the sheet auto-dismisses without persisting the user's choice. If the user taps "Not now," no state is recorded to prevent re-showing the prompt on next app session. The pre-prompt solves the "one-shot permission" problem, but `hasBeenPrompted` is only set inside `requestIfNeeded()` (PushPermission.swift:49), which fires only if the user taps "Turn on." Declining leaves the flag unset, so AlertsView will re-present the sheet immediately on next load.
**Impact:** Users who dismiss the APNs pre-prompt are re-prompted on every app session, creating friction and appearing to ignore the decline.
**Reproduction:** 
1. Sign in, navigate to Alerts.
2. Tap "Turn on notifications" pre-prompt → dismiss iOS dialog without granting.
3. Force-quit and relaunch the app.
4. Expected: pre-prompt does not appear. Actual: pre-prompt re-appears.
**Suggested fix direction:** Set `UserDefaults` `hasBeenPrompted` flag in `requestIfNeeded()` before calling the system dialog, not after.
**Confidence:** HIGH

### F-A10-3-02 — StoreKit → plan sync posts vpSubscriptionDidChange without verifying server success
**File:line:** `VerityPost/StoreManager.swift:277–279`
**Evidence:**
```swift
if syncedOk {
    NotificationCenter.default.post(name: .vpSubscriptionDidChange, object: nil)
}
```
The notification is posted only if `syncedOk == true` (line 257–258), which requires a 2xx response. However, AuthViewModel subscribes to this notification (AuthViewModel.swift:46–62) and immediately reloads the user and invalidates permissions. If the server returns 5xx or 4xx, `vpSubscriptionDidChange` is never posted, but iOS StoreKit has already finalized the transaction (line 156, `await transaction.finish()`). The purchased product ID is now in `purchasedProductIDs`, so `StoreManager.hasAccess()` returns true for paid features even though the server never recorded the entitlement. The UI will render paid content while the backend denies mutations.
**Impact:** User purchases succeed on device but fail server-side; paid features appear unlocked in UI while API calls fail with permission errors, creating a broken UX and potential complaint/refund requests.
**Reproduction:** 
1. In production, deploy a broken `/api/ios/subscriptions/sync` endpoint that returns 500 for all requests.
2. Attempt a purchase; StoreKit will finalize it.
3. Observe `vpSubscriptionDidChange` notification is NOT posted (log: "server sync returned non-2xx").
4. Check `StoreManager.isPaid` → true; call any paid-feature API → 403 Forbidden.
**Suggested fix direction:** Do not call `transaction.finish()` until server sync succeeds, or emit a separate notification to surface sync failure in UI.
**Confidence:** HIGH

## HIGH

### F-A10-3-03 — Auth session refresh during credential-in-flight creates race with permission cache
**File:line:** `VerityPost/AuthViewModel.swift:133–139`, `VerityPost/PermissionService.swift:77–86`
**Evidence:**
```swift
// AuthViewModel.swift — event loop for auth state changes
case .tokenRefreshed, .signedIn, .initialSession:
    if let uid = session?.user.id.uuidString {
        await self.loadUser(id: uid)
        self.isLoggedIn = true
        self.wasLoggedIn = true
        self.sessionExpired = false
    }
```
The `.tokenRefreshed` event fires when Supabase SDK auto-refreshes an expiring access token. AuthViewModel calls `loadUser()` but does NOT call `PermissionService.shared.invalidate()` or `refreshIfStale()`. Meanwhile, views read permissions from the cache via `PermissionService.has()`. If the refresh happens mid-flight (e.g., after the user gained a new role server-side), the old cached permissions remain until a manual `refreshIfStale()` check, which only fires on `perms.changeToken` bumps (AlertsView.swift:110). A user who receives a role upgrade while the app is backgrounded will see stale permissions post-refresh.
**Impact:** Role/permission grants that occur server-side while the app is backgrounded are not immediately reflected post-token-refresh. User sees "Permission denied" on features they should access until the next manual permission refresh (navigation change, app restart, etc.).
**Reproduction:**
1. Sign in as a free user.
2. Background the app; token expires and auto-refreshes.
3. While backgrounded, admin upgrades the user to a paid tier server-side.
4. Foreground the app.
5. Expected: Paid features available. Actual: Still shows free-tier gates.
**Suggested fix direction:** On `.tokenRefreshed` event, call `PermissionService.shared.refreshIfStale()` (non-blocking) or `invalidate()` + `loadAll()` to synchronize caches.
**Confidence:** HIGH

### F-A10-3-04 — Kids API direct table reads bypass server permission enforcement
**File:line:** `VerityPost/FamilyViews.swift:390–400`
**Evidence:**
```swift
// FamilyViews.swift — KidDashboardView.load()
let reads: [Row] = (try? await client.from("reading_log")
    .select("id")
    .eq("kid_profile_id", value: kid.id)
    .execute().value) ?? []
```
The view directly queries `reading_log` and `quiz_attempts` tables from the authenticated iOS client. Per Prompt 11 sweep (comment in code, line 502), this was intentional — "v2 has no kid_reading_log table; kid reads live in reading_log.kid_profile_id." However, the comments in FamilyViews.swift (256–261) reference a prior RLS lockdown where direct expert_queue_items reads were revoked and swapped to `/api/expert/queue`. No similar swap has occurred for kid reading data. If RLS is ever added to restrict reading_log access, these views will silently return empty result sets instead of errors, hiding that the dashboard is broken.
**Impact:** If future RLS policy restricts reading_log to prevent cross-family reads (e.g., a family member queries another family's kids), the iOS UI will show "0 articles" without error feedback. The parent won't know the data is inaccessible.
**Reproduction:** Requires DB RLS change; not reproducible in current state. But: compare ExpertQueueView.load() (line 262–335) which uses `/api/expert/queue` (server enforces permission), vs. KidDashboardView.load() (line 505–508) which reads kid_profiles directly with no server mediation. Permission enforcement is inconsistent.
**Suggested fix direction:** Wrap kid reading/quiz counts in a `/api/family/kid-stats?kid_id=...` endpoint that enforces permission server-side, matching the expert queue pattern.
**Confidence:** MEDIUM

## MEDIUM

### F-A10-3-05 — Signup username availability check is rate-limited but offline failure is silent
**File:line:** `VerityPost/AuthViewModel.swift:236–265`, `web/src/app/api/auth/check-username/route.js:38–50`
**Evidence:**
```swift
// AuthViewModel.swift
let (data, response) = try await URLSession.shared.data(for: req)
guard let http = response as? HTTPURLResponse else {
    authError = "Network error. Try again."
    return
}
if http.statusCode == 429 {
    authError = "Too many attempts. Please wait a minute."
    return
}
```
The check-username endpoint enforces a 20 req/60s per-IP rate limit. The iOS client surfaces a 429 error. However, if the endpoint is temporarily unavailable (500, timeout, network partition), iOS returns a generic "Network error. Try again." The form remains enabled and allows the user to proceed to the signup RPC, which will then fail if the username actually conflicts. The server signup route (web/route.js:67–81) does an upsert, which succeeds regardless of prior availability checks. This is actually safe (the upsert will fail with a constraint if the username exists), but the UX is degraded: the user goes through signup, hits a duplicate-username error on the final step, and must retry.
**Impact:** User friction — username conflict is discovered at signup submission instead of during entry. Pre-flight unavailability is not retried or surfaced as a blocker.
**Reproduction:**
1. Sign in to the dev server; kill the check-username endpoint.
2. Attempt signup with a new username.
3. Expected (ideal): "Cannot verify username; try again." Actual: Form allows submission; duplicate check happens post-auth at the upsert.
**Suggested fix direction:** Retry the check-username call on transient failures (5xx, timeout) before allowing form submission, or disable Submit until check succeeds.
**Confidence:** MEDIUM

### F-A10-3-06 — Deep-link recovery session does not refresh permissions after password reset
**File:line:** `VerityPost/AuthViewModel.swift:358–376`, `VerityPost/AuthViewModel.swift:134–139`
**Evidence:**
```swift
// AuthViewModel.swift — updatePassword (password reset flow)
func updatePassword(_ newPassword: String) async -> Bool {
    do {
        _ = try await client.auth.update(user: UserAttributes(password: newPassword))
        isRecoveringPassword = false
        if let session = try? await client.auth.session {
            await loadUser(id: session.user.id.uuidString)
            isLoggedIn = true
        }
        return true
    } catch { ... }
}
```
After the user resets their password via the deep link, the session is active and the user row is reloaded. However, `PermissionService` is never invalidated or refreshed. If the password-reset action itself changes permissions (e.g., via a server trigger), or if permissions were stale before the reset, the cached set will not update. In practice, permissions don't change on password reset, but the pattern is inconsistent with the post-login flow in `login()` (AuthViewModel.swift:149–185), which does NOT refresh permissions either. Only the subscription-change listener (AuthViewModel.swift:46–62) refreshes permissions.
**Impact:** LOW — password resets don't normally change permissions, but the architecture is fragile. Future permission-on-password-reset rules would not propagate to the UI without explicit code changes.
**Reproduction:**
1. User resets password via deep link and logs in successfully.
2. Permissions cache retains values from before the reset.
3. If a server trigger changed permissions during reset, UI would show stale values until next app restart or manual cache invalidation.
**Suggested fix direction:** Call `PermissionService.shared.invalidate()` + `loadAll()` after password reset and login flow, matching the subscription-change pattern.
**Confidence:** MEDIUM

### F-A10-3-07 — Expert Q&A skeleton code remains with #if false gate
**File:line:** `VerityPost/StoryDetailView.swift:1907–1919`
**Evidence:**
```swift
// Expert Q&A
#if false
// TODO(round9-expert-qa-shape): expert_discussions uses title/body/parent_id/is_expert_question tree, not question/answer/question_id cols. Redesign needed to reconstruct Q+A pairs via parent_id + is_expert_question + expert_question_status.
do {
    struct EQ: Decodable { let id: String; let question: String }
    let qs: [EQ] = try await client.from("expert_discussions")
        .select("id, question")
```
Dead code remains in StoryDetailView, gated by `#if false`. The comment documents a schema mismatch (expert_discussions uses a tree structure, not a flat question/answer pair). The code is incomplete and references non-existent columns. While harmless when gated, it signals unresolved design work and should be removed or tracked in a separate branch/issue.
**Impact:** LOW — code is unreachable, but maintainability is reduced. Future developers may waste time understanding an abandoned attempt.
**Reproduction:** Read StoryDetailView.swift around line 1907; observe the #if false block.
**Suggested fix direction:** Remove the dead code block entirely, or move it to a GitHub issue/milestone for round 9 expert Q&A redesign.
**Confidence:** LOW (not a functional bug, but code hygiene issue)

## LOW

### F-A10-3-08 — PushRegistration token sync is fire-and-forget; failure is silent
**File:line:** `VerityPost/PushRegistration.swift:44–81`
**Evidence:**
```swift
func handleDeviceToken(_ token: Data) {
    // ... build args ...
    Task {
        // ...
        try await client.rpc("upsert_user_push_token", params: args).execute()
        // Fire-and-forget; no completion handler
    } catch {
        Log.d("Push token upload error:", error)
    }
}
```
When APNs delivers a device token, the token is synced to the backend via `upsert_user_push_token` RPC. If the RPC fails (network, server error), the failure is logged (debug level) but not surfaced. The app continues without a registered device token, so no push notifications will be delivered. The user won't know. On next app launch, if the token hasn't expired, the same RPC is not re-attempted; if it has, APNs will deliver a new one and the race repeats.
**Impact:** LOW — silent failure to register APNs token. Push notifications won't arrive, but user has no feedback. Affects feature completeness, not core functionality.
**Reproduction:**
1. Mock the Supabase RPC to always fail.
2. Grant APNs permission; observe handleDeviceToken() is called, RPC fails silently.
3. Push notifications will never arrive.
**Suggested fix direction:** Retry `upsert_user_push_token` on transient failures (exponential backoff), or store the pending token and retry on app foreground.
**Confidence:** MEDIUM (likely-to-happen in real networks)

### F-A10-3-09 — Signup form does not rollback username if auth.signUp succeeds but user upsert fails
**File:line:** `VerityPost/AuthViewModel.swift:267–283`
**Evidence:**
```swift
let result = try await client.auth.signUp(email: email, password: password)
let userId = result.user.id.uuidString

// ... username validation calls /api/auth/check-username ... (passes)

try await client.from("users")
    .upsert(UserUpsert(id: userId, email: email, username: normalized), onConflict: "id")
    .execute()
```
The iOS signup flow calls `auth.signUp()` first (creates the Supabase user), then upserts the users row. If the auth succeeds but the users table insert fails (due to a constraint, e.g., a concurrent signup with the same username), the auth user is created but the users row is missing. The web API signup (route.js:121–127) handles this by rolling back the auth user if the user_roles insert fails. iOS has no rollback for the users insert failure. The user would be stuck with an incomplete account.
**Impact:** MEDIUM — the race is rare (concurrent signups with same username after check-username passed), but the result is a broken account with no auth row in the users table. User cannot log in.
**Reproduction:**
1. Modify iOS signup to NOT call check-username.
2. Two clients submit signup with identical username simultaneously.
3. First client's auth.signUp() succeeds, users insert succeeds.
4. Second client's auth.signUp() succeeds, users insert fails (duplicate username constraint).
5. Second user is now signed up but their users row is missing; they cannot read profile data.
**Suggested fix direction:** Wrap users insert in a try/catch; if it fails, call `auth.signOut()` before returning the error.
**Confidence:** LOW (race is uncommon, but consequence is severe if it occurs)

## UNSURE

### U-A10-3-01 — FamilyDashboardView reads kid_profiles with is_active=true filter instead of via /api/kids
**File:line:** `VerityPost/FamilyViews.swift:390–400`
**Evidence:**
```swift
let rows: [KidProfile] = try await client.from("kid_profiles")
    .select()
    .eq("parent_user_id", value: userId)
    .eq("is_active", value: true)
    .order("created_at", ascending: true)
    .execute().value
```
While the family dashboard reads kid_profiles directly, the /api/kids GET endpoint (web/route.js:16–39) also enforces `kids.parent.view` permission server-side and filters `is_active=true`. iOS is reading the same table with the same filter but no server permission check. Per the Prompt 11 pattern, this should route through the API to consolidate permission logic. However, RLS on kid_profiles may grant direct read access to parents of their own kids. Need clarification: is the direct read safe because RLS grants it, or should it be refactored to /api/kids?
**Impact:** UNKNOWN — depends on whether RLS policy grants direct kid_profiles read. If yes, no risk. If no, permissions bypass.
**Reproduction:** Check the RLS policy on kid_profiles table for the authenticated role.
**Suggested fix direction:** Verify RLS explicitly grants authenticated.parent_user_id = kid_profiles.parent_user_id; if not, refactor to /api/kids endpoint.
**Confidence:** LOW (requires DB schema inspection)

