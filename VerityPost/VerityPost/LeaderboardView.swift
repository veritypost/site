import SwiftUI
import Supabase
import PostgREST

// @migrated-to-permissions 2026-04-23
// @feature-verified home_feed 2026-04-18
//
// Round B (C2 of Wave 1 consensus ship, 2026-04-23): rewrite to web parity.
//
//   - Honors the @migrated-to-permissions marker: `leaderboard.view`,
//     `leaderboard.category.view`, `leaderboard.filter.time` are read live
//     via `PermissionService.shared` and observed through `PermissionStore`
//     so cache-version bumps refresh the UI.
//   - Every `public.users` read applies the four privacy filters the RLS
//     lockdown (092b) expects every leaderboard query to respect:
//       `.eq("email_verified", true)`, `.eq("is_banned", false)`,
//       `.eq("show_on_leaderboard", true)`, `.is("frozen_at", nil)`.
//     Missing any one of them is the defect this commit retires.
//   - Weekly / Monthly windows are **rolling** (-7d / -30d from now) — the
//     previous calendar-aligned `Calendar.dateComponents([...weekOfYear])`
//     shape gave different ranks for the same UI label depending on which
//     day of the week the viewer opened the tab, and diverged from web.
//   - Weekly / Monthly counts come from the `leaderboard_period_counts`
//     RPC (schema/142) which runs SECURITY DEFINER so aggregation doesn't
//     collapse to the caller's single row under RLS. The broken direct
//     `reading_log` aggregation that preceded it is retired outright — no
//     parallel path.
//   - Column selections stay inside the anon GRANT list (092b): id,
//     username, verity_score, avatar_color, avatar_url,
//     is_verified_public_figure, articles_read_count,
//     quizzes_completed_count, comment_count, streak_current, created_at.
//     Any future GRANT tightening must re-audit this file.
//
// Subcategory pills: the web page renders the pills and then silently drops
// `activeSub` before issuing the query (drift, not intentional) because the
// `category_scores` table carries only `category_id` — there is no
// `subcategory_id` column to filter on. Until a follow-up either (a) adds
// the column + backfills or (b) changes category leaderboards to aggregate
// `reading_log`→`articles.subcategory_id` live, this file hides the
// subcategory pill row rather than render an affordance that does nothing.
// Tracked for Wave 2 pickup.

struct LeaderboardView: View {
    @EnvironmentObject var auth: AuthViewModel
    @ObservedObject private var permStore = PermissionStore.shared
    private let client = SupabaseManager.shared.client

    // Tab + filters
    @State private var users: [VPUser] = []
    @State private var displayScores: [String: Int] = [:]
    @State private var loading = true
    @State private var activeTab: TabKey = .topVerifiers
    @State private var activePeriod: LeaderboardPeriod = .allTime

    // Permission state (populated from PermissionService on appear).
    @State private var canViewFull = false      // leaderboard.view
    @State private var canViewCategories = false // leaderboard.category.view
    @State private var canFilterTime = false     // leaderboard.filter.time

    // Category filter
    @State private var categories: [VPCategory] = []
    @State private var activeCategory: String? = nil // category id

    // Expansion (tap chevron to toggle stats panel; tap row navigates to profile).
    @State private var expanded: String? = nil

    private var isLoggedIn: Bool { auth.currentUser != nil }

    private var visibleTabs: [TabKey] {
        // Invisible-gate rule: extra tabs are hidden (not greyed-out) for
        // viewers without full leaderboard access.
        canViewFull ? TabKey.allCases : [.topVerifiers]
    }

