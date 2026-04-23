import SwiftUI
import Supabase

// Real quiz engine for VerityPostKids. Fetches all active quiz_questions
// for the article, steps through them one at a time, writes quiz_attempts
// row per answer (bound to kid_profile_id via RLS), shows per-question
// feedback, and ends with the V3 QuizPassScene or a "Try again" state.

struct KidQuizEngineView: View {
    let article: KidArticle
    let categoryColor: Color
    var onDone: () -> Void

    @EnvironmentObject private var auth: KidsAuth
    @EnvironmentObject private var state: KidsAppState

    @State private var questions: [QuizQuestion] = []
    @State private var index: Int = 0
    @State private var selectedOption: QuizOption? = nil
    @State private var revealed: Bool = false
    @State private var correctCount: Int = 0
    @State private var loading: Bool = true
    @State private var loadError: String? = nil
    @State private var startedAt: Date = Date()
    @State private var showResult: Bool = false
    // Apple Kids Category review — the quiz must refuse to load if the
    // article isn't kids-safe, even though navigation through the rest of
    // the kids app should never produce a non-safe article. Defense in
    // depth in case the article state was stale on this device.
    @State private var blockedNotKidsSafe: Bool = false

    private var client: SupabaseClient { SupabaseKidsClient.shared.client }

