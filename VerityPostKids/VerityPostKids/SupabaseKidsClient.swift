import Foundation
import os
import Supabase

// Kids-app-local Supabase client. Same project as adult app.
//
// NOTE ON AUTH:
// Our kid JWT is custom-minted (sub = kid_profile_id, signed with
// SUPABASE_JWT_SECRET). We cannot use client.auth.setSession because it
// calls GoTrue's /user endpoint to resolve sub against auth.users — and
// the kid_profile_id isn't in auth.users by design (COPPA: no child
// accounts). Instead, we inject the kid JWT as a global Authorization
// header on a fresh SupabaseClient. PostgREST validates the signature +
// reads claims → RLS sees is_kid_delegated + kid_profile_id correctly.

final class SupabaseKidsClient {
    static let shared = SupabaseKidsClient()

    private static let log = Logger(subsystem: "com.veritypost.kids", category: "SupabaseKidsClient")

    let configValid: Bool

    private(set) var client: SupabaseClient

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

    private static let placeholderURL: URL = URL(string: "https://placeholder.invalid")!

    let supabaseURL: URL
    private let supabaseKey: String

    private init() {
        var ok = true

        let resolvedURL: URL
        if let rawURL = SupabaseKidsClient.resolve("SUPABASE_URL") {
            if let url = URL(string: rawURL) {
                resolvedURL = url
            } else {
                SupabaseKidsClient.log.fault(
                    "SUPABASE_URL malformed; using placeholder. Configure INFOPLIST_KEY_SUPABASE_URL in xcconfig."
                )
                resolvedURL = SupabaseKidsClient.placeholderURL
                ok = false
            }
        } else {
            SupabaseKidsClient.log.fault(
                "SUPABASE_URL not set; using placeholder. Configure INFOPLIST_KEY_SUPABASE_URL in xcconfig."
            )
            resolvedURL = SupabaseKidsClient.placeholderURL
            ok = false
        }

        let resolvedKey: String
        if let key = SupabaseKidsClient.resolve("SUPABASE_KEY") {
            resolvedKey = key
        } else {
            SupabaseKidsClient.log.fault(
                "SUPABASE_KEY not set; using empty key. Configure INFOPLIST_KEY_SUPABASE_KEY in xcconfig."
            )
            resolvedKey = ""
            ok = false
        }

        self.supabaseURL = resolvedURL
        self.supabaseKey = resolvedKey
        self.configValid = ok
        self.client = SupabaseKidsClient.makeClient(url: resolvedURL, anonKey: resolvedKey, bearer: nil)
    }

    /// Reconfigure the shared client with a bearer token (the kid JWT).
    /// Pass nil to revert to anon-only (used on sign out).
    func setBearerToken(_ token: String?) {
        self.client = SupabaseKidsClient.makeClient(
            url: supabaseURL,
            anonKey: supabaseKey,
            bearer: token
        )
    }

    private static func makeClient(url: URL, anonKey: String, bearer: String?) -> SupabaseClient {
        var headers: [String: String] = [:]
        if let bearer {
            headers["Authorization"] = "Bearer \(bearer)"
        }

        let options = SupabaseClientOptions(
            global: SupabaseClientOptions.GlobalOptions(headers: headers)
        )
        return SupabaseClient(supabaseURL: url, supabaseKey: anonKey, options: options)
    }

    // Hard-coded fallback is the prod marketing origin — used only when
    // `VP_SITE_URL` isn't set (dev/test builds mostly). `URL(string:)` on a
    // literal constant can never return nil, so the nil-coalesce branch
    // never fires, but avoiding the force-unwrap keeps the file crash-free
    // under static analysis.
    lazy var siteURL: URL = {
        if let raw = SupabaseKidsClient.resolve("VP_SITE_URL"), let url = URL(string: raw) {
            return url
        }
        return URL(string: "https://veritypost.com") ?? URL(fileURLWithPath: "/")
    }()
}
