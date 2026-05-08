import SwiftUI
import Supabase
import UIKit

// Kid profile: stats + earned badges + account control (unpair).
// Port of adult KidProfileView, stripped of parent-surface links.

struct ProfileView: View {
    @EnvironmentObject private var auth: KidsAuth
    @EnvironmentObject private var state: KidsAppState

    // K8: URL(string:) of a constant literal that we control and know is
    // valid can't realistically fail, but force-unwrapping invites a future
    // refactor from crashing if the string ever gets mutated into something
    // malformed (e.g. DB-driven in a later release). force-literal `apex`
    // remains the only place a `!` is safe, since the string is hardcoded
    // to a real RFC 3986 URL with no interpolation.
    private static let fallbackLegalURL = URL(string: "https://veritypost.com")!

    @State private var badges: [UserAchievement] = []
    @State private var loading: Bool = true
    @State private var loadError: String? = nil
    // Parent-mode PIN gates. Unpair is destructive → PIN + email OTP via
    // SensitiveActionView. Legal links are non-destructive → PIN-only via
    // .parentMode modifier. Replaces the old math-question parentalGate.
    @State private var showUnpairSensitive: Bool = false
    @State private var showLegalParentGate: Bool = false
    @State private var pendingLegalURL: URL? = nil

    private var client: SupabaseClient { SupabaseKidsClient.shared.client }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                if let banner = auth.unpairBanner {
                    unpairBannerView(banner)
                }
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
        // Unpair: destructive → PIN + email OTP via SensitiveActionView.
        .sensitiveAction(
            isPresented: $showUnpairSensitive,
            actionKey: "unpair",
            label: "Unpair this device",
            description: "This signs the kid out and forgets this device.",
            onConfirmed: { confirmationToken in
                await auth.signOutAfterServerRevoke(confirmationToken: confirmationToken)
            }
        )
        // Legal links: PIN-only — viewing Privacy/Terms isn't destructive,
        // but leaving the app still requires parent approval per Apple's
        // Kids Category guidance.
        .parentMode(isPresented: $showLegalParentGate) {
            if let url = pendingLegalURL {
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
            }
            pendingLegalURL = nil
        }
    }

    // MARK: Unpair banner — surfaced when the destructive-route flow fails
    // in a way that doesn't justify clearing local state (parent session
    // expired, network, throttle). Tap to dismiss; the next attempt clears.

    private func unpairBannerView(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.circle.fill")
                .font(.scaledSystem(size: 16, weight: .bold))
                .foregroundStyle(K.coralDark)
            Text(text)
                .font(.scaledSystem(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(K.text)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Button {
                auth.unpairBanner = nil
            } label: {
                Image(systemName: "xmark")
                    .font(.scaledSystem(size: 12, weight: .bold))
                    .foregroundStyle(K.dim)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dismiss")
        }
        .padding(12)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(K.coralDark.opacity(0.4), lineWidth: 1)
        )
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
                // K8: drop force-unwraps. If the literal ever drifts to an
                // invalid URL, a non-optional fallback keeps the row visible
                // (tap falls back to the apex domain) instead of crashing.
                aboutRow(label: "Privacy Policy",
                         url: URL(string: "https://veritypost.com/privacy") ?? Self.fallbackLegalURL)
                Divider()
                    .background(K.border)
                aboutRow(label: "Terms of Service",
                         url: URL(string: "https://veritypost.com/terms") ?? Self.fallbackLegalURL)
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
            showLegalParentGate = true
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

            Button { showUnpairSensitive = true } label: {
                Text("Unpair this device")
                    .font(.scaledSystem(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(K.dim)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)
                    .frame(minHeight: 44)
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
            StatBubble(value: state.verityScore, label: "Score",         color: K.teal)
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
                            .background(K.tealDark)
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
