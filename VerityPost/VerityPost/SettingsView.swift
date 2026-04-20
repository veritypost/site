import SwiftUI
import Supabase
import UIKit

// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18

// MARK: - Settings hub

struct SettingsView: View {
    @EnvironmentObject var auth: AuthViewModel
    @StateObject private var perms = PermissionStore.shared
    private let client = SupabaseManager.shared.client

    @State private var showFeedback = false
    @State private var canViewExpertSettings: Bool = false
    @State private var canApplyExpert: Bool = false
    @State private var canEditProfile: Bool = false
    @State private var canEditEmail: Bool = false
    @State private var canChangePassword: Bool = false
    @State private var canViewMFA: Bool = false
    @State private var canViewLoginActivity: Bool = false
    @State private var canViewBilling: Bool = false
    @State private var canViewFeedPrefs: Bool = false
    @State private var canViewDataPrivacy: Bool = false

    var body: some View {
        Form {
            if let u = auth.currentUser {
                Section {
                    HStack(spacing: 12) {
                        AvatarView(user: u, size: 44)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(u.username ?? "").font(.system(.callout, design: .default, weight: .bold))
                            Text(u.email ?? "").font(.caption).foregroundColor(VP.dim)
                        }
                        Spacer()
                        Text(u.planDisplay)
                            .font(.system(.caption, design: .default, weight: .semibold))
                            .foregroundColor(VP.accent)
                            .padding(.horizontal, 10).padding(.vertical, 4)
                            .background(VP.accent.opacity(0.1))
                            .cornerRadius(10)
                    }
                    .padding(.vertical, 4)
                }
            }

            if canEditProfile || canEditEmail || canChangePassword {
                Section("Account") {
                    if canEditProfile {
                        NavigationLink("Profile", destination: AccountSettingsView())
                    }
                    if canEditEmail {
                        NavigationLink("Email", destination: EmailSettingsView())
                    }
                    if canChangePassword {
                        NavigationLink("Password", destination: PasswordSettingsView())
                    }
                }
            }

            if canViewMFA || canViewLoginActivity {
                Section("Security") {
                    if canViewMFA {
                        NavigationLink("Two-Factor Authentication", destination: MFASettingsView())
                    }
                    if canViewLoginActivity {
                        NavigationLink("Sign-in Activity", destination: LoginActivityView())
                    }
                }
            }

            Section("Messages") {
                NavigationLink("Inbox", destination: MessagesView().environmentObject(auth))
            }

            if canViewBilling {
                Section("Subscription") {
                    NavigationLink("Manage Plan", destination: SubscriptionSettingsView())
                }
            }

            if canViewFeedPrefs {
                Section("Preferences") {
                    NavigationLink("Notifications", destination: NotificationsSettingsView())
                    NavigationLink("Feed Preferences", destination: FeedPreferencesSettingsView())
                }
            } else {
                Section("Preferences") {
                    NavigationLink("Notifications", destination: NotificationsSettingsView())
                }
            }

            Section("Family") {
                Text("Manage kid profiles from the Kids tab on your profile.")
                    .font(.caption)
                    .foregroundColor(VP.dim)
            }

            Section("Application") {
                NavigationLink("Verification", destination: VerificationRequestView())
                if canViewExpertSettings {
                    NavigationLink("Expert Settings", destination: ExpertSettingsView())
                } else if canApplyExpert {
                    Link(
                        "Apply to be an Expert",
                        destination: SupabaseManager.shared.siteURL.appendingPathComponent("signup/expert")
                    )
                    .foregroundColor(VP.accent)
                }
            }

            Section("Help & Info") {
                Button("Send Feedback") { showFeedback = true }
                    .foregroundColor(VP.text)
                HStack {
                    Text("Version")
                    Spacer()
                    Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—")
                        .foregroundColor(VP.dim)
                }
            }

            if canViewDataPrivacy {
                Section("Data & Privacy") {
                    NavigationLink("Export / Delete Data", destination: DataPrivacyView())
                }
            }

            Section {
                Button("Sign out", role: .destructive) {
                    Task { await auth.logout() }
                }
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showFeedback) { FeedbackSheet() }
        .task(id: perms.changeToken) {
            canViewExpertSettings = await PermissionService.shared.has("settings.expert.view")
            canApplyExpert = await PermissionService.shared.has("expert.application.apply")
            canEditProfile = await PermissionService.shared.has("settings.view")
            canEditEmail = await PermissionService.shared.has("settings.account.edit_email")
            canChangePassword = await PermissionService.shared.has("settings.account.change_password")
            canViewMFA = await PermissionService.shared.has("settings.account.2fa.enable")
            canViewLoginActivity = await PermissionService.shared.has("settings.login_activity.view")
            canViewBilling = await PermissionService.shared.has("billing.view.plan")
            canViewFeedPrefs = await PermissionService.shared.has("settings.feed.view")
            canViewDataPrivacy = await PermissionService.shared.has("settings.data.request_export")
        }
    }
}

