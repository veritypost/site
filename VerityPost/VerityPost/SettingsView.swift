import SwiftUI
import Supabase
import UIKit

// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
//
// iOS Settings surface. Mirrors web/src/app/profile/settings/page.tsx
// section tree (Account / Preferences / Privacy & Safety / Billing /
// Expert / About / Danger zone) with iOS-native idioms: flat custom
// top bar (no iOS 26 glass bubble), card-shaped sections, plain VStacks
// — no Form/List/grouped-inset styling. Every subpage follows the same
// card shell + dividers + 44pt tap targets.
//
// All write paths stay on the existing server contracts: update_own_profile
// RPC (profile / metadata merges / dm_read_receipts), /api/expert/apply,
// /api/support, /api/account/delete, /api/users/blocked, Supabase GoTrue
// (email / password / MFA), get_own_login_activity RPC, StoreKit restore.

// MARK: - Shared card chrome

/// Section header above a card.
///
/// Two looks:
///   - Subpages use the legacy compact all-caps header (kept for density
///     inside focused flows like Password / Email / MFA).
///   - The hub opts in to the premium header with an optional tinted-icon
///     tile on the left (set via `icon`).
private struct SettingsSectionHeader: View {
    let title: String
    let tone: Tone
    var icon: String? = nil
    var iconTint: Color? = nil
    enum Tone { case normal, danger }

    var body: some View {
        HStack(spacing: 10) {
            if let icon {
                let tint = iconTint ?? (tone == .danger ? VP.danger : VP.text)
                IconTile(system: icon, tint: tint, size: 26, symbolSize: 13)
            }
            Text(icon == nil ? title.uppercased() : title)
                .font(icon == nil
                      ? .system(size: 11, weight: .heavy)
                      : .system(.callout, design: .default, weight: .bold))
                .tracking(icon == nil ? 0.8 : -0.3)
                .foregroundColor(tone == .danger ? VP.danger : (icon == nil ? VP.dim : VP.text))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.top, icon == nil ? 18 : 22)
        .padding(.bottom, icon == nil ? 8 : 10)
    }
}

/// Tinted-circle SF Symbol tile used beside section headers and inside
/// hub rows. Tint controls both the circle fill (at 12% opacity) and the
/// symbol color (full opacity). Keeps the visual rhythm consistent whether
/// a row is neutral, accent, or destructive.
private struct IconTile: View {
    let system: String
    let tint: Color
    var size: CGFloat = 30
    var symbolSize: CGFloat = 14

    var body: some View {
        ZStack {
            Circle().fill(tint.opacity(0.12))
            Image(systemName: system)
                .font(.system(size: symbolSize, weight: .semibold))
                .foregroundColor(tint)
        }
        .frame(width: size, height: size)
    }
}

/// Card container — 1px VP.border, 12pt corner radius, VP.bg interior.
/// Rows inside are responsible for their own internal dividers.
private struct SettingsCard<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 0) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(VP.bg)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal, 16)
    }
}

/// Chevron row inside a card — destination NavigationLink. 44pt min height,
/// entire row tappable, hairline separator baked in when `showDivider`.
private struct SettingsRowLink<Destination: View>: View {
    let title: String
    let subtitle: String?
    var showDivider: Bool = true
    @ViewBuilder let destination: () -> Destination

    init(_ title: String,
         subtitle: String? = nil,
         showDivider: Bool = true,
         @ViewBuilder destination: @escaping () -> Destination) {
        self.title = title
        self.subtitle = subtitle
        self.showDivider = showDivider
        self.destination = destination
    }

    var body: some View {
        NavigationLink(destination: destination()) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15, weight: .regular))
                        .foregroundColor(VP.text)
                    if let subtitle {
                        Text(subtitle)
                            .font(.caption)
                            .foregroundColor(VP.dim)
                    }
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(VP.muted)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .overlay(alignment: .bottom) {
                if showDivider {
                    Rectangle().fill(VP.border.opacity(0.6)).frame(height: 1).padding(.leading, 16)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

/// External link row (same chrome as SettingsRowLink but opens a URL).
private struct SettingsRowExternal: View {
    let title: String
    let url: URL
    var tone: Tone = .normal
    var showDivider: Bool = true
    enum Tone { case normal, accent }

    var body: some View {
        Link(destination: url) {
            HStack(spacing: 12) {
                Text(title)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundColor(tone == .accent ? VP.accent : VP.text)
                Spacer(minLength: 8)
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(VP.muted)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .overlay(alignment: .bottom) {
                if showDivider {
                    Rectangle().fill(VP.border.opacity(0.6)).frame(height: 1).padding(.leading, 16)
                }
            }
        }
    }
}

/// Action row (tap to run a closure). Used for Send Feedback + Restore
/// Purchases + Sign out / Delete account.
private struct SettingsRowButton: View {
    let title: String
    let tone: Tone
    let trailing: String?
    var showDivider: Bool = true
    let action: () -> Void
    enum Tone { case normal, accent, destructive }

    private var textColor: Color {
        switch tone {
        case .normal: return VP.text
        case .accent: return VP.accent
        case .destructive: return VP.danger
        }
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Text(title)
                    .font(.system(size: 15, weight: tone == .accent ? .semibold : .regular))
                    .foregroundColor(textColor)
                Spacer(minLength: 8)
                if let trailing {
                    Text(trailing).font(.caption).foregroundColor(VP.dim)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .overlay(alignment: .bottom) {
                if showDivider {
                    Rectangle().fill(VP.border.opacity(0.6)).frame(height: 1).padding(.leading, 16)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

/// Static value row — label left, value right, no chevron.
private struct SettingsRowValue: View {
    let title: String
    let value: String
    var valueColor: Color = VP.dim
    var showDivider: Bool = true

    var body: some View {
        HStack(spacing: 12) {
            Text(title)
                .font(.system(size: 15, weight: .regular))
                .foregroundColor(VP.text)
            Spacer(minLength: 8)
            Text(value)
                .font(.system(size: 14, weight: .regular))
                .foregroundColor(valueColor)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(minHeight: 44)
        .overlay(alignment: .bottom) {
            if showDivider {
                Rectangle().fill(VP.border.opacity(0.6)).frame(height: 1).padding(.leading, 16)
            }
        }
    }
}

/// Flat top bar — pairs with `.toolbar(.hidden, for: .navigationBar)`.
/// Replaces iOS 26's floating glass nav bubble with the same flat bar
/// HomeView + ProfileView use. Back chevron dismisses; title is centered
/// by flex.
private struct SettingsTopBar: View {
    let title: String
    let onBack: () -> Void

    var body: some View {
        ZStack {
            Text(title)
                .font(.system(size: 15, weight: .heavy))
                .tracking(-0.15)
                .foregroundColor(VP.text)
            HStack(spacing: 0) {
                Button(action: onBack) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(VP.text)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Back")
                Spacer()
            }
        }
        .frame(height: 44)
        .padding(.horizontal, 6)
        .background(VP.bg)
        .overlay(alignment: .bottom) {
            Rectangle().fill(VP.border).frame(height: 1)
        }
    }
}

/// Standard page shell for every subpage in this file. Wraps content in
/// a ScrollView + flat top bar + hides the native nav bar.
private struct SettingsPageShell<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                SettingsTopBar(title: title, onBack: { dismiss() })
                content
                Color.clear.frame(height: 24)
            }
        }
        .background(VP.bg.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Banner for informational / warning notes at the top or bottom of a
/// card — mirrors web's subtle inline note copy.
private struct SettingsNote: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.caption)
            .foregroundColor(VP.dim)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, 6)
    }
}

/// Standard filled primary button (VP.text bg + VP.bg text). Used inline
/// in forms for Save / Submit / Update actions.
private struct SettingsPrimaryButton: View {
    let title: String
    let isLoading: Bool
    let isDisabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                if isLoading { ProgressView().tint(VP.bg) }
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(VP.bg)
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(isDisabled ? VP.muted : VP.text)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
        .disabled(isDisabled || isLoading)
    }
}

/// Styled text field + optional secure entry, framed to match web inputs.
private struct SettingsTextField: View {
    let label: String?
    let placeholder: String
    @Binding var text: String
    var isSecure: Bool = false
    var keyboard: UIKeyboardType = .default
    var autocap: TextInputAutocapitalization = .sentences
    var autocorrect: Bool = true

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let label {
                Text(label)
                    .font(.caption)
                    .foregroundColor(VP.dim)
            }
            Group {
                if isSecure {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                        .keyboardType(keyboard)
                        .textInputAutocapitalization(autocap)
                        .autocorrectionDisabled(!autocorrect)
                }
            }
            .font(.system(size: 15))
            .foregroundColor(VP.text)
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
            .background(VP.bg)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }
}

/// Toggle row matching the row chrome — label left, switch right.
private struct SettingsToggleRow: View {
    let title: String
    let subtitle: String?
    @Binding var isOn: Bool
    var isDisabled: Bool = false
    var showDivider: Bool = true

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundColor(VP.text)
                if let subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundColor(VP.dim)
                }
            }
            Spacer(minLength: 8)
            Toggle("", isOn: $isOn)
                .labelsHidden()
                .tint(VP.accent)
                .disabled(isDisabled)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 44)
        .overlay(alignment: .bottom) {
            if showDivider {
                Rectangle().fill(VP.border.opacity(0.6)).frame(height: 1).padding(.leading, 16)
            }
        }
    }
}

// MARK: - Settings hub
//
// World-class hub: search-as-you-type, section icons, per-row icons,
// live value previews, one inline-toggled privacy pref (DM read receipts),
// pull-to-refresh, and a clearly-separated Danger zone at the bottom.
//
// Every row is declared once in a single `rows` model and rendered from
// that model — search, permission gates, and section grouping all compose
// through the same pipeline, so adding a new row is a one-line tuple.
//
// Existing subpage destinations are preserved verbatim; the hub's job is
// discovery + one-tap state, not re-implementing the flows.

/// Row-level icon tile used inside hub rows. Smaller cousin of `IconTile`
/// so the row stays on a 44pt baseline but still scans well.
private struct RowIconTile: View {
    let system: String
    var tint: Color = VP.text
    var body: some View {
        IconTile(system: system, tint: tint, size: 30, symbolSize: 14)
    }
}

/// Hub row — unified NavigationLink / Button / Link surface with an icon,
/// a value preview, and a trailing chevron or arrow. Keeps every hub row
/// on a shared visual rhythm (44pt minimum, 14pt vertical pad, 16pt label,
/// 14pt dim value preview) so the list reads like one continuous scan.
///
/// `kind` captures the destination semantics without leaking a generic
/// parameter onto the row model — lets us store heterogeneous rows in one
/// array for search/filter.
private enum HubRowKind {
    case push(AnyView)
    case external(URL)
    case action(() -> Void)
    case toggle(Binding<Bool>, isDisabled: Bool)
    case staticValue
}

