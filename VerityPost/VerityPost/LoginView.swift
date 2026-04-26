import AuthenticationServices
import SwiftUI

// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18

struct LoginView: View {
    @EnvironmentObject var auth: AuthViewModel
    @State private var email = ""
    @State private var password = ""
    @State private var showPassword = false
    @State private var loading = false
    @State private var showForgot = false
    @State private var showSignup = false
    @FocusState private var focusedField: Field?

    private enum Field { case email, password }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    // Hero: wordmark + "Welcome back."
                    Text("Verity Post")
                        .font(.system(.largeTitle, design: .default, weight: .bold))
                        .tracking(-1)
                        .foregroundColor(VP.text)
                        .padding(.top, 56)
                        .padding(.bottom, 8)

                    Text("Welcome back.")
                        .font(.subheadline)
                        .foregroundColor(VP.dim)
                        .padding(.bottom, 36)

                    // Apple HIG — Sign in with Apple sits above the
                    // password entry. AuthViewModel owns the nonce (set in
                    // onRequest) and the identity-token exchange with
                    // Supabase (handled in onCompletion).
                    SignInWithAppleButton(
                        .signIn,
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
                    .padding(.bottom, 10)

                    // Sign in with Google — matches web login Google option.
                    Button {
                        loading = true
                        Task {
                            await auth.signInWithGoogle()
                            loading = false
                        }
                    } label: {
                        // No logo asset yet — Google brand requires the
                        // official multicolor mark or nothing. Until
                        // Assets.xcassets carries the G PNG, the text-only
                        // label is Google-brand-approved ("Continue with
                        // Google" pattern).
                        Text("Continue with Google")
                            .font(.system(.subheadline, design: .default, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: 48)
                            .foregroundColor(VP.text)
                            .background(VP.card)
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border))
                            .cornerRadius(12)
                    }
                    .disabled(loading)
                    .padding(.bottom, 22)

                    // Divider
                    HStack(spacing: 12) {
                        Rectangle().fill(VP.border).frame(height: 1)
                        Text("or sign in with email")
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                        Rectangle().fill(VP.border).frame(height: 1)
                    }
                    .padding(.bottom, 22)

                    // Email
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Email or username")
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                        TextField("you@example.com or yourname", text: $email)
                            .textContentType(.username)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled(true)
                            .submitLabel(.next)
                            .focused($focusedField, equals: .email)
                            .onSubmit { focusedField = .password }
                            .foregroundColor(VP.text)
                            .padding(12)
                            .frame(minHeight: 44)
                            .background(VP.card)
                            .cornerRadius(10)
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
                    }
                    .padding(.bottom, 14)

                    // Password
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Password")
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                        HStack(spacing: 0) {
                            Group {
                                if showPassword {
                                    TextField("Your password", text: $password)
                                        .textContentType(.password)
                                        .textInputAutocapitalization(.never)
                                        .autocorrectionDisabled(true)
                                } else {
                                    SecureField("Your password", text: $password)
                                        .textContentType(.password)
                                }
                            }
                            .submitLabel(.go)
                            .focused($focusedField, equals: .password)
                            .onSubmit(submit)

                            Button(action: { showPassword.toggle() }) {
                                Text(showPassword ? "Hide" : "Show")
                                    .font(.footnote)
                                    .foregroundColor(VP.dim)
                                    .padding(.horizontal, 4)
                                    .frame(minHeight: 44)
                            }
                            .accessibilityLabel(showPassword ? "Hide password" : "Show password")
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 4)
                        .frame(minHeight: 44)
                        .background(VP.card)
                        .cornerRadius(10)
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
                    }
                    .padding(.bottom, 10)

                    // Forgot password (inline below password, parity with web)
                    HStack {
                        Spacer()
                        Button("Forgot password?") { showForgot = true }
                            .font(.footnote)
                            .foregroundColor(VP.accent)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .padding(.bottom, 22)

                    // Error
                    if let err = auth.authError {
                        Text(err)
                            .font(.system(.footnote, design: .default, weight: .medium))
                            .foregroundColor(VP.danger)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.bottom, 14)
                    }

                    // Sign in button
                    Button(action: submit) {
                        Group {
                            if loading {
                                ProgressView().tint(.white)
                            } else {
                                Text("Sign in")
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
                    .padding(.bottom, 28)

                    // Sign up link
                    HStack(spacing: 4) {
                        Text("New here?")
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                        Button("Create an account") { showSignup = true }
                            .font(.system(.footnote, design: .default, weight: .semibold))
                            .foregroundColor(VP.accent)
                    }
                    .padding(.bottom, 40)
                }
                .padding(.horizontal, 24)
            }
            .background(VP.bg.ignoresSafeArea())
            .sheet(isPresented: $showForgot) {
                ForgotPasswordView()
                    .environmentObject(auth)
            }
            .fullScreenCover(isPresented: $showSignup) {
                SignupView()
                    .environmentObject(auth)
            }
        }
        .preferredColorScheme(.light)
        .onChange(of: auth.authError) { _, newValue in
            if let msg = newValue {
                UIAccessibility.post(notification: .announcement, argument: msg)
            }
        }
    }

    private var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespaces).isEmpty && !password.isEmpty && !loading
    }

    private func submit() {
        guard canSubmit else { return }
        loading = true
        Task {
            await auth.login(email: email, password: password)
            loading = false
        }
    }
}
