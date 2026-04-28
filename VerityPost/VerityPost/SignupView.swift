import AuthenticationServices
import SwiftUI
import UIKit

// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
//
// S9-Q2-iOS — magic-link rebuild. Email-only form. The username is no
// longer captured here — the server-side magic-link flow creates the
// auth.users + public.users rows on link redemption with username NULL,
// then ContentView routes to PickUsernameView. This collapses the iOS
// flow to match the web's `/signup` → email-link → `/signup/pick-username`
// shape.
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
    @FocusState private var emailFocused: Bool

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
                        .font(.system(.title, design: .default, weight: .bold))
                        .tracking(-0.5)
                        .foregroundColor(VP.accent)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 16)
                        .padding(.bottom, 24)

                    Text("Join the discussion that\u{2019}s earned.")
                        .font(.system(size: 26, weight: .bold))
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
        .preferredColorScheme(.light)
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
            TextField("you@example.com", text: $email)
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .submitLabel(.send)
                .focused($emailFocused)
                .foregroundColor(VP.text)
                .padding(12)
                .frame(minHeight: 44)
                .background(VP.card)
                .cornerRadius(10)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(emailFocused ? VP.accent : VP.border, lineWidth: 1.5)
                )
        }
        .padding(.bottom, 18)

        // Combined age + terms acknowledgement (COPPA gate + ToS).
        Button {
            agreed.toggle()
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        } label: {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: agreed ? "checkmark.square.fill" : "square")
                    .foregroundColor(agreed ? VP.accent : VP.dim)
                    .font(.title3)
                (Text("I\u{2019}m 13 or older and agree to the ")
                    .foregroundColor(VP.dim)
                 + Text("Terms")
                    .foregroundColor(VP.accent)
                    .fontWeight(.semibold)
                 + Text(" and ")
                    .foregroundColor(VP.dim)
                 + Text("Privacy Policy")
                    .foregroundColor(VP.accent)
                    .fontWeight(.semibold)
                 + Text(".").foregroundColor(VP.dim))
                    .font(.footnote)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
        }
        .buttonStyle(.plain)
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
            .background(canSubmit ? VP.text : VP.border)
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
            Text("We sent a sign-up link to \(email). Tap it to finish creating your account.")
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
        .cornerRadius(12)
        .disabled(loading)
        .padding(.bottom, 10)

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
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border, lineWidth: 1.5))
                .cornerRadius(12)
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
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.failBorder))
        .cornerRadius(10)
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
        guard let target = auth.magicLinkSentTo, canResend else { return }
        loading = true
        Task {
            _ = await auth.sendMagicLink(email: target)
            loading = false
        }
    }
}