private struct HubRow: View {
    let icon: String
    var iconTint: Color = VP.text
    let title: String
    var subtitle: String? = nil
    var valuePreview: String? = nil
    var valueTone: Color = VP.dim
    var tone: Tone = .normal
    var showDivider: Bool = true
    let kind: HubRowKind
    var onTap: (() -> Void)? = nil

    enum Tone { case normal, accent, destructive }

    private var labelColor: Color {
        switch tone {
        case .normal: return VP.text
        case .accent: return VP.accent
        case .destructive: return VP.danger
        }
    }

    @ViewBuilder
    private var contentRow: some View {
        HStack(spacing: 12) {
            RowIconTile(system: icon, tint: iconTint)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(labelColor)
                    .lineLimit(1)
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 13, weight: .regular))
                        .foregroundColor(VP.dim)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            trailing
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(minHeight: 56)
        .contentShape(Rectangle())
        .overlay(alignment: .bottom) {
            if showDivider {
                Rectangle()
                    .fill(VP.border.opacity(0.6))
                    .frame(height: 1)
                    .padding(.leading, 58)
            }
        }
    }

    @ViewBuilder
    private var trailing: some View {
        switch kind {
        case .push:
            if let valuePreview, !valuePreview.isEmpty {
                Text(valuePreview)
                    .font(.system(size: 14, weight: .regular))
                    .foregroundColor(valueTone)
                    .lineLimit(1)
            }
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(VP.muted)
        case .external:
            if let valuePreview, !valuePreview.isEmpty {
                Text(valuePreview)
                    .font(.system(size: 14, weight: .regular))
                    .foregroundColor(valueTone)
                    .lineLimit(1)
            }
            Image(systemName: "arrow.up.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(VP.muted)
        case .action:
            if let valuePreview, !valuePreview.isEmpty {
                Text(valuePreview)
                    .font(.system(size: 14, weight: .regular))
                    .foregroundColor(valueTone)
                    .lineLimit(1)
            }
        case .toggle(let binding, let isDisabled):
            Toggle("", isOn: binding)
                .labelsHidden()
                .tint(VP.accent)
                .disabled(isDisabled)
        case .staticValue:
            if let valuePreview {
                Text(valuePreview)
                    .font(.system(size: 14, weight: .regular))
                    .foregroundColor(valueTone)
                    .lineLimit(1)
            }
        }
    }

    var body: some View {
        switch kind {
        case .push(let destination):
            NavigationLink(destination: destination) { contentRow }
                .buttonStyle(.plain)
                .simultaneousGesture(TapGesture().onEnded { onTap?() })
        case .external(let url):
            Link(destination: url) { contentRow }
                .simultaneousGesture(TapGesture().onEnded { onTap?() })
        case .action(let handler):
            Button(action: { onTap?(); handler() }) { contentRow }
                .buttonStyle(.plain)
        case .toggle, .staticValue:
            contentRow
        }
    }
}

/// Rendered section — a single SettingsCard wrapping a block of HubRows.
/// Matches divider collapse on the last row automatically.
private struct HubSection<Content: View>: View {
    let title: String
    var tone: SettingsSectionHeader.Tone = .normal
    let icon: String
    var iconTint: Color? = nil
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 0) {
            SettingsSectionHeader(title: title, tone: tone, icon: icon, iconTint: iconTint)
            SettingsCard { content }
        }
        .padding(.bottom, 2)
    }
}

struct SettingsView: View {
    @EnvironmentObject var auth: AuthViewModel
    @StateObject private var perms = PermissionStore.shared
    @StateObject private var push = PushPermission.shared
    @StateObject private var blocks = BlockService.shared
    @Environment(\.dismiss) private var dismiss

    @State private var showFeedback = false
    @State private var searchText = ""
    @State private var searchQuery = ""
    @State private var searchDebouncer: Task<Void, Never>? = nil
    @State private var tapTick = 0

    // Permission gates — mirrored from web SECTIONS tree. Resolved by
    // PermissionService on mount and refreshed when perms.changeToken
    // bumps (admin-driven grants land without a relaunch).
    @State private var canViewExpertSettings: Bool = false
    @State private var canApplyExpert: Bool = false
    @State private var canEditProfile: Bool = false
    @State private var canEditEmail: Bool = false
    @State private var canChangePassword: Bool = false
    @State private var canViewMFA: Bool = false
    @State private var canViewLoginActivity: Bool = false
    @State private var canViewBilling: Bool = false
    @State private var canViewFeedPrefs: Bool = false
    @State private var canViewAlerts: Bool = false
    @State private var canViewDataPrivacy: Bool = false

