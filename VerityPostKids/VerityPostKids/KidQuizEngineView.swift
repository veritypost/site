import SwiftUI
import Supabase

// Real quiz engine for VerityPostKids. Fetches all active quiz_questions
// for the article, steps through them one at a time, writes quiz_attempts
// row per answer (bound to kid_profile_id via RLS), shows per-question
// feedback, and ends with the V3 QuizPassScene or a "Try again" state.

// K10: outcome payload handed back to KidReaderView → ArticleListView →
// KidsAppRoot so the scene chain (StreakScene → BadgeUnlockScene) can
// present based on real quiz state. `nil` in `onDone` means the kid
// bailed (X button); a non-nil value means they completed the result view.
//
// K4: writeFailures counts quiz_attempts rows that failed to land after a
// single retry. Scene code reads this and suppresses streak-bump animations
// when the underlying persistence didn't actually happen (otherwise the kid
// sees "Day 8!" and the DB never ticked).
struct KidQuizResult {
    let passed: Bool
    let correctCount: Int
    let total: Int
    let writeFailures: Int
}

// C14 — server-authoritative verdict from public.get_kid_quiz_verdict.
// Kept as a flat struct separate from the decoded payload so the RPC's
// snake_case keys don't leak into the rest of the app.
private struct KidQuizServerVerdict {
    let isPassed: Bool
    let correct: Int
    let total: Int
    let thresholdPct: Int
}

struct KidQuizEngineView: View {
    let article: KidArticle
    let categoryColor: Color
    // K4: forwarded from the reader so writeFailures reflects BOTH the
    // reading_log double-fail and any quiz_attempts double-fails. Scenes
    // can check `result.writeFailures > 0` once.
    var readingLogFailed: Bool = false
    var onDone: (KidQuizResult?) -> Void

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
    // K4: per-quiz-session counter of writeAttempt calls that failed both
    // primary + retry. Surfaced via KidQuizResult so celebration scenes can
    // avoid celebrating a streak bump that didn't persist.
    @State private var writeFailures: Int = 0
    // C14 — handles for in-flight per-question writes. We await all of
    // them before fetching the server verdict so the RPC doesn't count
    // a quiz with pending writes still unlanded.
    @State private var pendingWrites: [Task<Void, Never>] = []
    // C14 — server-computed verdict from get_kid_quiz_verdict RPC.
    // Replaces local `correctCount >= ceil(total * 0.6)`. `nil` while
    // the verdict is being fetched or if the fetch failed; local
    // computation is used as a safety fallback only.
    @State private var serverVerdict: KidQuizServerVerdict? = nil
    @State private var verdictPending: Bool = false
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