// MARK: - Account (profile fields)

struct AccountSettingsView: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client
    @Environment(\.dismiss) var dismiss

    @State private var username = ""
    @State private var bio = ""
    @State private var location = ""
    @State private var website = ""

    // Two-tone avatar
    @State private var avatarOuter = "#818cf8"
    @State private var avatarInner: String? = nil  // nil = transparent
    @State private var avatarInitials = ""
    @State private var initialsError: String? = nil

    @State private var saving = false
    @State private var saved = false

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
        Form {
            Section("Avatar") {
                HStack(alignment: .top, spacing: 16) {
                    AvatarView(outerHex: avatarOuter, innerHex: avatarInner, initials: previewInitials, size: 72)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Up to 3 characters, letters and numbers only.")
                            .font(.caption)
                            .foregroundColor(VP.dim)
                        TextField("ABC", text: $avatarInitials)
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled(true)
                            .onChange(of: avatarInitials) { _, new in
                                let clean = new.uppercased()
                                    .filter { $0.isLetter || $0.isNumber }
                                    .prefix(3)
                                let cleanStr = String(clean)
                                if cleanStr != new { avatarInitials = cleanStr }
                                initialsError = (new.count > 0 && cleanStr.isEmpty) ? "Only letters and numbers." : nil
                            }
                        if let err = initialsError {
                            Text(err).font(.caption).foregroundColor(VP.wrong)
                        }
                    }
                }
                .padding(.vertical, 4)

                Text("Ring color").font(.caption).foregroundColor(VP.dim)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 6), spacing: 8) {
                    ForEach(colorOptions, id: \.self) { color in
                        Circle().fill(Color(hex: color)).frame(width: 32, height: 32)
                            .overlay(Circle().stroke(VP.text, lineWidth: avatarOuter == color ? 3 : 0))
                            .onTapGesture { avatarOuter = color }
                    }
                }
                .padding(.bottom, 8)

                Text("Inner fill").font(.caption).foregroundColor(VP.dim)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 6), spacing: 8) {
                    // Transparent option
                    ZStack {
                        Circle().fill(Color.white)
                        Circle().strokeBorder(VP.border, style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
                    }
                    .frame(width: 32, height: 32)
                    .overlay(Circle().stroke(VP.text, lineWidth: avatarInner == nil ? 3 : 0))
                    .onTapGesture { avatarInner = nil }

                    ForEach(colorOptions, id: \.self) { color in
                        Circle().fill(Color(hex: color)).frame(width: 32, height: 32)
                            .overlay(Circle().stroke(VP.text, lineWidth: avatarInner == color ? 3 : 0))
                            .onTapGesture { avatarInner = color }
                    }
                }
                .padding(.vertical, 4)
            }

            Section("Identity") {
                HStack {
                    Text("Username").foregroundColor(VP.dim); Spacer()
                    TextField("username", text: $username).multilineTextAlignment(.trailing)
                        .textInputAutocapitalization(.never)
                }
                HStack {
                    Text("Location").foregroundColor(VP.dim); Spacer()
                    TextField("City, Country", text: $location).multilineTextAlignment(.trailing)
                }
                HStack {
                    Text("Website").foregroundColor(VP.dim); Spacer()
                    TextField("https://", text: $website).multilineTextAlignment(.trailing)
                        .keyboardType(.URL).textInputAutocapitalization(.never)
                }
            }

            Section("Bio") {
                TextField("Tell us about yourself...", text: $bio, axis: .vertical).lineLimit(3...8)
            }

            Section {
                Button { Task { await save() } } label: {
                    HStack {
                        Spacer()
                        Text(saving ? "Saving..." : (saved ? "Saved" : "Save Changes"))
                            .fontWeight(.bold).foregroundColor(.white)
                        Spacer()
                    }
                    .padding(.vertical, 4)
                }
                .listRowBackground(saving ? VP.dim : VP.accent)
                .disabled(saving || username.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            username = auth.currentUser?.username ?? ""
            avatarOuter = auth.currentUser?.avatarColor ?? "#818cf8"
        }
    }

    private func save() async {
        guard let userId = auth.currentUser?.id else { return }
        saving = true
        defer { saving = false }

        // Round 5 Item 2: single server-side write contract via
        // update_own_profile RPC (SECDEF, 20-column allowlist, server-side
        // metadata deep-merge). Routes location/website/avatar into
        // metadata because public.users has no first-class columns for
        // those — mirrors what the web profile settings card does and
        // closes the latent phantom-column typo that silently no-op'd the
        // previous FullUpdate / LegacyUpdate catch-fallback pattern.
        struct AvatarJSON: Encodable { let outer: String; let inner: String?; let initials: String }
        struct MetadataPatch: Encodable {
            let avatar: AvatarJSON
            let location: String
            let website: String
        }
        // Round 11 P1: `avatar_url` is the canonical column the web app
        // writes and the rest of the app reads (leaderboard, comments, etc).
        // No uploader UI exists on iOS yet (color + initials only) — when
        // one lands, wire the uploaded URL into `avatarUrl` below. Sending
        // nil is safe because `update_own_profile` uses COALESCE and
        // preserves the existing column value when a key is null (Round 5
        // Item 2). `avatar_url` is in the RPC allowlist.
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
        // No upload UI yet — forward nil so the COALESCE in the RPC keeps
        // whatever value is already stored server-side.
        let avatarUrl: String? = nil

        do {
            let args = Args(p_fields: ProfilePatch(
                username: username,
                bio: bio,
                avatar_color: avatarOuter,
                avatar_url: avatarUrl,
                metadata: MetadataPatch(
                    avatar: AvatarJSON(outer: avatarOuter, inner: avatarInner, initials: initials),
                    location: location,
                    website: website
                )
            ))
            try await client.rpc("update_own_profile", params: args).execute()
        } catch {
            Log.d("Save profile error:", error)
            return
        }

        await auth.loadUser(id: userId)
        saved = true
        try? await Task.sleep(nanoseconds: 1_200_000_000)
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
        Form {
            Section("Current Email") {
                HStack {
                    Text(auth.currentUser?.email ?? "—").foregroundColor(VP.text)
                    Spacer()
                }
            }
            Section("Change Email") {
                TextField("New email address", text: $newEmail)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                Button(submitting ? "Sending..." : "Send verification link") {
                    Task { await requestChange() }
                }
                .disabled(submitting || !newEmail.contains("@"))
            }
            if let s = status {
                Section {
                    Text(s).font(.caption).foregroundColor(isError ? VP.wrong : VP.right)
                }
            }
            Section {
                Text("Supabase will send a verification link to your new address. Your email won't change until you click the link.")
                    .font(.caption).foregroundColor(VP.dim)
            }
        }
        .navigationTitle("Email")
        .navigationBarTitleDisplayMode(.inline)
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
        Form {
            Section("New Password") {
                SecureField("New password (min 8 chars)", text: $newPassword)
                SecureField("Confirm new password", text: $confirmPassword)
            }
            Section {
                Button(submitting ? "Updating..." : "Update password") {
                    Task { await submit() }
                }
                .disabled(submitting || newPassword.count < 8 || newPassword != confirmPassword)
            }
            if let s = status {
                Section {
                    Text(s).font(.caption).foregroundColor(isError ? VP.wrong : VP.right)
                }
            }
            Section {
                Text("Password must be at least 8 characters. Use a passphrase or a password manager — good security starts here.")
                    .font(.caption).foregroundColor(VP.dim)
            }
        }
        .navigationTitle("Password")
        .navigationBarTitleDisplayMode(.inline)
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
        List {
            if !loaded {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            } else if rows.isEmpty {
                Text("No recent sign-in activity.")
                    .font(.footnote).foregroundColor(VP.dim)
            } else {
                ForEach(rows) { r in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(r.action.replacingOccurrences(of: "_", with: " ").capitalized)
                                .font(.system(.subheadline, design: .default, weight: .semibold))
                            Spacer()
                            Text(Self.formatDate(r.created_at))
                                .font(.caption)
                                .foregroundColor(VP.dim)
                        }
                        if let m = r.metadata {
                            Text([m.device, m.browser, m.ip].compactMap { $0 }.joined(separator: " · "))
                                .font(.caption)
                                .foregroundColor(VP.dim)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
        .navigationTitle("Sign-in Activity")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private static func formatDate(_ iso: String?) -> String {
        guard let s = iso, let date = ISO8601DateFormatter().date(from: s) else { return "" }
        let f = DateFormatter(); f.dateFormat = "MMM d · h:mm a"
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
        Form {
            if !loaded {
                Section { ProgressView().frame(maxWidth: .infinity) }
            } else if let fid = verifiedFactorId {
                Section("Enabled") {
                    Text("Two-factor authentication is on. You'll be asked for a code each time you sign in.")
                        .font(.caption).foregroundColor(VP.soft)
                    Text("Factor ID: \(String(fid.prefix(8)))…")
                        .font(.system(.caption, design: .monospaced))
                        .foregroundColor(VP.dim)
                    Button(busy ? "Disabling..." : "Disable Two-Factor", role: .destructive) {
                        Task { await disable(factorId: fid) }
                    }
                    .disabled(busy)
                }
                if let s = status {
                    Section { Text(s).font(.caption).foregroundColor(isError ? VP.wrong : VP.right) }
                }
            } else {
                Section("Set Up") {
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
                        Button(busy ? "Generating..." : "Generate setup code") {
                            Task { await startEnroll() }
                        }
                        .disabled(busy)
                    }
                }
                if pendingFactorId != nil {
                    Section("Verify") {
                        TextField("6-digit code", text: $code)
                            .keyboardType(.numberPad)
                            .font(.system(.headline, design: .monospaced))
                            .onChange(of: code) { _, new in
                                let digits = new.filter { $0.isNumber }
                                if digits != new { code = String(digits.prefix(6)) }
                                else if digits.count > 6 { code = String(digits.prefix(6)) }
                            }
                        Button(busy ? "Verifying..." : "Verify & Enable") {
                            Task { await verify() }
                        }
                        .disabled(busy || code.count != 6)
                    }
                }
                if let s = status {
                    Section { Text(s).font(.caption).foregroundColor(isError ? VP.wrong : VP.right) }
                }
            }
        }
        .navigationTitle("Two-Factor")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            let factors = try await client.auth.mfa.listFactors()
            if let v = factors.totp.first(where: { $0.status == .verified }) {
                verifiedFactorId = "\(v.id)"
            } else if let p = factors.totp.first(where: { $0.status == .unverified }) {
                pendingFactorId = "\(p.id)"
                // listFactors does not return the TOTP URI or secret — user
                // has to tap "Generate" to start a fresh enrollment if needed.
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
    @State private var showSubscription = false
    // Drives the Upgrade-vs-Manage affordance. `true` = active paid plan
    // (show manage), `false` = free/lapsed (show upgrade CTA). Populated
    // via PermissionService so admin toggles affect this immediately.
    @State private var hasActiveSubscription: Bool = false

    var body: some View {
        Form {
            Section("Current Plan") {
                HStack {
                    Text("Plan")
                    Spacer()
                    Text(auth.currentUser?.planDisplay ?? "Free")
                        .foregroundColor(VP.accent).fontWeight(.semibold)
                }
                HStack {
                    Text("Status")
                    Spacer()
                    Text(hasActiveSubscription ? "Active" : "No active subscription")
                        .foregroundColor(VP.dim)
                }
            }

            Section("Billing") {
                if !hasActiveSubscription {
                    Button("Upgrade") { showSubscription = true }
                        .foregroundColor(VP.accent)
                        .fontWeight(.semibold)
                } else {
                    Button("Manage Subscription") {
                        if let url = URL(string: "https://apps.apple.com/account/subscriptions") {
                            UIApplication.shared.open(url)
                        }
                    }
                    .foregroundColor(VP.accent)
                    Text("Subscriptions purchased in the app are managed by Apple.")
                        .font(.caption)
                        .foregroundColor(VP.dim)
                }
            }

            Section {
                Text("If you purchased your plan on the web, manage it at veritypost.com/profile/settings/billing.")
                    .font(.caption)
                    .foregroundColor(VP.dim)
                Button("Open web billing") {
                    if let url = URL(string: "https://veritypost.com/profile/settings/billing") {
                        UIApplication.shared.open(url)
                    }
                }
                .foregroundColor(VP.accent)
            }
        }
        .navigationTitle("Subscription")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showSubscription) { SubscriptionView().environmentObject(auth) }
        .task(id: perms.changeToken) {
            // `billing.subscription.view_own` is granted for active paid
            // plans in `compute_effective_perms`; free/lapsed users don't
            // get it, which is exactly the Upgrade-CTA condition.
            hasActiveSubscription = await PermissionService.shared.has("billing.subscription.view_own")
        }
    }
}

// MARK: - Notifications
// @feature-verified notifications 2026-04-18
// Push row self-gates on notifications.prefs.toggle_push; in-app toggles
// on notifications.prefs.toggle_in_app. Section disappears entirely for
// users without notifications.prefs.view.

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
        Form {
            if !canViewPrefs {
                Section {
                    Text("Notifications preferences aren\u{2019}t available for your account.")
                        .font(.caption)
                        .foregroundColor(VP.dim)
                }
            } else {
                if canTogglePush {
                    Section("Push") {
                        HStack {
                            Text("System permission")
                            Spacer()
                            Text(push.summary)
                                .foregroundColor(push.isOn ? VP.right : VP.dim)
                                .font(.caption)
                        }
                        if push.status == .notDetermined {
                            Button("Turn on notifications") { showPushPrompt = true }
                                .foregroundColor(VP.accent)
                        } else if push.isDenied {
                            // Once denied, iOS won't show the dialog again — only
                            // Settings.app can flip it back on.
                            Button("Open iOS Settings") { push.openSystemSettings() }
                                .foregroundColor(VP.accent)
                            Text("Notifications are off for Verity Post. Open iOS Settings to turn them back on.")
                                .font(.caption)
                                .foregroundColor(VP.dim)
                        }
                    }
                }

                if canToggleInApp {
                    Section("What to send") {
                        Toggle("Breaking news alerts", isOn: $breakingAlerts)
                        Toggle("Morning digest", isOn: $morningDigest)
                        Toggle("Expert answered my question", isOn: $expertReplies)
                        Toggle("Replies to my comments", isOn: $commentReplies)
                        Toggle("Weekly recap", isOn: $weeklyRecap)
                    }

                    Section {
                        Button(saving ? "Saving..." : "Save preferences") { Task { await save() } }
                            .disabled(saving || !loaded)
                    }
                }

                Section {
                    Text("These preferences control email digests and in-app alerts. Actual push delivery also requires system permission.")
                        .font(.caption).foregroundColor(VP.dim)
                }
            }
        }
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .task(id: perms.changeToken) {
            canViewPrefs = await PermissionService.shared.has("notifications.prefs.view")
            canTogglePush = await PermissionService.shared.has("notifications.prefs.toggle_push")
            canToggleInApp = await PermissionService.shared.has("notifications.prefs.toggle_in_app")
        }
        .sheet(isPresented: $showPushPrompt) {
            PushPromptSheet(
                title: "Turn on notifications",
                detail: "We'll only notify you about things you've subscribed to \u{2014} breaking news, expert replies, comment replies. You can change any of these below.",
                onEnable: {
                    await push.requestIfNeeded()
                    if push.isOn, let uid = auth.currentUser?.id {
                        PushRegistration.shared.setCurrentUser(uid)
                    }
                },
                onDecline: {}
            )
        }
    }

    private func load() async {
        guard let userId = auth.currentUser?.id else { loaded = true; return }
        // Load existing preferences
        // Round 6 iOS-DATA: `preferences` is a phantom column on `users`; the
        // real jsonb holder is `metadata` (Round 5 Item 2 already routed writes
        // through `update_own_profile` storing at `metadata.notifications`).
        // Reads now mirror by selecting `metadata` and drilling into the
        // same sub-key namespace.
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
        // Round 6 iOS-DATA: read-back merges the current metadata blob
        // (not the phantom `preferences` column) so sibling keys survive.
        struct Row: Decodable { let metadata: JSONValue? }
        let existing: Row? = try? await client.from("users")
            .select("metadata").eq("id", value: userId).single().execute().value
        var merged: [String: Any] = [:]
        if let prefs = existing?.metadata?.dictionary {
            merged = prefs
        }
        merged["notifications"] = [
            "breaking": breakingAlerts,
            "digest": morningDigest,
            "expert_reply": expertReplies,
            "comment_reply": commentReplies,
            "weekly_recap": weeklyRecap,
        ]
        do {
            // Round 5 Item 2: fixes the latent `preferences` -> `metadata`
            // column typo AND gates through the SECDEF RPC. The RPC
            // server-side-merges metadata at the top level so the re-read
            // at line ~890 stays defensive but no longer races.
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
        Form {
            Section("Feed") {
                Toggle("Show breaking stories at top", isOn: $showBreaking)
                Toggle("Show trending stories", isOn: $showTrending)
                Toggle("Show recommended stories", isOn: $showRecommended)
            }
            Section("Filters") {
                Toggle("Hide low-credibility stories", isOn: $hideLowCred)
            }
            Section("Display") {
                Toggle("Compact layout", isOn: $compactDisplay)
            }
            Section {
                Button(saving ? "Saving..." : "Save") { Task { await save() } }
                    .disabled(saving || !loaded)
            }
        }
        .navigationTitle("Feed Preferences")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        guard let userId = auth.currentUser?.id else { loaded = true; return }
        // Round 6 iOS-DATA: see NotificationsSettingsView.load for rationale.
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
        // Round 6 iOS-DATA: merge into `metadata` (real column), not
        // `preferences` (phantom).
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
            // Round 5 Item 2: goes through update_own_profile RPC
            // (SECDEF, server-side metadata merge). Also closes the
            // `preferences` -> `metadata` column typo.
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
        Form {
            if let s = existingStatus {
                Section("Status") {
                    Text(s.capitalized)
                        .font(.system(.subheadline, design: .default, weight: .semibold))
                        .foregroundColor(s == "approved" ? VP.right : (s == "rejected" ? VP.wrong : VP.accent))
                }
            }
            Section("Type") {
                Picker("Applying as", selection: $type) {
                    Text("Expert").tag("expert")
                    Text("Journalist").tag("journalist")
                    Text("Public Figure").tag("public_figure")
                }
                .pickerStyle(.segmented)
            }
            Section("About You") {
                // Round 6 iOS-DATA: `full_name` is NOT NULL on
                // `expert_applications`; /api/expert/apply rejects requests
                // without it. Added as a required TextField.
                TextField("Full name", text: $fullName)
                    .textInputAutocapitalization(.words)
                TextField("Field / area (e.g. AI policy)", text: $field)
                TextField("Role / title (e.g. Research Lead)", text: $role)
                TextField("Organization (optional)", text: $org)
                TextField("Short bio", text: $bio, axis: .vertical).lineLimit(3...8)
            }
            Section("Links") {
                TextField("Portfolio URL", text: $portfolioURL)
                    .keyboardType(.URL).textInputAutocapitalization(.never)
                TextField("LinkedIn", text: $linkedin)
                    .keyboardType(.URL).textInputAutocapitalization(.never)
            }
            Section {
                Button(submitting ? "Submitting..." : "Submit application") {
                    Task { await submit() }
                }
                .disabled(submitting || fullName.trimmingCharacters(in: .whitespaces).isEmpty
                          || field.isEmpty || bio.isEmpty)
            }
            if let msg = submittedMessage {
                Section { Text(msg).font(.caption).foregroundColor(VP.right) }
            }
        }
        .navigationTitle("Verification")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadExisting() }
    }

    private func loadExisting() async {
        guard let userId = auth.currentUser?.id else { loaded = true; return }
        // Round 6 iOS-DATA: `submitted_at` is a phantom column on
        // `expert_applications`; the real ordering column is `created_at`.
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
        // Round 6 iOS-DATA: route through /api/expert/apply (gated on
        // `expert.application.apply` permission, dispatches to the
        // `submit_expert_application` RPC). Direct inserts previously
        // wrote phantom columns (`type`, `field`, `role`, `org`, `links`)
        // and would be rejected by the NOT NULL constraint on `full_name`.
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
                submittedMessage = "Application received. We'll review within 5 business days."
                existingStatus = "pending"
            } else {
                Log.d("Verification submit non-200:", (resp as? HTTPURLResponse)?.statusCode as Any)
            }
        } catch { Log.d("Verification submit error:", error) }
    }
}

