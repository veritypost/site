import SwiftUI

// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18

/// Presented as a full-screen cover when the user opens a password-recovery
/// deep link. A recovery session is already active at this point (set by
/// AuthViewModel.handleDeepLink) so we only need to collect the new password
/// and call auth.updatePassword. On success the view model flips
/// `isRecoveringPassword` off, loads the user, and the app routes home —
/// the user is signed in without touching the login screen.
struct ResetPasswordView: View {
    @EnvironmentObject var auth: AuthViewModel
    @State private var newPassword = ""
    @State private var confirm = ""
    @State private var loading = false
    @State private var showPassword = false
    @State private var localError: String?
    @FocusState private var focus: Field?

    private enum Field { case password, confirm }

    private var passwordsMatch: Bool {
        !newPassword.isEmpty && newPassword == confirm
    }

    private var validation: PasswordValidation { PasswordPolicy.validate(newPassword) }

    // Mirror of web's 0–4 strength score, rendered as 4 bars.
    private var strength: (bars: Int, label: String, color: Color) {
        var s = 0
        if newPassword.count >= PasswordPolicy.minLength { s += 1 }
        if newPassword.count >= 12 { s += 1 }
        if newPassword.range(of: "[A-Z]", options: .regularExpression) != nil { s += 1 }
        if newPassword.range(of: "[0-9]", options: .regularExpression) != nil { s += 1 }
        if newPassword.range(of: "[^A-Za-z0-9]", options: .regularExpression) != nil { s += 1 }
        if s <= 1 { return (1, "Weak", VP.danger) }
        if s == 2 { return (2, "Fair", Color(hex: "f97316")) }
        if s == 3 { return (3, "Good", Color(hex: "eab308")) }
        return (4, "Strong", VP.success)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    // Hero: wordmark + headline
                    Text("Verity Post")
                        .font(.system(.largeTitle, design: .default, weight: .bold))
                        .tracking(-1)
                        .foregroundColor(VP.text)
                        .padding(.top, 40)
                        .padding(.bottom, 8)

                    Text("Set a new password.")
                        .font(.subheadline)
                        .foregroundColor(VP.dim)
                        .padding(.bottom, 32)

                    // New password
                    VStack(alignment: .leading, spacing: 6) {
                        Text("New password")
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                        passwordField(placeholder: "Create a strong password", text: $newPassword, field: .password)
                    }
                    .padding(.bottom, 10)

                    // Strength meter
                    if !newPassword.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 4) {
                                ForEach(1...4, id: \.self) { i in
                                    RoundedRectangle(cornerRadius: 99)
                                        .fill(i <= strength.bars ? strength.color : VP.border)
                                        .frame(height: 3)
                                }
                            }
                            Text(strength.label)
                                .font(.caption2.weight(.semibold))
                                .foregroundColor(strength.color)
                        }
                        .padding(.bottom, 12)
                    }

                    // Requirements checklist
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Password requirements")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(VP.dim)
                            .padding(.bottom, 2)
                        requirementRow(label: "At least \(PasswordPolicy.minLength) characters",
                                       met: newPassword.count >= PasswordPolicy.minLength)
                        requirementRow(label: "One uppercase letter",
                                       met: newPassword.range(of: "[A-Z]", options: .regularExpression) != nil)
                        requirementRow(label: "One number",
                                       met: newPassword.range(of: "[0-9]", options: .regularExpression) != nil)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(VP.bg)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
                    .cornerRadius(10)
                    .padding(.bottom, 14)

                    // Confirm password
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Confirm password")
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                        passwordField(placeholder: "Repeat your password", text: $confirm, field: .confirm)
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(confirmBorder, lineWidth: 1.5)
                            )
                        if !confirm.isEmpty {
                            if passwordsMatch {
                                Text("Passwords match")
                                    .font(.caption)
                                    .foregroundColor(VP.success)
                            } else {
                                Text("Passwords don\u{2019}t match")
                                    .font(.caption)
                                    .foregroundColor(VP.danger)
                            }
                        }
                    }
                    .padding(.bottom, 10)

                    // Show-passwords toggle
                    Toggle("Show passwords", isOn: $showPassword)
                        .font(.footnote)
                        .foregroundColor(VP.dim)
                        .padding(.bottom, 18)

                    if let err = localError ?? auth.authError {
                        Text(err)
                            .font(.system(.footnote, design: .default, weight: .medium))
                            .foregroundColor(VP.danger)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.bottom, 12)
                    }

                    Button(action: submit) {
                        Group {
                            if loading {
                                ProgressView().tint(.white)
                            } else {
                                Text("Update password")
                                    .font(.system(.subheadline, design: .default, weight: .semibold))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 48)
                        .background(canSubmit ? VP.text : VP.muted)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    .disabled(!canSubmit)
                    .padding(.bottom, 40)
                }
                .padding(.horizontal, 24)
            }
            .background(VP.bg.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        auth.isRecoveringPassword = false
                        Task { await auth.logout() }
                    }
                    .foregroundColor(VP.dim)
                }
            }
            .onAppear { focus = .password }
        }
    }

    private var canSubmit: Bool {
        validation.meetsPolicy && passwordsMatch && !loading
    }

    private var confirmBorder: Color {
        if confirm.isEmpty { return focus == .confirm ? VP.accent : VP.border }
        return passwordsMatch ? VP.success : VP.danger
    }

    @ViewBuilder
    private func passwordField(placeholder: String, text: Binding<String>, field: Field) -> some View {
        Group {
            if showPassword {
                TextField(placeholder, text: text)
                    .textContentType(.newPassword)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
            } else {
                SecureField(placeholder, text: text)
                    .textContentType(.newPassword)
            }
        }
        .focused($focus, equals: field)
        .submitLabel(field == .password ? .next : .go)
        .onSubmit {
            if field == .password {
                focus = .confirm
            } else {
                submit()
            }
        }
        .padding(12)
        .frame(minHeight: 44)
        .background(VP.card)
        .cornerRadius(10)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
    }

    @ViewBuilder
    private func requirementRow(label: String, met: Bool) -> some View {
        HStack(spacing: 6) {
            ZStack {
                Circle()
                    .stroke(met ? VP.success : VP.border, lineWidth: 1.5)
                    .background(Circle().fill(met ? VP.success : Color.clear))
                    .frame(width: 14, height: 14)
                if met {
                    Image(systemName: "checkmark")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(.white)
                }
            }
            Text(label)
                .font(.caption)
                .foregroundColor(met ? VP.text : VP.dim)
                .fontWeight(met ? .semibold : .regular)
        }
    }

    private func submit() {
        localError = nil
        if let first = validation.failures.first {
            localError = PasswordPolicy.message(first)
            return
        }
        if !passwordsMatch {
            localError = "Passwords don\u{2019}t match."
            return
        }
        loading = true
        Task {
            _ = await auth.updatePassword(newPassword)
            loading = false
        }
    }
}
