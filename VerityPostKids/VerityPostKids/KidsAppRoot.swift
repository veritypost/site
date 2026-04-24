import SwiftUI

// Live root. Pair-only entry.
//   - Not paired → PairCodeView
//   - Paired     → tab-bar app (Home | Ranks | Experts | Me) + scene full-screens
//
// Scene flow:
//   - Tap streak card   → StreakScene
//   - Tap a category    → ArticleListView → KidReaderView → KidQuizEngineView
//                         → on pass: StreakScene → (optional) BadgeUnlockScene
//                         → on fail: no scenes (streak not bumped)
//                         → on cancel (X): reader stays open, no scenes

struct KidsAppRoot: View {
    @StateObject private var auth = KidsAuth()
    @StateObject private var state = KidsAppState()

    @State private var selectedTab: KidTab = .home
    @State private var activeSheet: ActiveSheet? = nil
    // K10: when a quiz completes, StreakScene + BadgeUnlockScene enqueue here
    // and are popped one at a time by handleDismiss. The queue replaces the
    // old single-badge slot so passing milestone streaks + badges in the same
    // session present in sequence instead of colliding.
    @State private var sceneQueue: [ActiveSheet] = []
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
                onClose: { activeSheet = nil },
                onQuizComplete: { result in
                    handleQuizComplete(result)
                }
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

    // K1 + K10: real quiz completion from KidQuizEngineView bubbles here via
    // ArticleListView → onQuizComplete. completeQuiz(passed:) no-ops streak on
    // failure. On pass, enqueue StreakScene + optional BadgeUnlockScene; they
    // present one at a time via handleDismiss after the article sheet unwinds.
    // Score per pass mirrors the server's approximate points rule (10 × correct
    // answers) — the authoritative total lives in quiz_attempts; this local
    // delta only drives the in-memory score animation.
    private func handleQuizComplete(_ result: KidQuizResult) {
        let scoreDelta = result.correctCount * 10
        let outcome = state.completeQuiz(
            passed: result.passed,
            score: scoreDelta,
            biasedSpotted: false
        )

        var queue: [ActiveSheet] = []
        if outcome.newStreak != outcome.previousStreak {
            queue.append(.streak(
                previous: outcome.previousStreak,
                current: outcome.newStreak,
                milestone: outcome.milestone
            ))
        }
        if let badge = outcome.badge {
            queue.append(.badge(badge))
        }
        sceneQueue = queue

        activeSheet = nil
    }

    private func handleDismiss() {
        guard !sceneQueue.isEmpty else { return }
        let next = sceneQueue.removeFirst()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            sceneKey = UUID()
            activeSheet = next
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
