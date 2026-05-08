import SwiftUI

// Modal sheet shown when the kids app needs parent-mode access (settings,
// audit log, legal links, expert sessions, unpair, etc.). Posts to
// /api/kids/parent/elevate via ParentSessionManager.elevate.
//
// Error states (from ParentSessionError):
//   .invalidPin              → red shake + "Incorrect PIN. Try again."
//   .locked(retryAfter:)     → "Too many attempts. Try again in 60s." countdown
//   .tier3LockedMustReset    → banner + prominent reset button
//   .pinNotSet               → "Set up your PIN first." (no setup-from-here
//                              path right now — the spec routes to setup, but
//                              setup needs the parent's GoTrue session and
//                              this device may not have one. Surface the
//                              error + a hint to use the web/parent app.)
//   .invalidKidToken         → "Re-pair this device."
//   .network                 → generic retry copy

struct ParentPinEntryView: View {
    /// The kid JWT — pulled from PairingClient at the call-site.
    let kidToken: String

    /// Called once parent-mode is live. Sheet dismisses first, then this
    /// fires so the destination view doesn't unmount mid-presentation.
    let onSuccess: () async -> Void

    /// Optional cancel hook for callers that want to know the user bailed.
    var onCancel: (() -> Void)? = nil

    @StateObject private var session = ParentSessionManager.shared

    @Environment(\.dismiss) private var dismiss

    @State private var pin: String = ""
    @State private var isBusy: Bool = false
    @State private var errorState: ParentSessionError? = nil
    @State private var showShake: Bool = false
    @State private var lockoutSeconds: Int = 0
    @State private var lockoutTimer: Task<Void, Never>? = nil
    @State private var presentReset: Bool = false
    /// Set to true once `submit` succeeds so onDisappear knows not to fire
    /// the cancel callback. Otherwise swipe-down would still treat success
    /// as cancel.
    @State private var didSucceed: Bool = false

    private let pinLength = 6

    private var isLockedOut: Bool { lockoutSeconds > 0 }

    private var canSubmit: Bool {
        pin.count == pinLength && !isBusy && !isLockedOut
    }

    var body: some View {
        ZStack {
            K.bg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 28) {
                    cancelHeader

                    headerBlock

                    if case .tier3LockedMustReset = errorState {
                        tier3Banner
                    }

                    pinBlock

                    submitButton

                    Button {
                        presentReset = true
                    } label: {
                        Text("Forgot PIN?")
                            .font(.system(.subheadline, design: .rounded, weight: .semibold))
                            .foregroundStyle(K.tealDark)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 28)
                .padding(.vertical, 32)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .scrollBounceBehavior(.basedOnSize)
        }
        // Allow swipe-down to cancel; the X button stays as the explicit
        // affordance. onDisappear fires the cancel callback if the sheet
        // closed without success.
        .interactiveDismissDisabled(false)
        .privacySnapshotProtected()
        .onDisappear {
            lockoutTimer?.cancel()
            if !didSucceed { onCancel?() }
        }
        .sheet(isPresented: $presentReset) {
            ParentPinResetView(
                kidToken: kidToken,
                onComplete: {
                    presentReset = false
                    pin = ""
                    errorState = nil
                }
            )
        }
    }

    // MARK: Subviews

    private var cancelHeader: some View {
        HStack {
            Button {
                // Don't call onCancel here — onDisappear handles it once,
                // covering both X-tap and swipe-down. Calling here would
                // double-fire in the X-tap case.
                dismiss()
            } label: {
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
                    .fill(K.teal.opacity(0.12))
                    .overlay(Circle().strokeBorder(K.teal.opacity(0.25), lineWidth: 1.5))
                    .frame(width: 64, height: 64)
                Image(systemName: "lock.shield.fill")
                    .font(.scaledSystem(size: 28, weight: .bold))
                    .foregroundStyle(K.tealDark)
            }
            Text("Parent mode")
                .font(.system(.title, design: .rounded, weight: .black))
                .foregroundStyle(K.text)
            Text("Enter your PIN to continue.")
                .font(.system(.subheadline, design: .rounded, weight: .medium))
                .foregroundStyle(K.dim)
                .multilineTextAlignment(.center)
        }
    }

