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

    lazy var client: SupabaseClient = {
        SupabaseClient(supabaseURL: supabaseURL, supabaseKey: supabaseKey)
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
