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
    @FocusState private var focused: Bool

    private let codeLength = 8
    private let cooldownWindow = 60

    private var isLockedOut: Bool { cooldownSeconds > 0 }

    var body: some View {
        ZStack {
            K.bg.ignoresSafeArea()

            VStack(spacing: 28) {
                Spacer(minLength: 40)

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

                        Image(systemName: "number.square")
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
                    .background(K.teal)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .shadow(color: K.teal.opacity(0.3), radius: 12, y: 4)
                }
                .buttonStyle(.plain)
                .disabled(!canSubmit || isPairing || isLockedOut)
                .opacity((canSubmit && !isLockedOut) ? 1.0 : 0.6)

                VStack(spacing: 8) {
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
                            .foregroundStyle(K.teal)
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Need help — ask a grown-up to email support")
                }

                Spacer()
            }
            .padding(.horizontal, 28)
        }
        .onAppear { focused = true }
        .parentalGate(isPresented: $showHelpGate) {
            // After grown-up passes the math check, open the mail composer.
            if let url = URL(string: "mailto:support@veritypost.com?subject=Kids%20app%20pair%20code%20help") {
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
            }
        }
    }

    // MARK: Code field

    private var codeField: some View {
        TextField("XXXXXXXX", text: Binding(
            get: { code },
            set: { newValue in
                let filtered = newValue
                    .uppercased()
                    .filter { $0.isLetter || $0.isNumber }
                code = String(filtered.prefix(codeLength))
            }
        ))
        .keyboardType(.asciiCapable)
        .textInputAutocapitalization(.characters)
        .disableAutocorrection(true)
        .focused($focused)
        .font(.system(.largeTitle, design: .rounded, weight: .black))
        .foregroundStyle(K.text)
        .kerning(6)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, minHeight: 64)
        .padding(.horizontal, 16)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(focused ? K.teal : K.border, lineWidth: focused ? 2 : 1)
        )
        .onSubmit {
            if canSubmit { pairNow() }
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
                // T-043 — start visible countdown on rate-limit so the UI
                // matches the server-side 60s lockout window.
                if case .rateLimited = err { startCooldown(cooldownWindow) }
            } catch {
                // T-042 — don't leak raw Swift errors to a child's UI.
                // Log the real error for debugging; show a friendly line.
                print("[PairCodeView] pair failed:", error)
                errorMessage = "Something went wrong. Please try again."
            }
            isPairing = false
        }
    }

    // T-043 — 1Hz countdown timer. Clears error + count on expiry so the
    // UI returns to the idle state automatically.
    private func startCooldown(_ seconds: Int) {
        cooldownTimer?.invalidate()
        cooldownSeconds = seconds
        cooldownTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { t in
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
    }
}

#Preview {
    PairCodeView()
        .environmentObject(KidsAuth())
}
