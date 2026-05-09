import Foundation
import Supabase
import os.log

private let log = Logger(subsystem: "com.veritypost.kids", category: "Pairing")

// Kid-side pairing network + token persistence.
//
// Flow:
//   1. User enters 8-char code in PairCodeView
//   2. PairingClient.pair(code:) hits POST /api/kids/pair
//   3. Response { access_token, kid_profile_id, kid_name, expires_at }
//   4. Store in Keychain (token) + UserDefaults (kid_profile_id, kid_name, expires_at)
//   5. Set the session on Supabase client via setSession
//   6. All subsequent queries use the kid JWT; RLS sees kid_profile_id claim

struct PairSuccess: Decodable {
    let access_token: String
    let kid_profile_id: String
    let kid_name: String
    let expires_at: String
}

struct ExistingKid: Decodable, Identifiable, Equatable {
    let id: String
    let display_name: String
    let avatar_url: String?
    let avatar_preset: String?
    let avatar_color: String?
    let paused_at: String?
    let is_active: Bool
    let has_pin: Bool
}

private struct ExistingKidList: Decodable {
    let kids: [ExistingKid]
}

// K2: /api/kids/refresh response shape (no kid_name — only the rotating fields).
private struct RefreshSuccess: Decodable {
    let access_token: String
    let kid_profile_id: String
    let expires_at: String
}

enum PairError: Error, LocalizedError {
    case network
    case invalidCode
    case codeUsed
    case codeExpired
    case rateLimited
    case notConfigured
    case unauthorized
    case emailUnverified
    case kidCapReached(maxKids: Int)
    case seatRequired(extraCents: Int)
    case seatCheckUnavailable
    case validation(String)
    case consentVersionStale(currentVersion: String)
    case server(String)

    var errorDescription: String? {
        switch self {
        case .network:        return "Couldn't reach the server. Check the connection."
        case .invalidCode:    return "That code isn't valid. Ask for a fresh one."
        case .codeUsed:       return "This code was already used. Ask for a new one."
        case .codeExpired:    return "This code expired. Ask for a new one."
        case .rateLimited:    return "Too many tries. Wait a minute and try again."
        case .notConfigured:  return "Pairing isn't set up yet."
        case .unauthorized:   return "Session expired. Ask a parent to pair again."
        case .emailUnverified:        return "Verify your email before adding a reader. Check your inbox."
        case .kidCapReached(let max): return "You've reached the limit of \(max) readers on your plan."
        case .seatRequired:           return "Adding this reader requires upgrading your plan. Open the parent web app to add a seat."
        case .seatCheckUnavailable:   return "Couldn't check your plan. Try again in a moment."
        case .validation(let msg):    return msg
        case .consentVersionStale(let current):
            return "Verity Post Kids needs an update. Please update from the App Store. (App: 2026-04-15-v1, Required: \(current))"
        case .server(let m):  return m
        }
    }
}

@MainActor
final class PairingClient {
    static let shared = PairingClient()
    private init() {}

    private let tokenKey = "vp.kids.pair.token"
    private let kidIdKey = "vp.kids.pair.kid_profile_id"
    private let kidNameKey = "vp.kids.pair.kid_name"
    private let expiresKey = "vp.kids.pair.expires_at"
    private let deviceKey = "vp.kids.pair.device_id"
    // Ext-W.1 — install-scoped UUID stored alongside the keychain token.
    // Keychain survives app uninstall; UserDefaults does not. On every
    // token read we compare the device UUID stored in the keychain with
    // the current UserDefaults UUID; mismatch → uninstall happened
    // between writes → previous kid's session would otherwise leak to
    // a sibling on a shared iPad. Mismatch invalidates and clears.
    private let installIdKeychainKey = "vp.kids.pair.install_id"

