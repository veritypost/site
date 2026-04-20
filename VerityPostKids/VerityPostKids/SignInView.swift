import SwiftUI

// DEV-ONLY fallback sign-in. In release builds, the kids app cannot be
// used without a real pair code (PairCodeView). This view is only
// reachable in DEBUG builds and only if a developer explicitly navigates
// to it (currently it isn't wired into KidsAppRoot anymore — kept as a
// reference + for manual testing via #Preview).

struct SignInView: View {
    @EnvironmentObject private var auth: KidsAuth

    @State private var email: String = ""
    @State private var password: String = ""
    @FocusState private var focused: Field?

    private enum Field { case email, password }

    var body: some View {
        ZStack {
            K.bg.ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer(minLength: 60)

                VStack(spacing: 10) {
                    Image(systemName: "hammer.fill")
                        .font(.system(size: 40, weight: .bold))
                        .foregroundStyle(K.dim)

                    Text("Dev Sign-in")
                        .font(.system(size: 26, weight: .black, design: .rounded))
                        .foregroundStyle(K.text)

                    Text("DEBUG builds only. Real users pair with a code.")
                        .font(.system(size: 13, weight: .medium, design: .rounded))
                        .foregroundStyle(K.dim)
                        .multilineTextAlignment(.center)
                }

                VStack(spacing: 12) {
                    field(label: "Email", text: $email, keyboard: .emailAddress, secure: false, fieldId: .email)
                    field(label: "Password", text: $password, keyboard: .default, secure: true, fieldId: .password)

                    if let err = auth.authError {
                        Text(err)
                            .font(.system(size: 13, weight: .semibold, design: .rounded))
                            .foregroundStyle(K.coralDark)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 4)
                    }
                }

                Button { signInNow() } label: {
                    HStack(spacing: 8) {
                        if auth.isBusy { ProgressView().tint(.white) }
                        Text(auth.isBusy ? "Signing in…" : "Sign in")
                            .font(.system(size: 16, weight: .bold, design: .rounded))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(K.dim)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(auth.isBusy || !canSubmit)
                .opacity(canSubmit ? 1.0 : 0.6)

                Spacer()
            }
            .padding(.horizontal, 28)
        }
        .onAppear { focused = .email }
    }

    private var canSubmit: Bool { email.contains("@") && password.count >= 6 }

    private func signInNow() {
        focused = nil
        Task { await auth.devSignIn(email: email.trimmingCharacters(in: .whitespaces), password: password) }
    }

    @ViewBuilder
    private func field(label: String, text: Binding<String>, keyboard: UIKeyboardType, secure: Bool, fieldId: Field) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 12, weight: .heavy, design: .rounded))
                .kerning(1)
                .textCase(.uppercase)
                .foregroundStyle(K.dim)

            Group {
                if secure {
                    SecureField("", text: text)
                } else {
                    TextField("", text: text)
                        .keyboardType(keyboard)
                        .textContentType(fieldId == .email ? .emailAddress : nil)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                }
            }
            .font(.system(size: 16, weight: .semibold, design: .rounded))
            .foregroundStyle(K.text)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(K.card)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(focused == fieldId ? K.teal : K.border,
                                  lineWidth: focused == fieldId ? 2 : 1)
            )
            .focused($focused, equals: fieldId)
        }
    }
}

#Preview {
    SignInView().environmentObject(KidsAuth())
}
