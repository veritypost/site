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

    /// Called by PairCodeView after successful /api/kids/pair.
    func adoptPair(_ success: PairSuccess) {
        self.kid = KidReference(id: success.kid_profile_id, name: success.kid_name)
        self.authError = nil
    }

    /// Unpair this device.
    func signOut() async {
        await PairingClient.shared.clear()
        self.kid = nil
        self.authError = nil
    }
}
