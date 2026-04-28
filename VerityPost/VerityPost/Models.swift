import Foundation

// MARK: - User

struct VPUser: Codable, Identifiable {
    let id: String
    var username: String?
    var email: String?
    /// v2: plan tier comes from the joined plans table (plans.tier).
    /// AuthViewModel.loadUser populates this via `select("*, plans(tier)")`.
    var plans: PlanRef?
    var isExpert: Bool?
    var expertTitle: String?
    var isVerifiedPublicFigure: Bool?
    /// Mirrors `users.email_verified` — gates the full Profile hero on iOS
    /// the same way the web does at `web/src/app/profile/page.tsx`.
    var emailVerified: Bool?
    /// Mirrors `users.frozen_at` — when set, the Verity Score has stopped
    /// tracking (cancelled paid plan, grace expired). Profile shows a red
    /// banner with a Resubscribe CTA, mirroring the web inline notice.
    var frozenAt: Date?
    var verityScore: Int?
    var articlesReadCount: Int?
    var quizzesCompletedCount: Int?
    var streakCurrent: Int?
    var streakBest: Int?
    var commentCount: Int?
    var followersCount: Int?
    var followingCount: Int?
    /// Mirrors `users.show_activity`. When the target has flipped this off,
    /// the canonical 5-stat row (Articles read / Quizzes passed / Comments /
    /// Followers / Following) is hidden on every public surface. Defaults
    /// to `true` per the DB column default.
    var showActivity: Bool?
    /// Mirrors `users.profile_visibility`. Three states: 'public' (default),
    /// 'private' (opt-in hide from non-self viewers), 'hidden' (lockdown
    /// tier added by the redesign — same gating as 'private' for read paths).
    /// PublicProfileView gates render on this; the redesign cutover (T357 +
    /// T363) will gate the public profile rebuild the same way.
    var profileVisibility: String?
    var displayName: String?
    var bio: String?
    var avatarColor: String?
    /// Avatar customisation lives inside `users.metadata.avatar` (the web
    /// settings page writes there via `update_own_profile`). Swift decodes
    /// the nested shape via `MetadataRef` and exposes it as a computed
    /// property so call-sites still read `user.avatar` unchanged.
    var metadata: MetadataRef?
    var avatar: AvatarRef? { metadata?.avatar }
    var createdAt: Date?
    var onboardingCompletedAt: Date?

    var streak: Int? { streakCurrent }

    struct AvatarRef: Codable {
        var outer: String?
        var inner: String?
        var initials: String?
        var textColor: String?

        enum CodingKeys: String, CodingKey {
            case outer, inner, initials
            case textColor = "text_color"
        }
    }

    struct MetadataRef: Codable {
        var avatar: AvatarRef?
    }

    struct PlanRef: Codable {
        var tier: String?
    }

    enum CodingKeys: String, CodingKey {
        case id, username, email, plans, bio, metadata
        case isExpert = "is_expert"
        case expertTitle = "expert_title"
        case isVerifiedPublicFigure = "is_verified_public_figure"
        case emailVerified = "email_verified"
        case frozenAt = "frozen_at"
        case verityScore = "verity_score"
        case articlesReadCount = "articles_read_count"
        case quizzesCompletedCount = "quizzes_completed_count"
        case streakCurrent = "streak_current"
        case streakBest = "streak_best"
        case commentCount = "comment_count"
        case followersCount = "followers_count"
        case followingCount = "following_count"
        case showActivity = "show_activity"
        case profileVisibility = "profile_visibility"
        case displayName = "display_name"
        case avatarColor = "avatar_color"
        case createdAt = "created_at"
        case onboardingCompletedAt = "onboarding_completed_at"
    }

    /// Backwards-compat accessor — every callsite reads `user.plan`.
    /// Returns the tier string ("free", "verity", "verity_pro",
    /// "verity_family") from the embedded plans row.
    var plan: String? { plans?.tier }

    var needsOnboarding: Bool { onboardingCompletedAt == nil }

    var initial: String {
        let s = username ?? email ?? "?"
        return String(s.prefix(1)).uppercased()
    }

