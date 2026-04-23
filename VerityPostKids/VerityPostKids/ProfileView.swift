import SwiftUI
import Supabase
import UIKit

// Kid profile: stats + earned badges + account control (unpair).
// Port of adult KidProfileView, stripped of parent-surface links.

struct ProfileView: View {
    @EnvironmentObject private var auth: KidsAuth
    @EnvironmentObject private var state: KidsAppState

    @State private var badges: [UserAchievement] = []
    @State private var loading: Bool = true
    @State private var loadError: String? = nil
    // T-013 — parental gate before unpair. Unpair is effectively a
    // "log out / forget device" action; COPPA/Kids Category review
    // requires parental verification before a kid can trigger it.
    @State private var showUnpairGate: Bool = false
    // Apple Kids Category review — leaving the app to view Privacy or
    // Terms must go through a parental gate first.
    @State private var showLegalGate: Bool = false
    @State private var pendingLegalURL: URL? = nil

    private var client: SupabaseClient { SupabaseKidsClient.shared.client }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                header
                statsGrid
                badgesSection
                aboutSection
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 40)
        }
        .background(K.bg.ignoresSafeArea())
        .task { await loadBadges() }
        .parentalGate(isPresented: $showUnpairGate) {
            Task { await auth.signOut() }
        }
        .parentalGate(isPresented: $showLegalGate) {
            if let url = pendingLegalURL {
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
            }
            pendingLegalURL = nil
        }
    }

    // MARK: About / Legal — parental-gated outbound links

    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("About")
                .font(.scaledSystem(size: 13, weight: .heavy, design: .rounded))
                .kerning(1)
                .textCase(.uppercase)
                .foregroundStyle(K.dim)

            VStack(spacing: 0) {
                aboutRow(label: "Privacy Policy",
                         url: URL(string: "https://veritypost.com/privacy")!)
                Divider()
                    .background(K.border)
                aboutRow(label: "Terms of Service",
                         url: URL(string: "https://veritypost.com/terms")!)
            }
            .background(K.card)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(K.border, lineWidth: 1)
            )
        }
    }

    private func aboutRow(label: String, url: URL) -> some View {
        Button {
            pendingLegalURL = url
            showLegalGate = true
        } label: {
            HStack {
                Text(label)
                    .font(.scaledSystem(size: 14, weight: .semibold, design: .rounded))
                    .foregroundStyle(K.text)
                Spacer()
                Image(systemName: "arrow.up.right.square")
                    .font(.scaledSystem(size: 13, weight: .bold))
                    .foregroundStyle(K.dim)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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
                    .font(.scaledSystem(size: 36, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
            }

            Text(auth.kid?.name ?? "Reader")
                .font(.scaledSystem(size: 22, weight: .black, design: .rounded))
                .foregroundStyle(K.text)

            Button { showUnpairGate = true } label: {
                Text("Unpair this device")
                    .font(.scaledSystem(size: 12, weight: .semibold, design: .rounded))
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
                    .font(.scaledSystem(size: 13, weight: .heavy, design: .rounded))
                    .kerning(1)
                    .textCase(.uppercase)
                    .foregroundStyle(K.dim)
                Spacer()
            }

            if loading {
                ProgressView().frame(maxWidth: .infinity, minHeight: 80)
            } else if badges.isEmpty {
                Text("Take quizzes and build streaks to earn your first badge.")
                    .font(.scaledSystem(size: 13, weight: .medium, design: .rounded))
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
                VStack(spacing: 8) {
                    Text(loadError)
                        .font(.scaledSystem(size: 11, design: .rounded))
                        .foregroundStyle(K.coralDark)
                        .multilineTextAlignment(.center)
                    Button {
                        Task { await loadBadges() }
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
