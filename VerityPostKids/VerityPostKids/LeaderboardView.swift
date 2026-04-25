import SwiftUI
import Supabase

// Kid leaderboard. Three scopes:
//   - Global: top kids by verity_score (only shown for opted-in kids)
//   - Family: kids in the same family
//   - Category: top by category_scores for a chosen category
//
// Per COPPA: only kids with global_leaderboard_opt_in=true appear in Global.
// Family scope is always available.

enum LeaderboardScope: String, CaseIterable, Identifiable {
    case family, global, category
    var id: String { rawValue }
    var label: String {
        switch self {
        case .family:   return "Family"
        case .global:   return "Global"
        case .category: return "Category"
        }
    }
}

struct LeaderboardView: View {
    @EnvironmentObject private var auth: KidsAuth
    @EnvironmentObject private var state: KidsAppState

    @State private var scope: LeaderboardScope = .family
    @State private var entries: [LeaderboardEntry] = []
    @State private var categoryOptions: [VPCategory] = []
    @State private var selectedCategory: VPCategory? = nil
    @State private var loading: Bool = false
    @State private var loadError: String? = nil
    // K11: when the category RPC returns, these hold the kid's real rank +
    // opt-in pool size so the render path can show "Rank 12 of 38" instead
    // of `i+1` over an RLS-filtered list (which always resolved to 1).
    @State private var categoryRank: Int? = nil
    @State private var categoryTotal: Int = 0

    private var client: SupabaseClient { SupabaseKidsClient.shared.client }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                scopePills
                if scope == .category { categoryPills }

                if loading {
                    ProgressView().padding(.top, 40)
                } else if entries.isEmpty {
                    emptyState
                } else {
                    VStack(spacing: 8) {
                        // K11: prefer the entry's own rank when populated (set
                        // by the category RPC against real opt-in totals). Fall
                        // back to positional index for global + family scopes
                        // where the RLS-visible row set IS the leaderboard.
                        ForEach(Array(entries.enumerated()), id: \.element.id) { idx, entry in
                            LeaderRow(
                                rank: entry.rank ?? (idx + 1),
                                entry: entry,
                                accent: K.teal,
                                isSelf: entry.id == auth.kid?.id
                            )
                        }
                        if scope == .category, let rank = categoryRank, categoryTotal > 0 {
                            Text("Rank \(rank) of \(categoryTotal) kids sharing globally")
                                .font(.scaledSystem(size: 12, weight: .semibold, design: .rounded))
                                .foregroundStyle(K.dim)
                                .padding(.top, 4)
                        }
                    }
                }

