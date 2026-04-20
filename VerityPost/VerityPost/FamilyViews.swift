import SwiftUI
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
// @feature-verified family_admin 2026-04-18

/// Family dashboard showing per-kid stats, family leaderboard,
/// shared achievements, and weekly report. Gated via `settings.family.view`
/// permission (server-side plan→permission mapping lives in
/// `compute_effective_perms`; admin toggles reflect without client changes).
struct FamilyDashboardView: View {
    @EnvironmentObject var auth: AuthViewModel
    @StateObject private var perms = PermissionStore.shared
    private let client = SupabaseManager.shared.client

    @State private var kids: [KidProfile] = []
    @State private var loading = true
    @State private var canViewFamily: Bool = false

    var body: some View {
        ScrollView {
            if !canViewFamily {
                UpgradePromptInline(
                    feature: "Family Dashboard",
                    detail: "The family dashboard is available to Verity Family subscribers."
                )
            } else if loading {
                ProgressView().padding(.top, 40)
            } else {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Your kids")
                        .font(.system(.headline, design: .default, weight: .bold))
                        .foregroundColor(VP.text)

                    if kids.isEmpty {
                        Text("No kid profiles set up yet.")
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                    } else {
                        ForEach(kids) { kid in
                            HStack(spacing: 8) {
                                NavigationLink {
                                    KidDashboardView(kid: kid).environmentObject(auth)
                                } label: { kidCard(kid) }
                                .buttonStyle(.plain)

                                KidsAppLauncherButton(kid: kid)
                            }
                        }
                    }

                    NavigationLink {
                        FamilyLeaderboardView()
                            .environmentObject(auth)
                    } label: {
                        HStack {
                            Text("Family leaderboard")
                                .font(.system(.subheadline, design: .default, weight: .semibold))
                                .foregroundColor(VP.text)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundColor(VP.dim)
                        }
                        .padding(14)
                        .background(VP.card)
                        .cornerRadius(10)
                    }
                    .buttonStyle(.plain)

                    NavigationLink {
                        FamilyAchievementsView()
                            .environmentObject(auth)
                    } label: {
                        HStack {
                            Text("Shared achievements")
                                .font(.system(.subheadline, design: .default, weight: .semibold))
                                .foregroundColor(VP.text)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundColor(VP.dim)
                        }
                        .padding(14)
                        .background(VP.card)
                        .cornerRadius(10)
                    }
                    .buttonStyle(.plain)
                }
                .padding(20)
            }
        }
        .background(VP.bg)
        .navigationTitle("Family")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .task(id: perms.changeToken) {
            canViewFamily = await PermissionService.shared.has("settings.family.view")
        }
    }

    private func kidCard(_ kid: KidProfile) -> some View {
        HStack(spacing: 12) {
            Circle()
                .fill(Color(hex: kid.avatarColor ?? "999999"))
                .frame(width: 40, height: 40)
                .overlay(
                    Text(String(kid.safeName.prefix(1)).uppercased())
                        .font(.system(.headline, design: .default, weight: .bold))
                        .foregroundColor(.white)
                )
            VStack(alignment: .leading, spacing: 2) {
                Text(kid.safeName)
                    .font(.system(.subheadline, design: .default, weight: .semibold))
                    .foregroundColor(VP.text)
                Text(kid.ageLabel)
                    .font(.caption)
                    .foregroundColor(VP.dim)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(VP.dim)
        }
        .padding(14)
        .background(VP.card)
        .cornerRadius(10)
    }

    private func load() async {
        guard let userId = auth.currentUser?.id else { loading = false; return }
        do {
            let rows: [KidProfile] = try await client.from("kid_profiles")
                .select()
                .eq("parent_user_id", value: userId)
                .order("created_at", ascending: true)
                .execute().value
            await MainActor.run { kids = rows; loading = false }
        } catch {
            await MainActor.run { loading = false }
        }
    }
}

// MARK: - Per-kid dashboard

