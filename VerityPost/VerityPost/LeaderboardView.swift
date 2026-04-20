import SwiftUI
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified home_feed 2026-04-18

// Round A (092b_rls_lockdown_followup, 2026-04-19): every `.from("users")`
// call below selects only columns that remain in the anon GRANT list on
// public.users (id, username, verity_score, avatar_color, avatar_url,
// is_verified_public_figure, articles_read_count, quizzes_completed_count,
// comment_count, streak_current, created_at). Safe today. Any future
// migration that tightens those columns must re-audit this file —
// `.select("<cols>")` fails hard on first revoked column.

struct LeaderboardView: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    // Tab + filters
    @State private var users: [VPUser] = []
    @State private var displayScores: [String: Int] = [:]
    @State private var loading = true
    @State private var activeTab = "Top Verifiers"
    private let tabs = ["Top Verifiers", "Top Readers", "Rising Stars", "Weekly"]
    @State private var activePeriod = "All Time"
    private let periods = ["This Week", "This Month", "All Time"]

    // Category filter
    @State private var categories: [VPCategory] = []
    @State private var subcategories: [VPSubcategory] = []
    @State private var activeCategory: String? = nil  // category id
    @State private var activeSubcategory: String? = nil

    // Expansion
    @State private var expanded: String? = nil

    private var isLoggedIn: Bool { auth.currentUser != nil }

    private var visibleTabs: [String] {
        isLoggedIn ? tabs : ["Top Verifiers"]
    }

    private var visiblePeriods: [String] {
        isLoggedIn ? periods : ["All Time"]
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // Your rank
                if let me = auth.currentUser {
                    yourRankCard(me: me)
                        .padding(.horizontal, 20)
                        .padding(.top, 16)
                        .padding(.bottom, 12)
                }

                // Tab pills — invisible-gate rule: locked tabs omitted entirely for anonymous.
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(visibleTabs, id: \.self) { tab in
                            Button {
                                activeTab = tab
                                activeCategory = nil
                                activeSubcategory = nil
                                loading = true
                            } label: {
                                Text(tab)
                                    .font(.system(.caption, design: .default, weight: .medium))
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 7)
                                    .background(activeTab == tab ? VP.accent.opacity(0.15) : VP.card)
                                    .foregroundColor(activeTab == tab ? VP.accent : VP.dim)
                                    .cornerRadius(20)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 20)
                }
                .padding(.bottom, 10)

                // Period filter — only Top Verifiers / no category override; anon sees All Time only.
                if activeTab == "Top Verifiers" && activeCategory == nil && visiblePeriods.count > 1 {
                    HStack(spacing: 6) {
                        ForEach(visiblePeriods, id: \.self) { p in
                            Button {
                                activePeriod = p
                                loading = true
                            } label: {
                                Text(p)
                                    .font(.system(.caption, design: .default, weight: .medium))
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 5)
                                    .background(activePeriod == p ? VP.text : .clear)
                                    .foregroundColor(activePeriod == p ? .white : VP.dim)
                                    .cornerRadius(14)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 14)
                                            .stroke(activePeriod == p ? .clear : VP.border)
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                        Spacer()
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 10)
                }

                // Category filter pills
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        catPill(id: nil, label: "All")
                        ForEach(categories, id: \.id) { cat in
                            catPill(id: cat.id, label: cat.displayName)
                        }
                    }
                    .padding(.horizontal, 20)
                }
                .padding(.bottom, activeSubs.isEmpty ? 12 : 6)

                // Subcategory filter — logged in only
                if isLoggedIn && !activeSubs.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(activeSubs, id: \.id) { sub in
                                subPill(sub: sub)
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                    .padding(.bottom, 12)
                }

                // List
                if loading {
                    ProgressView().padding(.top, 60)
                } else if users.isEmpty {
                    Text("No results.")
                        .font(.footnote)
                        .foregroundColor(VP.dim)
                        .padding(.top, 40)
                } else {
                    VStack(spacing: 0) {
                        // Top 3 always visible
                        ForEach(Array(users.prefix(3).enumerated()), id: \.element.id) { idx, user in
                            leaderboardRow(user: user, idx: idx, canExpand: isLoggedIn)
                            if idx < min(users.count, 3) - 1 {
                                Rectangle().fill(VP.rule).frame(height: 1)
                            }
                        }

                        if isLoggedIn {
                            // Full list for logged-in users
                            ForEach(Array(users.dropFirst(3).enumerated()), id: \.element.id) { idx, user in
                                Divider().background(VP.rule).padding(.leading, 80)
                                leaderboardRow(user: user, idx: idx + 3, canExpand: true)
                            }
                        } else if users.count > 3 {
                            // Lock overlay for non-logged-in
                            ZStack {
                                VStack(spacing: 0) {
                                    ForEach(Array(users.dropFirst(3).prefix(5).enumerated()), id: \.element.id) { idx, user in
                                        Divider().background(VP.rule).padding(.leading, 80)
                                        leaderboardRow(user: user, idx: idx + 3, canExpand: false)
                                    }
                                }
                                .blur(radius: 6)
                                .allowsHitTesting(false)

                                VStack(spacing: 8) {
                                    Text("Full leaderboard locked")
                                        .font(.system(.headline, design: .default, weight: .bold))
                                        .foregroundColor(VP.text)
                                    Text("Sign up to see where everyone ranks")
                                        .font(.footnote)
                                        .foregroundColor(VP.dim)
                                }
                                .padding(.vertical, 40)
                            }
                        }
                    }
                    .background(VP.bg)
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border))
                    .cornerRadius(12)
                    .padding(.horizontal, 20)
                }

                Spacer().frame(height: 100)
            }
        }
        .background(VP.bg.ignoresSafeArea())
        .navigationTitle("Leaderboard")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadCategories() }
        .task(id: "\(activeTab)|\(activePeriod)|\(activeCategory ?? "")") {
            await loadLeaderboard()
        }
    }

    private var activeSubs: [VPSubcategory] {
        guard let cat = activeCategory else { return [] }
        return subcategories.filter { $0.categoryId == cat }
    }

    // MARK: - Components

    private func yourRankCard(me: VPUser) -> some View {
        let rank = users.firstIndex(where: { $0.id == me.id }).map { $0 + 1 }
        return HStack {
            AvatarView(user: me, size: 28)
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Text("Your rank").font(.system(.footnote, design: .default, weight: .semibold)).foregroundColor(VP.text)
                    Text(rank.map { "#\($0)" } ?? "unranked in this view")
                        .font(.footnote).foregroundColor(VP.dim)
                }
            }
            Spacer()
            Text("\(me.verityScore ?? 0)")
                .font(.system(.subheadline, design: .default, weight: .bold))
                .foregroundColor(VP.accent)
        }
        .padding(12)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
        .cornerRadius(10)
    }

    private func catPill(id: String?, label: String) -> some View {
        let active = activeCategory == id
        let catLocked = !isLoggedIn && id != nil
        return Button {
            guard !catLocked else { return }
            activeCategory = id
            activeSubcategory = nil
            loading = true
        } label: {
            Text(label)
                .font(.system(.caption, design: .default, weight: .medium))
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(active ? VP.accent.opacity(0.1) : .clear)
                .foregroundColor(catLocked ? VP.muted : active ? VP.accent : VP.dim)
                .cornerRadius(14)
                .opacity(catLocked ? 0.5 : 1)
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(catLocked ? VP.rule : active ? VP.accent : VP.border))
        }
        .buttonStyle(.plain)
        .disabled(catLocked)
    }

    private func subPill(sub: VPSubcategory) -> some View {
        let active = activeSubcategory == sub.id
        return Button {
            activeSubcategory = active ? nil : sub.id
        } label: {
            Text(sub.name)
                .font(.system(.caption, design: .default, weight: .medium))
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(active ? VP.accent.opacity(0.08) : .clear)
                .foregroundColor(active ? VP.accent : VP.dim)
                .cornerRadius(14)
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(active ? VP.accent : VP.border))
        }
        .buttonStyle(.plain)
    }

    private func leaderboardRow(user: VPUser, idx: Int, canExpand: Bool = true) -> some View {
        let isExpanded = canExpand && expanded == user.id
        let topUser = users.first
        let displayScore = displayScores[user.id] ?? (user.verityScore ?? 0)
        let topScore = topUser.map { displayScores[$0.id] ?? ($0.verityScore ?? 0) } ?? 0

        return VStack(spacing: 0) {
            Button {
                guard canExpand else { return }
                withAnimation(.easeInOut(duration: 0.15)) {
                    expanded = isExpanded ? nil : user.id
                }
            } label: {
                HStack(spacing: 12) {
                    Text("\(idx + 1)")
                        .font(.system(.subheadline, design: .default, weight: .bold))
                        .foregroundColor(idx < 3 ? VP.accent : VP.dim)
                        .frame(width: 28, alignment: .trailing)
                    AvatarView(user: user, size: 40)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            if let uname = user.username {
                                NavigationLink {
                                    PublicProfileView(username: uname)
                                        .environmentObject(auth)
                                } label: {
                                    Text(uname)
                                        .font(.system(.subheadline, design: .default, weight: .semibold))
                                        .foregroundColor(VP.text)
                                }
                                .buttonStyle(.plain)
                            } else {
                                Text("user")
                                    .font(.system(.subheadline, design: .default, weight: .semibold))
                                    .foregroundColor(VP.text)
                            }
                            VerifiedBadgeView(user: user)
                        }
                        Text("\((user.verityScore ?? 0)) verity")
                            .font(.caption)
                            .foregroundColor(VP.dim)
                    }
                    Spacer()
                    Text("\(displayScore)")
                        .font(.system(.headline, design: .default, weight: .bold))
                        .foregroundColor(VP.accent)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(isExpanded ? VP.card : VP.bg)
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(alignment: .leading, spacing: 0) {
                    StatRowView(label: "Score", value: displayScore, total: max(topScore, 1))
                    StatRowView(label: "Articles Read", value: user.articlesReadCount ?? 0, total: max(topUser?.articlesReadCount ?? 0, 1))
                    StatRowView(label: "Quizzes Passed", value: user.quizzesCompletedCount ?? 0, total: max(topUser?.quizzesCompletedCount ?? 0, 1))
                    StatRowView(label: "Comments", value: user.commentCount ?? 0, total: max(topUser?.commentCount ?? 0, 1))
                    StatRowView(label: "Streak", value: user.streak ?? 0, total: max(topUser?.streak ?? 0, 1))
                }
                .padding(.leading, 80)
                .padding(.trailing, 20)
                .padding(.bottom, 12)
                .background(VP.card)
            }
        }
    }

    // MARK: - Data loading

    private func loadCategories() async {
        // Pull both top-level categories and subcategories — splitting
        // them locally so the subcategory pills can render conditionally
        // when a parent category is selected.
        do {
            let all: [VPCategory] = try await client.from("categories")
                .select()
                .eq("is_active", value: true)
                .eq("is_kids_safe", value: false)
                .order("sort_order", ascending: true)
                .execute().value
            categories = all.filter { $0.categoryId == nil }
            subcategories = all.compactMap { c in
                guard let p = c.categoryId else { return nil }
                return VPSubcategory(id: c.id, categoryId: p, name: c.name, slug: c.slug)
            }
        } catch {}
    }

    private func loadLeaderboard() async {
        displayScores = [:]
        if let catId = activeCategory {
            await loadByCategory(catId: catId)
        } else {
            switch activeTab {
            case "Top Verifiers": await loadTopVerifiers()
            case "Top Readers": await loadTopReaders()
            case "Rising Stars": await loadRisingStars()
            case "Weekly": await loadPeriodLeaderboard(period: "This Week")
            default: await loadTopVerifiers()
            }
        }
        loading = false
    }

    private func loadByCategory(catId: String) async {
        do {
            struct CS: Decodable { let user_id: String; let score: Int }
            let rows: [CS] = try await client.from("category_scores")
                .select("user_id, score")
                .eq("category_id", value: catId)
                .order("score", ascending: false)
                .limit(50)
                .execute().value
            let ids = rows.map { $0.user_id }
            if ids.isEmpty { users = []; return }
            let fetched: [VPUser] = try await client.from("users")
                .select("id, username, verity_score, avatar_color, avatar_url, is_verified_public_figure, articles_read_count, quizzes_completed_count, comment_count, streak_current, created_at")
                .in("id", values: ids)
                .execute().value
            let map = Dictionary(uniqueKeysWithValues: fetched.map { ($0.id, $0) })
            users = rows.compactMap { r in map[r.user_id] }
            displayScores = Dictionary(uniqueKeysWithValues: rows.map { ($0.user_id, $0.score) })
        } catch {
            Log.d("Failed to load category leaderboard:", error)
        }
    }

    private func loadTopVerifiers() async {
        if activePeriod == "All Time" {
            do {
                let data: [VPUser] = try await client.from("users")
                    .select("id, username, verity_score, avatar_color, avatar_url, is_verified_public_figure, articles_read_count, quizzes_completed_count, comment_count, streak_current, created_at")
                    .order("verity_score", ascending: false)
                    .limit(50)
                    .execute().value
                users = data
            } catch { Log.d("Load verifiers error:", error) }
        } else {
            await loadPeriodLeaderboard(period: activePeriod)
        }
    }

    private func loadTopReaders() async {
        do {
            let data: [VPUser] = try await client.from("users")
                .select("id, username, verity_score, avatar_color, avatar_url, is_verified_public_figure, articles_read_count, quizzes_completed_count, comment_count, streak_current, created_at")
                .order("articles_read_count", ascending: false)
                .limit(50)
                .execute().value
            users = data
            displayScores = Dictionary(uniqueKeysWithValues: data.map { ($0.id, $0.articlesReadCount ?? 0) })
        } catch { Log.d("Load readers error:", error) }
    }

    private func loadRisingStars() async {
        do {
            let thirtyDaysAgo = Calendar.current.date(byAdding: .day, value: -30, to: Date()) ?? Date()
            let fromStr = ISO8601DateFormatter().string(from: thirtyDaysAgo)
            let data: [VPUser] = try await client.from("users")
                .select("id, username, verity_score, avatar_color, avatar_url, is_verified_public_figure, articles_read_count, quizzes_completed_count, comment_count, streak_current, created_at")
                .gte("created_at", value: fromStr)
                .order("verity_score", ascending: false)
                .limit(50)
                .execute().value
            users = data
        } catch { Log.d("Load rising stars error:", error) }
    }

    private func loadPeriodLeaderboard(period: String) async {
        do {
            let cal = Calendar.current
            let now = Date()
            let fromDate: Date
            if period == "This Week" {
                fromDate = cal.date(from: cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: now)) ?? now
            } else {
                fromDate = cal.date(from: cal.dateComponents([.year, .month], from: now)) ?? now
            }
            let fromStr = ISO8601DateFormatter().string(from: fromDate)
            struct R: Decodable { let user_id: String }
            let reads: [R] = try await client.from("reading_log")
                .select("user_id")
                .gte("created_at", value: fromStr)
                .execute().value
            var counts: [String: Int] = [:]
            reads.forEach { counts[$0.user_id, default: 0] += 1 }
            let sortedIds = counts.sorted { $0.value > $1.value }.prefix(50).map { $0.key }
            if sortedIds.isEmpty { users = []; return }
            let fetched: [VPUser] = try await client.from("users")
                .select("id, username, verity_score, avatar_color, avatar_url, is_verified_public_figure, articles_read_count, quizzes_completed_count, comment_count, streak_current, created_at")
                .in("id", values: Array(sortedIds))
                .execute().value
            let map = Dictionary(uniqueKeysWithValues: fetched.map { ($0.id, $0) })
            users = sortedIds.compactMap { map[$0] }
            displayScores = Dictionary(uniqueKeysWithValues: sortedIds.map { ($0, counts[$0] ?? 0) })
        } catch { Log.d("Period leaderboard error:", error) }
    }
}
