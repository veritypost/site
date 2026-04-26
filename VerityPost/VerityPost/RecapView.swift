import SwiftUI
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified recap 2026-04-18

// RecapListView re-added T-115. Hub view fetches /api/recap and navigates to RecapQuizView.

// MARK: - Recap list (hub)

struct RecapListView: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    @State private var recaps: [RecapSummary] = []
    @State private var loading = true
    @State private var errorText: String?
    @State private var isPaid = true

    var body: some View {
        Group {
            if loading {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.top, 60)
            } else if let err = errorText {
                VStack(spacing: 8) {
                    Text("Couldn\u{2019}t load recaps")
                        .font(.system(.callout, design: .default, weight: .semibold))
                        .foregroundColor(VP.text)
                    Text(err)
                        .font(.footnote)
                        .foregroundColor(VP.dim)
                    Button("Try again") { Task { await load() } }
                        .font(.system(.footnote, design: .default, weight: .medium))
                        .foregroundColor(VP.accent)
                        .padding(.top, 4)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 60)
            } else if !isPaid {
                UpgradePromptInline(
                    feature: "Weekly Recaps",
                    detail: "Review what you read each week and catch up on missed stories. Available on paid plans."
                )
            } else if recaps.isEmpty {
                VStack(spacing: 8) {
                    Text("No recaps yet")
                        .font(.system(.callout, design: .default, weight: .semibold))
                        .foregroundColor(VP.text)
                    Text("Recaps appear at the end of each week.")
                        .font(.footnote)
                        .foregroundColor(VP.dim)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 60)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(recaps) { recap in
                            NavigationLink {
                                RecapQuizView(recapId: recap.id, title: recap.title)
                                    .environmentObject(auth)
                            } label: {
                                recapRow(recap)
                            }
                            .buttonStyle(.plain)
                            Divider()
                                .background(VP.border)
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
        }
        .navigationTitle("Weekly Recaps")
        .navigationBarTitleDisplayMode(.inline)
        .background(VP.bg)
        .task { await load() }
    }

    private func recapRow(_ recap: RecapSummary) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(recap.title)
                    .font(.system(.subheadline, design: .default, weight: .semibold))
                    .foregroundColor(VP.text)
                    .multilineTextAlignment(.leading)
                if let range = recap.dateRange {
                    Text(range)
                        .font(.system(.caption, design: .default, weight: .regular))
                        .foregroundColor(VP.dim)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            // Completion badge — shows score/total when attempt exists
            if let attempt = recap.myAttempt, let score = attempt.score, let total = attempt.totalQuestions {
                VStack(alignment: .trailing, spacing: 2) {
                    Text("\(score)/\(total)")
                        .font(.system(.subheadline, design: .default, weight: .bold))
                        .foregroundColor(VP.accent)
                    Text("Done")
                        .font(.system(.caption2, design: .default, weight: .medium))
                        .foregroundColor(VP.dim)
                }
            } else {
                Text("Start")
                    .font(.system(.caption, design: .default, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(VP.accent)
                    .cornerRadius(6)
            }
        }
        .padding(.vertical, 14)
    }

    // MARK: - Data

    private func load() async {
        loading = true
        errorText = nil
        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/recap", relativeTo: site) else {
            await MainActor.run {
                errorText = "Configuration error."
                loading = false
            }
            return
        }
        do {
            var req = URLRequest(url: url)
            if let session = try? await client.auth.session {
                req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            }
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
                await MainActor.run {
                    errorText = "Server error."
                    loading = false
                }
                return
            }
            struct ListResponse: Decodable {
                let recaps: [RecapSummary]
                let paid: Bool?
            }
            let decoded = try JSONDecoder().decode(ListResponse.self, from: data)
            await MainActor.run {
                recaps = decoded.recaps
                isPaid = decoded.paid ?? true
                loading = false
            }
        } catch {
            await MainActor.run {
                errorText = "Network issue."
                loading = false
            }
        }
    }
}

// MARK: - Recap summary model

struct RecapSummary: Codable, Identifiable {
    // Matches the weekly_recap_quizzes row shape returned by /api/recap.
    let id: String
    let title: String
    let description: String?
    let weekStart: String?
    let weekEnd: String?
    let myAttempt: MyAttempt?

    struct MyAttempt: Codable {
        let score: Int?
        let totalQuestions: Int?
        let completedAt: Date?

        enum CodingKeys: String, CodingKey {
            case score
            case totalQuestions = "total_questions"
            case completedAt = "completed_at"
        }
    }

    enum CodingKeys: String, CodingKey {
        case id, title, description
        case weekStart = "week_start"
        case weekEnd = "week_end"
        case myAttempt = "my_attempt"
    }