            Button { onDone(nil) } label: {
                Image(systemName: "xmark")
                    .font(.scaledSystem(size: 16, weight: .heavy))
                    .foregroundStyle(K.text)
                    // Bumped from 36 -> 44 to meet HIG/WCAG 44pt min touch
                    // target. Kid hands miss small targets more often than
                    // adult hands; the 8pt difference is the entire reason
                    // the audit flagged this.
                    .frame(width: 44, height: 44)
                    .background(.thinMaterial)
                    .clipShape(Circle())
                    .shadow(color: .black.opacity(0.15), radius: 8, y: 2)
                    .accessibilityLabel("Close quiz")
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
            // Pool-size guard: adult web hides the quiz block entirely
            // when fewer than 10 questions exist. Kids gets a lower floor
            // (5) since there's no free/paid attempt-pool variation, but
            // we still refuse to grade a 2-question quiz as a real pass.
            guard rows.count >= 5 else {
                self.questions = []
                self.startedAt = nil
                return
            }
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
            Button { onDone(nil) } label: {
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
        // C14 — retain the task handle so we can await pending writes
        // before asking the server for a verdict.
        let t = Task { await writeAttempt(q: q, chosen: chosen) }
        pendingWrites.append(t)
    }

    private func next() {
        revealed = false
        selectedOption = nil
        if index + 1 < questions.count {
            index += 1
        } else {
            withAnimation { showResult = true }
            // C14 — fetch the server-authoritative verdict once results
            // view is on screen. Fire-and-forget; loading state is
            // driven off verdictPending.
            Task { await fetchServerVerdict() }
        }
    }

    private func fetchServerVerdict() async {
        guard let kidId = auth.kid?.id else { return }
        // Let every pending write settle so the RPC counts every
        // attempt the kid just made.
        for t in pendingWrites {
            _ = await t.value
        }
        await MainActor.run { pendingWrites.removeAll() }
        await MainActor.run { verdictPending = true }
        do {
            struct VerdictPayload: Decodable {
                let is_passed: Bool
                let correct: Int
                let total: Int
                let threshold_pct: Int
            }
            struct Params: Encodable {
                let p_kid_profile_id: String
                let p_article_id: String
            }
            let verdict: VerdictPayload = try await client
                .rpc("get_kid_quiz_verdict", params: Params(
                    p_kid_profile_id: kidId,
                    p_article_id: article.id
                ))
                .execute()
                .value
            await MainActor.run {
                self.serverVerdict = KidQuizServerVerdict(
                    isPassed: verdict.is_passed,
                    correct: verdict.correct,
                    total: verdict.total,
                    thresholdPct: verdict.threshold_pct
                )
                self.verdictPending = false
            }
        } catch {
            print("[KidQuizEngineView] get_kid_quiz_verdict failed:", error)
            // Fall through to local computation if the RPC fails —
            // don't block the kid on a transient network issue, but
            // bump writeFailures so scenes soften celebration copy.
            await MainActor.run {
                self.writeFailures += 1
                self.verdictPending = false
            }
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
        // K4 — bump writeFailures on second fail so KidQuizResult reflects
        // unpersisted state. Celebration scenes read it to soften claims
        // ("Keep reading to lock this in" vs "Day 8!") when the write stack
        // is degraded. Parent-visible telemetry path: follow-up when
        // /api/kids/errors lands.
        do {
            try await client.from("quiz_attempts").insert(attempt).execute()
            return
        } catch {
            print("[KidQuizEngineView] quiz_attempts insert failed:", error)
        }
        try? await Task.sleep(nanoseconds: 1_000_000_000)
        do {
            try await client.from("quiz_attempts").insert(attempt).execute()
        } catch {
            print("[KidQuizEngineView] quiz_attempts insert failed on retry:", error)
            writeFailures += 1
        }
    }

    // MARK: Result

    private var currentResult: KidQuizResult {
        // C14 — prefer server verdict when we have it. Falls back to
        // local computation only if the RPC hasn't returned (e.g.
        // offline) so the kid never sees an indefinite spinner.
        let total = questions.count
        let passed: Bool
        let shownCorrect: Int
        if let v = serverVerdict {
            passed = v.isPassed
            shownCorrect = v.correct
        } else {
            // Fallback matches the pre-C14 local computation (60%
            // threshold, ceiling). Only used if the server verdict
            // failed to load.
            passed = correctCount >= max(1, Int(ceil(Double(total) * 0.6)))
            shownCorrect = correctCount
        }
        // Reader-side reading_log double-fail counts as one extra write failure.
        let totalFailures = writeFailures + (readingLogFailed ? 1 : 0)
        return KidQuizResult(
            passed: passed,
            correctCount: shownCorrect,
            total: total,
            writeFailures: totalFailures
        )
    }

    private var resultView: some View {
        let r = currentResult
        return VStack(spacing: 20) {
            Spacer()
            ZStack {
                Circle()
                    .fill(r.passed ? K.teal.opacity(0.15) : K.coral.opacity(0.15))
                    .frame(width: 120, height: 120)
                Image(systemName: r.passed ? "checkmark.seal.fill" : "arrow.counterclockwise.circle.fill")
                    .font(.scaledSystem(size: 60, weight: .bold))
                    .foregroundStyle(r.passed ? K.teal : K.coral)
            }

            Text(r.passed ? "Great job!" : "Give it another go?")
                .font(.scaledSystem(size: 28, weight: .black, design: .rounded))
                .foregroundStyle(K.text)

            Text("You got \(r.correctCount) of \(r.total) right.")
                .font(.scaledSystem(size: 15, weight: .semibold, design: .rounded))
                .foregroundStyle(K.dim)

            Spacer()

            Button { onDone(r) } label: {
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
            Button { onDone(nil) } label: {
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