    // Live value-preview state, fetched on appear and re-fetched by
    // pull-to-refresh. Zero preview-only writes — these mirror server state.
    @State private var hasActiveSubscription: Bool = false
    @State private var mfaEnabled: Bool = false
    @State private var dmReceiptsEnabled: Bool = true
    @State private var dmReceiptsLoading: Bool = true

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—"
    }

    // MARK: Body

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                SettingsTopBar(title: "Settings", onBack: { dismiss() })

                if let user = auth.currentUser {
                    identityHeader(user)
                }

                searchField

                sections

                Color.clear.frame(height: 32)
            }
        }
        .background(VP.bg.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await refreshAll() }
        .sensoryFeedback(.selection, trigger: tapTick)
        .sheet(isPresented: $showFeedback) { FeedbackSheet().environmentObject(auth) }
        .task(id: perms.changeToken) { await loadPerms() }
        .task { await loadPreviews() }
        .onChange(of: searchText) { _, new in
            // 100ms debounce — keeps search smooth without re-filtering on
            // every keystroke when the user is typing fast.
            searchDebouncer?.cancel()
            searchDebouncer = Task {
                try? await Task.sleep(nanoseconds: 100_000_000)
                if !Task.isCancelled {
                    await MainActor.run { searchQuery = new }
                }
            }
        }
    }

    // MARK: Identity

    private func identityHeader(_ user: VPUser) -> some View {
        HStack(spacing: 14) {
            AvatarView(user: user, size: 56)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(user.username ?? "Reader")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundColor(VP.text)
                        .lineLimit(1)
                    VerifiedBadgeView(user: user, size: 10)
                }
                Text(user.email ?? "")
                    .font(.caption)
                    .foregroundColor(VP.dim)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(user.planDisplay)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(VP.text)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .overlay(RoundedRectangle(cornerRadius: 99).stroke(VP.border, lineWidth: 1))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 18)
    }

    // MARK: Search field

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(VP.muted)
            TextField("Search settings", text: $searchText)
                .font(.system(size: 15))
                .foregroundColor(VP.text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .submitLabel(.search)
            if !searchText.isEmpty {
                Button {
                    searchText = ""
                    searchQuery = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 15))
                        .foregroundColor(VP.muted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal, 16)
        .padding(.top, 2)
        .padding(.bottom, 10)
    }

    // MARK: Sections — assembled from a row model so search can filter them

    @ViewBuilder
    private var sections: some View {
        let visibleAccount = filter(accountRows)
        let visiblePrefs = filter(preferencesRows)
        let visiblePrivacy = filter(privacyRows)
        let visibleBilling = canViewBilling ? filter(billingRows) : []
        let visibleExpert = filter(expertRows)
        let visibleAbout = filter(aboutRows)
        let visibleDanger = filter(dangerRows)

        let anyVisible = !visibleAccount.isEmpty
                      || !visiblePrefs.isEmpty
                      || !visiblePrivacy.isEmpty
                      || !visibleBilling.isEmpty
                      || !visibleExpert.isEmpty
                      || !visibleAbout.isEmpty
                      || !visibleDanger.isEmpty

        VStack(spacing: 18) {
            if !visibleAccount.isEmpty {
                HubSection(title: "Account", icon: "person.crop.circle.fill", iconTint: VP.text) {
                    renderRows(visibleAccount)
                }
            }
            if !visiblePrefs.isEmpty {
                HubSection(title: "Preferences", icon: "slider.horizontal.3", iconTint: VP.text) {
                    renderRows(visiblePrefs)
                }
            } else if !canViewAlerts && !canViewFeedPrefs && searchQuery.isEmpty {
                SettingsNote(text: "Preferences aren\u{2019}t available for your account.")
            }
            if !visiblePrivacy.isEmpty {
                HubSection(title: "Privacy", icon: "lock.fill", iconTint: VP.text) {
                    renderRows(visiblePrivacy)
                }
            }
            if !visibleBilling.isEmpty {
                HubSection(title: "Billing", icon: "creditcard.fill", iconTint: VP.text) {
                    renderRows(visibleBilling)
                }
            }
            if !visibleExpert.isEmpty {
                HubSection(title: "Expert", icon: "checkmark.seal.fill", iconTint: VP.text) {
                    renderRows(visibleExpert)
                }
            }
            if !visibleAbout.isEmpty {
                HubSection(title: "About", icon: "info.circle.fill", iconTint: VP.text) {
                    renderRows(visibleAbout)
                }
            }
            if !visibleDanger.isEmpty {
                HubSection(title: "Danger zone",
                           tone: .danger,
                           icon: "exclamationmark.triangle.fill",
                           iconTint: VP.danger) {
                    renderRows(visibleDanger)
                }
            }

            if !anyVisible {
                emptySearchState
            }
        }
        .padding(.top, 4)
    }

    /// Renders a filtered row list, suppressing the divider on the last row
    /// so the card doesn't end with a rule-under-last pattern.
    @ViewBuilder
    private func renderRows(_ rows: [HubRowSpec]) -> some View {
        ForEach(Array(rows.enumerated()), id: \.element.id) { idx, spec in
            spec.make(isLast: idx == rows.count - 1, onTap: { tapTick &+= 1 })
        }
    }

    private var emptySearchState: some View {
        VStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 22, weight: .regular))
                .foregroundColor(VP.muted)
            Text("No matches for \u{201C}\(searchText)\u{201D}")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(VP.text)
            Text("Try a different word.")
                .font(.caption)
                .foregroundColor(VP.dim)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    // MARK: Row model
    //
    // Every hub row is declared as a `HubRowSpec` with a keyword set used
    // for filtering. `make(isLast:onTap:)` materializes the view with the
    // right divider behavior and sensory-feedback trigger.

    private struct HubRowSpec: Identifiable {
        let id: String
        let keywords: [String]
        let builder: (_ isLast: Bool, _ onTap: @escaping () -> Void) -> AnyView

        func make(isLast: Bool, onTap: @escaping () -> Void) -> AnyView {
            builder(isLast, onTap)
        }
    }

    private func filter(_ rows: [HubRowSpec]) -> [HubRowSpec] {
        let q = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return rows }
        return rows.filter { spec in
            spec.keywords.contains { $0.lowercased().contains(q) }
        }
    }

    // MARK: Row definitions (one tuple per row — add new rows here)

    private var accountRows: [HubRowSpec] {
        var out: [HubRowSpec] = []
        if canEditProfile {
            out.append(HubRowSpec(id: "profile",
                                  keywords: ["profile", "account", "username", "bio", "avatar", "location", "website"]) { isLast, onTap in
                AnyView(HubRow(icon: "person.fill", title: "Profile",
                               subtitle: "Username, bio, avatar",
                               showDivider: !isLast,
                               kind: .push(AnyView(AccountSettingsView())),
                               onTap: onTap))
            })
        }
        if canEditEmail {
            out.append(HubRowSpec(id: "email",
                                  keywords: ["email", "address", "change email", "account"]) { isLast, onTap in
                AnyView(HubRow(icon: "envelope.fill", title: "Email",
                               valuePreview: self.auth.currentUser?.email,
                               showDivider: !isLast,
                               kind: .push(AnyView(EmailSettingsView())),
                               onTap: onTap))
            })
        }
        if canChangePassword {
            out.append(HubRowSpec(id: "password",
                                  keywords: ["password", "change password", "security", "account"]) { isLast, onTap in
                AnyView(HubRow(icon: "key.fill", title: "Password",
                               showDivider: !isLast,
                               kind: .push(AnyView(PasswordSettingsView())),
                               onTap: onTap))
            })
        }
        if canViewLoginActivity {
            out.append(HubRowSpec(id: "login-activity",
                                  keywords: ["sign-in", "sign in", "login", "activity", "sessions", "devices", "security"]) { isLast, onTap in
                AnyView(HubRow(icon: "clock.arrow.circlepath", title: "Sign-in activity",
                               subtitle: "Recent sessions and devices",
                               showDivider: !isLast,
                               kind: .push(AnyView(LoginActivityView())),
                               onTap: onTap))
            })
        }
        if canViewMFA {
            out.append(HubRowSpec(id: "mfa",
                                  keywords: ["two factor", "two-factor", "2fa", "mfa", "totp", "authenticator", "security"]) { isLast, onTap in
                AnyView(HubRow(icon: "shield.lefthalf.filled", title: "Two-factor authentication",
                               valuePreview: self.mfaEnabled ? "On" : "Off",
                               valueTone: self.mfaEnabled ? VP.right : VP.dim,
                               showDivider: !isLast,
                               kind: .push(AnyView(MFASettingsView())),
                               onTap: onTap))
            })
        }
        return out
    }

    private var preferencesRows: [HubRowSpec] {
        var out: [HubRowSpec] = []
        if canViewAlerts {
            out.append(HubRowSpec(id: "alerts",
                                  keywords: ["alerts", "notifications", "push", "email", "digest", "breaking", "recap"]) { isLast, onTap in
                AnyView(HubRow(icon: "bell.fill", title: "Alerts",
                               subtitle: "Push, email, and in-app",
                               valuePreview: self.push.summary,
                               valueTone: self.push.isOn ? VP.right : VP.dim,
                               showDivider: !isLast,
                               kind: .push(AnyView(NotificationsSettingsView())),
                               onTap: onTap))
            })
        }
        if canViewFeedPrefs {
            out.append(HubRowSpec(id: "feed",
                                  keywords: ["feed", "home", "trending", "breaking", "recommended", "compact", "preferences"]) { isLast, onTap in
                AnyView(HubRow(icon: "list.bullet.rectangle.fill", title: "Feed",
                               subtitle: "What surfaces, what\u{2019}s filtered",
                               showDivider: !isLast,
                               kind: .push(AnyView(FeedPreferencesSettingsView())),
                               onTap: onTap))
            })
        }
        return out
    }

    private var privacyRows: [HubRowSpec] {
        var out: [HubRowSpec] = []

        // DM read receipts — genuine inline toggle. Writes to the
        // dm_read_receipts_enabled column via update_own_profile RPC,
        // round-tripped through the same path DataPrivacyView uses so
        // both surfaces stay coherent.
        out.append(HubRowSpec(id: "dm-receipts",
                              keywords: ["read receipts", "dm", "messages", "privacy", "receipts"]) { isLast, onTap in
            let binding = Binding<Bool>(
                get: { self.dmReceiptsEnabled },
                set: { newValue in
                    self.dmReceiptsEnabled = newValue
                    onTap()
                    Task { await self.saveDmReceiptsPref(newValue) }
                }
            )
            return AnyView(HubRow(icon: "checkmark.message.fill",
                                  title: "DM read receipts",
                                  subtitle: "Let senders see when you\u{2019}ve read",
                                  showDivider: !isLast,
                                  kind: .toggle(binding, isDisabled: self.dmReceiptsLoading)))
        })

        out.append(HubRowSpec(id: "blocked",
                              keywords: ["blocked", "block", "mute", "privacy", "safety"]) { isLast, onTap in
            let count = self.blocks.blockedIds.count
            return AnyView(HubRow(icon: "hand.raised.fill", title: "Blocked accounts",
                                  valuePreview: count > 0 ? "\(count)" : nil,
                                  showDivider: !isLast,
                                  kind: .push(AnyView(BlockedAccountsView())),
                                  onTap: onTap))
        })

        if canViewDataPrivacy {
            out.append(HubRowSpec(id: "data-privacy",
                                  keywords: ["data", "privacy", "export", "gdpr", "ccpa", "delete", "deletion", "receipts"]) { isLast, onTap in
                AnyView(HubRow(icon: "arrow.up.doc.fill", title: "Data & privacy",
                               subtitle: "Export, receipts, deletion",
                               showDivider: !isLast,
                               kind: .push(AnyView(DataPrivacyView())),
                               onTap: onTap))
            })
        } else {
            // Apple Review 5.1.1(v) — delete must be reachable for every
            // signed-in user even when the export permission is missing.
            out.append(HubRowSpec(id: "delete-account",
                                  keywords: ["delete", "account", "remove", "deletion", "close"]) { isLast, onTap in
                AnyView(HubRow(icon: "xmark.bin.fill",
                               iconTint: VP.danger,
                               title: "Delete account",
                               tone: .destructive,
                               showDivider: !isLast,
                               kind: .push(AnyView(DataPrivacyView())),
                               onTap: onTap))
            })
        }
        return out
    }

    private var billingRows: [HubRowSpec] {
        [
            HubRowSpec(id: "subscription",
                       keywords: ["billing", "subscription", "plan", "upgrade", "pro", "family", "verity", "restore", "purchase"]) { isLast, onTap in
                AnyView(HubRow(icon: "creditcard.fill", title: "Subscription",
                               subtitle: "Plan, upgrade, restore",
                               valuePreview: self.auth.currentUser?.planDisplay,
                               valueTone: self.hasActiveSubscription ? VP.right : VP.dim,
                               showDivider: !isLast,
                               kind: .push(AnyView(SubscriptionSettingsView())),
                               onTap: onTap))
            },
        ]
    }

    private var expertRows: [HubRowSpec] {
        var out: [HubRowSpec] = []
        out.append(HubRowSpec(id: "verification",
                              keywords: ["verification", "verify", "application", "expert", "journalist", "public figure"]) { isLast, onTap in
            AnyView(HubRow(icon: "checkmark.seal.fill", title: "Verification application",
                           showDivider: !isLast,
                           kind: .push(AnyView(VerificationRequestView())),
                           onTap: onTap))
        })
        if canViewExpertSettings {
            out.append(HubRowSpec(id: "expert-settings",
                                  keywords: ["expert", "settings", "tag limit", "notifications"]) { isLast, onTap in
                AnyView(HubRow(icon: "person.crop.circle.badge.checkmark", title: "Expert settings",
                               showDivider: !isLast,
                               kind: .push(AnyView(ExpertSettingsView())),
                               onTap: onTap))
            })
        } else if canApplyExpert,
                  let url = URL(string: SupabaseManager.shared.siteURL
                                .appendingPathComponent("signup/expert").absoluteString) {
            out.append(HubRowSpec(id: "apply-expert",
                                  keywords: ["apply", "expert", "application", "become"]) { isLast, onTap in
                AnyView(HubRow(icon: "arrow.up.forward.app.fill",
                               title: "Apply to be an expert",
                               tone: .accent,
                               showDivider: !isLast,
                               kind: .external(url),
                               onTap: onTap))
            })
        }
        return out
    }

    private var aboutRows: [HubRowSpec] {
        var out: [HubRowSpec] = []
        out.append(HubRowSpec(id: "feedback",
                              keywords: ["feedback", "send feedback", "bug", "feature", "support", "help"]) { isLast, onTap in
            AnyView(HubRow(icon: "paperplane.fill", title: "Send feedback",
                           showDivider: !isLast,
                           kind: .action({ self.showFeedback = true }),
                           onTap: onTap))
        })
        if let privacy = URL(string: "https://veritypost.com/privacy") {
            out.append(HubRowSpec(id: "privacy-policy",
                                  keywords: ["privacy", "policy", "legal"]) { isLast, onTap in
                AnyView(HubRow(icon: "doc.text.fill", title: "Privacy policy",
                               showDivider: !isLast,
                               kind: .external(privacy),
                               onTap: onTap))
            })
        }
        if let terms = URL(string: "https://veritypost.com/terms") {
            out.append(HubRowSpec(id: "terms",
                                  keywords: ["terms", "service", "legal", "agreement"]) { isLast, onTap in
                AnyView(HubRow(icon: "doc.plaintext.fill", title: "Terms of service",
                               showDivider: !isLast,
                               kind: .external(terms),
                               onTap: onTap))
            })
        }
        out.append(HubRowSpec(id: "version",
                              keywords: ["version", "about", "build"]) { isLast, _ in
            AnyView(HubRow(icon: "info.circle.fill", title: "Version",
                           valuePreview: self.appVersion,
                           showDivider: !isLast,
                           kind: .staticValue))
        })
        return out
    }

    private var dangerRows: [HubRowSpec] {
        [
            HubRowSpec(id: "sign-out",
                       keywords: ["sign out", "log out", "logout", "exit"]) { isLast, _ in
                AnyView(HubRow(icon: "rectangle.portrait.and.arrow.right",
                               iconTint: VP.danger,
                               title: "Sign out",
                               tone: .destructive,
                               showDivider: !isLast,
                               kind: .action({
                                    // Destructive end-of-session haptic.
                                    UINotificationFeedbackGenerator().notificationOccurred(.warning)
                                    Task { await self.auth.logout() }
                               })))
            },
        ]
    }

    // MARK: Loaders

    private func loadPerms() async {
        canViewExpertSettings = await PermissionService.shared.has("settings.expert.view")
        canApplyExpert = await PermissionService.shared.has("expert.application.apply")
        canEditProfile = await PermissionService.shared.has("settings.view")
        canEditEmail = await PermissionService.shared.has("settings.account.edit_email")
        canChangePassword = await PermissionService.shared.has("settings.account.change_password")
        canViewMFA = await PermissionService.shared.has("settings.account.2fa.enable")
        canViewLoginActivity = await PermissionService.shared.has("settings.login_activity.view")
        canViewBilling = await PermissionService.shared.has("billing.view.plan")
        canViewFeedPrefs = await PermissionService.shared.has("settings.feed.view")
        canViewAlerts = await PermissionService.shared.has("notifications.prefs.view")
        canViewDataPrivacy = await PermissionService.shared.has("settings.data.request_export")
        hasActiveSubscription = await PermissionService.shared.has("billing.subscription.view_own")
    }

    /// Hydrates every preview the hub shows. Called on mount and again by
    /// pull-to-refresh. Each branch is best-effort — errors leave the old
    /// value intact so the UI doesn't blank on a transient failure.
    private func loadPreviews() async {
        await push.refresh()
        await loadMFAState()
        await loadDmReceiptsPref()
        await blocks.refreshIfStale(currentUserId: auth.currentUser?.id)
    }

    private func loadMFAState() async {
        do {
            let factors = try await SupabaseManager.shared.client.auth.mfa.listFactors()
            mfaEnabled = factors.totp.contains(where: { $0.status == .verified })
        } catch { Log.d("Hub MFA preview load error:", error) }
    }

    private func loadDmReceiptsPref() async {
        guard let userId = auth.currentUser?.id else {
            dmReceiptsLoading = false
            return
        }
        struct Row: Decodable { let dm_read_receipts_enabled: Bool? }
        let r: [Row] = (try? await SupabaseManager.shared.client.from("users")
            .select("dm_read_receipts_enabled")
            .eq("id", value: userId)
            .execute().value) ?? []
        dmReceiptsEnabled = r.first?.dm_read_receipts_enabled ?? true
        dmReceiptsLoading = false
    }

    private func saveDmReceiptsPref(_ newValue: Bool) async {
        guard auth.currentUser?.id != nil else { return }
        struct Args: Encodable { let p_fields: Patch }
        struct Patch: Encodable { let dm_read_receipts_enabled: Bool }
        do {
            try await SupabaseManager.shared.client.rpc(
                "update_own_profile",
                params: Args(p_fields: Patch(dm_read_receipts_enabled: newValue))
            ).execute()
        } catch {
            Log.d("Hub saveDmReceiptsPref error:", error)
            // Revert on failure so UI stays coherent with server.
            await MainActor.run { self.dmReceiptsEnabled = !newValue }
        }
    }

    /// Pull-to-refresh entry point. Re-fetches permissions, user data,
    /// and every preview. Matches ProfileView's refresh contract.
    private func refreshAll() async {
        await PermissionService.shared.refreshIfStale()
        if let userId = auth.currentUser?.id {
            await auth.loadUser(id: userId)
        }
        await loadPerms()
        await loadPreviews()
    }
}

