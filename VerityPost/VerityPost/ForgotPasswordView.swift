import SwiftUI

// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18

struct ForgotPasswordView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var auth: AuthViewModel
    @State private var email = ""
    @State private var loading = false
    @State private var sent = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Spacer()

                Text("Reset Password")
                    .font(.system(.title2, design: .default, weight: .bold))
                    .foregroundColor(VP.text)
                    .padding(.bottom, 8)

                Text("Enter your email and we'll send a reset link.")
                    .font(.footnote)
                    .foregroundColor(VP.dim)
                    .multilineTextAlignment(.center)
                    .padding(.bottom, 32)

                if sent {
                    // Success state
                    VStack(spacing: 12) {
                        Text("Check your email")
                            .font(.system(.subheadline, design: .default, weight: .semibold))
                            .foregroundColor(VP.text)
                        Text("If an account exists for that email, you'll receive a reset link shortly.")
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.bottom, 32)

                    Button("Back to sign in") { dismiss() }
                        .font(.system(.subheadline, design: .default, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 48)
                        .background(VP.text)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                } else {
                    // Email input
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Email")
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                        TextField("you@example.com", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .autocapitalization(.none)
                            .padding(12)
                            .background(VP.card)
                            .cornerRadius(8)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border))
                    }
                    .padding(.bottom, 24)

                    Button {
                        loading = true
                        Task {
                            let ok = await auth.resetPassword(email: email)
                            if ok { sent = true }
                            loading = false
                        }
                    } label: {
                        Group {
                            if loading {
                                ProgressView().tint(.white)
                            } else {
                                Text("Send Reset Link")
                                    .font(.system(.subheadline, design: .default, weight: .semibold))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 48)
                        .background(VP.text)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    .disabled(email.isEmpty || loading)
                }

                Spacer()
            }
            .padding(.horizontal, 24)
            .background(VP.bg.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(VP.dim)
                }
            }
        }
    }
}
