import SwiftUI
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18

// MARK: - Activity

/// Mirrors /profile?tab=Activity on the web. Shows reading log + quiz
/// attempts + comments merged and sorted by time.
struct ProfileActivityView: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    @State private var items: [ActivityRow] = []
    @State private var loading = true

    struct ActivityRow: Identifiable {
        let id: String
        let type: String
        let title: String
        let slug: String?
        let time: Date?
        let color: Color
    }

    var body: some View {
        ScrollView {
            if loading {
                ProgressView().padding(.top, 40)
            } else if items.isEmpty {
                Text("No activity yet.")
                    .font(.footnote)
                    .foregroundColor(VP.dim)
                    .padding(.top, 40)
            } else {
                VStack(spacing: 0) {
                    ForEach(items) { item in
                        HStack(alignment: .top, spacing: 10) {
                            Text(item.type.uppercased())
                                .font(.system(.caption2, design: .default, weight: .semibold))
                                .foregroundColor(item.color)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .overlay(RoundedRectangle(cornerRadius: 4).stroke(item.color))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title)
                                    .font(.system(.footnote, design: .default, weight: .medium))
                                    .foregroundColor(VP.text)
                            }
                            Spacer(minLength: 8)
                            if let t = item.time {
                                Text(timeAgo(t))
                                    .font(.caption2)
                                    .foregroundColor(VP.dim)
                            }
                        }
                        .padding(.vertical, 10)
                        Rectangle().fill(VP.rule).frame(height: 1)
                    }
                }
                .padding(.horizontal, 16)
            }
            Spacer().frame(height: 40)
        }
        .background(VP.bg)
        .navigationTitle("Activity")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        guard let uid = auth.currentUser?.id else { loading = false; return }
        loading = true
        defer { loading = false }

        struct ReadRow: Decodable {
            let id: String
            let created_at: Date
            let articles: ArticleRef?
        }
        struct QuizRow: Decodable {
            let id: String
            let article_id: String
            let attempt_number: Int
            let is_correct: Bool
            let created_at: Date
            let articles: ArticleRef?
        }
        struct CommentRow: Decodable {
            let id: String
            let created_at: Date
            let articles: ArticleRef?
        }
        struct ArticleRef: Decodable { let title: String?; let slug: String? }

        async let reads: [ReadRow] = (try? client.from("reading_log")
            .select("id, created_at, articles(title, slug)")
            .eq("user_id", value: uid)
            .order("created_at", ascending: false).limit(50)
            .execute().value) ?? []
        async let quizzes: [QuizRow] = (try? client.from("quiz_attempts")
            .select("id, article_id, attempt_number, is_correct, created_at, articles(title, slug)")
            .eq("user_id", value: uid)
            .is("kid_profile_id", value: nil)
            .order("created_at", ascending: false).limit(200)
            .execute().value) ?? []
        async let comments: [CommentRow] = (try? client.from("comments")
            .select("id, created_at, articles(title, slug)")
            .eq("user_id", value: uid)
            .order("created_at", ascending: false).limit(50)
            .execute().value) ?? []

        let (r, q, c) = await (reads, quizzes, comments)

        var out: [ActivityRow] = []
        out.append(contentsOf: r.map {
            ActivityRow(id: "r-\($0.id)", type: "Read", title: $0.articles?.title ?? "Untitled", slug: $0.articles?.slug, time: $0.created_at, color: VP.accent)
        })
        out.append(contentsOf: c.map {
            ActivityRow(id: "c-\($0.id)", type: "Comment", title: $0.articles?.title ?? "Untitled", slug: $0.articles?.slug, time: $0.created_at, color: VP.right)
        })

        var grouped: [String: (correct: Int, total: Int, title: String, slug: String?, time: Date)] = [:]
        for row in q {
            let key = "\(row.article_id):\(row.attempt_number)"
            var entry = grouped[key] ?? (0, 0, row.articles?.title ?? "Untitled", row.articles?.slug, row.created_at)
            entry.total += 1
            if row.is_correct { entry.correct += 1 }
            grouped[key] = entry
        }
        for (key, entry) in grouped {
            out.append(ActivityRow(
                id: "q-\(key)",
                type: "Quiz \(entry.correct)/\(entry.total)",
                title: entry.title,
                slug: entry.slug,
                time: entry.time,
                color: VP.text
            ))
        }

        out.sort { ($0.time ?? .distantPast) > ($1.time ?? .distantPast) }
        items = out
    }
}

