import SwiftUI

// Parental gate — math challenge modal shown before any external link,
// IAP, settings change, or similar sensitive action. Required by Apple's
// Kids Category review guidelines and COPPA.
//
// Behavior:
//   - Two random numbers between 4 and 15, addition only
//   - 3 attempts; after 3 wrong, 5-min lockout persisted in UserDefaults
//   - Kid-friendly error wording ("That's not quite right")
//
// Usage:
//   .sheet(isPresented: $showGate) {
//       ParentalGateModal(
//           onSuccess: { doTheThing() },
//           onCancel:  { }
//       )
//   }
// Or via convenience modifier:
//   someView.parentalGate(isPresented: $showGate) { doTheThing() }

struct ParentalGateModal: View {
    let onSuccess: () -> Void
    let onCancel: () -> Void

    // Ext-W9 — bumped from 4..15 + 4..15 (max 30, child-solvable) to
    // 12..49 × 2..9. Two-digit times single-digit gives a problem
    // ~typical ages 9+ can do but younger kids in the target band
    // (5-8) struggle with. Apple's Kids Category guidance expects a
    // gate "not easily completed by a child."
    @State private var n1: Int = Int.random(in: 12...49)
    @State private var n2: Int = Int.random(in: 2...9)
    @State private var answer: String = ""
    @State private var attempts: Int = 0
    @State private var lockRemaining: Int = 0
    @State private var timer: Timer? = nil
    @State private var showError: Bool = false
    @FocusState private var focused: Bool

    private let maxAttempts = 3
    private let lockoutSeconds = 300
    private let lockoutKey = "vp.kids.parental_gate.lockout_until"

    private var isLocked: Bool { lockRemaining > 0 }

    var body: some View {
        ZStack {
            K.bg.ignoresSafeArea()

            VStack(spacing: 24) {
                header

                if isLocked {
                    lockedView
                } else {
                    challengeView
                }

                Button { timer?.invalidate(); onCancel() } label: {
                    Text("Not now")
                        .font(.scaledSystem(size: 14, weight: .semibold, design: .rounded))
                        .foregroundStyle(K.dim)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(K.card)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .strokeBorder(K.border, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)

                Spacer()
            }
            .padding(.horizontal, 28)
            .padding(.top, 40)
        }
        .onAppear {
            checkPersistedLockout()
            if !isLocked { focused = true }
        }
        .onDisappear { timer?.invalidate() }
    }

    // MARK: Header

    private var header: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(K.teal.opacity(0.12))
                    .overlay(Circle().strokeBorder(K.teal.opacity(0.25), lineWidth: 1.5))
                    .frame(width: 64, height: 64)
                Image(systemName: "checkmark.shield.fill")
                    .font(.scaledSystem(size: 28, weight: .bold))
                    .foregroundStyle(K.teal)
            }

            Text("Grown-up check")
                .font(.scaledSystem(size: 22, weight: .black, design: .rounded))
                .foregroundStyle(K.text)

            Text("A grown-up answers one math question to keep going.")
                .font(.scaledSystem(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(K.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 12)
        }
    }

    // MARK: Challenge

