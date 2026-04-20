import SwiftUI

// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18

/// Presented as a full-screen cover when the user opens a password-recovery
/// deep link. A recovery session is already active at this point (set by
/// AuthViewModel.handleDeepLink) so we only need to collect the new password
/// and call auth.updatePassword.
struct ResetPasswordView: View {
    @EnvironmentObject var auth: AuthViewModel
    @State private var newPassword = ""
    @State private var confirm = ""
    @State private var loading = false
    @State private var showPassword = false
    @State private var localError: String?

    private var passwordsMatch: Bool {
        !newPassword.isEmpty && newPassword == confirm
    }

    private var validation: PasswordValidation { PasswordPolicy.validate(newPassword) }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Spacer()

                Text("Set a new password")
                    .font(.system(.title2, design: .default, weight: .bold))
                    .foregroundColor(VP.text)
                    .padding(.bottom, 8)

                Text(PasswordPolicy.hint)
                    .font(.footnote)
                    .foregroundColor(VP.dim)
                    .multilineTextAlignment(.center)
                    .padding(.bottom, 32)

                VStack(spacing: 14) {
                    passwordField(label: "New password", text: $newPassword)
                    passwordField(label: "Confirm password", text: $confirm)
                    Toggle("Show passwords", isOn: $showPassword)
                        .font(.footnote)
                        .foregroundColor(VP.dim)
                }
                .padding(.bottom, 16)

                if let err = localError ?? auth.authError {
                    Text(err)
                        .font(.system(.footnote, design: .default, weight: .medium))
                        .foregroundColor(VP.danger)
                        .padding(.bottom, 12)
                }

                Button {
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
                } label: {
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
                    .background(VP.text)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
                .disabled(loading || newPassword.isEmpty || confirm.isEmpty)

                Spacer()
            }
            .padding(.horizontal, 24)
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
        }
    }

    @ViewBuilder
    private func passwordField(label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.footnote)
                .foregroundColor(VP.dim)
            Group {
                if showPassword {
                    TextField("", text: text)
                        .textContentType(.newPassword)
                        .autocapitalization(.none)
                } else {
                    SecureField("", text: text)
                        .textContentType(.newPassword)
                }
            }
            .padding(12)
            .background(VP.card)
            .cornerRadius(8)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border))
        }
    }
}
