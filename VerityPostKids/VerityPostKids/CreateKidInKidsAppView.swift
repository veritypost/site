// Kid profile creation from within the kids app — parent auth path.

import SwiftUI

struct CreateKidInKidsAppView: View {
    @EnvironmentObject private var auth: KidsAuth

    @State private var kidName: String = ""
    @State private var isBusy: Bool = false
    @State private var errorMessage: String? = nil

    @FocusState private var nameFocused: Bool

    private var trimmedName: String { kidName.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canSubmit: Bool { !trimmedName.isEmpty && !isBusy }

    var body: some View {
        ZStack {
            K.bg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 0) {
                    // Signed-in-as caption + sign-out link
                    HStack(spacing: 4) {
                        Text("Signed in as \(auth.parentSession?.email ?? "")")
                            .font(.system(.caption, design: .rounded, weight: .medium))
                            .foregroundStyle(K.dim)
                            .lineLimit(1)
                            .truncationMode(.middle)

                        Button {
                            auth.clearParentSession()
                        } label: {
                            Text("Sign out")
                                .font(.system(.caption, design: .rounded, weight: .semibold))
                                .foregroundStyle(K.tealDark)
                                .frame(minHeight: 44)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.bottom, 32)

                    // Main content
                    VStack(spacing: 28) {
                        VStack(spacing: 10) {
                            Text("Name your young reader")
                                .font(.system(.title, design: .rounded, weight: .black))
                                .foregroundStyle(K.text)
                                .multilineTextAlignment(.center)

                            Text("You can change this any time in your parent account.")
                                .font(.system(.subheadline, design: .rounded, weight: .medium))
                                .foregroundStyle(K.dim)
                                .multilineTextAlignment(.center)
                        }

                        VStack(spacing: 12) {
                            nameField

                            if let err = errorMessage {
                                Text(err)
                                    .font(.system(.caption, design: .rounded, weight: .semibold))
                                    .foregroundStyle(K.coralDark)
                                    .multilineTextAlignment(.center)
                            }
                        }

                        Button { startReading() } label: {
                            HStack(spacing: 8) {
                                if isBusy {
                                    ProgressView().tint(.white)
                                }
                                Text(isBusy ? "Setting up\u{2026}" : "Start Reading \u{2192}")
                                    .font(.system(.body, design: .rounded, weight: .bold))
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .background(
                                LinearGradient(
                                    colors: [K.coral, K.teal],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .shadow(color: K.teal.opacity(0.3), radius: 12, y: 4)
                        }
                        .buttonStyle(.plain)
                        .disabled(!canSubmit)
                        .opacity(canSubmit ? 1.0 : 0.6)
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
        .onAppear { nameFocused = true }
    }

    // MARK: Name field

    private var nameField: some View {
        TextField("e.g. Alex", text: Binding(
            get: { kidName },
            set: { newValue in
                // Enforce 30-char max while typing
                kidName = String(newValue.prefix(30))
            }
        ))
        .textInputAutocapitalization(.words)
        .disableAutocorrection(false)
        .focused($nameFocused)
        .font(.scaledSystem(size: 20, weight: .semibold, design: .rounded))
        .foregroundStyle(K.text)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, minHeight: 60)
        .padding(.horizontal, 16)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(nameFocused ? K.tealDark : K.border, lineWidth: nameFocused ? 2 : 1)
        )
        .onSubmit {
            if canSubmit { startReading() }
        }
    }

    // MARK: Actions

    private func startReading() {
        guard !isBusy else { return }

        let name = trimmedName
        guard name.count >= 1 && name.count <= 30 else {
            errorMessage = "Name must be 1\u{2013}30 characters."
            return
        }

        guard let parentSession = auth.parentSession else {
            errorMessage = "Session expired. Please go back and sign in again."
            return
        }

        nameFocused = false
        errorMessage = nil

        Task {
            isBusy = true
            defer { isBusy = false }
            do {
                let success = try await PairingClient.shared.pairDirect(
                    parentToken: parentSession.accessToken,
                    kidName: name
                )
                auth.adoptPair(success)
                auth.clearParentSession()
            } catch PairError.unauthorized {
                errorMessage = "Session expired. Please go back and sign in again."
                auth.clearParentSession()
            } catch PairError.rateLimited {
                errorMessage = "Too many attempts. Wait a minute and try again."
            } catch {
                print("[CreateKidInKidsAppView] pairDirect failed:", error)
                errorMessage = "Something went wrong. Try again."
            }
        }
    }
}

#Preview {
    CreateKidInKidsAppView()
        .environmentObject({
            let a = KidsAuth()
            a.adoptParentSession(email: "parent@example.com", accessToken: "preview-token")
            return a
        }())
}
