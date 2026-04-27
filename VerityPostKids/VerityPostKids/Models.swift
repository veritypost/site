import Foundation

// Kids-app-local Codable models. Verified against live Supabase schema
// 2026-04-19 via information_schema.columns on project fyiwulqphgmoqullmrfn.
// Every column here exists on the corresponding table with matching type.

// MARK: - Kid Profile
// Table: public.kid_profiles
//
// Phase 3 of AI + Plan Change Implementation: `reading_band` is the
// system-derived band ("kids" / "tweens" / "graduated"). The vestigial
// `age_range` column was dropped in the Phase 3 migration.
struct KidProfile: Codable, Identifiable, Equatable {
    let id: String
    var parentUserId: String?
    var displayName: String?
    var avatarColor: String?
    var avatarUrl: String?
    var avatarPreset: String?
    var dateOfBirth: String?
    var readingLevel: String?
    var readingBand: String?

    var verityScore: Int?
    var articlesReadCount: Int?
    var quizzesCompletedCount: Int?
    var streakCurrent: Int?
    var streakBest: Int?
    var streakLastActiveDate: String?
    var streakFreezeRemaining: Int?

    var maxDailyMinutes: Int?
    var pausedAt: Date?
    var isActive: Bool?
    var globalLeaderboardOptIn: Bool?

    var createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case parentUserId = "parent_user_id"
        case displayName = "display_name"
        case avatarColor = "avatar_color"
        case avatarUrl = "avatar_url"
        case avatarPreset = "avatar_preset"
        case dateOfBirth = "date_of_birth"
        case readingLevel = "reading_level"
        case readingBand = "reading_band"
        case verityScore = "verity_score"
        case articlesReadCount = "articles_read_count"
        case quizzesCompletedCount = "quizzes_completed_count"
        case streakCurrent = "streak_current"
        case streakBest = "streak_best"
        case streakLastActiveDate = "streak_last_active_date"
        case streakFreezeRemaining = "streak_freeze_remaining"
        case maxDailyMinutes = "max_daily_minutes"
        case pausedAt = "paused_at"
        case isActive = "is_active"
        case globalLeaderboardOptIn = "global_leaderboard_opt_in"
        case createdAt = "created_at"
    }

    var safeName: String { displayName ?? "Child" }
    var streak: Int { streakCurrent ?? 0 }
    var score: Int { verityScore ?? 0 }

    /// Bands this profile is permitted to see in the article feed.
    /// kids → ["kids"]; tweens → ["kids", "tweens"]; graduated → []
    /// (graduated profiles shouldn't be in the kid app at all; the
    /// graduation flow signs them out, but defensive empty array.)
    var visibleBands: [String] {
        switch readingBand {
        case "kids": return ["kids"]
        case "tweens": return ["kids", "tweens"]
        default: return []
        }
    }
}

// MARK: - Category
// Table: public.categories
struct VPCategory: Codable, Identifiable, Equatable, Hashable {
    let id: String
    let name: String
    let slug: String?
    let colorHex: String?
    let iconName: String?
    let isKidsSafe: Bool?
    let sortOrder: Int?

    enum CodingKeys: String, CodingKey {
        case id, name, slug
        case colorHex = "color_hex"
        case iconName = "icon_name"
        case isKidsSafe = "is_kids_safe"
        case sortOrder = "sort_order"
    }
}

// MARK: - Article (kid-safe)
// Table: public.articles
//
// Phase 3 of AI + Plan Change Implementation: `age_band` tags articles
// into kids|tweens|adult. The kid app filters by the profile's visibleBands
// (kids profiles see only age_band='kids'; tweens see kids+tweens). Server-
// side RLS enforces the same rule via kid_visible_bands(profile_id).
struct KidArticle: Codable, Identifiable, Equatable {
    let id: String
    let title: String?
    let slug: String?
    let excerpt: String?
    let kidsSummary: String?
    let coverImageUrl: String?
    let categoryId: String?
    let readingTimeMinutes: Int?
    let difficultyLevel: String?
    let ageBand: String?
    let publishedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, title, slug, excerpt
        case kidsSummary = "kids_summary"
        case coverImageUrl = "cover_image_url"
        case categoryId = "category_id"
        case readingTimeMinutes = "reading_time_minutes"
        case difficultyLevel = "difficulty_level"
        case ageBand = "age_band"
        case publishedAt = "published_at"
    }
}

