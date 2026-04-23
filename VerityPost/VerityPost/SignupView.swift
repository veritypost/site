import AuthenticationServices
import SwiftUI

// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18

struct SignupView: View {
    @EnvironmentObject var auth: AuthViewModel
    @Environment(\.dismiss) var dismiss
    @State private var email = ""
    @State private var username = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var ageConfirmed = false
    @State private var termsAccepted = false
    @State private var loading = false
    @State private var localError: String?

    private var passwordsMatch: Bool { password == confirm && !password.isEmpty }
    private var validation: PasswordValidation { PasswordPolicy.validate(password) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    // Logo
                    Text("Verity Post")
                        .font(.system(.largeTitle, design: .default, weight: .bold))
                        .tracking(-1)
                        .foregroundColor(VP.text)
                        .padding(.top, 60)
                        .padding(.bottom, 8)

                    Text("Create your account")
                        .font(.subheadline)
                        .foregroundColor(VP.dim)
                        .padding(.bottom, 40)

                    VStack(spacing: 14) {
                        // Username
                        field(label: "Username", placeholder: "pick a username", text: $username)
                            .textInputAutocapitalization(.never)

                        // Email
                        field(label: "Email", placeholder: "you@example.com", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)

                        // Password
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Password")
                                .font(.footnote)
                                .foregroundColor(VP.dim)
                            SecureField(PasswordPolicy.hint, text: $password)
                                .textContentType(.newPassword)
                                .padding(12)
                                .background(VP.card)
                                .cornerRadius(8)
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border))
                        }

                        // Confirm
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Confirm Password")
                                .font(.footnote)
                                .foregroundColor(VP.dim)
                            SecureField("Re-enter password", text: $confirm)
                                .textContentType(.newPassword)
                                .padding(12)
                                .background(VP.card)
                                .cornerRadius(8)
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border))
                        }
                    }
                    .padding(.bottom, 20)

                    // Age 13+ (COPPA) + Terms acceptance — parity with web signup.
                    VStack(alignment: .leading, spacing: 12) {
                        Button {
                            ageConfirmed.toggle()
                        } label: {
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: ageConfirmed ? "checkmark.square.fill" : "square")
                                    .foregroundColor(ageConfirmed ? VP.accent : VP.dim)
                                    .font(.title3)
                                Text("I confirm I am 13 or older.")
                                    .font(.footnote)
                                    .foregroundColor(VP.dim)
                                    .multilineTextAlignment(.leading)
                            }
                        }
                        .buttonStyle(.plain)

                        Button {
                            termsAccepted.toggle()
                        } label: {
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: termsAccepted ? "checkmark.square.fill" : "square")
                                    .foregroundColor(termsAccepted ? VP.accent : VP.dim)
                                    .font(.title3)
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 3) {
                                        Text("I agree to the")
                                            .font(.footnote)
                                            .foregroundColor(VP.dim)
                                        Link("Terms of Service",
                                             destination: SupabaseManager.shared.siteURL.appendingPathComponent("terms"))
                                            .font(.system(.footnote, design: .default, weight: .semibold))
                                            .foregroundColor(VP.accent)
                                    }
                                    HStack(spacing: 3) {
                                        Text("and")
                                            .font(.footnote)
                                            .foregroundColor(VP.dim)
                                        Link("Privacy Policy",
                                             destination: SupabaseManager.shared.siteURL.appendingPathComponent("privacy"))
                                            .font(.system(.footnote, design: .default, weight: .semibold))
                                            .foregroundColor(VP.accent)
                                    }
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, 24)

                    // Error
                    if let err = localError ?? auth.authError {
                        Text(err)
                            .font(.system(.footnote, design: .default, weight: .medium))
                            .foregroundColor(VP.danger)
                            .padding(.bottom, 16)
                    }

                    // Signup button
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
                            await auth.signup(
                                email: email,
                                password: password,
                                username: username,
                                ageConfirmed: ageConfirmed,
                                termsAccepted: termsAccepted
                            )
                            loading = false
                        }
                    } label: {
                        Group {
                            if loading {
                                ProgressView().tint(.white)
                            } else {
                                Text("Create free account")
                                    .font(.system(.subheadline, design: .default, weight: .semibold))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 48)
                        .background(VP.text)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    .disabled(!validation.meetsPolicy || !passwordsMatch || email.isEmpty || username.isEmpty || !ageConfirmed || !termsAccepted || loading)
                    .padding(.bottom, 18)

                    // Divider
                    HStack(spacing: 12) {
                        Rectangle().fill(VP.border).frame(height: 1)
                        Text("or sign up with")
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                        Rectangle().fill(VP.border).frame(height: 1)
                    }
                    .padding(.bottom, 14)

                    // Sign in with Apple (App Store Review Guideline 4.8).
                    // System-rendered button drives the native SIWA flow.
                    // See LoginView for the same pattern.
                    SignInWithAppleButton(
                        .signUp,
                        onRequest: { request in
                            auth.prepareAppleRequest(request)
                        },
                        onCompletion: { result in
                            loading = true
                            Task {
                                await auth.completeAppleSignIn(result: result)
                                loading = false
                            }
                        }
                    )
                    .signInWithAppleButtonStyle(.black)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .cornerRadius(12)
                    .disabled(loading)

                    // Sign up with Google — matches web signup Google option.
                    Button {
                        loading = true
                        Task {
                            await auth.signInWithGoogle()
                            loading = false
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Text("G")
                                .font(.system(.body, design: .default, weight: .bold))
                            Text("Sign up with Google")
                                .font(.system(.subheadline, design: .default, weight: .semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 48)
                        .foregroundColor(VP.text)
                        .background(VP.card)
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border))
                        .cornerRadius(12)
                    }
                    .disabled(loading)
                    .padding(.top, 8)
                    .padding(.bottom, 24)

                    // Back to login
                    HStack(spacing: 4) {
                        Text("Already have an account?")
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                        Button("Sign in") { dismiss() }
                            .font(.system(.footnote, design: .default, weight: .semibold))
                            .foregroundColor(VP.accent)
                    }
                    .padding(.bottom, 40)
                }
                .padding(.horizontal, 24)
            }
            .background(VP.bg.ignoresSafeArea())
        }
    }

    private func field(label: String, placeholder: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.footnote)
                .foregroundColor(VP.dim)
            TextField(placeholder, text: text)
                .foregroundColor(VP.text)
                .padding(12)
                .background(VP.card)
                .cornerRadius(8)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border))
        }
    }
}
