import SwiftUI

@main
struct VerityPostApp: App {
    // Bridges UIApplicationDelegate callbacks so APNs deviceToken registration
    // works alongside the SwiftUI app lifecycle.
    @UIApplicationDelegateAdaptor(VPAppDelegate.self) private var appDelegate
    @StateObject private var auth = AuthViewModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(auth)
                .onOpenURL { url in
                    Task { await auth.handleDeepLink(url) }
                }
                // T-036 — re-sync StoreKit entitlements whenever the app
                // comes back to the foreground. Cross-device purchases
                // (Stripe on web while iOS backgrounded, or switching
                // devices mid-session) otherwise leave the local app
                // with stale `purchasedProductIDs` until a manual restore.
                .onChange(of: scenePhase) {
                    if scenePhase == .active {
                        Task { await StoreManager.shared.checkEntitlements() }
                    }
                }
        }
    }
}
