import SwiftUI

// Live root. Pair-only entry.
//   - Not paired → PairCodeView
//   - Paired     → tab-bar app (Home | Ranks | Experts | Me) + scene full-screens
//
// Scene flow (from home):
//   - Tap streak card  → StreakScene
//   - Tap a category   → QuizPassScene → completeQuiz → StreakScene → BadgeUnlockScene

struct KidsAppRoot: View {
    @StateObject private var auth = KidsAuth()
    @StateObject private var state = KidsAppState()

    @State private var selectedTab: KidTab = .home
    @State private var activeSheet: ActiveSheet? = nil
    @State private var queuedBadge: BadgeUnlockScene? = nil
    @State private var sceneKey = UUID()

    private enum ActiveSheet: Identifiable {
        case streak(previous: Int, current: Int, milestone: StreakScene.Milestone?)
        case articles(categoryName: String, categoryColor: Color)
        case badge(BadgeUnlockScene)

        var id: String {
            switch self {
            case .streak:   return "streak"
            case .articles: return "articles"
            case .badge:    return "badge"
            }
        }
    }

    var body: some View {
        Group {
            if auth.kid != nil {
                tabbedApp
                    .environmentObject(auth)
                    .environmentObject(state)
            } else {
                PairCodeView()
                    .environmentObject(auth)
            }
        }
        .task(id: auth.kid?.id) {
            guard let kid = auth.kid else { return }
            await state.load(forKidId: kid.id, kidName: kid.name)
        }
    }

    // MARK: Tab-bar app

    private var tabbedApp: some View {
        ZStack(alignment: .bottom) {
            tabContent
                .padding(.bottom, 80)   // space for tab bar

            KidTabBar(selected: $selectedTab)
        }
        .ignoresSafeArea(.container, edges: .bottom)
        .fullScreenCover(item: $activeSheet, onDismiss: handleDismiss) { sheet in
            ZStack(alignment: .topLeading) {
                sceneBody(sheet)
                closeChrome
            }
            .id(sceneKey)
        }
    }

    @ViewBuilder
    private var tabContent: some View {
        switch selectedTab {
        case .home:
            homeScreen
        case .leaderboard:
            LeaderboardView()
        case .expert:
            ExpertSessionsView()
        case .profile:
            ProfileView()
        }
    }

    // MARK: Home

    private var homeScreen: some View {
        GreetingScene(
            name: state.kidName.isEmpty ? (auth.kid?.name ?? "Reader") : state.kidName,
            streakDays: state.streakDays,
            streakSubtext: state.streakSubtext,
            categories: state.categories,
            onStreakTap: {
                presentStreak(previous: state.streakDays, current: state.streakDays)
            },
            onCategoryTap: { cat in
                present(.articles(categoryName: cat.name, categoryColor: cat.color))
            }
        )
    }

    @ViewBuilder
    private func sceneBody(_ sheet: ActiveSheet) -> some View {
        switch sheet {
        case .streak(let prev, let cur, let milestone):
            StreakScene(
                previous: prev,
                current: cur,
                milestone: milestone,
                onDone: { activeSheet = nil }
            )
        case .articles(let name, let color):
            ArticleListView(
                categoryName: name,
                categoryColor: color,
                categorySlug: nil,
                onClose: { activeSheet = nil }
            )
            .environmentObject(auth)
            .environmentObject(state)
        case .badge(let badge):
            badge
        }
    }

    // MARK: Flow

    private func presentStreak(previous: Int, current: Int) {
        sceneKey = UUID()
        activeSheet = .streak(
            previous: previous,
            current: current,
            milestone: state.milestoneForCurrentStreak
        )
    }

    private func present(_ sheet: ActiveSheet) {
        sceneKey = UUID()
        activeSheet = sheet
    }

    private func completeQuiz() {
        // Only used by scene dismiss — the real quiz engine writes attempts
        // directly via KidQuizEngineView + advance_streak RPC.
        let outcome = state.completeQuiz(score: 12, biasedSpotted: true)
        queuedBadge = outcome.badge
        let prev = outcome.previousStreak
        let cur = outcome.newStreak
        activeSheet = nil
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            presentStreak(previous: prev, current: cur)
        }
    }

    private func handleDismiss() {
        if let badge = queuedBadge {
            queuedBadge = nil
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                sceneKey = UUID()
                activeSheet = .badge(badge)
            }
        }
    }

    private var closeChrome: some View {
        Button { activeSheet = nil } label: {
            Image(systemName: "xmark")
                .font(.system(.subheadline, weight: .heavy))
                .foregroundStyle(K.text)
                .frame(width: 44, height: 44)
                .background(.thinMaterial)
                .clipShape(Circle())
                .shadow(color: .black.opacity(0.15), radius: 8, y: 2)
        }
        .buttonStyle(.plain)
        .padding(.leading, 20)
        .padding(.top, 60)
        .accessibilityLabel("Close")
    }
}

extension BadgeUnlockScene: Identifiable {
    public var id: String { tierLabel + headline }
}

#Preview {
    KidsAppRoot()
}
