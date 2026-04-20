import SwiftUI

// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18

/// Three-screen onboarding shown right after signup/verification, before
/// the tab bar is first presented. Stamps `onboarding_completed_at` on
/// finish so it never reappears. Users can also skip — the stamp still
/// fires so the flow doesn't keep interrupting them.
struct WelcomeView: View {
    @EnvironmentObject var auth: AuthViewModel
    var onFinish: () -> Void

    @State private var page = 0
    @State private var submitting = false

    private let totalPages = 3

    var body: some View {
        VStack(spacing: 0) {
            // Skip / progress header
            HStack {
                ForEach(0..<totalPages, id: \.self) { idx in
                    Capsule()
                        .fill(idx <= page ? VP.text : VP.border)
                        .frame(height: 3)
                }
                .frame(maxWidth: .infinity)
            }
            .frame(height: 3)
            .padding(.horizontal, 20)
            .padding(.top, 20)

            HStack {
                Spacer()
                Button("Skip") { complete() }
                    .font(.footnote)
                    .foregroundColor(VP.dim)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)

            TabView(selection: $page) {
                screen(
                    title: "Discussions are earned",
                    body: "Every article has a short comprehension quiz. Score 3 out of 5 and the discussion unlocks. No quiz pass, no comments — which is how we keep trolls out and the conversation grounded in what was actually written."
                )
                .tag(0)

                screen(
                    title: "Your Verity Score is a knowledge map",
                    body: "Quizzes and reading grow your score across categories. It\u{2019}s a personal picture of what you know, not a rank. Paid readers can see each other\u{2019}s category breakdowns so discussion context is richer."
                )
                .tag(1)

                screen(
                    title: "Streaks reward showing up",
                    body: "Read something every day and your streak climbs. Milestones at 7, 30, 90, and 365 days earn bonus points. Miss a day without a freeze and you start over — so make the habit stick."
                )
                .tag(2)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(.easeInOut, value: page)

            HStack {
                if page > 0 {
                    Button("Back") { withAnimation { page -= 1 } }
                        .font(.system(.subheadline, design: .default, weight: .semibold))
                        .foregroundColor(VP.dim)
                } else {
                    Color.clear.frame(width: 60)
                }

                Spacer()

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
                            Text(page == totalPages - 1 ? "Start reading" : "Next")
                                .font(.system(.subheadline, design: .default, weight: .semibold))
                        }
                    }
                    .frame(minWidth: 120)
                    .frame(height: 44)
                    .background(VP.text)
                    .foregroundColor(.white)
                    .cornerRadius(10)
                }
                .disabled(submitting)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 30)
        }
        .background(VP.bg.ignoresSafeArea())
    }

    private func screen(title: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Spacer()
            Text(title)
                .font(.system(.largeTitle, design: .default, weight: .bold))
                .foregroundColor(VP.text)
                .multilineTextAlignment(.leading)
            Text(body)
                .font(.callout)
                .foregroundColor(VP.soft)
                .lineSpacing(3)
                .multilineTextAlignment(.leading)
            Spacer()
        }
        .padding(.horizontal, 28)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func complete() {
        guard !submitting else { return }
        submitting = true
        Task {
            // Stamp onboarding_completed_at via the existing API route so the
            // server can reason about first-timer conversion funnels. Direct
            // DB write as a fallback if the API call fails.
            await stampOnboarding()
            await MainActor.run {
                submitting = false
                onFinish()
            }
        }
    }

    private func stampOnboarding() async {
        guard let userId = auth.currentUser?.id else { return }
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
            _ = try await URLSession.shared.data(for: req)
            await auth.loadUser(id: userId)
        } catch {
            Log.d("onboarding stamp failed: \(error)")
        }
    }
}
