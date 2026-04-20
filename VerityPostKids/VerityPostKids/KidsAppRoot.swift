import SwiftUI

// Live root. Gated flow:
//   - Not paired AND no dev adult session   → PairCodeView (primary entry)
//   - Dev adult session AND kid unpicked    → KidPickerView (DEBUG only)
//   - kid set                                → home (Greeting + scene flow)

struct KidsAppRoot: View {
    @StateObject private var auth = KidsAuth()
    @StateObject private var state = KidsAppState()

    @State private var activeSheet: ActiveSheet? = nil
    @State private var queuedBadge: BadgeUnlockScene? = nil
    @State private var sceneKey = UUID()

    private enum ActiveSheet: Identifiable {
        case streak(previous: Int, current: Int, milestone: StreakScene.Milestone?)
        case quiz
        case badge(BadgeUnlockScene)

        var id: String {
            switch self {
            case .streak: return "streak"
            case .quiz:   return "quiz"
            case .badge:  return "badge"
            }
        }
    }

    var body: some View {
        Group {
            if auth.kid != nil {
                home
            } else if auth.adultSession != nil {
                KidPickerView()
                    .environmentObject(auth)
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

    // MARK: Home

    @ViewBuilder
    private var home: some View {
        GreetingScene(
            name: state.kidName.isEmpty ? (auth.kid?.name ?? "Reader") : state.kidName,
            streakDays: state.streakDays,
            streakSubtext: state.streakSubtext,
            categories: state.categories,
            onStreakTap: {
                presentStreak(previous: state.streakDays, current: state.streakDays)
            },
            onCategoryTap: { _ in
                present(.quiz)
            }
        )
        .overlay(alignment: .topTrailing) {
            Button {
                Task { await auth.signOut() }
            } label: {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(.thinMaterial)
                    .clipShape(Circle())
                    .shadow(color: .black.opacity(0.15), radius: 8, y: 2)
            }
            .buttonStyle(.plain)
            .padding(.trailing, 20)
            .padding(.top, 60)
        }
        .fullScreenCover(item: $activeSheet, onDismiss: handleDismiss) { sheet in
            ZStack(alignment: .topLeading) {
                sceneBody(sheet)
                closeChrome
            }
            .id(sceneKey)
        }
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
        case .quiz:
            QuizPassScene(
                question: "Which headline uses a loaded word?",
                answers: [
                    .init(text: "\"City announces new park plans\"",            correct: false),
                    .init(text: "\"Mayor slams opposition in heated debate\"",  correct: true),
                    .init(text: "\"School board reviews budget proposal\"",     correct: false),
                    .init(text: "\"Weather expected to change this week\"",     correct: false)
                ],
                questionNumber: 5,
                totalQuestions: 5,
                priorScore: state.verityScore,
                newScore: state.verityScore + 12,
                correctCount: 5,
                timeSeconds: 42,
                insight: "You spotted a loaded headline on the first try.",
                onShare: { },
                onDone: { completeQuiz() }
            )
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
                .font(.system(size: 14, weight: .heavy))
                .foregroundStyle(K.text)
                .frame(width: 36, height: 36)
                .background(.thinMaterial)
                .clipShape(Circle())
                .shadow(color: .black.opacity(0.15), radius: 8, y: 2)
        }
        .buttonStyle(.plain)
        .padding(.leading, 20)
        .padding(.top, 60)
    }
}

extension BadgeUnlockScene: Identifiable {
    public var id: String { tierLabel + headline }
}

#Preview {
    KidsAppRoot()
}
