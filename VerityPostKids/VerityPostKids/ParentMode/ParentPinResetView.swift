import SwiftUI

// Two-step PIN reset over email OTP.
//
// Server endpoint:
//   POST /api/kids/parent/reset-pin   (no auth — kid_token is the proof)
//        body: { kid_token, action: 'request' }
//          → 200 ok ; sends OTP to parent email
//        body: { kid_token, action: 'confirm', otp_code, new_pin }
//          → 200 ok ; PIN replaced; any in-flight elevated tokens revoked
//          → 401 invalid OTP
//          → 429 rate_limited

struct ParentPinResetView: View {
    let kidToken: String
    let onComplete: () -> Void

    @Environment(\.dismiss) private var dismiss

    private enum Step { case request, confirm }

    @State private var step: Step = .request
    @State private var otpCode: String = ""
    @State private var newPin: String = ""
    @State private var confirmPin: String = ""
    @State private var isBusy: Bool = false
    @State private var errorMessage: String? = nil
    @State private var infoMessage: String? = nil
    @State private var errorShake: Bool = false

    /// Resend-code cooldown in seconds. Default 60s mirrors the Supabase
    /// server-side cooldown; if the server returns 429 with Retry-After,
    /// we override with the server-specified value.
    @State private var resendCooldown: Int = 0
    @State private var resendTimer: Task<Void, Never>? = nil
    @State private var isResending: Bool = false

    @FocusState private var otpFocused: Bool

    private let pinLength = 6
    private let otpLength = 6
    private let defaultResendCooldownSeconds = 60