    // The server's toISOString() always emits fractional seconds (e.g. "…T10:00:00.000Z").
    // Default ISO8601DateFormatter doesn't parse those — dates silently return nil,
    // skipping expiry checks and the refreshIfNeeded threshold. One cached formatter
    // covers both call sites.
    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    /// Device identifier — stable per install. Sent with the pair request
    /// so the server can audit which physical device redeemed a code.
    var deviceId: String {
        if let existing = UserDefaults.standard.string(forKey: deviceKey) {
            return existing
        }
        let fresh = UUID().uuidString
        UserDefaults.standard.set(fresh, forKey: deviceKey)
        return fresh
    }

    /// True when a keychain token + kid id are both present. Consumers use
    /// this to detect when refreshIfNeeded hit an unauthorized response and
    /// cleared local state, so the UI can drop back to PairCodeView.
    var hasCredentials: Bool {
        keychainReadToken() != nil
            && UserDefaults.standard.string(forKey: kidIdKey) != nil
    }

    /// Read-only kid token accessor for callers that need to forward the
    /// bearer to a per-request URLSession path (parent-mode sheets,
    /// SensitiveActionView, etc.). Routes through `keychainReadToken`'s
    /// install-id freshness gate (Ext-W.1) — a stale keychain entry from
    /// a prior install returns nil, matching what every other consumer of
    /// the kid token sees. Internal visibility: kids app target only.
    func storedKidToken() -> String? {
        keychainReadToken()
    }

    // MARK: Pair

