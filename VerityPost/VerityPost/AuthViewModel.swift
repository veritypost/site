import AuthenticationServices
import CryptoKit
import Foundation
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18

/// Two-stage budget for the launch splash. ContentView reads this to swap
/// the loading copy (silent → "Connecting…" → slow-network fallback) so a
/// stalled cold start surfaces progress instead of an indefinite spinner.
enum SplashStage: Equatable {
    /// First moments of launch — no copy, just the branded fade-in.
    case initial
    /// 5s+ into the session check — show "Connecting…".
    case connecting
    /// 15s+ — give the user the choice to keep waiting or use the app anon.
    case slowNetwork
}

/// Result of a single session-resolution attempt. `transientError` carries
/// the underlying URLError so the caller can decide retry-vs-bail; in
/// practice the splash retries on transient + bails on signedOut.
enum SessionCheckResult {
    case authenticated
    case signedOut
    case transientError(URLError)
}

/// Why the session-expired banner is showing. Drives banner copy in
/// ContentView so the user understands what happened (token refresh
/// failed mid-session vs. logged-out remotely vs. account-change reauth).
enum SessionExpiredReason: Equatable {
    /// Local token expired or refresh failed (network cause, server cause).
    case tokenExpired
    /// Server reports the session was revoked elsewhere — another device
    /// signed out, admin force-signout, or the account was deleted.
    case remoteSignout
    /// Account-affecting change (email change, password change from
    /// elsewhere, MFA enrollment) requires a fresh sign-in.
    case accountChange
}