struct KidDashboardView: View {
    let kid: KidProfile
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    @State private var readCount = 0
    @State private var quizCount = 0
    @State private var streak = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 12) {
                    Circle()
                        .fill(Color(hex: kid.avatarColor ?? "999999"))
                        .frame(width: 56, height: 56)
                        .overlay(
                            Text(String(kid.safeName.prefix(1)).uppercased())
                                .font(.system(.title2, design: .default, weight: .bold))
                                .foregroundColor(.white)
                        )
                    VStack(alignment: .leading, spacing: 4) {
                        Text(kid.safeName)
                            .font(.system(.title3, design: .default, weight: .bold))
                            .foregroundColor(VP.text)
                        Text(kid.ageLabel)
                            .font(.caption)
                            .foregroundColor(VP.dim)
                    }
                }

                HStack(spacing: 16) {
                    statBlock("Articles", value: readCount)
                    statBlock("Quizzes", value: quizCount)
                    statBlock("Streak", value: streak)
                }
            }
            .padding(20)
        }
        .background(VP.bg)
        .navigationTitle(kid.safeName)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func statBlock(_ label: String, value: Int) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(value)")
                .font(.system(.title3, design: .default, weight: .bold))
                .foregroundColor(VP.text)
            Text(label)
                .font(.caption)
                .foregroundColor(VP.dim)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(VP.card)
        .cornerRadius(10)
    }

    private func load() async {
        do {
            // Prompt 11 sweep: v2 has no `kid_reading_log` table; kid reads
            // live in `reading_log.kid_profile_id`. `quiz_attempts` uses the
            // same column (not `kid_id`).
            struct Row: Decodable { let id: String }
            let reads: [Row] = (try? await client.from("reading_log")
                .select("id")
                .eq("kid_profile_id", value: kid.id)
                .execute().value) ?? []
            readCount = reads.count
            struct QRow: Decodable { let attempt_number: Int?; let is_correct: Bool?; let article_id: String? }
            let quizzes: [QRow] = (try? await client.from("quiz_attempts")
                .select("attempt_number, is_correct, article_id")
                .eq("kid_profile_id", value: kid.id)
                .execute().value) ?? []
            var grouped: [String: (correct: Int, total: Int)] = [:]
            for row in quizzes {
                let k = "\(row.article_id ?? "")#\(row.attempt_number ?? 0)"
                var e = grouped[k] ?? (0, 0)
                e.total += 1
                if row.is_correct == true { e.correct += 1 }
                grouped[k] = e
            }
            quizCount = grouped.values.filter { $0.total > 0 && ($0.correct * 10 / max($0.total, 1)) >= 7 }.count
        } catch {}
    }
}

// MARK: - Family leaderboard

struct FamilyLeaderboardView: View {
    @EnvironmentObject var auth: AuthViewModel

    @State private var entries: [FamilyLeaderboardEntry] = []
    @State private var loading = true

    var body: some View {
        ScrollView {
            if loading {
                ProgressView().padding(.top, 40)
            } else if entries.isEmpty {
                Text("No data yet.")
                    .font(.footnote).foregroundColor(VP.dim)
                    .padding(.top, 40)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(entries.enumerated()), id: \.element.name) { idx, e in
                        HStack(spacing: 12) {
                            Text("\(idx + 1)")
                                .font(.system(.subheadline, design: .default, weight: .bold))
                                .foregroundColor(VP.dim)
                                .frame(width: 24)
                            Text(e.name)
                                .font(.system(.subheadline, design: .default, weight: .semibold))
                                .foregroundColor(VP.text)
                            Spacer()
                            Text("\(e.score)")
                                .font(.system(.headline, design: .default, weight: .bold))
                                .foregroundColor(VP.accent)
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 12)
                        Divider().background(VP.border)
                    }
                }
            }
        }
        .background(VP.bg)
        .navigationTitle("Family leaderboard")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/family/leaderboard", relativeTo: site) else {
            await MainActor.run { loading = false }
            return
        }
        let client = SupabaseManager.shared.client
        guard let session = try? await client.auth.session else {
            await MainActor.run { loading = false }
            return
        }
        var req = URLRequest(url: url)
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        do {
            let (data, _) = try await URLSession.shared.data(for: req)
            let list = (try? JSONDecoder().decode([FamilyLeaderboardEntry].self, from: data)) ?? []
            await MainActor.run { entries = list; loading = false }
        } catch {
            await MainActor.run { loading = false }
        }
    }
}

struct FamilyLeaderboardEntry: Codable {
    let name: String
    let score: Int
}

// MARK: - Family achievements

struct FamilyAchievementsView: View {
    @EnvironmentObject var auth: AuthViewModel
    @State private var achievements: [FamilyAchievementEntry] = []
    @State private var loading = true

    var body: some View {
        ScrollView {
            if loading {
                ProgressView().padding(.top, 40)
            } else if achievements.isEmpty {
                Text("No shared achievements yet. Keep reading as a family.")
                    .font(.footnote)
                    .foregroundColor(VP.dim)
                    .multilineTextAlignment(.center)
                    .padding(.top, 40)
                    .padding(.horizontal, 40)
            } else {
                VStack(spacing: 0) {
                    ForEach(achievements) { a in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(a.name)
                                .font(.system(.subheadline, design: .default, weight: .semibold))
                                .foregroundColor(VP.text)
                            if let desc = a.description {
                                Text(desc)
                                    .font(.caption)
                                    .foregroundColor(VP.dim)
                            }
                            if let date = a.earnedAt {
                                Text("Earned \(date)")
                                    .font(.caption2)
                                    .foregroundColor(VP.accent)
                            }
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Divider().background(VP.border)
                    }
                }
            }
        }
        .background(VP.bg)
        .navigationTitle("Shared achievements")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/family/achievements", relativeTo: site) else {
            await MainActor.run { loading = false }
            return
        }
        let client = SupabaseManager.shared.client
        guard let session = try? await client.auth.session else {
            await MainActor.run { loading = false }
            return
        }
        var req = URLRequest(url: url)
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        do {
            let (data, _) = try await URLSession.shared.data(for: req)
            let list = (try? JSONDecoder().decode([FamilyAchievementEntry].self, from: data)) ?? []
            await MainActor.run { achievements = list; loading = false }
        } catch {
            await MainActor.run { loading = false }
        }
    }
}

struct FamilyAchievementEntry: Codable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let earnedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, description
        case earnedAt = "earned_at"
    }
}