// MARK: - Expert settings (only shown to role=expert)

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
        Form {
            Section("Daily Tag Limit") {
                Stepper("\(tagLimit) / day", value: $tagLimit, in: 1...20)
            }
            Section("Question Notifications") {
                Picker("", selection: $notifPref) {
                    ForEach(notifOptions, id: \.0) { k, label in Text(label).tag(k) }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            }
            Section {
                Button(saving ? "Saving..." : "Save") { Task { await save() } }.disabled(saving || !loaded)
            }
        }
        .navigationTitle("Expert Settings")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        guard let userId = auth.currentUser?.id else { loaded = true; return }
        // Round 6 iOS-DATA: see NotificationsSettingsView.load for rationale.
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
        // Round 6 iOS-DATA: merge into `metadata`, not phantom `preferences`.
        struct Row: Decodable { let metadata: JSONValue? }
        let existing: Row? = try? await client.from("users")
            .select("metadata").eq("id", value: userId).single().execute().value
        var merged: [String: Any] = existing?.metadata?.dictionary ?? [:]
        merged["expert"] = ["tagLimit": tagLimit, "notifPref": notifPref]
        do {
            // Round 5 Item 2: goes through update_own_profile RPC
            // (SECDEF, server-side metadata merge). Also closes the
            // `preferences` -> `metadata` column typo.
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
    // Task 62 — DM read receipts opt-out (migration 044). Default true
    // preserves always-on behavior; toggling writes users.dm_read_receipts_enabled.
    @State private var dmReceiptsEnabled = true
    @State private var dmReceiptsLoading = true

    var body: some View {
        Form {
            Section("Messages") {
                Toggle("DM read receipts", isOn: $dmReceiptsEnabled)
                    .disabled(dmReceiptsLoading)
                    .onChange(of: dmReceiptsEnabled) { newValue in
                        Task { await saveDmReceiptsPref(newValue) }
                    }
                Text("Let senders see when you\u{2019}ve read their direct messages. Turn off to read without confirming.")
                    .font(.caption).foregroundColor(VP.dim)
            }

            Section("Your Data") {
                Button("Request data export") {
                    Task { await requestExport() }
                }
                .disabled(exportRequested)
                .foregroundColor(VP.accent)
                if exportRequested {
                    Text("We'll email you a downloadable archive within 30 days, per GDPR.")
                        .font(.caption).foregroundColor(VP.dim)
                }
            }

            Section("Delete Account") {
                Button("Delete my account", role: .destructive) {
                    showDeleteConfirm = true
                }
                if deleteSubmitted {
                    Text("Request submitted. Your account will be deleted within 30 days; log back in to cancel.")
                        .font(.caption).foregroundColor(VP.dim)
                }
            }

            Section {
                Text("Data requests and deletions are processed via the data_requests queue. This complies with GDPR and CCPA obligations.")
                    .font(.caption).foregroundColor(VP.dim)
            }
        }
        .navigationTitle("Data & Privacy")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadDmReceiptsPref() }
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
        // Round 5 Item 2: routes through the update_own_profile SECDEF RPC
        // rather than direct users.update (which the Round 4 trigger would
        // not reject for this column, but we keep the write path uniform).
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
    @Environment(\.dismiss) var dismiss

    @State private var category = "bug"
    @State private var message: String = ""
    @State private var submitting = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Category") {
                    Picker("", selection: $category) {
                        Text("Bug").tag("bug")
                        Text("Feature").tag("feature_request")
                        Text("Other").tag("other")
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                }
                Section("Your feedback") {
                    TextField("Tell us what's up...", text: $message, axis: .vertical)
                        .lineLimit(4...10)
                }
                Section {
                    Button(submitting ? "Sending..." : "Send") {
                        Task { await submit() }
                    }
                    .disabled(submitting || message.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .navigationTitle("Send Feedback")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func submit() async {
        guard auth.currentUser?.id != nil else { return }
        submitting = true
        defer { submitting = false }
        // Round 6 iOS-DATA: route through /api/support. Direct inserts
        // previously wrote a phantom `body` column on `support_tickets`;
        // the real message body lives in `ticket_messages`, and the
        // server route handles the two-table insert.
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

// MARK: - Minimal JSONValue (decodes jsonb from Supabase without ties to a specific schema)

indirect enum JSONValue: Codable {
    case string(String), int(Int), double(Double), bool(Bool), null
    case array([JSONValue]), object([String: JSONValue])

    // Round 5 Item 2: Encodable conformance added so iOS save paths can
    // wrap a dynamic [String: Any] merged metadata blob into the
    // update_own_profile RPC `p_fields` jsonb without hand-writing an
    // Encodable for every shape.
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
