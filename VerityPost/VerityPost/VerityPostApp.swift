import SwiftUI

/// T118 — cross-cut router for article deep-links. `onOpenURL` parses the
/// URL into auth vs story branches; story links stamp `pendingSlug` and
/// MainTabView consumes it to push StoryDetailView onto the active tab's
/// NavigationStack. Singleton so AlertsView's notification-tap handler
/// can reuse the same channel later without a second routing model.
final class ArticleRouter: ObservableObject {
    static let shared = ArticleRouter()
    @Published var pendingSlug: String? = nil

    /// Returns the slug if the URL matches a known story shape, else nil.
    /// Recognised shapes: `https://veritypost.com/story/<slug>` (production
    /// canonical, mirrors `StoryDetailView` share URL + AlertsView's
    /// `slugFromActionUrl`) and `verityposts://story/<slug>` (custom scheme,
    /// reserved for push payloads).
    static func slug(from url: URL) -> String? {
        let host = url.host?.lowercased()
        let path = url.path
        let scheme = url.scheme?.lowercased()
        // Custom scheme: verityposts://story/<slug> — host carries "story"
        // and the slug is the first path component.
        if scheme == "verityposts", host == "story" {
            let slug = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            return slug.isEmpty ? nil : slug
        }
        // Universal link: https://veritypost.com/story/<slug>
        if (scheme == "https" || scheme == "http"),
           host == "veritypost.com" || host == "www.veritypost.com",
           path.hasPrefix("/story/") {
            let slug = String(path.dropFirst("/story/".count))
                .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            return slug.isEmpty ? nil : slug
        }
        return nil
    }
}

@main
struct VerityPostApp: App {
    // Bridges UIApplicationDelegate callbacks so APNs deviceToken registration
    // works alongside the SwiftUI app lifecycle.
    @UIApplicationDelegateAdaptor(VPAppDelegate.self) private var appDelegate
    @StateObject private var auth = AuthViewModel()
    @StateObject private var articleRouter = ArticleRouter.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
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
                    }
                }
        }
    }
}
