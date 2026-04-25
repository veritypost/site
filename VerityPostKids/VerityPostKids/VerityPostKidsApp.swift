import SwiftUI

@main
struct VerityPostKidsApp: App {
    var body: some Scene {
        WindowGroup {
            KidsAppRoot()
                // Ext-BBB3 — Universal Links + custom-URL handler. Apple Kids
                // Category review checks that links into the app are at
                // least caught (no-op is fine if the destination isn't kid-
                // safe). Today this is a stub that logs and ignores; expand
                // when deep-link routes into kid surfaces are wired.
                .onOpenURL { url in
                    handleIncomingURL(url)
                }
        }
    }

    private func handleIncomingURL(_ url: URL) {
        // Universal Link path or custom scheme. Kid surfaces accept very
        // little deep-linking by design (parent-driven flow), so the
        // current handler logs + drops. If a real route lands later
        // (e.g. /kid/article/{slug}), branch here.
        #if DEBUG
        print("[VerityPostKidsApp] onOpenURL host=\(url.host ?? "<none>") path=\(url.path)")
        #endif
    }
}