// MARK: - Account (profile fields)

struct AccountSettingsView: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client
    @Environment(\.dismiss) private var dismiss

    @State private var username = ""
    @State private var bio = ""
    @State private var location = ""
    @State private var website = ""

    // Two-tone avatar
    @State private var avatarOuter = "#818cf8"
    @State private var avatarInner: String? = nil
    @State private var avatarInitials = ""
    @State private var initialsError: String? = nil

    @State private var saving = false
    @State private var savedBanner: String? = nil

    private let colorOptions = [
        "#818cf8", "#22c55e", "#ef4444", "#f59e0b", "#3b82f6",
        "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#6366f1",
        "#0ea5e9", "#10b981", "#a855f7", "#64748b", "#111111",
    ]

    private var previewInitials: String {
        if !avatarInitials.isEmpty { return avatarInitials }
        if let u = username.first { return String(u).uppercased() }
        return "?"
    }

    var body: some View {
        SettingsPageShell(title: "Profile") {
            // Avatar card — preview + initials + ring + inner fill pickers.
            SettingsSectionHeader(title: "Avatar", tone: .normal)
            SettingsCard {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .top, spacing: 14) {
                        AvatarView(outerHex: avatarOuter,
                                   innerHex: avatarInner,
                                   initials: previewInitials,
                                   size: 72)
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Up to 3 characters, letters and numbers only.")
                                .font(.caption).foregroundColor(VP.dim)
                            SettingsTextField(label: nil,
                                              placeholder: "ABC",
                                              text: $avatarInitials,
                                              autocap: .characters,
                                              autocorrect: false)
                                .onChange(of: avatarInitials) { _, new in
                                    let clean = new.uppercased()
                                        .filter { $0.isLetter || $0.isNumber }
                                        .prefix(3)
                                    let cleanStr = String(clean)
                                    if cleanStr != new { avatarInitials = cleanStr }
                                    initialsError = (new.count > 0 && cleanStr.isEmpty)
                                        ? "Only letters and numbers."
                                        : nil
                                }
                            if let err = initialsError {
                                Text(err).font(.caption).foregroundColor(VP.wrong)
                            }
                        }
                    }

                    Text("Ring color").font(.caption).foregroundColor(VP.dim)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 6),
                              spacing: 10) {
                        ForEach(colorOptions, id: \.self) { color in
                            Circle().fill(Color(hex: color)).frame(width: 32, height: 32)
                                .overlay(Circle().stroke(VP.text,
                                                          lineWidth: avatarOuter == color ? 3 : 0))
                                .onTapGesture { avatarOuter = color }
                        }
                    }

                    Text("Inner fill").font(.caption).foregroundColor(VP.dim)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 6),
                              spacing: 10) {
                        ZStack {
                            Circle().fill(Color.white)
                            Circle().strokeBorder(VP.border,
                                                   style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
                        }
                        .frame(width: 32, height: 32)
                        .overlay(Circle().stroke(VP.text, lineWidth: avatarInner == nil ? 3 : 0))
                        .onTapGesture { avatarInner = nil }

                        ForEach(colorOptions, id: \.self) { color in
                            Circle().fill(Color(hex: color)).frame(width: 32, height: 32)
                                .overlay(Circle().stroke(VP.text,
                                                          lineWidth: avatarInner == color ? 3 : 0))
                                .onTapGesture { avatarInner = color }
                        }
                    }
                }
                .padding(16)
            }

            // Identity card
            SettingsSectionHeader(title: "Identity", tone: .normal)
            SettingsCard {
                VStack(spacing: 14) {
                    SettingsTextField(label: "Username",
                                      placeholder: "username",
                                      text: $username,
                                      autocap: .never,
                                      autocorrect: false)
                    SettingsTextField(label: "Location",
                                      placeholder: "City, Country",
                                      text: $location)
                    SettingsTextField(label: "Website",
                                      placeholder: "https://",
                                      text: $website,
                                      keyboard: .URL,
                                      autocap: .never,
                                      autocorrect: false)
                }
                .padding(16)
            }

            // Bio card
            SettingsSectionHeader(title: "Bio", tone: .normal)
            SettingsCard {
                VStack(alignment: .leading, spacing: 6) {
                    TextField("Tell us about yourself...", text: $bio, axis: .vertical)
                        .font(.system(size: 15))
                        .foregroundColor(VP.text)
                        .lineLimit(3...8)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 11)
                        .background(VP.bg)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .padding(16)
            }

            // Save
            VStack(spacing: 8) {
                SettingsPrimaryButton(title: saving ? "Saving..." : "Save changes",
                                      isLoading: saving,
                                      isDisabled: username.trimmingCharacters(in: .whitespaces).isEmpty) {
                    Task { await save() }
                }
                if let banner = savedBanner {
                    Text(banner).font(.caption).foregroundColor(VP.right)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
        .onAppear {
            username = auth.currentUser?.username ?? ""
            avatarOuter = auth.currentUser?.avatarColor ?? "#818cf8"
        }
    }

    private func save() async {
        guard let userId = auth.currentUser?.id else { return }
        saving = true
        defer { saving = false }

        // Round 5 Item 2: server-side metadata merge via update_own_profile
        // (SECDEF, allowlist). Routes location/website/avatar into metadata.
        struct AvatarJSON: Encodable { let outer: String; let inner: String?; let initials: String }
        struct MetadataPatch: Encodable {
            let avatar: AvatarJSON
            let location: String
            let website: String
        }
        struct ProfilePatch: Encodable {
            let username: String
            let bio: String
            let avatar_color: String
            let avatar_url: String?
            let metadata: MetadataPatch
        }
        struct Args: Encodable { let p_fields: ProfilePatch }
        let initials = avatarInitials.isEmpty
            ? String((username.first.map { String($0) } ?? "?")).uppercased()
            : avatarInitials

        do {
            let args = Args(p_fields: ProfilePatch(
                username: username,
                bio: bio,
                avatar_color: avatarOuter,
                avatar_url: nil,
                metadata: MetadataPatch(
                    avatar: AvatarJSON(outer: avatarOuter, inner: avatarInner, initials: initials),
                    location: location,
                    website: website
                )
            ))
            try await client.rpc("update_own_profile", params: args).execute()
        } catch {
            Log.d("Save profile error:", error)
            savedBanner = "Couldn\u{2019}t save. Try again."
            return
        }

        await auth.loadUser(id: userId)
        savedBanner = "Saved."
        try? await Task.sleep(nanoseconds: 900_000_000)
        dismiss()
    }
}

// MARK: - Email

struct EmailSettingsView: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    @State private var newEmail = ""
    @State private var status: String? = nil
    @State private var isError = false
    @State private var submitting = false

    var body: some View {
        SettingsPageShell(title: "Email") {
            SettingsSectionHeader(title: "Current email", tone: .normal)
            SettingsCard {
                SettingsRowValue(title: "Signed in as",
                                 value: auth.currentUser?.email ?? "—",
                                 showDivider: false)
            }

            SettingsSectionHeader(title: "Change email", tone: .normal)
            SettingsCard {
                VStack(spacing: 14) {
                    SettingsTextField(label: "New email address",
                                      placeholder: "you@example.com",
                                      text: $newEmail,
                                      keyboard: .emailAddress,
                                      autocap: .never,
                                      autocorrect: false)
                    SettingsPrimaryButton(title: submitting ? "Sending..." : "Send verification link",
                                          isLoading: submitting,
                                          isDisabled: !newEmail.contains("@")) {
                        Task { await requestChange() }
                    }
                }
                .padding(16)
            }

            if let s = status {
                Text(s)
                    .font(.caption)
                    .foregroundColor(isError ? VP.wrong : VP.right)
                    .padding(.horizontal, 16)
                    .padding(.top, 10)
            }

            SettingsNote(text: "Supabase will send a verification link to your new address. Your email won\u{2019}t change until you click the link.")
                .padding(.bottom, 8)
        }
    }

    private func requestChange() async {
        submitting = true
        defer { submitting = false }
        do {
            try await client.auth.update(user: UserAttributes(email: newEmail))
            status = "Verification email sent."
            isError = false
            newEmail = ""
        } catch {
            status = error.localizedDescription
            isError = true
        }
    }
}

