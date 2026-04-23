import SwiftUI

// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18

/// Three-screen onboarding shown right after signup/verification, before
/// the tab bar is first presented. Stamps `onboarding_completed_at` on
/// finish so it never reappears. Skip also stamps — the flow refuses to
/// interrupt the user a second time.
///
/// Transition: the view is state-driven from `ContentView` via
/// `auth.currentUser?.needsOnboarding`. On successful stamp + reload we
/// flip `needsOnboarding` to false and `ContentView` swaps to
/// `MainTabView` automatically — no explicit callback needed.
struct WelcomeView: View {
    @EnvironmentObject var auth: AuthViewModel

    @State private var page = 0
    @State private var submitting = false
    @State private var stampError = false

    private let totalPages = 3

    var body: some View {
        VStack(spacing: 0) {
            // Header — wordmark + Skip
            HStack(alignment: .firstTextBaseline) {
                Text("Verity Post")
                    .font(.system(size: 22, weight: .bold, design: .serif))
                    .tracking(-0.4)
                    .foregroundColor(VP.text)

                Spacer()

                Button("Skip") { complete() }
                    .font(.system(.footnote, design: .default, weight: .semibold))
                    .foregroundColor(VP.dim)
                    .frame(minHeight: 44)
                    .accessibilityLabel("Skip onboarding")
            }
            .padding(.horizontal, 24)
            .padding(.top, 24)

            // Card
            VStack(alignment: .leading, spacing: 0) {
                TabView(selection: $page) {
                    screenOne.tag(0)
                    screenTwo.tag(1)
                    screenThree.tag(2)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.easeInOut, value: page)
                .frame(minHeight: 360)

                // Pagination dots
                HStack(spacing: 8) {
                    ForEach(0..<totalPages, id: \.self) { i in
                        Capsule()
                            .fill(i == page ? VP.accent : VP.border)
                            .frame(width: i == page ? 24 : 8, height: 8)
                            .animation(.easeInOut(duration: 0.2), value: page)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 8)

                if stampError {
                    Text("Couldn\u{2019}t finish onboarding. Please try again.")
                        .font(.footnote)
                        .foregroundColor(VP.danger)
                        .padding(.top, 10)
                        .frame(maxWidth: .infinity, alignment: .center)
                }
            }
            .padding(.vertical, 20)
            .padding(.horizontal, 8)
            .background(VP.card)
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .strokeBorder(VP.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .padding(.horizontal, 20)
            .padding(.top, 24)

            Spacer(minLength: 0)

            // Bottom action row
            HStack(spacing: 10) {
                if page > 0 {
                    Button("Back") { withAnimation { page -= 1 } }
                        .font(.system(.subheadline, design: .default, weight: .semibold))
                        .foregroundColor(VP.text)
                        .padding(.horizontal, 18)
                        .frame(minHeight: 48)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .strokeBorder(VP.border, lineWidth: 1)
                        )
                }

                Button {
                    if page < totalPages - 1 {
                        withAnimation { page += 1 }
                    } else {
                        complete()
                    }
                } label: {
                    Group {
                        if submitting {
                            ProgressView().tint(.white)
                        } else {
                            Text(page == totalPages - 1 ? "Get started" : "Next")
                                .font(.system(.subheadline, design: .default, weight: .bold))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(VP.accent)
                    .foregroundColor(.white)
                    .cornerRadius(10)
                }
                .disabled(submitting)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 28)
            .padding(.top, 20)
        }
        .background(VP.bg.ignoresSafeArea())
    }

    // MARK: - Screens

    private var screenOne: some View {
        VStack(alignment: .leading, spacing: 12) {
            eyebrow("Welcome")
            Text("Welcome to Verity Post.")
                .font(.system(size: 30, weight: .bold, design: .serif))
                .tracking(-0.6)
                .foregroundColor(VP.text)
                .fixedSize(horizontal: false, vertical: true)
            Text("Where every commenter passed the quiz.")
                .font(.system(.title3, design: .default, weight: .regular))
                .foregroundColor(VP.text)
                .lineSpacing(3)
                .padding(.top, 2)
            Text("News that respects your attention, and a discussion floor earned by reading the article — not shouting about it.")
                .font(.callout)
                .foregroundColor(VP.dim)
                .lineSpacing(3)
                .padding(.top, 6)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var screenTwo: some View {
        VStack(alignment: .leading, spacing: 14) {
            eyebrow("How it works")
            Text("Read. Quiz. Discuss.")
                .font(.system(size: 28, weight: .bold, design: .serif))
                .tracking(-0.6)
                .foregroundColor(VP.text)

            // Unlock chain visual
            HStack(spacing: 8) {
                step("Read", bg: VP.readBg, color: VP.readColor, border: VP.readBorder)
                Text("→").font(.subheadline).foregroundColor(VP.dim)
                step("Quiz", bg: VP.quizBg, color: VP.quizColor, border: VP.quizBorder)
                Text("→").font(.subheadline).foregroundColor(VP.dim)
                step("Comment", bg: VP.commentBg, color: VP.commentColor, border: VP.commentBorder)
            }
            .padding(.top, 6)

            Text("Every article has a 5-question comprehension quiz. Score 3 out of 5 and the discussion unlocks.")
                .font(.callout)
                .foregroundColor(VP.text)
                .lineSpacing(3)
                .padding(.top, 4)
            Text("That\u{2019}s how we keep trolls out and the conversation grounded in what was actually written.")
                .font(.footnote)
                .foregroundColor(VP.dim)
                .lineSpacing(2)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var screenThree: some View {
        VStack(alignment: .leading, spacing: 14) {
            eyebrow("Ready?")
            Text("Your first read is waiting.")
                .font(.system(size: 28, weight: .bold, design: .serif))
                .tracking(-0.6)
                .foregroundColor(VP.text)
            Text("Head to the home feed — pick any article, read it, and the quiz is right below.")
                .font(.callout)
                .foregroundColor(VP.text)
                .lineSpacing(3)
                .padding(.top, 2)
            Text("Score 3/5 and you\u{2019}re talking.")
                .font(.footnote)
                .foregroundColor(VP.dim)
                .lineSpacing(2)
                .padding(.top, 2)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Primitives

    private func eyebrow(_ label: String) -> some View {
        Text(label.uppercased())
            .font(.system(.caption2, design: .default, weight: .bold))
            .tracking(2)
            .foregroundColor(VP.dim)
    }

    private func step(_ label: String, bg: Color, color: Color, border: Color) -> some View {
        Text(label)
            .font(.system(.caption, design: .default, weight: .bold))
            .tracking(0.3)
            .foregroundColor(color)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 10).fill(bg)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10).strokeBorder(border, lineWidth: 1)
            )
    }

    // MARK: - Completion

    private func complete() {
        guard !submitting else { return }
        submitting = true
        stampError = false
        Task {
            let ok = await stampOnboarding()
            await MainActor.run {
                submitting = false
                if !ok {
                    // If the stamp failed we surface an error rather than
                    // silently dropping the user on the tab bar with no
                    // server record — matches the web's finishError shape.
                    stampError = true
                }
                // On success the stamp also reloads the user profile, so
                // `auth.currentUser?.needsOnboarding` flips false and
                // ContentView re-renders to MainTabView. No manual
                // transition needed.
            }
        }
    }

    private func stampOnboarding() async -> Bool {
        guard let userId = auth.currentUser?.id else { return false }
        // Route through the server so its onboarding hooks (service client,
        // `onboarding_completed_at IS NULL` guard, analytics) fire. Same
        // bearer-token pattern as `/api/account/login-cancel-deletion`.
        let client = SupabaseManager.shared.client
        do {
            let session = try await client.auth.session
            let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/account/onboarding")
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let (_, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                Log.d("onboarding stamp non-2xx status")
                return false
            }
            await auth.loadUser(id: userId)
            return true
        } catch {
            Log.d("onboarding stamp failed: \(error)")
            return false
        }
    }
}