    func pair(code: String) async throws -> PairSuccess {
        let cleanCode = code
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()

        let url = SupabaseKidsClient.shared.siteURL
            .appendingPathComponent("api/kids/pair")

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 15
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "code": cleanCode,
            "device": deviceId,
        ])

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            throw PairError.network
        }

        guard let http = response as? HTTPURLResponse else {
            throw PairError.server("Unexpected response")
        }

        if http.statusCode == 200 {
            let success = try JSONDecoder().decode(PairSuccess.self, from: data)
            persist(success)
            try await applySession(token: success.access_token)
            return success
        }

        // Error branches
        let msg = (try? JSONDecoder().decode(ServerError.self, from: data))?.error
            ?? "Pairing failed"
        switch http.statusCode {
        case 400:  throw PairError.invalidCode
        case 410:
            if msg.localizedCaseInsensitiveContains("used")    { throw PairError.codeUsed }
            if msg.localizedCaseInsensitiveContains("expired") { throw PairError.codeExpired }
            throw PairError.server(msg)
        case 429:  throw PairError.rateLimited
        case 503:  throw PairError.notConfigured
        default:   throw PairError.server(msg)
        }
    }

    // MARK: Pair Direct (parent signup flow)

    /// Called during parent-signup: parent's access token authorises the pair,
    /// no 8-char code needed. Returns the resulting kid session.
    ///
    /// V2 (server-side flag pair_direct_v2_enforced=ON) requires
    /// `dateOfBirth` ('YYYY-MM-DD' UTC) and `parentName`; the client sends
    /// the structured `consent` block with the canonical version string.
    /// V1 servers (flag OFF) ignore the extra fields harmlessly.
    func pairDirect(
        parentToken: String,
        kidName: String,
        dateOfBirth: String,
        parentName: String
    ) async throws -> PairSuccess {
        let url = SupabaseKidsClient.shared.siteURL
            .appendingPathComponent("api/kids/pair-direct")

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 15
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(parentToken)", forHTTPHeaderField: "Authorization")
        let bodyDict: [String: Any] = [
            "kid_name": kidName,
            "date_of_birth": dateOfBirth,
            "consent": [
                "parent_name": parentName.trimmingCharacters(in: .whitespacesAndNewlines),
                "ack": true,
                "version": "2026-04-15-v1",
            ],
            "device": deviceId,
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: bodyDict)

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            throw PairError.network
        }

        guard let http = response as? HTTPURLResponse else {
            throw PairError.server("Unexpected response")
        }

        if http.statusCode == 200 {
            let success = try JSONDecoder().decode(PairSuccess.self, from: data)
            persist(success)
            try await applySession(token: success.access_token)
            return success
        }

        // Error branches. Decode the shared error envelope so the optional
        // `code` and `current_version` fields can map V2-specific failures
        // to typed cases the UI can branch on.
        let envelope = (try? JSONDecoder().decode(PairErrorEnvelope.self, from: data))
        let msg = envelope?.error ?? "Pairing failed"
        let code = envelope?.code

        switch http.statusCode {
        case 400:
            switch code {
            case "kid_cap_reached":
                throw PairError.kidCapReached(maxKids: envelope?.max_kids ?? 4)
            case "consent_version_stale":
                throw PairError.consentVersionStale(currentVersion: envelope?.current_version ?? "unknown")
            case "consent_invalid":
                throw PairError.validation(msg)
            default:
                // DOB / kid_name validators land here. Server messages are
                // user-friendly; surface verbatim.
                throw PairError.validation(msg)
            }
        case 401:  throw PairError.unauthorized
        case 402:
            throw PairError.seatRequired(extraCents: envelope?.extra_kid_price_cents ?? 499)
        case 403:
            if code == "email_unverified" { throw PairError.emailUnverified }
            throw PairError.server(msg)
        case 429:  throw PairError.rateLimited
        case 503:
            if code == "seat_check_unavailable" { throw PairError.seatCheckUnavailable }
            throw PairError.notConfigured
        default:   throw PairError.server(msg)
        }
    }

    // MARK: List + Adopt Existing (returning-parent flow)

    /// Fetch the parent's active kids for the picker. Bearer is the parent's
    /// access token from /api/auth/verify-magic-code.
    func listKids(parentToken: String) async throws -> [ExistingKid] {
        let url = SupabaseKidsClient.shared.siteURL
            .appendingPathComponent("api/kids/parent/list")

        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.timeoutInterval = 15
        req.setValue("Bearer \(parentToken)", forHTTPHeaderField: "Authorization")

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            throw PairError.network
        }
        guard let http = response as? HTTPURLResponse else {
            throw PairError.server("Unexpected response")
        }

        if http.statusCode == 200 {
            return try JSONDecoder().decode(ExistingKidList.self, from: data).kids
        }
        let envelope = (try? JSONDecoder().decode(PairErrorEnvelope.self, from: data))
        let msg = envelope?.error ?? "Couldn\u{2019}t load readers"
        switch http.statusCode {
        case 401: throw PairError.unauthorized
        case 429: throw PairError.rateLimited
        case 503: throw PairError.notConfigured
        default:  throw PairError.server(msg)
        }
    }

    /// Mint a kid session for an existing profile the parent owns. Persists
    /// the kid token to keychain + UserDefaults and applies the bearer to the
    /// shared Supabase client — identical post-success behaviour to pairDirect.
    func adoptExistingKid(
        parentToken: String,
        kidProfileId: String
    ) async throws -> PairSuccess {
        let url = SupabaseKidsClient.shared.siteURL
            .appendingPathComponent("api/kids/parent/adopt-existing")

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 15
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(parentToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "kid_profile_id": kidProfileId,
            "device": deviceId,
        ])

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            throw PairError.network
        }
        guard let http = response as? HTTPURLResponse else {
            throw PairError.server("Unexpected response")
        }

        if http.statusCode == 200 {
            let success = try JSONDecoder().decode(PairSuccess.self, from: data)
            persist(success)
            try await applySession(token: success.access_token)
            return success
        }
        let envelope = (try? JSONDecoder().decode(PairErrorEnvelope.self, from: data))
        let msg = envelope?.error ?? "Couldn\u{2019}t open this reader"
        switch http.statusCode {
        case 400: throw PairError.validation(msg)
        case 401: throw PairError.unauthorized
        case 404: throw PairError.validation(msg)
        case 409: throw PairError.validation(msg)
        case 429: throw PairError.rateLimited
        case 503: throw PairError.notConfigured
        default:  throw PairError.server(msg)
        }
    }

    // MARK: Persistence + Supabase session

    func restore() async -> StoredPair? {
        guard let token = keychainReadToken(),
              let kidId = UserDefaults.standard.string(forKey: kidIdKey),
              let kidName = UserDefaults.standard.string(forKey: kidNameKey),
              let expiresIso = UserDefaults.standard.string(forKey: expiresKey)
        else { return nil }

        // Check expiry. Treat a malformed `expiresIso` (corrupted
        // UserDefaults / older write format) as expired — falling
        // through silently kept the kid on a possibly-dead bearer
        // until a server 401, which the parent could mistake for a
        // network problem. clear() drops them cleanly back to the
        // pair screen.
        guard let expires = Self.isoFormatter.date(from: expiresIso) else {
            log.error("[PairingClient] restore: malformed expiresIso, treating as expired")
            clear()
            return nil
        }
        if expires < Date() {
            clear()
            return nil
        }

        // T-022 — surface applySession failures. Prior code silently
        // swallowed via `try?`, leaving the kid with a restored token
        // but no active Supabase session → anon browsing without any
        // signal to parent. Clear local state + return nil so the UI
        // drops back to the pair screen.
        do {
            try await applySession(token: token)
        } catch {
            log.error("[PairingClient] restore: applySession failed — \(error.localizedDescription, privacy: .private)")
            clear()
            return nil
        }

        // K2 — rotate the JWT on restore if under 24h of TTL remain. A stale
        // token that silently 401s mid-session was the prior failure mode:
        // the kid kept browsing against PostgREST with an expired bearer and
        // RLS blocked every subsequent read with no user-visible signal.
        // Refresh is best-effort; transient network failures don't clear the
        // session (the existing token is still valid until exp). A 401 from
        // /api/kids/refresh means the profile is gone/paused — in that case
        // we clear + drop the kid back to PairCodeView.
        await refreshIfNeeded()

        // Re-read in case refresh rotated the persisted values.
        let refreshedToken = keychainReadToken() ?? token
        let refreshedKidName = UserDefaults.standard.string(forKey: kidNameKey) ?? kidName
        return StoredPair(token: refreshedToken, kidProfileId: kidId, kidName: refreshedKidName)
    }

    // MARK: Refresh (K2)

    /// Check the stored expiry; if under 24h remains, rotate the JWT via
    /// /api/kids/refresh. Safe to call on foreground + periodically.
    /// On 401 from the refresh endpoint, clears local state so the UI
    /// drops back to PairCodeView.
    func refreshIfNeeded() async {
        guard let expiresIso = UserDefaults.standard.string(forKey: expiresKey) else { return }
        guard let expires = Self.isoFormatter.date(from: expiresIso) else { return }
        let secondsLeft = expires.timeIntervalSinceNow
        // <24h remaining → rotate. >24h → no-op.
        guard secondsLeft < 24 * 60 * 60 else { return }

        do {
            try await refresh()
        } catch PairError.unauthorized {
            log.error("[PairingClient] refresh rejected — profile unavailable; clearing session")
            clear()
        } catch {
            // Transient failures (network, rate limit, server hiccup) are
            // non-fatal — the existing token is still valid; we'll retry on
            // the next foreground / restore. Only unauthorized clears state.
            log.error("[PairingClient] refreshIfNeeded: \(error.localizedDescription, privacy: .private)")
        }
    }

    /// Unconditional refresh — rotate the current JWT regardless of age.
    /// Throws PairError.unauthorized on 401 (caller should clear + re-pair).
    func refresh() async throws {
        guard let currentToken = keychainReadToken() else {
            throw PairError.unauthorized
        }

        let url = SupabaseKidsClient.shared.siteURL
            .appendingPathComponent("api/kids/refresh")

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 15
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(currentToken)", forHTTPHeaderField: "Authorization")
        // Ext-W.1 — server compares this against the device_id stored on
        // the live kid_sessions row. Mismatch → 401 device_mismatch →
        // refreshIfNeeded clears local state and we route back to PairCodeView.
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "device": deviceId,
        ])

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            throw PairError.network
        }

        guard let http = response as? HTTPURLResponse else {
            throw PairError.server("Unexpected response")
        }

        switch http.statusCode {
        case 200:
            let success = try JSONDecoder().decode(RefreshSuccess.self, from: data)
            keychainWriteToken(success.access_token)
            UserDefaults.standard.set(success.expires_at, forKey: expiresKey)
            try await applySession(token: success.access_token)
        case 401:
            throw PairError.unauthorized
        case 429:
            throw PairError.rateLimited
        case 503:
            throw PairError.notConfigured
        default:
            let msg = (try? JSONDecoder().decode(ServerError.self, from: data))?.error
                ?? "Refresh failed"
            throw PairError.server(msg)
        }
    }

    func clear() {
        keychainDeleteToken()
        UserDefaults.standard.removeObject(forKey: kidIdKey)
        UserDefaults.standard.removeObject(forKey: kidNameKey)
        UserDefaults.standard.removeObject(forKey: expiresKey)
        // Clear device ID so a re-pair on a shared device starts with a fresh
        // rate-limit bucket instead of inheriting the previous kid's quota.
        UserDefaults.standard.removeObject(forKey: deviceKey)
        SupabaseKidsClient.shared.setBearerToken(nil)
    }

    private func persist(_ success: PairSuccess) {
        keychainWriteToken(success.access_token)
        UserDefaults.standard.set(success.kid_profile_id, forKey: kidIdKey)
        UserDefaults.standard.set(success.kid_name, forKey: kidNameKey)
        UserDefaults.standard.set(success.expires_at, forKey: expiresKey)
    }

    private func applySession(token: String) async throws {
        // Our kid JWT isn't a Supabase Auth session (sub = kid_profile_id,
        // not an auth.users id). So we skip setSession and instead inject
        // the token as a global Authorization header on the shared client.
        // PostgREST validates the signature + honours RLS via the claims.
        SupabaseKidsClient.shared.setBearerToken(token)
    }

    // MARK: Keychain (minimal)

    private func keychainWriteToken(_ token: String) {
        let data = Data(token.utf8)
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrAccount as String: tokenKey,
        ]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
        // Ext-W.1 — write the current install UUID into a paired keychain
        // entry. Read-side compares it with UserDefaults; mismatch ==
        // uninstall happened between writes.
        keychainWriteInstallId(deviceId)
    }

    private func keychainReadToken() -> String? {
        // Ext-W.1 — install freshness check. If the keychain holds a
        // token from a prior install (UserDefaults wiped, keychain
        // persisted), refuse it and clear so the next launch routes
        // back to PairCodeView.
        if let storedInstallId = keychainReadInstallId(), storedInstallId != deviceId {
            keychainDeleteToken()
            return nil
        }
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrAccount as String: tokenKey,
            kSecReturnData as String:  true,
            kSecMatchLimit as String:  kSecMatchLimitOne,
        ]
        var out: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &out)
        guard status == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func keychainDeleteToken() {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrAccount as String: tokenKey,
        ]
        SecItemDelete(query as CFDictionary)
        // Ext-W.1 — clear the paired install id too, so a future token
        // write starts from a clean state.
        let installQuery: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrAccount as String: installIdKeychainKey,
        ]
        SecItemDelete(installQuery as CFDictionary)
    }

    // Ext-W.1 — install-id helpers. Write/read alongside the token so
    // the freshness check is atomic with token presence.
    private func keychainWriteInstallId(_ installId: String) {
        let data = Data(installId.utf8)
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrAccount as String: installIdKeychainKey,
        ]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }

    private func keychainReadInstallId() -> String? {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrAccount as String: installIdKeychainKey,
            kSecReturnData as String:  true,
            kSecMatchLimit as String:  kSecMatchLimitOne,
        ]
        var out: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &out)
        guard status == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

struct StoredPair {
    let token: String
    let kidProfileId: String
    let kidName: String
}

private struct ServerError: Decodable {
    let error: String
}

// Richer envelope used by /api/kids/pair-direct. Optional fields are
// populated only on the V2 (flag-on) error branches that need them.
private struct PairErrorEnvelope: Decodable {
    let error: String
    let code: String?
    let max_kids: Int?
    let extra_kid_price_cents: Int?
    let current_version: String?
}
