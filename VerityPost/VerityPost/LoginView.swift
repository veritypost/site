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
    @State private var otpCode = ""
    @State private var otpLoading = false
    @State private var showSignup = false
    @FocusState private var emailFocused: Bool
    @FocusState private var otpFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    // Hero
                    Text("Verity Post")
                        .font(.system(size: VP.Size.xl, weight: .bold, design: .serif))
                        .tracking(-0.4)
                        .foregroundColor(VP.text)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 56)
                        .padding(.bottom, 24)

                    Text("Pick up where you left off.")
                        .font(.system(size: VP.Size.xxl, weight: .bold))
                        .tracking(-0.3)
                        .foregroundColor(VP.text)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.bottom, 8)

                    Text("Welcome back.")
                        .font(.subheadline)
                        .foregroundColor(VP.dim)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.bottom, 32)

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
            TextField("Email Address", text: $email)
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
                .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
                .overlay(
                    RoundedRectangle(cornerRadius: VP.radiusMD)
                        .stroke(emailFocused ? VP.accent : VP.border, lineWidth: 1.5)
                )
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
                    Text("Send code")
                        .font(.system(.subheadline, design: .default, weight: .semibold))
                }
            }
            .frame(maxWidth: .infinity)
            .frame(minHeight: 48)
            .background(canSubmit ? VP.accent : VP.muted)
            .foregroundColor(.white)
            .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
        }
        .disabled(!canSubmit)

        Text("By continuing, you agree to our [Terms](https://veritypost.com/terms) and [Privacy Policy](https://veritypost.com/privacy).")
            .font(.caption)
            .foregroundColor(VP.dim)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.top, 12)
            .tint(VP.accent)
    }

    // MARK: - OTP code card

    @ViewBuilder
    private func sentCard(email: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Check your email")
                .font(.system(.title3, design: .default, weight: .bold))
                .foregroundColor(VP.text)
                .padding(.bottom, 8)

            Text("We sent an 8-digit code to \(email). Enter it below.")
                .font(.footnote)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.leading)
                .padding(.bottom, 22)

            if let err = auth.authError {
                Text(err)
                    .font(.system(.footnote, design: .default, weight: .medium))
                    .foregroundColor(VP.danger)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, 14)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Sign-in code")
                    .font(.footnote)
                    .foregroundColor(VP.dim)
                TextField("12345678", text: $otpCode)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
                    .focused($otpFocused)
                    .foregroundColor(VP.text)
                    .padding(12)
                    .frame(minHeight: 44)
                    .background(VP.card)
                    .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
                    .overlay(
                        RoundedRectangle(cornerRadius: VP.radiusMD)
                            .stroke(otpFocused ? VP.accent : VP.border, lineWidth: 1.5)
                    )
                    .onChange(of: otpCode) { _, newValue in
                        otpCode = String(newValue.filter(\.isNumber).prefix(8))
                    }
            }
            .padding(.bottom, 18)

            Button(action: submitOtp) {
                Group {
                    if otpLoading {
                        ProgressView().tint(.white)
                    } else {
                        Text("Sign in")
                            .font(.system(.subheadline, design: .default, weight: .semibold))
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(minHeight: 48)
                .background(otpCode.count == 8 && !otpLoading ? VP.accent : VP.muted)
                .foregroundColor(.white)
                .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
            }
            .disabled(otpCode.count < 8 || otpLoading)
            .padding(.bottom, 20)

            HStack {
                Button("\u{2190} Use a different email") {
                    auth.clearMagicLinkState()
                    self.email = ""
                    otpCode = ""
                }
                .font(.footnote)
                .foregroundColor(VP.dim)
                .frame(minHeight: 44)

                Spacer()

                Button(action: resend) {
                    if auth.magicLinkCooldownSec > 0 {
                        Text("Resend in \(auth.magicLinkCooldownSec)s")
                    } else {
                        Text("Resend code")
                    }
                }
                .font(.system(.footnote, design: .default, weight: .semibold))
                .foregroundColor(canResend ? VP.accent : VP.dim)
                .frame(minHeight: 44)
                .disabled(!canResend)
            }
        }
        .frame(maxWidth: .infinity)
        .onAppear { otpFocused = true }
    }

    // MARK: - OAuth (gated)

    @ViewBuilder
    private var oauthButtons: some View {
        if AuthViewModel.canStartAppleSignIn() {
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
            .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
            .disabled(loading)
            .padding(.bottom, 10)
        } else {
            // Entropy unavailable — replace the SIWA button with informative
            // text so the user doesn't tap a button that opens a sheet which
            // would silently fall back to web OAuth. They can still pick
            // Google or magic-link instead.
            Text("Sign in with Apple is temporarily unavailable.")
                .font(.system(size: 13))
                .foregroundColor(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .padding(.bottom, 10)
        }

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
                .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.border))
                .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
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
        otpCode = ""
        loading = true
        Task {
            _ = await auth.sendMagicLink(email: target)
            loading = false
        }
    }

    private func submitOtp() {
        guard let target = auth.magicLinkSentTo, otpCode.count == 8, !otpLoading else { return }
        otpLoading = true
        Task {
            _ = await auth.verifyMagicCode(email: target, token: otpCode)
            otpLoading = false
        }
    }
}