/// S9-Q2-iOS — feature flag for the OAuth (Apple + Google) buttons on
/// /login and /signup. Default false: magic-link is the canonical iOS
/// auth flow per OWNER-ANSWERS Q2. Code preserved end-to-end so a one-
/// line flip re-enables OAuth without a rebuild.
let VPOAuthEnabled: Bool = false

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var isLoggedIn = false
    @Published var isLoading = true
    @Published var currentUser: VPUser?
    @Published var authError: String?

    /// S9-Q2-iOS — set after a successful /api/auth/send-magic-link call so
    /// the LoginView / SignupView can swap to a "Check your inbox" card.
    /// Cleared on a new send attempt or when the user dismisses the sheet.
    @Published var magicLinkSentTo: String?
    /// Resend-cooldown remaining seconds. Counts down from 30s after each
    /// successful send. UI disables the resend button while > 0.
    @Published var magicLinkCooldownSec: Int = 0
    private var magicLinkCooldownTask: Task<Void, Never>?

    /// True when signup completed but the email has not yet been verified.
    /// ContentView uses this to show VerifyEmailView instead of the tab bar.
    @Published var needsEmailVerification = false

    /// Email the user signed up with, surfaced on the verify screen so they
    /// know which inbox to check.
    @Published var pendingVerificationEmail: String?

    /// True when a Supabase password-recovery deep link has been opened and
    /// a recovery session is active. ContentView uses this to present the
    /// ResetPasswordView.
    @Published var isRecoveringPassword = false

    /// Set to true when the session listener reports an unexpected signout
    /// (e.g., token refresh failure). MainTabView uses this to show a
    /// "session expired" banner so the user knows why they were bounced.
    @Published var sessionExpired = false

    /// T66 — cross-view request to flip the bottom tab to Home. Used by
    /// deep views (BookmarksView empty-state CTA) that don't otherwise
    /// have access to the tab-bar selection. ContentView observes this
    /// flag and clears it after applying the switch.
    @Published var pendingHomeJump: Bool = false

    /// T88 — local-only onboarding bypass. Set when the server stamp
    /// retries fail and the user taps "Continue anyway." ContentView's
    /// `needsOnboarding` branch ORs this so the user reaches the main app.
    /// On next launch, if `onboarding_completed_at IS NULL` server-side,
    /// the welcome flow re-fires and the stamp retries cleanly.
    @Published var bypassOnboardingLocally: Bool = false
    /// If the splash stalls (network down, Supabase unreachable), expose this
    /// so the UI can offer a retry rather than spinning forever.
    @Published var splashTimedOut = false

    /// Two-stage splash budget: ContentView swaps copy as the stage advances
    /// from `.initial` → `.connecting` (5s) → `.slowNetwork` (15s). The hard
    /// 20s ceiling lives in `runSessionCheck()`.
    @Published var splashStage: SplashStage = .initial

    /// Why the session-expired banner is showing. nil hides the banner.
    /// Set at every signout path: token-refresh failure → `.tokenExpired`,
    /// remote signout / userDeleted → `.remoteSignout`, deep-link reauth /
    /// password change confirmation → `.accountChange`.
    @Published var sessionExpiredReason: SessionExpiredReason?

    private let client = SupabaseManager.shared.client
    private var authStateTask: Task<Void, Never>?
    private var subscriptionObserver: NSObjectProtocol?
    private var wasLoggedIn = false
    /// In-flight guard for `checkSession()`. `retrySession()` cancels this
    /// before re-entering so a retry tap never races a still-running prior
    /// attempt (which would otherwise double-fire stage transitions and the
    /// 20s ceiling).
    private var sessionCheckTask: Task<Void, Never>?
    // T254 — auto-dismiss timer for the session-expired banner. Cancelled
    // on manual dismiss (xmark / Sign-in tap) and on each new sessionExpired
    // = true so a re-fire restarts the timer cleanly.
    private var sessionExpiredDismissTask: Task<Void, Never>?
    /// T206 + T48 — surfaced deep-link failure. ContentView observes this
    /// and renders a banner with a recovery CTA. Set by handleDeepLink on
    /// rejected types or setSession failures. Cleared via
    /// dismissDeepLinkError() or auto-dismiss after 8s.
    @Published var deepLinkError: String? = nil
    private var deepLinkErrorDismissTask: Task<Void, Never>?
    private static let isoFmt = ISO8601DateFormatter()

    init() {
        // Refresh the cached user row whenever StoreKit / restore posts a
        // change notification so the UI's plan badge and tier gates
        // update immediately after purchase.
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
                // Mirrors the web `refreshAllPermissions()` call from
                // SubscriptionContext post-purchase.
                await PermissionService.shared.invalidate()
                await PermissionService.shared.loadAll()
            }
        }
    }

    deinit {
        authStateTask?.cancel()
        sessionExpiredDismissTask?.cancel()
        deepLinkErrorDismissTask?.cancel()
        if let subscriptionObserver {
            NotificationCenter.default.removeObserver(subscriptionObserver)
        }
    }

    /// T254 — schedule the session-expired banner to auto-clear after 8s.
    /// Cancels any prior pending dismiss so a re-fire (multiple expirations
    /// in quick succession) starts the clock fresh.
    private func scheduleSessionExpiredAutoDismiss() {
        sessionExpiredDismissTask?.cancel()
        sessionExpiredDismissTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 8 * 1_000_000_000)
            guard let self, !Task.isCancelled else { return }
            await MainActor.run {
                if self.sessionExpired {
                    self.sessionExpired = false
                    self.sessionExpiredReason = nil
                }
            }
        }
    }

    /// Manual-dismiss helper for the session-expired banner. ContentView's
    /// xmark + "Sign in" CTA both call this so the auto-dismiss timer
    /// stops cleanly and doesn't re-flicker after a manual action.
    func dismissSessionExpired() {
        sessionExpiredDismissTask?.cancel()
        sessionExpiredDismissTask = nil
        sessionExpired = false
        sessionExpiredReason = nil
    }

    // MARK: - Check session on launch

    /// Splash-time session resolution with a coordinated retry + budget model:
    ///
    /// - Per-attempt timeout: 5s. We race the SDK call against a Task.sleep
    ///   so a stalled radio / DNS hang doesn't burn the entire splash budget
    ///   on a single attempt.
    /// - Up to 3 attempts (initial + 2 retries) on transient URLErrors with
    ///   1s, 2s backoff. Hard signout errors bail immediately.
    /// - Total ceiling: 20s. The outer race against `Task.sleep(20s)` is the
    ///   absolute backstop — if we hit it, we drop into `splashTimedOut`
    ///   regardless of attempt state. Per-attempt 5s × 3 + 1s + 2s = 18s,
    ///   leaving 2s of slack for backoff jitter and main-thread hops.
    /// - Stage transitions: `.initial` → `.connecting` at 5s → `.slowNetwork`
    ///   at 15s. ContentView reads `splashStage` to swap copy.
    /// - In-flight guard: `sessionCheckTask` prevents `retrySession()` from
    ///   spawning a parallel run; the prior task is cancelled first.
    func checkSession() async {
        sessionCheckTask?.cancel()
        let task = Task { [weak self] in
            // Unwrap to Void return so the Task type matches
            // `Task<Void, Never>` (optional-chaining on self? would
            // produce `Task<Void?, Never>` and fail the assignment).
            guard let self else { return }
            await self.runSessionCheck()
        }
        sessionCheckTask = task
        await task.value
    }

    private func runSessionCheck() async {
        splashStage = .initial
        splashTimedOut = false

        // Stage advancer — flips splashStage at 5s + 15s. Cancelled in the
        // defer below regardless of outcome.
        let stageTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 5 * 1_000_000_000)
            await MainActor.run {
                guard let self, self.isLoading else { return }
                if self.splashStage == .initial { self.splashStage = .connecting }
            }
            try? await Task.sleep(nanoseconds: 10 * 1_000_000_000)
            await MainActor.run {
                guard let self, self.isLoading else { return }
                self.splashStage = .slowNetwork
            }
        }
        defer {
            stageTask.cancel()
        }

        // 20s outer ceiling. Race the retrying attempts against this so a
        // pathological network state (radio that thinks it has connectivity
        // but doesn't) can't pin the splash forever.
        let ceilingTask = Task<SessionCheckResult, Never> {
            try? await Task.sleep(nanoseconds: 20 * 1_000_000_000)
            return .transientError(URLError(.timedOut))
        }
        let attemptsTask = Task<SessionCheckResult, Never> { [weak self] in
            await self?.attemptSessionWithRetries() ?? .signedOut
        }

        let result: SessionCheckResult = await withTaskGroup(of: SessionCheckResult.self) { group in
            group.addTask { await ceilingTask.value }
            group.addTask { await attemptsTask.value }
            let first = await group.next() ?? .signedOut
            group.cancelAll()
            return first
        }
        ceilingTask.cancel()
        attemptsTask.cancel()

        switch result {
        case .authenticated:
            // attemptSession already loaded the user + flipped isLoggedIn.
            isLoggedIn = true
            wasLoggedIn = true
            splashTimedOut = false
        case .signedOut:
            isLoggedIn = false
            splashTimedOut = false
        case .transientError:
            // Network never recovered within budget — let the UI render
            // anon mode and offer a retry. Don't claim the user is signed
            // out, because we genuinely don't know.
            splashTimedOut = true
        }

        isLoading = false
        splashStage = .initial
        startAuthStateListener()
    }

    /// Run up to 3 session-resolution attempts (initial + 2 retries) with
    /// 1s, 2s backoff between them. Bails on the first non-transient result.
    private func attemptSessionWithRetries() async -> SessionCheckResult {
        let backoffsNs: [UInt64] = [1_000_000_000, 2_000_000_000]
        for attempt in 0...2 {
            if Task.isCancelled { return .signedOut }
            let result = await attemptSession()
            switch result {
            case .authenticated, .signedOut:
                return result
            case .transientError:
                if attempt < 2 {
                    try? await Task.sleep(nanoseconds: backoffsNs[attempt])
                    continue
                }
                return result
            }
        }
        return .signedOut
    }

    /// Internal result variant that threads the user id back so the outer
    /// runner can `loadUser` on the MainActor without re-fetching the
    /// session. `SessionCheckResult` (the public-facing enum) intentionally
    /// stays minimal per T189's contract.
    private enum SessionAttempt {
        case authenticated(uid: String)
        case signedOut
        case transientError(URLError)
    }

    /// Single session-resolution attempt with a 5s race. Discriminates the
    /// thrown error: `URLError.notConnectedToInternet`, `.timedOut`,
    /// `.networkConnectionLost` and friends are TRANSIENT (don't sign the
    /// user out — the session may still be valid, we just couldn't reach
    /// the server). `AuthError.sessionMissing` is a real signout.
    private func attemptSession() async -> SessionCheckResult {
        let attemptTask = Task<SessionAttempt, Never> { [client] in
            do {
                let session = try await client.auth.session
                return .authenticated(uid: session.user.id.uuidString)
            } catch {
                return Self.classify(error)
            }
        }
        let timeoutTask = Task<SessionAttempt, Never> {
            try? await Task.sleep(nanoseconds: 5 * 1_000_000_000)
            return .transientError(URLError(.timedOut))
        }
        let attempt: SessionAttempt = await withTaskGroup(of: SessionAttempt.self) { group in
            group.addTask { await attemptTask.value }
            group.addTask { await timeoutTask.value }
            let first = await group.next() ?? .signedOut
            group.cancelAll()
            return first
        }
        attemptTask.cancel()
        timeoutTask.cancel()

        switch attempt {
        case .authenticated(let uid):
            await loadUser(id: uid)
            return .authenticated
        case .signedOut:
            return .signedOut
        case .transientError(let err):
            return .transientError(err)
        }
    }

    /// Map a thrown error from `client.auth.session` onto the attempt enum.
    /// Anything not explicitly identified as a transient URL/network error
    /// is treated as `.signedOut` — this matches the prior behavior for
    /// genuine auth failures (sessionMissing, refresh-token revoked) while
    /// preserving the transient-vs-real distinction T189 calls for.
    private static func classify(_ error: Error) -> SessionAttempt {
        if let urlErr = error as? URLError {
            switch urlErr.code {
            case .notConnectedToInternet,
                 .timedOut,
                 .networkConnectionLost,
                 .dnsLookupFailed,
                 .cannotConnectToHost,
                 .cannotFindHost,
                 .internationalRoamingOff,
                 .callIsActive,
                 .dataNotAllowed:
                return .transientError(urlErr)
            default:
                break
            }
        }
        // Bare NSURLErrorDomain wrappers can slip through if the SDK boxes
        // the URLError into an NSError before re-throw. Catch by domain too.
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain {
            let transientCodes: Set<Int> = [
                NSURLErrorNotConnectedToInternet,
                NSURLErrorTimedOut,
                NSURLErrorNetworkConnectionLost,
                NSURLErrorDNSLookupFailed,
                NSURLErrorCannotConnectToHost,
                NSURLErrorCannotFindHost,
                NSURLErrorInternationalRoamingOff,
                NSURLErrorCallIsActive,
                NSURLErrorDataNotAllowed,
            ]
            if transientCodes.contains(nsError.code) {
                return .transientError(URLError(URLError.Code(rawValue: nsError.code)))
            }
        }
        if case AuthError.sessionMissing = error {
            return .signedOut
        }
        // Anything else (Postgrest decode failure, server 5xx wrapped as
        // AuthError.api, etc.) is treated as a hard failure rather than a
        // transient. Erring on the side of "show login" is safer than
        // "spin forever on a malformed token".
        return .signedOut
    }

    /// Called from the splash-timeout UI to retry session resolution. The
    /// in-flight guard inside `checkSession()` cancels the prior task so
    /// stage transitions and the 20s ceiling restart cleanly.
    func retrySession() async {
        isLoading = true
        splashTimedOut = false
        sessionExpiredReason = nil
        await checkSession()
    }

    // MARK: - Auth state listener

    /// Listens for token expiry / remote signout / refresh so UI reflects server-side changes.
    private func startAuthStateListener() {
        guard authStateTask == nil else { return }
        let client = self.client
        authStateTask = Task { [weak self] in
            for await (event, session) in client.auth.authStateChanges {
                guard let self else { return }
                switch event {
                case .signedOut, .userDeleted:
                    // If we were previously signed in and didn't request this
                    // (e.g., token expired, remote signout), surface an
                    // expiration banner. The logout() method clears this by
                    // setting currentUser/isLoggedIn itself before the event
                    // fires.
                    let wasSignedIn = self.wasLoggedIn
                    self.currentUser = nil
                    self.isLoggedIn = false
                    self.wasLoggedIn = false
                    if wasSignedIn {
                        // T103 — discriminate the cause. `userDeleted` is
                        // unambiguously remote (account deleted server-side
                        // or admin force-signout). A bare `signedOut` event
                        // arriving when we never called logout() means the
                        // local refresh failed: the token expired and could
                        // not be renewed.
                        self.sessionExpiredReason = (event == .userDeleted)
                            ? .remoteSignout
                            : .tokenExpired
                        self.sessionExpired = true
                        self.scheduleSessionExpiredAutoDismiss()
                    }
                case .tokenRefreshed, .signedIn, .initialSession:
                    if let uid = session?.user.id.uuidString {
                        await self.loadUser(id: uid)
                        // H13 — invalidate + reload the permission cache
                        // whenever the session identity refreshes. Prior
                        // code only called loadUser; permission grants
                        // on the server (plan upgrade, role change)
                        // wouldn't propagate to iOS until a manual
                        // restart / navigation triggered a refresh.
                        // Fire-and-forget — loadUser is the gating call,
                        // permissions are observability-adjacent.
                        Task {
                            await PermissionService.shared.invalidate()
                            await PermissionService.shared.loadAll()
                        }
                        self.isLoggedIn = true
                        self.wasLoggedIn = true
                        self.sessionExpired = false
                        self.sessionExpiredReason = nil
                    }
                default:
                    break
                }
            }
        }
    }

    // MARK: - Login

    func login(email: String, password: String) async {
        authError = nil
        do {
            let session = try await client.auth.signIn(email: email, password: password)

            // Round 5 Item 2: best-effort last_login_at update via the
            // update_own_profile SECDEF RPC (replaces direct users.update).
            // Still best-effort; failure does not block login.
            do {
                struct Args: Encodable { let p_fields: Patch }
                struct Patch: Encodable { let last_login_at: String }
                try await client.rpc(
                    "update_own_profile",
                    params: Args(p_fields: Patch(last_login_at: AuthViewModel.isoFmt.string(from: Date())))
                ).execute()
            } catch {
                Log.d("last_login_at update failed: \(error)")
            }

            // D40: silent welcome-back — if the account is still inside the
            // 30-day deletion grace window, clear the timer. POST the session
            // access token to the web hook endpoint (which uses the service
            // role to call cancel_account_deletion). Best-effort; no UI.
            await cancelDeletionOnLogin(accessToken: session.accessToken)

            await loadUser(id: session.user.id.uuidString)
            isLoggedIn = true
        } catch {
            // Distinguish network errors from bad credentials.
            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain {
                authError = "Network error. Check your connection and try again."
            } else {
                authError = "Invalid email or password"
            }
        }
    }

    // MARK: - Signup

    func signup(
        email: String,
        password: String,
        username: String,
        ageConfirmed: Bool,
        termsAccepted: Bool
    ) async {
        authError = nil

        // Web parity: both checkboxes must be true before we create an
        // account. COPPA age gate + explicit terms acceptance (Bug 7).
        guard ageConfirmed else {
            authError = "Please confirm you are 13 or older to continue."
            return
        }
        guard termsAccepted else {
            authError = "Please accept the Terms of Service and Privacy Policy."
            return
        }

        // Normalize + validate username client-side before touching auth.
        // Swift's `isLetter` matches ANY Unicode letter, which lets Cyrillic
        // `а` (U+0430) and Latin `a` (U+0061) both slip through — a
        // homoglyph-collision / impersonation vector. Restrict to ASCII
        // letters + digits + underscore, matching the web signup filter
        // in web/src/app/signup/pick-username/page.tsx handleChange().
        // NFC-normalise first so any precomposed Latin variants collapse
        // before the ASCII gate.
        let normalized = username
            .precomposedStringWithCanonicalMapping
            .lowercased()
            .trimmingCharacters(in: .whitespaces)
            .filter { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_") }
        guard normalized.count >= 3 else {
            authError = "Username must be at least 3 characters (a-z, 0-9, underscore)."
            return
        }

        do {
            // Route username availability checks through the rate-limited
            // server endpoint instead of direct PostgREST probes. The
            // anon-client .from("reserved_usernames") + .from("users")
            // queries this path previously used had no throttle and let
            // any caller enumerate the full reserved-handles list + every
            // taken username one letter at a time. Web already brokers
            // these through /api/auth/check-username style routes; iOS
            // now matches.
            struct CheckBody: Encodable { let username: String }
            struct CheckResponse: Decodable { let available: Bool?; let reserved: Bool? }
            let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/auth/check-username")
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONEncoder().encode(CheckBody(username: normalized))
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse else {
                authError = "Network error. Try again."
                return
            }
            if http.statusCode == 429 {
                authError = "Too many attempts. Please wait a minute."
                return
            }
            if !(200...299).contains(http.statusCode) {
                authError = "Could not check username availability."
                return
            }
            let parsed = (try? JSONDecoder().decode(CheckResponse.self, from: data))
                ?? CheckResponse(available: nil, reserved: nil)
            if parsed.reserved == true {
                authError = "That username is reserved. Try a different one."
                return
            }
            if parsed.available == false {
                authError = "That username is already taken."
                return
            }

            let result = try await client.auth.signUp(email: email, password: password)
            let userId = result.user.id.uuidString

            // T-031: Set username via update_own_profile RPC instead of a
            // direct upsert on public.users.
            //
            // The on_auth_user_created trigger fires synchronously inside the
            // auth.signUp transaction, inserting the public.users row with
            // id/email/plan_id/locale (but not username). The old upsert
            // raced against that trigger: if the network or Postgres
            // replication delayed the trigger commit, the client INSERT could
            // land first; when the trigger then ran it would silently skip the
            // row (ON CONFLICT DO NOTHING), leaving username NULL. The upsert
            // also wrote `email` back — a field the trigger already owns —
            // which was redundant and tripped RLS in edge cases.
            //
            // update_own_profile is the established write contract for
            // user-owned profile fields (mirrors web pick-username page).
            // It does a targeted UPDATE, not an INSERT, so it is immune to the
            // trigger race and only touches the column we actually own.
            //
            // Retry up to 3 times with 300ms backoff: on the vanishingly rare
            // path where the trigger's transaction hasn't fully committed
            // before the RPC fires (P0002 "user row not found"), a brief
            // wait resolves it without surfacing an error to the user.
            //
            // C17 — rollback the auth.users row on any unrecoverable failure
            // so a retry signup doesn't collide on users.email UNIQUE.
            do {
                struct ProfilePatch: Encodable { let username: String }
                struct RPCArgs: Encodable { let p_fields: ProfilePatch }
                var lastError: Error?
                for attempt in 1...3 {
                    do {
                        try await client.rpc(
                            "update_own_profile",
                            params: RPCArgs(p_fields: ProfilePatch(username: normalized))
                        ).execute()
                        lastError = nil
                        break
                    } catch {
                        lastError = error
                        let msg = error.localizedDescription.lowercased()
                        // P0002: trigger hasn't committed the row yet — wait and retry.
                        guard msg.contains("p0002") || msg.contains("not found") else { break }
                        if attempt < 3 {
                            try? await Task.sleep(nanoseconds: UInt64(attempt) * 300_000_000)
                        }
                    }
                }
                if let err = lastError {
                    throw err
                }
            } catch {
                await attemptSignupRollback(userId: userId)
                authError = Self.friendlyAuthError(error)
                return
            }

            // The default 'user' role and plan_id=free are seeded by the
            // on_auth_user_created trigger (handle_new_auth_user function).
            // user_roles has admin-only INSERT RLS, so the client cannot
            // write here — and does not need to.

            // When Supabase has email confirmation enabled, signUp returns a
            // user but no active session — the UI must hold on VerifyEmailView
            // until the confirmation link is clicked. If confirmation is off,
            // the session is already active and we can treat signup like login.
            let hasSession = (try? await client.auth.session) != nil
            if hasSession {
                await loadUser(id: userId)
                isLoggedIn = true
            } else {
                needsEmailVerification = true
                pendingVerificationEmail = email
            }
        } catch {
            authError = Self.friendlyAuthError(error)
        }
    }

    /// S9-Q2-iOS — true when we have a session but the cached user row's
    /// `username` is nil/empty. ContentView gates on this to push
    /// PickUsernameView before MainTabView so a fresh magic-link signup
    /// always lands on the picker first.
    var needsPickUsername: Bool {
        guard isLoggedIn, let user = currentUser else { return false }
        let uname = user.username?.trimmingCharacters(in: .whitespaces) ?? ""
        return uname.isEmpty
    }

    /// Resend the email verification link. Called from VerifyEmailView when
    /// the user didn't receive the first email.
    func resendVerificationEmail() async -> Bool {
        guard let email = pendingVerificationEmail else { return false }
        do {
            try await client.auth.resend(email: email, type: .signup)
            return true
        } catch {
            authError = "Could not resend verification email."
            return false
        }
    }

    /// Handle a deep-link URL that Supabase sent for password recovery,
    /// email verification, magic-link signin, invite, email-change confirm,
    /// or reauthentication. The URL fragment carries access_token,
    /// refresh_token, and type.
    ///
    /// T206 — type allowlist + surfaced failure UX. Previously the only
    /// type with explicit semantics was `"recovery"`; ANY other value
    /// (typo, future SDK type, attacker-supplied) silently took the
    /// full-signin branch. Now: validate type up front, set
    /// `deepLinkError` on rejection so the UI can surface "Invalid or
    /// expired link." Per adversary review, the redundant
    /// `client.auth.user()` post-validation was dropped — Supabase Swift
    /// SDK 2.43.1 `setSession` already performs the server round-trip
    /// (calls `/user` on unexpired tokens, refreshSession on expired),
    /// so a revoked/dead/cross-project token fails inside setSession.
    func handleDeepLink(_ url: URL) async {
        // PKCE flow (Universal Links from web magic-link emails): the URL
        // arrives as `https://veritypost.com/api/auth/callback?code=XXX`.
        // The web Supabase client uses PKCE, so the token exchange happens
        // here in the app via the SDK's exchangeCodeForSession.
        if let comps = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let code = comps.queryItems?.first(where: { $0.name == "code" })?.value,
           !code.isEmpty {
            do {
                let session = try await client.auth.exchangeCodeForSession(authCode: code)
                deepLinkError = nil
                deepLinkErrorDismissTask?.cancel()
                await loadUser(id: session.user.id.uuidString)
                isLoggedIn = true
                needsEmailVerification = false
                pendingVerificationEmail = nil
                return
            } catch {
                Log.d("Deep link PKCE exchange failed: \(error)")
                setDeepLinkError("This link isn\u{2019}t valid or has expired. Request a new one.")
                return
            }
        }

        // Implicit flow (legacy / direct fragment-style tokens): the URL
        // arrives with `#access_token=...&refresh_token=...&type=...` in
        // the fragment. Used by Supabase's older recovery / OAuth flows.
        guard let fragment = url.fragment ?? url.query else {
            setDeepLinkError("This link isn\u{2019}t valid. Try the most recent email we sent.")
            return
        }
        var params: [String: String] = [:]
        for pair in fragment.split(separator: "&") {
            let kv = pair.split(separator: "=", maxSplits: 1).map(String.init)
            if kv.count == 2 {
                params[kv[0]] = kv[1].removingPercentEncoding ?? kv[1]
            }
        }
        guard let access = params["access_token"],
              let refresh = params["refresh_token"] else {
            setDeepLinkError("This link is missing its token. Try the most recent email we sent.")
            return
        }

        // T206 — type allowlist. Reject any type the app doesn't have an
        // explicit branch for. Includes both legs of the email-change flow
        // (`email_change_current` + `email_change_new`) per Supabase Auth
        // emit shapes; `reauthentication` is included for forward
        // compatibility (Supabase emits this for sensitive-action confirms).
        let type = params["type"] ?? ""
        let allowedTypes: Set<String> = [
            "recovery", "signup", "magiclink", "invite",
            "email_change", "email_change_current", "email_change_new",
            "reauthentication",
        ]
        guard allowedTypes.contains(type) else {
            Log.d("Deep link rejected — unknown type: \(type)")
            setDeepLinkError("This link isn\u{2019}t valid. Try the most recent email we sent.")
            return
        }

        do {
            let session = try await client.auth.setSession(
                accessToken: access,
                refreshToken: refresh
            )
            // Clear any prior deep-link error on success — the link worked.
            deepLinkError = nil
            deepLinkErrorDismissTask?.cancel()

            if type == "recovery" {
                // Present the reset-password screen; do NOT mark
                // isLoggedIn true — the user has a scoped recovery session,
                // not a full sign-in. They'll land on the main app once the
                // password is updated.
                isRecoveringPassword = true
            } else {
                // Signup confirmation, magic link, invite, email-change
                // confirm, or reauthentication — treat as a normal login.
                await loadUser(id: session.user.id.uuidString)
                isLoggedIn = true
                needsEmailVerification = false
                pendingVerificationEmail = nil
            }
        } catch {
            Log.d("Deep link session failed: \(error)")
            setDeepLinkError("This link expired or has already been used. Send a new one and try again.")
        }
    }

    /// T48 — set the deep-link error + schedule auto-dismiss. Mirrors the
    /// session-expired banner pattern from Wave 5a (T254).
    @MainActor
    private func setDeepLinkError(_ msg: String) {
        deepLinkErrorDismissTask?.cancel()
        deepLinkError = msg
        deepLinkErrorDismissTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 8 * 1_000_000_000)
            guard let self, !Task.isCancelled else { return }
            await MainActor.run {
                if self.deepLinkError == msg { self.deepLinkError = nil }
            }
        }
    }

    /// Manual-dismiss helper for the deep-link error banner. ContentView's
    /// xmark handler calls this so the auto-dismiss timer stops cleanly.
    func dismissDeepLinkError() {
        deepLinkErrorDismissTask?.cancel()
        deepLinkErrorDismissTask = nil
        deepLinkError = nil
    }

    /// Submit a new password after the user followed a recovery link.
    /// Returns true on success; UI clears `isRecoveringPassword` and
    /// transitions to the main app.
    func updatePassword(_ newPassword: String) async -> Bool {
        do {
            _ = try await client.auth.update(user: UserAttributes(password: newPassword))
            isRecoveringPassword = false
            // Session is active from the recovery link — load the user row
            // so the app state reflects a full sign-in.
            if let session = try? await client.auth.session {
                await loadUser(id: session.user.id.uuidString)
                isLoggedIn = true
            }
            return true
        } catch {
            authError = "Could not update your password. Try again."
            return false
        }
    }

    /// Map the handful of common Supabase / network errors onto short,
    /// human-readable strings. Anything we don't recognize falls back to a
    /// generic "couldn't create account" copy so we never leak raw SDK text.
    private static func friendlyAuthError(_ error: Error) -> String {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain {
            return "Network error. Check your connection and try again."
        }
        let msg = error.localizedDescription.lowercased()
        if msg.contains("already registered") || msg.contains("already exists") || msg.contains("duplicate") {
            return "That email is already registered. Try signing in instead."
        }
        if msg.contains("invalid email") {
            return "That email doesn\u{2019}t look right. Double-check it and try again."
        }
        if msg.contains("password") && (msg.contains("short") || msg.contains("weak") || msg.contains("at least")) {
            return "Password is too short. Use at least 8 characters."
        }
        if msg.contains("rate limit") {
            return "Too many attempts. Wait a minute and try again."
        }
        return "Couldn\u{2019}t create your account. Please try again."
    }

    // MARK: - Logout

    func logout() async {
        // Always clear local state — user intent is unambiguous.
        // But surface signOut failures so the server-side session isn't silently left alive.
        wasLoggedIn = false
        sessionExpired = false
        sessionExpiredReason = nil
        do {
            try await client.auth.signOut()
        } catch {
            Log.d("signOut failed: \(error)")
            authError = "Signed out locally, but the server session may still be active."
        }
        // Order: server signout → local cache purge → @Published state flip.
        // If caches were cleared first and signOut threw, we'd have wiped
        // local state for a logout that didn't actually take effect server-side.
        await clearLocalCaches()
        // Reset every @Published auth-adjacent field so a subsequent login
        // as a different account doesn't inherit stale state (Bug 27).
        currentUser = nil
        isLoggedIn = false
        needsEmailVerification = false
        pendingVerificationEmail = nil
        isRecoveringPassword = false
        bypassOnboardingLocally = false
        pendingHomeJump = false
        dismissDeepLinkError()
    }

    /// T3.11 — purge per-user state from singletons + the URL response cache
    /// so the next signed-in user doesn't inherit the prior account's
    /// permissions, blocks, or paywalled article responses cached against
    /// `URLSession.shared`.
    ///
    /// `URLCache.shared` holds responses from the authenticated PostgREST
    /// + web-API calls; without a purge, a quickly-following login as a
    /// different account could read paid content out of cache while the
    /// new account's permission set is still loading.
    ///
    /// Singleton resets:
    ///   - `PermissionService` — `compute_effective_perms` cache + version
    ///     watermarks. The auth-state listener already invalidates on
    ///     `signedIn`, but doing it here too guarantees a clean slate even
    ///     if the listener is delayed by URLSession reachability churn.
    ///   - `BlockService` — bidirectional block-set is per-viewer; calling
    ///     `refresh(currentUserId: nil)` collapses it to empty.
    ///   - `StoreManager.purchasedProductIDs` — StoreKit re-derives this
    ///     from `Transaction.currentEntitlements` on next sign-in via the
    ///     transaction listener; clearing it here prevents the in-between
    ///     window where the prior user's tier badge is still showing.
    private func clearLocalCaches() async {
        URLCache.shared.removeAllCachedResponses()
        await PermissionService.shared.invalidate()
        await BlockService.shared.refresh(currentUserId: nil)
        StoreManager.shared.purchasedProductIDs = []
    }

    // MARK: - Login hooks

    /// C17 — roll back a half-completed signup. Called from `signup()`
    /// when the public.users upsert fails after auth.signUp succeeded
    /// (otherwise the orphan auth.users row blocks the user's retry —
    /// users.email UNIQUE collides on re-signup). Sends the fresh bearer
    /// token + userId to `/api/auth/signup-rollback`, which service-role
    /// deletes user_roles → public.users → auth.users in the schema-106
    /// order. Best-effort: logs on failure but doesn't re-throw — the
    /// caller is already surfacing the original upsert error to the user.
    private func attemptSignupRollback(userId: String) async {
        let accessToken: String
        do {
            guard let tok = (try? await client.auth.session)?.accessToken else {
                Log.d("[signup_rollback] no access token available, skipping")
                return
            }
            accessToken = tok
        }
        let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/auth/signup-rollback")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: String] = ["user_id": userId]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        do {
            let (_, response) = try await URLSession.shared.data(for: req)
            if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                Log.d("[signup_rollback] non-2xx: \(http.statusCode)")
            }
        } catch {
            Log.d("[signup_rollback] request failed: \(error)")
        }
        // Clear the auth session locally so the half-signup doesn't leak
        // into the logged-in UI. signOut is idempotent.
        try? await client.auth.signOut()
    }

    /// POST to /api/account/login-cancel-deletion with the current session
    /// access token so the server's service-role client can call
    /// cancel_account_deletion for us. Idempotent — no-op when no deletion
    /// is scheduled. Best-effort: a failure here must never block login.
    private func cancelDeletionOnLogin(accessToken: String) async {
        let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/account/login-cancel-deletion")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        do {
            _ = try await URLSession.shared.data(for: req)
        } catch {
            Log.d("login cancel-deletion hook failed: \(error)")
        }
    }

    // MARK: - Sign in with Apple

    /// Native Sign in with Apple. The SwiftUI `SignInWithAppleButton`
    /// owns the system sheet flow; this method
    ///   1. configures the request (nonce, scopes) via `prepareAppleRequest`
    ///   2. trades the resulting `ASAuthorizationCredential` for a Supabase
    ///      session via `completeAppleSignIn(result:)`
    /// Falls back to web OAuth on token-trade / transport failures so the
    /// SIWA surface is never a dead end. App Store Review Guideline 4.8
    /// requires native SIWA when any third-party login is offered.
    ///
    /// `currentNonce` is held on `self` because the SignInWithAppleButton's
    /// onRequest and onCompletion fire in two separate calls — the
    /// completion handler needs to read the same nonce that was hashed
    /// into the request.
    private var currentNonce: String?

    /// Configure the Apple ID request with a fresh nonce. Call from
    /// `SignInWithAppleButton(onRequest:)`.
    func prepareAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = Self.randomNonceString()
        currentNonce = nonce
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256(nonce)
    }

    /// Trade the system-returned credential for a Supabase session.
    /// Call from `SignInWithAppleButton(onCompletion:)`.
    func completeAppleSignIn(result: Result<ASAuthorization, Error>) async {
        authError = nil
        switch result {
        case .failure(let error):
            if (error as? ASAuthorizationError)?.code == .canceled {
                // User dismissed the sheet — silent.
                currentNonce = nil
                return
            }
            Log.d("Native SIWA failed:", error)
            await fallbackToWebSignInWithApple()
            return

        case .success(let authorization):
            guard
                let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential,
                let identityTokenData = appleIDCredential.identityToken,
                let identityToken = String(data: identityTokenData, encoding: .utf8),
                let nonce = currentNonce
            else {
                Log.d("Native SIWA missing identity token or nonce")
                await fallbackToWebSignInWithApple()
                return
            }

            do {
                _ = try await client.auth.signInWithIdToken(
                    credentials: .init(
                        provider: .apple,
                        idToken: identityToken,
                        nonce: nonce
                    )
                )
                if let session = try? await client.auth.session {
                    await loadUser(id: session.user.id.uuidString)
                    isLoggedIn = true
                    wasLoggedIn = true
                }
            } catch {
                Log.d("Native SIWA token exchange failed:", error)
                await fallbackToWebSignInWithApple()
            }
            currentNonce = nil
        }
    }

    /// Legacy entry point retained for any caller that still wants the
    /// async-throwing path. Internally drives the web OAuth flow as a
    /// fallback only — the primary call site is the SignInWithAppleButton
    /// in LoginView / SignupView.
    func signInWithApple() async {
        await fallbackToWebSignInWithApple()
    }

    private func fallbackToWebSignInWithApple() async {
        do {
            _ = try await client.auth.signInWithOAuth(
                provider: .apple,
                redirectTo: URL(string: "verity://login")
            )
            if let session = try? await client.auth.session {
                await loadUser(id: session.user.id.uuidString)
                isLoggedIn = true
            }
        } catch {
            authError = "Sign in with Apple failed. Try again."
        }
    }

    /// 32-byte cryptographically-random nonce, base64url-character-set
    /// encoded. Apple requires the SHA256 of this in the request and the
    /// raw value passed to Supabase so the identity token can be verified.
    private static func randomNonceString(length: Int = 32) -> String {
        precondition(length > 0)
        var bytes = [UInt8](repeating: 0, count: length)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        precondition(status == errSecSuccess, "SecRandomCopyBytes failed: \(status)")
        let charset: [Character] = Array(
            "0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._"
        )
        return String(bytes.map { charset[Int($0) % charset.count] })
    }

    private static func sha256(_ input: String) -> String {
        let data = Data(input.utf8)
        let hashed = SHA256.hash(data: data)
        return hashed.compactMap { String(format: "%02x", $0) }.joined()
    }

    /// Sign in via Google's OAuth provider. Same `ASWebAuthenticationSession`
    /// path as Apple. Matches web signup's Google option (Bug 21 parity).
    func signInWithGoogle() async {
        authError = nil
        do {
            _ = try await client.auth.signInWithOAuth(
                provider: .google,
                redirectTo: URL(string: "verity://login")
            )
            if let session = try? await client.auth.session {
                await loadUser(id: session.user.id.uuidString)
                isLoggedIn = true
            }
        } catch {
            authError = "Sign in with Google failed. Try again."
        }
    }

    // MARK: - Magic link (S9-Q2-iOS)

    /// POST /api/auth/send-magic-link with the user's email. The route
    /// always returns 200 with a generic body except on a malformed
    /// 400 (input validation). On success we kick off a 30s resend
    /// cooldown so the UI can disable the resend button without
    /// trusting the server response (the response is intentionally
    /// uniform across rate-limit caps, ban-evasion, and beta-gate).
    /// See `web/src/app/api/auth/send-magic-link/route.js` for the
    /// canonical iOS contract published in S3-Q2-f.
    func sendMagicLink(email: String) async -> Bool {
        authError = nil
        let trimmed = email.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, trimmed.contains("@") else {
            authError = "Please enter a valid email."
            return false
        }
        let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/auth/send-magic-link")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        struct Body: Encodable { let email: String }
        req.httpBody = try? JSONEncoder().encode(Body(email: trimmed))
        do {
            let (_, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse else {
                authError = "Network error. Try again."
                return false
            }
            if http.statusCode == 400 {
                authError = "Please enter a valid email."
                return false
            }
            if !(200...299).contains(http.statusCode) {
                authError = "Couldn\u{2019}t send the link. Try again."
                return false
            }
            magicLinkSentTo = trimmed
            startMagicLinkCooldown()
            return true
        } catch {
            authError = "Network error. Try again."
            return false
        }
    }

    /// Reset the magic-link UI state (e.g., when the LoginView/SignupView
    /// sheet dismisses or the user taps "Use a different email").
    func clearMagicLinkState() {
        magicLinkCooldownTask?.cancel()
        magicLinkCooldownTask = nil
        magicLinkSentTo = nil
        magicLinkCooldownSec = 0
        authError = nil
    }

    private func startMagicLinkCooldown() {
        magicLinkCooldownTask?.cancel()
        magicLinkCooldownSec = 30
        magicLinkCooldownTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { break }
                await MainActor.run {
                    guard let self else { return }
                    if self.magicLinkCooldownSec > 0 {
                        self.magicLinkCooldownSec -= 1
                    }
                }
                if let s = await self?.magicLinkCooldownSec, s <= 0 { break }
            }
        }
    }

    // MARK: - Reset password

    func resetPassword(email: String) async -> Bool {
        do {
            // Deep-link back into the iOS app so the recovery session is
            // handled by `handleDeepLink`, not opened in Safari against the
            // web reset-password page (Bug 11). The `verity://` scheme is
            // registered via `project.yml` -> CFBundleURLTypes.
            try await client.auth.resetPasswordForEmail(
                email,
                redirectTo: URL(string: "verity://reset-password")
            )
            return true
        } catch {
            authError = "Could not send reset email"
            return false
        }
    }

    // MARK: - Load user profile

    func loadUser(id: String) async {
        // v2: tier lives on the joined plans table — without the join,
        // every user shows up as "free" and tier-gated UI (Kids row,
        // Messages, Recap, etc.) never appears.
        //
        // Explicit column list — never `select("*")` on `users` from a
        // client surface. The wildcard would ship stripe_customer_id,
        // apple_original_transaction_id (receipts live in subscription
        // rows), last_login_ip, mute_level, failed_login_count,
        // password_hash, kids_pin_hash into the iOS bundle's response
        // cache. Only the VPUser-mapped fields are read by the app.
        do {
            let response: VPUser = try await client.from("users")
                .select(
                    "id, email, email_verified, username, display_name, bio, avatar_color, metadata, is_expert, expert_title, is_verified_public_figure, frozen_at, verity_score, articles_read_count, quizzes_completed_count, streak_current, streak_best, comment_count, followers_count, following_count, show_activity, created_at, onboarding_completed_at, plans(tier)"
                )
                .eq("id", value: id)
                .single()
                .execute()
                .value
            currentUser = response
        } catch {
            Log.d("Failed to load user: \(error)")
        }
    }
}

