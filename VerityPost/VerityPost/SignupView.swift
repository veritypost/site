import AuthenticationServices
import SwiftUI
import UIKit

// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18

// Rebuilt 2026-04-23 to match the web signup hierarchy: SIWA + Google at the
// top (Apple HIG §4.8 equal-prominence), email form as a second path below.
// Username is captured inline on iOS because there is no separate iOS
// pick-username screen — the web flow's /signup/pick-username step exists
// only on web. Keeping the iOS capture inline avoids a partial account with
// no username (which would mismatch VPUser.username's non-null contract on
// profile reads).

struct SignupView: View {
    @EnvironmentObject var auth: AuthViewModel
    @Environment(\.dismiss) var dismiss
    @FocusState private var focusedField: Field?

    @State private var showEmailForm = false
    @State private var email = ""
    @State private var username = ""
    @State private var password = ""
    @State private var showPassword = false
    @State private var agreed = false
    @State private var loading = false
    @State private var appleLoading = false
    @State private var googleLoading = false
    @State private var localError: String?

    private enum Field: Hashable { case username, email, password }

    private var validation: PasswordValidation { PasswordPolicy.validate(password) }

    private var canSubmit: Bool {
        !loading
            && agreed
            && validation.meetsPolicy
            && !email.trimmingCharacters(in: .whitespaces).isEmpty
            && username.count >= 3
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

                    // Error banner (pre-form so it doesn't get pushed off-screen).
                    if let err = localError ?? auth.authError {
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(VP.danger)
                                .font(.footnote)
                                // Decorative — error text already conveys
                                // the meaning, so VoiceOver shouldn't read
                                // "exclamation mark triangle fill" too.
                                .accessibilityHidden(true)
                            Text(err)
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

                    // SIWA first — Apple HIG §4.8 equal prominence.
                    SignInWithAppleButton(
                        .signUp,
                        onRequest: { request in
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            auth.prepareAppleRequest(request)
                        },
                        onCompletion: { result in
                            appleLoading = true
                            Task {
                                await auth.completeAppleSignIn(result: result)
                                appleLoading = false
                            }
                        }
                    )
                    .signInWithAppleButtonStyle(.black)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .cornerRadius(12)
                    .disabled(loading || appleLoading || googleLoading)
                    .overlay {
                        if appleLoading {
                            ProgressView().tint(.white)
                        }
                    }
                    .padding(.bottom, 10)

                    // Google
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        googleLoading = true
                        Task {
                            await auth.signInWithGoogle()
                            googleLoading = false
                        }
                    } label: {
                        HStack(spacing: 8) {
                            if googleLoading {
                                ProgressView().tint(VP.text)
                            } else {
                                Text("Continue with Google")
                                    .font(.system(.subheadline, design: .default, weight: .semibold))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 48)
                        .foregroundColor(VP.text)
                        .background(Color.white)
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border, lineWidth: 1.5))
                        .cornerRadius(12)
                    }
                    .disabled(loading || appleLoading || googleLoading)
                    .padding(.bottom, 18)

                    // Divider
                    HStack(spacing: 12) {
                        Rectangle().fill(VP.border).frame(height: 1)
                        Text("or")
                            .font(.caption)
                            .foregroundColor(VP.muted)
                        Rectangle().fill(VP.border).frame(height: 1)
                    }
                    .padding(.bottom, 18)