// MARK: - Categories

/// Mirrors /profile?tab=Categories — list of categories with Verity Score,
/// articles read, quizzes passed per-category.
struct ProfileCategoriesView: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    @State private var rows: [Row] = []
    @State private var loading = true

    struct Row: Identifiable {
        let id: String
        let name: String
        let score: Int
        let reads: Int
        let quizzes: Int
    }

    var body: some View {
        ScrollView {
            if loading {
                ProgressView().padding(.top, 40)
            } else if rows.isEmpty {
                Text("No categories yet.")
                    .font(.footnote).foregroundColor(VP.dim)
                    .padding(.top, 40)
            } else {
                VStack(spacing: 10) {
                    ForEach(rows) { row in
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text(row.name)
                                    .font(.system(.subheadline, design: .default, weight: .semibold))
                                    .foregroundColor(VP.text)
                                Spacer()
                                Text("Score \(row.score)")
                                    .font(.caption)
                                    .foregroundColor(VP.dim)
                            }
                            StatRowView(label: "Read", value: row.reads, total: 50)
                            StatRowView(label: "Quizzes", value: row.quizzes, total: 30)
                        }
                        .padding(14)
                        .background(VP.card)
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border))
                        .cornerRadius(12)
                    }
                }
                .padding(.horizontal, 16)
            }
            Spacer().frame(height: 40)
        }
        .background(VP.bg)
        .navigationTitle("Categories")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        guard let uid = auth.currentUser?.id else { loading = false; return }
        loading = true
        defer { loading = false }
        do {
            struct Cat: Decodable {
                let id: String; let name: String
                let is_active: Bool?; let sort_order: Int?
                /// Mirrors VPCategory.displayName so the ProfileCategoriesView
                /// row label ends up the same with or without a "(kids)" suffix.
                var displayName: String {
                    var s = name
                    s = s.replacingOccurrences(of: #"\s*\((?i:kids?)\)\s*$"#, with: "", options: .regularExpression)
                    s = s.replacingOccurrences(of: #"\s+(?i:kids?)\s*$"#, with: "", options: .regularExpression)
                    s = s.replacingOccurrences(of: #"^(?i:kids?)\s+"#, with: "", options: .regularExpression)
                    return s.trimmingCharacters(in: .whitespaces)
                }
            }
            struct Score: Decodable { let category_id: String; let score: Int?; let articles_read: Int?; let quizzes_correct: Int? }

            async let cats: [Cat] = (try? client.from("categories")
                .select("id, name, is_active, sort_order")
                .eq("is_active", value: true)
                .order("sort_order", ascending: true)
                .execute().value) ?? []
            async let scores: [Score] = (try? client.from("category_scores")
                .select("category_id, score, articles_read, quizzes_correct")
                .eq("user_id", value: uid)
                .is("kid_profile_id", value: nil)
                .execute().value) ?? []

            let (cs, ss) = await (cats, scores)
            let byCat = Dictionary(uniqueKeysWithValues: ss.map { ($0.category_id, $0) })
            rows = cs.map { c in
                let s = byCat[c.id]
                return Row(
                    id: c.id,
                    name: c.displayName,
                    score: s?.score ?? 0,
                    reads: s?.articles_read ?? 0,
                    quizzes: s?.quizzes_correct ?? 0
                )
            }
        }
    }
}

// MARK: - Achievements

struct ProfileAchievementsView: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    @State private var groups: [Group] = []
    @State private var loading = true

    struct Group: Identifiable {
        let id = UUID()
        let heading: String
        var items: [Item]
    }
    struct Item: Identifiable {
        let id: String
        let name: String
        let description: String
        let earnedAt: Date?
    }

    var body: some View {
        ScrollView {
            if loading {
                ProgressView().padding(.top, 40)
            } else if groups.isEmpty {
                Text("No achievements yet.")
                    .font(.footnote).foregroundColor(VP.dim)
                    .padding(.top, 40)
            } else {
                VStack(alignment: .leading, spacing: 20) {
                    ForEach(groups) { group in
                        let earned = group.items.filter { $0.earnedAt != nil }.count
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text(group.heading)
                                    .font(.system(.subheadline, design: .default, weight: .bold))
                                    .foregroundColor(VP.text)
                                Spacer()
                                Text("\(earned)/\(group.items.count)")
                                    .font(.caption)
                                    .foregroundColor(VP.dim)
                            }
                            VStack(spacing: 8) {
                                ForEach(group.items) { item in
                                    HStack(alignment: .top) {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(item.name)
                                                .font(.system(.footnote, design: .default, weight: .semibold))
                                                .foregroundColor(VP.text)
                                            Text(item.description)
                                                .font(.caption)
                                                .foregroundColor(VP.dim)
                                                .lineSpacing(1)
                                        }
                                        Spacer()
                                        Text(item.earnedAt != nil ? "Earned" : "Locked")
                                            .font(.system(.caption2, design: .default, weight: .semibold))
                                            .foregroundColor(item.earnedAt != nil ? VP.success : VP.dim)
                                    }
                                    .padding(14)
                                    .background(item.earnedAt != nil ? VP.card : Color.white)
                                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
                                    .cornerRadius(10)
                                    .opacity(item.earnedAt != nil ? 1 : 0.55)
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
            Spacer().frame(height: 40)
        }
        .background(VP.bg)
        .navigationTitle("Achievements")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        guard let uid = auth.currentUser?.id else { loading = false; return }
        loading = true
        defer { loading = false }

        struct A: Decodable { let id: String; let name: String; let description: String; let category: String }
        struct E: Decodable { let achievement_id: String; let earned_at: Date }

        async let all: [A] = (try? client.from("achievements")
            .select("id, name, description, category")
            .eq("is_active", value: true)
            .eq("is_secret", value: false)
            .order("category", ascending: true)
            .execute().value) ?? []
        async let mine: [E] = (try? client.from("user_achievements")
            .select("achievement_id, earned_at")
            .eq("user_id", value: uid)
            .is("kid_profile_id", value: nil)
            .execute().value) ?? []

        let (a, m) = await (all, mine)
        let earnedMap = Dictionary(uniqueKeysWithValues: m.map { ($0.achievement_id, $0.earned_at) })

        var byCategory: [String: [Item]] = [:]
        for row in a {
            let item = Item(id: row.id, name: row.name, description: row.description, earnedAt: earnedMap[row.id])
            byCategory[row.category, default: []].append(item)
        }
        groups = byCategory.map { Group(heading: $0.key, items: $0.value) }
            .sorted { $0.heading < $1.heading }
    }
}

// MARK: - Contact Us (stub that matches web copy)

struct ProfileContactView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Contact Us")
                    .font(.system(.title2, design: .default, weight: .bold))
                    .foregroundColor(VP.text)

                Text("We read every message. For feature requests, bug reports, or questions about your account, send us a note and we\u{2019}ll get back to you.")
                    .font(.subheadline)
                    .foregroundColor(VP.soft)

                Link("support@veritypost.com", destination: URL(string: "mailto:support@veritypost.com")!)
                    .font(.system(.subheadline, design: .default, weight: .semibold))
                    .foregroundColor(VP.accent)
            }
            .padding(20)
        }
        .background(VP.bg)
        .navigationTitle("Contact Us")
        .navigationBarTitleDisplayMode(.inline)
    }
}
