import SwiftUI
import Supabase

// Live app state backed by Supabase. Scoped to the paired kid's kid_profile_id.
//
// Reads: kid name + streak from kid_profiles; categories from the categories
// table. Writes: in-memory only here. Durable writes to reading_log +
// quiz_attempts happen at the edges — KidReaderView logs reads, KidQuizEngineView
// logs attempts. Streak is recomputed server-side via trigger on reading_log
// insert, so this file just mirrors the result.

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
        // Ext-W8 — added day 3. CLAUDE.md owner-doc cites 3/7/14/30 as the
        // intended milestone set; only 7/14/30 were wired. Day-3 is the
        // first stretch where the kid has actually built a streak (not
        // just two days back-to-back), so it's the strongest early-loop
        // reinforcement signal.
        switch streakDays {
        case 3:  return .init(headline: "Three days in a row.", subhead: "That's a streak.")
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
                    slug: r.slug,
                    color: palette[i % palette.count],
                    progress: 0
                )
            }

            await loadProgressCounts(for: rows.map(\.id))
        } catch {
            // Fallback slugs mirror the seeded `categories` rows so the
            // category-tap filter in ArticleListView (K3) still works if the
            // initial fetch fails — it just won't have accurate progress
            // counts until the next successful load.
            self.categories = [
                KidCategory(name: "Science", slug: "kids-science", color: K.purple, progress: 0),
                KidCategory(name: "World",   slug: "kids-world",   color: K.teal,   progress: 0),
                KidCategory(name: "Sports",  slug: "kids-sports",  color: K.coral,  progress: 0),
                KidCategory(name: "Tech",    slug: "kids-tech",    color: K.sky,    progress: 0)
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
                // K3 added `slug` to KidCategory — preserve it through
                // the rebuild so ArticleListView's category-filter pill
                // still matches against the same slug the loader set.
                return KidCategory(
                    name: cat.name,
                    slug: cat.slug,
                    color: cat.color,
                    progress: min(count, 5)
                )
            }
        } catch {
            // non-fatal; progress stays at 0
        }
    }

    // MARK: Mutations

    // K1: streak + score + badges only advance on a passing quiz. Failed
    // quizzes previously bumped streakDays anyway (same return value, same
    // celebration path) because there was no `passed` signal on the way in.
    func completeQuiz(passed: Bool, score scoreDelta: Int, biasedSpotted: Bool) -> QuizOutcome {
        guard passed else {
            return QuizOutcome(
                previousStreak: streakDays,
                newStreak: streakDays,
                milestone: nil,
                badge: nil
            )
        }

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
    let slug: String?
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
