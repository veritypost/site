import SwiftUI

// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18

struct LoginView: View {
    @EnvironmentObject var auth: AuthViewModel
    @State private var email = ""
    @State private var password = ""
    @State private var loading = false
    @State private var showForgot = false
    @State private var showSignup = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Spacer()

                // Logo
                Text("Verity Post")
                    .font(.system(.largeTitle, design: .default, weight: .bold))
                    .tracking(-1)
                    .foregroundColor(VP.text)
                    .padding(.bottom, 8)

                Text("Sign in to continue")
                    .font(.subheadline)
                    .foregroundColor(VP.dim)
                    .padding(.bottom, 40)

                // Email
                VStack(alignment: .leading, spacing: 6) {
                    Text("Email")
                        .font(.footnote)
                        .foregroundColor(VP.dim)
                    TextField("you@example.com", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                        .foregroundColor(VP.text)
                        .padding(12)
                        .background(VP.card)
                        .cornerRadius(8)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border))
                }
                .padding(.bottom, 14)

                // Password
                VStack(alignment: .leading, spacing: 6) {
                    Text("Password")
                        .font(.footnote)
                        .foregroundColor(VP.dim)
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .foregroundColor(VP.text)
                        .padding(12)
                        .background(VP.card)
                        .cornerRadius(8)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border))
                }
                .padding(.bottom, 8)

                // Forgot password
                HStack {
                    Spacer()
                    Button("Forgot password?") { showForgot = true }
                        .font(.footnote)
                        .foregroundColor(VP.accent)
                }
                .padding(.bottom, 24)

                // Error
                if let err = auth.authError {
                    Text(err)
                        .font(.system(.footnote, design: .default, weight: .medium))
                        .foregroundColor(VP.danger)
                        .padding(.bottom, 16)
                }

                // Sign in button
                Button {
                    loading = true
                    Task {
                        await auth.login(email: email, password: password)
                        loading = false
                    }
                } label: {
                    Group {
                        if loading {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("Sign in")
                                .font(.system(.subheadline, design: .default, weight: .semibold))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 48)
                    .background(VP.text)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
                .disabled(email.isEmpty || password.isEmpty || loading)

                // Divider
                HStack(spacing: 12) {
                    Rectangle().fill(VP.border).frame(height: 1)
                    Text("or")
                        .font(.footnote)
                        .foregroundColor(VP.dim)
                    Rectangle().fill(VP.border).frame(height: 1)
                }
                .padding(.vertical, 18)

                // Sign in with Apple (App Store Review Guideline 4.8).
                Button {
                    loading = true
                    Task {
                        await auth.signInWithApple()
                        loading = false
                    }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "apple.logo")
                            .font(.system(.body, design: .default, weight: .medium))
                        Text("Sign in with Apple")
                            .font(.system(.subheadline, design: .default, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 48)
                    .foregroundColor(.white)
                    .background(Color.black)
                    .cornerRadius(12)
                }
                .disabled(loading)

                // Sign in with Google — matches web signup Google option.
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
                        Text("Sign in with Google")
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

                Spacer()

                // Sign up link
                HStack(spacing: 4) {
                    Text("Don't have an account?")
                        .font(.footnote)
                        .foregroundColor(VP.dim)
                    Button("Sign up") { showSignup = true }
                        .font(.system(.footnote, design: .default, weight: .semibold))
                        .foregroundColor(VP.accent)
                }
                .padding(.bottom, 40)
            }
            .padding(.horizontal, 24)
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
    }
}
