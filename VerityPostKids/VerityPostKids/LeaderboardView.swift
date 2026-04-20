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
    @State private var selectedCategory: VPCategory? = nil
    @State private var loading: Bool = false
    @State private var loadError: String? = nil

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
                        ForEach(Array(entries.enumerated()), id: \.element.id) { idx, entry in
                            LeaderRow(
                                rank: idx + 1,
                                entry: entry,
                                accent: K.teal,
                                isSelf: entry.id == auth.kid?.id
                            )
                        }
                    }
                }

                if let loadError {
                    Text(loadError)
                        .font(.system(size: 12, design: .rounded))
                        .foregroundStyle(K.coralDark)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 20)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 24)
            .padding(.bottom, 40)
        }
        .background(K.bg.ignoresSafeArea())
        .task { await load() }
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
                        .font(.system(size: 13, weight: .bold, design: .rounded))
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
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(state.categories) { cat in
                    let active = selectedCategory?.name == cat.name
                    Button {
                        withAnimation(K.springSnap) {
                            // Use the DB-backed VPCategory fetched elsewhere;
                            // for MVP we wrap the local KidCategory.
                        }
                    } label: {
                        Text(cat.name)
                            .font(.system(size: 12, weight: .semibold, design: .rounded))
                            .foregroundStyle(active ? .white : K.text)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(active ? cat.color : K.card)
                            .clipShape(Capsule())
                            .overlay(Capsule().strokeBorder(active ? cat.color : K.border, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "trophy")
                .font(.system(size: 36, weight: .bold))
                .foregroundStyle(K.dim)
            Text(scope == .global ? "No one's on the global leaderboard yet." : "No one here yet.")
                .font(.system(size: 14, weight: .semibold, design: .rounded))
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
            loadError = "Couldn't load global leaderboard"
        }
    }

    private func loadFamily() async {
        // Family leaderboard uses the /api/family/leaderboard endpoint
        // (uses the family_members RPC internally, requires auth).
        // For MVP: fallback to filtering kid_profiles by shared parent_user_id
        // reachable through the paired kid's own row.
        guard let kidId = auth.kid?.id else {
            entries = []
            return
        }

        struct KidRow: Decodable {
            let id: String
            let display_name: String?
            let verity_score: Int?
            let parent_user_id: String
        }

        do {
            // Fetch own row to learn parent_user_id
            let ownRow: KidRow = try await client
                .from("kid_profiles")
                .select("id, display_name, verity_score, parent_user_id")
                .eq("id", value: kidId)
                .single()
                .execute()
                .value

            // Fetch siblings (same parent_user_id). RLS will only return rows
            // visible under current JWT — for kid JWT that's just ownRow, so
            // family is effectively a single-kid "leaderboard" unless the
            // backend exposes a family-scoped RPC.
            let family: [KidRow] = try await client
                .from("kid_profiles")
                .select("id, display_name, verity_score, parent_user_id")
                .eq("parent_user_id", value: ownRow.parent_user_id)
                .order("verity_score", ascending: false)
                .execute()
                .value

            let rows = family.isEmpty ? [ownRow] : family
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
        // Category scores — kid JWT can see its own row (via migration 097).
        // Public-kid category leaderboard requires a server-side aggregation
        // RPC that hasn't been built yet; for now, show only the kid's own
        // score in the selected category.
        guard let kidId = auth.kid?.id, let cat = selectedCategory else {
            entries = []
            return
        }

        struct Row: Decodable {
            let kid_profile_id: String
            let score: Int?
        }

        do {
            let rows: [Row] = try await client
                .from("category_scores")
                .select("kid_profile_id, score")
                .eq("category_id", value: cat.id)
                .order("score", ascending: false)
                .limit(50)
                .execute()
                .value

            let kidName = auth.kid?.name ?? "You"
            self.entries = rows.enumerated().compactMap { i, r in
                // Only our own row will return; unknown others under RLS.
                guard r.kid_profile_id == kidId else { return nil }
                return LeaderboardEntry(
                    id: r.kid_profile_id,
                    name: kidName,
                    score: r.score ?? 0,
                    rank: i + 1
                )
            }
        } catch {
            entries = []
            loadError = "Couldn't load category leaderboard"
        }
    }
}
