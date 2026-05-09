// Parent sign-in flow for the kids app. Supabase email OTP. No kid accounts involved.

import SwiftUI
import Foundation
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
        // Parity with adult iOS sendMagicLink — short-circuit obviously
        // malformed input so we don't burn a network round-trip on it.
        guard trimmedEmail.contains("@") else {
            errorMessage = "Please enter a valid email."
            return
        }
        emailFocused = false
        errorMessage = nil
        Task {
            isBusy = true
            defer { isBusy = false }
            do {
                try await Self.requestMagicLink(email: trimmedEmail)
                step = .otp(email: trimmedEmail)
            } catch {
                // Server-side error text can include the email or other
                // session details — keep that at .private; the static
                // prefix stays public so the line is searchable in logs.
                log.error("[ParentAuthView] send-magic-link failed: \(error.localizedDescription, privacy: .private)")
                if case ParentAuthError.invalidEmail = error {
                    errorMessage = "Please enter a valid email."
                } else if case ParentAuthError.gated = error {
                    // Server reported invite_required for a kids signup.
                    // Should never happen now that the route bypasses the
                    // adult beta gate for client='kids'; if it does, fail
                    // visibly so the user isn't trapped on the OTP screen.
                    errorMessage = "Sign-in isn\u{2019}t available right now. Please contact support@veritypost.com."
                } else {
                    errorMessage = "Couldn\u{2019}t send the code. Check your email address and try again."
                }
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

                Text("Enter the 8-digit code sent to \(email).")
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
            .disabled(otpInput.count < 8 || isBusy)
            .opacity((otpInput.count < 8 || isBusy) ? 0.6 : 1.0)

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
        TextField("--------", text: Binding(
            get: { otpInput },
            set: { newValue in
                let filtered = newValue.filter { $0.isNumber }
                otpInput = String(filtered.prefix(8))
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
        guard otpInput.count == 8, !isBusy else { return }
        otpFocused = false
        errorMessage = nil
        Task {
            isBusy = true
            defer { isBusy = false }
            do {
                let session = try await Self.verifyMagicCode(email: email, token: otpInput)
                // Persist via existing kids-auth state machine. The kids
                // client injects bearer tokens through SupabaseKidsClient,
                // so we hand the access token straight to adoptParentSession
                // rather than calling SDK setSession() — keeps parity with
                // the prior code path and avoids dual-source-of-truth.
                auth.adoptParentSession(email: email, accessToken: session.accessToken)
                dismiss()
            } catch ParentAuthError.invalidEmail {
                errorMessage = "Please re-enter your email."
            } catch ParentAuthError.invalidCode {
                // User-error path (wrong/expired OTP). Not a server fault
                // — don't log as an error, just nudge the retry.
                errorMessage = "That code didn\u{2019}t work. Try again."
            } catch {
                log.error("[ParentAuthView] verify-magic-code failed: \(error.localizedDescription, privacy: .private)")
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
                try await Self.requestMagicLink(email: email)
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

    // MARK: Magic-link send / verify

    // POSTs to /api/auth/send-magic-link with client="kids" so the route
    // bypasses the adult beta gate, tags audit/user_metadata as a kids
    // funnel, and sends the Verity-branded Resend email containing the
    // 8-digit OTP. The route always returns 200 with a generic body
    // except on 400 for malformed input. Defense-in-depth: if the body
    // ever does come back as { ok:false, reason:"invite_required" }
    // (server misconfig / regression), we surface .gated rather than
    // silently advancing to an OTP step that will never receive a code.
    fileprivate static func requestMagicLink(email: String) async throws {
        let url = SupabaseKidsClient.shared.siteURL.appendingPathComponent("api/auth/send-magic-link")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        struct Body: Encodable {
            let email: String
            let client: String
        }
        req.httpBody = try JSONEncoder().encode(Body(email: email, client: "kids"))
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw ParentAuthError.network
        }
        if http.statusCode == 400 { throw ParentAuthError.invalidEmail }
        guard (200...299).contains(http.statusCode) else {
            throw ParentAuthError.server(http.statusCode)
        }
        struct GatedShape: Decodable { let ok: Bool?; let reason: String? }
        if let parsed = try? JSONDecoder().decode(GatedShape.self, from: data),
           parsed.ok == false, parsed.reason == "invite_required" {
            throw ParentAuthError.gated
        }
    }

    // POSTs to /api/auth/verify-magic-code with client="kids" so the route
    // (a) bypasses the gate re-check at redemption and (b) returns the
    // session in the JSON body. URLSession can't read SSR cookies; the
    // body shape is the only path to a working session on iOS.
    fileprivate struct ParentVerifiedSession {
        let accessToken: String
        let expiresAt: Int?
    }

    fileprivate static func verifyMagicCode(email: String, token: String) async throws -> ParentVerifiedSession {
        let url = SupabaseKidsClient.shared.siteURL.appendingPathComponent("api/auth/verify-magic-code")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        struct Body: Encodable {
            let email: String
            let token: String
            let client: String
        }
        req.httpBody = try JSONEncoder().encode(Body(email: email, token: token, client: "kids"))
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw ParentAuthError.network }
        if http.statusCode == 400 { throw ParentAuthError.invalidEmail }
        guard (200...299).contains(http.statusCode) else { throw ParentAuthError.server(http.statusCode) }
        struct SessionShape: Decodable {
            let access_token: String
            let expires_at: Int?
        }
        struct OkShape: Decodable {
            let ok: Bool?
            let session: SessionShape?
        }
        let parsed = try JSONDecoder().decode(OkShape.self, from: data)
        // 200 + ok:true + no session is the privacy-posture path
        // (wrong/expired code). Caller surfaces "That code didn't
        // work" and the user retypes. invalidCode (not server) so
        // we don't log a wrong-code attempt as a server failure.
        guard parsed.ok == true, let s = parsed.session else {
            throw ParentAuthError.invalidCode
        }
        return ParentVerifiedSession(
            accessToken: s.access_token,
            expiresAt: s.expires_at
        )
    }
}

fileprivate enum ParentAuthError: Error {
    case invalidEmail
    case invalidCode
    case gated
    case network
    case server(Int)
}

#Preview {
    ParentAuthView()
        .environmentObject(KidsAuth())
}