    private static let memberSinceFmt: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMMM yyyy"
        return f
    }()

    var memberSince: String {
        guard let date = createdAt else { return "" }
        return VPUser.memberSinceFmt.string(from: date)
    }

    var planDisplay: String {
        guard let p = plan, !p.isEmpty else { return "Free" }
        switch p {
        case "verity": return "Verity"
        case "verity_pro": return "Verity Pro"
        case "verity_family": return "Verity Family"
        case "free": return "Free"
        default: return p.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}

// MARK: - Story

struct Story: Codable, Identifiable, Hashable {
    let id: String
    var title: String?
    var slug: String?
    var summary: String?
    var content: String?
    var imageUrl: String?
    var categoryId: String?
    var subcategoryId: String?
    var status: String?
    var isBreaking: Bool?
    var isDeveloping: Bool?
    var publishedAt: Date?
    var createdAt: Date?
    /// Editorial flag from schema/144 — when this date matches today in
    /// editorial TZ (America/New_York), the article surfaces as the hero
    /// on the home page. Comes back from PostgREST as an ISO date string
    /// ("YYYY-MM-DD"); kept as String to avoid Date-formatter ambiguity.
    var heroPickForDate: String?

    enum CodingKeys: String, CodingKey {
        case id, title, slug, status
        case summary = "excerpt"
        case content = "body"
        case imageUrl = "cover_image_url"
        case categoryId = "category_id"
        case isBreaking = "is_breaking"
        case isDeveloping = "is_developing"
        case publishedAt = "published_at"
        case createdAt = "created_at"
        case heroPickForDate = "hero_pick_for_date"
    }

    /// Convenience alias for the home/reader views — same column as
    /// `summary` (PostgREST column is `excerpt`); keeping the alias
    /// because the home page reads as "excerpt" to match the web API.
    var excerpt: String? { summary }

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (lhs: Story, rhs: Story) -> Bool { lhs.id == rhs.id }
}

// MARK: - Category / Subcategory

struct VPCategory: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var slug: String?
    var type: String?
    var visible: Bool?
    var displayOrder: Int?
    /// v2 categories table is self-referential. Top-level categories have
    /// nil parent_id. Anything with a parent_id is actually a subcategory.
    var categoryId: String?
    var isKidsSafe: Bool?
    var colorHex: String?

    enum CodingKeys: String, CodingKey {
        case id, name, slug, type, visible
        case displayOrder = "sort_order"
        case categoryId = "parent_id"
        case isKidsSafe = "is_kids_safe"
        case colorHex = "color_hex"
    }

    /// Display name with any "Kids" / "(kids)" marker stripped. Categories
    /// are seeded with names like "Science (kids)", "World (kid)", or
    /// "Kids Science" depending on the source — strip every variant so the
    /// label inside kid mode is just "Science", "World", etc.
    var displayName: String {
        var s = name
        // Trailing "(kids)" / "(kid)" — case-insensitive, allowing extra spaces.
        if let range = s.range(of: #"\s*\((?i:kids?)\)\s*$"#, options: .regularExpression) {
            s.removeSubrange(range)
        }
        // Trailing " kids" / " kid" with no parens.
        if let range = s.range(of: #"\s+(?i:kids?)\s*$"#, options: .regularExpression) {
            s.removeSubrange(range)
        }
        // Leading "Kids " / "Kid ".
        if let range = s.range(of: #"^(?i:kids?)\s+"#, options: .regularExpression) {
            s.removeSubrange(range)
        }
        return s.trimmingCharacters(in: .whitespaces)
    }
}

struct VPSubcategory: Codable, Identifiable {
    let id: String
    var categoryId: String?
    var name: String
    var slug: String?

    enum CodingKeys: String, CodingKey {
        case id, name, slug
        case categoryId = "category_id"
    }
}

// MARK: - Quiz Attempt