    private var pinBlock: some View {
        VStack(spacing: 12) {
            ParentPinField(pin: $pin, length: pinLength, errorState: showShake)
                .onChange(of: pin) { _, newValue in
                    if showShake { showShake = false }
                    if errorState != nil { errorState = nil }
                    if newValue.count == pinLength && !isBusy && !isLockedOut {
                        submit()
                    }
                }

            if let err = errorState {
                errorRow(for: err)
            } else if isLockedOut {
                Text("Too many attempts. Try again in \(lockoutSeconds)s")
                    .font(.system(.caption, design: .rounded, weight: .semibold))
                    .foregroundStyle(K.coralDark)
                    .monospacedDigit()
            }
        }
    }

    @ViewBuilder
    private func errorRow(for err: ParentSessionError) -> some View {
        switch err {
        case .invalidPin:
            Text("Incorrect PIN. Try again.")
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .foregroundStyle(K.coralDark)
        case .locked(let retry):
            Text("Too many attempts. Try again in \(max(retry, lockoutSeconds))s")
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .foregroundStyle(K.coralDark)
                .monospacedDigit()
        case .tier3LockedMustReset:
            EmptyView()  // banner above already explains
        case .pinNotSet:
            Text("Set up your PIN first. Open Verity Post on the web to set it.")
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .foregroundStyle(K.coralDark)
                .multilineTextAlignment(.center)
        case .invalidKidToken:
            Text("Session expired. Re-pair this device.")
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .foregroundStyle(K.coralDark)
        case .network:
            VStack(spacing: 10) {
                Text("Couldn\u{2019}t reach the server.")
                    .font(.system(.caption, design: .rounded, weight: .semibold))
                    .foregroundStyle(K.coralDark)
                Button { retrySubmit() } label: {
                    Text("Retry")
                        .font(.system(.subheadline, design: .rounded, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 18)
                        .frame(minHeight: 44)
                        .background(K.tealDark)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        case .server(let m):
            Text(m)
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .foregroundStyle(K.coralDark)
                .multilineTextAlignment(.center)
        }
    }

    private var tier3Banner: some View {
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
            Button {
                presentReset = true
            } label: {
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

    private var submitButton: some View {
        Button { submit() } label: {
            HStack(spacing: 8) {
                if isBusy { ProgressView().tint(.white) }
                Text(isBusy ? "Checking\u{2026}" : "Unlock")
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

    // MARK: Submit

    private func submit() {
        guard canSubmit else { return }
        let attemptPin = pin
        Task {
            isBusy = true
            defer { isBusy = false }
            do {
                try await session.elevate(kidToken: kidToken, pin: attemptPin)
                let cb = onSuccess
                didSucceed = true
                dismiss()
                await cb()
            } catch let err as ParentSessionError {
                handle(err)
            } catch {
                print("[ParentPinEntryView] elevate failed:", error)
                errorState = .network
                triggerShake()
            }
        }
    }

    private func handle(_ err: ParentSessionError) {
        errorState = err
        triggerShake()
        switch err {
        case .invalidPin:
            pin = ""
        case .locked(let retry):
            startLockoutCountdown(retry)
            pin = ""
        case .tier3LockedMustReset:
            pin = ""
        default:
            break
        }
    }

    /// Called from the network-error Retry button. If the PIN field still has
    /// the full 6 digits, re-fire submit. Otherwise clear the error so the
    /// user can re-enter.
    private func retrySubmit() {
        if pin.count == pinLength {
            errorState = nil
            submit()
        } else {
            errorState = nil
        }
    }

    private func triggerShake() {
        showShake = true
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 500_000_000)
            showShake = false
        }
    }

    private func startLockoutCountdown(_ seconds: Int) {
        lockoutTimer?.cancel()
        lockoutSeconds = seconds
        lockoutTimer = Task { @MainActor in
            while lockoutSeconds > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
                lockoutSeconds -= 1
            }
            errorState = nil
        }
    }
}
