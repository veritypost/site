import AuthenticationServices
import SwiftUI
import UIKit

// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
//
// S9-Q2-iOS — magic-link rebuild. Email-only form. The username is no
// longer captured here — the server-side magic-link flow creates the
// auth.users + public.users rows on link redemption with username NULL,
// then ContentView presents PickUsernameView as an undismissable sheet
// over MainTabView. This collapses the iOS flow to match the web's
// `/signup` → email-link → first-login WelcomeModal shape.
//
// OAuth (Apple + Google) buttons are preserved behind `VPOAuthEnabled`
// (default false). One-line flip re-enables them.

struct SignupView: View {
    @EnvironmentObject var auth: AuthViewModel
    @Environment(\.dismiss) var dismiss
    @State private var email = ""
    @State private var loading = false
    @State private var agreed = false
    @State private var localError: String?
    @State private var otpCode = ""
    @State private var otpLoading = false
    @FocusState private var emailFocused: Bool
    @FocusState private var otpFocused: Bool

    private var canSubmit: Bool {
        !loading
            && agreed
            && !email.trimmingCharacters(in: .whitespaces).isEmpty
            && email.contains("@")
    }

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
                        .padding(.top, 16)
                        .padding(.bottom, 24)

                    Text("Join the discussion that\u{2019}s earned.")
                        .font(.system(size: VP.Size.xxl, weight: .bold))
                        .tracking(-0.3)
                        .foregroundColor(VP.text)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.bottom, 6)

                    Text("Read an article, pass the comprehension check, then join the conversation.")
                        .font(.subheadline)
                        .foregroundColor(VP.dim)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.bottom, 28)

                    if let err = localError ?? auth.authError {
                        errorBanner(err)
                    }

                    if let sentTo = auth.magicLinkSentTo {
                        sentCard(email: sentTo)
                    } else {
                        if VPOAuthEnabled {
                            oauthButtons
                            HStack(spacing: 12) {
                                Rectangle().fill(VP.border).frame(height: 1)
                                Text("or")
                                    .font(.caption)
                                    .foregroundColor(VP.muted)
                                Rectangle().fill(VP.border).frame(height: 1)
                            }
                            .padding(.bottom, 18)
                        }
                        emailForm
                    }

                    Spacer().frame(height: 28)

                    if auth.magicLinkSentTo == nil {
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
                }
                .padding(.horizontal, 24)
                .padding(.top, 8)
            }
            .background(VP.bg.ignoresSafeArea())
        }
        .onChange(of: auth.authError) { _, newValue in
            if let msg = newValue {
                UIAccessibility.post(notification: .announcement, argument: msg)
            }
        }
        .onChange(of: localError) { _, newValue in
            if let msg = newValue {
                UIAccessibility.post(notification: .announcement, argument: msg)
            }
        }
        .onDisappear {
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
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
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
        .padding(.bottom, 18)

        // Combined age + terms acknowledgement (COPPA gate + ToS).
        HStack(alignment: .top, spacing: 10) {
            Button {
                agreed.toggle()
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            } label: {
                Image(systemName: agreed ? "checkmark.square.fill" : "square")
                    .foregroundColor(agreed ? VP.accent : VP.dim)
                    .font(.title3)
            }
            .buttonStyle(.plain)

            Group {
                if let attrStr = try? AttributedString(markdown: "I\u{2019}m 13 or older and agree to the [Terms](https://veritypost.com/terms) and [Privacy Policy](https://veritypost.com/privacy).") {
                    Text(attrStr)
                        .tint(VP.accent)
                } else {
                    Text("I\u{2019}m 13 or older and agree to the Terms and Privacy Policy.")
                }
            }
            .font(.footnote)
            .foregroundColor(VP.dim)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)
        }
        .padding(.bottom, 18)

        Button {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            submit()
        } label: {
            Group {
                if loading {
                    ProgressView().tint(.white)
                } else {
                    Text("Send sign-up link")
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
    }

    // MARK: - OTP code card

    @ViewBuilder
    private func sentCard(email: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Enter your 8-digit code")
                .font(.system(.title3, design: .default, weight: .bold))
                .foregroundColor(VP.text)
                .padding(.bottom, 8)

            Text("We sent a code to \(email). Enter it below to sign in.")
                .font(.footnote)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.leading)
                .padding(.bottom, 22)

            if let err = localError ?? auth.authError {
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
                Button("Use a different email") {
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
                .signUp,
                onRequest: { request in
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
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
            // text rather than presenting a sheet that would silently fall
            // back to web OAuth. The user can still pick Google or magic-link.
            Text("Sign in with Apple is temporarily unavailable.")
                .font(.system(size: 13))
                .foregroundColor(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .padding(.bottom, 10)
        }

        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
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
                .background(Color.white)
                .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.border, lineWidth: 1.5))
                .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
        }
        .disabled(loading)
        .padding(.bottom, 18)
    }

    @ViewBuilder
    private func errorBanner(_ msg: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(VP.danger)
                .font(.footnote)
                .accessibilityHidden(true)
            Text(msg)
                .font(.system(.footnote, design: .default, weight: .medium))
                .foregroundColor(VP.danger)
                .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(VP.failBg)
        .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.failBorder))
        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
        .padding(.bottom, 14)
    }

    // MARK: - Helpers

    private var canResend: Bool {
        !loading && auth.magicLinkCooldownSec == 0
    }

    private func submit() {
        localError = nil
        if !agreed {
            localError = "Please confirm you\u{2019}re 13 or older and agree to the Terms."
            return
        }
        loading = true
        Task {
            _ = await auth.sendMagicLink(email: email)
            loading = false
        }
    }

    private func resend() {
        localError = nil
        guard let target = auth.magicLinkSentTo, canResend else { return }
        otpCode = ""
        loading = true
        Task {
            _ = await auth.sendMagicLink(email: target)
            loading = false
        }
    }

    private func submitOtp() {
        localError = nil
        guard let target = auth.magicLinkSentTo, otpCode.count == 8, !otpLoading else { return }
        otpLoading = true
        Task {
            _ = await auth.verifyMagicCode(email: target, token: otpCode)
            otpLoading = false
        }
    }
}
