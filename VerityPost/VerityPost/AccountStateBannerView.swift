import SwiftUI
import StoreKit

// Port of web/src/app/profile/_components/AccountStateBanner.tsx.
// Renders the highest-severity AccountState as a chrome-level banner
// above the tab bar. Severity-ordered list comes from deriveAccountStates(user:).
// Only renders one banner (the highest-severity non-ok state).

struct AccountStateBannerView: View {
    let user: VPUser
    @EnvironmentObject var auth: AuthViewModel
    @State private var safariURL: URL?
    @State private var showSafari = false

    private var topState: AccountState? {
        let states = deriveAccountStates(user: user)
        guard let first = states.first, case .ok = first else {
            if case .ok = states.first { return nil }
            return states.first
        }
        return nil
    }

    var body: some View {
        if let state = resolvedState {
            banner(for: state)
        }
    }

    private var resolvedState: AccountState? {
        let states = deriveAccountStates(user: user)
        guard let first = states.first else { return nil }
        if case .ok = first { return nil }
        return first
    }

    @ViewBuilder
    private func banner(for state: AccountState) -> some View {
        switch state {
        case .banned(let reason):
            AccountBannerRow(
                glyph: "nosign",
                sfSymbol: true,
                title: "Account suspended",
                body: reason.map { "Reason: \($0). Contact support if you believe this is a mistake." }
                    ?? "Your account has been suspended. Contact support if you believe this is a mistake.",
                ctaLabel: "Contact support",
                tone: .danger
            ) {
                openURL(URL(string: "https://veritypost.com/contact"))
            }

        case .verifyLocked:
            AccountBannerRow(
                glyph: "envelope.badge.shield.half.filled",
                sfSymbol: true,
                title: "Verify your email to continue",
                body: "For your security, the rest of the app is locked until you verify the email on your account.",
                ctaLabel: "Resend verification email",
                tone: .warning
            ) {
                Task { _ = await auth.resendVerificationEmail() }
            }

        case .unverifiedEmail(let email):
            AccountBannerRow(
                glyph: "envelope.open",
                sfSymbol: true,
                title: "Confirm your email",
                body: email.map { "We sent a confirmation link to \($0). Check your inbox to unlock the full app." }
                    ?? "We sent a confirmation link to your inbox. Check it to unlock the full app.",
                ctaLabel: "Resend link",
                tone: .info
            ) {
                Task { _ = await auth.resendVerificationEmail() }
            }

        case .deletionScheduled(let scheduledFor):
            AccountBannerRow(
                glyph: "trash",
                sfSymbol: true,
                title: "Account deletion is scheduled",
                body: scheduledFor.map { "Your account will be permanently deleted on \(formatDate($0)). You can cancel any time before then." }
                    ?? "Your account is scheduled for deletion. You can cancel any time.",
                ctaLabel: "Cancel deletion",
                tone: .warning
            ) {
                Task { await cancelDeletion() }
            }

        case .planGrace(let endsAt, let provider):
            AccountBannerRow(
                glyph: "clock",
                sfSymbol: true,
                title: "Payment issue — please update",
                body: endsAt.map { "Your last payment failed. Premium features stay active until \(formatDate($0)) — please update your card before then." }
                    ?? "Your last payment failed. Update your card to keep premium features active.",
                ctaLabel: "Update payment",
                tone: .warning
            ) {
                handlePlanGraceCTA(provider: provider)
            }

        case .muted(let until):
            AccountBannerRow(
                glyph: "speaker.slash",
                sfSymbol: true,
                title: "Posting is paused",
                body: until.map { "You can read but can't comment, message, or post until \(formatTime($0))." }
                    ?? "You can read but can't comment, message, or post for now. This usually lifts within 24 hours.",
                ctaLabel: nil,
                tone: .warning,
                action: nil
            )

        case .ok:
            EmptyView()
        }
    }

    private func handlePlanGraceCTA(provider: String?) {
        if provider == "stripe" {
            openURL(SupabaseManager.shared.siteURL.appendingPathComponent("profile/settings/billing"))
        } else {
            // apple, nil, or any unknown provider → default to App Store on iOS
            Task {
                if let windowScene = UIApplication.shared.connectedScenes
                    .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene {
                    try? await AppStore.showManageSubscriptions(in: windowScene)
                }
            }
        }
    }

    private func cancelDeletion() async {
        guard let session = try? await SupabaseManager.shared.client.auth.session else { return }
        let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/account/cancel-deletion")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        _ = try? await URLSession.shared.data(for: req)
        await auth.retryLoadUser()
    }

    private func openURL(_ url: URL?) {
        guard let url else { return }
        UIApplication.shared.open(url)
    }
}

// MARK: - Shared row component

private enum BannerTone { case danger, warning, info }

private struct AccountBannerRow: View {
    let glyph: String
    let sfSymbol: Bool
    let title: String
    let message: String
    let ctaLabel: String?
    let tone: BannerTone
    let action: (() -> Void)?

    init(
        glyph: String,
        sfSymbol: Bool = true,
        title: String,
        body: String,
        ctaLabel: String?,
        tone: BannerTone,
        action: (() -> Void)? = nil
    ) {
        self.glyph = glyph
        self.sfSymbol = sfSymbol
        self.title = title
        self.message = body
        self.ctaLabel = ctaLabel
        self.tone = tone
        self.action = action
    }

    private var ink: Color {
        switch tone {
        case .danger:  return VP.danger
        case .warning: return Color(red: 0.6, green: 0.4, blue: 0.0)
        case .info:    return Color(red: 0.1, green: 0.4, blue: 0.8)
        }
    }

    private var bg: Color { ink.opacity(0.08) }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: glyph)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(ink)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(.footnote, design: .default, weight: .semibold))
                    .foregroundColor(ink)
                Text(message)
                    .font(.caption)
                    .foregroundColor(ink.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
                if let label = ctaLabel, let action {
                    Button(action: action) {
                        Text(label)
                            .font(.system(.caption, design: .default, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(ink)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 4)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(bg)
        .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(ink.opacity(0.32)))
        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
    }
}

// MARK: - Date helpers

private func formatDate(_ iso: String) -> String {
    guard let date = ISO8601DateFormatter().date(from: iso) else { return iso }
    let f = DateFormatter()
    f.dateStyle = .medium
    f.timeStyle = .none
    return f.string(from: date)
}

private func formatTime(_ iso: String) -> String {
    guard let date = ISO8601DateFormatter().date(from: iso) else { return iso }
    let f = DateFormatter()
    f.dateStyle = .short
    f.timeStyle = .short
    return f.string(from: date)
}