                    if !showEmailForm {
                        Button {
                            withAnimation(.easeOut(duration: 0.18)) { showEmailForm = true }
                        } label: {
                            Text("Continue with email")
                                .font(.system(.subheadline, design: .default, weight: .medium))
                                .frame(maxWidth: .infinity)
                                .frame(minHeight: 48)
                                .foregroundColor(VP.text)
                                .background(Color.white)
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border, lineWidth: 1.5))
                                .cornerRadius(12)
                        }
                        .disabled(loading || appleLoading || googleLoading)
                        .padding(.bottom, 24)
                    } else {
                        emailForm
                            .padding(.bottom, 24)
                    }

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
                .padding(.top, 8)
            }
            .background(VP.bg.ignoresSafeArea())
            // Tap background to dismiss keyboard — keeps the flow frictionless
            // when the user wants to tap a checkbox or a provider button.
            .contentShape(Rectangle())
            .onTapGesture {
                focusedField = nil
            }
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
    }

    @ViewBuilder
    private var emailForm: some View {
        VStack(spacing: 14) {
            field(label: "Username",
                  placeholder: "pick a username",
                  text: $username,
                  field: .username,
                  autocap: .none,
                  contentType: .username)

            field(label: "Email",
                  placeholder: "you@example.com",
                  text: $email,
                  field: .email,
                  keyboard: .emailAddress,
                  autocap: .none,
                  contentType: .emailAddress)

            passwordField
        }

        // Combined age + terms — single affirmative action covers both the
        // COPPA gate and the ToS/Privacy acknowledgement the signup route
        // demands.
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
        .padding(.top, 18)
        .padding(.bottom, 18)

        // Submit
        Button {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            submit()
        } label: {
            Group {
                if loading {
                    ProgressView().tint(.white)
                } else {
                    Text("Create account")
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

    @ViewBuilder
    private var passwordField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Password")
                .font(.footnote)
                .foregroundColor(VP.dim)
            ZStack(alignment: .trailing) {
                Group {
                    if showPassword {
                        TextField("At least 8 characters", text: $password)
                            .textContentType(.newPassword)
                            .autocapitalization(.none)
                            .disableAutocorrection(true)
                    } else {
                        SecureField("At least 8 characters", text: $password)
                            .textContentType(.newPassword)
                    }
                }
                .focused($focusedField, equals: .password)
                .foregroundColor(VP.text)
                .padding(12)
                .padding(.trailing, 56)
                .background(VP.card)
                .cornerRadius(10)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(focusedField == .password ? VP.accent : VP.border, lineWidth: 1.5)
                )

                Button {
                    showPassword.toggle()
                } label: {
                    Text(showPassword ? "Hide" : "Show")
                        .font(.system(.footnote, design: .default, weight: .semibold))
                        .foregroundColor(VP.dim)
                        .padding(.horizontal, 14)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(showPassword ? "Hide password" : "Show password")
            }

            if !password.isEmpty {
                strengthMeter
            }
        }
    }

    @ViewBuilder
    private var strengthMeter: some View {
        let bars = max(1, min(4, validation.strength))
        let color: Color = {
            switch bars {
            case 1: return VP.danger
            case 2: return VP.warn
            case 3: return VP.amber
            default: return VP.success
            }
        }()
        let label: String = {
            switch bars {
            case 1: return "Weak"
            case 2: return "Fair"
            case 3: return "Good"
            default: return "Strong"
            }
        }()

        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                ForEach(1...4, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(i <= bars ? color : VP.border)
                        .frame(height: 3)
                }
            }
            HStack {
                Text(label)
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundColor(color)
                Spacer()
                if !validation.meetsPolicy, let first = validation.failures.first {
                    Text("Needs: \(needMessage(first))")
                        .font(.caption2)
                        .foregroundColor(VP.muted)
                }
            }
        }
        .padding(.top, 4)
    }

    private func needMessage(_ failure: PasswordFailure) -> String {
        switch failure {
        case .length:    return "8+ characters"
        case .uppercase: return "an uppercase letter"
        case .number:    return "a number"
        case .symbol:    return "a special character"
        }
    }

    private func submit() {
        localError = nil
        if !agreed {
            localError = "Please confirm you\u{2019}re 13 or older and agree to the Terms."
            return
        }
        if let first = validation.failures.first {
            localError = PasswordPolicy.message(first)
            return
        }
        loading = true
        Task {
            await auth.signup(
                email: email,
                password: password,
                username: username,
                ageConfirmed: true,
                termsAccepted: true
            )
            loading = false
        }
    }

    private func field(
        label: String,
        placeholder: String,
        text: Binding<String>,
        field: Field,
        keyboard: UIKeyboardType = .default,
        autocap: UITextAutocapitalizationType = .sentences,
        contentType: UITextContentType? = nil
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.footnote)
                .foregroundColor(VP.dim)
            TextField(placeholder, text: text)
                .focused($focusedField, equals: field)
                .keyboardType(keyboard)
                .autocapitalization(autocap)
                .disableAutocorrection(keyboard == .emailAddress || autocap == .none)
                .textContentType(contentType)
                .foregroundColor(VP.text)
                .padding(12)
                .background(VP.card)
                .cornerRadius(10)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(focusedField == field ? VP.accent : VP.border, lineWidth: 1.5)
                )
        }
    }
}
