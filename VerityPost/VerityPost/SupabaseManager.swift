import Foundation
import Supabase

/// Supabase configuration is sourced exclusively from the app bundle's Info.plist
/// (populated via xcconfig / Build Settings keys INFOPLIST_KEY_SUPABASE_URL and
/// INFOPLIST_KEY_SUPABASE_KEY). Credentials are intentionally NOT hardcoded in
/// source so they can be rotated without a code change and never leak via the
/// compiled binary's string tables.
///
/// In DEBUG builds only, missing values fall back to the SUPABASE_URL /
/// SUPABASE_KEY process environment variables for local dev convenience.
final class SupabaseManager {
    static let shared = SupabaseManager()

    private static func infoValue(_ key: String) -> String? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: key) as? String,
              !raw.isEmpty else { return nil }
        return raw
    }

    #if DEBUG
    private static func envValue(_ key: String) -> String? {
        guard let raw = ProcessInfo.processInfo.environment[key], !raw.isEmpty else { return nil }
        return raw
    }
    #endif

    private static func resolve(_ key: String) -> String? {
        #if DEBUG
        return infoValue(key) ?? envValue(key)
        #else
        return infoValue(key)
        #endif
    }

    private let supabaseURL: URL = {
        guard let raw = SupabaseManager.resolve("SUPABASE_URL") else {
            fatalError("[SupabaseManager] SUPABASE_URL not set. Configure INFOPLIST_KEY_SUPABASE_URL in xcconfig.")
        }
        guard let url = URL(string: raw) else {
            fatalError("[SupabaseManager] SUPABASE_URL is malformed: \(raw)")
        }
        return url
    }()

    private let supabaseKey: String = {
        guard let key = SupabaseManager.resolve("SUPABASE_KEY") else {
            fatalError("[SupabaseManager] SUPABASE_KEY not set. Configure INFOPLIST_KEY_SUPABASE_KEY in xcconfig.")
        }
        return key
    }()

    /// Shared URLSession used by the Supabase client + every sub-client
    /// (Auth, Postgrest, Storage, Functions). The OS default `timeoutIntervalForRequest`
    /// is 60s, which leaves the splash + every other in-flight call hanging for a full
    /// minute on a stalled radio. 15s is the longest a Supabase call should plausibly
    /// take; anything longer is a connectivity problem the UI should surface.
    ///
    /// `waitsForConnectivity = true` is intentional: when the device is briefly
    /// offline (e.g., elevator, subway entrance), URLSession queues the request and
    /// fires it as soon as the radio recovers — instead of failing instantly. This
    /// is a global behavior change for every Supabase call, but the
    /// `timeoutIntervalForRequest` ceiling caps the worst case at 15s.
    private static func makeURLSession() -> URLSession {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 30
        config.waitsForConnectivity = true
        return URLSession(configuration: config)
    }

    lazy var client: SupabaseClient = {
        let options = SupabaseClientOptions(
            global: .init(session: SupabaseManager.makeURLSession())
        )
        return SupabaseClient(
            supabaseURL: supabaseURL,
            supabaseKey: supabaseKey,
            options: options
        )
    }()

    /// Base URL of the Next.js site. Used when we need to hit server-side API
    /// routes (e.g. comment posting) that enforce rate-limits and moderation
    /// checks iOS can't run locally. Resolved from INFOPLIST_KEY_VP_SITE_URL,
    /// defaults to production.
    lazy var siteURL: URL = {
        if let raw = SupabaseManager.resolve("VP_SITE_URL"), let url = URL(string: raw) {
            return url
        }
        return URL(string: "https://veritypost.com")!
    }()

    private init() {}
}