    private var visiblePeriods: [LeaderboardPeriod] {
        canFilterTime ? LeaderboardPeriod.allCases : [.allTime]
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // Flat top bar — matches HomeView/ProfileView. Avoids iOS 26's
                // floating glass nav bubble + gray scroll-edge shadow. Uses
                // `.toolbar(.hidden, for: .navigationBar)` below.
                HStack(spacing: 0) {
                    Text("most informed")
                        .font(.system(size: 15, weight: .heavy))
                        .tracking(-0.15)
                        .foregroundColor(VP.text)
                        .lineLimit(1)
                        .fixedSize(horizontal: true, vertical: false)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(VP.bg)
                .overlay(
                    Rectangle().fill(VP.border).frame(height: 1),
                    alignment: .bottom
                )

                // Your rank
                if let me = auth.currentUser {
                    yourRankCard(me: me)
                        .padding(.horizontal, 20)
                        .padding(.top, 16)
                        .padding(.bottom, 12)
                }

                // Tab pills — logged-in only (matches web `{me && ...}`).
                if isLoggedIn {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(visibleTabs, id: \.self) { tab in
                                Button {
                                    activeTab = tab
                                    activeCategory = nil
                                    loading = true
                                } label: {
                                    Text(tab.label)
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
                }

                // Period filter — Top Verifiers / no category. Gated on
                // `leaderboard.filter.time` (anon / free see All Time only).
                if isLoggedIn && activeTab == .topVerifiers && activeCategory == nil && visiblePeriods.count > 1 {
                    HStack(spacing: 6) {
                        ForEach(visiblePeriods, id: \.self) { p in
                            Button {
                                activePeriod = p
                                loading = true
                            } label: {
                                Text(p.label)
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

                // Category filter pills — gated on leaderboard.category.view.
                if canViewCategories {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            catPill(id: nil, label: "All")
                            ForEach(categories, id: \.id) { cat in
                                catPill(id: cat.id, label: cat.displayName)
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
                    VStack(spacing: 8) {
                        Text("No results")
                            .font(.system(.subheadline, design: .default, weight: .bold))
                            .foregroundColor(VP.text)
                        Text("No one has earned points with these filters yet.")
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                            .multilineTextAlignment(.center)
                        if activeCategory != nil {
                            Button {
                                activeCategory = nil
                                loading = true
                            } label: {
                                Text("Clear filters")
                                    .font(.system(.footnote, design: .default, weight: .semibold))
                            }
                            .buttonStyle(.bordered)
                            .padding(.top, 4)
                        }
                    }
                    .padding(.horizontal, 40)
                    .padding(.top, 40)
                } else {
                    VStack(spacing: 0) {
                        // Top 3 — always visible.
                        ForEach(Array(users.prefix(3).enumerated()), id: \.element.id) { idx, user in
                            leaderboardRow(user: user, idx: idx, canExpand: isLoggedIn)
                            if idx < min(users.count, 3) - 1 {
                                Rectangle().fill(VP.rule).frame(height: 1)
                            }
                        }

                        if isLoggedIn && canViewFull {
                            // Full list for verified viewers.
                            ForEach(Array(users.dropFirst(3).enumerated()), id: \.element.id) { idx, user in
                                Divider().background(VP.rule).padding(.leading, 80)
                                leaderboardRow(user: user, idx: idx + 3, canExpand: true)
                            }
                        } else if users.count > 3 {
                            // Anon / unverified: blur positions 4+ with lock
                            // overlay. Fetch path already caps anon to 3 rows,
                            // so this branch only fires for unverified logged-in.
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
                                    Text(isLoggedIn ? "Verify your email to see ranks beyond top 3." : "Full ranking locked")
                                        .font(.system(.headline, design: .default, weight: .bold))
                                        .foregroundColor(VP.text)
                                        .multilineTextAlignment(.center)
                                    Text(isLoggedIn ? "Verification unlocks the full list." : "Sign up to see where everyone ranks")
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
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            await refreshPermissions()
            await loadCategories()
            await loadLeaderboard()
        }
        .task {
            await refreshPermissions()
            await loadCategories()
        }
        .task(id: "\(activeTab.rawValue)|\(activePeriod.rawValue)|\(activeCategory ?? "")|\(permStore.changeToken)") {
            await loadLeaderboard()
        }
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
        return Button {
            activeCategory = id
            loading = true
        } label: {
            Text(label)
                .font(.system(.caption, design: .default, weight: .medium))
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(active ? VP.accent.opacity(0.1) : .clear)
                .foregroundColor(active ? VP.accent : VP.dim)
                .cornerRadius(14)
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(active ? VP.accent : VP.border))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func leaderboardRow(user: VPUser, idx: Int, canExpand: Bool = true) -> some View {
        let isExpanded = canExpand && expanded == user.id
        let topUser = users.first
        let displayScore = displayScores[user.id] ?? (user.verityScore ?? 0)
        let topScore = topUser.map { displayScores[$0.id] ?? ($0.verityScore ?? 0) } ?? 0

        VStack(spacing: 0) {
            // Whole row is tappable for profile nav (ground rule: single
            // dual-purpose tap target fixed — tap row = profile; tap chevron = expand stats).
            NavigationLink {
                if let uname = user.username {
                    PublicProfileView(username: uname)
                        .environmentObject(auth)
                } else {
                    EmptyView()
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
                            Text(user.username ?? "user")
                                .font(.system(.subheadline, design: .default, weight: .semibold))
                                .foregroundColor(VP.text)
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
                    if canExpand {
                        Button {
                            withAnimation(.easeInOut(duration: 0.15)) {
                                expanded = isExpanded ? nil : user.id
                            }
                        } label: {
                            Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(VP.dim)
                                .frame(width: 28, height: 28)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        // Blocks the NavigationLink from firing when the
                        // chevron is tapped — the single-responsibility tap
                        // target rule the audit called out.
                        .simultaneousGesture(TapGesture().onEnded {})
                        .accessibilityLabel(isExpanded ? "Hide stats" : "Show stats")
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(isExpanded ? VP.card : VP.bg)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(user.username == nil)

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

    // MARK: - Permissions

    private func refreshPermissions() async {
        await PermissionService.shared.refreshIfStale()
        canViewFull = await PermissionService.shared.has("leaderboard.view")
        canViewCategories = await PermissionService.shared.has("leaderboard.category.view")
        canFilterTime = await PermissionService.shared.has("leaderboard.filter.time")
    }

    // MARK: - Data loading

    private func loadCategories() async {
        do {
            let all: [VPCategory] = try await client.from("categories")
                .select()
                .eq("is_active", value: true)
                .eq("is_kids_safe", value: false)
                .is("deleted_at", value: nil)
                .order("sort_order", ascending: true)
                .execute().value
            // Only top-level categories render as pills. Subcategory filtering
            // is disabled — see header note.
            categories = all.filter { $0.categoryId == nil }
        } catch {
            Log.d("Load categories error:", error)
        }
    }

    private func loadLeaderboard() async {
        displayScores = [:]
        let anonLimit = 3
        let fullLimit = 50
        let limit = isLoggedIn ? fullLimit : anonLimit

        if let catId = activeCategory, canViewCategories {
            await loadByCategory(catId: catId, limit: limit)
        } else {
            switch activeTab {
            case .topVerifiers:
                if activePeriod == .allTime || !canFilterTime {
                    await loadTopVerifiers(limit: limit)
                } else {
                    await loadPeriodLeaderboard(period: activePeriod, limit: limit)
                }
            case .topReaders:   await loadTopReaders(limit: limit)
            case .risingStars:  await loadRisingStars(limit: limit)
            case .weekly:       await loadPeriodLeaderboard(period: .thisWeek, limit: limit)
            }
        }
        loading = false
    }

    /// Privacy-filter chain applied to every `users` query. Keeping the
    /// chain in one helper prevents the "missing one of four" defect that
    /// the audit flagged across all five loaders.
    private func usersQueryBase() -> PostgrestFilterBuilder {
        client.from("users")
            .select(USER_COLUMNS)
            .eq("email_verified", value: true)
            .eq("is_banned", value: false)
            .eq("show_on_leaderboard", value: true)
            .is("frozen_at", value: nil)
    }

    private func loadByCategory(catId: String, limit: Int) async {
        do {
            struct CS: Decodable { let user_id: String; let score: Int }
            let rows: [CS] = try await client.from("category_scores")
                .select("user_id, score")
                .eq("category_id", value: catId)
                .order("score", ascending: false)
                .limit(limit)
                .execute().value
            let ids = rows.map { $0.user_id }
            if ids.isEmpty { users = []; return }
            let fetched: [VPUser] = try await usersQueryBase()
                .in("id", values: ids)
                .execute().value
            let map = Dictionary(uniqueKeysWithValues: fetched.map { ($0.id, $0) })
            // Preserve score ordering from category_scores; drop users that
            // got filtered out by the privacy predicates on the second query.
            users = rows.compactMap { r in map[r.user_id] }
            displayScores = Dictionary(uniqueKeysWithValues: rows.compactMap { r in
                map[r.user_id] != nil ? (r.user_id, r.score) : nil
            })
        } catch {
            Log.d("Category leaderboard error:", error)
        }
    }

    private func loadTopVerifiers(limit: Int) async {
        do {
            let data: [VPUser] = try await usersQueryBase()
                .order("verity_score", ascending: false)
                .limit(limit)
                .execute().value
            users = data
            displayScores = Dictionary(uniqueKeysWithValues: data.map { ($0.id, $0.verityScore ?? 0) })
        } catch {
            Log.d("Top verifiers error:", error)
        }
    }

    private func loadTopReaders(limit: Int) async {
        do {
            let data: [VPUser] = try await usersQueryBase()
                .order("articles_read_count", ascending: false)
                .limit(limit)
                .execute().value
            users = data
            displayScores = Dictionary(uniqueKeysWithValues: data.map { ($0.id, $0.articlesReadCount ?? 0) })
        } catch {
            Log.d("Top readers error:", error)
        }
    }

    private func loadRisingStars(limit: Int) async {
        do {
            // Rolling 30-day window for "new" users, ranked by verity_score.
            let since = Date().addingTimeInterval(-30 * 86400)
            let sinceStr = ISO8601DateFormatter().string(from: since)
            let data: [VPUser] = try await usersQueryBase()
                .gte("created_at", value: sinceStr)
                .order("verity_score", ascending: false)
                .limit(limit)
                .execute().value
            users = data
            displayScores = Dictionary(uniqueKeysWithValues: data.map { ($0.id, $0.verityScore ?? 0) })
        } catch {
            Log.d("Rising stars error:", error)
        }
    }

    /// Rolling weekly/monthly aggregation delegated to
    /// `leaderboard_period_counts` (SECURITY DEFINER, schema/142) so the
    /// aggregation doesn't collapse to caller-only rows under RLS on
    /// `reading_log`. Rolling windows (-7d / -30d) match the web resolver.
    private func loadPeriodLeaderboard(period: LeaderboardPeriod, limit: Int) async {
        // Rolling-cutoff lives in `LeaderboardPeriod.since(date:)` so iOS +
        // web stay in lockstep. `.allTime` returns nil; the only callers
        // are `.thisWeek` / `.thisMonth`, so the guard is belt-and-
        // suspenders against future call-site drift.
        guard let since = period.since() else { return }
        let sinceStr = ISO8601DateFormatter().string(from: since)

        struct CountsRow: Decodable { let user_id: String; let reads_count: Int }
        struct RpcArgs: Encodable { let p_since: String; let p_limit: Int }

        do {
            let counts: [CountsRow] = try await client
                .rpc("leaderboard_period_counts", params: RpcArgs(p_since: sinceStr, p_limit: limit))
                .execute()
                .value
            let orderedIds = counts.map { $0.user_id }
            if orderedIds.isEmpty { users = []; return }
            let fetched: [VPUser] = try await usersQueryBase()
                .in("id", values: orderedIds)
                .execute().value
            let map = Dictionary(uniqueKeysWithValues: fetched.map { ($0.id, $0) })
            users = orderedIds.compactMap { map[$0] }
            displayScores = Dictionary(uniqueKeysWithValues: counts.compactMap { c in
                map[c.user_id] != nil ? (c.user_id, c.reads_count) : nil
            })
        } catch {
            Log.d("Period leaderboard error:", error)
        }
    }
}

// MARK: - Typed tab/period enums

private enum TabKey: String, CaseIterable, Hashable {
    case topVerifiers = "top_verifiers"
    case topReaders = "top_readers"
    case risingStars = "rising_stars"
    case weekly = "weekly"

    var label: String {
        switch self {
        case .topVerifiers: return "Top Verifiers"
        case .topReaders:   return "Top Readers"
        case .risingStars:  return "Rising Stars"
        case .weekly:       return "Weekly"
        }
    }
}

// `LeaderboardPeriod` is declared in `LeaderboardPeriod.swift` so the iOS
// + web split share the same canonical set + rolling-cutoff helper. Local
// `label` accessor preserves the call-site shape this view uses.

extension LeaderboardPeriod {
    var label: String { rawValue }
}

// MARK: - Column list

/// Columns pulled from `public.users` on every leaderboard query. Stays
/// inside the anon GRANT list the 092b RLS lockdown enforces; adding a
/// column here without a matching GRANT update will 403 the fetch.
private let USER_COLUMNS = "id, username, verity_score, avatar_color, avatar_url, is_verified_public_figure, articles_read_count, quizzes_completed_count, comment_count, streak_current, created_at"
