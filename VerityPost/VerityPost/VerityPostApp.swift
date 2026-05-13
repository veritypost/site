import SwiftUI

/// T118 — cross-cut router for article deep-links. `onOpenURL` parses the
/// URL into auth vs story branches; story links stamp `pendingSlug` and
/// MainTabView consumes it to push StoryDetailView onto the active tab's
/// NavigationStack. Singleton so AlertsView's notification-tap handler
/// can reuse the same channel later without a second routing model.
final class ArticleRouter: ObservableObject {
    static let shared = ArticleRouter()
    @Published var pendingSlug: String? = nil

    /// Top-level path segments that are NEVER article slugs. Must stay in
    /// lockstep with `web/public/.well-known/apple-app-site-association`
    /// exclude entries — `web/scripts/check-canonical-url-denylist.mjs`
    /// fails the Vercel build if these drift apart.
    private static let nonArticlePrefixes: Set<String> = [
        "about", "accessibility", "admin", "api", "appeal", "beta-locked",
        "billing", "bookmarks", "card", "category", "contact", "cookies",
        "corrections", "dev", "directory", "dmca", "editorial-standards",
        "expert-queue", "favicon.ico", "following", "forgot-password",
        "help", "how-it-works", "ideas", "kids", "kids-app", "leaderboard",
        "login", "logout", "messages", "methodology", "mockup-explore",
        "notifications", "preview", "pricing", "privacy", "profile", "r",
        "recap", "redesign", "request-access", "robots.txt", "search",
        "settings", "signup", "sitemap.xml", "story", "terms", "u",
        "verify-email", "welcome", "_next", ".well-known",
    ]

    /// Regex for a valid article slug: lowercase alphanumeric tokens
    /// joined by single hyphens. Rejects uppercase, underscores, dots,
    /// query/hash chars (URL.path strips those anyway), and empty strings.
    private static let slugRegex = try! NSRegularExpression(
        pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"
    )

    /// Returns the slug if the URL matches a known story shape, else nil.
    /// Recognised shapes:
    ///   - canonical: `https://veritypost.com/<slug>` (Stage 2, 2026-05-13)
    ///   - legacy:    `https://veritypost.com/story/<slug>` (kept forever
    ///                for old share links + old binaries in the wild)
    /// Canonical form rejects any top-level segment in `nonArticlePrefixes`
    /// and anything that doesn't match `slugRegex`.
    static func slug(from url: URL) -> String? {
        let host = url.host?.lowercased()
        let scheme = url.scheme?.lowercased()
        guard (scheme == "https" || scheme == "http"),
              host == "veritypost.com" || host == "www.veritypost.com"
        else { return nil }

        let path = url.path
        // Legacy: /story/<slug>
        if path.hasPrefix("/story/") {
            let s = String(path.dropFirst("/story/".count))
                .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            return s.isEmpty ? nil : s
        }
        // Canonical: /<slug> — must be a single segment that isn't on the
        // denylist and matches slug shape.
        let segments = path.split(separator: "/", omittingEmptySubsequences: true)
        guard segments.count == 1 else { return nil }
        let candidate = String(segments[0])
        if nonArticlePrefixes.contains(candidate) { return nil }
        let range = NSRange(candidate.startIndex..<candidate.endIndex, in: candidate)
        guard slugRegex.firstMatch(in: candidate, range: range) != nil else { return nil }
        return candidate
    }
}

/// Section E.1 — cross-cut notification fired when the app foregrounds
/// and the home feed is stale (>5 min since last successful load).
/// HomeView listens via .onReceive and triggers its existing loadData()
/// path. UserDefaults stamp is written from inside HomeView.loadData()
/// on success so a failed load can't fake a fresh stamp.
extension Notification.Name {
    static let vpHomeFeedRefreshIfStale = Notification.Name("vp.home.refreshIfStale")
}

enum HomeFeedRefreshPolicy {
    static let stalenessThreshold: TimeInterval = 300 // 5 min
    static let lastLoadKey = "vp_home_last_load_at"

    @MainActor static func postIfStale() {
        let last = UserDefaults.standard.object(forKey: lastLoadKey) as? Date
        let stale = last.map { Date().timeIntervalSince($0) > stalenessThreshold } ?? true
        guard stale else { return }
        NotificationCenter.default.post(name: .vpHomeFeedRefreshIfStale, object: nil)
    }
}

@main
struct VerityPostApp: App {
    // Bridges UIApplicationDelegate callbacks so APNs deviceToken registration
    // works alongside the SwiftUI app lifecycle.
    @UIApplicationDelegateAdaptor(VPAppDelegate.self) private var appDelegate
    @StateObject private var auth = AuthViewModel()
    @ObservedObject private var articleRouter = ArticleRouter.shared
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("vp_theme") private var vpTheme: String = "system"

    private var preferredScheme: ColorScheme? {
        switch vpTheme {
        case "light": return .light
        case "dark":  return .dark
        default:      return nil
        }
    }

    init() {
        // S-07 — access PermissionStore.shared before the view hierarchy
        // builds so its pre-warm Task fires as early as possible, minimising
        // the cold-launch window where permission-gated UI shows false state.
        _ = PermissionStore.shared
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(preferredScheme)
                .environmentObject(auth)
                .environmentObject(articleRouter)
                .onOpenURL { url in
                    // Story deep-links route through ArticleRouter; auth
                    // tokens (recovery, magiclink, signup, email_change,
                    // invite, reauth) route through handleDeepLink. Auth
                    // links carry their tokens in the fragment or query,
                    // not in the URL path — the slug check is the cheap
                    // way to disambiguate before handleDeepLink would
                    // otherwise reject a story URL with a banner.
                    if let slug = ArticleRouter.slug(from: url) {
                        articleRouter.pendingSlug = slug
                        return
                    }
                    Task { await auth.handleDeepLink(url) }
                }
                // T-036 — re-sync StoreKit entitlements whenever the app
                // comes back to the foreground. Cross-device purchases
                // (Stripe on web while iOS backgrounded, or switching
                // devices mid-session) otherwise leave the local app
                // with stale `purchasedProductIDs` until a manual restore.
                // Ext-J.4 — also refresh PermissionService. An admin
                // role grant or plan change made on web while the iOS
                // app was backgrounded otherwise stays stale until the
                // user enters a perm-gated view that explicitly fires
                // refreshIfStale itself.
                .onChange(of: scenePhase) {
                    if scenePhase == .active {
                        Task { await StoreManager.shared.checkEntitlements() }
                        Task { await PermissionService.shared.refreshIfStale() }
                        // T122 — refresh OS push authorization on every
                        // foreground. Without this, a user who toggled
                        // push in iOS Settings while we were backgrounded
                        // sees a stale "Off"/"On" label until a manual
                        // refresh triggers the read.
                        Task { await PushPermission.shared.refresh() }
                        // Section E.1 — refresh home feed if last
                        // successful load was >5min ago. HomeView owns
                        // the actual reload via its existing .refreshable
                        // path; this just signals via NotificationCenter.
                        Task { @MainActor in HomeFeedRefreshPolicy.postIfStale() }
                    }
                }
        }
    }
}
