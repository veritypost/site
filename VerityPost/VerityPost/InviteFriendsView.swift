import SwiftUI
import Supabase
import UIKit

// Mirror of web/src/components/profile/InviteFriendsCard.tsx for iOS.
// Loads /api/referrals/me, renders the user's two referral slugs with
// per-slot copy buttons. Counts only — no PII of redeemers, per the
// design review's privacy / harassment-vector mitigation.
//
// Uses the redesign palette (VP.brand, VP.ink, VP.surfaceRaised, etc.).
// Mounted inside SettingsView only when email_verified=true and the
// account is not frozen — gating handled by the hub row, not here.

struct InviteFriendsView: View {
    private let client = SupabaseManager.shared.client

    private struct SlugRow: Decodable, Identifiable {
        let id: String
        let slot: Int
        let code: String
        let url: String
        let active: Bool
        let redemption_count: Int
        let max_uses: Int?
    }

    private struct Response: Decodable {
        let slugs: [SlugRow]
    }

    private enum LoadState {
        case loading
        case ok(slugs: [SlugRow])
        case rateLimited(retryAfter: Int)
        case error(message: String)
    }

    @State private var state: LoadState = .loading
    @State private var copiedSlot: Int? = nil
    @State private var copyTimer: Task<Void, Never>? = nil

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VP.Spacing.s4) {
                header
                content
            }
            .padding(VP.Spacing.s4)
        }
        .background(VP.surface.ignoresSafeArea())
        .navigationTitle("Invite friends")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .onDisappear {
            // Cancel the in-flight copy-reset timer so its trailing
            // `MainActor.run` doesn't fire after the view's @State has
            // been torn down (avoids the "Modifying state during view
            // update" purple warning on rapid push/pop).
            copyTimer?.cancel()
            copyTimer = nil
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: VP.Spacing.s2) {
            Text("Invite friends")
                .font(.system(size: VP.Size.xl, weight: .semibold, design: .serif))
                .foregroundColor(VP.ink)
            Text("You have two invite links to share. Each one lets one friend join Verity Post.")
                .font(.system(size: VP.Size.base))
                .foregroundColor(VP.inkMuted)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var content: some View {
        switch state {
        case .loading:
            card { Text("Loading your invite links…").font(.system(size: VP.Size.sm)).foregroundColor(VP.inkMuted) }
        case .rateLimited(let retry):
            card {
                Text("Too many requests right now. Try again in \(retry) seconds.")
                    .font(.system(size: VP.Size.sm))
                    .foregroundColor(VP.inkMuted)
            }
        case .error(let message):
            card {
                Text(message)
                    .font(.system(size: VP.Size.sm))
                    .foregroundColor(VP.danger)
            }
        case .ok(let slugs) where slugs.isEmpty:
            card {
                Text("We couldn't generate your invite links. Pull to refresh.")
                    .font(.system(size: VP.Size.sm))
                    .foregroundColor(VP.inkMuted)
            }
        case .ok(let slugs):
            card {
                VStack(spacing: 0) {
                    ForEach(Array(slugs.enumerated()), id: \.element.id) { idx, s in
                        if idx > 0 {
                            Rectangle().fill(VP.divider).frame(height: 1)
                        }
                        slugRow(s)
                    }
                }
            }
        }
    }

    private func slugRow(_ s: SlugRow) -> some View {
        let exhausted: Bool = {
            if let max = s.max_uses { return s.redemption_count >= max }
            return s.redemption_count > 0
        }()
        let used = !s.active || exhausted
        let friendsLabel = s.redemption_count == 1
            ? "1 friend joined"
            : "\(s.redemption_count) friends joined"

        return HStack(spacing: VP.Spacing.s3) {
            VStack(alignment: .leading, spacing: VP.Spacing.s1) {
                Text("Slot \(s.slot)")
                    .font(.system(size: VP.Size.xs, weight: .semibold))
                    .tracking(0.6)
                    .foregroundColor(VP.inkFaint)
                Text(s.url)
                    .font(.system(size: VP.Size.sm, design: .monospaced))
                    .foregroundColor(used ? VP.inkMuted : VP.ink)
                    .strikethrough(used)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Text(friendsLabel)
                    .font(.system(size: VP.Size.xs))
                    .foregroundColor(VP.inkMuted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                guard !used else { return }
                copy(slot: s.slot, url: s.url)
            } label: {
                Text(copiedSlot == s.slot ? "Copied" : (used ? "Used" : "Copy"))
                    .font(.system(size: VP.Size.sm, weight: .semibold))
                    .foregroundColor(copiedSlot == s.slot ? VP.brandInk : (used ? VP.inkMuted : VP.ink))
                    .frame(minWidth: 76, minHeight: 36)
                    .padding(.horizontal, VP.Spacing.s3)
                    .background(copiedSlot == s.slot ? VP.brand : VP.surfaceRaised)
                    .overlay(
                        RoundedRectangle(cornerRadius: VP.Radius.md, style: .continuous)
                            .stroke(copiedSlot == s.slot ? VP.brand : VP.borderStrong, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: VP.Radius.md, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(used)
            .accessibilityLabel(used ? "Slot \(s.slot) already used" : "Copy slot \(s.slot) invite link")
        }
        .padding(.vertical, VP.Spacing.s3)
    }

    @ViewBuilder
    private func card<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) { content() }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(VP.Spacing.s4)
            .background(VP.surfaceRaised)
            .overlay(
                RoundedRectangle(cornerRadius: VP.Radius.lg, style: .continuous)
                    .stroke(VP.borderSoft, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: VP.Radius.lg, style: .continuous))
            .vpShadowAmbient()
    }

    // MARK: - Data

    private func load() async {
        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/referrals/me", relativeTo: site) else {
            await MainActor.run { state = .error(message: "Configuration error.") }
            return
        }
        do {
            var req = URLRequest(url: url)
            if let session = try? await client.auth.session {
                req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            }
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse else {
                await MainActor.run { state = .error(message: "We couldn't load your invite links. Pull to refresh.") }
                return
            }
            if http.statusCode == 429 {
                let retry = Int(http.value(forHTTPHeaderField: "Retry-After") ?? "60") ?? 60
                await MainActor.run { state = .rateLimited(retryAfter: retry) }
                return
            }
            guard http.statusCode == 200 else {
                await MainActor.run { state = .error(message: "We couldn't load your invite links. Pull to refresh.") }
                return
            }
            let decoded = try JSONDecoder().decode(Response.self, from: data)
            await MainActor.run { state = .ok(slugs: decoded.slugs) }
        } catch {
            await MainActor.run { state = .error(message: "We couldn't load your invite links. Pull to refresh.") }
        }
    }

    // MARK: - Copy + transient feedback

    private func copy(slot: Int, url: String) {
        UIPasteboard.general.string = url
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        copiedSlot = slot
        copyTimer?.cancel()
        copyTimer = Task {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            // Slot-equality guard is sufficient: a second tap reassigns
            // `copiedSlot` to its own slot AND cancels this timer before
            // scheduling a new one, so a stale timer firing won't clobber
            // a fresh slot's state.
            await MainActor.run {
                if copiedSlot == slot { copiedSlot = nil }
            }
        }
    }
}
