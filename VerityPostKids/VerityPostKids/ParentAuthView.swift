// Parent sign-in flow for the kids app. Supabase email OTP. No kid accounts involved.

import SwiftUI
import os.log

private let log = Logger(subsystem: "com.veritypost.kids", category: "ParentAuth")

struct ParentAuthView: View {
    @EnvironmentObject private var auth: KidsAuth
    @Environment(\.dismiss) private var dismiss

    private enum Step {
        case email
        case otp(email: String)
    }

    @State private var step: Step = .email
    @State private var emailInput: String = ""
    @State private var otpInput: String = ""
    @State private var isBusy: Bool = false
    @State private var errorMessage: String? = nil
    @State private var cooldownSeconds: Int = 0
    @State private var cooldownTimer: Timer? = nil

    @FocusState private var emailFocused: Bool
    @FocusState private var otpFocused: Bool

    private let cooldownWindow = 30

    private var isOnCooldown: Bool { cooldownSeconds > 0 }

    var body: some View {
        ZStack {
            K.bg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 28) {
                    switch step {
                    case .email:
                        emailStepView
                    case .otp(let email):
                        otpStepView(email: email)
                    }
                }
                .padding(.horizontal, 28)
                .padding(.vertical, 48)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .scrollBounceBehavior(.basedOnSize)
        }
    }

    // MARK: Email step

    private var emailStepView: some View {
        VStack(spacing: 28) {
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(.body, weight: .semibold))
                        .foregroundStyle(K.tealDark)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back")
                Spacer()
            }

            VStack(spacing: 10) {
                ZStack {
                    Circle()
                        .fill(LinearGradient(
                            colors: [K.teal, K.purple],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ))
                        .frame(width: 72, height: 72)
                        .shadow(color: K.teal.opacity(0.3), radius: 16, y: 6)

                    Image(systemName: "newspaper.fill")
                        .font(.system(.largeTitle, weight: .bold))
                        .foregroundStyle(.white)
                }

                Text("Set up as a parent")
                    .font(.system(.title, design: .rounded, weight: .black))
                    .foregroundStyle(K.text)

                Text("We\u{2019}ll send a verification code to your email.")
                    .font(.system(.subheadline, design: .rounded, weight: .medium))
                    .foregroundStyle(K.dim)
                    .multilineTextAlignment(.center)
            }

            VStack(spacing: 12) {
                emailField

                if let err = errorMessage {
                    Text(err)
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                        .foregroundStyle(K.coralDark)
                        .multilineTextAlignment(.center)
                }
            }

            Button { sendCode() } label: {
                HStack(spacing: 8) {
                    if isBusy {
                        ProgressView().tint(.white)
                    }
                    Text(isBusy ? "Sending\u{2026}" : "Send Code")
                        .font(.system(.body, design: .rounded, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(K.tealDark)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .shadow(color: K.teal.opacity(0.3), radius: 12, y: 4)
            }
            .buttonStyle(.plain)
            .disabled(emailInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isBusy)
            .opacity((emailInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isBusy) ? 0.6 : 1.0)
        }
        .onAppear { emailFocused = true }
    }

    private var emailField: some View {
        TextField("you@example.com", text: $emailInput)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .disableAutocorrection(true)
            .focused($emailFocused)
            .font(.scaledSystem(size: 17, weight: .medium, design: .rounded))
            .foregroundStyle(K.text)
            .frame(maxWidth: .infinity, minHeight: 52)
            .padding(.horizontal, 16)
            .background(K.card)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(emailFocused ? K.tealDark : K.border, lineWidth: emailFocused ? 2 : 1)
            )
            .onSubmit {
                if !emailInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isBusy {
                    sendCode()
                }
            }
    }

    private func sendCode() {
        let trimmedEmail = emailInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedEmail.isEmpty, !isBusy else { return }
        emailFocused = false
        errorMessage = nil
        Task {
            isBusy = true
            defer { isBusy = false }
            do {
                try await SupabaseKidsClient.shared.client.auth.signInWithOTP(
                    email: trimmedEmail,
                    shouldCreateUser: true
                )
                step = .otp(email: trimmedEmail)
            } catch {
                // Server-side error text can include the email or other
                // session details — keep that at .private; the static
                // prefix stays public so the line is searchable in logs.
                log.error("[ParentAuthView] signInWithOTP failed: \(error.localizedDescription, privacy: .private)")
                errorMessage = "Couldn\u{2019}t send the code. Check your email address and try again."
            }
        }
    }

    // MARK: OTP step

    private func otpStepView(email: String) -> some View {
        VStack(spacing: 28) {
            // Back button
            HStack {
                Button {
                    step = .email
                    otpInput = ""
                    errorMessage = nil
                    cooldownTimer?.invalidate()
                    cooldownTimer = nil
                    cooldownSeconds = 0
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(.body, weight: .semibold))
                        .foregroundStyle(K.tealDark)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Spacer()
            }

            VStack(spacing: 10) {
                Text("Check your email")
                    .font(.system(.title, design: .rounded, weight: .black))
                    .foregroundStyle(K.text)

                Text("Enter the 6-digit code sent to \(email).")
                    .font(.system(.subheadline, design: .rounded, weight: .medium))
                    .foregroundStyle(K.dim)
                    .multilineTextAlignment(.center)
            }

            VStack(spacing: 12) {
                otpField

                if let err = errorMessage {
                    Text(err)
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                        .foregroundStyle(K.coralDark)
                        .multilineTextAlignment(.center)
                }
            }

            Button { verifyCode(email: email) } label: {
                HStack(spacing: 8) {
                    if isBusy {
                        ProgressView().tint(.white)
                    }
                    Text(isBusy ? "Verifying\u{2026}" : "Verify")
                        .font(.system(.body, design: .rounded, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(K.tealDark)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .shadow(color: K.teal.opacity(0.3), radius: 12, y: 4)
            }
            .buttonStyle(.plain)
            .disabled(otpInput.count < 6 || isBusy)
            .opacity((otpInput.count < 6 || isBusy) ? 0.6 : 1.0)

            // Resend link with cooldown
            Button {
                resendCode(email: email)
            } label: {
                Text(isOnCooldown ? "Resend in \(cooldownSeconds)s" : "Resend code")
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                    .foregroundStyle(isOnCooldown ? K.dim : K.tealDark)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .monospacedDigit()
            }
            .buttonStyle(.plain)
            .contentShape(Rectangle())
            .disabled(isOnCooldown || isBusy)
        }
        .onAppear { otpFocused = true }
    }

    private var otpField: some View {
        TextField("------", text: Binding(
            get: { otpInput },
            set: { newValue in
                let filtered = newValue.filter { $0.isNumber }
                otpInput = String(filtered.prefix(6))
            }
        ))
        .keyboardType(.numberPad)
        .textInputAutocapitalization(.never)
        .disableAutocorrection(true)
        .focused($otpFocused)
        .font(.scaledSystem(size: 34, weight: .black, design: .rounded))
        .foregroundStyle(K.text)
        .kerning(8)
        .minimumScaleFactor(0.6)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, minHeight: 64)
        .padding(.horizontal, 16)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(otpFocused ? K.tealDark : K.border, lineWidth: otpFocused ? 2 : 1)
        )
    }

    private func verifyCode(email: String) {
        guard otpInput.count == 6, !isBusy else { return }
        otpFocused = false
        errorMessage = nil
        Task {
            isBusy = true
            defer { isBusy = false }
            do {
                let response = try await SupabaseKidsClient.shared.client.auth.verifyOTP(
                    email: email,
                    token: otpInput,
                    type: .email
                )
                guard let session = response.session else {
                    errorMessage = "Verification failed. Try again."
                    return
                }
                auth.adoptParentSession(email: email, accessToken: session.accessToken)
                dismiss()
            } catch {
                log.error("[ParentAuthView] verifyOTP failed: \(error.localizedDescription, privacy: .private)")
                errorMessage = "That code didn\u{2019}t work. Try again."
            }
        }
    }

    private func resendCode(email: String) {
        guard !isOnCooldown, !isBusy else { return }
        otpInput = ""
        errorMessage = nil
        Task {
            isBusy = true
            defer { isBusy = false }
            do {
                try await SupabaseKidsClient.shared.client.auth.signInWithOTP(
                    email: email,
                    shouldCreateUser: true
                )
                startCooldown(cooldownWindow)
            } catch {
                log.error("[ParentAuthView] resend failed: \(error.localizedDescription, privacy: .private)")
                errorMessage = "Couldn\u{2019}t resend the code. Try again."
            }
        }
    }

    // 1Hz countdown timer — same pattern as PairCodeView.startCooldown.
    private func startCooldown(_ seconds: Int) {
        cooldownTimer?.invalidate()
        cooldownSeconds = seconds
        let t = Timer(timeInterval: 1, repeats: true) { t in
            Task { @MainActor in
                if cooldownSeconds > 0 {
                    cooldownSeconds -= 1
                } else {
                    t.invalidate()
                    cooldownTimer = nil
                }
            }
        }
        RunLoop.current.add(t, forMode: .common)
        cooldownTimer = t
    }
}

#Preview {
    ParentAuthView()
        .environmentObject(KidsAuth())
}