struct QuizAttempt: Codable, Identifiable {
    let id: String
    var userId: String?
    var articleId: String?
    var quizId: String?
    var attemptNumber: Int?
    var isCorrect: Bool?
    var pointsEarned: Int?
    var timeTakenSeconds: Int?
    var createdAt: Date?
    var articles: StoryRef?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case articleId = "article_id"
        case quizId = "quiz_id"
        case attemptNumber = "attempt_number"
        case isCorrect = "is_correct"
        case pointsEarned = "points_earned"
        case timeTakenSeconds = "time_taken_seconds"
        case createdAt = "created_at"
        case articles
    }

    struct StoryRef: Codable {
        var title: String?
        var slug: String?
        var categoryId: String?
        var subcategoryId: String?

        enum CodingKeys: String, CodingKey {
            case title, slug
            case categoryId = "category_id"
            case subcategoryId = "subcategory_id"
        }
    }
}

// MARK: - Reading Log

struct ReadingLogItem: Codable, Identifiable {
    let id: String
    var userId: String?
    var articleId: String?
    var readAt: Date?
    var completed: Bool?
    var articles: QuizAttempt.StoryRef?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case articleId = "article_id"
        case readAt = "created_at"
        case completed
        case articles
    }
}

// MARK: - Comment

struct VPComment: Codable, Identifiable {
    let id: String
    var userId: String?
    var articleId: String?
    var parentId: String?
    var body: String?
    var isPinned: Bool?
    var isContextPinned: Bool?
    var isExpertReply: Bool?
    var upvoteCount: Int?
    var downvoteCount: Int?
    var createdAt: Date?
    /// A126 — soft-delete + edit + mention fields. The web client's
    /// /api/comments/[id] PATCH route sets `is_edited=true` on edits and
    /// the moderation pipeline writes `deleted_at` + `status` (visible /
    /// hidden / removed) for soft-removal. iOS now decodes the same
    /// shape so the [deleted] tombstone, the (edited) label, and the
    /// pinned-context-tag count render at parity with web.
    var deletedAt: Date?
    var status: String?
    var isEdited: Bool?
    /// Cached count of @-mentions in this comment's body. Server-side
    /// trigger maintains it; iOS only reads.
    var contextTagCount: Int?
    /// `mentions` ships from the server as `[{ username, user_id }, ...]`
    /// jsonb — decoded here so the comment renderer can hyperlink the
    /// @-mention runs to a profile route.
    var mentions: [Mention]?
    var articles: QuizAttempt.StoryRef?
    var users: AuthorRef?

    /// True when the row has been soft-deleted server-side. Renderer
    /// should swap the body text for a "[deleted]" tombstone and hide
    /// the vote/reply affordances.
    var isDeleted: Bool {
        deletedAt != nil || status == "removed" || status == "hidden_by_user"
    }

    struct Mention: Codable, Hashable {
        var username: String?
        var userId: String?

        enum CodingKeys: String, CodingKey {
            case username
            case userId = "user_id"
        }
    }

    struct AuthorRef: Codable {
        var id: String?
        var username: String?
        var isExpert: Bool?
        var isVerifiedPublicFigure: Bool?
        var avatarColor: String?
        var avatarUrl: String?
        var avatar: VPUser.AvatarRef?

        enum CodingKeys: String, CodingKey {
            case id, username, avatar
            case isExpert = "is_expert"
            case isVerifiedPublicFigure = "is_verified_public_figure"
            case avatarColor = "avatar_color"
            case avatarUrl = "avatar_url"
        }
    }

    enum CodingKeys: String, CodingKey {
        case id, body, articles, users, status, mentions
        case userId = "user_id"
        case articleId = "article_id"
        case parentId = "parent_id"
        case isPinned = "is_pinned"
        case isContextPinned = "is_context_pinned"
        case isExpertReply = "is_expert_reply"
        case upvoteCount = "upvote_count"
        case downvoteCount = "downvote_count"
        case createdAt = "created_at"
        case deletedAt = "deleted_at"
        case isEdited = "is_edited"
        case contextTagCount = "context_tag_count"
    }
}

// MARK: - Kid Profile