    var body: some View {
        ZStack {
            K.bg.ignoresSafeArea()

            if loading {
                ProgressView()
            } else if blockedNotKidsSafe {
                notKidsSafeState
            } else if questions.isEmpty {
                emptyState
            } else if showResult {
                resultView
            } else {
                questionView
            }

            Button { onDone() } label: {
                Image(systemName: "xmark")
                    .font(.scaledSystem(size: 14, weight: .heavy))
                    .foregroundStyle(K.text)
                    .frame(width: 36, height: 36)
                    .background(.thinMaterial)
                    .clipShape(Circle())
                    .shadow(color: .black.opacity(0.15), radius: 8, y: 2)
            }
            .buttonStyle(.plain)
            .padding(.leading, 20)
            .padding(.top, 60)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .task { await loadQuestions() }
    }

    // MARK: Load

    private func loadQuestions() async {
        loading = true
        defer { loading = false }

        // Defense-in-depth: pre-flight verify the article is kids-safe.
        // The kids app's article lists already filter on is_kids_safe, but
        // a stale deep-link or downstream feed change could leak a non-safe
        // article in. RLS on `articles` for the kids JWT also enforces
        // this, but a dedicated pre-check gives us an actionable empty
        // state instead of a generic "couldn't load quiz" line.
        struct ArticleSafety: Decodable { let is_kids_safe: Bool? }
        do {
            let safetyRows: [ArticleSafety] = try await client
                .from("articles")
                .select("is_kids_safe")
                .eq("id", value: article.id)
                .limit(1)
                .execute()
                .value
            if safetyRows.first?.is_kids_safe != true {
                blockedNotKidsSafe = true
                questions = []
                return
            }
        } catch {
            // If we can't verify, fail closed — refuse to load the quiz.
            blockedNotKidsSafe = true
            questions = []
            return
        }

        do {
            let rows: [QuizQuestion] = try await client
                .from("quizzes")
                .select("id, article_id, question_text, question_type, options, explanation, difficulty, points, pool_group, sort_order")
                .eq("article_id", value: article.id)
                .eq("is_active", value: true)
                .is("deleted_at", value: nil)
                .order("sort_order", ascending: true)
                .limit(10)
                .execute()
                .value
            self.questions = rows
            self.startedAt = Date()
        } catch {
            self.loadError = "Couldn't load quiz"
            self.questions = []
        }
    }

    private var notKidsSafeState: some View {
        VStack(spacing: 14) {
            Image(systemName: "exclamationmark.triangle")
                .font(.scaledSystem(size: 36, weight: .bold))
                .foregroundStyle(K.dim)
            Text("This story isn't available right now.")
                .font(.scaledSystem(size: 15, weight: .semibold, design: .rounded))
                .foregroundStyle(K.dim)
                .multilineTextAlignment(.center)
            Button { onDone() } label: {
                Text("Back")
                    .font(.scaledSystem(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 22)
                    .padding(.vertical, 12)
                    .background(K.teal)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .padding(.top, 8)
        }
        .padding(40)
    }

    // MARK: Question view

    private var questionView: some View {
        let q = questions[index]
        return VStack(alignment: .leading, spacing: 18) {
            Spacer().frame(height: 40)

            // progress dots
            HStack(spacing: 6) {
                ForEach(0..<questions.count, id: \.self) { i in
                    Circle()
                        .fill(i == index ? K.teal : (i < index ? K.teal.opacity(0.4) : K.border))
                        .frame(width: i == index ? 10 : 6, height: i == index ? 10 : 6)
                }
                Spacer()
            }

            Text("Question \(index + 1) of \(questions.count)")
                .font(.scaledSystem(size: 12, weight: .heavy, design: .rounded))
                .kerning(1)
                .textCase(.uppercase)
                .foregroundStyle(K.dim)

            Text(q.questionText)
                .font(.scaledSystem(size: 22, weight: .black, design: .rounded))
                .foregroundStyle(K.text)
                .lineSpacing(4)

            VStack(spacing: 10) {
                ForEach(q.options) { opt in
                    optionButton(q: q, opt: opt)
                }
            }

            if revealed, let explanation = q.explanation, !explanation.isEmpty {
                Text(explanation)
                    .font(.scaledSystem(size: 13, weight: .medium, design: .rounded))
                    .foregroundStyle(K.dim)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(K.card)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }

            Spacer()

            if revealed {
                Button { next() } label: {
                    Text(index + 1 < questions.count ? "Next question" : "See result")
                        .font(.scaledSystem(size: 16, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 54)
                        .background(K.teal)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .shadow(color: K.teal.opacity(0.3), radius: 12, y: 4)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 30)
    }

    private func optionButton(q: QuizQuestion, opt: QuizOption) -> some View {
        let isSelected = selectedOption?.id == opt.id
        let bg: Color = {
            if !revealed { return isSelected ? K.teal.opacity(0.15) : K.card }
            if opt.isCorrect { return K.teal.opacity(0.2) }
            if isSelected { return K.coralDark.opacity(0.15) }
            return K.card
        }()
        let border: Color = {
            if !revealed { return isSelected ? K.teal : K.border }
            if opt.isCorrect { return K.teal }
            if isSelected { return K.coralDark }
            return K.border
        }()

        return Button {
            guard !revealed else { return }
            selectedOption = opt
            revealAnswer(q: q, chosen: opt)
        } label: {
            HStack {
                Text(opt.text)
                    .font(.scaledSystem(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(K.text)
                    .multilineTextAlignment(.leading)
                Spacer()
                if revealed {
                    if opt.isCorrect {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(K.teal)
                    } else if isSelected {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(K.coralDark)
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(bg)
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(border, lineWidth: 2)
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(revealed)
    }

    // MARK: Action

    private func revealAnswer(q: QuizQuestion, chosen: QuizOption) {
        withAnimation(K.springSnap) { revealed = true }
        if chosen.isCorrect { correctCount += 1 }
        Task { await writeAttempt(q: q, chosen: chosen) }
    }

    private func next() {
        revealed = false
        selectedOption = nil
        if index + 1 < questions.count {
            index += 1
        } else {
            withAnimation { showResult = true }
        }
    }

    private func writeAttempt(q: QuizQuestion, chosen: QuizOption) async {
        guard let kidId = auth.kid?.id else { return }
        let attempt = QuizAttemptInsert(
            quiz_id: q.id,
            user_id: nil,
            kid_profile_id: kidId,
            article_id: article.id,
            attempt_number: 1,
            questions_served: questions.map(\.id),
            selected_answer: chosen.text,
            is_correct: chosen.isCorrect,
            points_earned: chosen.isCorrect ? (q.points ?? 0) : 0,
            time_taken_seconds: Int(Date().timeIntervalSince(startedAt))
        )
        // T-018 — single retry then log. Prior code swallowed silently,
        // causing leaderboard + streak drift on transient network blips.
        // Parent-visible telemetry path: follow-up when /api/kids/errors lands.
        do {
            try await client.from("quiz_attempts").insert(attempt).execute()
        } catch {
            print("[KidQuizEngineView] quiz_attempts insert failed:", error)
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            do {
                try await client.from("quiz_attempts").insert(attempt).execute()
            } catch {
                print("[KidQuizEngineView] quiz_attempts insert failed on retry:", error)
            }
        }
    }

    // MARK: Result

    private var resultView: some View {
        let total = questions.count
        let passed = correctCount >= max(1, Int(ceil(Double(total) * 0.6)))
        return VStack(spacing: 20) {
            Spacer()
            ZStack {
                Circle()
                    .fill(passed ? K.teal.opacity(0.15) : K.coral.opacity(0.15))
                    .frame(width: 120, height: 120)
                Image(systemName: passed ? "checkmark.seal.fill" : "arrow.counterclockwise.circle.fill")
                    .font(.scaledSystem(size: 60, weight: .bold))
                    .foregroundStyle(passed ? K.teal : K.coral)
            }

            Text(passed ? "Great job!" : "Give it another go?")
                .font(.scaledSystem(size: 28, weight: .black, design: .rounded))
                .foregroundStyle(K.text)

            Text("You got \(correctCount) of \(total) right.")
                .font(.scaledSystem(size: 15, weight: .semibold, design: .rounded))
                .foregroundStyle(K.dim)

            Spacer()

            Button { onDone() } label: {
                Text("Done")
                    .font(.scaledSystem(size: 16, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 54)
                    .background(K.teal)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .shadow(color: K.teal.opacity(0.3), radius: 12, y: 4)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 40)
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Image(systemName: "questionmark.folder")
                .font(.scaledSystem(size: 36, weight: .bold))
                .foregroundStyle(K.dim)
            Text("No quiz yet for this article.")
                .font(.scaledSystem(size: 15, weight: .semibold, design: .rounded))
                .foregroundStyle(K.dim)
                .multilineTextAlignment(.center)
            Button { onDone() } label: {
                Text("Back")
                    .font(.scaledSystem(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 22)
                    .padding(.vertical, 12)
                    .background(K.teal)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .padding(.top, 8)
        }
        .padding(40)
    }
}