// MARK: - Password

struct PasswordSettingsView: View {
    private let client = SupabaseManager.shared.client

    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var submitting = false
    @State private var status: String? = nil
    @State private var isError = false

    var body: some View {
        SettingsPageShell(title: "Password") {
            SettingsSectionHeader(title: "New password", tone: .normal)
            SettingsCard {
                VStack(spacing: 14) {
                    SettingsTextField(label: nil,
                                      placeholder: "New password (min 8 chars)",
                                      text: $newPassword,
                                      isSecure: true)
                    SettingsTextField(label: nil,
                                      placeholder: "Confirm new password",
                                      text: $confirmPassword,
                                      isSecure: true)
                    SettingsPrimaryButton(title: submitting ? "Updating..." : "Update password",
                                          isLoading: submitting,
                                          isDisabled: newPassword.count < 8
                                                      || newPassword != confirmPassword) {
                        Task { await submit() }
                    }
                }
                .padding(16)
            }

            if let s = status {
                Text(s)
                    .font(.caption)
                    .foregroundColor(isError ? VP.wrong : VP.right)
                    .padding(.horizontal, 16)
                    .padding(.top, 10)
            }

            SettingsNote(text: "Password must be at least 8 characters. Use a passphrase or a password manager \u{2014} good security starts here.")
        }
    }

    private func submit() async {
        submitting = true
        defer { submitting = false }
        do {
            try await client.auth.update(user: UserAttributes(password: newPassword))
            status = "Password updated."
            isError = false
            newPassword = ""
            confirmPassword = ""
        } catch {
            status = error.localizedDescription
            isError = true
        }
    }
}

// MARK: - Login activity

struct LoginActivityView: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    struct AuditRow: Decodable, Identifiable {
        let id: String
        let action: String
        let created_at: String?
        let metadata: Metadata?
        struct Metadata: Decodable {
            let device: String?
            let browser: String?
            let ip: String?
        }
    }

    @State private var rows: [AuditRow] = []
    @State private var loaded = false

    var body: some View {
        SettingsPageShell(title: "Sign-in activity") {
            if !loaded {
                ProgressView().padding(.top, 40)
            } else if rows.isEmpty {
                Text("No recent sign-in activity.")
                    .font(.footnote).foregroundColor(VP.dim)
                    .padding(.top, 40)
            } else {
                SettingsSectionHeader(title: "Recent", tone: .normal)
                SettingsCard {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { idx, r in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(r.action.replacingOccurrences(of: "_", with: " ").capitalized)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(VP.text)
                                Spacer()
                                Text(Self.formatDate(r.created_at))
                                    .font(.caption).foregroundColor(VP.dim)
                            }
                            if let m = r.metadata {
                                Text([m.device, m.browser, m.ip].compactMap { $0 }.joined(separator: " \u{00B7} "))
                                    .font(.caption)
                                    .foregroundColor(VP.dim)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .overlay(alignment: .bottom) {
                            if idx < rows.count - 1 {
                                Rectangle().fill(VP.border.opacity(0.6)).frame(height: 1).padding(.leading, 16)
                            }
                        }
                    }
                }
            }
        }
        .task { await load() }
    }

    private static func formatDate(_ iso: String?) -> String {
        guard let s = iso, let date = ISO8601DateFormatter().date(from: s) else { return "" }
        let f = DateFormatter(); f.dateFormat = "MMM d \u{00B7} h:mm a"
        return f.string(from: date)
    }

    private func load() async {
        guard auth.currentUser?.id != nil else { loaded = true; return }
        do {
            struct Params: Encodable { let p_limit: Int }
            let data: [AuditRow] = try await client
                .rpc("get_own_login_activity", params: Params(p_limit: 50))
                .execute().value
            rows = data
        } catch { Log.d("Login activity load error:", error) }
        loaded = true
    }
}

// MARK: - MFA (TOTP enroll / verify / disable)

struct MFASettingsView: View {
    private let client = SupabaseManager.shared.client

    @State private var loaded = false
    @State private var verifiedFactorId: String? = nil
    @State private var pendingFactorId: String? = nil
    @State private var totpUri: String? = nil
    @State private var totpSecret: String? = nil
    @State private var code: String = ""
    @State private var busy = false
    @State private var status: String? = nil
    @State private var isError = false

    var body: some View {
        SettingsPageShell(title: "Two-factor") {
            if !loaded {
                ProgressView().padding(.top, 40)
            } else if let fid = verifiedFactorId {
                SettingsSectionHeader(title: "Enabled", tone: .normal)
                SettingsCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Two-factor authentication is on. You\u{2019}ll be asked for a code each time you sign in.")
                            .font(.caption).foregroundColor(VP.soft)
                        Text("Factor ID: \(String(fid.prefix(8)))\u{2026}")
                            .font(.system(.caption, design: .monospaced))
                            .foregroundColor(VP.dim)
                        SettingsPrimaryButton(title: busy ? "Disabling..." : "Disable two-factor",
                                              isLoading: busy,
                                              isDisabled: false) {
                            UINotificationFeedbackGenerator().notificationOccurred(.warning)
                            Task { await disable(factorId: fid) }
                        }
                    }
                    .padding(16)
                }
            } else {
                SettingsSectionHeader(title: "Set up", tone: .normal)
                SettingsCard {
                    VStack(alignment: .leading, spacing: 10) {
                        if let uri = totpUri {
                            Text("Scan this in your authenticator app, or paste the manual key.")
                                .font(.caption).foregroundColor(VP.soft)
                            if let secret = totpSecret {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Manual key").font(.caption).foregroundColor(VP.dim)
                                    Text(secret)
                                        .font(.system(.footnote, design: .monospaced))
                                        .foregroundColor(VP.text)
                                        .textSelection(.enabled)
                                }
                            }
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Or tap to open in an authenticator app:")
                                    .font(.caption).foregroundColor(VP.dim)
                                if let url = URL(string: uri) {
                                    Link(uri, destination: url)
                                        .font(.system(.caption, design: .monospaced))
                                        .lineLimit(3)
                                }
                            }
                        } else {
                            SettingsPrimaryButton(title: busy ? "Generating..." : "Generate setup code",
                                                  isLoading: busy,
                                                  isDisabled: false) {
                                Task { await startEnroll() }
                            }
                        }
                    }
                    .padding(16)
                }

                if pendingFactorId != nil {
                    SettingsSectionHeader(title: "Verify", tone: .normal)
                    SettingsCard {
                        VStack(spacing: 10) {
                            TextField("6-digit code", text: $code)
                                .keyboardType(.numberPad)
                                .font(.system(.title3, design: .monospaced, weight: .semibold))
                                .foregroundColor(VP.text)
                                .multilineTextAlignment(.center)
                                .padding(.vertical, 12)
                                .background(VP.bg)
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border, lineWidth: 1))
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                .onChange(of: code) { _, new in
                                    let digits = new.filter { $0.isNumber }
                                    if digits != new { code = String(digits.prefix(6)) }
                                    else if digits.count > 6 { code = String(digits.prefix(6)) }
                                }
                            SettingsPrimaryButton(title: busy ? "Verifying..." : "Verify & enable",
                                                  isLoading: busy,
                                                  isDisabled: code.count != 6) {
                                Task { await verify() }
                            }
                        }
                        .padding(16)
                    }
                }
            }

            if let s = status {
                Text(s)
                    .font(.caption)
                    .foregroundColor(isError ? VP.wrong : VP.right)
                    .padding(.horizontal, 16)
                    .padding(.top, 10)
            }
        }
        .task { await load() }
    }

    private func load() async {
        do {
            let factors = try await client.auth.mfa.listFactors()
            if let v = factors.totp.first(where: { $0.status == .verified }) {
                verifiedFactorId = "\(v.id)"
            } else if let p = factors.totp.first(where: { $0.status == .unverified }) {
                pendingFactorId = "\(p.id)"
            }
        } catch {
            status = error.localizedDescription
            isError = true
        }
        loaded = true
    }

    private func startEnroll() async {
        busy = true
        defer { busy = false }
        status = nil
        isError = false
        do {
            let response = try await client.auth.mfa.enroll(
                params: MFATotpEnrollParams(issuer: "Verity Post")
            )
            pendingFactorId = "\(response.id)"
            if let totp = response.totp {
                totpUri = totp.uri
                totpSecret = totp.secret
            }
        } catch {
            status = error.localizedDescription
            isError = true
        }
    }

    private func verify() async {
        guard let fidStr = pendingFactorId else { return }
        busy = true
        defer { busy = false }
        status = nil
        isError = false
        do {
            let challenge = try await client.auth.mfa.challenge(
                params: MFAChallengeParams(factorId: fidStr)
            )
            _ = try await client.auth.mfa.verify(params: MFAVerifyParams(
                factorId: fidStr,
                challengeId: "\(challenge.id)",
                code: code
            ))
            code = ""
            pendingFactorId = nil
            totpUri = nil
            totpSecret = nil
            await load()
            status = "Two-factor enabled."
            isError = false
        } catch {
            status = error.localizedDescription
            isError = true
        }
    }

    private func disable(factorId: String) async {
        busy = true
        defer { busy = false }
        do {
            _ = try await client.auth.mfa.unenroll(
                params: MFAUnenrollParams(factorId: factorId)
            )
            verifiedFactorId = nil
            status = "Two-factor disabled."
            isError = false
        } catch {
            status = error.localizedDescription
            isError = true
        }
    }
}

// MARK: - Subscription

struct SubscriptionSettingsView: View {
    @EnvironmentObject var auth: AuthViewModel
    @StateObject private var perms = PermissionStore.shared
    @StateObject private var store = StoreManager.shared
    @State private var showSubscription = false
    @State private var hasActiveSubscription: Bool = false
    @State private var restoreMessage: String? = nil

