import Foundation

// MARK: - Editor's Edge pick
//
// Shape returned by `GET /api/directory/editors-edge?category=<slug>&sub=<slug>`.
// The web API decorates the article row with two underscored fields
// (`_edge_label`, `_valid_to`) so iOS can render the label + countdown
// without doing its own join. 404 from the server means "no valid pick"
// — view code should treat that as `nil`, not an error.

struct EditorsEdgePick: Decodable, Identifiable {
    let id: String
    let storySlug: String?
    let title: String?
    let excerpt: String?
    let publishedAt: Date?
    let sourceName: String?
    let readingTimeMinutes: Int?
    let expertCount: Int?
    let isExpertVerified: Bool?
    let edgeLabel: String?
    let validTo: Date?

    enum CodingKeys: String, CodingKey {
        case id, title, excerpt
        case storySlug = "story_slug"
        case publishedAt = "published_at"
        case sourceName = "source_name"
        case readingTimeMinutes = "reading_time_minutes"
        case expertCount = "expert_count"
        // Server emits `is_verified` (not `is_expert_verified`) — see
        // runDirectoryArticles.ts + editors-edge/route.ts. BUILD.md spec
        // line 175 mis-named the field; server + this DTO follow code.
        case isExpertVerified = "is_verified"
        case edgeLabel = "_edge_label"
        case validTo = "_valid_to"
    }
}

struct EditorsEdgeResponse: Decodable {
    let pick: EditorsEdgePick?
}

// MARK: - Expert coverage
//
// `GET /api/directory/expert-coverage?story_id=<uuid>`. Gated server-side
// on `directory.expert_depth`; 403 when locked. Used by the row meta-line
// tap → sheet ("X experts" → expert list + Follow all).

struct ExpertCoverageExpert: Decodable, Identifiable {
    let userId: String
    let displayName: String?
    let avatarUrl: String?
    let expertTitle: String?
    let followCount: Int?

    var id: String { userId }

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case displayName = "display_name"
        case avatarUrl = "avatar_url"
        case expertTitle = "expert_title"
        case followCount = "follow_count"
    }
}

struct ExpertCoverageResponse: Decodable {
    let experts: [ExpertCoverageExpert]
    let total: Int
}

// MARK: - Article row decoration
//
// `Story` (Models.swift) covers the canonical PostgREST shape but doesn't
// carry the directory-row decorations (reading time, expert count, verified
// flag, source name). When the Browse pane fetches via the web API it
// hydrates these alongside the article. PostgREST direct returns the bare
// Story shape — directory-only decorations stay nil and the row renders
// the meta line without them.

struct BrowseArticleDecor: Decodable {
    let articleId: String
    let sourceName: String?
    let readingTimeMinutes: Int?
    let expertCount: Int?
    let isExpertVerified: Bool?

    enum CodingKeys: String, CodingKey {
        case articleId = "id"
        case sourceName = "source_name"
        case readingTimeMinutes = "reading_time_minutes"
        case expertCount = "expert_count"
        // Server emits `is_verified`, not `is_expert_verified` (see
        // runDirectoryArticles.ts). Spec line 175 was wrong; code wins.
        case isExpertVerified = "is_verified"
    }
}
