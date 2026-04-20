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

enum PairError: Error, LocalizedError {
    case network
    case invalidCode
    case codeUsed
    case codeExpired
    case rateLimited
    case notConfigured
    case server(String)

    var errorDescription: String? {
        switch self {
        case .network:        return "Couldn't reach the server. Check the connection."
        case .invalidCode:    return "That code isn't valid. Ask for a fresh one."
        case .codeUsed:       return "This code was already used. Ask for a new one."
        case .codeExpired:    return "This code expired. Ask for a new one."
        case .rateLimited:    return "Too many tries. Wait a minute and try again."
        case .notConfigured:  return "Pairing isn't set up yet."
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

        try? await applySession(token: token)
        return StoredPair(token: token, kidProfileId: kidId, kidName: kidName)
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
    }

    private func keychainReadToken() -> String? {
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
