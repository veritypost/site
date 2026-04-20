import SwiftUI

// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18

/// Shown after a user signs up with a provider that requires email
/// confirmation. The screen just tells them to check their inbox and
/// lets them resend the link. Once the confirmation link is opened on
/// this device, VerityPostApp forwards the URL to AuthViewModel and
/// the view stack automatically transitions to the main app because
/// `isLoggedIn` flips true and `needsEmailVerification` flips false.
struct VerifyEmailView: View {
    @EnvironmentObject var auth: AuthViewModel
    @State private var resendState: ResendState = .idle
    @State private var cooldownRemaining: Int = 0
    @State private var cooldownTask: Task<Void, Never>?

    private enum ResendState: Equatable { case idle, sending, sent, failed }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            Text("Check your email")
                .font(.system(.title2, design: .default, weight: .bold))
                .foregroundColor(VP.text)
                .padding(.bottom, 8)

            if let email = auth.pendingVerificationEmail {
                Text("We sent a verification link to")
                    .font(.footnote)
                    .foregroundColor(VP.dim)
                Text(email)
                    .font(.system(.footnote, design: .default, weight: .semibold))
                    .foregroundColor(VP.text)
                    .padding(.top, 2)
                    .padding(.bottom, 8)
            }

            Text("Tap the link in the email to finish setting up your account.")
                .font(.footnote)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
                .padding(.bottom, 32)

            Button {
                Task { await resend() }
            } label: {
                Group {
                    switch resendState {
                    case .sending:
                        ProgressView().tint(.white)
                    case .sent where cooldownRemaining > 0:
                        Text("Resend link (\(cooldownRemaining)s)")
                            .font(.system(.subheadline, design: .default, weight: .semibold))
                    case .sent:
                        Text("Resend link")
                            .font(.system(.subheadline, design: .default, weight: .semibold))
                    case .failed:
                        Text("Try resending")
                            .font(.system(.subheadline, design: .default, weight: .semibold))
                    case .idle:
                        Text("Resend link")
                            .font(.system(.subheadline, design: .default, weight: .semibold))
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(minHeight: 48)
                .background(VP.text)
                .foregroundColor(.white)
                .cornerRadius(12)
            }
            .padding(.horizontal, 24)
            .disabled(resendState == .sending || cooldownRemaining > 0)

            if resendState == .sent {
                Text("Link sent. Check your inbox.")
                    .font(.footnote)
                    .foregroundColor(VP.success)
                    .padding(.top, 8)
            } else if resendState == .failed {
                Text("Couldn\u{2019}t send. Try again in a moment.")
                    .font(.footnote)
                    .foregroundColor(VP.danger)
                    .padding(.top, 8)
            }

            Spacer()

            Button("Sign in with a different account") {
                Task { await auth.logout() }
                auth.needsEmailVerification = false
                auth.pendingVerificationEmail = nil
            }
            .font(.footnote)
            .foregroundColor(VP.dim)
            .padding(.bottom, 32)
        }
        .background(VP.bg.ignoresSafeArea())
        .onDisappear {
            cooldownTask?.cancel()
        }
    }

    private func resend() async {
        resendState = .sending
        let ok = await auth.resendVerificationEmail()
        resendState = ok ? .sent : .failed
        if ok {
            cooldownRemaining = 30
            cooldownTask?.cancel()
            cooldownTask = Task { @MainActor in
                while cooldownRemaining > 0 {
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    if Task.isCancelled { return }
                    cooldownRemaining -= 1
                }
            }
        }
    }
}
