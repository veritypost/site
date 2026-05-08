// One-time migration that re-writes every UserDefaults key the kids
// app uses, so iOS re-applies the new file-protection class
// (NSFileProtectionComplete) declared in VerityPostKids.entitlements.
//
// Without this, existing installs keep whatever protection class the
// plist had at first write — typically NSFileProtectionCompleteUntilFirstUserAuthentication.
// Touching the values forces the OS to recreate the plist under the
// new entitlement.
//
// The flag is itself a UserDefaults boolean, so the migration is a
// no-op on every launch after the first one post-upgrade. The keys
// listed below are the full set of UserDefaults keys used by the
// kids app as of 2026-05-08:
//   - vp.kids.pair.kid_profile_id          (PairingClient.kidIdKey)
//   - vp.kids.pair.kid_name                (PairingClient.kidNameKey)
//   - vp.kids.pair.expires_at              (PairingClient.expiresKey)
//   - vp.kids.pair.device_id               (PairingClient.deviceKey)
//   - vp.kids.parental_gate.lockout_until  (ParentalGateModal.lockoutKey)
//
// Keychain entries (vp.kids.pair.token, vp.kids.pair.install_id) are
// already protected via kSecAttrAccessibleWhenUnlockedThisDeviceOnly
// and don't need a similar refresh.

import Foundation
import os.log

enum DataProtectionMigration {
    private static let upgradedFlagKey = "vp.kids.dataProtection.upgradedV1"
    private static let log = Logger(
        subsystem: "com.veritypost.kids",
        category: "DataProtection"
    )

    /// All UserDefaults keys the kids app ever writes. Touch each one
    /// (read → re-write) so iOS re-creates the backing plist under the
    /// new NSFileProtectionComplete class. Reading-then-writing the
    /// same value is idempotent for callers but moves the file under
    /// the new protection class for the OS.
    private static let keysToRewrite: [String] = [
        "vp.kids.pair.kid_profile_id",
        "vp.kids.pair.kid_name",
        "vp.kids.pair.expires_at",
        "vp.kids.pair.device_id",
        "vp.kids.parental_gate.lockout_until",
    ]

    /// Run at every app launch. No-ops after the first post-upgrade
    /// launch sets the flag.
    static func runIfNeeded() {
        let defaults = UserDefaults.standard
        if defaults.bool(forKey: upgradedFlagKey) {
            return
        }

        for key in keysToRewrite {
            // value(forKey:) returns Any? regardless of the underlying
            // type (String, Date, Bool, Number) — round-tripping through
            // setValue:forKey: preserves the original type.
            if let value = defaults.value(forKey: key) {
                defaults.set(value, forKey: key)
            }
        }

        defaults.set(true, forKey: upgradedFlagKey)

        // Stateless ops sentinel — no PII, just a one-time signal that
        // the upgrade ran on this install. Useful when correlating
        // file-protection class changes against any post-upgrade
        // breakage reports.
        log.info("kids_data_protection_upgraded")
    }
}
