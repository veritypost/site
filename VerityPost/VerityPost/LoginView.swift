import AuthenticationServices
import SwiftUI

// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
//
// S9-Q2-iOS — magic-link rebuild. Email-only form, no password. Posts
// to /api/auth/send-magic-link; the redemption happens via Universal
// Link → handleDeepLink. OAuth (Apple + Google) buttons remain in the
// source but are gated behind `VPOAuthEnabled` (default false). The
// SignInWithAppleButton + Google button code is preserved so a one-line
// flip re-enables them when owner approves.

struct LoginView: View {
    @EnvironmentObject var auth: AuthViewModel
    @Environment(\.dismiss) var dismiss
    @State private var email = ""
    @State private var loading = false
    @State private var showSignup = false
    @FocusState private var emailFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    // Hero
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

                    if let sentTo = auth.magicLinkSentTo {
                        sentCard(email: sentTo)
                    } else {
                        if VPOAuthEnabled {
                            oauthButtons
                            HStack(spacing: 12) {
                                Rectangle().fill(VP.border).frame(height: 1)
                                Text("or sign in with email")
                                    .font(.footnote)
                                    .foregroundColor(VP.dim)
                                Rectangle().fill(VP.border).frame(height: 1)
                            }
                            .padding(.bottom, 22)
                        }
                        emailForm
                    }

                    Spacer().frame(height: 28)

                    if auth.magicLinkSentTo == nil {
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
                }
                .padding(.horizontal, 24)
            }
            .background(VP.bg.ignoresSafeArea())
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
        .onDisappear {
            // Reset the "Check your inbox" card so reopening the sheet
            // shows the email form again. The cooldown timer also stops
            // so a sleeping app doesn't keep counting down.
            auth.clearMagicLinkState()
        }
    }

    // MARK: - Email form

    @ViewBuilder
    private var emailForm: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Email")
                .font(.footnote)
                .foregroundColor(VP.dim)
            TextField("you@example.com", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .submitLabel(.send)
                .focused($emailFocused)
                .onSubmit(submit)
                .foregroundColor(VP.text)
                .padding(12)
                .frame(minHeight: 44)
                .background(VP.card)
                .cornerRadius(10)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
        }
        .padding(.bottom, 22)

        if let err = auth.authError {
            Text(err)
                .font(.system(.footnote, design: .default, weight: .medium))
                .foregroundColor(VP.danger)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 14)
        }

        Button(action: submit) {
            Group {
                if loading {
                    ProgressView().tint(.white)
                } else {
                    Text("Send sign-in link")
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

    // MARK: - "Check your inbox" card

    @ViewBuilder
    private func sentCard(email: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "envelope.badge")
                .font(.largeTitle)
                .foregroundColor(VP.accent)
                .accessibilityHidden(true)
            Text("Check your inbox")
                .font(.system(.title3, design: .default, weight: .bold))
                .foregroundColor(VP.text)
            Text("We sent a sign-in link to \(email). Tap it to finish signing in.")
                .font(.footnote)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 8)

            Button(action: resend) {
                Group {
                    if auth.magicLinkCooldownSec > 0 {
                        Text("Resend in \(auth.magicLinkCooldownSec)s")
                    } else if loading {
                        ProgressView()
                    } else {
                        Text("Resend link")
                    }
                }
                .font(.system(.footnote, design: .default, weight: .semibold))
                .foregroundColor(canResend ? VP.accent : VP.dim)
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
                .frame(minHeight: 44)
            }
            .disabled(!canResend)

            Button("Use a different email") {
                auth.clearMagicLinkState()
                email.isEmpty ? () : (self.email = "")
            }
            .font(.footnote)
            .foregroundColor(VP.dim)
            .frame(minHeight: 44)
        }
        .padding(.vertical, 24)
        .frame(maxWidth: .infinity)
    }

    // MARK: - OAuth (gated)

    @ViewBuilder
    private var oauthButtons: some View {
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

        Button {
            loading = true
            Task {
                await auth.signInWithGoogle()
                loading = false
            }
        } label: {
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
    }

    // MARK: - Helpers

    private var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespaces).isEmpty
            && email.contains("@")
            && !loading
    }

    private var canResend: Bool {
        !loading && auth.magicLinkCooldownSec == 0
    }

    private func submit() {
        guard canSubmit else { return }
        loading = true
        Task {
            _ = await auth.sendMagicLink(email: email)
            loading = false
        }
    }

    private func resend() {
        guard let target = auth.magicLinkSentTo, canResend else { return }
        loading = true
        Task {
            _ = await auth.sendMagicLink(email: target)
            loading = false
        }
    }
}
