import SwiftUI

// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18

struct ForgotPasswordView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var auth: AuthViewModel
    @State private var email = ""
    @State private var loading = false
    @State private var sent = false
    @State private var sentTo = ""
    @State private var cooldown = 0
    @FocusState private var emailFocused: Bool

    private let resendCooldownSecs = 30
    private let cooldownTimer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

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

                    Text(sent ? "Check your email." : "Reset your password.")
                        .font(.subheadline)
                        .foregroundColor(VP.dim)
                        .padding(.bottom, 36)

                    if sent {
                        sentState
                    } else {
                        requestState
                    }

                    Spacer(minLength: 24)

                    // Back to sign in
                    Button("Back to sign in") { dismiss() }
                        .font(.footnote)
                        .foregroundColor(VP.dim)
                        .padding(.bottom, 32)
                }
                .padding(.horizontal, 24)
            }
            .background(VP.bg.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(VP.dim)
                }
            }
            .onAppear { emailFocused = true }
            .onReceive(cooldownTimer) { _ in
                if cooldown > 0 { cooldown -= 1 }
            }
        }
    }

    @ViewBuilder
    private var requestState: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Email")
                .font(.footnote)
                .foregroundColor(VP.dim)
            TextField("you@example.com", text: $email)
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .submitLabel(.go)
                .focused($emailFocused)
                .onSubmit(sendLink)
                .padding(12)
                .frame(minHeight: 44)
                .background(VP.card)
                .cornerRadius(10)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
        }
        .padding(.bottom, 20)

        if let err = auth.authError {
            Text(err)
                .font(.system(.footnote, design: .default, weight: .medium))
                .foregroundColor(VP.danger)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 14)
        }

        Button(action: sendLink) {
            Group {
                if loading {
                    ProgressView().tint(.white)
                } else {
                    Text("Send reset link")
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
    }

    @ViewBuilder
    private var sentState: some View {
        VStack(alignment: .leading, spacing: 14) {
            (Text("If an account exists for ")
                .foregroundColor(VP.dim)
             + Text(maskEmail(sentTo))
                .foregroundColor(VP.text)
                .fontWeight(.semibold)
             + Text(", a reset link is on the way.")
                .foregroundColor(VP.dim))
                .font(.footnote)
                .multilineTextAlignment(.leading)

            Text("The link expires in 1 hour. Check your spam folder if it doesn't arrive within a minute.")
                .font(.caption)
                .foregroundColor(Color(hex: "166534"))
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(VP.passBg)
                .cornerRadius(10)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.passBorder))
        }
        .padding(.bottom, 20)

        Button(action: resend) {
            Group {
                if loading {
                    ProgressView().tint(VP.text)
                } else if cooldown > 0 {
                    Text("Resend email (\(cooldown)s)")
                        .font(.footnote)
                } else {
                    Text("Resend email")
                        .font(.footnote)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(minHeight: 44)
            .foregroundColor(cooldown > 0 ? VP.dim : VP.text)
            .background(VP.card)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
            .cornerRadius(10)
        }
        .disabled(loading || cooldown > 0)
        .padding(.bottom, 10)

        Button("Use a different email") {
            sent = false
            sentTo = ""
            email = ""
            cooldown = 0
            emailFocused = true
        }
        .font(.footnote)
        .foregroundColor(VP.dim)
        .frame(maxWidth: .infinity)
        .frame(minHeight: 44)
    }

    private var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespaces).isEmpty && !loading
    }

    private func sendLink() {
        guard canSubmit else { return }
        loading = true
        Task {
            let ok = await auth.resetPassword(email: email)
            // Pass 17 / UJ-515 parity: present the same success state
            // regardless of whether the account exists. We flip `sent`
            // whether the server returned ok or not so the page can't
            // be used to enumerate registered emails.
            _ = ok
            sentTo = email
            sent = true
            cooldown = resendCooldownSecs
            loading = false
        }
    }

    private func resend() {
        guard !loading, cooldown == 0 else { return }
        loading = true
        Task {
            _ = await auth.resetPassword(email: sentTo)
            cooldown = resendCooldownSecs
            loading = false
        }
    }

    private func maskEmail(_ e: String) -> String {
        let parts = e.split(separator: "@", maxSplits: 1, omittingEmptySubsequences: false)
        guard parts.count == 2, let first = parts[0].first else { return e }
        return "\(first)***@\(parts[1])"
    }
}
