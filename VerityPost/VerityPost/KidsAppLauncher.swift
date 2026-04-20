import SwiftUI
import UIKit

// Deep-links the adult app into VerityPostKids (bundle id com.veritypost.kids,
// URL scheme veritypostkids://). When the kids app isn't installed,
// UIApplication.open(_:) calls back with success=false and we fall back to
// the /kids-app info page on the web. Swap fallbackURL to a real App Store
// listing once the kids app is published.

enum KidsAppLauncher {
    // TODO: swap to real App Store URL once the kids app is published.
    static let fallbackURL = URL(string: "https://veritypost.com/kids-app")!

    static func open(kidId: String? = nil) {
        var comps = URLComponents(string: "veritypostkids://open")!
        if let kidId { comps.queryItems = [URLQueryItem(name: "kid", value: kidId)] }
        guard let url = comps.url else { return }
        UIApplication.shared.open(url, options: [:]) { opened in
            if !opened {
                UIApplication.shared.open(fallbackURL, options: [:], completionHandler: nil)
            }
        }
    }
}

struct KidsAppLauncherButton: View {
    let kid: KidProfile

    var body: some View {
        Button {
            KidsAppLauncher.open(kidId: kid.id)
        } label: {
            Text("Open Kids App")
                .font(.system(.caption, design: .default, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .frame(minHeight: 44)
                .background(VP.accent)
                .cornerRadius(10)
        }
        .buttonStyle(.plain)
    }
}
