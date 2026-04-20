import SwiftUI
import Supabase

// Kid profile: stats + earned badges + account control (unpair).
// Port of adult KidProfileView, stripped of parent-surface links.

struct ProfileView: View {
    @EnvironmentObject private var auth: KidsAuth
    @EnvironmentObject private var state: KidsAppState

    @State private var badges: [UserAchievement] = []
    @State private var loading: Bool = true
    @State private var loadError: String? = nil

    private var client: SupabaseClient { SupabaseKidsClient.shared.client }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                header
                statsGrid
                badgesSection
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 40)
        }
        .background(K.bg.ignoresSafeArea())
        .task { await loadBadges() }
    }

    // MARK: Header

    private var header: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(LinearGradient(
                        colors: [K.teal, K.purple],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
                    .frame(width: 80, height: 80)
                Text(String((auth.kid?.name ?? "?").prefix(1)).uppercased())
                    .font(.system(size: 36, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
            }

            Text(auth.kid?.name ?? "Reader")
                .font(.system(size: 22, weight: .black, design: .rounded))
                .foregroundStyle(K.text)

            Button { Task { await auth.signOut() } } label: {
                Text("Unpair this device")
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(K.dim)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)
                    .background(K.card)
                    .clipShape(Capsule())
                    .overlay(Capsule().strokeBorder(K.border, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 12)
    }

    // MARK: Stats grid (2x2)

    private var statsGrid: some View {
        let cols = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
        return LazyVGrid(columns: cols, spacing: 12) {
            StatBubble(value: state.streakDays, label: "Day streak",    color: K.coral)
            StatBubble(value: state.verityScore, label: "Verity score",  color: K.teal)
            StatBubble(value: state.quizzesPassed, label: "Quizzes",      color: K.purple)
            StatBubble(value: badges.count,      label: "Badges",        color: K.gold)
        }
    }

    // MARK: Badges

    private var badgesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Badges")
                    .font(.system(size: 13, weight: .heavy, design: .rounded))
                    .kerning(1)
                    .textCase(.uppercase)
                    .foregroundStyle(K.dim)
                Spacer()
            }

            if loading {
                ProgressView().frame(maxWidth: .infinity, minHeight: 80)
            } else if badges.isEmpty {
                Text("Take quizzes and build streaks to earn your first badge.")
                    .font(.system(size: 13, weight: .medium, design: .rounded))
                    .foregroundStyle(K.dim)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 40)
                    .background(K.card)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .strokeBorder(K.border, lineWidth: 1)
                    )
            } else {
                let cols = [
                    GridItem(.flexible(), spacing: 10),
                    GridItem(.flexible(), spacing: 10),
                    GridItem(.flexible(), spacing: 10)
                ]
                LazyVGrid(columns: cols, spacing: 10) {
                    ForEach(badges) { ua in
                        BadgeTile(achievement: ua, color: colorFor(ua.achievements?.rarity))
                    }
                }
            }

            if let loadError {
                Text(loadError)
                    .font(.system(size: 11, design: .rounded))
                    .foregroundStyle(K.coralDark)
            }
        }
    }

    private func colorFor(_ rarity: String?) -> Color {
        switch rarity?.lowercased() {
        case "legendary": return K.gold
        case "epic":      return K.purple
        case "rare":      return K.teal
        default:          return K.coral
        }
    }

    // MARK: Load

    private func loadBadges() async {
        guard let kidId = auth.kid?.id else { return }
        loading = true
        defer { loading = false }

        do {
            let rows: [UserAchievement] = try await client
                .from("user_achievements")
                .select("id, kid_profile_id, achievement_id, earned_at, achievements(id, key, name, description, icon_name, category, rarity, points_reward, is_kids_eligible)")
                .eq("kid_profile_id", value: kidId)
                .order("earned_at", ascending: false)
                .execute()
                .value
            self.badges = rows
            self.loadError = nil
        } catch {
            self.badges = []
            self.loadError = "Couldn't load badges"
        }
    }
}