    var body: some View {
        SettingsPageShell(title: "Subscription") {
            SettingsSectionHeader(title: "Current plan", tone: .normal)
            SettingsCard {
                SettingsRowValue(title: "Plan",
                                 value: auth.currentUser?.planDisplay ?? "Free",
                                 valueColor: VP.accent)
                SettingsRowValue(title: "Status",
                                 value: hasActiveSubscription ? "Active" : "No active subscription",
                                 showDivider: false)
            }

            SettingsSectionHeader(title: "Billing", tone: .normal)
            SettingsCard {
                if !hasActiveSubscription {
                    SettingsRowButton(title: "Upgrade",
                                      tone: .accent,
                                      trailing: nil,
                                      showDivider: false) {
                        showSubscription = true
                    }
                } else if let url = URL(string: "https://apps.apple.com/account/subscriptions") {
                    SettingsRowExternal(title: "Manage subscription",
                                        url: url,
                                        tone: .accent,
                                        showDivider: false)
                }
            }

            if hasActiveSubscription {
                SettingsNote(text: "Subscriptions purchased in the app are managed by Apple.")
            }

            // Apple Review 3.1.1 — Restore Purchases always-on so reinstall /
            // new-device flows can recover a previous purchase.
            SettingsSectionHeader(title: "Restore", tone: .normal)
            SettingsCard {
                SettingsRowButton(title: store.isLoading ? "Checking..." : "Restore purchases",
                                  tone: .accent,
                                  trailing: nil,
                                  showDivider: false) {
                    Task {
                        restoreMessage = nil
                        await store.restorePurchases()
                        if let err = store.errorMessage {
                            restoreMessage = err
                        } else {
                            restoreMessage = "Checked for purchases on your Apple ID."
                        }
                    }
                }
            }
            if let msg = restoreMessage {
                SettingsNote(text: msg)
            }

            SettingsSectionHeader(title: "Web billing", tone: .normal)
            SettingsCard {
                // Ext-J4 — derive from SupabaseManager.siteURL instead of
                // hardcoding production. Preview/staging builds open the
                // matching environment's billing surface.
                let billingURL = SupabaseManager.shared.siteURL
                    .appendingPathComponent("profile/settings/billing")
                SettingsRowExternal(title: "Open web billing",
                                    url: billingURL,
                                    tone: .accent,
                                    showDivider: false)
            }
            SettingsNote(text: "If you purchased your plan on the web, manage it from your account on the web.")
        }
        .sheet(isPresented: $showSubscription) { SubscriptionView().environmentObject(auth) }
        .task(id: perms.changeToken) {
            hasActiveSubscription = await PermissionService.shared.has("billing.subscription.view_own")
        }
    }
}

// MARK: - Notifications (Alerts)

