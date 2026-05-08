import SwiftUI

// Two-step confirmation sheet for destructive parent actions:
//   - unpair
//   - delete kid profile
//   - delete account
//   - change parent email
//
// Step 1: enter parent PIN (calls /api/kids/parent/elevate, same as
//         ParentPinEntryView).
// Step 2: enter the email OTP code that the server sends as part of the
//         action's confirm step. Only after both succeed does the wrapped
//         `onConfirmed` closure fire.
//
// Server contract:
//   POST /api/kids/parent/sensitive/<actionKey>/request   (Bearer elevated)
//        body: {}
//        200 → { pending_id, otp_sent: true, expires_in: 600 }
//        429 → { error: 'otp_throttled', retry_after }
//   POST /api/kids/parent/sensitive/<actionKey>/confirm   (Bearer elevated)
//        body: { pending_id, otp_code }
//        200 → { ok, confirmation_token, action, expires_at }
//        401 invalid_otp → wrong code or expired pending
//        429 pin_locked  → 5 wrong tries on this pending
//        404/410         → pending expired
//
// Server enforces a 10-minute TTL on the pending row; iOS does NOT layer a
// shorter local TTL — we trust the server and just show a live countdown.

struct SensitiveActionView: View {
    /// Identifies the action server-side once routes land. Currently used
    /// only for copy + future request-body bookkeeping.
    let actionKey: String

    /// Plain-language label for the destructive action ("Unpair this device",
    /// "Delete this kid", etc).
    let actionLabel: String

    /// Slightly longer description shown above the PIN field ("This will
    /// remove this device's pairing and sign the kid out").
    let actionDescription: String

    /// Kid token from PairingClient — same as the elevate flow.
    let kidToken: String

    /// Fires after PIN + OTP both succeed. The destination view runs the
    /// actual destructive call here. Receives the server-issued
    /// `confirmation_token` so the destructive route consumer can redeem it
    /// (one-shot). Empty string means the token wasn't captured — caller
    /// should treat that as a defensive fallback path.
    let onConfirmed: (_ confirmationToken: String) async -> Void

    @StateObject private var session = ParentSessionManager.shared
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase

    private enum Step { case pin, otp }

    @State private var step: Step = .pin
    @State private var pin: String = ""
    @State private var otpCode: String = ""
    @State private var isBusy: Bool = false
    @State private var errorMessage: String? = nil
    @State private var infoMessage: String? = nil
    @State private var errorShake: Bool = false
    @State private var lockoutSeconds: Int = 0
    @State private var lockoutTimer: Task<Void, Never>? = nil

    // Server-issued pending row tracking the OTP for this action.
    @State private var pendingId: String? = nil
    @State private var pendingExpiresAt: Date? = nil
    @State private var nowTick: Date = Date()
    @State private var countdownTimer: Task<Void, Never>? = nil
    @State private var pendingExpired: Bool = false
    @State private var showTier3: Bool = false
    @State private var presentReset: Bool = false

    /// Server-issued confirmation token for the elevated destructive call.
    /// Held only in memory; the future destructive route consumer will read
    /// this from the Sensitive sheet's onConfirmed closure. Never persist.
    @State private var confirmationToken: String? = nil

    @FocusState private var otpFocused: Bool

    private let pinLength = 6
    private let otpLength = 6

