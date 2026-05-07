import SwiftUI

// Cold-launch entry. Splits the unauthenticated flow into either the
// kid pair-code path or the parent signup/sign-in path. After a kid
// is paired or a parent session is stored, KidsAppRoot bypasses this
// screen via the auth-state branch.

struct RoleChoiceView: View {
    @EnvironmentObject private var auth: KidsAuth

    enum Role: Hashable { case kid, parent }

    var body: some View {
        NavigationStack {
            ZStack {
                K.bg.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 32) {
                        VStack(spacing: 12) {
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

                            Text("Who\u{2019}s setting up the app?")
                                .font(.system(.subheadline, design: .rounded, weight: .medium))
                                .foregroundStyle(K.dim)
                                .multilineTextAlignment(.center)
                        }
                        .padding(.top, 24)

                        VStack(spacing: 14) {
                            NavigationLink(value: Role.parent) {
                                roleCard(
                                    icon: "person.fill",
                                    title: "I\u{2019}m a parent",
                                    subtitle: "Set up the app or sign in",
                                    accent: K.tealDark
                                )
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("I'm a parent. Set up the app or sign in.")

                            NavigationLink(value: Role.kid) {
                                roleCard(
                                    icon: "key.fill",
                                    title: "I\u{2019}m a kid",
                                    subtitle: "I have a pair code",
                                    accent: K.purple
                                )
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("I'm a kid. I have a pair code.")
                        }
                    }
                    .padding(.horizontal, 28)
                    .padding(.vertical, 32)
                    .frame(maxWidth: 480)
                    .frame(maxWidth: .infinity)
                }
                .scrollBounceBehavior(.basedOnSize)
            }
            .navigationDestination(for: Role.self) { role in
                switch role {
                case .kid:
                    PairCodeView()
                        .environmentObject(auth)
                        .toolbar(.hidden, for: .navigationBar)
                case .parent:
                    ParentAuthView()
                        .environmentObject(auth)
                        .toolbar(.hidden, for: .navigationBar)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private func roleCard(icon: String, title: String, subtitle: String, accent: Color) -> some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(accent.opacity(0.15))
                    .frame(width: 52, height: 52)
                Image(systemName: icon)
                    .font(.system(.title2, weight: .bold))
                    .foregroundStyle(accent)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(.title3, design: .rounded, weight: .black))
                    .foregroundStyle(K.text)
                Text(subtitle)
                    .font(.system(.subheadline, design: .rounded, weight: .medium))
                    .foregroundStyle(K.dim)
            }

            Spacer(minLength: 0)

            Image(systemName: "chevron.right")
                .font(.system(.body, weight: .bold))
                .foregroundStyle(K.dim)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(K.border, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.06), radius: 10, y: 3)
    }
}

#Preview {
    RoleChoiceView()
        .environmentObject(KidsAuth())
}
