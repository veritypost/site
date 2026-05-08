import SwiftUI

// First-run PIN setup. Shown after a parent OTP-verifies + names their kid
// + pairDirect succeeds. No skip button: the next step (signing the parent
// out + handing the device to the kid) requires the PIN to be live.
//
// Server endpoint:
//   POST /api/kids/parent/set-pin   (parent's normal Supabase session)
//        body: { pin }
//        200 → { ok: true, was_rotation: bool }
//        400 → pin_required | pin_format | pin_too_weak
//        401 → unauthenticated
//        403 → forbidden
//        429 → rate_limited

struct ParentPinSetupView: View {
    /// Parent's normal Supabase access token, captured from the OTP-verify
    /// response. set-pin requires this bearer; after success, the caller
    /// signs the GoTrue session out (so the parent's auth token doesn't
    /// linger on the kid's device).
    let parentAccessToken: String

    /// Called on successful set-pin. Caller is responsible for then signing
    /// the parent's GoTrue session out before dismissing into the kid flow.
    let onComplete: () async -> Void

    @State private var pin: String = ""
    @State private var confirmPin: String = ""
    @State private var isBusy: Bool = false
    @State private var errorMessage: String? = nil
    @State private var errorShake: Bool = false

    @FocusState private var focusedField: Field?

    private enum Field: Hashable { case first, confirm }

    private let pinLength = 6

    private var canSubmit: Bool {
        pin.count == pinLength
            && confirmPin.count == pinLength
            && pin == confirmPin
            && !ParentPinPolicy.isWeak(pin)
            && !isBusy
    }

    var body: some View {
        ZStack {
            K.bg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 28) {
                    headerBlock

                    VStack(spacing: 16) {
                        VStack(alignment: .leading, spacing: 8) {
                            fieldLabel("Enter PIN")
                            ParentPinField(pin: $pin, length: pinLength, errorState: errorShake)
                                .focused($focusedField, equals: .first)
                                .onChange(of: pin) { _, _ in
                                    errorMessage = nil
                                    errorShake = false
                                    if pin.count == pinLength {
                                        focusedField = .confirm
                                    }
                                }
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            fieldLabel("Confirm PIN")
                            ParentPinField(pin: $confirmPin, length: pinLength, errorState: errorShake)
                                .focused($focusedField, equals: .confirm)
                                .onChange(of: confirmPin) { _, _ in
                                    errorMessage = nil
                                    errorShake = false
                                }
                        }

                        if let err = errorMessage {
                            Text(err)
                                .font(.system(.caption, design: .rounded, weight: .semibold))
                                .foregroundStyle(K.coralDark)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity)
                        }
                    }

                    submitButton

                    helperText
                }
                .padding(.horizontal, 28)
                .padding(.vertical, 48)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .scrollBounceBehavior(.basedOnSize)
        }
        .onAppear { focusedField = .first }
        .interactiveDismissDisabled(true)
        .privacySnapshotProtected()
    }

    // MARK: Subviews

    private var headerBlock: some View {
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
                Image(systemName: "lock.shield.fill")
                    .font(.system(.largeTitle, weight: .bold))
                    .foregroundStyle(.white)
            }
            Text("Set up parent mode")
                .font(.system(.title, design: .rounded, weight: .black))
                .foregroundStyle(K.text)
                .multilineTextAlignment(.center)
            Text("This PIN locks parent settings. Your kid won\u{2019}t be able to change settings, add profiles, or see your account.")
                .font(.system(.subheadline, design: .rounded, weight: .medium))
                .foregroundStyle(K.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 4)
        }
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(.caption, design: .rounded, weight: .heavy))
            .foregroundStyle(K.dim)
            .textCase(.uppercase)
            .kerning(0.8)
    }

    private var submitButton: some View {
        Button { submit() } label: {
            HStack(spacing: 8) {
                if isBusy {
                    ProgressView().tint(.white)
                }
                Text(isBusy ? "Saving\u{2026}" : "Save PIN")
                    .font(.system(.body, design: .rounded, weight: .bold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(K.tealDark)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .shadow(color: K.teal.opacity(0.3), radius: 12, y: 4)
        }
        .buttonStyle(.plain)
        .disabled(!canSubmit)
        .opacity(canSubmit ? 1.0 : 0.6)
    }

    private var helperText: some View {
        Text("Pick something you\u{2019}ll remember but your kid can\u{2019}t guess. You can reset it via email if you forget.")
            .font(.system(.caption, design: .rounded, weight: .medium))
            .foregroundStyle(K.dim)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 8)
    }

    // MARK: Submit

    private func submit() {
        guard !isBusy else { return }
        guard pin == confirmPin else {
            triggerError("PINs don\u{2019}t match. Try again.")
            confirmPin = ""
            focusedField = .confirm
            return
        }
        guard !ParentPinPolicy.isWeak(pin) else {
            triggerError("That PIN is too easy to guess. Try a different one.")
            pin = ""
            confirmPin = ""
            focusedField = .first
            return
        }
        focusedField = nil
        errorMessage = nil

        Task {
            isBusy = true
            defer { isBusy = false }
            do {
                try await callSetPin()
                await onComplete()
            } catch let err as ParentPinSetupError {
                triggerError(err.userFacing)
                if case .weak = err {
                    pin = ""
                    confirmPin = ""
                    focusedField = .first
                }
            } catch {
                print("[ParentPinSetupView] set-pin failed:", error)
                triggerError("Couldn\u{2019}t save the PIN. Try again.")
            }
        }
    }

    private func triggerError(_ message: String) {
        errorMessage = message
        errorShake = true
        // Reset shake flag after a tick so a future error retriggers it.
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 500_000_000)
            errorShake = false
        }
    }

    // MARK: Network

    private func callSetPin() async throws {
        let url = SupabaseKidsClient.shared.siteURL
            .appendingPathComponent("api/kids/parent/set-pin")

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 15
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(parentAccessToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["pin": pin])

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            throw ParentPinSetupError.network
        }

        guard let http = response as? HTTPURLResponse else {
            throw ParentPinSetupError.unknown
        }

        if http.statusCode == 200 { return }

        let body = (try? JSONDecoder().decode(SetPinErrorBody.self, from: data))
        let msg = body?.error ?? ""

        switch http.statusCode {
        case 400:
            if msg.contains("weak") || msg.contains("pin_too_weak") {
                throw ParentPinSetupError.weak
            }
            if msg.contains("format") || msg.contains("pin_format") {
                throw ParentPinSetupError.format
            }
            throw ParentPinSetupError.required
        case 401:
            throw ParentPinSetupError.unauthenticated
        case 403:
            throw ParentPinSetupError.forbidden
        case 429:
            throw ParentPinSetupError.rateLimited
        default:
            throw ParentPinSetupError.unknown
        }
    }
}

// MARK: Errors

private enum ParentPinSetupError: Error {
    case required, format, weak
    case unauthenticated, forbidden, rateLimited
    case network, unknown

    var userFacing: String {
        switch self {
        case .required:        return "Enter a PIN to continue."
        case .format:          return "Use only digits. 6 digits work best."
        case .weak:            return "That PIN is too easy to guess. Try a different one."
        case .unauthenticated: return "Session expired. Sign in again."
        case .forbidden:       return "You can\u{2019}t set the PIN from this account."
        case .rateLimited:     return "Too many attempts. Wait a minute and try again."
        case .network:         return "Couldn\u{2019}t reach the server. Check your connection."
        case .unknown:         return "Something went wrong. Try again."
        }
    }
}

private struct SetPinErrorBody: Decodable {
    let error: String?
}