    var body: some View {
        ZStack {
            K.bg.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 28) {
                    closeHeader
                    headerBlock
                    if showTier3 {
                        Tier3ResetBanner(onReset: { showTier3 = false; presentReset = true })
                    }
                    switch step {
                    case .pin: pinStep
                    case .otp: otpStep
                    }
                    if let err = errorMessage {
                        Text(err)
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(K.coralDark)
                            .multilineTextAlignment(.center)
                    } else if let info = infoMessage {
                        Text(info)
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(K.tealDark)
                            .multilineTextAlignment(.center)
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
        .onDisappear {
            lockoutTimer?.cancel()
            countdownTimer?.cancel()
        }
        .onChange(of: scenePhase) { _, newPhase in
            // Foreground sync: if the OTP step's pending row already expired
            // while the app was backgrounded, surface the expired state
            // immediately instead of waiting for the next 1Hz countdown tick.
            // Without this, Confirm can sit enabled for up to a second after
            // returning to the app post-expiry.
            guard newPhase == .active, step == .otp else { return }
            let nowExpired = pendingExpiresAt.map { $0 <= Date() } ?? false
            if nowExpired && !pendingExpired {
                pendingExpired = true
                countdownTimer?.cancel()
                errorMessage = "Code expired \u{2014} start over."
            }
        }
        .sheet(isPresented: $presentReset) {
            ParentPinResetView(
                kidToken: kidToken,
                onComplete: {
                    presentReset = false
                    pin = ""
                    errorMessage = nil
                    showTier3 = false
                }
            )
        }
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
                    .overlay(Circle().strokeBorder(K.coral.opacity(0.3), lineWidth: 1.5))
                    .frame(width: 64, height: 64)
                Image(systemName: "exclamationmark.shield.fill")
                    .font(.scaledSystem(size: 28, weight: .bold))
                    .foregroundStyle(K.coralDark)
            }
            Text(actionLabel)
                .font(.system(.title2, design: .rounded, weight: .black))
                .foregroundStyle(K.text)
                .multilineTextAlignment(.center)
            Text(actionDescription)
                .font(.system(.subheadline, design: .rounded, weight: .medium))
                .foregroundStyle(K.dim)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: Step 1 — PIN

    private var pinStep: some View {
        VStack(spacing: 16) {
            stepCaption("Step 1 — Enter your PIN")
            VStack(alignment: .leading, spacing: 8) {
                fieldLabel("Parent PIN")
                ParentPinField(pin: $pin, length: pinLength, errorState: errorShake)
                    .onChange(of: pin) { _, newValue in
                        errorMessage = nil
                        if errorShake { errorShake = false }
                        if newValue.count == pinLength && !isBusy && lockoutSeconds == 0 {
                            submitPin()
                        }
                    }
            }
            if lockoutSeconds > 0 {
                Text("Too many attempts. Try again in \(lockoutSeconds)s")
                    .font(.system(.caption, design: .rounded, weight: .semibold))
                    .foregroundStyle(K.coralDark)
                    .monospacedDigit()
            }
            Button { submitPin() } label: {
                HStack(spacing: 8) {
                    if isBusy { ProgressView().tint(.white) }
                    Text(isBusy ? "Checking\u{2026}" : "Continue")
                        .font(.system(.body, design: .rounded, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(K.tealDark)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(pin.count != pinLength || isBusy || lockoutSeconds > 0)
            .opacity((pin.count == pinLength && !isBusy && lockoutSeconds == 0) ? 1.0 : 0.6)
        }
    }

    // MARK: Step 2 — OTP

    private var otpStep: some View {
        VStack(spacing: 16) {
            stepCaption("Step 2 — Confirm by email")
            VStack(alignment: .leading, spacing: 8) {
                fieldLabel("Email code")
                otpField
                if let exp = pendingExpiresAt, !pendingExpired {
                    let remaining = max(0, Int(exp.timeIntervalSince(nowTick)))
                    let mm = remaining / 60
                    let ss = remaining % 60
                    Text(String(format: "Code expires in %d:%02d", mm, ss))
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                        .foregroundStyle(K.dim)
                        .monospacedDigit()
                        .frame(maxWidth: .infinity, alignment: .center)
                        .accessibilityLabel("Code expires in \(mm) minutes \(ss) seconds")
                } else if pendingExpired {
                    Text("Code expired — start over")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                        .foregroundStyle(K.coralDark)
                        .frame(maxWidth: .infinity, alignment: .center)
                }
            }
            Button { submitOtp() } label: {
                HStack(spacing: 8) {
                    if isBusy { ProgressView().tint(.white) }
                    Text(isBusy ? "Confirming\u{2026}" : "Confirm \(actionLabel.lowercased())")
                        .font(.system(.body, design: .rounded, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(K.coralDark)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(otpCode.count != otpLength || isBusy || pendingExpired)
            .opacity((otpCode.count == otpLength && !isBusy && !pendingExpired) ? 1.0 : 0.6)
        }
    }

    private func stepCaption(_ text: String) -> some View {
        Text(text)
            .font(.system(.caption, design: .rounded, weight: .semibold))
            .foregroundStyle(K.dim)
            .frame(maxWidth: .infinity, alignment: .center)
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
        .textContentType(.oneTimeCode)
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
        .accessibilityLabel("Email confirmation code")
        .accessibilityValue("\(otpCode.count) of \(otpLength) digits entered")
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(.caption, design: .rounded, weight: .heavy))
            .foregroundStyle(K.dim)
            .textCase(.uppercase)
            .kerning(0.8)
    }

    // MARK: Actions

    private func submitPin() {
        guard pin.count == pinLength, !isBusy, lockoutSeconds == 0 else { return }
        let attemptPin = pin
        Task {
            isBusy = true
            defer { isBusy = false }
            do {
                try await session.elevate(kidToken: kidToken, pin: attemptPin)
                // Now request the email OTP for this specific sensitive action.
                try await requestSensitiveOtp()
                step = .otp
                infoMessage = "We sent a confirmation code to your email."
                otpFocused = true
                pin = ""
                pendingExpired = false
                startCountdown()
            } catch let err as ParentSessionError {
                handlePinError(err)
            } catch let err as SensitiveActionError {
                handleSensitiveError(err, duringRequest: true)
            } catch {
                print("[SensitiveActionView] elevate/request failed:", error)
                errorMessage = "Couldn\u{2019}t reach the server. Try again."
                triggerShake()
            }
        }
    }

    private func handlePinError(_ err: ParentSessionError) {
        errorMessage = err.errorDescription
        triggerShake()
        switch err {
        case .invalidPin: pin = ""
        case .locked(let retry):
            pin = ""
            startLockout(retry)
        case .tier3LockedMustReset:
            pin = ""
            showTier3 = true
        default: break
        }
    }

    private func submitOtp() {
        guard otpCode.count == otpLength, !isBusy, !pendingExpired else { return }
        Task {
            isBusy = true
            defer { isBusy = false }
            do {
                try await confirmSensitiveOtp()
                let cb = onConfirmed
                let token = self.confirmationToken ?? ""
                // Zero the token from @State before firing — it's a one-shot
                // bearer for the destructive route and shouldn't outlive the
                // closure call. Server enforces single-use server-side anyway,
                // but we don't want a stale token sitting in memory if the
                // sheet were ever revisited.
                self.confirmationToken = nil
                dismiss()
                await cb(token)
            } catch let err as SensitiveActionError {
                handleSensitiveError(err, duringRequest: false)
            } catch {
                print("[SensitiveActionView] confirm failed:", error)
                errorMessage = "Couldn\u{2019}t reach the server. Try again."
                triggerShake()
                otpCode = ""
            }
        }
    }

    /// Map sensitive-action errors to UX state. `duringRequest` is true when
    /// the error came out of /request (PIN-step success → request leg);
    /// false when it came out of /confirm.
    private func handleSensitiveError(_ err: SensitiveActionError, duringRequest: Bool) {
        triggerShake()
        switch err {
        case .invalidOtp:
            errorMessage = "That code didn\u{2019}t work. Try again."
            otpCode = ""
        case .pendingLocked:
            errorMessage = "Too many wrong codes — start over."
            resetToPinStep()
        case .pendingExpired:
            errorMessage = "Code expired — start over."
            pendingExpired = true
            countdownTimer?.cancel()
            // Allow user to tap close + reopen, or we can reset back to PIN.
            resetToPinStep()
        case .sessionExpired:
            errorMessage = "Parent session timed out. Start over."
            resetToPinStep()
        case .throttled(let retry):
            errorMessage = duringRequest
                ? "Too many requests. Try again in \(retry)s."
                : "Too many tries. Wait \(retry)s."
        case .network:
            errorMessage = "Couldn\u{2019}t reach the server. Try again."
        }
    }

    private func resetToPinStep() {
        otpCode = ""
        pendingId = nil
        pendingExpiresAt = nil
        countdownTimer?.cancel()
        countdownTimer = nil
        step = .pin
        infoMessage = nil
    }

    private func startCountdown() {
        countdownTimer?.cancel()
        nowTick = Date()
        countdownTimer = Task { @MainActor in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
                nowTick = Date()
                if let exp = pendingExpiresAt, exp <= nowTick {
                    pendingExpired = true
                    return
                }
            }
        }
    }

    private func triggerShake() {
        errorShake = true
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 500_000_000)
            errorShake = false
        }
    }

    private func startLockout(_ seconds: Int) {
        lockoutTimer?.cancel()
        lockoutSeconds = seconds
        lockoutTimer = Task { @MainActor in
            while lockoutSeconds > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
                lockoutSeconds -= 1
            }
        }
    }

    // MARK: Network — sensitive action request + confirm

    /// POST /api/kids/parent/sensitive/<actionKey>/request
    /// Bearer = elevated parent JWT (just minted by /elevate above).
    private func requestSensitiveOtp() async throws {
        guard let token = session.tokenForRequest() else {
            throw SensitiveActionError.sessionExpired
        }
        let url = SupabaseKidsClient.shared.siteURL
            .appendingPathComponent("api/kids/parent/sensitive/\(actionKey)/request")

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 15
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: [String: String]())

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            throw SensitiveActionError.network
        }

        guard let http = response as? HTTPURLResponse else {
            throw SensitiveActionError.network
        }

        if http.statusCode == 200 {
            let success = try JSONDecoder().decode(SensitiveRequestSuccess.self, from: data)
            self.pendingId = success.pending_id
            self.pendingExpiresAt = Date().addingTimeInterval(TimeInterval(success.expires_in))
            return
        }

        switch http.statusCode {
        case 401:
            throw SensitiveActionError.sessionExpired
        case 429:
            let body = try? JSONDecoder().decode(SensitiveErrorBody.self, from: data)
            let retry = body?.retry_after
                ?? Int(http.value(forHTTPHeaderField: "Retry-After") ?? "")
                ?? 60
            throw SensitiveActionError.throttled(retryAfter: retry)
        default:
            throw SensitiveActionError.network
        }
    }

    /// POST /api/kids/parent/sensitive/<actionKey>/confirm
    /// Bearer = elevated parent JWT. Body = pending_id + otp_code.
    private func confirmSensitiveOtp() async throws {
        guard let token = session.tokenForRequest() else {
            throw SensitiveActionError.sessionExpired
        }
        guard let pid = pendingId else {
            // Shouldn't happen — we only get here after a successful /request.
            throw SensitiveActionError.pendingExpired
        }
        let url = SupabaseKidsClient.shared.siteURL
            .appendingPathComponent("api/kids/parent/sensitive/\(actionKey)/confirm")

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 15
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "pending_id": pid,
            "otp_code": otpCode
        ])

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            throw SensitiveActionError.network
        }

        guard let http = response as? HTTPURLResponse else {
            throw SensitiveActionError.network
        }

        if http.statusCode == 200 {
            let body = try JSONDecoder().decode(SensitiveConfirmSuccess.self, from: data)
            self.confirmationToken = body.confirmation_token
            return
        }

        let body = try? JSONDecoder().decode(SensitiveErrorBody.self, from: data)
        switch http.statusCode {
        case 401:
            // 401 covers wrong code OR expired pending row. Server says
            // 'invalid_otp' for both — surface as invalidOtp so the user
            // gets the chance to retry with the same pending if they
            // mistyped.
            throw SensitiveActionError.invalidOtp
        case 404, 410:
            throw SensitiveActionError.pendingExpired
        case 429:
            if body?.error == "pin_locked" {
                throw SensitiveActionError.pendingLocked
            }
            let retry = body?.retry_after
                ?? Int(http.value(forHTTPHeaderField: "Retry-After") ?? "")
                ?? 60
            throw SensitiveActionError.throttled(retryAfter: retry)
        default:
            throw SensitiveActionError.network
        }
    }
}