    // Derived for the row UI. week_start / week_end are `date` strings
    // (YYYY-MM-DD) from Postgres, not ISO 8601 datetimes.
    var dateRange: String? {
        guard let s = weekStart, let e = weekEnd else { return nil }
        let input = DateFormatter()
        input.dateFormat = "yyyy-MM-dd"
        input.locale = Locale(identifier: "en_US_POSIX")
        guard let sd = input.date(from: s), let ed = input.date(from: e) else { return "\(s) – \(e)" }
        let output = DateFormatter()
        output.dateFormat = "MMM d"
        return "\(output.string(from: sd)) – \(output.string(from: ed))"
    }

    var completedAt: Date? { myAttempt?.completedAt }
}

// MARK: - Recap quiz

struct RecapQuizView: View {
    let recapId: String
    let title: String
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    @State private var questions: [RecapQuestion] = []
    @State private var loading = true
    @State private var errorText: String?

    @State private var current = 0
    @State private var answers: [Int: Int] = [:]
    @State private var submitted = false
    @State private var submitting = false
    @State private var score = 0
    @State private var totalAnswered = 0
    @State private var results: [RecapResultRow] = []
    @State private var missedArticles: [Story] = []

    var body: some View {
        Group {
            if loading {
                ProgressView().padding(.top, 40)
            } else if let err = errorText {
                VStack(spacing: 8) {
                    Text("Couldn\u{2019}t load recap")
                        .font(.system(.callout, design: .default, weight: .semibold))
                        .foregroundColor(VP.text)
                    Text(err).font(.footnote).foregroundColor(VP.dim)
                }
                .padding(.top, 40)
            } else if submitted {
                resultView
            } else {
                playerView
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .background(VP.bg)
        .task { await load() }
    }

    @ViewBuilder
    private var playerView: some View {
        if current < questions.count {
            let q = questions[current]
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Text("Question \(current + 1) of \(questions.count)")
                            .font(.system(.caption, design: .default, weight: .semibold))
                            .foregroundColor(VP.dim)
                        Spacer()
                    }
                    Text(q.questionText)
                        .font(.system(.headline, design: .default, weight: .semibold))
                        .foregroundColor(VP.text)

                    ForEach(Array(q.options.enumerated()), id: \.offset) { idx, opt in
                        optionButton(questionIndex: current, optionIndex: idx, text: opt.text)
                    }
                }
                .padding(20)
            }
        }
    }

    private func optionButton(questionIndex: Int, optionIndex: Int, text: String) -> some View {
        // D36 anti-cheat: no per-question reveal. Server grades on submit.
        let answered = answers[questionIndex] != nil
        let selected = answers[questionIndex] == optionIndex
        let border = selected ? VP.accent : VP.border
        let color = VP.text
        return Button {
            guard !answered, !submitting else { return }
            answers[questionIndex] = optionIndex
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                if questionIndex < questions.count - 1 {
                    current = questionIndex + 1
                } else {
                    submit()
                }
            }
        } label: {
            HStack(spacing: 10) {
                Text(["A", "B", "C", "D"][min(optionIndex, 3)])
                    .foregroundColor(VP.dim)
                    .font(.system(.footnote, design: .default, weight: .semibold))
                Text(text)
                    .foregroundColor(color)
                    .font(.subheadline)
                    .multilineTextAlignment(.leading)
                Spacer()
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(border, lineWidth: 1))
            .cornerRadius(10)
        }
        .buttonStyle(.plain)
        .disabled(answered)
    }

    private var resultView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("\(score) / \(totalAnswered)")
                    .font(.system(.largeTitle, design: .default, weight: .bold))
                    .foregroundColor(VP.text)

                // D41: explanations shown after the attempt, every time.
                ForEach(results) { r in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(r.questionText)
                            .font(.system(.subheadline, design: .default, weight: .semibold))
                            .foregroundColor(VP.text)
                        if r.isCorrect {
                            Text("Correct")
                                .font(.system(.caption, design: .default, weight: .semibold))
                                .foregroundColor(VP.right)
                        } else {
                            let correctText = r.options.indices.contains(r.correctAnswer)
                                ? r.options[r.correctAnswer].text
                                : ""
                            Text("Incorrect — correct answer: \(correctText)")
                                .font(.system(.caption, design: .default, weight: .semibold))
                                .foregroundColor(VP.wrong)
                        }
                        if let ex = r.explanation, !ex.isEmpty {
                            Text(ex)
                                .font(.caption)
                                .foregroundColor(VP.dim)
                        }
                    }
                    .padding(.vertical, 8)
                    Divider().background(VP.border)
                }

                if missedArticles.isEmpty {
                    Text("You caught everything this week.")
                        .font(.footnote)
                        .foregroundColor(VP.soft)
                        .padding(.top, 6)
                } else {
                    Text("Articles you missed")
                        .font(.system(.subheadline, design: .default, weight: .semibold))
                        .foregroundColor(VP.text)
                        .padding(.top, 10)
                    ForEach(missedArticles) { story in
                        NavigationLink {
                            StoryDetailView(story: story)
                                .environmentObject(auth)
                        } label: {
                            HStack {
                                Text(story.title ?? "")
                                    .font(.system(.subheadline, design: .default, weight: .semibold))
                                    .foregroundColor(VP.text)
                                    .lineLimit(2)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundColor(VP.dim)
                            }
                            .padding(.vertical, 10)
                        }
                        .buttonStyle(.plain)
                        Divider().background(VP.border)
                    }
                }
            }
            .padding(20)
        }
    }

    // MARK: - Data

    private func load() async {
        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/recap/\(recapId)", relativeTo: site) else { return }
        do {
            guard let session = try? await client.auth.session else { return }
            var req = URLRequest(url: url)
            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            let (data, _) = try await URLSession.shared.data(for: req)
            let decoded = try JSONDecoder().decode(RecapDetail.self, from: data)
            await MainActor.run {
                questions = decoded.questions
                loading = false
            }
        } catch {
            await MainActor.run {
                errorText = "Network issue."
                loading = false
            }
        }
    }

    private func submit() {
        Task { await doSubmit() }
    }

    private func doSubmit() async {
        guard !submitting else { return }
        await MainActor.run { submitting = true }

        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/recap/\(recapId)/submit", relativeTo: site),
              let session = try? await client.auth.session else {
            await MainActor.run {
                submitting = false
                errorText = "Could not submit."
            }
            return
        }

        struct Answer: Encodable {
            let question_id: String
            let selected_answer: Int
        }
        struct Body: Encodable { let answers: [Answer] }

        let payload = Body(answers: questions.enumerated().compactMap { (i, q) in
            guard let a = answers[i] else { return nil }
            return Answer(question_id: q.id, selected_answer: a)
        })

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = try? JSONEncoder().encode(payload)

        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                await MainActor.run {
                    submitting = false
                    errorText = "Could not submit."
                }
                return
            }
            let decoded = try JSONDecoder().decode(RecapSubmitResponse.self, from: data)
            await MainActor.run {
                score = decoded.score
                totalAnswered = decoded.total
                results = decoded.results
                submitting = false
                submitted = true
            }
            await loadMissed(ids: decoded.articlesMissed)
        } catch {
            await MainActor.run {
                submitting = false
                errorText = "Could not submit."
            }
        }
    }

    private func loadMissed(ids: [String]) async {
        guard !ids.isEmpty else { return }
        do {
            let rows: [Story] = try await client.from("articles")
                .select("id, title, slug, excerpt, cover_image_url, category_id, published_at, body, status")
                .in("id", values: ids)
                .execute().value
            await MainActor.run { missedArticles = rows }
        } catch {
            Log.d("recap missed load failed: \(error)")
        }
    }
}

