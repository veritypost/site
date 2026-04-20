import Foundation
import SwiftUI
import Supabase

// Auth state for the kids app. Two ways in:
//
//   (1) Real pairing — PairCodeView → POST /api/kids/pair → kid JWT stored
//       in Keychain, session set on Supabase client, auth.kid is populated.
//       This is the target flow for App Store submission (COPPA-compliant).
//
//   (2) Dev fallback — email/password adult sign-in + kid picker. Allowed
//       in DEBUG builds so you can run the app before the server pair
//       endpoint is deployed. Disabled in release builds.
//
// Once either path succeeds, state looks identical to downstream callers:
// `auth.kid` is set, `auth.isPaired == true`, the Supabase session carries
// identity. The rest of the app doesn't care which path got you there.

@MainActor
final class KidsAuth: ObservableObject {
    // Unified state
    @Published var kid: KidReference? = nil
    @Published var authError: String? = nil
    @Published var isBusy: Bool = false

    // Dev-fallback state
    @Published var adultSession: Session? = nil
    @Published var availableKids: [KidProfile] = []

    private let client: SupabaseClient

    init(client: SupabaseClient = SupabaseKidsClient.shared.client) {
        self.client = client
        Task { await restore() }
    }

    var isPaired: Bool { kid != nil }

    struct KidReference: Equatable {
        let id: String
        var name: String
    }

    // MARK: Restore on launch

    /// Tries real-pair first (Keychain token). Falls back to adult session
    /// if Keychain is empty. If both miss, kid is nil → PairCodeView shows.
    func restore() async {
        isBusy = true
        defer { isBusy = false }

        if let stored = await PairingClient.shared.restore() {
            self.kid = KidReference(id: stored.kidProfileId, name: stored.kidName)
            return
        }

        // Dev fallback: restore adult session if present
        do {
            let session = try await client.auth.session
            self.adultSession = session
            await loadAvailableKids()
        } catch {
            self.adultSession = nil
        }
    }

    // MARK: Pair path (production)

    /// Called by PairCodeView after a successful POST /api/kids/pair.
    func adoptPair(_ success: PairSuccess) {
        self.kid = KidReference(id: success.kid_profile_id, name: success.kid_name)
        self.authError = nil
    }

    func signOut() async {
        await PairingClient.shared.clear()
        try? await client.auth.signOut()
        self.kid = nil
        self.adultSession = nil
        self.availableKids = []
    }

    // MARK: Dev-fallback path (email/password + kid picker)

    func devSignIn(email: String, password: String) async {
        #if !DEBUG
        authError = "Pairing is required — dev sign-in disabled in release builds"
        return
        #else
        isBusy = true
        authError = nil
        defer { isBusy = false }

        do {
            let response = try await client.auth.signIn(email: email, password: password)
            self.adultSession = response
            await loadAvailableKids()
        } catch {
            self.authError = friendly(error)
        }
        #endif
    }

    func selectKid(_ profile: KidProfile) {
        self.kid = KidReference(id: profile.id, name: profile.safeName)
    }

    // MARK: Internals

    private func loadAvailableKids() async {
        guard let user = adultSession?.user else {
            availableKids = []
            return
        }
        do {
            let kids: [KidProfile] = try await client
                .from("kid_profiles")
                .select("id, parent_user_id, display_name, avatar_color, avatar_url, avatar_preset, date_of_birth, age_range, reading_level, streak_current, created_at")
                .eq("parent_user_id", value: user.id.uuidString)
                .order("created_at", ascending: true)
                .execute()
                .value
            self.availableKids = kids
            if kids.count == 1, kid == nil {
                selectKid(kids[0])
            }
        } catch {
            self.authError = "Couldn't load kid profiles: \(error.localizedDescription)"
        }
    }

    private func friendly(_ error: Error) -> String {
        let msg = error.localizedDescription
        if msg.localizedCaseInsensitiveContains("invalid login") { return "Wrong email or password." }
        if msg.localizedCaseInsensitiveContains("email not confirmed") { return "Please verify your email before signing in." }
        return msg
    }
}
