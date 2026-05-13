import Foundation
import SwiftUI

/// Deep-link target for the Browse tab. Stream A's web routes use the same
/// triple ("catSlug" / optional "subSlug" / optional "storySlug"); iOS
/// router holds the latest pending target until the Browse view tree is
/// mounted and can consume it.
enum BrowseTarget: Equatable, Hashable {
    case category(slug: String)
    case subcategory(parentSlug: String, slug: String)
    case article(catSlug: String, subSlug: String?, storySlug: String)
}

/// Browse-tab router. Singleton mirrors the existing `ArticleRouter`
/// pattern in `VerityPostApp` so deep links fired from outside the tab
/// (universal links, push notifications, deeplink-to-section from web)
/// have a stable landing pad. `@Observable` so SwiftUI views can `.task(id:)`
/// on `pendingDeepLink` without taking an environment object dependency.
@MainActor
final class BrowseRouter: ObservableObject {
    static let shared = BrowseRouter()

    @Published var selectedCategoryId: String?
    @Published var selectedSubcategoryId: String?
    @Published var pendingDeepLink: BrowseTarget?

    private init() {}

    /// Push a target onto the pending slot. The Browse view's `.task`
    /// observer reads + clears it.
    func navigate(to target: BrowseTarget) {
        pendingDeepLink = target
    }

    /// Read + clear the pending target. Idempotent — safe to call from
    /// `.task` re-runs.
    func consumePending() -> BrowseTarget? {
        let t = pendingDeepLink
        pendingDeepLink = nil
        return t
    }
}
