import SwiftUI

@main
struct VerityPostApp: App {
    // Bridges UIApplicationDelegate callbacks so APNs deviceToken registration
    // works alongside the SwiftUI app lifecycle.
    @UIApplicationDelegateAdaptor(VPAppDelegate.self) private var appDelegate
    @StateObject private var auth = AuthViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(auth)
                .onOpenURL { url in
                    Task { await auth.handleDeepLink(url) }
                }
        }
    }
}
