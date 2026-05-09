import Foundation
import SwiftUI
import Supabase

// Pair-only auth for the kids app. Production path: kid enters a pair code
// (PairCodeView) → PairingClient redeems → kid JWT is the Supabase session.
// No adult credentials ever live on this device.

@MainActor
final class KidsAuth: ObservableObject {
    @Published var kid: KidReference? = nil
    @Published var authError: String? = nil
    @Published var isBusy: Bool = false
    @Published var parentSession: ParentSession? = nil
    /// Surface for the parent-mode unpair flow when the server-revoke leg
    /// fails in a way that doesn't justify clearing local state (network,
    /// throttle, expired parent session). ProfileView renders this as a
    /// transient banner; cleared on the next attempt or on successful unpair.
    @Published var unpairBanner: String? = nil
    /// Picker state — drives KidsAppRoot's parent-landing branch. `.idle`
    /// at app start and after sign-out; `.loading` while listKids is in
    /// flight; `.loaded` with the kids array (may be empty); `.failed`
    /// with a user-visible message + retry path.
    @Published var existingKids: ExistingKidsLoad = .idle

    enum ExistingKidsLoad: Equatable {
        case idle
        case loading
        case loaded([ExistingKid])
        case failed(String)
    }

    struct ParentSession {
        let email: String
        let accessToken: String
    }

    struct KidReference: Equatable {
        let id: String
        var name: String
    }

    var isPaired: Bool { kid != nil }

    init() {
        Task { await restore() }
    }

    /// Called on launch — restore paired session from Keychain if present.
    func restore() async {
        isBusy = true
        defer { isBusy = false }

        if let stored = await PairingClient.shared.restore() {
            self.kid = KidReference(id: stored.kidProfileId, name: stored.kidName)
        }
    }

    /// Called after a parent completes signup and their JWT is available.
    func adoptParentSession(email: String, accessToken: String) {
        self.parentSession = ParentSession(email: email, accessToken: accessToken)
        self.authError = nil
    }

    /// Clears the transient parent session (e.g. after pairing completes or is cancelled).
    /// Also signs the parent's GoTrue session out of the underlying Supabase client
    /// so the parent's auth token isn't left sitting in the kids-app keychain.
    /// Async so callers can `await` it before dismissing into the kid flow.
    func clearParentSession() async {
        self.parentSession = nil
        self.existingKids = .idle
        await signOutParentGoTrue()
    }

    /// Hits /api/kids/parent/list with the current parent bearer. Drives the
    /// ParentKidPickerView state machine via `existingKids`. Idempotent so
    /// callers can invoke from `.task` and from a retry button.
    func loadExistingKids() async {
        guard let token = parentSession?.accessToken else {
            existingKids = .failed("Parent session expired.")
            return
        }
        existingKids = .loading
        do {
            let kids = try await PairingClient.shared.listKids(parentToken: token)
            existingKids = .loaded(kids)
        } catch {
            let msg = (error as? LocalizedError)?.errorDescription
                ?? "Couldn\u{2019}t load your readers."
            existingKids = .failed(msg)
        }
    }

    /// Wipe any GoTrue session the kids-app Supabase client may be holding
    /// for the parent's email-OTP login. The kids app authenticates kids via
    /// a custom-minted JWT (no GoTrue session for the kid), but the parent's
    /// OTP-verify flow above DOES create a GoTrue session — and that session
    /// would otherwise persist in the keychain on the kid's device. Signing
    /// out with `scope: .local` clears it locally without touching other
    /// devices the parent may be signed in on. `try?` because failure here
    /// is non-fatal — the next launch would re-restore it briefly, but the
    /// adopted-parent-session state in this object is already cleared.
    func signOutParentGoTrue() async {
        try? await SupabaseKidsClient.shared.client.auth.signOut(scope: .local)
    }

    /// Called by PairCodeView after successful /api/kids/pair.
    func adoptPair(_ success: PairSuccess) {
        self.kid = KidReference(id: success.kid_profile_id, name: success.kid_name)
        self.authError = nil
    }

    /// Unpair this device.
    func signOut() async {
        PairingClient.shared.clear()
        self.kid = nil
        self.authError = nil
    }

