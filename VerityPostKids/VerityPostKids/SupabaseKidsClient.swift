import Foundation
import Supabase

// Kids-app-local Supabase client. Same project as the adult app.
// Reads config from Info.plist keys set in project.yml.
//
// Mirrors the adult app's SupabaseManager pattern so rotation/config changes
// stay symmetric between the two apps. Kids app has no service-role access —
// all reads/writes go through the standard anon client + user session.

final class SupabaseKidsClient {
    static let shared = SupabaseKidsClient()

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
        guard let raw = SupabaseKidsClient.resolve("SUPABASE_URL") else {
            fatalError("[SupabaseKidsClient] SUPABASE_URL not set. Configure INFOPLIST_KEY_SUPABASE_URL in project.yml.")
        }
        guard let url = URL(string: raw) else {
            fatalError("[SupabaseKidsClient] SUPABASE_URL malformed: \(raw)")
        }
        return url
    }()

    private let supabaseKey: String = {
        guard let key = SupabaseKidsClient.resolve("SUPABASE_KEY") else {
            fatalError("[SupabaseKidsClient] SUPABASE_KEY not set. Configure INFOPLIST_KEY_SUPABASE_KEY in project.yml.")
        }
        return key
    }()

    lazy var client: SupabaseClient = {
        SupabaseClient(supabaseURL: supabaseURL, supabaseKey: supabaseKey)
    }()

    /// Base URL of the Next.js site. Used for API routes the kids app calls.
    lazy var siteURL: URL = {
        if let raw = SupabaseKidsClient.resolve("VP_SITE_URL"), let url = URL(string: raw) {
            return url
        }
        return URL(string: "https://veritypost.com")!
    }()

    private init() {}
}