// MARK: - Sensitive action errors + wire shapes (file-private)

private enum SensitiveActionError: Error {
    case invalidOtp
    case pendingLocked
    case pendingExpired
    case sessionExpired
    case throttled(retryAfter: Int)
    case network
}

private struct SensitiveRequestSuccess: Decodable {
    let pending_id: String
    let otp_sent: Bool
    let expires_in: Int
}

private struct SensitiveConfirmSuccess: Decodable {
    let ok: Bool
    let confirmation_token: String
    let action: String?
    let expires_at: String?
}

private struct SensitiveErrorBody: Decodable {
    let error: String?
    let retry_after: Int?
}

// MARK: - Tier-3 reset banner (file-private; matches ParentPinEntryView style)

private struct Tier3ResetBanner: View {
    let onReset: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(.title3, weight: .bold))
                    .foregroundStyle(K.coralDark)
                VStack(alignment: .leading, spacing: 4) {
                    Text("PIN locked")
                        .font(.system(.subheadline, design: .rounded, weight: .heavy))
                        .foregroundStyle(K.text)
                    Text("Too many wrong attempts. Reset it via email to keep going.")
                        .font(.system(.caption, design: .rounded, weight: .medium))
                        .foregroundStyle(K.dim)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            Button(action: onReset) {
                Text("Reset PIN via email")
                    .font(.system(.subheadline, design: .rounded, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(K.coralDark)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        .padding(14)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(K.coralDark.opacity(0.4), lineWidth: 1)
        )
    }
}
