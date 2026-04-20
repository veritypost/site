import Foundation

// Kids-app-local Codable models. Verified against the live Supabase schema
// on 2026-04-19 via information_schema.columns on project fyiwulqphgmoqullmrfn.
//
// Every column here exists on the corresponding table with matching type.
// Mirrors adult app's Models.swift where overlap exists.

// MARK: - Kid Profile
// Table: public.kid_profiles
struct KidProfile: Codable, Identifiable, Equatable {
    let id: String
    var parentUserId: String?
    var displayName: String?
    var avatarColor: String?
    var avatarUrl: String?
    var avatarPreset: String?
    var dateOfBirth: String?        // date, "YYYY-MM-DD"
    var ageRange: String?
    var readingLevel: String?

    // Progress columns — directly on kid_profiles
    var verityScore: Int?
    var articlesReadCount: Int?
    var quizzesCompletedCount: Int?
    var streakCurrent: Int?
    var streakBest: Int?
    var streakLastActiveDate: String?
    var streakFreezeRemaining: Int?

    // Parental controls
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
        case ageRange = "age_range"
        case readingLevel = "reading_level"
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
}

// MARK: - Category
// Table: public.categories
struct VPCategory: Codable, Identifiable, Equatable {
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

// MARK: - Article (kid-safe subset)
// Table: public.articles
struct KidArticle: Codable, Identifiable {
    let id: String
    let title: String?
    let slug: String?
    let excerpt: String?
    let kidsSummary: String?
    let coverImageUrl: String?
    let categoryId: String?
    let readingTimeMinutes: Int?
    let difficultyLevel: String?
    let publishedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, title, slug, excerpt
        case kidsSummary = "kids_summary"
        case coverImageUrl = "cover_image_url"
        case categoryId = "category_id"
        case readingTimeMinutes = "reading_time_minutes"
        case difficultyLevel = "difficulty_level"
        case publishedAt = "published_at"
    }
}

// MARK: - Reading log insert
// Table: public.reading_log — verified columns 2026-04-19.
// `completed` is a boolean; `completed_at` does NOT exist.
// `user_id` is the parent's users.id (nullable for kid-only reads).
// `kid_profile_id` scopes the row when a kid was active.
struct ReadingLogInsert: Encodable {
    let user_id: String?
    let kid_profile_id: String
    let article_id: String
    let read_percentage: Double
    let time_spent_seconds: Int
    let completed: Bool
    let source: String?           // "kids-ios" etc.
    let device_type: String?      // "ios"
}

// MARK: - Quiz attempt insert
// Table: public.quiz_attempts — verified columns 2026-04-19.
// Columns on the table: quiz_id, user_id, kid_profile_id, article_id,
// attempt_number, questions_served (uuid[]), selected_answer (text),
// is_correct, points_earned, time_taken_seconds, created_at.
// NOTE: there is no question_id column — the quiz shape stores the
// questions_served array + selected_answer for the current question.
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

// MARK: - Kid's unlocked achievements
// Table: public.kid_achievements (schema TBD in detail — matches adult
// achievements model). Keep minimal for now.
struct KidAchievement: Codable, Identifiable {
    let id: String
    let achievementId: String
    let earnedAt: Date?
    let name: String?

    enum CodingKeys: String, CodingKey {
        case id
        case achievementId = "achievement_id"
        case earnedAt = "earned_at"
        case name
    }
}