struct NotificationsSettingsView: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    @State private var breakingAlerts = true
    @State private var morningDigest = true
    @State private var expertReplies = true
    @State private var commentReplies = true
    @State private var weeklyRecap = true
    @State private var loaded = false
    @State private var saving = false
    @StateObject private var push = PushPermission.shared
    @State private var showPushPrompt = false

    @StateObject private var perms = PermissionStore.shared
    @State private var canViewPrefs = false
    @State private var canTogglePush = false
    @State private var canToggleInApp = false

    var body: some View {
        SettingsPageShell(title: "Alerts") {
            if !canViewPrefs {
                SettingsNote(text: "Notifications preferences aren\u{2019}t available for your account.")
            } else {
                if canTogglePush {
                    SettingsSectionHeader(title: "Push", tone: .normal)
                    SettingsCard {
                        SettingsRowValue(title: "System permission",
                                         value: push.summary,
                                         valueColor: push.isOn ? VP.right : VP.dim,
                                         showDivider: push.status == .notDetermined || push.isDenied)
                        if push.status == .notDetermined {
                            SettingsRowButton(title: "Turn on notifications",
                                              tone: .accent,
                                              trailing: nil,
                                              showDivider: false) { showPushPrompt = true }
                        } else if push.isDenied {
                            // Once denied, iOS won't re-prompt — deep link to Settings.
                            SettingsRowButton(title: "Open iOS Settings",
                                              tone: .accent,
                                              trailing: nil,
                                              showDivider: false) { push.openSystemSettings() }
                        }
                    }
                    if push.isDenied {
                        SettingsNote(text: "Notifications are off for Verity Post. Open iOS Settings to turn them back on.")
                    }
                }

                if canToggleInApp {
                    SettingsSectionHeader(title: "What to send", tone: .normal)
                    SettingsCard {
                        SettingsToggleRow(title: "Breaking news alerts",
                                          subtitle: "Fast-moving stories",
                                          isOn: $breakingAlerts)
                        SettingsToggleRow(title: "Morning digest",
                                          subtitle: "One email per day",
                                          isOn: $morningDigest)
                        SettingsToggleRow(title: "Expert replies",
                                          subtitle: "When an expert answers your ask",
                                          isOn: $expertReplies)
                        SettingsToggleRow(title: "Replies to my comments",
                                          subtitle: nil,
                                          isOn: $commentReplies)
                        SettingsToggleRow(title: "Weekly recap",
                                          subtitle: "Your week in review",
                                          isOn: $weeklyRecap,
                                          showDivider: false)
                    }

                    VStack {
                        SettingsPrimaryButton(title: saving ? "Saving..." : "Save preferences",
                                              isLoading: saving,
                                              isDisabled: !loaded) {
                            Task { await save() }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                }

                SettingsNote(text: "These preferences control email digests and in-app alerts. Actual push delivery also requires system permission.")
            }
        }
        .task { await load() }
        .task(id: perms.changeToken) {
            canViewPrefs = await PermissionService.shared.has("notifications.prefs.view")
            canTogglePush = await PermissionService.shared.has("notifications.prefs.toggle_push")
            canToggleInApp = await PermissionService.shared.has("notifications.prefs.toggle_in_app")
        }
        .sheet(isPresented: $showPushPrompt) {
            PushPromptSheet(
                title: "Turn on notifications",
                detail: "We\u{2019}ll only notify you about things you\u{2019}ve subscribed to \u{2014} breaking news, expert replies, comment replies. You can change any of these below.",
                onEnable: {
                    await push.requestIfNeeded()
                    if push.isOn, let uid = auth.currentUser?.id {
                        PushRegistration.shared.setCurrentUser(uid)
                    }
                },
                onDecline: {
                    // H14 — stamp the decline; see PushPermission
                    // for the 7-day cooldown logic.
                    push.markPrePromptDeclined()
                }
            )
        }
    }

    private func load() async {
        guard let userId = auth.currentUser?.id else { loaded = true; return }
        // Round 6 iOS-DATA: `preferences` is a phantom column; real jsonb
        // lives at `users.metadata` (writes go through update_own_profile).
        struct Row: Decodable { let metadata: JSONValue? }
        if let row: Row = try? await client.from("users")
            .select("metadata")
            .eq("id", value: userId)
            .single().execute().value,
           let prefs = row.metadata?["notifications"]?.objectValue {
            breakingAlerts = prefs["breaking"]?.boolValue ?? true
            morningDigest = prefs["digest"]?.boolValue ?? true
            expertReplies = prefs["expert_reply"]?.boolValue ?? true
            commentReplies = prefs["comment_reply"]?.boolValue ?? true
            weeklyRecap = prefs["weekly_recap"]?.boolValue ?? true
        }
        await push.refresh()
        loaded = true
    }

    private func save() async {
        guard let userId = auth.currentUser?.id else { return }
        saving = true
        defer { saving = false }
        struct Row: Decodable { let metadata: JSONValue? }
        let existing: Row? = try? await client.from("users")
            .select("metadata").eq("id", value: userId).single().execute().value
        var merged: [String: Any] = existing?.metadata?.dictionary ?? [:]
        merged["notifications"] = [
            "breaking": breakingAlerts,
            "digest": morningDigest,
            "expert_reply": expertReplies,
            "comment_reply": commentReplies,
            "weekly_recap": weeklyRecap,
        ]
        do {
            let data = try JSONSerialization.data(withJSONObject: merged)
            let metadataValue = try JSONDecoder().decode(JSONValue.self, from: data)
            struct Args: Encodable { let p_fields: Patch }
            struct Patch: Encodable { let metadata: JSONValue }
            try await client.rpc(
                "update_own_profile",
                params: Args(p_fields: Patch(metadata: metadataValue))
            ).execute()
        } catch { Log.d("Save notif prefs error:", error) }
    }
}

// MARK: - Feed preferences

struct FeedPreferencesSettingsView: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    @State private var showBreaking = true
    @State private var showTrending = true
    @State private var showRecommended = true
    @State private var hideLowCred = false
    @State private var compactDisplay = false
    @State private var loaded = false
    @State private var saving = false

    var body: some View {
        SettingsPageShell(title: "Feed") {
            SettingsSectionHeader(title: "What surfaces", tone: .normal)
            SettingsCard {
                SettingsToggleRow(title: "Show breaking at top",
                                  subtitle: nil,
                                  isOn: $showBreaking)
                SettingsToggleRow(title: "Show trending",
                                  subtitle: nil,
                                  isOn: $showTrending)
                SettingsToggleRow(title: "Show recommended",
                                  subtitle: nil,
                                  isOn: $showRecommended,
                                  showDivider: false)
            }

            SettingsSectionHeader(title: "Filters", tone: .normal)
            SettingsCard {
                SettingsToggleRow(title: "Hide low-credibility stories",
                                  subtitle: nil,
                                  isOn: $hideLowCred,
                                  showDivider: false)
            }

            SettingsSectionHeader(title: "Display", tone: .normal)
            SettingsCard {
                SettingsToggleRow(title: "Compact layout",
                                  subtitle: "Tighter rows, smaller hero images",
                                  isOn: $compactDisplay,
                                  showDivider: false)
            }

            VStack {
                SettingsPrimaryButton(title: saving ? "Saving..." : "Save",
                                      isLoading: saving,
                                      isDisabled: !loaded) {
                    Task { await save() }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
        .task { await load() }
    }

    private func load() async {
        guard let userId = auth.currentUser?.id else { loaded = true; return }
        struct Row: Decodable { let metadata: JSONValue? }
        if let row: Row = try? await client.from("users")
            .select("metadata").eq("id", value: userId).single().execute().value,
           let feed = row.metadata?["feed"]?.objectValue {
            showBreaking = feed["showBreaking"]?.boolValue ?? true
            showTrending = feed["showTrending"]?.boolValue ?? true
            showRecommended = feed["showRecommended"]?.boolValue ?? true
            hideLowCred = feed["hideLowCred"]?.boolValue ?? false
            compactDisplay = (feed["display"]?.stringValue ?? "comfortable") == "compact"
        }
        loaded = true
    }

    private func save() async {
        guard let userId = auth.currentUser?.id else { return }
        saving = true
        defer { saving = false }
        struct Row: Decodable { let metadata: JSONValue? }
        let existing: Row? = try? await client.from("users")
            .select("metadata").eq("id", value: userId).single().execute().value
        var merged: [String: Any] = existing?.metadata?.dictionary ?? [:]
        merged["feed"] = [
            "showBreaking": showBreaking,
            "showTrending": showTrending,
            "showRecommended": showRecommended,
            "hideLowCred": hideLowCred,
            "display": compactDisplay ? "compact" : "comfortable",
        ]
        do {
            let data = try JSONSerialization.data(withJSONObject: merged)
            let metadataValue = try JSONDecoder().decode(JSONValue.self, from: data)
            struct Args: Encodable { let p_fields: Patch }
            struct Patch: Encodable { let metadata: JSONValue }
            try await client.rpc(
                "update_own_profile",
                params: Args(p_fields: Patch(metadata: metadataValue))
            ).execute()
        } catch { Log.d("Save feed prefs error:", error) }
    }
}

// MARK: - Verification request

struct VerificationRequestView: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    @State private var type = "expert"
    @State private var fullName = ""
    @State private var field = ""
    @State private var role = ""
    @State private var org = ""
    @State private var bio = ""
    @State private var portfolioURL = ""
    @State private var linkedin = ""
    @State private var existingStatus: String? = nil
    @State private var loaded = false
    @State private var submitting = false
    @State private var submittedMessage: String? = nil

    var body: some View {
        SettingsPageShell(title: "Verification") {
            if let s = existingStatus {
                SettingsSectionHeader(title: "Status", tone: .normal)
                SettingsCard {
                    SettingsRowValue(title: "Current status",
                                     value: s.capitalized,
                                     valueColor: s == "approved"
                                        ? VP.right
                                        : (s == "rejected" ? VP.wrong : VP.accent),
                                     showDivider: false)
                }
            }

            SettingsSectionHeader(title: "Type", tone: .normal)
            SettingsCard {
                Picker("", selection: $type) {
                    Text("Expert").tag("expert")
                    Text("Journalist").tag("journalist")
                    Text("Public figure").tag("public_figure")
                }
                .pickerStyle(.segmented)
                .padding(16)
            }

            SettingsSectionHeader(title: "About you", tone: .normal)
            SettingsCard {
                VStack(spacing: 14) {
                    // Round 6 iOS-DATA: `full_name` is NOT NULL in expert_applications.
                    SettingsTextField(label: "Full name",
                                      placeholder: "Jane Doe",
                                      text: $fullName,
                                      autocap: .words)
                    SettingsTextField(label: "Field / area",
                                      placeholder: "AI policy",
                                      text: $field)
                    SettingsTextField(label: "Role / title",
                                      placeholder: "Research Lead",
                                      text: $role)
                    SettingsTextField(label: "Organization (optional)",
                                      placeholder: "—",
                                      text: $org)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Short bio").font(.caption).foregroundColor(VP.dim)
                        TextField("Tell us about your work...", text: $bio, axis: .vertical)
                            .font(.system(size: 15))
                            .foregroundColor(VP.text)
                            .lineLimit(3...8)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 11)
                            .background(VP.bg)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border, lineWidth: 1))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
                .padding(16)
            }

            SettingsSectionHeader(title: "Links", tone: .normal)
            SettingsCard {
                VStack(spacing: 14) {
                    SettingsTextField(label: "Portfolio URL",
                                      placeholder: "https://",
                                      text: $portfolioURL,
                                      keyboard: .URL,
                                      autocap: .never,
                                      autocorrect: false)
                    SettingsTextField(label: "LinkedIn",
                                      placeholder: "https://linkedin.com/in/...",
                                      text: $linkedin,
                                      keyboard: .URL,
                                      autocap: .never,
                                      autocorrect: false)
                }
                .padding(16)
            }

            VStack(spacing: 10) {
                SettingsPrimaryButton(title: submitting ? "Submitting..." : "Submit application",
                                      isLoading: submitting,
                                      isDisabled: fullName.trimmingCharacters(in: .whitespaces).isEmpty
                                                  || field.isEmpty
                                                  || bio.isEmpty) {
                    Task { await submit() }
                }
                if let msg = submittedMessage {
                    Text(msg).font(.caption).foregroundColor(VP.right)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
        .task { await loadExisting() }
    }

    private func loadExisting() async {
        guard let userId = auth.currentUser?.id else { loaded = true; return }
        // Round 6 iOS-DATA: `submitted_at` is phantom; real ordering column is `created_at`.
        struct Row: Decodable { let status: String }
        let rows: [Row] = (try? await client.from("expert_applications")
            .select("status")
            .eq("user_id", value: userId)
            .order("created_at", ascending: false)
            .limit(1)
            .execute().value) ?? []
        existingStatus = rows.first?.status
        loaded = true
    }

    private func submit() async {
        guard auth.currentUser?.id != nil else { return }
        submitting = true
        defer { submitting = false }
        // Route through /api/expert/apply — gated on expert.application.apply,
        // dispatches to submit_expert_application RPC.
        struct ExpertApplyBody: Encodable {
            let application_type: String
            let full_name: String
            let organization: String?
            let title: String?
            let bio: String
            let social_links: [String: String]
            let portfolio_urls: [String]
        }

        var portfolios: [String] = []
        if !portfolioURL.trimmingCharacters(in: .whitespaces).isEmpty {
            portfolios.append(portfolioURL.trimmingCharacters(in: .whitespaces))
        }
        var socials: [String: String] = [:]
        if !linkedin.trimmingCharacters(in: .whitespaces).isEmpty {
            socials["linkedin"] = linkedin.trimmingCharacters(in: .whitespaces)
        }

        let body = ExpertApplyBody(
            application_type: type,
            full_name: fullName.trimmingCharacters(in: .whitespaces),
            organization: org.isEmpty ? nil : org,
            title: role.isEmpty ? nil : role,
            bio: bio,
            social_links: socials,
            portfolio_urls: portfolios
        )

        guard let session = try? await client.auth.session else { return }
        let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/expert/apply")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        do {
            req.httpBody = try JSONEncoder().encode(body)
            let (_, resp) = try await URLSession.shared.data(for: req)
            if let http = resp as? HTTPURLResponse, http.statusCode == 200 {
                submittedMessage = "Application received. We\u{2019}ll review within 5 business days."
                existingStatus = "pending"
            } else {
                Log.d("Verification submit non-200:", (resp as? HTTPURLResponse)?.statusCode as Any)
            }
        } catch { Log.d("Verification submit error:", error) }
    }
}

// MARK: - Expert settings (role=expert)

struct ExpertSettingsView: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    @State private var tagLimit: Int = 5
    @State private var notifPref: String = "tagged"
    @State private var loaded = false
    @State private var saving = false

    private let notifOptions = [
        ("all", "All queue questions"),
        ("tagged", "Only questions tagged to me"),
        ("both", "Both tagged and pool"),
        ("none", "None"),
    ]

    var body: some View {
        SettingsPageShell(title: "Expert") {
            SettingsSectionHeader(title: "Daily tag limit", tone: .normal)
            SettingsCard {
                HStack {
                    Text("\(tagLimit) / day")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(VP.text)
                    Spacer()
                    Stepper("", value: $tagLimit, in: 1...20).labelsHidden()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(minHeight: 44)
            }

            SettingsSectionHeader(title: "Question notifications", tone: .normal)
            SettingsCard {
                VStack(spacing: 0) {
                    ForEach(Array(notifOptions.enumerated()), id: \.element.0) { idx, pair in
                        Button { notifPref = pair.0 } label: {
                            HStack(spacing: 12) {
                                Image(systemName: notifPref == pair.0
                                      ? "largecircle.fill.circle"
                                      : "circle")
                                    .font(.system(size: 18, weight: .regular))
                                    .foregroundColor(notifPref == pair.0 ? VP.accent : VP.muted)
                                Text(pair.1)
                                    .font(.system(size: 15, weight: .regular))
                                    .foregroundColor(VP.text)
                                Spacer()
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                            .overlay(alignment: .bottom) {
                                if idx < notifOptions.count - 1 {
                                    Rectangle().fill(VP.border.opacity(0.6)).frame(height: 1).padding(.leading, 16)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            VStack {
                SettingsPrimaryButton(title: saving ? "Saving..." : "Save",
                                      isLoading: saving,
                                      isDisabled: !loaded) {
                    Task { await save() }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
        .task { await load() }
    }

    private func load() async {
        guard let userId = auth.currentUser?.id else { loaded = true; return }
        struct Row: Decodable { let metadata: JSONValue? }
        if let row: Row = try? await client.from("users")
            .select("metadata").eq("id", value: userId).single().execute().value,
           let expert = row.metadata?["expert"]?.objectValue {
            tagLimit = expert["tagLimit"]?.intValue ?? 5
            notifPref = expert["notifPref"]?.stringValue ?? "tagged"
        }
        loaded = true
    }

    private func save() async {
        guard let userId = auth.currentUser?.id else { return }
        saving = true
        defer { saving = false }
        struct Row: Decodable { let metadata: JSONValue? }
        let existing: Row? = try? await client.from("users")
            .select("metadata").eq("id", value: userId).single().execute().value
        var merged: [String: Any] = existing?.metadata?.dictionary ?? [:]
        merged["expert"] = ["tagLimit": tagLimit, "notifPref": notifPref]
        do {
            let data = try JSONSerialization.data(withJSONObject: merged)
            let metadataValue = try JSONDecoder().decode(JSONValue.self, from: data)
            struct Args: Encodable { let p_fields: Patch }
            struct Patch: Encodable { let metadata: JSONValue }
            try await client.rpc(
                "update_own_profile",
                params: Args(p_fields: Patch(metadata: metadataValue))
            ).execute()
        } catch { Log.d("Save expert prefs error:", error) }
    }
}

// MARK: - Data & Privacy

struct DataPrivacyView: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    @State private var exportRequested = false
    @State private var showDeleteConfirm = false
    @State private var deleteSubmitted = false
    // Task 62 — DM read receipts opt-out (migration 044).
    @State private var dmReceiptsEnabled = true
    @State private var dmReceiptsLoading = true
    @StateObject private var perms = PermissionStore.shared
    @State private var canExport = false

    var body: some View {
        SettingsPageShell(title: "Data & Privacy") {
            SettingsSectionHeader(title: "Messages", tone: .normal)
            SettingsCard {
                SettingsToggleRow(title: "DM read receipts",
                                  subtitle: "Let senders see when you\u{2019}ve read their messages",
                                  isOn: $dmReceiptsEnabled,
                                  isDisabled: dmReceiptsLoading,
                                  showDivider: false)
                    .onChange(of: dmReceiptsEnabled) { _, newValue in
                        Task { await saveDmReceiptsPref(newValue) }
                    }
            }

            if canExport {
                SettingsSectionHeader(title: "Your data", tone: .normal)
                SettingsCard {
                    SettingsRowButton(title: exportRequested ? "Export requested"
                                                             : "Request data export",
                                      tone: exportRequested ? .normal : .accent,
                                      trailing: nil,
                                      showDivider: false) {
                        Task { await requestExport() }
                    }
                }
                if exportRequested {
                    SettingsNote(text: "We\u{2019}ll email you a downloadable archive within 30 days, per GDPR.")
                }
            }

            SettingsSectionHeader(title: "Delete account", tone: .danger)
            SettingsCard {
                SettingsRowButton(title: "Delete my account",
                                  tone: .destructive,
                                  trailing: nil,
                                  showDivider: false) {
                    UINotificationFeedbackGenerator().notificationOccurred(.warning)
                    showDeleteConfirm = true
                }
            }
            if deleteSubmitted {
                SettingsNote(text: "Request submitted. Your account will be deleted within 30 days; log back in to cancel.")
            }

            SettingsNote(text: "Data requests and deletions are processed via the data_requests queue. This complies with GDPR and CCPA obligations.")
        }
        .task { await loadDmReceiptsPref() }
        .task(id: perms.changeToken) {
            canExport = await PermissionService.shared.has("settings.data.request_export")
        }
        .alert("Delete account?", isPresented: $showDeleteConfirm) {
            Button("Delete", role: .destructive) { Task { await requestDeletion() } }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("This submits a deletion request. Your account and data will be removed within 30 days. You can cancel by logging back in before then.")
        }
    }

    private func loadDmReceiptsPref() async {
        guard let userId = auth.currentUser?.id else { dmReceiptsLoading = false; return }
        struct Row: Decodable { let dm_read_receipts_enabled: Bool? }
        let r: [Row] = (try? await client.from("users")
            .select("dm_read_receipts_enabled")
            .eq("id", value: userId)
            .execute().value) ?? []
        dmReceiptsEnabled = r.first?.dm_read_receipts_enabled ?? true
        dmReceiptsLoading = false
    }

    private func saveDmReceiptsPref(_ newValue: Bool) async {
        guard auth.currentUser?.id != nil else { return }
        struct Args: Encodable { let p_fields: Patch }
        struct Patch: Encodable { let dm_read_receipts_enabled: Bool }
        do {
            try await client.rpc(
                "update_own_profile",
                params: Args(p_fields: Patch(dm_read_receipts_enabled: newValue))
            ).execute()
        } catch {
            Log.d("saveDmReceiptsPref error: \(error)")
        }
    }

    private func requestExport() async {
        guard let userId = auth.currentUser?.id else { return }
        struct Entry: Encodable { let user_id: String; let type: String }
        do {
            try await client.from("data_requests")
                .insert(Entry(user_id: userId, type: "export"))
                .execute()
            exportRequested = true
        } catch { Log.d("Data export request error:", error) }
    }

    private func requestDeletion() async {
        guard let session = try? await client.auth.session else { return }
        let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/account/delete")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = "{}".data(using: .utf8)
        do {
            let (_, resp) = try await URLSession.shared.data(for: req)
            if let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode) {
                deleteSubmitted = true
            } else {
                Log.d("account delete request non-2xx")
            }
        } catch { Log.d("Data deletion request error:", error) }
    }
}

// MARK: - Feedback sheet

struct FeedbackSheet: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client
    @Environment(\.dismiss) private var dismiss

    @State private var category = "bug"
    @State private var message: String = ""
    @State private var submitting = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    SettingsSectionHeader(title: "Category", tone: .normal)
                    SettingsCard {
                        Picker("", selection: $category) {
                            Text("Bug").tag("bug")
                            Text("Feature").tag("feature_request")
                            Text("Other").tag("other")
                        }
                        .pickerStyle(.segmented)
                        .padding(16)
                    }

                    SettingsSectionHeader(title: "Your feedback", tone: .normal)
                    SettingsCard {
                        TextField("Tell us what\u{2019}s up...", text: $message, axis: .vertical)
                            .font(.system(size: 15))
                            .foregroundColor(VP.text)
                            .lineLimit(4...10)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 11)
                            .background(VP.bg)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border, lineWidth: 1))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .padding(16)
                    }

                    VStack {
                        SettingsPrimaryButton(title: submitting ? "Sending..." : "Send",
                                              isLoading: submitting,
                                              isDisabled: message.trimmingCharacters(in: .whitespaces).isEmpty) {
                            Task { await submit() }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)

                    Color.clear.frame(height: 24)
                }
            }
            .background(VP.bg.ignoresSafeArea())
            .navigationTitle("Send feedback")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }.foregroundColor(VP.text)
                }
            }
        }
    }

    private func submit() async {
        guard auth.currentUser?.id != nil else { return }
        submitting = true
        defer { submitting = false }
        // Round 6 iOS-DATA: /api/support handles the two-table insert
        // (support_tickets + ticket_messages).
        struct SupportBody: Encodable {
            let category: String
            let subject: String
            let description: String
        }
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let subject = String(trimmed.prefix(80))
        let body = SupportBody(category: category, subject: subject, description: trimmed)

        guard let session = try? await client.auth.session else { return }
        let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/support")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        do {
            req.httpBody = try JSONEncoder().encode(body)
            let (_, resp) = try await URLSession.shared.data(for: req)
            if let http = resp as? HTTPURLResponse, http.statusCode == 200 {
                dismiss()
            } else {
                Log.d("Feedback submit non-200:", (resp as? HTTPURLResponse)?.statusCode as Any)
            }
        } catch { Log.d("Feedback submit error:", error) }
    }
}