// GET /api/recap/[id] response. The server intentionally strips
// is_correct from question options (D36 anti-cheat) — correct-answer
// data arrives only in the submit response, below.
struct RecapDetail: Codable {
    let recap: RecapSummary
    let questions: [RecapQuestion]
}

struct RecapQuestion: Codable, Identifiable {
    let id: String
    let questionText: String
    let articleId: String?
    let options: [QuestionOption]

    struct QuestionOption: Codable {
        let text: String
    }

    enum CodingKeys: String, CodingKey {
        case id, options
        case questionText = "question_text"
        case articleId = "article_id"
    }
}

// POST /api/recap/[id]/submit response. Server grades and returns the
// per-question breakdown, including correct_answer, is_correct, and
// explanation — the only place the client ever sees correct answers.
struct RecapSubmitResponse: Codable {
    let attemptId: String?
    let score: Int
    let total: Int
    let articlesMissed: [String]
    let results: [RecapResultRow]

    enum CodingKeys: String, CodingKey {
        case score, total, results
        case attemptId = "attempt_id"
        case articlesMissed = "articles_missed"
    }
}

struct RecapResultRow: Codable, Identifiable {
    let questionId: String
    let questionText: String
    let articleId: String?
    let selectedAnswer: Int?
    let correctAnswer: Int
    let isCorrect: Bool
    let explanation: String?
    let options: [RecapQuestion.QuestionOption]

    var id: String { questionId }

    enum CodingKeys: String, CodingKey {
        case options, explanation
        case questionId = "question_id"
        case questionText = "question_text"
        case articleId = "article_id"
        case selectedAnswer = "selected_answer"
        case correctAnswer = "correct_answer"
        case isCorrect = "is_correct"
    }
}

// Small inline upgrade prompt used when a view is paid-only.
struct UpgradePromptInline: View {
    let feature: String
    let detail: String
    @State private var showSubscription = false

    var body: some View {
        VStack(spacing: 12) {
            Spacer().frame(height: 60)
            Text(feature)
                .font(.system(.title3, design: .default, weight: .bold))
                .foregroundColor(VP.text)
            Text(detail)
                .font(.footnote)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button("View plans") { showSubscription = true }
                .font(.system(.subheadline, design: .default, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 22)
                .padding(.vertical, 10)
                .frame(minHeight: 44)
                .background(VP.accent)
                .cornerRadius(10)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .sheet(isPresented: $showSubscription) { SubscriptionView() }
    }
}
