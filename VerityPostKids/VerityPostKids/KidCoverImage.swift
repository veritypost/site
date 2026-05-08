import SwiftUI
import UIKit

// BugList #9 — Capped cover-image loader for the kids reader.
//
// SwiftUI's AsyncImage has no byte cap and uses URLCache.shared
// passively, so a single oversized cover URL (admin compromise, CDN
// bug, malformed source) could pull a multi-GB blob onto a kid's
// device before the OS killed the app. The kid header renders at
// height: 140 — anything over ~2 MB is pure waste.
//
// allowedImageHosts (in KidReaderView.swift) constrains the *origin*
// set; this view caps the payload size. Both layers needed for
// belt-and-suspenders kid-safety.

private let MAX_COVER_BYTES = 2 * 1024 * 1024  // 2 MB
private let COVER_TIMEOUT: TimeInterval = 15

struct KidCoverImage<Fallback: View>: View {
    let url: URL
    let fallback: Fallback
    @State private var image: UIImage? = nil
    @State private var loadFailed: Bool = false

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else if loadFailed {
                fallback
            } else {
                fallback
                    .task(id: url) { await load() }
            }
        }
    }

    private func load() async {
        // 1) Cache hit.
        let req = URLRequest(url: url, timeoutInterval: COVER_TIMEOUT)
        if let cached = URLCache.shared.cachedResponse(for: req) {
            if cached.data.count <= MAX_COVER_BYTES,
               let img = UIImage(data: cached.data) {
                await MainActor.run { self.image = img }
                return
            }
        }

        // 2) Network — abort on Content-Length over cap, defensively
        // accumulate-then-check to catch servers that omit the header
        // or lie about the size.
        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse,
                  (200..<300).contains(http.statusCode) else {
                await MainActor.run { self.loadFailed = true }
                return
            }
            if let lenStr = http.value(forHTTPHeaderField: "Content-Length"),
               let len = Int(lenStr),
               len > MAX_COVER_BYTES {
                await MainActor.run { self.loadFailed = true }
                return
            }
            if data.count > MAX_COVER_BYTES {
                await MainActor.run { self.loadFailed = true }
                return
            }
            guard let img = UIImage(data: data) else {
                await MainActor.run { self.loadFailed = true }
                return
            }
            // Cache the response so subsequent renders re-hit (1) above.
            URLCache.shared.storeCachedResponse(
                CachedURLResponse(response: response, data: data),
                for: req
            )
            await MainActor.run { self.image = img }
        } catch {
            await MainActor.run { self.loadFailed = true }
        }
    }
}