// MARK: - Reading log insert
// Table: public.reading_log
struct ReadingLogInsert: Encodable {
    let user_id: String?
    let kid_profile_id: String
    let article_id: String
    let read_percentage: Double
    let time_spent_seconds: Int
    let completed: Bool
    let source: String?
    let device_type: String?
}

// MARK: - Quiz + Quiz attempts
// Table: public.quizzes (one question per row; grouped by article_id + pool_group)
// Options are stored as jsonb: [{"text": "...", "is_correct": true/false}, ...]
struct QuizOption: Codable, Equatable, Identifiable {
    let text: String
    let isCorrect: Bool

    var id: String { text }   // stable within a question

    enum CodingKeys: String, CodingKey {
        case text
        case isCorrect = "is_correct"
    }
}

struct QuizQuestion: Codable, Identifiable, Equatable {
    let id: String
    let articleId: String
    let questionText: String
    let questionType: String?
    let options: [QuizOption]
    let explanation: String?
    let difficulty: String?
    let points: Int?
    let poolGroup: Int?
    let sortOrder: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case articleId = "article_id"
        case questionText = "question_text"
        case questionType = "question_type"
        case options
        case explanation
        case difficulty
        case points
        case poolGroup = "pool_group"
        case sortOrder = "sort_order"
    }

    var correctOption: QuizOption? {
        options.first { $0.isCorrect }
    }
}

// Table: public.quiz_attempts
struct QuizAttemptInsert: Encodable {
    let quiz_id: String
    let user_id: String?
    let kid_profile_id: String
    let article_id: String
    let attempt_number: Int
    let questions_served: [String]
    let selected_answer: String
    let is_correct: Bool
    let points_earned: Int?
    let time_taken_seconds: Int?
}

// MARK: - Achievements
// Table: public.achievements
struct Achievement: Codable, Identifiable, Equatable {
    let id: String
    let key: String?
    let name: String?
    let description: String?
    let iconName: String?
    let category: String?
    let rarity: String?
    let pointsReward: Int?
    let isKidsEligible: Bool?

    enum CodingKeys: String, CodingKey {
        case id, key, name, description
        case iconName = "icon_name"
        case category, rarity
        case pointsReward = "points_reward"
        case isKidsEligible = "is_kids_eligible"
    }
}

// Table: public.user_achievements
struct UserAchievement: Codable, Identifiable, Equatable {
    let id: String
    let kidProfileId: String?
    let achievementId: String
    let earnedAt: Date?
    let achievements: Achievement?   // Supabase join

    enum CodingKeys: String, CodingKey {
        case id
        case kidProfileId = "kid_profile_id"
        case achievementId = "achievement_id"
        case earnedAt = "earned_at"
        case achievements
    }
}

// MARK: - Category scores
// Table: public.category_scores
struct CategoryScore: Codable, Identifiable, Equatable {
    let id: String
    let kidProfileId: String?
    let categoryId: String
    let score: Int?
    let articlesRead: Int?
    let quizzesCorrect: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case kidProfileId = "kid_profile_id"
        case categoryId = "category_id"
        case score
        case articlesRead = "articles_read"
        case quizzesCorrect = "quizzes_correct"
    }
}

// MARK: - Expert sessions
// Table: public.kid_expert_sessions
struct KidExpertSession: Codable, Identifiable, Equatable {
    let id: String
    let title: String?
    let description: String?
    let sessionType: String?
    let scheduledAt: Date?
    let durationMinutes: Int?
    let status: String?          // 'scheduled' | 'live' | 'completed'
    let categoryId: String?

    enum CodingKeys: String, CodingKey {
        case id, title, description
        case sessionType = "session_type"
        case scheduledAt = "scheduled_at"
        case durationMinutes = "duration_minutes"
        case status
        case categoryId = "category_id"
    }
}

// MARK: - Leaderboard entry
// Response shape from /api/family/leaderboard and from kid_profiles-based queries
struct LeaderboardEntry: Identifiable, Equatable {
    let id: String            // kid_profile_id
    let name: String
    let score: Int
    let rank: Int?
}