    private var challengeView: some View {
        VStack(spacing: 20) {
            Text("What is \(n1) × \(n2)?")
                .font(.scaledSystem(size: 28, weight: .black, design: .rounded))
                .foregroundStyle(K.text)

            HStack(spacing: 12) {
                TextField("", text: $answer)
                    .keyboardType(.numberPad)
                    .font(.scaledSystem(size: 32, weight: .heavy, design: .rounded))
                    .foregroundStyle(K.text)
                    .multilineTextAlignment(.center)
                    .frame(height: 60)
                    .frame(maxWidth: .infinity)
                    .background(K.card)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(showError ? K.coralDark : (focused ? K.teal : K.border),
                                          lineWidth: focused || showError ? 2 : 1)
                    )
                    .focused($focused)
                    .onChange(of: answer) { _, newValue in
                        answer = String(newValue.filter(\.isNumber).prefix(3))
                        if showError { showError = false }
                    }
                    .onSubmit(checkAnswer)

                Button { checkAnswer() } label: {
                    Image(systemName: "checkmark")
                        .font(.scaledSystem(size: 18, weight: .heavy))
                        .foregroundStyle(.white)
                        .frame(width: 60, height: 60)
                        .background(answer.isEmpty ? K.dim : K.teal)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(answer.isEmpty)
            }

            if attempts > 0 {
                Text(showError
                     ? "That's not quite right. (\(attempts)/\(maxAttempts))"
                     : "Attempts: \(attempts)/\(maxAttempts)")
                    .font(.scaledSystem(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(showError ? K.coralDark : K.dim)
            }
        }
    }

    // MARK: Locked

    private var lockedView: some View {
        VStack(spacing: 16) {
            Image(systemName: "hourglass")
                .font(.scaledSystem(size: 40, weight: .bold))
                .foregroundStyle(K.dim)
            Text("Too many tries. Try again in:")
                .font(.scaledSystem(size: 14, weight: .medium, design: .rounded))
                .foregroundStyle(K.dim)
            Text(formatCountdown(lockRemaining))
                .font(.scaledSystem(size: 40, weight: .black, design: .rounded))
                .foregroundStyle(K.teal)
                .monospacedDigit()
        }
        .padding(.vertical, 20)
    }

    // MARK: Logic

    private func checkAnswer() {
        guard let value = Int(answer), value == n1 * n2 else {
            attempts += 1
            answer = ""
            showError = true
            if attempts >= maxAttempts {
                beginLockout()
            } else {
                newQuestion()
            }
            return
        }
        clearLockoutState()
        timer?.invalidate()
        onSuccess()
    }

    private func newQuestion() {
        n1 = Int.random(in: 12...49)
        n2 = Int.random(in: 2...9)
    }

    private func beginLockout() {
        lockRemaining = lockoutSeconds
        let until = Date().addingTimeInterval(TimeInterval(lockoutSeconds))
        UserDefaults.standard.set(until, forKey: lockoutKey)
        startCountdown()
    }

    private func checkPersistedLockout() {
        if let until = UserDefaults.standard.object(forKey: lockoutKey) as? Date {
            let remaining = Int(until.timeIntervalSinceNow)
            if remaining > 0 {
                lockRemaining = remaining
                startCountdown()
            } else {
                UserDefaults.standard.removeObject(forKey: lockoutKey)
            }
        }
    }

    private func startCountdown() {
        timer?.invalidate()
        // Schedule on .common so the countdown keeps ticking while the
        // user is actively interacting with the modal (scrolling, dragging
        // the input). Timer.scheduledTimer's default schedule attaches to
        // the current runloop in .default mode, which iOS suspends during
        // tracking — kid stays "locked out" past the real expiry because
        // the countdown stalled while they fidgeted. .common = .default
        // ∪ tracking modes, so the timer fires regardless.
        let t = Timer(timeInterval: 1, repeats: true) { t in
            Task { @MainActor in
                if lockRemaining > 0 {
                    lockRemaining -= 1
                } else {
                    t.invalidate()
                    UserDefaults.standard.removeObject(forKey: lockoutKey)
                    attempts = 0
                    showError = false
                    newQuestion()
                    focused = true
                }
            }
        }
        RunLoop.current.add(t, forMode: .common)
        timer = t
    }

    private func clearLockoutState() {
        UserDefaults.standard.removeObject(forKey: lockoutKey)
    }

    private func formatCountdown(_ seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        return String(format: "%d:%02d", m, s)
    }
}

// MARK: - Convenience modifier

extension View {
    /// Present a parental gate before running `action`.
    func parentalGate(
        isPresented: Binding<Bool>,
        onPass action: @escaping () -> Void
    ) -> some View {
        self.sheet(isPresented: isPresented) {
            ParentalGateModal(
                onSuccess: {
                    isPresented.wrappedValue = false
                    action()
                },
                onCancel: {
                    isPresented.wrappedValue = false
                }
            )
        }
    }
}

#Preview {
    struct Demo: View {
        @State private var show = true
        var body: some View {
            ParentalGateModal(
                onSuccess: { show = false },
                onCancel:  { show = false }
            )
        }
    }
    return Demo()
}
