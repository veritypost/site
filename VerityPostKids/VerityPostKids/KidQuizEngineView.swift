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

// MARK: - T251 pending-write persistence
//
// Background-and-kill safe queue for quiz_attempts inserts. Mirrors the
// adult `EventsClient.swift` persistence pattern: atomic JSON write under
// Application Support/VerityPostKids/quiz_pending.json. We store the
// payload (not the Task handle) so a hard kill mid-write rehydrates on
// next launch and the insert eventually lands. Without this, a kid who
// completes a quiz and is interrupted (incoming call, lock screen, force
// quit) loses streak/score credit because the in-flight Task dies with
// the process — COPPA-adjacent kid-data-loss vector.
//
// Single write type (quiz_attempts) — KidsAppState.completeQuiz is purely
// in-memory and the streak/score columns on kid_profiles are recomputed
// server-side via triggers on quiz_attempts/reading_log inserts, so this
// is the only DB write KidQuizEngineView is responsible for. reading_log
// has its own retry path inside KidReaderView and is out of scope here.
fileprivate struct PendingQuizWrite: Codable, Equatable {
    let id: UUID
    // Mirrors QuizAttemptInsert exactly. Inlined here so the persisted
    // JSON shape is stable independent of refactors to that struct, and
    // so this file owns its disk schema.
    let quiz_id: String
    let user_id: String?
    let kid_profile_id: String
    let article_id: String
    let attempt_number: Int
    let questions_served: [String]
    let selected_answer: String
    let is_correct: Bool
    let points_earned: Int?
    let time_taken_seconds: Int?

    func toInsert() -> QuizAttemptInsert {
        QuizAttemptInsert(
            quiz_id: quiz_id,
            user_id: user_id,
            kid_profile_id: kid_profile_id,
            article_id: article_id,
            attempt_number: attempt_number,
            questions_served: questions_served,
            selected_answer: selected_answer,
            is_correct: is_correct,
            points_earned: points_earned,
            time_taken_seconds: time_taken_seconds
        )
    }
}

/// Disk-backed pending-write queue. Atomic JSON write so a crash mid-save
/// can't leave a half-written file. Lives in Application Support so it's
/// user-invisible and survives app restarts (but not reinstalls — fine,
/// the writes were tied to a session that no longer exists).
fileprivate struct KidQuizPendingPersistence {
    private struct Snapshot: Codable {
        let version: Int
        let writes: [PendingQuizWrite]
    }

    private static let currentVersion = 1

    private let fileURL: URL = {
        let fm = FileManager.default
        let base = (try? fm.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )) ?? fm.temporaryDirectory
        let dir = base.appendingPathComponent("VerityPostKids", isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("quiz_pending.json")
    }()

    func save(_ writes: [PendingQuizWrite]) {
        do {
            if writes.isEmpty {
                // Drop the file rather than leaving an empty array on
                // disk so a stale empty file doesn't pin us forever.
                try? FileManager.default.removeItem(at: fileURL)
                return
            }
            let snapshot = Snapshot(version: Self.currentVersion, writes: writes)
            let data = try JSONEncoder().encode(snapshot)
            try data.write(to: fileURL, options: [.atomic])
        } catch {
            #if DEBUG
            print("[KidQuizPendingPersistence] save failed:", error.localizedDescription)
            #endif
        }
    }

    func load() -> [PendingQuizWrite] {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return [] }
        do {
            let data = try Data(contentsOf: fileURL)
            let snapshot = try JSONDecoder().decode(Snapshot.self, from: data)
            // Forward-compat guard: if a future version writes a shape
            // we don't understand, treat the file as corrupt rather than
            // attempting to dispatch malformed inserts.
            guard snapshot.version == Self.currentVersion else { return [] }
            return snapshot.writes
        } catch {
            #if DEBUG
            print("[KidQuizPendingPersistence] load failed:", error.localizedDescription)
            #endif
            // Corrupt file — nuke so it can't pin us across launches.
            try? FileManager.default.removeItem(at: fileURL)
            return []
        }
    }
}

