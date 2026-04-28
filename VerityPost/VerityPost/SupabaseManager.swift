import Foundation
import os
import Supabase

/// Supabase configuration is sourced exclusively from the app bundle's Info.plist
/// (populated via xcconfig / Build Settings keys INFOPLIST_KEY_SUPABASE_URL and
/// INFOPLIST_KEY_SUPABASE_KEY). Credentials are intentionally NOT hardcoded in
/// source so they can be rotated without a code change and never leak via the
/// compiled binary's string tables.
///
/// In DEBUG builds only, missing values fall back to the SUPABASE_URL /
/// SUPABASE_KEY process environment variables for local dev convenience.
///
/// Missing / malformed config never traps the process — the splash gates on
/// `configValid` and renders a build-error screen with a support email. This
/// gives Apple a deterministic failure surface during review instead of a
/// silent crash if a TestFlight build ships without xcconfig values wired.
final class SupabaseManager {
    static let shared = SupabaseManager()

    private static let log = Logger(subsystem: "com.veritypost.adult", category: "SupabaseManager")

    /// True when both SUPABASE_URL and SUPABASE_KEY resolved cleanly. The
    /// app's RootView (`ContentView`) reads this before any network call;
    /// false routes to a "Build configuration error — contact
    /// support@veritypost.com" screen instead of crashing.
    let configValid: Bool

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

    /// Hardcoded placeholder URL used when SUPABASE_URL is unset or malformed.
    /// Pointing at the production marketing host means any accidental network
    /// call during a misconfigured build returns a 404 (cheap to spot in
    /// logs) rather than landing on a real auth/data endpoint.
    private static let placeholderURL: URL = {
        var comps = URLComponents()
        comps.scheme = "https"
        comps.host = "veritypost.com"
        return comps.url ?? URL(fileURLWithPath: "/")
    }()

    private let supabaseURL: URL
    private let supabaseKey: String

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
    /// defaults to production. Constructed via `URLComponents` with explicit
    /// scheme + host so we can't trip on a malformed string literal — every
    /// piece is statically validated, no force-unwrap.
    lazy var siteURL: URL = {
        if let raw = SupabaseManager.resolve("VP_SITE_URL"), let url = URL(string: raw) {
            return url
        }
        var comps = URLComponents()
        comps.scheme = "https"
        comps.host = "veritypost.com"
        // `URLComponents.url` returns nil only if scheme+host+path violate
        // RFC-3986; the values above are RFC-clean by construction.
        return comps.url ?? URL(fileURLWithPath: "/")
    }()

    private init() {
        var ok = true

        let resolvedURL: URL
        if let raw = SupabaseManager.resolve("SUPABASE_URL") {
            if let url = URL(string: raw) {
                resolvedURL = url
            } else {
                SupabaseManager.log.fault(
                    "SUPABASE_URL malformed; using placeholder. Configure INFOPLIST_KEY_SUPABASE_URL in xcconfig."
                )
                resolvedURL = SupabaseManager.placeholderURL
                ok = false
            }
        } else {
            SupabaseManager.log.fault(
                "SUPABASE_URL not set; using placeholder. Configure INFOPLIST_KEY_SUPABASE_URL in xcconfig."
            )
            resolvedURL = SupabaseManager.placeholderURL
            ok = false
        }

        let resolvedKey: String
        if let key = SupabaseManager.resolve("SUPABASE_KEY") {
            resolvedKey = key
        } else {
            SupabaseManager.log.fault(
                "SUPABASE_KEY not set; using empty key. Configure INFOPLIST_KEY_SUPABASE_KEY in xcconfig."
            )
            resolvedKey = ""
            ok = false
        }

        self.supabaseURL = resolvedURL
        self.supabaseKey = resolvedKey
        self.configValid = ok
    }
}