                if let loadError {
                    VStack(spacing: 8) {
                        Text(loadError)
                            .font(.scaledSystem(size: 12, design: .rounded))
                            .foregroundStyle(K.coralDark)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 20)
                        Button {
                            Task { await load() }
                        } label: {
                            Text("Retry")
                                .font(.scaledSystem(size: 13, weight: .bold, design: .rounded))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 18)
                                .padding(.vertical, 8)
                                .frame(minHeight: 36)
                                .background(K.teal)
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .disabled(loading)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 24)
            .padding(.bottom, 40)
        }
        .background(K.bg.ignoresSafeArea())
        .task {
            await loadCategoryOptions()
            await load()
        }
        .onChange(of: scope) { _, _ in Task { await load() } }
        .onChange(of: selectedCategory?.id) { _, _ in Task { await load() } }
    }

    // MARK: Scope pills

    private var scopePills: some View {
        HStack(spacing: 8) {
            ForEach(LeaderboardScope.allCases) { s in
                let active = s == scope
                Button {
                    withAnimation(K.springSnap) { scope = s }
                } label: {
                    Text(s.label)
                        .font(.scaledSystem(size: 13, weight: .bold, design: .rounded))
                        .foregroundStyle(active ? .white : K.text)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(active ? K.teal : K.card)
                        .clipShape(Capsule())
                        .overlay(Capsule().strokeBorder(active ? K.teal : K.border, lineWidth: 1.5))
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
    }

    // MARK: Category pills

    private var categoryPills: some View {
        // K13: drive pills from fetched VPCategory list (has the real DB id
        // loadCategory needs). Tap wires selectedCategory — the .onChange
        // modifier triggers a reload. Empty action used to be a no-op comment.
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(categoryOptions) { cat in
                    let active = selectedCategory?.id == cat.id
                    Button {
                        withAnimation(K.springSnap) {
                            selectedCategory = active ? nil : cat
                        }
                    } label: {
                        Text(cat.name)
                            .font(.scaledSystem(size: 12, weight: .semibold, design: .rounded))
                            .foregroundStyle(active ? .white : K.text)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(active ? K.teal : K.card)
                            .clipShape(Capsule())
                            .overlay(Capsule().strokeBorder(active ? K.teal : K.border, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "trophy")
                .font(.scaledSystem(size: 36, weight: .bold))
                .foregroundStyle(K.dim)
            Text(scope == .global ? "No one's on the global leaderboard yet." : "No one here yet.")
                .font(.scaledSystem(size: 14, weight: .semibold, design: .rounded))
                .foregroundStyle(K.dim)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 48)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    // MARK: Load

    private func load() async {
        loading = true
        defer { loading = false }
        loadError = nil

        switch scope {
        case .global:
            await loadGlobal()
        case .family:
            await loadFamily()
        case .category:
            await loadCategory()
        }
    }

    private func loadGlobal() async {
        struct Row: Decodable {
            let id: String
            let display_name: String?
            let verity_score: Int?
        }

        do {
            let rows: [Row] = try await client
                .from("kid_profiles")
                .select("id, display_name, verity_score")
                .eq("global_leaderboard_opt_in", value: true)
                .order("verity_score", ascending: false)
                .limit(50)
                .execute()
                .value

            self.entries = rows.enumerated().map { i, r in
                LeaderboardEntry(
                    id: r.id,
                    name: r.display_name ?? "Reader",
                    score: r.verity_score ?? 0,
                    rank: i + 1
                )
            }
        } catch {
            entries = []
            // K11-scope: loadGlobal keeps positional rank — the RLS policy
            // kid_profiles_select_global_leaderboard_kid_jwt returns ALL
            // opt-in kids, so the sorted list IS the global leaderboard and
            // i+1 is the real rank. Unlike loadCategory (RLS hides sibling
            // rows), no RPC is needed here.
            loadError = "Couldn't load global leaderboard"
        }
    }

    private func loadFamily() async {
        // Ext-W16 — uses the kid_family_leaderboard RPC (schema/172).
        // Kid JWT hides siblings via the kid_profiles base SELECT
        // policy, so the prior fallback path returned a single-row
        // leaderboard even when siblings existed. The new RPC is
        // SECURITY DEFINER and resolves siblings server-side.
        guard let kidId = auth.kid?.id else {
            entries = []
            return
        }

        struct FamilyRow: Decodable {
            let id: String
            let display_name: String?
            let verity_score: Int?
            let is_self: Bool?
        }

        do {
            let rows: [FamilyRow] = try await client
                .rpc("kid_family_leaderboard", params: ["p_kid_profile_id": kidId])
                .execute()
                .value

            self.entries = rows.enumerated().map { i, r in
                LeaderboardEntry(
                    id: r.id,
                    name: r.display_name ?? "Reader",
                    score: r.verity_score ?? 0,
                    rank: i + 1
                )
            }
        } catch {
            entries = []
            loadError = "Couldn't load family leaderboard"
        }
    }

    private func loadCategory() async {
        // K11: ask the server for the kid's real rank + opt-in total. Prior
        // code pulled its own row via RLS-filtered `.order()` and rendered
        // `i+1 = 1`, so every kid saw "rank 1" regardless of true standing.
        // get_kid_category_rank is SECURITY DEFINER + scopes to auth.uid()
        // inside the function, so no other kid's data leaks back.
        categoryRank = nil
        categoryTotal = 0

        guard let kidId = auth.kid?.id, let cat = selectedCategory else {
            entries = []
            return
        }

        struct RankRow: Decodable {
            let rank: Int?
            let score: Int?
            let total: Int?
        }
        struct RankArgs: Encodable { let p_category_id: String }

        do {
            let rows: [RankRow] = try await client
                .rpc("get_kid_category_rank", params: RankArgs(p_category_id: cat.id))
                .execute()
                .value

            let kidName = auth.kid?.name ?? "You"
            if let row = rows.first {
                categoryRank = row.rank
                categoryTotal = row.total ?? 0
                self.entries = [
                    LeaderboardEntry(
                        id: kidId,
                        name: kidName,
                        score: row.score ?? 0,
                        rank: row.rank
                    )
                ]
            } else {
                self.entries = [
                    LeaderboardEntry(id: kidId, name: kidName, score: 0, rank: nil)
                ]
            }
        } catch {
            entries = []
            loadError = "Couldn't load category leaderboard"
        }
    }

    // K13: fetch the kids-safe category list once on appear so the category
    // pills render with the right DB id (the kid-app state.categories only
    // holds display name + slug + color; the pill tap needs category_id for
    // the RPC call in loadCategory).
    private func loadCategoryOptions() async {
        do {
            let rows: [VPCategory] = try await client
                .from("categories")
                .select("id, name, slug, color_hex, icon_name, is_kids_safe, sort_order")
                .eq("is_kids_safe", value: true)
                .order("sort_order", ascending: true)
                .execute()
                .value
            self.categoryOptions = rows
        } catch {
            // Non-fatal — category scope still renders, pills just stay empty
            // until the next app launch. Leaderboard global + family unaffected.
            print("[LeaderboardView] loadCategoryOptions failed:", error)
        }
    }
}
