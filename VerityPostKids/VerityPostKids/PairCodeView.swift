import SwiftUI

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
    @FocusState private var focused: Bool

    private let codeLength = 8

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

                        Image(systemName: "qrcode.viewfinder")
                            .font(.system(size: 32, weight: .bold))
                            .foregroundStyle(.white)
                    }

                    Text("Verity Post Kids")
                        .font(.system(size: 26, weight: .black, design: .rounded))
                        .foregroundStyle(K.text)

                    Text("Ask a grown-up for a pair code.\nType it in below.")
                        .font(.system(size: 14, weight: .medium, design: .rounded))
                        .foregroundStyle(K.dim)
                        .multilineTextAlignment(.center)
                }

                VStack(spacing: 12) {
                    codeField
                    if let err = errorMessage {
                        Text(err)
                            .font(.system(size: 13, weight: .semibold, design: .rounded))
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
                            .font(.system(size: 16, weight: .bold, design: .rounded))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(K.teal)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .shadow(color: K.teal.opacity(0.3), radius: 12, y: 4)
                }
                .buttonStyle(.plain)
                .disabled(!canSubmit || isPairing)
                .opacity(canSubmit ? 1.0 : 0.6)

                Text("The grown-up can make a code in the Verity Post app or on veritypost.com.")
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundStyle(K.dim)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 8)

                Spacer()
            }
            .padding(.horizontal, 28)
        }
        .onAppear { focused = true }
    }

    // MARK: Code field

    private var codeField: some View {
        HStack(spacing: 8) {
            ForEach(0..<codeLength, id: \.self) { i in
                codeBox(index: i)
            }
        }
        .overlay(
            TextField("", text: Binding(
                get: { code },
                set: { newValue in
                    let filtered = newValue
                        .uppercased()
                        .filter { $0.isLetter || $0.isNumber }
                    code = String(filtered.prefix(codeLength))
                }
            ))
            .keyboardType(.asciiCapable)
            .textContentType(.oneTimeCode)
            .autocapitalization(.allCharacters)
            .disableAutocorrection(true)
            .focused($focused)
            .foregroundStyle(Color.clear)
            .tint(Color.clear)
            .onSubmit {
                if canSubmit { pairNow() }
            }
        )
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
    }

    private func codeBox(index: Int) -> some View {
        let char: Character? = {
            let chars = Array(code)
            return index < chars.count ? chars[index] : nil
        }()
        let isCurrent = index == code.count

        return Text(char.map { String($0) } ?? "")
            .font(.system(size: 24, weight: .black, design: .rounded))
            .foregroundStyle(K.text)
            .frame(width: 36, height: 48)
            .background(K.card)
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(
                        isCurrent && focused ? K.teal : K.border,
                        lineWidth: isCurrent && focused ? 2 : 1
                    )
            )
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
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
            } catch {
                errorMessage = error.localizedDescription
            }
            isPairing = false
        }
    }
}

#Preview {
    PairCodeView()
        .environmentObject(KidsAuth())
}
