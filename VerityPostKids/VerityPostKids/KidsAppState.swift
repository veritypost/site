import SwiftUI
import Supabase

// Live app state backed by Supabase. Scoped to the paired kid's kid_profile_id.
//
// Reads today:
//   - Kid name + streak from kid_profiles
//   - Categories from the categories table
//
// Writes today:
//   - Local-only (completeQuiz mutates in-memory)
//   - Real writes to reading_log + quiz_attempts are stubbed with TODO
//     markers — they need real article_id + question_id context from a
//     quiz engine (P3c work)

@MainActor
final class KidsAppState: ObservableObject {
    // Identity
    @Published var kidId: String = ""
    @Published var kidName: String = ""

    // Progress
    @Published var streakDays: Int = 0
    @Published var verityScore: Int = 0
    @Published var quizzesPassed: Int = 0
    @Published var biasedHeadlinesSpotted: Int = 0

    // Home content
    @Published var categories: [KidCategory] = []

    // Loading
    @Published var isLoading: Bool = false
    @Published var loadError: String? = nil

    private let client: SupabaseClient

    init(client: SupabaseClient = SupabaseKidsClient.shared.client) {
        self.client = client
    }

    // MARK: Derived

    var streakSubtext: String {
        switch streakDays {
        case 0: return "Start your streak today"
        case 1: return "First day — keep it going"
        case 2...6: return "Read one more to keep it alive"
        case 7: return "A week of real news"
        default: return "A \(streakDays)-day habit"
        }
    }

    var milestoneForCurrentStreak: StreakScene.Milestone? {
        switch streakDays {
        case 7:  return .init(headline: "You've read news for seven days straight.", subhead: "That's becoming a real habit.")
        case 14: return .init(headline: "Two weeks in a row.", subhead: "You're taking news seriously.")
        case 30: return .init(headline: "A month of news.", subhead: "Not many people do this.")
        default: return nil
        }
    }

    // MARK: Load

    func load(forKidId id: String, kidName name: String) async {
        kidId = id
        kidName = name

        isLoading = true
        loadError = nil
        defer { isLoading = false }

        await loadKidRow()
        await loadCategories()
    }

    private func loadKidRow() async {
        guard !kidId.isEmpty else { return }
        struct Row: Decodable { let streak_current: Int? }
        do {
            let row: Row = try await client
                .from("kid_profiles")
                .select("streak_current")
                .eq("id", value: kidId)
                .single()
                .execute()
                .value
            self.streakDays = row.streak_current ?? 0
        } catch {
            self.loadError = "Couldn't load streak: \(error.localizedDescription)"
        }
    }

    private func loadCategories() async {
        struct CatRow: Decodable {
            let id: String
            let name: String
            let slug: String?
        }
        do {
            let rows: [CatRow] = try await client
                .from("categories")
                .select("id, name, slug")
                .like("slug", pattern: "kids-%")
                .order("name", ascending: true)
                .limit(8)
                .execute()
                .value

            let palette: [Color] = [K.purple, K.teal, K.coral, K.sky, K.mint, K.gold]
            self.categories = rows.enumerated().map { i, r in
                KidCategory(
                    name: cleanCategoryName(r.name),
                    color: palette[i % palette.count],
                    progress: 0
                )
            }

            await loadProgressCounts(for: rows.map(\.id))
        } catch {
            self.categories = [
                KidCategory(name: "Science", color: K.purple, progress: 0),
                KidCategory(name: "World",   color: K.teal,   progress: 0),
                KidCategory(name: "Sports",  color: K.coral,  progress: 0),
                KidCategory(name: "Tech",    color: K.sky,    progress: 0)
            ]
            self.loadError = "Using default categories (DB fetch failed): \(error.localizedDescription)"
        }
    }

    private func loadProgressCounts(for categoryIds: [String]) async {
        guard !categoryIds.isEmpty, !kidId.isEmpty else { return }
        struct ReadRow: Decodable { let article_id: String }
        struct ArtRow: Decodable { let id: String; let category_id: String? }
        do {
            let reads: [ReadRow] = try await client
                .from("reading_log")
                .select("article_id")
                .eq("kid_profile_id", value: kidId)
                .execute()
                .value

            let articleIds = reads.map(\.article_id)
            guard !articleIds.isEmpty else { return }

            let articles: [ArtRow] = try await client
                .from("articles")
                .select("id, category_id")
                .in("id", values: articleIds)
                .execute()
                .value

            var countByCat: [String: Int] = [:]
            for a in articles {
                if let cid = a.category_id { countByCat[cid, default: 0] += 1 }
            }

            self.categories = self.categories.enumerated().map { i, cat in
                let catId = categoryIds[safe: i] ?? ""
                let count = countByCat[catId] ?? 0
                return KidCategory(name: cat.name, color: cat.color, progress: min(count, 5))
            }
        } catch {
            // non-fatal; progress stays at 0
        }
    }

    // MARK: Mutations

    func completeQuiz(score scoreDelta: Int, biasedSpotted: Bool) -> QuizOutcome {
        verityScore += scoreDelta
        quizzesPassed += 1
        let oldStreak = streakDays
        streakDays += 1

        var badge: BadgeUnlockScene? = nil
        if biasedSpotted {
            biasedHeadlinesSpotted += 1
            if biasedHeadlinesSpotted == 5 {
                badge = BadgeUnlockScene(
                    tierLabel: "Gold Badge",
                    headline: "You spotted a biased headline five times.",
                    subhead: "Bias Detection — Level 3",
                    iconName: "star.fill",
                    tint: K.gold
                )
            }
        }

        // TODO (P3c): persist via quiz_attempts + reading_log inserts.
        // Streak server-side via trigger on reading_log insert.

        return QuizOutcome(
            previousStreak: oldStreak,
            newStreak: streakDays,
            milestone: milestoneForCurrentStreak,
            badge: badge
        )
    }
}

struct KidCategory: Identifiable, Equatable {
    let id = UUID()
    let name: String
    let color: Color
    var progress: Int
}

struct QuizOutcome {
    let previousStreak: Int
    let newStreak: Int
    let milestone: StreakScene.Milestone?
    let badge: BadgeUnlockScene?
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

/// Strip admin-context "(Kids)" suffix from category names since the kids
/// app is kids-only — adult distinction is redundant.
private func cleanCategoryName(_ name: String) -> String {
    name
        .replacingOccurrences(of: " (Kids)", with: "")
        .replacingOccurrences(of: "(Kids)", with: "")
        .trimmingCharacters(in: .whitespaces)
}
