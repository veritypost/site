import Foundation

/// Sort selector for the Browse panes (subcategory + article list).
/// Mirrors the web `/directory` `?sort=` query param. `trending` is gated
/// on the `directory.sort_trending` permission key; the API silently
/// degrades to `latest` when the caller lacks the perm, so the enum is
/// safe to send even when locked client-side.
enum BrowseSort: String, Codable, Equatable, Hashable, CaseIterable {
    case recent
    case trending

    /// Value sent to `GET /api/directory/articles?sort=...`.
    var queryValue: String {
        switch self {
        case .recent:   return "latest"
        case .trending: return "trending"
        }
    }

    /// Pill label shown in the UI.
    var label: String {
        switch self {
        case .recent:   return "Latest"
        case .trending: return "Trending"
        }
    }
}