    /// Server-coordinated unpair flow used by the destructive-action gate
    /// (PIN + email OTP succeeded; SensitiveActionView handed us a
    /// one-shot `confirmation_token`). Posts to the elevated destructive
    /// route to revoke the kid token server-side, THEN clears local state.
    ///
    /// Outcomes:
    ///   - 200 ok / 401 kid_token_revoked / 409 already_consumed →
    ///       same local cleanup as `signOut()` (idempotent best-effort).
    ///   - 401 invalid_token / session_revoked → keep local state; show
    ///       banner directing the user to retry from Settings.
    ///   - 429 / 500 / network → keep local state; show "try again" banner.
    ///   - Empty token (defensive) → fall back to local-only signOut and log.
    func signOutAfterServerRevoke(confirmationToken: String) async {
        // Defense in depth: never silently bypass server revocation.
        // If the confirmation_token is empty, the server didn't actually
        // confirm — fail loud, keep local state, banner the user back to
        // the unpair flow. Falling through to local signOut would clear
        // the kid app's view of the pairing while leaving the kid JWT
        // valid until natural 24h expiry — that's the bypass we're
        // closing.
        guard !confirmationToken.isEmpty else {
            print("[KidsAuth] signOutAfterServerRevoke called with empty token; refusing local fallback")
            self.unpairBanner = "Couldn\u{2019}t confirm unpair \u{2014} try again."
            return
        }

        // Need the elevated parent token to authorize the destructive call.
        // SensitiveActionView's two-step flow just minted one; if it's gone
        // the parent session expired between confirm and here.
        guard let parentToken = ParentSessionManager.shared.tokenForRequest() else {
            self.unpairBanner = "Parent mode expired \u{2014} open Settings \u{2192} Activity \u{2192} Unpair to try again."
            return
        }

        let url = SupabaseKidsClient.shared.siteURL
            .appendingPathComponent("api/kids/parent/destructive/unpair")

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 15
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(parentToken)", forHTTPHeaderField: "Authorization")
        do {
            req.httpBody = try JSONSerialization.data(withJSONObject: [
                "confirmation_token": confirmationToken
            ])
        } catch {
            self.unpairBanner = "Couldn\u{2019}t unpair right now. Try again in a moment."
            return
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            print("[KidsAuth] destructive/unpair network error:", error)
            self.unpairBanner = "Couldn\u{2019}t unpair right now. Try again in a moment."
            return
        }

        guard let http = response as? HTTPURLResponse else {
            self.unpairBanner = "Couldn\u{2019}t unpair right now. Try again in a moment."
            return
        }

        struct ErrBody: Decodable { let error: String?; let code: String? }
        let errBody = try? JSONDecoder().decode(ErrBody.self, from: data)

        switch http.statusCode {
        case 200:
            // Success — server revoked the kid token. Mirror local state.
            await localCleanupAfterUnpair()
        case 409:
            // already_consumed — best-effort idempotency. Server already
            // revoked on a prior attempt; sync local state.
            await localCleanupAfterUnpair()
        case 401:
            // Server tells us via `code` whether the kid token is already
            // revoked (sync up local state) vs the parent session being gone
            // (keep local state, surface banner).
            if errBody?.code == "kid_token_revoked" {
                await localCleanupAfterUnpair()
            } else {
                // session_revoked / invalid_token / anything else 401 →
                // don't blow away local state on a stale parent JWT.
                self.unpairBanner = "Parent mode expired \u{2014} open Settings \u{2192} Activity \u{2192} Unpair to try again."
            }
        default:
            // 429 / 500 / unexpected — generic retry copy, keep local state.
            print("[KidsAuth] destructive/unpair failed status=\(http.statusCode) body=\(errBody?.error ?? "?")")
            self.unpairBanner = "Couldn\u{2019}t unpair right now. Try again in a moment."
        }
    }

    /// Local state mirror of the existing `signOut()` cleanup. Pulled into
    /// its own helper so the destructive-route flow + the legacy local-only
    /// path stay in lockstep.
    private func localCleanupAfterUnpair() async {
        PairingClient.shared.clear()
        self.kid = nil
        self.authError = nil
        self.unpairBanner = nil
    }
}
