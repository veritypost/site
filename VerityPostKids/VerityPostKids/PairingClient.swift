import Foundation
import Supabase

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

    // MARK: Pair

    func pair(code: String) async throws -> PairSuccess {
        let cleanCode = code
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()

        let url = SupabaseKidsClient.shared.siteURL
            .appendingPathComponent("api/kids/pair")

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
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

    // MARK: Persistence + Supabase session

    func restore() async -> StoredPair? {
        guard let token = keychainReadToken(),
              let kidId = UserDefaults.standard.string(forKey: kidIdKey),
              let kidName = UserDefaults.standard.string(forKey: kidNameKey),
              let expiresIso = UserDefaults.standard.string(forKey: expiresKey)
        else { return nil }

        // Check expiry (lenient — let server reject if really expired)
        let formatter = ISO8601DateFormatter()
        if let expires = formatter.date(from: expiresIso), expires < Date() {
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
            print("[PairingClient] restore: applySession failed —", error)
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
        let formatter = ISO8601DateFormatter()
        guard let expires = formatter.date(from: expiresIso) else { return }
        let secondsLeft = expires.timeIntervalSinceNow
        // <24h remaining → rotate. >24h → no-op.
        guard secondsLeft < 24 * 60 * 60 else { return }

        do {
            try await refresh()
        } catch PairError.unauthorized {
            print("[PairingClient] refresh rejected — profile unavailable; clearing session")
            clear()
        } catch {
            // Transient failures (network, rate limit, server hiccup) are
            // non-fatal — the existing token is still valid; we'll retry on
            // the next foreground / restore. Only unauthorized clears state.
            print("[PairingClient] refreshIfNeeded: ", error)
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
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(currentToken)", forHTTPHeaderField: "Authorization")

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