struct KidProfile: Codable, Identifiable {
    let id: String
    var parentUserId: String?
    var displayName: String?
    var avatarColor: String?
    var avatarUrl: String?
    var avatarPreset: String?
    var dateOfBirth: String?
    var createdAt: Date?
    var pausedAt: Date?
    var isActive: Bool?
    var readingBand: String?

    enum CodingKeys: String, CodingKey {
        case id
        case parentUserId = "parent_user_id"
        case displayName = "display_name"
        case avatarColor = "avatar_color"
        case avatarUrl = "avatar_url"
        case avatarPreset = "avatar_preset"
        case dateOfBirth = "date_of_birth"
        case createdAt = "created_at"
        case pausedAt = "paused_at"
        case isActive = "is_active"
        case readingBand = "reading_band"
    }

    var name: String? { displayName }

    private static let dobFmt: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    var age: Int? {
        guard let dob = dateOfBirth else { return nil }
        guard let d = KidProfile.dobFmt.date(from: dob) else { return nil }
        let years = Calendar.current.dateComponents([.year], from: d, to: Date()).year
        return years
    }

    var safeName: String {
        displayName ?? "Child"
    }

    var ageLabel: String {
        guard let a = age else { return "Unknown" }
        if a < 13 { return "Under 13" }
        if a <= 15 { return "13\u{2013}15" }
        return "16+"
    }
}

// MARK: - Source Link

struct SourceLink: Codable, Identifiable {
    let id: String
    var publisher: String?
    var url: String?
    var title: String?
    var articleId: String?

    var outletName: String? { publisher }
    var headline: String? { title }

    enum CodingKeys: String, CodingKey {
        case id, url, title, publisher
        case articleId = "article_id"
    }
}

// MARK: - Timeline Event

struct TimelineEvent: Codable, Identifiable {
    let id: String
    var articleId: String?
    var eventDate: Date?
    var eventLabel: String?
    var eventBody: String?
    var eventImageUrl: String?
    var sortOrder: Int?

    var text: String? { eventLabel }
    var summary: String? { eventBody }
    var isCurrent: Bool? { nil }

    enum CodingKeys: String, CodingKey {
        case id
        case articleId = "article_id"
        case eventDate = "event_date"
        case eventLabel = "event_label"
        case eventBody = "event_body"
        case eventImageUrl = "event_image_url"
        case sortOrder = "sort_order"
    }
}

// MARK: - Quiz

struct Quiz: Codable, Identifiable {
    let id: String
    var articleId: String?
    var audience: String?
    var questions: [QuizQuestion]?

    enum CodingKeys: String, CodingKey {
        case id, audience, questions
        case articleId = "article_id"
    }
}

struct QuizQuestion: Codable {
    var question: String?
    var options: [String]?
    var correct: Int?
}

// MARK: - Achievement

struct Achievement: Codable, Identifiable {
    let id: String
    var name: String?
    var category: String?
    var description: String?

    enum CodingKeys: String, CodingKey {
        case id, name, category, description
    }
}

struct UserAchievement: Codable, Identifiable {
    let id: String
    var userId: String?
    var achievementId: String?
    var earnedAt: Date?
    var achievements: Achievement?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case achievementId = "achievement_id"
        case earnedAt = "earned_at"
        case achievements
    }
}

// MARK: - Activity Item (local model, not from DB)

struct ActivityItem: Identifiable {
    let id: String
    let type: ActivityType
    let label: String
    let slug: String?
    let detail: String
    let time: Date

    enum ActivityType: String {
        case read = "Read"
        case quiz = "Quiz"
        case comment = "Comment"
        case bookmark = "Bookmark"
    }
}

// MARK: - Quiz Display (local model)

struct QuizDisplay: Identifiable {
    let id: String
    let title: String
    let slug: String?
    let score: Int
    let total: Int
    let passed: Bool
    let date: String
    let time: String
}

// MARK: - Category Stats (local model)

struct CategoryStats {
    var reads: Int = 0
    var quizzes: Int = 0
    var comments: Int = 0
    var total: Int { reads + quizzes + comments }
}
