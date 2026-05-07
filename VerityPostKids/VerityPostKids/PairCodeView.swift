import SwiftUI
import UIKit

// Primary sign-in for the kids app. Parent enters the pair code on the
// kid's device (or the kid types what the parent reads). On success:
//   - Supabase session is set with the kid JWT
//   - KidsAuth flips to "paired" state
//   - App transitions to home

struct PairCodeView: View {
    @EnvironmentObject private var auth: KidsAuth

    @State private var code: String = ""
    @State private var isPairing = false
    @State private var errorMessage: String? = nil
    // T-043 — countdown display for the 60s rate-limit cooldown so kids
    // don't spam-tap Pair during the server-side lockout.
    @State private var cooldownSeconds: Int = 0
    @State private var cooldownTimer: Timer? = nil
    // Parental gate before mailto: opens — Apple Kids Category review
    // requires every external action (mail, web, payments) to be gated
    // behind a parental check.
    @State private var showHelpGate: Bool = false
    @State private var showMailUnavailable: Bool = false
    @FocusState private var focused: Bool
    @Environment(\.dismiss) private var dismiss

    // Ext-W5 — 8-slot grid is intentional (owner decision 2026-04-25).
    // Server's `redeem_kid_pair_code` accepts 6..16 chars but the
    // current generator produces exactly 8 (schema/095 line 106). If
    // the server-side generator ever changes length, this assertion
    // will fire on debug runs as a coupling alert. Production builds
    // skip the assert and would silently refuse a non-8-char code,
    // which is the safer failure mode (better to fail closed than
    // accept a length we can't render).
    private let codeLength = 8
    private let cooldownWindow = 60

    /// Coupling guard. Surfaces in debug if the server's pair-code
    /// length drifts from this UI's slot count. See ext-audit W.5.
    fileprivate static let SERVER_PAIR_CODE_LENGTH = 8
    private func assertServerCodeLengthMatches() {
        assert(
            codeLength == Self.SERVER_PAIR_CODE_LENGTH,
            "Pair code UI slot count (\(codeLength)) drifted from server generator " +
            "(\(Self.SERVER_PAIR_CODE_LENGTH)). Update both."
        )
    }

    private var isLockedOut: Bool { cooldownSeconds > 0 }

    var body: some View {
        ZStack {
            K.bg.ignoresSafeArea()

            ScrollView {
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

                    Text("Verity Post Kids")
                        .font(.system(.title, design: .rounded, weight: .black))
                        .foregroundStyle(K.text)

                    Text("Ask a grown-up for a pair code.\nType it in below.")
                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                        .foregroundStyle(K.dim)
                        .multilineTextAlignment(.center)
                }

                VStack(spacing: 12) {
                    codeField
                    if isLockedOut {
                        Text("Too many tries. Retry in \(cooldownSeconds)s")
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(K.coralDark)
                            .multilineTextAlignment(.center)
                            .monospacedDigit()
                    } else if let err = errorMessage {
                        Text(err)
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(K.coralDark)
                            .multilineTextAlignment(.center)
                    }
                }

                Button { pairNow() } label: {
                    HStack(spacing: 8) {
                        if isPairing {
                            ProgressView().tint(.white)
                        }
                        Text(isPairing ? "Pairing…" : "Pair")
                            .font(.system(.body, design: .rounded, weight: .bold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(K.tealDark)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .shadow(color: K.teal.opacity(0.3), radius: 12, y: 4)
                }
                .buttonStyle(.plain)
                .disabled(!canSubmit || isPairing || isLockedOut)
                .opacity((canSubmit && !isPairing && !isLockedOut) ? 1.0 : 0.6)

                VStack(spacing: 14) {
                    Text("Ask a grown-up to sign in at veritypost.com, open the kids dashboard, and tap \u{201C}Get a pair code.\u{201D} They\u{2019}ll read out an 8-character code for you to type in here.")
                        .font(.system(.caption, design: .rounded, weight: .medium))
                        .foregroundStyle(K.dim)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 8)

                    Button {
                        showHelpGate = true
                    } label: {
                        Text("Need help?")
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(K.tealDark)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .contentShape(Rectangle())
                    .accessibilityLabel("Need help — ask a grown-up to email support")
                }

            }
            .padding(.horizontal, 28)
            .padding(.vertical, 48)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .scrollBounceBehavior(.basedOnSize)
        .onAppear {
            focused = true
            assertServerCodeLengthMatches()
        }
        .parentalGate(isPresented: $showHelpGate) {
            // After grown-up passes the math check, open the mail composer.
            if let url = URL(string: "mailto:support@veritypost.com?subject=Kids%20app%20pair%20code%20help") {
                UIApplication.shared.open(url, options: [:]) { opened in
                    if !opened { showMailUnavailable = true }
                }
            }
        }
        .alert("No Mail App", isPresented: $showMailUnavailable) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Email support@veritypost.com for help with your pair code.")
        }
    }
    }

    // MARK: Code field

    private var codeField: some View {
        TextField("--------", text: Binding(
            get: { code },
            set: { newValue in
                let filtered = newValue
                    .uppercased()
                    .filter { $0.isASCII && ($0.isLetter || $0.isNumber) }
                code = String(filtered.prefix(codeLength))
            }
        ))
        .keyboardType(.asciiCapable)
        .textInputAutocapitalization(.characters)
        .disableAutocorrection(true)
        .focused($focused)
        .font(.scaledSystem(size: 34, weight: .black, design: .rounded))
        .foregroundStyle(K.text)
        .kerning(6)
        .minimumScaleFactor(0.6)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, minHeight: 64)
        .padding(.horizontal, 16)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(focused ? K.tealDark : K.border, lineWidth: focused ? 2 : 1)
        )
        .onSubmit {
            if canSubmit && !isPairing && !isLockedOut { pairNow() }
        }
    }

    private var canSubmit: Bool {
        code.count == codeLength
    }

    private func pairNow() {
        focused = false
        isPairing = true
        errorMessage = nil
        Task {
            do {
                let success = try await PairingClient.shared.pair(code: code)
                await auth.adoptPair(success)
            } catch let err as PairError {
                errorMessage = err.errorDescription
                switch err {
                case .rateLimited:
                    // T-043 — start visible countdown on rate-limit so the UI
                    // matches the server-side 60s lockout window.
                    startCooldown(cooldownWindow)
                case .invalidCode, .codeUsed, .codeExpired:
                    // Code is definitively rejected — clear field so the kid
                    // can't re-tap with the same dead code burning rate-limit slots.
                    code = ""
                default:
                    break
                }
            } catch {
                // T-042 — don't leak raw Swift errors to a child's UI.
                // Log the real error for debugging; show a friendly line.
                print("[PairCodeView] pair failed:", error)
                errorMessage = "Something went wrong. Try again."
            }
            isPairing = false
        }
    }

    // T-043 — 1Hz countdown timer. Clears error + count on expiry so the
    // UI returns to the idle state automatically. Scheduled on .common so
    // the countdown keeps ticking while the user is interacting (matching
    // the pattern used by ParentalGateModal.startCountdown).
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
                    errorMessage = nil
                }
            }
        }
        RunLoop.current.add(t, forMode: .common)
        cooldownTimer = t
    }
}

#Preview {
    PairCodeView()
        .environmentObject(KidsAuth())
}
