import SwiftUI
import Supabase

// Kid article reader. Loads full article text, renders in kid-friendly style.
// Reading is logged when the kid taps "Take the quiz" — completion is recorded
// at that point. Scroll-progress tracking is deferred.

struct KidReaderView: View {
    let article: KidArticle
    let categoryColor: Color
    // K10: quiz outcome bubbles up so KidsAppRoot can present StreakScene /
    // BadgeUnlockScene after the reader + article list unwind. Default no-op
    // keeps existing callers (previews, future plain-reader presentations)
    // compiling without passing a callback.
    var onQuizComplete: (KidQuizResult) -> Void = { _ in }

    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @EnvironmentObject private var auth: KidsAuth

    @State private var body_: String = ""
    @State private var loading: Bool = true
    @State private var loadError: String? = nil
    @State private var startTime: Date = Date()
    @State private var logged: Bool = false
    @State private var showQuiz: Bool = false
    // K4: set when logReading's retry also fails. Propagated into the
    // KidQuizResult so celebration scenes know a streak-day's read
    // didn't actually persist.
    @State private var readingLogFailed: Bool = false

    private var client: SupabaseClient { SupabaseKidsClient.shared.client }

    var body: some View {
        ZStack {
            K.bg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    if loading {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                    } else {
                        // Split on blank-line paragraph breaks so kids get
                        // visible block spacing instead of one wall of text.
                        // SwiftUI's default Text collapses `\n\n` to a single
                        // newline of vertical gap, which reads as cramped.
                        let paragraphs = body_
                            .components(separatedBy: "\n\n")
                            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                            .filter { !$0.isEmpty }
                        VStack(alignment: .leading, spacing: 14) {
                            ForEach(Array(paragraphs.enumerated()), id: \.offset) { _, p in
                                Text(p)
                                    .font(.system(.body, design: .rounded, weight: .regular))
                                    .foregroundStyle(K.text)
                                    .lineSpacing(5)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }

                        takeQuizButton
                    }
                    if let loadError {
                        Text(loadError)
                            .font(.system(.caption, design: .rounded))
                            .foregroundStyle(K.coralDark)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 100)
            }
            .overlay(alignment: .topLeading) {
                dismissButton
            }
            .fullScreenCover(isPresented: $showQuiz) {
                KidQuizEngineView(
                    article: article,
                    categoryColor: categoryColor,
                    readingLogFailed: readingLogFailed
                ) { result in
                    showQuiz = false
                    if let r = result {
                        // Completed — propagate result up so KidsAppRoot can
                        // unwind the article cover + present scene chain,
                        // then dismiss the reader too.
                        onQuizComplete(r)
                        dismiss()
                    }
                    // Cancelled (X tapped in quiz): just close the quiz, stay
                    // in the reader so the kid can re-read the article.
                }
            }
        }
        .task { await loadArticle() }
        // OwnersAudit Kids A91 — body is loaded once on .task and never
        // re-fetched. A kid who opens an article, backgrounds the app
        // for hours/days, and comes back is reading a stale snapshot —
        // an editor revision (typo fix, factual correction, or
        // moderation pull) on the server side won't reach them. Re-fetch
        // on foreground transition to keep the kid on the live revision.
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await loadArticle() }
        }
    }

    // MARK: Sub-views

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(LinearGradient(
                    colors: [categoryColor.opacity(0.3), categoryColor.opacity(0.1)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
                .frame(height: 140)
                .overlay(
                    Image(systemName: "newspaper.fill")
                        .font(.system(.largeTitle, weight: .bold))
                        .foregroundStyle(categoryColor)
                        .accessibilityHidden(true)
                )

            Text(article.title ?? "Untitled")
                .font(.system(.title2, design: .rounded, weight: .black))
                .foregroundStyle(K.text)
                .multilineTextAlignment(.leading)

            if let mins = article.readingTimeMinutes {
                HStack(spacing: 6) {
                    Image(systemName: "clock")
                        .font(.system(.caption, weight: .bold))
                        .accessibilityHidden(true)
                    Text("\(mins) min read")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                }
                .foregroundStyle(K.dim)
            }
        }
    }

    private var takeQuizButton: some View {
        VStack(spacing: 10) {
            Text("Ready to try the quiz?")
                .font(.system(.subheadline, design: .rounded, weight: .heavy))
                .foregroundStyle(K.text)

            Button {
                // K4: await the reading_log write so we can tell the quiz
                // engine (via the result struct the quiz will later produce)
                // whether the kid's read actually persisted. Non-blocking UX:
                // we still open the quiz even on double-fail — the kid
                // shouldn't be punished for a transient network issue —
                // but the celebration flow gets signaled.
                if !logged {
                    logged = true
                    Task {
                        do {
                            try await logReading()
                        } catch {
                            readingLogFailed = true
                        }
                        showQuiz = true
                    }
                } else {
                    showQuiz = true
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "questionmark.circle.fill")
                        .font(.system(.body, weight: .bold))
                        .accessibilityHidden(true)
                    Text("Take the quiz")
                        .font(.system(.body, design: .rounded, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 54)
                .background(K.teal)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .shadow(color: K.teal.opacity(0.3), radius: 12, y: 4)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 24)
    }

    private var dismissButton: some View {
        Button { dismiss() } label: {
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
    }

    // MARK: Load + read-log

    private func loadArticle() async {
        loading = true
        defer { loading = false }

        struct Row: Decodable {
            let body: String?
            let kids_summary: String?
        }

        do {
            // T-026 — belt-and-suspenders: don't just trust RLS. If the
            // kid-JWT RLS policy on articles drifts, kids could fetch an
            // adult article by known UUID. Explicit is_kids_safe=true
            // filter catches both cases.
            let row: Row = try await client
                .from("articles")
                .select("body, kids_summary")
                .eq("id", value: article.id)
                .eq("is_kids_safe", value: true)
                .single()
                .execute()
                .value
            self.body_ = row.kids_summary ?? row.body ?? ""
            self.startTime = Date()
        } catch {
            self.loadError = "Couldn't load article"
            self.body_ = ""
        }
    }

    private func logReading() async throws {
        guard let kidId = auth.kid?.id else { return }
        let elapsed = Int(Date().timeIntervalSince(startTime))
        let row = ReadingLogInsert(
            user_id: nil,
            kid_profile_id: kidId,
            article_id: article.id,
            read_percentage: 1.0,
            time_spent_seconds: elapsed,
            completed: true,
            source: "kids-ios",
            device_type: "ios"
        )
        // T-018 — single retry then log. K4 — throw on second failure so the
        // caller (takeQuiz button → KidQuizResult flag) can tell celebration
        // scenes the write didn't land. Quiz can still be taken; scene code
        // decides how to soften the streak claim.
        do {
            try await client
                .from("reading_log")
                .insert(row)
                .execute()
            return
        } catch {
            print("[KidReaderView] reading_log insert failed:", error)
        }
        try? await Task.sleep(nanoseconds: 1_000_000_000)
        do {
            try await client.from("reading_log").insert(row).execute()
        } catch {
            print("[KidReaderView] reading_log insert failed on retry:", error)
            throw error
        }
    }
}

