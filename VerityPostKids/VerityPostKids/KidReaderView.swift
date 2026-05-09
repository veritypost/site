import SwiftUI
import Supabase

// Kid article reader. Loads full article text, renders in kid-friendly style.
// Reading is logged when the kid taps "Take the quiz" — completion is recorded
// at that point. Scroll-progress tracking is deferred.

/// Wave B — two-mode reader. Quick = today's 50-word `kids_summary` (default,
/// no behavioral change vs. pre-Wave-B). Deep dive = the full kid `body`
/// parsed for `[[GLOSS]]` / `[[REVEAL]]` / `[[PREDICT]]` markers and rendered
/// as native tap cards by `KidArticleBodyView`. Per-article, no persistence.
private enum ReaderMode: String { case quick, deep }

// Apple Kids 1.3 — first-party imagery only.
private let allowedImageHosts: Set<String> = {
    var hosts: [String] = ["cdn.veritypost.com"]
    if SupabaseKidsClient.shared.configValid,
       let supabaseHost = SupabaseKidsClient.shared.supabaseURL.host?.lowercased(),
       !supabaseHost.isEmpty {
        hosts.append(supabaseHost)
    }
    return Set(hosts)
}()

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
    /// Wave B — full kid body (with markers). Nil/empty when the article
    /// pre-dates the kid pipeline writing `body`, in which case the
    /// Quick/Deep toggle hides entirely and reader behavior matches today.
    @State private var bodyFull_: String? = nil
    @State private var mode: ReaderMode = .quick
    /// Live aggregate of GLOSS / REVEAL / PREDICT engagement during Deep dive.
    /// Wave C will stamp this into `reading_log` at quiz-tap time.
    @State private var counters: InteractiveMomentCounters = .zero
    @State private var loading: Bool = true
    @State private var loadError: String? = nil
    @State private var startTime: Date = Date()
    @State private var logged: Bool = false
    @State private var showQuiz: Bool = false
    // K4: set when logReading's retry also fails. Propagated into the
    // KidQuizResult so celebration scenes know a streak-day's read
    // didn't actually persist.
    @State private var readingLogFailed: Bool = false
    // Owner cleanup item 12 — kid story follow state.
    @State private var isFollowing: Bool = false
    @State private var followBusy: Bool = false

    private var client: SupabaseClient { SupabaseKidsClient.shared.client }

    var body: some View {
        ZStack {
            K.bg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack {
                        dismissButton
                        Spacer()
                    }
                    header
                    if loading {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                    } else if loadError != nil {
                        networkErrorState
                    } else if body_.isEmpty {
                        // OwnersAudit Kids A7 — empty kids_summary means the
                        // editor hasn't authored a kid-band rewrite. Pre-A7
                        // fell through to the adult `body` column, which
                        // contains adult-tier vocabulary, source chains, and
                        // quotes never sanitized for kids. Hard refusal —
                        // surface a friendly empty state and back the kid out
                        // to the article list. Quiz button hidden so there's
                        // no path forward into a quiz on an unwritten story.
                        notReadyState
                    } else {
                        // Wave B — Quick/Deep dive toggle. Only shown when
                        // the article has a non-empty `body` AND that body
                        // contains at least one interactive marker. Older
                        // articles without a kid `body` (or kid bodies that
                        // happen to carry no markers) fall through to
                        // Quick-only — same UX as pre-Wave-B.
                        if hasDeepDiveAvailable {
                            modeToggle
                                .padding(.bottom, 4)
                        }

                        if mode == .deep, let full = bodyFull_, !full.isEmpty {
                            KidArticleBodyView(
                                articleBody: full,
                                categoryColor: categoryColor,
                                onCountersChange: { counters = $0 }
                            )
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
                        }

                        takeQuizButton
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 100)
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
        .task { await loadFollowState() }
        // OwnersAudit Kids A91 — body is loaded once on .task and never
        // re-fetched. A kid who opens an article, backgrounds the app
        // for hours/days, and comes back is reading a stale snapshot —
        // an editor revision (typo fix, factual correction, or
        // moderation pull) on the server side won't reach them. Re-fetch
        // on foreground transition to keep the kid on the live revision.
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            // Reset per-session reader state so the kid lands fresh on the
            // live revision: Quick is the default mode for every load, and
            // marker tap counters reset alongside the body re-parse.
            mode = .quick
            counters = .zero
            Task { await loadArticle() }
        }
    }

    // MARK: Sub-views

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Group {
                if let urlString = article.coverImageUrl,
                   let url = URL(string: urlString),
                   url.scheme == "https",
                   let host = url.host?.lowercased(),
                   !host.isEmpty,
                   allowedImageHosts.contains(host) {
                    // BugList #9 — capped image loader. AsyncImage has no
                    // byte limit; an oversized cover (admin compromise,
                    // CDN bug) could OOM a kid's device. allowedImageHosts
                    // gates origin; this caps payload at 2 MB.
                    KidCoverImage(url: url, fallback: gradientPlaceholder)
                } else {
                    gradientPlaceholder
                }
            }
            .frame(height: 140)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .clipped()

            Text(article.title ?? "Untitled")
                .font(.system(.title2, design: .rounded, weight: .black))
                .foregroundStyle(K.text)
                .multilineTextAlignment(.leading)

            HStack(spacing: 10) {
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
                Spacer(minLength: 0)
                // Owner cleanup item 12 — Follow the story this article
                // belongs to. Hidden if the article isn't part of a story.
                if let storyDbId = article.storyId, auth.kid != nil {
                    Button {
                        Task { await toggleFollow(storyId: storyDbId) }
                    } label: {
                        Text(isFollowing ? "Following" : "Follow")
                            .font(.system(.caption, design: .rounded, weight: .bold))
                            .foregroundStyle(isFollowing ? .white : K.text)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(
                                Capsule().fill(isFollowing ? categoryColor : K.card)
                            )
                            .overlay(
                                Capsule().stroke(isFollowing ? categoryColor : K.border, lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                    .disabled(followBusy)
                }
            }
        }
    }

    private var gradientPlaceholder: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(LinearGradient(
                colors: [categoryColor.opacity(0.3), categoryColor.opacity(0.1)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ))
            .overlay(
                Image(systemName: "newspaper.fill")
                    .font(.system(.largeTitle, weight: .bold))
                    .foregroundStyle(categoryColor)
                    .accessibilityHidden(true)
            )
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
                .background(K.tealDark)
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
        .accessibilityLabel("Close article")
        .buttonStyle(.plain)
    }

    // MARK: Wave B — mode toggle

    /// Show the Quick/Deep toggle only when there's a non-empty `body` AND
    /// it carries at least one interactive marker. Otherwise Deep dive has
    /// nothing to offer and the kid sees Quick-only (same as pre-Wave-B).
    private var hasDeepDiveAvailable: Bool {
        guard let full = bodyFull_, !full.isEmpty else { return false }
        // Cheap pre-filter — full regex parse runs only after the kid taps Deep.
        return full.contains("[[GLOSS:") || full.contains("[[REVEAL:") || full.contains("[[PREDICT:")
    }

    private var modeToggle: some View {
        HStack(spacing: 0) {
            modePill(.quick, label: "Quick")
            modePill(.deep,  label: "Deep dive")
        }
        .padding(4)
        .background(K.card)
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(K.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func modePill(_ target: ReaderMode, label: String) -> some View {
        let selected = mode == target
        return Button {
            guard mode != target else { return }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            withAnimation(K.springSnap) { mode = target }
        } label: {
            Text(label)
                .font(.scaledSystem(
                    size: 14,
                    weight: selected ? .heavy : .semibold,
                    design: .rounded
                ))
                .foregroundStyle(selected ? Color.white : K.dim)
                .frame(maxWidth: .infinity, minHeight: 32)
                .background(selected ? K.teal : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    /// A7 — shown when an article has no kids_summary. Friendly placeholder
    /// + back-to-list button. No quiz button since there's no kid-band copy
    /// to quiz on.
    private var notReadyState: some View {
        VStack(alignment: .center, spacing: 14) {
            Image(systemName: "newspaper")
                .font(.system(.largeTitle, weight: .bold))
                .foregroundStyle(K.dim)
                .accessibilityHidden(true)
            Text("This story isn't ready yet. Try a different one!")
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .foregroundStyle(K.dim)
                .multilineTextAlignment(.center)
            Button { dismiss() } label: {
                Text("Back")
                    .font(.system(.subheadline, design: .rounded, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: 180, minHeight: 44)
                    .background(K.tealDark)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    private var networkErrorState: some View {
        VStack(alignment: .center, spacing: 14) {
            Image(systemName: "wifi.slash")
                .font(.system(.largeTitle, weight: .bold))
                .foregroundStyle(K.dim)
                .accessibilityHidden(true)
            Text("Couldn't load this story.")
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .foregroundStyle(K.dim)
                .multilineTextAlignment(.center)
            Button {
                loadError = nil
                Task { await loadArticle() }
            } label: {
                Text("Try again")
                    .font(.system(.subheadline, design: .rounded, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: 180, minHeight: 44)
                    .background(K.tealDark)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    // MARK: Load + read-log

    private func loadArticle() async {
        loading = true
        defer { loading = false }

        struct Row: Decodable {
            let kids_summary: String?
            // Wave B — kid `body` is the full 250–450-word kid article that
            // the server pipeline writes alongside `kids_summary`. Only
            // surfaced when the kid switches to Deep dive; never shown raw
            // on Quick. The column is the kid pipeline's own kid-band
            // rewrite, NOT the adult `body` (those are different columns'
            // semantics in this kid context — see editorial-guide.ts).
            let body: String?
        }

        do {
            // T-026 — belt-and-suspenders: don't just trust RLS. If the
            // kid-JWT RLS policy on articles drifts, kids could fetch an
            // adult article by known UUID. Explicit is_kids_safe=true
            // filter catches both cases.
            //
            // A7 — `kids_summary` remains the Quick-mode source of truth.
            // `body` is fetched for Deep dive (Wave B). Without
            // `kids_summary` the empty branch still routes to notReadyState
            // — Deep dive does NOT rescue an unwritten kid story, since
            // markers in `body` only exist when the kid pipeline actually
            // ran end-to-end and produced both columns.
            let row: Row = try await client
                .from("articles")
                .select("kids_summary, body")
                .eq("id", value: article.id)
                .eq("is_kids_safe", value: true)
                .single()
                .execute()
                .value
            self.loadError = nil
            self.body_ = row.kids_summary ?? ""
            self.bodyFull_ = row.body
            self.startTime = Date()
        } catch {
            self.loadError = "Couldn't load article"
            self.body_ = ""
            self.bodyFull_ = nil
        }
    }

    // Owner cleanup item 12 — kid story follow. Loads current
    // membership on appear; toggle calls the kid-flavoured RPC.
    private func loadFollowState() async {
        guard let storyDbId = article.storyId, let kidId = auth.kid?.id else { return }
        struct Membership: Decodable {
            let storyId: String
            enum CodingKeys: String, CodingKey { case storyId = "story_id" }
        }
        do {
            let rows: [Membership] = try await client
                .from("story_follows")
                .select("story_id")
                .eq("kid_profile_id", value: kidId)
                .eq("story_id", value: storyDbId)
                .execute()
                .value
            await MainActor.run { isFollowing = !rows.isEmpty }
        } catch {
            // Silent — defaults to not-following.
        }
    }

    private func toggleFollow(storyId: String) async {
        guard let kidId = auth.kid?.id else { return }
        await MainActor.run {
            followBusy = true
            isFollowing.toggle()
        }
        defer { Task { @MainActor in followBusy = false } }
        struct ToggleResult: Decodable {
            let following: Bool
        }
        do {
            let result: [ToggleResult] = try await client
                .rpc("toggle_story_follow_kid", params: [
                    "p_kid_profile_id": kidId,
                    "p_story_id": storyId,
                ])
                .execute()
                .value
            if let first = result.first {
                await MainActor.run { isFollowing = first.following }
            }
        } catch {
            // Revert on failure.
            await MainActor.run { isFollowing.toggle() }
        }
    }

    private func logReading() async throws {
        guard let kidId = auth.kid?.id else {
            throw URLError(.userAuthenticationRequired)
        }
        let elapsed = Int(Date().timeIntervalSince(startTime))
        // Wave C — stamp the mode the kid was in at quiz-tap time plus the
        // running interactive-moment aggregate. `mode_used` is read once
        // here, not at first switch, so a kid who toggles mid-read logs
        // their final state. `counters` mirrors `KidArticleBodyView`'s
        // per-session totals via the onCountersChange callback.
        let row = ReadingLogInsert(
            user_id: nil,
            kid_profile_id: kidId,
            article_id: article.id,
            read_percentage: 1.0,
            time_spent_seconds: elapsed,
            completed: true,
            source: "kids-ios",
            device_type: "ios",
            mode_used: mode == .deep ? "deep" : "quick",
            moment_glossary_taps: counters.glossaryTaps,
            moment_reveal_taps: counters.revealTaps,
            moment_predict_shown: counters.predictShown,
            moment_predict_correct: counters.predictCorrect
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