// MARK: - Minimal JSONValue (decodes jsonb from Supabase without a fixed schema)

indirect enum JSONValue: Codable {
    case string(String), int(Int), double(Double), bool(Bool), null
    case array([JSONValue]), object([String: JSONValue])

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let s): try c.encode(s)
        case .int(let i): try c.encode(i)
        case .double(let d): try c.encode(d)
        case .bool(let b): try c.encode(b)
        case .null: try c.encodeNil()
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let b = try? c.decode(Bool.self) { self = .bool(b); return }
        if let i = try? c.decode(Int.self) { self = .int(i); return }
        if let d = try? c.decode(Double.self) { self = .double(d); return }
        if let s = try? c.decode(String.self) { self = .string(s); return }
        if let a = try? c.decode([JSONValue].self) { self = .array(a); return }
        if let o = try? c.decode([String: JSONValue].self) { self = .object(o); return }
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unknown JSON value")
    }

    subscript(key: String) -> JSONValue? {
        if case .object(let o) = self { return o[key] }
        return nil
    }

    var stringValue: String? { if case .string(let s) = self { return s } else { return nil } }
    var intValue: Int? {
        switch self {
        case .int(let i): return i
        case .double(let d): return Int(d)
        case .string(let s): return Int(s)
        default: return nil
        }
    }
    var boolValue: Bool? {
        switch self {
        case .bool(let b): return b
        case .string(let s): return s == "true" || s == "1"
        case .int(let i): return i != 0
        default: return nil
        }
    }
    var objectValue: [String: JSONValue]? { if case .object(let o) = self { return o } else { return nil } }
    var dictionary: [String: Any]? {
        guard case .object(let o) = self else { return nil }
        var out: [String: Any] = [:]
        for (k, v) in o { out[k] = v.anyValue }
        return out
    }
    var anyValue: Any {
        switch self {
        case .string(let s): return s
        case .int(let i): return i
        case .double(let d): return d
        case .bool(let b): return b
        case .null: return NSNull()
        case .array(let a): return a.map { $0.anyValue }
        case .object(let o):
            var out: [String: Any] = [:]
            for (k, v) in o { out[k] = v.anyValue }
            return out
        }
    }
}

// MARK: - Apple Guideline 1.2 — Blocked Accounts management

/// Settings → Blocked accounts. Lists every user the current viewer has
/// blocked, with an Unblock action per row. Sourced from
/// GET /api/users/blocked (server-side filter on `blocker_id = auth.uid()`)
/// and mutated through DELETE /api/users/[id]/block.
struct BlockedAccountsView: View {
    @EnvironmentObject var auth: AuthViewModel
    @StateObject private var blocks = BlockService.shared

    struct BlockedRow: Decodable, Identifiable {
        let id: String
        let blocked_id: String?
        let username: String?
        let avatar_color: String?
        let created_at: String?
        let reason: String?
    }

    @State private var rows: [BlockedRow] = []
    @State private var loading = true
    @State private var loadError: String? = nil
    @State private var busyId: String? = nil

    var body: some View {
        SettingsPageShell(title: "Blocked accounts") {
            if loading {
                ProgressView().padding(.top, 40)
            } else if let err = loadError {
                VStack(spacing: 8) {
                    Text("Couldn\u{2019}t load blocks")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(VP.text)
                    Text(err).font(.caption).foregroundColor(VP.dim)
                    Button("Try again") { Task { await load() } }
                        .foregroundColor(VP.accent)
                }
                .padding(.top, 60)
                .frame(maxWidth: .infinity)
            } else if rows.isEmpty {
                VStack(spacing: 6) {
                    Text("No blocks")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(VP.text)
                    Text("People you block will appear here.")
                        .font(.caption).foregroundColor(VP.dim)
                }
                .padding(.top, 60)
                .frame(maxWidth: .infinity)
            } else {
                SettingsSectionHeader(title: "Blocked", tone: .normal)
                SettingsCard {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { idx, row in
                        HStack(spacing: 12) {
                            Circle()
                                .fill(Color(hex: row.avatar_color ?? "cccccc"))
                                .frame(width: 36, height: 36)
                                .overlay(
                                    Text(String((row.username ?? "?").prefix(1)).uppercased())
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(.white)
                                )
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.username.map { "@\($0)" } ?? "Unknown user")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(VP.text)
                                if let r = row.reason, !r.isEmpty {
                                    Text(r).font(.caption).foregroundColor(VP.dim)
                                }
                            }
                            Spacer()
                            Button {
                                if let target = row.blocked_id {
                                    Task { await unblock(rowId: row.id, targetId: target) }
                                }
                            } label: {
                                Text(busyId == row.id ? "\u{2026}" : "Unblock")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(VP.accent)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .overlay(RoundedRectangle(cornerRadius: 99)
                                        .stroke(VP.border, lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                            .disabled(busyId == row.id || row.blocked_id == nil)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .frame(minHeight: 44)
                        .overlay(alignment: .bottom) {
                            if idx < rows.count - 1 {
                                Rectangle().fill(VP.border.opacity(0.6)).frame(height: 1).padding(.leading, 16)
                            }
                        }
                    }
                }
            }
        }
        .task { await load() }
    }

    private func load() async {
        loading = true
        loadError = nil
        do {
            guard let session = try? await SupabaseManager.shared.client.auth.session else {
                loadError = "Sign in to view blocks."
                loading = false
                return
            }
            let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/users/blocked")
            var req = URLRequest(url: url)
            req.httpMethod = "GET"
            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                loadError = "Couldn\u{2019}t load blocks."
                loading = false
                return
            }
            struct Resp: Decodable { let blocks: [BlockedRow] }
            rows = (try? JSONDecoder().decode(Resp.self, from: data).blocks) ?? []
        } catch {
            loadError = "Couldn\u{2019}t load blocks."
        }
        loading = false
    }

    private func unblock(rowId: String, targetId: String) async {
        busyId = rowId
        let ok = await BlockService.shared.unblock(targetId: targetId)
        await MainActor.run {
            if ok { rows.removeAll { $0.id == rowId } }
            busyId = nil
        }
    }
}