    var body: some View {
        ZStack {
            K.bg.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 28) {
                    closeHeader
                    headerBlock

                    switch step {
                    case .request: requestStep
                    case .confirm: confirmStep
                    }

                    if let msg = errorMessage {
                        Text(msg)
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(K.coralDark)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                    } else if let msg = infoMessage {
                        Text(msg)
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(K.tealDark)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding(.horizontal, 28)
                .padding(.vertical, 32)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .scrollBounceBehavior(.basedOnSize)
        }
        .interactiveDismissDisabled(true)
        .privacySnapshotProtected()
        .onDisappear { resendTimer?.cancel() }
    }

    // MARK: Header

    private var closeHeader: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(.body, weight: .semibold))
                    .foregroundStyle(K.dim)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close")
            Spacer()
        }
    }

    private var headerBlock: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(K.coral.opacity(0.12))
                    .overlay(Circle().strokeBorder(K.coral.opacity(0.25), lineWidth: 1.5))
                    .frame(width: 64, height: 64)
                Image(systemName: "key.fill")
                    .font(.scaledSystem(size: 28, weight: .bold))
                    .foregroundStyle(K.coralDark)
            }
            Text("Reset parent PIN")
                .font(.system(.title, design: .rounded, weight: .black))
                .foregroundStyle(K.text)
            Text(step == .request
                 ? "We\u{2019}ll email a code to the parent on this account."
                 : "Enter the code from your email and choose a new PIN.")
                .font(.system(.subheadline, design: .rounded, weight: .medium))
                .foregroundStyle(K.dim)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: Step 1 — request

    private var requestStep: some View {
        Button { sendCode() } label: {
            HStack(spacing: 8) {
                if isBusy { ProgressView().tint(.white) }
                Text(isBusy ? "Sending\u{2026}" : "Send reset code")
                    .font(.system(.body, design: .rounded, weight: .bold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(K.tealDark)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .shadow(color: K.teal.opacity(0.3), radius: 12, y: 4)
        }
        .buttonStyle(.plain)
        .disabled(isBusy)
        .opacity(isBusy ? 0.6 : 1.0)
    }

    // MARK: Step 2 — confirm

    private var confirmStep: some View {
        VStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                fieldLabel("Email code")
                otpField
                resendButton
            }
            VStack(alignment: .leading, spacing: 8) {
                fieldLabel("New PIN")
                ParentPinField(pin: $newPin, length: pinLength, errorState: errorShake)
                    .onChange(of: newPin) { _, _ in
                        errorMessage = nil
                        errorShake = false
                    }
            }
            VStack(alignment: .leading, spacing: 8) {
                fieldLabel("Confirm new PIN")
                ParentPinField(pin: $confirmPin, length: pinLength, errorState: errorShake)
                    .onChange(of: confirmPin) { _, _ in
                        errorMessage = nil
                        errorShake = false
                    }
            }
            Button { confirmReset() } label: {
                HStack(spacing: 8) {
                    if isBusy { ProgressView().tint(.white) }
                    Text(isBusy ? "Saving\u{2026}" : "Save new PIN")
                        .font(.system(.body, design: .rounded, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(K.tealDark)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .shadow(color: K.teal.opacity(0.3), radius: 12, y: 4)
            }
            .buttonStyle(.plain)
            .disabled(!canSubmitConfirm)
            .opacity(canSubmitConfirm ? 1.0 : 0.6)
        }
    }

    private var canSubmitConfirm: Bool {
        otpCode.count == otpLength
            && newPin.count == pinLength
            && newPin == confirmPin
            && !ParentPinPolicy.isWeak(newPin)
            && !isBusy
    }

    @ViewBuilder
    private var resendButton: some View {
        if resendCooldown > 0 {
            Text("Resend in \(resendCooldown)s")
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .foregroundStyle(K.dim)
                .monospacedDigit()
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.top, 4)
        } else {
            Button { resendCode() } label: {
                HStack(spacing: 6) {
                    if isResending { ProgressView().controlSize(.mini).tint(K.tealDark) }
                    Text(isResending ? "Sending\u{2026}" : "Resend code")
                        .font(.system(.caption, design: .rounded, weight: .bold))
                        .foregroundStyle(K.tealDark)
                }
                .frame(maxWidth: .infinity, minHeight: 36)
            }
            .buttonStyle(.plain)
            .disabled(isResending)
            .padding(.top, 4)
        }
    }

    private func resendCode() {
        guard !isResending, resendCooldown == 0 else { return }
        errorMessage = nil
        Task {
            isResending = true
            defer { isResending = false }
            do {
                try await callResetPin(body: [
                    "kid_token": kidToken,
                    "action": "request"
                ])
                infoMessage = "We sent another code. Check your email."
                startResendCooldown(defaultResendCooldownSeconds)
            } catch let err as PinResetError {
                if case .rateLimited(let retry) = err {
                    startResendCooldown(retry ?? defaultResendCooldownSeconds)
                }
                errorMessage = err.userFacing
            } catch {
                print("[ParentPinResetView] resend failed:", error)
                errorMessage = "Couldn\u{2019}t resend. Try again."
            }
        }
    }

    private func startResendCooldown(_ seconds: Int) {
        resendTimer?.cancel()
        resendCooldown = max(seconds, 1)
        resendTimer = Task { @MainActor in
            while resendCooldown > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
                resendCooldown -= 1
            }
        }
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(.caption, design: .rounded, weight: .heavy))
            .foregroundStyle(K.dim)
            .textCase(.uppercase)
            .kerning(0.8)
    }

    private var otpField: some View {
        TextField("------", text: Binding(
            get: { otpCode },
            set: { newValue in
                otpCode = String(newValue.filter(\.isNumber).prefix(otpLength))
            }
        ))
        .keyboardType(.numberPad)
        .textInputAutocapitalization(.never)
        .disableAutocorrection(true)
        .textContentType(.oneTimeCode)   // OTP can autofill — separate from the PIN field
        .focused($otpFocused)
        .font(.scaledSystem(size: 28, weight: .black, design: .rounded))
        .foregroundStyle(K.text)
        .kerning(6)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, minHeight: 60)
        .padding(.horizontal, 16)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(otpFocused ? K.tealDark : K.border, lineWidth: otpFocused ? 2 : 1)
        )
        .accessibilityLabel("Email reset code")
        .accessibilityValue("\(otpCode.count) of \(otpLength) digits entered")
    }

    // MARK: Network — request

    private func sendCode() {
        guard !isBusy else { return }
        errorMessage = nil
        infoMessage = nil
        Task {
            isBusy = true
            defer { isBusy = false }
            do {
                try await callResetPin(body: [
                    "kid_token": kidToken,
                    "action": "request"
                ])
                step = .confirm
                infoMessage = "We sent a code to the parent\u{2019}s email. It expires in a few minutes."
                otpFocused = true
                startResendCooldown(defaultResendCooldownSeconds)
            } catch let err as PinResetError {
                if case .rateLimited(let retry) = err {
                    startResendCooldown(retry ?? defaultResendCooldownSeconds)
                }
                errorMessage = err.userFacing
            } catch {
                print("[ParentPinResetView] request failed:", error)
                errorMessage = "Couldn\u{2019}t send the code. Try again."
            }
        }
    }

    // MARK: Network — confirm

    private func confirmReset() {
        guard canSubmitConfirm else { return }
        guard newPin == confirmPin else {
            errorMessage = "PINs don\u{2019}t match. Try again."
            errorShake = true
            confirmPin = ""
            return
        }
        guard !ParentPinPolicy.isWeak(newPin) else {
            errorMessage = "That PIN is too easy to guess."
            errorShake = true
            newPin = ""
            confirmPin = ""
            return
        }
        Task {
            isBusy = true
            defer { isBusy = false }
            do {
                try await callResetPin(body: [
                    "kid_token": kidToken,
                    "action": "confirm",
                    "otp_code": otpCode,
                    "new_pin": newPin
                ])
                onComplete()
                dismiss()
            } catch let err as PinResetError {
                errorMessage = err.userFacing
                errorShake = true
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 500_000_000)
                    errorShake = false
                }
            } catch {
                print("[ParentPinResetView] confirm failed:", error)
                errorMessage = "Couldn\u{2019}t save the new PIN. Try again."
            }
        }
    }

    private func callResetPin(body: [String: String]) async throws {
        let url = SupabaseKidsClient.shared.siteURL
            .appendingPathComponent("api/kids/parent/reset-pin")

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 15
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            throw PinResetError.network
        }

        guard let http = response as? HTTPURLResponse else {
            throw PinResetError.unknown
        }

        if http.statusCode == 200 { return }

        let bodyDecoded = (try? JSONDecoder().decode(ResetErrorBody.self, from: data))
        let msg = bodyDecoded?.error ?? ""

        switch http.statusCode {
        case 400:
            if msg.contains("weak") || msg.contains("pin_too_weak") {
                throw PinResetError.weakPin
            }
            throw PinResetError.badRequest
        case 401:
            throw PinResetError.invalidOtp
        case 429:
            let retry = bodyDecoded?.retryAfter
                ?? Int(http.value(forHTTPHeaderField: "Retry-After") ?? "")
            throw PinResetError.rateLimited(retryAfter: retry)
        default:
            throw PinResetError.unknown
        }
    }
}

private enum PinResetError: Error {
    case invalidOtp
    case weakPin
    case badRequest
    case rateLimited(retryAfter: Int?)
    case network
    case unknown

    var userFacing: String {
        switch self {
        case .invalidOtp:   return "That code didn\u{2019}t work. Check your email and try again."
        case .weakPin:      return "That PIN is too easy to guess. Try a different one."
        case .badRequest:   return "Something\u{2019}s missing. Try again."
        case .rateLimited:  return "Too many attempts. Wait a minute and try again."
        case .network:      return "Couldn\u{2019}t reach the server. Try again."
        case .unknown:      return "Something went wrong. Try again."
        }
    }
}

private struct ResetErrorBody: Decodable {
    let error: String?
    let retryAfter: Int?
}