/// Singleton hydration runner. Fires once per app launch (lazy on first
/// quiz view appearance) to drain any writes left over from a prior
/// session that was killed or backgrounded-then-evicted before its
/// quiz_attempts inserts landed. Runs detached from any view's task tree
/// so a quick view dismiss doesn't cancel the drain.
@MainActor
fileprivate final class KidQuizPendingHydrator {
    static let shared = KidQuizPendingHydrator()
    private var didRun = false
    private init() {}

    func hydrateIfNeeded(client: SupabaseClient) {
        guard !didRun else { return }
        didRun = true
        let persistence = KidQuizPendingPersistence()
        let queued = persistence.load()
        guard !queued.isEmpty else { return }

        // Fire each write best-effort. Every success removes that entry
        // from the on-disk snapshot; failures stay queued for next launch.
        // We do NOT race a timeout here — there's no UI gate on hydration,
        // and a slow-network drain of older writes is strictly better than
        // dropping them.
        //
        // Concurrency: an active KidQuizEngineView in the SAME launch may
        // be writing fresh entries to disk while we hydrate. To avoid
        // clobbering those, we re-read the snapshot before each save and
        // peel off only the entry we just confirmed. The active view's
        // entries are preserved across our writebacks.
        Task.detached {
            for write in queued {
                let ok = await Self.send(client: client, write: write)
                guard ok else { continue }
                await MainActor.run {
                    var current = persistence.load()
                    current.removeAll { $0.id == write.id }
                    persistence.save(current)
                }
            }
        }
    }

    nonisolated private static func send(
        client: SupabaseClient,
        write: PendingQuizWrite
    ) async -> Bool {
        do {
            try await client.from("quiz_attempts").insert(write.toInsert()).execute()
            return true
        } catch {
            #if DEBUG
            print("[KidQuizPendingHydrator] hydrate-insert failed:", error.localizedDescription)
            #endif
            return false
        }
    }
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
    @Environment(\.scenePhase) private var scenePhase

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
    // T251 — disk-persisted queue of writes the kid has triggered this
    // session. An entry lives in `pendingPersistedWrites` (and on disk)
    // from the moment it's dispatched until it confirms 2xx. If the app
    // is backgrounded-then-killed mid-flight, next launch hydrates and
    // re-fires. The accompanying `inFlightWrites` map holds the live
    // Task handles so the result-screen gate can await them.
    @State private var pendingPersistedWrites: [PendingQuizWrite] = []
    @State private var inFlightWrites: [UUID: Task<Bool, Never>] = [:]
    // T251 — incremented on every retry. Observers capture the current
    // value at dispatch time and bail if it no longer matches when their
    // task resolves — prevents a slow-arriving cancelled task from a
    // prior round bumping writeFailures or rewriting disk state after a
    // successful retry under the same write id.
    @State private var dispatchEpoch: Int = 0
    // T251 — gate state for the result screen. `awaitingDrain` is true
    // while we race the in-flight Tasks against a 3s timeout. After the
    // race, if any writes failed, `drainHadFailures` flips and the
    // result screen renders the "Couldn't save" + retry path instead of
    // the success body.
    @State private var awaitingDrain: Bool = false
    @State private var drainHadFailures: Bool = false
    @State private var didTriggerDrain: Bool = false
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
    private let pendingPersistence = KidQuizPendingPersistence()
    // T251 — total wall time we'll wait for in-flight writes to land
    // before showing the "Couldn't save" path. 3s mirrors the adult
    // EventsClient drain window and stays inside iOS's ~5s background
    // CPU budget so a backgrounded race still has time to persist.
    private let drainTimeoutSeconds: Double = 3.0

    var body: some View {
        ZStack {
            K.bg.ignoresSafeArea()

            if loading {
                ProgressView()
            } else if blockedNotKidsSafe {
                notKidsSafeState
            } else if loadError != nil {
                // OwnersAudit Kids Task 3 — distinguish a network failure
                // from a genuinely-missing quiz. emptyState says "No quiz yet"
                // which is a lie when the real cause is connectivity.
                errorState
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
        .task {
            // T251 — drain any writes the previous app session left on
            // disk. Hydrator is idempotent across views; only the first
            // call per app launch does work.
            KidQuizPendingHydrator.shared.hydrateIfNeeded(client: client)
            await loadQuestions()
        }
        // T251 — synchronously persist whatever's in flight when the OS
        // hands us the background notice. The state-array is already on
        // disk per-write at dispatch time, but a fresh save here flushes
        // any entry that landed inside the same scenePhase tick before
        // we got the notification.
        .onChange(of: scenePhase) { _, phase in
            if phase == .background || phase == .inactive {
                pendingPersistence.save(pendingPersistedWrites)
            }
        }
    }

    // MARK: Load

    private func loadQuestions() async {
        loading = true
        // Reset transient flags so retry from errorState clears stale state.
        loadError = nil
        blockedNotKidsSafe = false
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
            // questions = [] sends the body into emptyState so the quiz
            // flow never reads startedAt — leave it at its default.
            guard rows.count >= 5 else {
                self.questions = []
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
        guard let kidId = auth.kid?.id else { return }
        // T251 — build the disk-persistable payload first, save it,
        // THEN dispatch. The disk entry is what survives a background-
        // then-kill; the Task handle is just the fast path for the
        // result-screen gate.
        let pending = PendingQuizWrite(
            id: UUID(),
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
        pendingPersistedWrites.append(pending)
        pendingPersistence.save(pendingPersistedWrites)
        dispatchWrite(pending)
    }

    /// Dispatch a single quiz_attempts insert and store its handle. On
    /// success, drop the entry from disk. On failure (cancelled, network,
    /// non-2xx), leave the entry on disk so the next launch's hydrator
    /// can re-fire it.
    private func dispatchWrite(_ write: PendingQuizWrite) {
        let id = write.id
        let dispatchedEpoch = dispatchEpoch
        let task: Task<Bool, Never> = Task { [client] in
            // T-018 — primary attempt + single 1s-backoff retry. Same
            // shape as the pre-T251 path; T251 layers persistence on top
            // rather than replacing the in-session retry.
            do {
                try await client.from("quiz_attempts").insert(write.toInsert()).execute()
                return true
            } catch {
                #if DEBUG
                print("[KidQuizEngineView] quiz_attempts insert failed:", error.localizedDescription)
                #endif
            }
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            do {
                try await client.from("quiz_attempts").insert(write.toInsert()).execute()
                return true
            } catch {
                #if DEBUG
                print("[KidQuizEngineView] quiz_attempts insert failed on retry:", error.localizedDescription)
                #endif
                return false
            }
        }
        inFlightWrites[id] = task

        // Observer task: when the write resolves successfully, peel it
        // off both the in-memory list and disk. Failures stay on disk
        // for next-launch hydration. Stale resolutions from a superseded
        // dispatch (epoch mismatch) are dropped silently — the retry
        // path under the same write id has already taken ownership.
        Task { @MainActor in
            let ok = await task.value
            guard dispatchedEpoch == self.dispatchEpoch else { return }
            inFlightWrites.removeValue(forKey: id)
            if ok {
                pendingPersistedWrites.removeAll { $0.id == id }
                pendingPersistence.save(pendingPersistedWrites)
            } else {
                // Bump in-session counter so KidQuizResult signals to
                // celebration scenes that something didn't land — even
                // if the disk-persisted write eventually replays on
                // next launch, this session's celebration shouldn't lie.
                writeFailures += 1
            }
        }
    }

    private func next() {
        revealed = false
        selectedOption = nil
        if index + 1 < questions.count {
            index += 1
        } else {
            // T251 — gate the result reveal on either (a) all writes
            // drained successfully or (b) a 3s timeout. Until the gate
            // resolves, the view stays on the questionView/showResult
            // boundary; the user sees the spinner the resultView already
            // owns (verdictPending). We flip showResult only after the
            // drain race finishes so failures route to the retry UI
            // instead of celebrating an unsaved quiz.
            awaitingDrain = true
            withAnimation { showResult = true }
            Task { await runResultGate() }
        }
    }

    /// T251 — race in-flight writes against the 3s timeout, then either
    /// fetch the server verdict (success path) or flip into the retry UI
    /// (timeout/failure path). Idempotent: multiple invocations skip if
    /// the gate already ran cleanly this session.
    private func runResultGate() async {
        guard !didTriggerDrain else { return }
        didTriggerDrain = true

        let snapshot = inFlightWrites
        let timeout = drainTimeoutSeconds

        // Race: every in-flight write task vs a single timeout sleep.
        // We treat "timeout fired" the same as "at least one write
        // didn't return success" — both block the celebration path.
        let allSucceeded: Bool = await withTaskGroup(of: Bool.self) { group in
            group.addTask {
                await withTaskGroup(of: Bool.self) { inner -> Bool in
                    for (_, t) in snapshot {
                        inner.addTask { await t.value }
                    }
                    var ok = true
                    for await result in inner where !result {
                        ok = false
                    }
                    return ok
                }
            }
            group.addTask {
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                return false   // timeout = treat as failure for gate purposes
            }
            let first = await group.next() ?? false
            group.cancelAll()
            return first
        }

        await MainActor.run {
            self.awaitingDrain = false
            self.drainHadFailures = !allSucceeded || self.writeFailures > 0
        }

        // Only fetch the server verdict if every write actually landed.
        // Otherwise the RPC would count an incomplete attempt set and
        // the kid would see a wrong score on the result screen.
        if allSucceeded && writeFailures == 0 {
            await fetchServerVerdict()
        }
    }

    /// T251 — retry handler for the "Couldn't save your quiz" UI. Re-
    /// fires every still-pending persisted write. If they all land
    /// inside a fresh 3s window, the result body flips back to the
    /// success path; if they fail again, we stay on the retry screen so
    /// the kid can try once more (or close out — their work is on disk
    /// either way and will resume on next launch).
    private func retryFailedWrites() {
        // Bump the epoch BEFORE cancelling so any late resolution from
        // the prior round's tasks (cancelled URL sessions can finish
        // racing the cancel signal) hits the epoch guard and no-ops.
        dispatchEpoch += 1
        for (_, t) in inFlightWrites { t.cancel() }
        inFlightWrites.removeAll()

        // Re-dispatch every write still on disk under its original id.
        // The id is the dedup key on the persisted snapshot — re-using
        // it means a duplicate disk entry can't accumulate.
        for write in pendingPersistedWrites {
            dispatchWrite(write)
        }

        awaitingDrain = true
        drainHadFailures = false
        didTriggerDrain = false
        writeFailures = 0
        Task { await runResultGate() }
    }

    private func fetchServerVerdict() async {
        guard let kidId = auth.kid?.id else { return }
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
        // OwnersAudit Kids Task 12 — threshold needs to be visible alongside
        // the score so a kid who fails knows how close they came.
        let threshold = max(1, Int(ceil(Double(r.total) * 0.6)))
        return VStack(spacing: 20) {
            Spacer()
            // T251 — three rendering states for the result body:
            //  1. awaitingDrain: writes haven't all landed yet (or the 3s
            //     race is still running). Show a "saving" spinner.
            //  2. drainHadFailures: writes timed out or failed terminally.
            //     Show the "Couldn't save" + retry UI. Do NOT lie to the
            //     kid that their progress was recorded.
            //  3. otherwise: server verdict is being fetched (verdictPending)
            //     or has resolved — show the existing success/fail body.
            if awaitingDrain {
                ProgressView()
                Text("Saving your quiz…")
                    .font(.scaledSystem(size: 14, weight: .semibold, design: .rounded))
                    .foregroundStyle(K.dim)
            } else if drainHadFailures {
                writeFailureBody
            } else if verdictPending {
                // OwnersAudit Kids Task 2 — while the server verdict is still in
                // flight, hold the result reveal. The local fallback can disagree
                // with the server (write failure → server count differs); the
                // brief wait is normal anticipation, not punishing.
                ProgressView()
                Text("Checking your score…")
                    .font(.scaledSystem(size: 14, weight: .semibold, design: .rounded))
                    .foregroundStyle(K.dim)
            } else {
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

                // OwnersAudit Kids Task 12 — show threshold so a kid sees how
                // many they needed, not just how many they got.
                Text(r.passed
                     ? "You got \(r.correctCount) of \(r.total) right."
                     : "You got \(r.correctCount) of \(r.total). You need \(threshold) to pass.")
                    .font(.scaledSystem(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(K.dim)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 16)

                // OwnersAudit Kids Task 10 — connect outcome to something
                // concrete so the quiz reads as participation context, not
                // a school test.
                Text(r.passed
                     ? "Your streak just got longer."
                     : "Read it again and try when you're ready.")
                    .font(.scaledSystem(size: 13, weight: .semibold, design: .rounded))
                    .foregroundStyle(K.dim)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 16)
            }

            Spacer()

            // Done button only appears once the verdict has resolved AND
            // writes succeeded. The retry UI owns its own buttons.
            if !awaitingDrain && !drainHadFailures && !verdictPending {
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
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 40)
    }

    /// T251 — failure body for the result screen. Renders when in-flight
    /// writes timed out or returned terminal errors. Offers a Retry that
    /// re-dispatches every persisted write, and a "Done" that abandons
    /// the result UI without celebrating. The kid's writes remain on
    /// disk in either case — next launch's hydrator will re-fire them.
    @ViewBuilder
    private var writeFailureBody: some View {
        ZStack {
            Circle()
                .fill(K.coral.opacity(0.15))
                .frame(width: 120, height: 120)
            Image(systemName: "wifi.exclamationmark")
                .font(.scaledSystem(size: 56, weight: .bold))
                .foregroundStyle(K.coral)
        }

        Text("Couldn't save your quiz")
            .font(.scaledSystem(size: 24, weight: .black, design: .rounded))
            .foregroundStyle(K.text)
            .multilineTextAlignment(.center)

        Text("We'll keep trying in the background. Try again now to see your score.")
            .font(.scaledSystem(size: 14, weight: .semibold, design: .rounded))
            .foregroundStyle(K.dim)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 24)

        VStack(spacing: 10) {
            Button { retryFailedWrites() } label: {
                Text("Try again")
                    .font(.scaledSystem(size: 16, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 54)
                    .background(K.teal)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .shadow(color: K.teal.opacity(0.3), radius: 12, y: 4)
            }
            .buttonStyle(.plain)

            // T251 — give the kid a way out without celebrating. Forwards
            // the partial result so the parent UI (KidsAppRoot) can apply
            // its writeFailures > 0 guard and skip the streak-bump scene.
            Button { onDone(currentResult) } label: {
                Text("Close")
                    .font(.scaledSystem(size: 14, weight: .semibold, design: .rounded))
                    .foregroundStyle(K.dim)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 24)
    }

    // OwnersAudit Kids Task 3 — network-failure error state with retry. Mirrors
    // LeaderboardView/ExpertSessionsView error patterns; 44pt touch target.
    private var errorState: some View {
        VStack(spacing: 14) {
            Image(systemName: "wifi.slash")
                .font(.scaledSystem(size: 36, weight: .bold))
                .foregroundStyle(K.dim)
            Text("Couldn't load the quiz right now.")
                .font(.scaledSystem(size: 15, weight: .semibold, design: .rounded))
                .foregroundStyle(K.dim)
                .multilineTextAlignment(.center)
            Button { Task { await loadQuestions() } } label: {
                Text("Try again")
                    .font(.scaledSystem(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 22)
                    .padding(.vertical, 12)
                    .frame(minHeight: 44)
                    .background(K.teal)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(40)
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
