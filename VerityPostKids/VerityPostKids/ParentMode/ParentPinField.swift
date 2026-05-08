import SwiftUI

// Shared 6-digit PIN field for parent-mode flows.
//
// Security posture (locked spec):
//   - .keyboardType(.numberPad)
//   - .textContentType(nil)         (NO .oneTimeCode — autofill stripped)
//   - .disableAutocorrection(true)
//   - .textInputAutocapitalization(.never)
//   - Display dots, not digits — even if the user yanks down notification
//     center mid-entry, the visible glyphs are •.
//   - No length-hint placeholder (just empty dots), per owner: "Enter PIN"
//     not "Enter 6-digit PIN".
//
// Layout matches the OTP field in ParentAuthView so parents see a familiar
// visual rhythm across the two screens.

struct ParentPinField: View {
    @Binding var pin: String

    /// Visual cue — usually 6, but the server accepts 4-6 digits. iOS
    /// always prompts for 6.
    let length: Int

    /// Red-shake error tone — drives border colour + a short shake animation
    /// when toggled true.
    var errorState: Bool = false

    @FocusState private var focused: Bool
    @State private var shakeOffset: CGFloat = 0

    init(pin: Binding<String>, length: Int = 6, errorState: Bool = false) {
        self._pin = pin
        self.length = length
        self.errorState = errorState
    }

    var body: some View {
        ZStack {
            // The actual editable field is invisible — we render dots on top.
            // SecureField would mask, but iOS aggressively offers password
            // autofill on SecureField, which we don't want for a parent-mode
            // PIN. A plain TextField with manual masking + .textContentType(nil)
            // avoids both autofill and password-saving prompts.
            TextField("", text: Binding(
                get: { pin },
                set: { newValue in
                    let filtered = newValue.filter { $0.isNumber }
                    pin = String(filtered.prefix(length))
                }
            ))
            .keyboardType(.numberPad)
            .textInputAutocapitalization(.never)
            .disableAutocorrection(true)
            .textContentType(.none)
            .focused($focused)
            .foregroundStyle(.clear)        // hide the digits themselves
            .accentColor(.clear)            // hide the caret too
            .tint(.clear)
            .frame(maxWidth: .infinity, minHeight: 64)

            // Dot overlay
            HStack(spacing: 18) {
                ForEach(0..<length, id: \.self) { i in
                    Circle()
                        .fill(i < pin.count ? K.tealDark : K.border)
                        .frame(width: 14, height: 14)
                        .animation(.easeInOut(duration: 0.12), value: pin.count)
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
        .padding(.horizontal, 16)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(
                    errorState ? K.coralDark : (focused ? K.tealDark : K.border),
                    lineWidth: (focused || errorState) ? 2 : 1
                )
        )
        .offset(x: shakeOffset)
        .onChange(of: errorState) { _, newValue in
            if newValue { runShake() }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("PIN entry")
        .accessibilityValue("\(pin.count) of \(length) digits entered")
        .onAppear { focused = true }
    }

    private func runShake() {
        // Three-step horizontal shake; subtle but noticeable.
        let steps: [CGFloat] = [-8, 8, -6, 6, -3, 3, 0]
        Task { @MainActor in
            for s in steps {
                withAnimation(.easeInOut(duration: 0.05)) { shakeOffset = s }
                try? await Task.sleep(nanoseconds: 50_000_000)
            }
        }
    }
}

// MARK: Weak-PIN guard

enum ParentPinPolicy {
    /// Mirrors the server's blocklist subset. Server enforces authoritative
    /// list — this is a UX courtesy so parents don't get a 400 after typing
    /// "000000" and tapping submit.
    static let blocked: Set<String> = [
        "000000", "111111", "222222", "333333", "444444",
        "555555", "666666", "777777", "888888", "999999",
        "123456", "654321", "012345", "543210",
        "111222", "112233", "121212", "123123",
        "0000", "1111", "1234", "4321"
    ]

    static func isWeak(_ pin: String) -> Bool {
        if blocked.contains(pin) { return true }
        // Strict ascending or descending sequences are also "weak".
        if pin.count >= 4 {
            let digits = pin.compactMap(\.wholeNumberValue)
            if digits.count == pin.count {
                let asc = zip(digits, digits.dropFirst()).allSatisfy { $0 + 1 == $1 }
                let desc = zip(digits, digits.dropFirst()).allSatisfy { $0 - 1 == $1 }
                if asc || desc { return true }
            }
        }
        return false
    }
}
