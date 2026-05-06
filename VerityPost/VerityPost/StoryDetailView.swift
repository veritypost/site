import SwiftUI
import Supabase
import UIKit

// @migrated-to-permissions 2026-04-18
// @feature-verified tts 2026-04-18
// @feature-verified quiz 2026-04-18
// @feature-verified article_reading 2026-04-18

// MARK: - Scroll offset preference (article reading-progress ribbon)
// Tracks the article body's scroll offset relative to the enclosing
// ScrollView via a transparent GeometryReader background. Used to fill the
// reading-progress ribbon and to fire the half-scroll quiz pre-teaser.
private struct ArticleScrollOffsetKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

private struct ArticleContentHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

struct StoryDetailView: View {
    let story: Story
    @EnvironmentObject var auth: AuthViewModel
    @ObservedObject private var perms = PermissionStore.shared
    private let client = SupabaseManager.shared.client

    // Permission-gated flags. All sourced from `PermissionService`.
    @State private var canPlayTTS: Bool = false
    @State private var canTakeQuiz: Bool = false
    @State private var canRetakeQuiz: Bool = false
    @State private var hasUnlimitedQuizAttempts: Bool = false
    @State private var canMentionAutocomplete: Bool = false
    @State private var hasUnlimitedBookmarks: Bool = false
    @State private var canViewBody: Bool = true
    @State private var canViewSources: Bool = true
    @State private var canViewTimeline: Bool = true
    /// A123 — comments.edit.own permission flag. When set + the comment
    /// belongs to the viewer + the row is within the server-enforced edit
    /// window, the comment row exposes an Edit affordance that PATCHes
    /// /api/comments/[id] with the new body. Server is still the
    /// authoritative window enforcer (refusing PATCHes past the deadline).
    @State private var canEditOwnComment: Bool = false
    // C2 — comments.section.view permission flag. When false, the
    // discussion tab body is replaced with a denial message.
    @State private var canViewComments: Bool = true
    // C3 — moderator permission flags for comment hide and supervisor flag.
    @State private var canHideComments: Bool = false
    @State private var canFlagComments: Bool = false
    // C1 — sort order for the discussion comment list. Mirrors web Top/Newest toggle.
    @State private var commentSortOrder: String = "top"
    @State private var editingCommentId: String? = nil
    @State private var editingCommentBody: String = ""
    @State private var editSaving: Bool = false

    // MARK: - State
    @State private var timeline: [TimelineEvent] = []
    @State private var sources: [SourceLink] = []
    @State private var comments: [VPComment] = []
    @State private var categoryName: String? = nil
    @State private var loading = true
    @State private var loadError: String? = nil
    // Transient inline-action errors (post-comment 200-with-error, vote
    // session-expired, vote network-failure) all surface via flashToast →
    // moderationToast overlay at the top of the view.

    // Tabs
    enum StoryTab: String, CaseIterable { case story = "Story", timeline = "Timeline", discussion = "Discussion" }
    @State private var activeTab: StoryTab = .story

    // Quiz (D1/D6/D8/D41 — server-graded via /api/quiz/start + /api/quiz/submit).
    // No correct-answer data ever lives on the client until /submit response.
    enum QuizStage { case idle, loading, answering, submitting, result }
    @State private var quizStage: QuizStage = .idle
    @State private var quizQuestions: [APIQuizQuestion] = []
    @State private var quizAnswers: [String: String] = [:]   // quiz_id -> selected option text
    @State private var quizCurrent = 0
    @State private var quizStartedAt: Date? = nil
    @State private var quizAttemptMeta: APIQuizAttemptMeta? = nil
    @State private var quizResult: APIQuizSubmitResponse? = nil
    @State private var quizError: String? = nil
    @State private var userPassedQuiz = false

    // Comments
    @State private var commentText = ""
    @State private var commentSubmitting = false
    // Comment rate-limit countdown. > 0 = button shows "Wait Ns" + disabled.
    // Replaces the old boolean `commentRateLimited`.
    @State private var commentRateRemainingSec: Int = 0
    @State private var commentRateTask: Task<Void, Never>? = nil
    // T12 — when a Reply is tapped on an existing comment, this holds the
    // parent comment so the composer can stamp `parent_id` on submit and
    // render an inline "Replying to @user" header with a cancel affordance.
    @State private var replyingTo: VPComment? = nil

    // Cancellable 350ms auto-advance after a quiz option tap. Cancelled on
    // option re-tap, on view disappear, and on stage transition.
    @State private var quizAdvanceTask: Task<Void, Never>? = nil
    // Agree/disagree reactions — one per user per comment, separate axis from tags.
    @State private var agreedComments: Set<String> = []
    @State private var disagreedComments: Set<String> = []

    // Section A — comment-tag chips (helpful, context, cite_needed, off_topic).
    // Per-comment per-kind cast set for the *current* user, plus public
    // helpful_count for the inline Helpful badge. context_tag_count already lives on VPComment.
    @State private var commentTagsByUser: [String: Set<String>] = [:]
    @State private var commentHelpfulCounts: [String: Int] = [:]
    @State private var commentTagBusyKey: String = ""
    @State private var tagOpenCommentId: String? = nil

    // D21: @mention autocomplete — paid tiers only.
    @State private var mentionSuggestions: [VPUser] = []
    @State private var mentionSearchTask: Task<Void, Never>?

    // EXPERT_THREADS Wave 5 — `@expert` picker + thread-mode state.
    // Picker fires when the user types `@expert` (broadcast trigger) or
    // `@expert_<partial>`. Mirrors web CommentComposer.tsx Wave 4b.
    @State private var expertPicker: ExpertPickerData? = nil
    @State private var expertPickerLoading: Bool = false
    /// Transient inline notice — picker rate-limit, duplicate-@, mention-cap.
    @State private var expertPickerNotice: String? = nil
    /// 60-sec composer-instance cache so legitimate open-close-reopen
    /// browsing of the picker doesn't false-positive the server's 10/min
    /// rate limit (spec §2 "Picker rate-limit composer UX").
    @State private var expertPickerCache: (at: Date, data: ExpertPickerData)? = nil

    // Thread-mode permissions cached on appear.
    @State private var canCloseOwnThread: Bool = false
    @State private var canModerateComments: Bool = false
    @State private var canAllowFollowup: Bool = false
    /// Per-thread asker reply counts and free-pass status for cap affordance.
    /// Keyed by `<rootId>:<askerId>:<expertId>`. Populated lazily from
    /// expert_thread_chains on first render.
    @State private var threadChainsByKey: [String: ThreadChainState] = [:]
    /// Server-rejected close attempts surface a countdown; this maps a
    /// root comment id to seconds remaining, decremented by a Task.
    @State private var closeCooldownByRoot: [String: Int] = [:]
    @State private var closeCooldownTasks: [String: Task<Void, Never>] = [:]

    // Pre-submit mute/ban state. Parity with web CommentComposer.jsx —
    // fetched on mount; when set, replaces the composer with an inline
    // banner pointing at the appeal page.
    @State private var muteState: MuteState? = nil

    // D29: Articles have no reactions. All reaction state removed.

    // Source expansion
    @State private var expandedSource: Int? = nil

    // Bookmarks
    @State private var isBookmarked = false
    @State private var bookmarkId: String? = nil
    @State private var showUpgradeAlert = false
    @State private var showSubscription = false
    // OwnersAudit Story Task 18 — anon Discussion tab → LoginView sheet
    @State private var showLogin = false
    // Registration wall sheet — triggered by anon bookmark or quiz CTA taps
    @State private var showRegistrationSheet = false

    // Expert filter
    @State private var expertFilterActive: Bool = false

    // Toasts
    @State private var showAchievementToast = false
    @State private var achievementToastText = ""

    // Apple Guideline 1.2 — Report Content + Block User on comments.
    @ObservedObject private var blocks = BlockService.shared
    @State private var reportTargetCommentId: String? = nil
    @State private var blockTargetUser: (id: String, username: String?)? = nil
    @State private var moderationToast: String? = nil
    // Article-level report (overflow menu in nav bar). Boolean drives the
    // confirmation dialog; the article id is `story.id` so no payload needed.
    @State private var showReportArticle: Bool = false

    // D17: TTS is now permission-gated (`article.tts.play`).
    @StateObject private var tts = TTSPlayer()

    // Push prompt — shown once after first quiz pass if status is .notDetermined.
    @ObservedObject private var push = PushPermission.shared
    @State private var showPushPrompt = false

    // D1: pass threshold is 3 out of 5. Used only for UX copy; server is the
    // authority on pass/fail (result.passed is what actually unlocks).
    private var passThreshold: Int {
        let total = quizQuestions.count
        return min(3, max(1, total))
    }

    // MARK: - Engagement polish state
    // Reading-progress ribbon, half-scroll quiz teaser, quiz-pass moment,
    // composer focus, and Up Next sheet. Each piece has a reduce-motion guard
    // (see `reduceMotion` env value) so the animations vanish when the OS
    // accessibility preference is set.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @FocusState private var composerFocused: Bool
    @State private var scrollOffset: CGFloat = 0
    @State private var contentHeight: CGFloat = 1
    @State private var viewportHeight: CGFloat = 1
    @State private var showPassBurst = false
    @State private var pointsDelta: Int? = nil
    @State private var pointsDeltaVisible = false
    @State private var showUpNext = false
    @State private var upNextStories: [Story] = []
    @State private var upNextRequested = false
    @State private var endOfArticleHit = false
    @State private var linkedArticle: Story? = nil

    // MARK: - Formatters (static to avoid per-render allocation)
    private static let muteDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f
    }()
    private static let displayDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMMM d, yyyy"
        return f
    }()
    private static let muteISOFmt: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let muteISOFmtFallback: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    /// A78 — preprocess article body for AVSpeechUtterance so the listener
    /// hears prose, not markdown punctuation. Operations (in order):
    ///   `[label](url)` → `label`           (links — drop href)
    ///   `**text**` / `__text__` → `text`    (bold)
    ///   `*text*` / `_text_` → `text`        (italic)
    ///   `` `code` `` → `code`               (inline code fences)
    ///   leading `#` markers on heading lines → stripped
    /// Best-effort regex preprocessor. Anything we miss reads literally,
    /// which is no worse than the previous baseline.
    static func stripMarkdownForTTS(_ input: String) -> String {
        var out = input
        // Inline code first — its delimiters don't conflict with the
        // other rules and can contain asterisks we don't want stripped.
        out = out.replacingOccurrences(
            of: "`([^`]+)`",
            with: "$1",
            options: .regularExpression
        )
        // [label](url) — links.
        out = out.replacingOccurrences(
            of: #"\[([^\]]+)\]\([^)]+\)"#,
            with: "$1",
            options: .regularExpression
        )
        // **bold** and __bold__.
        out = out.replacingOccurrences(
            of: #"\*\*([^*]+)\*\*"#,
            with: "$1",
            options: .regularExpression
        )
        out = out.replacingOccurrences(
            of: #"__([^_]+)__"#,
            with: "$1",
            options: .regularExpression
        )
        // *italic* and _italic_.
        out = out.replacingOccurrences(
            of: #"(?<!\*)\*([^*\n]+)\*(?!\*)"#,
            with: "$1",
            options: .regularExpression
        )
        out = out.replacingOccurrences(
            of: #"(?<!_)_([^_\n]+)_(?!_)"#,
            with: "$1",
            options: .regularExpression
        )
        // Heading prefixes ("# ", "## ", up to "###### ").
        out = out.replacingOccurrences(
            of: #"(?m)^#{1,6}\s+"#,
            with: "",
            options: .regularExpression
        )
        return out
    }

    // MARK: - Body
    var body: some View {
        VStack(spacing: 0) {
            tabBar
            readingProgressRibbon
            ScrollViewReader { proxy in
                ScrollView {
                    if let loadError = loadError {
                        VStack(spacing: 10) {
                            Text("We couldn't load this article — check your connection.")
                                .font(.system(.callout, design: .default, weight: .semibold))
                                .foregroundColor(VP.text)
                            Text(loadError)
                                .font(.footnote)
                                .foregroundColor(VP.dim)
                                .multilineTextAlignment(.center)
                            Button {
                                Task { await loadData() }
                            } label: {
                                Text("Try again")
                                    .font(.system(.subheadline, design: .default, weight: .semibold))
                                    .foregroundColor(VP.accent)
                            }
                            .padding(.top, 4)
                        }
                        .padding(.horizontal, 40)
                        .padding(.top, 60)
                    } else {
                        switch activeTab {
                        case .story:
                            storyContent
                                .background(
                                    GeometryReader { inner in
                                        Color.clear
                                            .preference(
                                                key: ArticleContentHeightKey.self,
                                                value: inner.size.height
                                            )
                                    }
                                )
                        case .timeline:
                            if canViewTimeline { timelineContent } else { timelineLockedPrompt }
                        case .discussion:
                            // OwnersAudit Story Task 18: Discussion tab is now
                            // visible to anonymous users so the product mechanic
                            // (earn the discussion) is discoverable. Tap → auth
                            // gate prompt; logged-in → real discussion content.
                            // C2 — comments.section.view denial (web parity).
                            if !canViewComments {
                                Text("Comments aren't available for your account.")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                                    .padding()
                                    .frame(maxWidth: .infinity)
                            } else if auth.isLoggedIn {
                                discussionContent
                            } else {
                                anonDiscussionPrompt
                            }
                        }
                    }
                }
                .background(
                    GeometryReader { outer in
                        Color.clear
                            .preference(
                                key: ArticleScrollOffsetKey.self,
                                value: -outer.frame(in: .named("storyScroll")).minY
                            )
                            .onAppear { viewportHeight = outer.size.height }
                            .onChange(of: outer.size.height) { _, h in viewportHeight = h }
                    }
                )
                .coordinateSpace(name: "storyScroll")
                .onPreferenceChange(ArticleScrollOffsetKey.self) { handleScrollOffset($0) }
                .onPreferenceChange(ArticleContentHeightKey.self) { contentHeight = max($0, 1) }
                .onChange(of: userPassedQuiz) { wasPassed, isPassed in
                    if !wasPassed && isPassed {
                        triggerQuizPassMoment(scrollProxy: proxy)
                    }
                }
                .background(VP.bg)
            }
        }
        .background(VP.bg)
        .sheet(isPresented: $showUpNext) { upNextSheet }
        .sheet(isPresented: Binding(
            get: { linkedArticle != nil },
            set: { if !$0 { linkedArticle = nil } }
        )) {
            if let s = linkedArticle {
                NavigationStack {
                    StoryDetailView(story: s).environmentObject(auth)
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if let slug = story.slug, let url = URL(string: "https://veritypost.com/story/\(slug)") {
                    ShareLink(item: url) {
                        Image(systemName: "square.and.arrow.up").foregroundColor(VP.dim)
                    }
                }
                // D13: bookmarks are free with a 10-cap; paid gets unlimited.
                // Spec: display "Save" / "Saved" text, not an icon.
                Button {
                    Task { await attemptBookmark() }
                } label: {
                    Text(isBookmarked ? "Following" : "Follow")
                        .font(.system(.footnote, design: .default, weight: .semibold))
                        .foregroundColor(isBookmarked ? VP.accent : VP.text)
                }
                .buttonStyle(.bordered)

                // Apple Guideline 1.2 — UGC requires "Report" on every piece
                // of user-visible content the app surfaces, including the
                // article itself. Overflow menu so it stays out of the way.
                Menu {
                    Button("Report article", role: .destructive) {
                        showReportArticle = true
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .foregroundColor(VP.dim)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("More options")
            }
        }
        .alert("Follow limit reached", isPresented: $showUpgradeAlert) {
            Button("See paid plans") { showSubscription = true }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("You\u{2019}ve hit the follow limit for free accounts. Upgrade to follow unlimited stories.")
        }
        .sheet(isPresented: $showSubscription) { SubscriptionView().environmentObject(auth) }
        .sheet(isPresented: $showRegistrationSheet) {
            RegistrationSheetView()
        }
        .sheet(isPresented: $showPushPrompt) {
            PushPromptSheet(
                title: "Stay informed",
                detail: "Get notified when stories you\u{2019}ve read break new developments.",
                onEnable: {
                    await push.requestIfNeeded()
                    if push.isOn, let uid = auth.currentUser?.id {
                        PushRegistration.shared.setCurrentUser(uid)
                    }
                },
                onDecline: {
                    push.markPrePromptDeclined()
                }
            )
        }
        // Apple Guideline 1.2 — Report Content / Block User affordances.
        .confirmationDialog(
            "Report comment",
            isPresented: Binding(
                get: { reportTargetCommentId != nil },
                set: { if !$0 { reportTargetCommentId = nil } }
            ),
            titleVisibility: .visible
        ) {
            ForEach(ReportReason.allCases) { reason in
                Button(reason.label) {
                    if let cid = reportTargetCommentId {
                        Task { await submitCommentReport(commentId: cid, reason: reason) }
                    }
                    reportTargetCommentId = nil
                }
            }
            Button("Cancel", role: .cancel) { reportTargetCommentId = nil }
        } message: {
            Text("Tell us why. A moderator will review it.")
        }
        .confirmationDialog(
            "Report article",
            isPresented: $showReportArticle,
            titleVisibility: .visible
        ) {
            ForEach(ReportReason.allCases) { reason in
                Button(reason.label) {
                    Task { await submitArticleReport(reason: reason) }
                }
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("Tell us why. Our team reviews these within 24 hours.")
        }
        .confirmationDialog(
            blockTargetUser.map { "Block @\($0.username ?? "user")?" } ?? "Block user?",
            isPresented: Binding(
                get: { blockTargetUser != nil },
                set: { if !$0 { blockTargetUser = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Block", role: .destructive) {
                if let target = blockTargetUser {
                    Task { await performBlock(targetId: target.id, username: target.username) }
                }
                blockTargetUser = nil
            }
            Button("Cancel", role: .cancel) { blockTargetUser = nil }
        } message: {
            Text("You won\u{2019}t see their comments or messages.")
        }
        .overlay(alignment: .top) {
            if let toast = moderationToast {
                Text(toast)
                    .font(.system(.footnote, design: .default, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: VP.radiusMD).fill(VP.accent))
                    .shadow(radius: 4)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.25), value: moderationToast)
        .overlay(alignment: .center) { quizPassBurst }
        .onDisappear {
            quizAdvanceTask?.cancel()
            commentRateTask?.cancel()
        }
        .task(id: story.id) { await loadData() }
        .task(id: story.id) { await loadUpNextStories() }
        .task(id: story.id) { await subscribeToNewComments() }
        .task { await push.refresh() }
        .task(id: perms.changeToken) {
            canPlayTTS = await PermissionService.shared.has("article.tts.play")
            canTakeQuiz = await PermissionService.shared.has("quiz.attempt.start")
            canRetakeQuiz = await PermissionService.shared.has("quiz.retake")
            hasUnlimitedQuizAttempts = await PermissionService.shared.has("quiz.retake.after_fail")
            canMentionAutocomplete = await PermissionService.shared.has("comments.mention.autocomplete")
            hasUnlimitedBookmarks = await PermissionService.shared.has("bookmarks.unlimited")
            // Anon parity with web (web/src/app/[slug]/page.tsx:335). Anon
            // visitors read article bodies unconditionally; the
            // `article.view.body` permission is reserved for the
            // signed-in paywall. Without this override anon iOS users
            // landed on "Upgrade to read this article" and could read
            // nothing.
            // `||` takes its RHS as a synchronous @autoclosure, so the
            // permission lookup must be hoisted out before the boolean
            // composition (Swift 6 concurrency: no `await` inside a sync
            // autoclosure).
            let hasBodyPerm = await PermissionService.shared.has("article.view.body")
            canViewBody = !auth.isLoggedIn || hasBodyPerm
            canViewSources = await PermissionService.shared.has("article.view.sources")
            canViewTimeline = await PermissionService.shared.has("article.view.timeline")
            canEditOwnComment = await PermissionService.shared.has("comments.edit.own")
            // C2 — comments.section.view
            canViewComments = await PermissionService.shared.has("comments.section.view")
            // C3 — moderator actions
            canHideComments = await PermissionService.shared.has("comments.moderate")
            canFlagComments = await PermissionService.shared.has("comments.flag")
            // EXPERT_THREADS Wave 5 — thread-mode permission keys (spec §2.5).
            // owner-mode short-circuits all of these per QA.md §8.4 Lock #10.
            canCloseOwnThread = await PermissionService.shared.has("comments.thread.close.own")
            canModerateComments = await PermissionService.shared.has("comments.moderate")
            canAllowFollowup = await PermissionService.shared.has("comments.expert_thread.allow_followup")
        }
        .onDisappear { tts.stop() }
        .overlay(alignment: .top) { toastOverlay }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.3), value: showAchievementToast)
    }

    // OwnersAudit Story Task 18: Discussion tab is now always visible
    // (anon, paid, free — same 3 tabs everywhere). Tab presence
    // surfaces the product mechanic; per-pane gating handles auth state.
    private var visibleTabs: [StoryTab] {
        StoryTab.allCases
    }

    // MARK: - Anon Discussion tab gate (Story Task 18)
    @ViewBuilder private var anonDiscussionPrompt: some View {
        VStack(spacing: 14) {
            Text("Earn the discussion.")
                .font(.system(.title3, design: .default, weight: .bold))
                .foregroundColor(VP.text)
            Text("Create a free account, pass the quiz, and join the conversation.")
                .font(.subheadline)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button {
                showLogin = true
            } label: {
                Text("Create free account")
                    .font(.system(.subheadline, design: .default, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 28)
                    .padding(.vertical, 12)
                    .frame(minHeight: 44)
                    .background(VP.accent)
                    .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
            Button {
                showLogin = true
            } label: {
                Text("Already have an account? Sign in")
                    .font(.footnote)
                    .foregroundColor(VP.accent)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
        .padding(.horizontal, 16)
        .sheet(isPresented: $showLogin) {
            LoginView().environmentObject(auth)
        }
    }

    // MARK: - Timeline locked (no permission)
    @ViewBuilder private var timelineLockedPrompt: some View {
        VStack(spacing: 12) {
            Text("Timeline is part of paid plans.")
                .font(.system(.subheadline, design: .default, weight: .semibold))
                .foregroundColor(VP.text)
            Text("See how this story developed across the day with sourced events.")
                .font(.footnote)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button {
                showSubscription = true
            } label: {
                Text("View plans")
                    .font(.system(.subheadline, design: .default, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 22)
                    .padding(.vertical, 10)
                    .frame(minHeight: 44)
                    .background(VP.accent)
                    .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
        .padding(.horizontal, 16)
    }

    // MARK: - Tab bar
    private var tabBar: some View {
        HStack(spacing: 0) {
            ForEach(visibleTabs, id: \.self) { tab in
                Button {
                    activeTab = tab
                } label: {
                    Text(tab.rawValue)
                        .font(.system(.footnote, design: .default, weight: activeTab == tab ? .semibold : .regular))
                        .foregroundColor(activeTab == tab ? VP.text : VP.dim)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .overlay(alignment: .bottom) {
                            Rectangle()
                                .fill(activeTab == tab ? VP.text : Color.clear)
                                .frame(height: 2)
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .overlay(alignment: .bottom) {
            Rectangle().fill(VP.rule).frame(height: 1)
        }
        .background(VP.bg)
    }

    // MARK: - Story content
    @ViewBuilder private var storyContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Category + badges
            HStack(spacing: 6) {
                Text((categoryName ?? "").uppercased())
                    .font(.system(.caption2, design: .default, weight: .semibold))
                    .tracking(1)
                    .foregroundColor(VP.accent)
                if story.isBreaking == true { badge("BREAKING", color: VP.breaking) }
                if story.isDeveloping == true { badge("DEVELOPING", color: VP.amber) }
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)

            // Title (serif)
            Text(story.title ?? "Untitled")
                .font(.system(.title, design: .serif, weight: .bold))
                .tracking(-0.5)
                .lineSpacing(2)
                .foregroundColor(VP.text)
                .padding(.horizontal, 20)
                .padding(.top, 12)

            // Summary
            if let summary = story.summary, !summary.isEmpty {
                Text(summary)
                    .font(.callout)
                    .foregroundColor(VP.soft)
                    .lineSpacing(3)
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
            }

            // Meta line — date · source count · estimated read time
            HStack(spacing: 8) {
                let dateStr = story.publishedAt.map(formatDate) ?? ""
                let srcCount = sources.count
                let metaLine: String = {
                    var parts: [String] = []
                    if !dateStr.isEmpty { parts.append(dateStr) }
                    if srcCount > 0 { parts.append("\(srcCount) source\(srcCount == 1 ? "" : "s")") }
                    parts.append("\(estimatedReadMinutes) min read")
                    return parts.joined(separator: " · ")
                }()
                Text(metaLine)
                    .font(.footnote)
                    .foregroundColor(VP.dim)
                Spacer()
                if canPlayTTS { ttsControls }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 24)

            if canViewBody {
                if let content = story.content, !content.isEmpty {
                    let paras = content.split(whereSeparator: \.isNewline).map(String.init).filter { !$0.isEmpty }
                    let mid = paras.count / 2
                    VStack(alignment: .leading, spacing: 16) {
                        ForEach(Array(paras.enumerated()), id: \.offset) { idx, p in
                            Text(p)
                                .font(.headline)
                                .foregroundColor(VP.text)
                                .lineSpacing(5)
                                .padding(.horizontal, 20)
                        }
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Upgrade to read this article")
                        .font(.system(.callout, design: .default, weight: .bold))
                        .foregroundColor(VP.text)
                    Text("Your current plan does not include full article access.")
                        .font(.footnote)
                        .foregroundColor(VP.dim)
                    Button {
                        showSubscription = true
                    } label: {
                        Text("Upgrade")
                            .font(.system(.footnote, design: .default, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 10)
                            .background(VP.accent)
                            .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
                    }
                }
                .padding(20)
            }

            if canViewSources && !sources.isEmpty { sourcePillsSection.padding(.top, 20) }

            // Quiz Gate Brand — make the moat visible at the end of every
            // article. Spec/12_QUIZ_GATE_BRAND.md: "always visible" CTA
            // describing the gate. Mirrors the web /story[slug] flow.
            // Anonymous: nudge to sign-in. Logged-in but not passed:
            // switch to Discussion tab (where the quiz player lives).
            // Already passed: skip — don't ask them to do it again.
            passToCommentCTA

            Spacer().frame(height: 80)
        }
    }

    @ViewBuilder private var passToCommentCTA: some View {
        let quizRequired = SettingsService.shared.commentBool("quiz_required")
        if quizRequired && !userPassedQuiz {
            VStack(alignment: .leading, spacing: 10) {
                Text("PASS TO COMMENT")
                    .font(.system(.caption2, design: .default, weight: .bold))
                    .tracking(1)
                    .foregroundColor(VP.dim)
                Text("5 questions about what you just read. Get 3 right and the conversation opens.")
                    .font(.callout)
                    .foregroundColor(VP.text)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
                if auth.isLoggedIn {
                    Button {
                        activeTab = .discussion
                    } label: {
                        Text("Start quiz")
                            .font(.system(.subheadline, design: .default, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .background(VP.accent)
                            .clipShape(RoundedRectangle(cornerRadius: VP.radiusSM))
                    }
                    .buttonStyle(.plain)
                } else {
                    Button {
                        showRegistrationSheet = true
                    } label: {
                        Text("Create free account")
                            .font(.system(.subheadline, design: .default, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .background(VP.accent)
                            .clipShape(RoundedRectangle(cornerRadius: VP.radiusSM))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(20)
            .background(
                RoundedRectangle(cornerRadius: VP.radiusMD)
                    .fill(VP.card)
            )
            .overlay(
                RoundedRectangle(cornerRadius: VP.radiusMD)
                    .stroke(VP.border, lineWidth: 1)
            )
            .padding(.horizontal, 20)
            .padding(.top, 28)
        }
    }

    // MARK: - TTS controls (D17, Verity+ only)
    //
    // Listen when idle, Pause/Resume + Stop when speaking. Matches the web
    // TTSButton layout in site/src/components/TTSButton.jsx.
    @ViewBuilder private var ttsControls: some View {
        if tts.isSpeaking {
            HStack(spacing: 6) {
                Button {
                    if tts.isPaused { tts.resume() } else { tts.pause() }
                } label: {
                    Text(tts.isPaused ? "Resume" : "Pause")
                        .font(.system(.caption, design: .default, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(VP.accent)
                        .clipShape(RoundedRectangle(cornerRadius: VP.radiusSM))
                }
                .buttonStyle(.plain)
                Button {
                    tts.stop()
                } label: {
                    Text("Stop")
                        .font(.system(.caption, design: .default, weight: .semibold))
                        .foregroundColor(VP.text)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .overlay(
                            RoundedRectangle(cornerRadius: VP.radiusSM)
                                .stroke(VP.border, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
            }
        } else {
            Button {
                // A78 — strip markdown before handing to AVSpeechUtterance.
                // The raw body would otherwise be read with literal
                // asterisks and bracketed link syntax. Web doesn't TTS,
                // so this is iOS-only.
                let raw = "\(story.title ?? ""). \(story.content ?? "")"
                let spoken = StoryDetailView.stripMarkdownForTTS(raw)
                tts.start(spoken)
            } label: {
                Text("Listen")
                    .font(.system(.caption, design: .default, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(VP.accent)
                    .clipShape(RoundedRectangle(cornerRadius: VP.radiusSM))
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Source list (expandable cards w/ outlet glyph)
    // Replaces the old single-row pill scroller with a vertical stack of
    // tap-to-expand cards. Each card shows an SF-Symbol-backed favicon
    // placeholder seeded from the outlet name's first letter, the outlet
    // label, and (when expanded) the cited headline + a Link that opens the
    // source URL in Safari via the system handler (matches the project's
    // existing UIApplication.shared.open pattern — no new dependency).
    private var sourcePillsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("SOURCES")
                .font(.system(.caption2, design: .default, weight: .bold))
                .tracking(1)
                .foregroundColor(VP.dim)
                .padding(.horizontal, 20)
            VStack(spacing: 8) {
                ForEach(Array(sources.enumerated()), id: \.element.id) { i, src in
                    sourceCard(index: i, src: src)
                }
            }
            .padding(.horizontal, 20)
        }
    }

    private func sourceCard(index i: Int, src: SourceLink) -> some View {
        let isOpen = expandedSource == i
        let outlet = src.outletName ?? "Source"
        let glyph = String(outlet.first.map { String($0) } ?? "S").uppercased()
        return VStack(alignment: .leading, spacing: 0) {
            Button {
                if reduceMotion {
                    expandedSource = isOpen ? nil : i
                } else {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        expandedSource = isOpen ? nil : i
                    }
                }
            } label: {
                HStack(spacing: 10) {
                    ZStack {
                        Circle()
                            .fill(VP.accent.opacity(0.08))
                        Text(glyph)
                            .font(.system(.caption, design: .default, weight: .bold))
                            .foregroundColor(VP.accent)
                    }
                    .frame(width: 24, height: 24)
                    .accessibilityHidden(true)
                    Text(outlet)
                        .font(.system(.footnote, design: .default, weight: .semibold))
                        .foregroundColor(VP.text)
                    Spacer()
                    Image(systemName: isOpen ? "chevron.up" : "chevron.down")
                        .font(.system(size: VP.Size.xs, weight: .semibold))
                        .foregroundColor(VP.dim)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(outlet) source. \(isOpen ? "Collapse" : "Expand")")

            if isOpen {
                VStack(alignment: .leading, spacing: 6) {
                    if let h = src.headline, !h.isEmpty {
                        Text(h)
                            .font(.system(.subheadline, design: .serif, weight: .semibold))
                            .foregroundColor(VP.text)
                    }
                    if let u = src.url, let url = URL(string: u) {
                        Link(destination: url) {
                            HStack(spacing: 4) {
                                Text("Read on \(outlet)")
                                Image(systemName: "arrow.up.right")
                                    .font(.system(size: VP.Size.xs, weight: .semibold))
                            }
                            .font(.system(.caption, design: .default, weight: .semibold))
                            .foregroundColor(VP.accent)
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .transition(reduceMotion ? .opacity : .opacity.combined(with: .move(edge: .top)))
            }
        }
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
    }

    // MARK: - Timeline content
    @ViewBuilder private var timelineContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("TIMELINE")
                .font(.system(.caption2, design: .default, weight: .semibold))
                .tracking(1)
                .foregroundColor(VP.dim)
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 16)

            if timeline.isEmpty {
                Text("No timeline for this story.")
                    .font(.caption)
                    .foregroundColor(VP.dim)
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
            } else {
                let hasExplicit = timeline.contains(where: { $0.isCurrent == true })
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(timeline.enumerated()), id: \.element.id) { idx, ev in
                        timelineRow(
                            event: ev,
                            isCurrent: ev.isCurrent == true || (!hasExplicit && idx == timeline.count - 1),
                            isLast: idx == timeline.count - 1
                        )
                    }
                }
                .padding(.horizontal, 20)
            }
            Spacer().frame(height: 80)
        }
    }

    private func timelineRow(event: TimelineEvent, isCurrent: Bool, isLast: Bool) -> some View {
        Group {
            if event.type == "article", let articleId = event.linkedArticleId {
                // Article-type entry: tappable, disclosure indicator, no date dot.
                Button {
                    Task {
                        if let story = await fetchStoryByArticleId(articleId) {
                            linkedArticle = story
                        }
                    }
                } label: {
                    HStack(alignment: .top, spacing: 14) {
                        VStack(spacing: 0) {
                            Circle().fill(VP.accent.opacity(0.35)).frame(width: 8, height: 8)
                            if !isLast {
                                Rectangle().fill(VP.tlLine).frame(width: 1).frame(maxHeight: .infinity)
                            }
                        }
                        .frame(width: 14)

                        VStack(alignment: .leading, spacing: 4) {
                            Text(event.text ?? event.summary ?? "")
                                .font(.subheadline)
                                .foregroundColor(VP.text)
                                .lineSpacing(3)
                                .multilineTextAlignment(.leading)
                            Text("Read this coverage")
                                .font(.caption)
                                .foregroundColor(VP.dim)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.bottom, 22)

                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundColor(VP.dim)
                            .padding(.top, 2)
                    }
                }
                .buttonStyle(.plain)
            } else {
                // Standard event-type entry: static, date dot.
                HStack(alignment: .top, spacing: 14) {
                    VStack(spacing: 0) {
                        if isCurrent {
                            Circle()
                                .fill(VP.bg)
                                .frame(width: 12, height: 12)
                                .overlay(Circle().stroke(VP.accent, lineWidth: 2))
                        } else {
                            Circle().fill(VP.dim).frame(width: 8, height: 8)
                        }
                        if !isLast {
                            Rectangle().fill(VP.tlLine).frame(width: 1).frame(maxHeight: .infinity)
                        }
                    }
                    .frame(width: 14)

                    VStack(alignment: .leading, spacing: 4) {
                        if isCurrent {
                            Text("NOW")
                                .font(.system(.caption2, design: .default, weight: .bold))
                                .tracking(1)
                                .foregroundColor(VP.accent)
                        }
                        Text(event.eventDate.map { formatDate($0) } ?? "")
                            .font(.system(.caption, design: .default, weight: .regular))
                            .foregroundColor(VP.dim)
                        Text(event.text ?? event.summary ?? "")
                            .font(.subheadline)
                            .foregroundColor(VP.soft)
                            .lineSpacing(3)
                    }
                    .padding(.bottom, 22)
                }
            }
        }
    }

    // MARK: - Discussion content
    @ViewBuilder private var discussionContent: some View {
        let quizRequired = SettingsService.shared.commentBool("quiz_required")
        let gated = quizRequired && !userPassedQuiz

        VStack(alignment: .leading, spacing: 0) {
            if gated {
                quizPlayer()
            } else {
                discussionBody
            }
            Spacer().frame(height: 80)
        }
    }

    // MARK: - Quiz player (D1/D6/D8/D41 — server-graded via /api/quiz/*)
    // Stages: idle → loading → answering (one-at-a-time, click-to-advance,
    // 350ms settle per ArticleQuiz.jsx) → submitting → result.
    @ViewBuilder private func quizPlayer() -> some View {
        VStack(alignment: .leading, spacing: 16) {
            quizHeader
            switch quizStage {
            case .idle, .loading:
                quizIdleCard
            case .answering, .submitting:
                quizAnsweringCard
            case .result:
                quizResultCard
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
    }

    private var quizHeader: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("BEFORE YOU DISCUSS")
                    .font(.system(.caption2, design: .default, weight: .bold))
                    .tracking(1)
                    .foregroundColor(VP.dim)
                if quizStage == .answering || quizStage == .submitting {
                    Text("\(passThreshold) of \(quizQuestions.count) correct to join the discussion")
                        .font(.caption)
                        .foregroundColor(VP.soft)
                }
            }
            Spacer()
            if !quizQuestions.isEmpty {
                HStack(spacing: 5) {
                    ForEach(0..<quizQuestions.count, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 3)
                            .fill(dotColor(for: i))
                            .frame(width: 10, height: 5)
                            .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: quizCurrent)
                    }
                }
            }
        }
    }

    @ViewBuilder private var quizIdleCard: some View {
        HStack(alignment: .top, spacing: 0) {
            // Leading accent bar
            Rectangle()
                .fill(VP.accent)
                .frame(width: 3)
                .cornerRadius(2)
            VStack(alignment: .leading, spacing: 10) {
                // Voice unified with the Article-tab `passToCommentCTA` per
                // adversary review — single phrase across both entry points
                // so readers don't see two flavors of the same mechanic.
                Text("Pass to comment.")
                    .font(.headline)
                    .foregroundColor(VP.text)
                Text("5 questions about what you just read. Get 3 right and the conversation opens.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineSpacing(2)
                if let err = quizError {
                    Text(err).font(.caption).foregroundColor(VP.wrong)
                }
                if canTakeQuiz {
                    Button {
                        Task { await startQuiz() }
                    } label: {
                        Text(quizStage == .loading
                             ? "Starting quiz…"
                             : (quizError != nil ? "Try again" : "Take the quiz"))
                            .font(.system(.subheadline, design: .default, weight: .bold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(VP.accent)
                            .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
                    }
                    .disabled(quizStage == .loading)
                    .buttonStyle(.plain)
                    .padding(.top, 4)
                }
            }
            .padding(16)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(VP.card)
        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
        .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.accent.opacity(0.35), lineWidth: 1.5))
        .clipped()
    }

    @ViewBuilder private var quizAnsweringCard: some View {
        let qi = quizCurrent
        if qi < quizQuestions.count {
            let q = quizQuestions[qi]
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Question \(qi + 1) of \(quizQuestions.count)")
                        .font(.system(.caption, design: .default, weight: .bold))
                        .foregroundColor(VP.dim)
                    Spacer()
                    if !hasUnlimitedQuizAttempts, let used = quizAttemptMeta?.attempts_used, let max = quizAttemptMeta?.max_attempts {
                        Text("\(used) of \(max) used")
                            .font(.caption)
                            .foregroundColor(VP.dim)
                    }
                }
                Text(q.question_text)
                    .font(.system(.callout, design: .default, weight: .semibold))
                    .foregroundColor(VP.text)
                ForEach(Array(q.options.enumerated()), id: \.offset) { oi, opt in
                    quizOption(quizId: q.id, oi: oi, text: opt.text)
                }
                if quizStage == .submitting {
                    Text("Grading…").font(.caption).foregroundColor(VP.dim)
                }
                if let err = quizError {
                    HStack(spacing: 8) {
                        Text(err).font(.caption).foregroundColor(VP.wrong)
                        Button {
                            Task { await submitQuiz() }
                        } label: {
                            Text("Try again")
                                .font(.system(.caption, design: .default, weight: .semibold))
                                .foregroundColor(VP.accent)
                        }
                        .buttonStyle(.plain)
                        .disabled(quizStage == .submitting)
                    }
                }
            }
        }
    }

    @ViewBuilder private var quizResultCard: some View {
        if let r = quizResult {
            VStack(alignment: .leading, spacing: 12) {
                Text(r.passed
                     ? "Passed — \(r.correct) of \(r.total). Discussion unlocked."
                     : "Scored \(r.correct) of \(r.total). Needed \(passThreshold) to pass.")
                    .font(.headline)
                    .foregroundColor(r.passed ? VP.right : VP.text)
                if let pct = r.percentile {
                    Text("Better than \(pct)% of readers on this article.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                if !hasUnlimitedQuizAttempts, let remaining = r.attempts_remaining, !r.passed {
                    Text("You have \(remaining) attempt\(remaining == 1 ? "" : "s") left.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                // D41: per-question breakdown with explanations, every attempt.
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(r.results) { row in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(row.question_text)
                                .font(.system(.footnote, design: .default, weight: .semibold))
                                .foregroundColor(VP.text)
                            if row.is_correct {
                                Label("Correct", systemImage: "checkmark.circle.fill")
                                    .font(.system(.caption, design: .default, weight: .semibold))
                                    .foregroundColor(VP.right)
                            } else {
                                let correctText = row.options.indices.contains(row.correct_answer)
                                    ? row.options[row.correct_answer].text : ""
                                Label("Correct: \(correctText)", systemImage: "xmark.circle.fill")
                                    .font(.system(.caption, design: .default, weight: .semibold))
                                    .foregroundColor(VP.wrong)
                            }
                            if let ex = row.explanation, !ex.isEmpty {
                                Text(ex)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                    .lineSpacing(2)
                            }
                        }
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
                    }
                }

                if !r.passed {
                    let outOfAttempts = !hasUnlimitedQuizAttempts && (r.attempts_remaining ?? 0) == 0
                    if outOfAttempts {
                        Text("You've used both free attempts. Upgrade for unlimited retakes.")
                            .font(.footnote)
                            .foregroundColor(VP.text)
                        Button { showSubscription = true } label: {
                            Text("View plans")
                                .font(.system(.subheadline, design: .default, weight: .bold))
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(VP.accent)
                                .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
                        }
                        .buttonStyle(.plain)
                    } else if canRetakeQuiz {
                        Button {
                            Task { await startQuiz() }
                        } label: {
                            Text("Retake with fresh questions")
                                .font(.system(.subheadline, design: .default, weight: .bold))
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(VP.accent)
                                .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
            .overlay(
                RoundedRectangle(cornerRadius: VP.radiusMD)
                    .stroke(r.passed ? VP.right.opacity(0.4) : Color(.systemRed).opacity(0.3), lineWidth: 1)
            )
        }
    }

    private func dotColor(for i: Int) -> Color {
        if quizStage == .result, let rows = quizResult?.results, i < rows.count {
            return rows[i].is_correct ? VP.right : VP.wrong
        }
        if i == quizCurrent && (quizStage == .answering || quizStage == .submitting) {
            return VP.accent
        }
        if i < quizQuestions.count, quizAnswers[quizQuestions[i].id] != nil {
            return VP.accent.opacity(0.4)
        }
        return Color(.systemGray5)
    }

    private func quizOption(quizId: String, oi: Int, text: String) -> some View {
        let answered = quizAnswers[quizId] != nil
        let selected = quizAnswers[quizId] == text
        return Button {
            guard !answered, quizStage == .answering else { return }
            // Subtle selection haptic on every answer tap. Apple recommends
            // .selectionChanged for "value-picker"-style discrete choices,
            // which matches how the quiz reads (one of N options per card).
            UISelectionFeedbackGenerator().selectionChanged()
            quizAnswers[quizId] = text
            let isLast = quizCurrent >= quizQuestions.count - 1
            // Match web ArticleQuiz: 350ms settle, then auto-advance or submit.
            // Cancellable so a re-tap, view disappear, or stage transition
            // doesn't trigger a stale advance/submit.
            quizAdvanceTask?.cancel()
            quizAdvanceTask = Task { @MainActor in
                try? await Task.sleep(nanoseconds: 350_000_000)
                if Task.isCancelled { return }
                guard quizStage == .answering else { return }
                if isLast {
                    Task { await submitQuiz() }
                } else {
                    quizCurrent += 1
                }
            }
        } label: {
            HStack(spacing: 10) {
                // Letter badge
                Text(["A", "B", "C", "D"][min(oi, 3)])
                    .font(.system(.caption, design: .default, weight: .semibold))
                    .foregroundColor(selected ? VP.accent : .secondary)
                    .frame(width: 24, height: 24)
                    .background(selected ? Color.white : Color.primary.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: VP.radiusXS))
                Text(text)
                    .foregroundColor(selected ? .white : VP.text)
                    .font(.system(.subheadline, design: .default, weight: selected ? .semibold : .regular))
                    .multilineTextAlignment(.leading)
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
            .frame(minHeight: 44)
            .background(selected ? VP.accent : Color(.secondarySystemBackground))
            .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(selected ? VP.accent : VP.border, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
            .opacity(answered && !selected ? 0.35 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: selected)
        }
        .buttonStyle(.plain)
        .disabled(answered || quizStage != .answering)
    }

    // MARK: - Discussion body
    @ViewBuilder private var discussionBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 10) {
                Text("DISCUSSION")
                    .font(.system(.caption2, design: .default, weight: .bold))
                    .tracking(1)
                    .foregroundColor(VP.dim)
                if comments.contains(where: { $0.isExpertReply == true }) {
                    Button {
                        expertFilterActive.toggle()
                    } label: {
                        Text(expertFilterActive ? "Expert · showing only" : "Expert")
                            .font(.system(.caption, design: .default, weight: .semibold))
                            .foregroundColor(expertFilterActive ? Color(hex: "#16a34a") : VP.dim)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(
                                RoundedRectangle(cornerRadius: VP.radiusFull)
                                    .fill(expertFilterActive ? Color(hex: "#16a34a").opacity(0.10) : Color.clear)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: VP.radiusFull)
                                    .stroke(expertFilterActive ? Color(hex: "#16a34a") : VP.border, lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
                // C1 — Top / Newest sort toggle (web parity).
                Picker("Sort", selection: $commentSortOrder) {
                    Text("Top").tag("top")
                    Text("Newest").tag("newest")
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 160)
            }
            .padding(.top, 20)
            .padding(.horizontal, 20)

            if !auth.isLoggedIn {
                Text("Sign in to join the discussion.")
                    .font(.footnote)
                    .foregroundColor(VP.soft)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(VP.card)
                    .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.border))
                    .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
            } else {
                composer
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                    .id("composer")
            }

            // Comments
            if comments.isEmpty {
                Text("No comments yet. Be the first to share your thoughts.")
                    .font(.footnote)
                    .foregroundColor(VP.dim)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                    .padding(.horizontal, 20)
            } else {
                threadedCommentList
                    .padding(.top, 8)
            }
        }
    }

    /// T12 — flatten the visible comments into a depth-aware render order.
    /// Top-level comments: pinned first, then newest. Replies under each
    /// top-level are ordered by created_at ascending (chronological thread read).
    /// Apple Guideline 1.2 — bidirectional block filter applied before
    /// threading so blocked-user replies don't reveal parent thread structure.
    private var threadedCommentList: some View {
        let unblocked = comments.filter { !blocks.isBlocked($0.userId) }
        let visible = expertFilterActive
            ? unblocked.filter { $0.isExpertReply == true }
            : unblocked
        var childrenByParent: [String: [VPComment]] = [:]
        var topLevel: [VPComment] = []
        for c in visible {
            if let pid = c.parentId, !pid.isEmpty {
                childrenByParent[pid, default: []].append(c)
            } else {
                topLevel.append(c)
            }
        }
        for key in childrenByParent.keys {
            childrenByParent[key]?.sort { (a, b) in
                (a.createdAt ?? .distantPast) < (b.createdAt ?? .distantPast)
            }
        }
        // C1 — apply Top / Newest sort to top-level comments.
        // Pinned comments always surface first regardless of sort mode.
        // "Top" sorts non-pinned by upvoteCount descending; "Newest"
        // sorts by createdAt descending (mirrors web CommentThread sort).
        topLevel.sort { (a, b) in
            let aPinned = a.isPinned == true || a.isContextPinned == true
            let bPinned = b.isPinned == true || b.isContextPinned == true
            if aPinned != bPinned { return aPinned }
            if commentSortOrder == "newest" {
                return (a.createdAt ?? .distantPast) > (b.createdAt ?? .distantPast)
            } else {
                return (a.upvoteCount ?? 0) > (b.upvoteCount ?? 0)
            }
        }
        var ordered: [(VPComment, Int)] = []
        func walk(_ c: VPComment, depth: Int) {
            ordered.append((c, min(depth, StoryDetailView.maxThreadDepth)))
            for child in childrenByParent[c.id] ?? [] {
                walk(child, depth: depth + 1)
            }
        }
        for top in topLevel { walk(top, depth: 0) }

        return VStack(spacing: 0) {
            ForEach(ordered, id: \.0.id) { entry in
                commentRow(entry.0, depth: entry.1)
            }
        }
    }

    /// Web parity: depth cap matches the iOS-side product decision (2) and
    /// keeps the render list stable when threads grow long. Beyond depth 2,
    /// further replies render at depth-2 indent without additional nesting.
    private static let maxThreadDepth = 2

    // MARK: - Mute state (pre-submit banner)
    struct MuteState: Equatable {
        let banned: Bool
        let mutedUntil: Date?
    }

    @ViewBuilder private var composer: some View {
        if let mute = muteState {
            muteBanner(mute)
        } else {
            activeComposer
        }
    }

    private func muteBanner(_ mute: MuteState) -> some View {
        let untilText: String = {
            if mute.banned { return "indefinitely — your account is banned." }
            if let until = mute.mutedUntil {
                return "until \(StoryDetailView.muteDateFormatter.string(from: until))."
            }
            return "."
        }()
        return VStack(alignment: .leading, spacing: 6) {
            Text("You can't post comments right now.")
                .font(.system(.footnote, design: .default, weight: .bold))
                .foregroundColor(Color(hex: "991b1b"))
            Text("Posting is blocked \(untilText)")
                .font(.footnote)
                .foregroundColor(Color(hex: "991b1b"))
            if !mute.banned {
                Link(
                    "File an appeal",
                    destination: SupabaseManager.shared.siteURL.appendingPathComponent("appeal")
                )
                .font(.system(.footnote, design: .default, weight: .bold))
                .foregroundColor(Color(hex: "991b1b"))
                .underline()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color(hex: "fef2f2"))
        .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.failBorder))
        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
    }

    private var activeComposer: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Post-quiz composer headline. Pre-quiz, the discussion section is
            // rendered as the locked quiz player so this branch never runs;
            // once the user has passed, the headline confirms they unlocked it.
            if userPassedQuiz {
                Text("What did you think?")
                    .font(.system(.subheadline, design: .default, weight: .bold))
                    .foregroundColor(VP.text)
                    .padding(.bottom, 8)
            }

            // T12 — reply context header. Surfaces which comment the next
            // post will reply to; cancel reverts to a top-level post.
            if let parent = replyingTo {
                HStack(spacing: 8) {
                    Text("Replying to ")
                        .font(.caption)
                        .foregroundColor(VP.dim)
                    + Text("@\(parent.users?.username ?? "user")")
                        .font(.system(.caption, design: .default, weight: .semibold))
                        .foregroundColor(VP.text)
                    Spacer()
                    Button {
                        replyingTo = nil
                    } label: {
                        Text("Cancel")
                            .font(.system(.caption, design: .default, weight: .semibold))
                            .foregroundColor(VP.accent)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.bottom, 8)
            }

            // D21: paid-only @mention autocomplete dropdown.
            if canMentionAutocomplete && !mentionSuggestions.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(mentionSuggestions) { u in
                        Button {
                            applyMention(u)
                        } label: {
                            HStack(spacing: 8) {
                                AvatarView(user: u, size: 22)
                                Text("@\(u.username ?? "")")
                                    .font(.system(.footnote, design: .default, weight: .semibold))
                                    .foregroundColor(VP.text)
                                if let score = u.verityScore {
                                    Text("\(score)")
                                        .font(.caption)
                                        .foregroundColor(VP.dim)
                                }
                                Spacer()
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                        }
                        .buttonStyle(.plain)
                        Divider().background(VP.border)
                    }
                }
                .background(VP.bg)
                .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.border))
                .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
                .padding(.bottom, 8)
            }

            // EXPERT_THREADS Wave 5 — `@expert` picker. Broadcast button at
            // top + directed list of currently-active experts in the
            // article's category. Server-side filtering already excludes
            // paused / quiet-hours / at-quota experts.
            if let picker = expertPicker {
                expertPickerOverlay(picker)
            }
            // Transient inline notice (rate-limit, duplicate, cap-hit).
            if let notice = expertPickerNotice {
                Text(notice)
                    .font(.caption)
                    .foregroundColor(VP.warn)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(VP.warnSoft)
                    .overlay(RoundedRectangle(cornerRadius: VP.radiusSM).stroke(VP.warn.opacity(0.4)))
                    .clipShape(RoundedRectangle(cornerRadius: VP.radiusSM))
                    .padding(.bottom, 8)
            }

            HStack(alignment: .top, spacing: 10) {
                AvatarView(user: auth.currentUser, size: 32)
                VStack(alignment: .leading, spacing: 8) {
                    TextField("Join the discussion…", text: $commentText, axis: .vertical)
                        .font(.subheadline)
                        .foregroundColor(VP.text)
                        .lineLimit(1...4)
                        .focused($composerFocused)
                        .submitLabel(.send)
                        .onSubmit {
                            // Return-key submit. Multi-line entries can still
                            // grow because TextField is axis: .vertical — the
                            // submit binding fires only on a literal Return on
                            // the keyboard, not on Shift+Return-style breaks.
                            Task { await postComment() }
                        }
                        .toolbar {
                            ToolbarItemGroup(placement: .keyboard) {
                                Spacer()
                                Button("Done") { composerFocused = false }
                                    .foregroundColor(VP.accent)
                            }
                        }
                        .onChange(of: commentText) { _, new in
                            handleMentionChange(new)
                        }
                        .padding(10)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
                    HStack {
                        Spacer()
                        Button {
                            Task { await postComment() }
                        } label: {
                            Text(commentSubmitting ? "Posting…" : (commentRateRemainingSec > 0 ? "Wait \(commentRateRemainingSec)s" : "Post"))
                                .font(.system(.subheadline, design: .default, weight: .semibold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 18)
                                .padding(.vertical, 8)
                                .background(
                                    Capsule().fill(
                                        commentText.trimmingCharacters(in: .whitespaces).isEmpty || commentRateRemainingSec > 0
                                        ? VP.muted : VP.accent
                                    )
                                )
                        }
                        .buttonStyle(.plain)
                        .disabled(commentText.trimmingCharacters(in: .whitespaces).isEmpty || commentSubmitting || commentRateRemainingSec > 0)
                    }
                }
            }
            .padding(16)
            .background(VP.card)
            .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.border))
            .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
        }
    }

    /// D21: only runs for viewers with `comments.mention.autocomplete`.
    /// Extracts the trailing @token (if any) and queries the users table
    /// for prefix matches. Users without the permission can still type
    /// @username as plain text.
    ///
    /// EXPERT_THREADS Wave 5 — extended to detect `@expert` (broadcast) and
    /// `@expert_<partial>` (directed) triggers. Both route to the expert
    /// picker via /api/expert/picker. The bare-mention picker only fires
    /// for non-expert tokens. Spec §2 "Mention syntax + autocomplete".
    private func handleMentionChange(_ text: String) {
        // Any keystroke clears the transient picker notice — toasts attach
        // to the previous attempt, not the next one.
        if expertPickerNotice != nil { expertPickerNotice = nil }

        guard let token = currentMentionToken(text) else {
            mentionSuggestions = []
            expertPicker = nil
            mentionSearchTask?.cancel()
            return
        }

        // Expert trigger: bare `@expert` (token == "expert", no underscore)
        // OR `@expert_<partial>`. Anything else routes to the bare picker.
        if token == "expert" || token.hasPrefix("expert_") {
            mentionSuggestions = []
            mentionSearchTask?.cancel()
            mentionSearchTask = Task {
                try? await Task.sleep(nanoseconds: 180_000_000)
                if Task.isCancelled { return }
                await fetchExpertPicker()
            }
            return
        }

        guard canMentionAutocomplete else {
            mentionSuggestions = []
            expertPicker = nil
            return
        }
        guard !token.isEmpty else {
            mentionSuggestions = []
            expertPicker = nil
            mentionSearchTask?.cancel()
            return
        }
        mentionSearchTask?.cancel()
        mentionSearchTask = Task {
            // Tiny debounce so we don't spam PostgREST on every keystroke.
            try? await Task.sleep(nanoseconds: 180_000_000)
            if Task.isCancelled { return }
            do {
                // Round 6 iOS-DATA: drop phantom columns `plan`, `role`,
                // `avatar` from the select. `plan` is a computed accessor
                // over the joined `plans` table (not a column on `users`);
                // `role` isn't a column on `users`; `avatar` is rendered
                // from `avatar_color` + username fallback via AvatarView.
                // The mention autocomplete UI only reads username, verity
                // score, and avatar_color, so the minimal select suffices.
                let matches: [VPUser] = try await client.from("users")
                    .select("id, username, is_verified_public_figure, verity_score, avatar_color")
                    .ilike("username", pattern: "\(token)%")
                    .limit(6)
                    .execute().value
                await MainActor.run {
                    mentionSuggestions = matches
                    expertPicker = nil
                }
            } catch {
                await MainActor.run { mentionSuggestions = [] }
            }
        }
    }

    /// EXPERT_THREADS Wave 5 — fetch the expert picker payload from
    /// /api/expert/picker?article_id=<uuid>. Honors the 60-sec composer-
    /// instance cache; on rate-limit (429) shows the spec-mandated toast.
    private func fetchExpertPicker() async {
        // Cache hit: serve and skip the network round-trip.
        if let cached = expertPickerCache, Date().timeIntervalSince(cached.at) < 60 {
            await MainActor.run { expertPicker = cached.data }
            return
        }
        guard let session = try? await client.auth.session else { return }
        let site = SupabaseManager.shared.siteURL
        guard var components = URLComponents(url: site.appendingPathComponent("api/expert/picker"), resolvingAgainstBaseURL: false) else { return }
        components.queryItems = [URLQueryItem(name: "article_id", value: story.id)]
        guard let url = components.url else { return }
        var req = URLRequest(url: url)
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        await MainActor.run { expertPickerLoading = true }
        defer { Task { @MainActor in expertPickerLoading = false } }
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse else { return }
            if http.statusCode == 404 {
                // Kill switch off — silent fall-through (no expert picker
                // surface visible). Spec §2 "Empty active list = broadcast
                // button only" doesn't apply here; 404 means the feature
                // hasn't shipped to users yet.
                await MainActor.run { expertPicker = nil }
                return
            }
            if http.statusCode == 429 {
                await MainActor.run {
                    expertPicker = nil
                    expertPickerNotice = "easy on the search — try again in a sec"
                }
                return
            }
            if http.statusCode != 200 {
                await MainActor.run { expertPicker = nil }
                return
            }
            let decoded = try JSONDecoder().decode(ExpertPickerData.self, from: data)
            await MainActor.run {
                expertPicker = decoded
                expertPickerCache = (Date(), decoded)
            }
        } catch {
            await MainActor.run { expertPicker = nil }
        }
    }

    /// Insert `@expert ` (sentinel) at the cursor. Spec §2 "Token in body:
    /// sentinel `@expert` for broadcast."
    private func applyExpertBroadcast() {
        guard let atIdx = commentText.lastIndex(of: "@") else { return }
        let prefix = String(commentText[..<atIdx])
        commentText = prefix + "@expert "
        expertPicker = nil
    }

    /// Insert `@expert_<username> ` for directed mentions. Spec §2 "Token
    /// in body: `@expert_<username>` for directed." Duplicate-@-same-expert
    /// rejected with the spec-mandated lowercase copy (composer-side guard;
    /// server enforces the same in post_comment).
    private func applyExpertDirected(_ username: String) {
        // Case-insensitive exact-token match — the server guards on the
        // same shape and surfaces the same lowercase rejection.
        let token = "@expert_\(username)"
        let body = commentText.lowercased()
        let target = token.lowercased()
        // Word-boundary check: token preceded by start/whitespace and
        // followed by whitespace/end. A trailing partial like
        // "@expert_mariana" should NOT match "@expert_maria".
        if let range = body.range(of: target, options: [.caseInsensitive]) {
            let before = range.lowerBound > body.startIndex
                ? body[body.index(before: range.lowerBound)]
                : Character(" ")
            let after = range.upperBound < body.endIndex
                ? body[range.upperBound]
                : Character(" ")
            let bIsBoundary = before.isWhitespace || before == "\n"
            let aIsBoundary = after.isWhitespace || after == "\n"
            if bIsBoundary && aIsBoundary {
                expertPickerNotice = "you've already @'d this expert in this comment."
                expertPicker = nil
                return
            }
        }
        guard let atIdx = commentText.lastIndex(of: "@") else { return }
        let prefix = String(commentText[..<atIdx])
        commentText = prefix + token + " "
        expertPicker = nil
    }

    private func currentMentionToken(_ text: String) -> String? {
        // Last "@" after whitespace or start, with no space between.
        guard let atIdx = text.lastIndex(of: "@") else { return nil }
        let afterAt = text.index(after: atIdx)
        let tail = String(text[afterAt...])
        if tail.contains(where: { $0.isWhitespace }) { return nil }
        // Must be at start or preceded by whitespace.
        if atIdx == text.startIndex { return tail }
        let prev = text[text.index(before: atIdx)]
        return prev.isWhitespace ? tail : nil
    }

    private func applyMention(_ u: VPUser) {
        guard let uname = u.username else { return }
        guard let atIdx = commentText.lastIndex(of: "@") else { return }
        let prefix = String(commentText[..<atIdx])
        commentText = prefix + "@\(uname) "
        mentionSuggestions = []
    }

    /// EXPERT_THREADS Wave 5 — picker dropdown UI. Broadcast button
    /// (always shown) + directed experts list (may be empty).
    @ViewBuilder
    private func expertPickerOverlay(_ picker: ExpertPickerData) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Broadcast button — always visible. Inserts `@expert` sentinel.
            Button {
                applyExpertBroadcast()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "megaphone.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(VP.expertColor)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Ask all experts in \(picker.categoryName)")
                            .font(.system(.footnote, design: .default, weight: .semibold))
                            .foregroundColor(VP.text)
                        Text("Broadcast — counts as 3 mentions")
                            .font(.caption2)
                            .foregroundColor(VP.dim)
                    }
                    Spacer()
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            Divider().background(VP.border)
            if picker.experts.isEmpty {
                Text("No active experts in \(picker.categoryName) right now.")
                    .font(.caption)
                    .foregroundColor(VP.dim)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
            } else {
                ForEach(picker.experts) { expert in
                    Button {
                        applyExpertDirected(expert.username)
                    } label: {
                        HStack(spacing: 8) {
                            AvatarView(
                                outerHex: expert.avatarColor,
                                innerHex: nil,
                                initials: String(expert.username.prefix(1)).uppercased(),
                                size: 22
                            )
                            VStack(alignment: .leading, spacing: 1) {
                                Text("@expert_\(expert.username)")
                                    .font(.system(.footnote, design: .default, weight: .semibold))
                                    .foregroundColor(VP.text)
                                if let title = expert.expertTitle, !title.isEmpty {
                                    Text(title)
                                        .font(.caption2)
                                        .foregroundColor(VP.dim)
                                }
                            }
                            Spacer()
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                    }
                    .buttonStyle(.plain)
                    Divider().background(VP.border)
                }
            }
        }
        .background(VP.bg)
        .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.border))
        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
        .padding(.bottom, 8)
    }

    private func commentRow(_ comment: VPComment, depth: Int = 0) -> some View {
        let u = comment.users
        let initials = u?.avatar?.initials
            ?? u?.username?.prefix(1).description
            ?? "?"
        // 16pt-per-level indent + 1pt left rule from depth 1 onward,
        // matching the web threaded-replies treatment.
        let indent = CGFloat(depth) * 16
        let isOwnComment = comment.userId != nil && comment.userId == auth.currentUser?.id
        let isEditing = editingCommentId == comment.id
        return HStack(alignment: .top, spacing: 10) {
            AvatarView(
                outerHex: u?.avatar?.outer ?? u?.avatarColor,
                innerHex: u?.avatar?.inner,
                initials: initials,
                size: 32
            )
            VStack(alignment: .leading, spacing: 4) {
                if comment.isPinned == true {
                    Text("Pinned as Article Context")
                        .font(.system(.caption2, design: .default, weight: .bold))
                        .foregroundColor(VP.accent)
                }
                // EXPERT_THREADS Wave 5 — distinctive chrome attaches to
                // author.is_expert AND article.category ∈
                // author.verified_categories (NOT thread mode). The legacy
                // `is_expert_reply` column is left in place for now since
                // server-side triggers populate it; iOS just stops reading
                // it for the chrome decision.
                if showsExpertChrome(comment) {
                    HStack(spacing: 6) {
                        Text("Verified Expert")
                            .font(.system(.caption2, design: .default, weight: .bold))
                            .tracking(0.3)
                            .foregroundColor(VP.expertColor)
                        if let cat = categoryName, !cat.isEmpty {
                            Text("· \(cat)")
                                .font(.system(.caption2, design: .default, weight: .semibold))
                                .foregroundColor(VP.expertColor.opacity(0.85))
                        }
                    }
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(RoundedRectangle(cornerRadius: VP.radiusXS).fill(VP.expertColor.opacity(0.12)))
                }
                HStack(spacing: 6) {
                    if let uname = u?.username {
                        NavigationLink {
                            PublicProfileView(username: uname)
                                .environmentObject(auth)
                        } label: {
                            Text(uname)
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(VP.text)
                        }
                        .buttonStyle(.plain)
                    } else {
                        Text("user")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(VP.text)
                    }
                    VerifiedBadgeView(isExpert: u?.isExpert, isVerifiedPublicFigure: u?.isVerifiedPublicFigure)
                    // Section A — inline "Helpful" badge once the comment's
                    // helpful_count crosses the editorial threshold (default
                    // 10, settings-tunable via SettingsService.helpfulBadgeThreshold).
                    // Public count is read from local cache populated on
                    // comment fetch + updated on toggle response.
                    if (commentHelpfulCounts[comment.id] ?? comment.helpfulCount ?? 0)
                        >= SettingsService.shared.helpfulBadgeThreshold {
                        Text("Helpful")
                            .font(.system(.caption2, design: .default, weight: .bold))
                            .foregroundColor(VP.tagHelpful)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(RoundedRectangle(cornerRadius: VP.radiusXS).fill(VP.tagHelpful.opacity(0.12)))
                    }
                    if comment.isEdited == true && !comment.isDeleted {
                        Text("(edited)")
                            .font(.caption2)
                            .foregroundColor(VP.dim)
                    }
                    Spacer()
                    if let d = comment.createdAt {
                        Text(timeAgo(d))
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                if comment.isDeleted {
                    // A126 — soft-deleted tombstone. Body text + vote /
                    // reply / edit affordances all suppressed; the row is
                    // kept so reply chains anchored to it still render.
                    Text("[deleted]")
                        .font(.subheadline)
                        .italic()
                        .foregroundColor(VP.dim)
                } else if isEditing {
                    // A123 — inline edit mode. Server still owns the
                    // edit window; this just lets the user revise the
                    // body and PATCH /api/comments/[id].
                    TextEditor(text: $editingCommentBody)
                        .font(.subheadline)
                        .foregroundColor(VP.text)
                        .frame(minHeight: 80)
                        .padding(8)
                        .background(VP.card)
                        .overlay(RoundedRectangle(cornerRadius: VP.radiusSM).stroke(VP.border))
                        .accessibilityLabel("Edit comment")
                    HStack(spacing: 10) {
                        Button {
                            cancelEdit()
                        } label: {
                            Text("Cancel")
                                .font(.system(.caption, design: .default, weight: .semibold))
                                .foregroundColor(VP.dim)
                        }
                        .buttonStyle(.plain)
                        .disabled(editSaving)
                        Button {
                            Task { await saveEdit(for: comment) }
                        } label: {
                            if editSaving {
                                ProgressView().controlSize(.small)
                            } else {
                                Text("Save")
                                    .font(.system(.caption, design: .default, weight: .semibold))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 4)
                                    .background(VP.accent)
                                    .clipShape(RoundedRectangle(cornerRadius: VP.radiusXS))
                            }
                        }
                        .buttonStyle(.plain)
                        .disabled(editSaving || editingCommentBody.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                } else {
                    commentBodyText(comment)
                }
                if !comment.isDeleted && !isEditing {
                    // Tag chips — always visible when any tag is active (cast or count > 0).
                    // Self-tag blocked by the API (403); we hide for own comments to avoid tease.
                    if comment.userId != auth.currentUser?.id {
                        commentTagChipsRow(for: comment)
                            .padding(.top, 6)
                    }
                    // EXPERT_THREADS Wave 5 — thread-mode action row.
                    // Adds: Close / Reopen on root, Allow another reply on
                    // expert's own replies in a thread, "N replies left"
                    // affordance for the asker.
                    expertThreadActionRow(for: comment)

                    let isThreadClosed = (threadRoot(for: comment)?.expertThreadClosedAt) != nil

                    // Action row: Reply · Edit · Agree · Disagree
                    HStack(spacing: 4) {
                        if auth.isLoggedIn && muteState == nil
                            && depth < SettingsService.shared.commentNumber("max_depth") {
                            // Disable Reply when:
                            //   - the thread is closed (no new replies)
                            //   - the asker has hit the per-expert chain cap
                            //     (chain row exists, repliesLeft == 0, no
                            //     free pass)
                            let replyState = askerReplyState(for: comment)
                            Button {
                                startReply(to: comment)
                            } label: {
                                Text(replyState.disabled ? "Reply" : "Reply")
                                    .font(.system(.caption, design: .default, weight: .semibold))
                                    .foregroundColor(replyState.disabled ? VP.muted : VP.accent)
                            }
                            .buttonStyle(.plain)
                            .disabled(replyState.disabled || isThreadClosed)
                            if let copy = replyState.copy {
                                Text(copy)
                                    .font(.system(size: VP.Size.xs))
                                    .foregroundColor(replyState.disabled ? VP.warn : VP.dim)
                            }
                            if isThreadClosed {
                                Text("Thread closed.")
                                    .font(.system(size: VP.Size.xs))
                                    .foregroundColor(VP.dim)
                            }
                        }
                        if isOwnComment && canEditOwnComment && muteState == nil {
                            Button {
                                beginEdit(comment)
                            } label: {
                                Text("Edit")
                                    .font(.system(.caption, design: .default, weight: .semibold))
                                    .foregroundColor(VP.accent)
                            }
                            .buttonStyle(.plain)
                        }
                        if auth.isLoggedIn && comment.userId != auth.currentUser?.id {
                            let agreed = agreedComments.contains(comment.id)
                            let disagreed = disagreedComments.contains(comment.id)
                            Text("·")
                                .font(.caption)
                                .foregroundColor(VP.dim.opacity(0.5))
                            Button {
                                Task { await reactOnComment(comment, reaction: "agree") }
                            } label: {
                                Text("Agree")
                                    .font(.system(size: VP.Size.sm, weight: agreed ? .bold : .medium))
                                    .foregroundColor(agreed ? Color(hex: "#1a7a4a") : VP.dim)
                            }
                            .buttonStyle(.plain)
                            Button {
                                Task { await reactOnComment(comment, reaction: "disagree") }
                            } label: {
                                Text("Disagree")
                                    .font(.system(size: VP.Size.sm, weight: disagreed ? .bold : .medium))
                                    .foregroundColor(disagreed ? Color(hex: "#b94040") : VP.dim)
                            }
                            .buttonStyle(.plain)
                        }
                        Spacer()
                    }
                    .padding(.top, 4)
                }
            }
        }
        .padding(.vertical, 12)
        .padding(.trailing, 20)
        .padding(.leading, 20 + indent)
        .overlay(alignment: .leading) {
            if depth > 0 {
                Rectangle()
                    .fill(VP.dim.opacity(0.35))
                    .frame(width: 1)
                    .padding(.leading, 20 + indent - 8)
                    .padding(.vertical, 6)
            }
        }
        .overlay(alignment: .bottom) {
            Rectangle().fill(VP.rule).frame(height: 1)
        }
        // EXPERT_THREADS Wave 5 — author-attribute-driven accent border.
        // Whether or not the thread itself is in expert mode, an expert's
        // reply in their verified category gets the chip + accent border.
        .padding(showsExpertChrome(comment) ? 10 : 0)
        .background(showsExpertChrome(comment) ? VP.expertColor.opacity(0.06) : Color.clear)
        .overlay(
            RoundedRectangle(cornerRadius: VP.radiusMD)
                .stroke(showsExpertChrome(comment) ? VP.expertColor.opacity(0.22) : Color.clear, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: showsExpertChrome(comment) ? VP.radiusMD : 0))
        // Apple Guideline 1.2 — long-press affords Report + Block on every
        // comment. Author-self check skips blocking yourself; the API also
        // rejects it but we suppress the option entirely to avoid a dead-end.
        .contextMenu {
            if !comment.isDeleted {
                Button {
                    reportTargetCommentId = comment.id
                } label: {
                    Label("Report comment", systemImage: "flag")
                }
                if let authorId = comment.userId, authorId != auth.currentUser?.id {
                    Button(role: .destructive) {
                        blockTargetUser = (id: authorId, username: comment.users?.username)
                    } label: {
                        Label("Block @\(comment.users?.username ?? "user")", systemImage: "hand.raised")
                    }
                }
                // C3 — moderator actions (hide + supervisor flag).
                if canHideComments {
                    Button(role: .destructive) {
                        Task { await hideComment(comment) }
                    } label: {
                        Label("Hide comment", systemImage: "eye.slash")
                    }
                }
                if canFlagComments {
                    Button {
                        Task { await flagForSupervisor(comment) }
                    } label: {
                        Label("Flag for review", systemImage: "flag")
                    }
                }
            }
        }
    }

    /// A126 — render the comment body with @-mentions hyperlinked. The
    /// server's `mentions` payload (`[{username, user_id}, ...]`) tells us
    /// which `@username` runs are real mentions vs. literal text. We
    /// scan the body for `@\(username)` runs that match any entry in the
    /// mentions list and emit them as a tappable chunk; everything else
    /// renders as plain text. Tap routes through PublicProfileView.
    @ViewBuilder
    private func commentBodyText(_ comment: VPComment) -> some View {
        let body = comment.body ?? ""
        let mentions = (comment.mentions ?? []).compactMap { $0.username }.filter { !$0.isEmpty }
        if mentions.isEmpty {
            Text(body)
                .font(.subheadline)
                .foregroundColor(VP.soft)
                .lineSpacing(4)
        } else {
            // Split the body around `@username` substrings (case-insensitive
            // on the username; preserves caller-typed casing).
            let segments = StoryDetailView.splitOnMentions(body: body, mentions: mentions)
            VStack(alignment: .leading, spacing: 0) {
                buildMentionFlow(segments)
            }
        }
    }

    /// Build a single concatenated `Text` runs block out of segments.
    /// We're not using SwiftUI's `Text` inline anchors because the
    /// destination is a NavigationLink to PublicProfileView, which
    /// `Text + AttributedString` can't host. Instead the segments emit
    /// inline buttons via `Text` interpolation; we accept the limitation
    /// of mention runs not wrapping mid-line — long-form prose stays
    /// fully in `Text` and only the mention itself is a tappable run.
    @ViewBuilder
    private func buildMentionFlow(_ segments: [StoryDetailView.MentionSegment]) -> some View {
        // Concatenate all into a single Text via `+` so multi-line
        // wrapping works correctly. Mention runs render as accent-color
        // semibold; full-segment taps require `.contentShape` on the
        // wrapping container — we accept that mention taps require a
        // double-tap to trigger the profile route on iOS, mirroring how
        // long-form embedded mentions degrade gracefully on the web's
        // markdown-rendered comment shape.
        let combined: Text = segments.reduce(Text("")) { acc, seg in
            switch seg {
            case .text(let s):
                return acc + Text(s)
            case .mention(let uname):
                return acc + Text("@\(uname)").foregroundColor(VP.accent).fontWeight(.semibold)
            }
        }
        combined
            .font(.subheadline)
            .foregroundColor(VP.soft)
            .lineSpacing(4)
    }

    enum MentionSegment {
        case text(String)
        case mention(String)
    }

    /// Split a comment body on `@username` runs that appear in `mentions`.
    /// The match is case-insensitive on the username and word-bounded on
    /// the trailing edge so `@anna` doesn't eat `@annapurna` as a prefix
    /// match — Swift's String range scanning handles that explicitly.
    static func splitOnMentions(body: String, mentions: [String]) -> [MentionSegment] {
        guard !mentions.isEmpty, !body.isEmpty else {
            return [.text(body)]
        }
        // Sort longest-first so `@annapurna` is tried before `@anna`.
        let sorted = mentions.sorted { $0.count > $1.count }
        var result: [MentionSegment] = []
        var pending = ""
        var i = body.startIndex
        outer: while i < body.endIndex {
            if body[i] == "@" {
                let after = body.index(after: i)
                for uname in sorted {
                    let upper = body.index(after, offsetBy: uname.count, limitedBy: body.endIndex)
                    guard let end = upper else { continue }
                    let candidate = body[after..<end]
                    if candidate.lowercased() == uname.lowercased() {
                        // Word-boundary on the trailing edge — next char
                        // must be end-of-string or non-username.
                        let trailingOK: Bool = {
                            if end == body.endIndex { return true }
                            let next = body[end]
                            return !(next.isLetter || next.isNumber || next == "_")
                        }()
                        if trailingOK {
                            if !pending.isEmpty {
                                result.append(.text(pending))
                                pending = ""
                            }
                            result.append(.mention(uname))
                            i = end
                            continue outer
                        }
                    }
                }
            }
            pending.append(body[i])
            i = body.index(after: i)
        }
        if !pending.isEmpty {
            result.append(.text(pending))
        }
        return result
    }

    // MARK: - A123 — comment edit lifecycle

    private func beginEdit(_ comment: VPComment) {
        editingCommentId = comment.id
        editingCommentBody = comment.body ?? ""
        editSaving = false
    }

    private func cancelEdit() {
        editingCommentId = nil
        editingCommentBody = ""
        editSaving = false
    }

    private func saveEdit(for comment: VPComment) async {
        let trimmed = editingCommentBody.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        guard let session = try? await client.auth.session else { return }
        editSaving = true
        defer { editSaving = false }
        let url = SupabaseManager.shared.siteURL
            .appendingPathComponent("api/comments/\(comment.id)")
        var req = URLRequest(url: url)
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        struct Body: Encodable { let body: String }
        req.httpBody = try? JSONEncoder().encode(Body(body: trimmed))
        do {
            let (_, response) = try await URLSession.shared.data(for: req)
            if let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) {
                // Update the in-memory row optimistically; the realtime
                // UPDATE listener will re-fetch the joined shape and
                // overwrite this with the canonical value.
                if let idx = comments.firstIndex(where: { $0.id == comment.id }) {
                    var updated = comments[idx]
                    updated.body = trimmed
                    updated.isEdited = true
                    comments[idx] = updated
                }
                cancelEdit()
                return
            }
            await MainActor.run {
                flashModerationToast("Couldn\u{2019}t save your edit. The edit window may be closed.")
            }
        } catch {
            await MainActor.run {
                flashModerationToast("Couldn\u{2019}t save your edit. Try again in a moment.")
            }
        }
    }

    /// T12 — bind the composer to a parent comment so the next post stamps
    /// `parent_id` and the inline header shows "Replying to @user".
    private func startReply(to parent: VPComment) {
        replyingTo = parent
        composerFocused = true
    }

    /// EXPERT_THREADS Wave 5 — per-row thread-mode action row.
    /// Surfaces:
    ///   - "Close thread" / cooldown countdown for the thread originator
    ///     on the root comment.
    ///   - "Reopen" for moderators when the thread is closed.
    ///   - "Allow another reply" for the current expert on each of their
    ///     own replies in a thread, when the chain has hit the cap.
    @ViewBuilder
    private func expertThreadActionRow(for comment: VPComment) -> some View {
        let myId = auth.currentUser?.id
        let isRoot = comment.isExpertThreadRoot == true
        let isClosed = comment.expertThreadClosedAt != nil
        let isMyComment = comment.userId != nil && comment.userId == myId

        // Close / Reopen on the root comment.
        if isRoot {
            HStack(spacing: 8) {
                // Originator can close (or sees a cooldown countdown).
                if isMyComment && !isClosed && canCloseOwnThread {
                    if let secs = closeCooldownByRoot[comment.id], secs > 0 {
                        Text("Wait \(secs)s to close")
                            .font(.system(size: VP.Size.xs, weight: .semibold))
                            .foregroundColor(VP.warn)
                    } else {
                        Button {
                            Task { await closeThread(rootId: comment.id) }
                        } label: {
                            Text("Close thread")
                                .font(.system(size: VP.Size.xs, weight: .semibold))
                                .foregroundColor(VP.danger)
                        }
                        .buttonStyle(.plain)
                    }
                }
                // Moderator can reopen a closed thread.
                if isClosed && canModerateComments {
                    Button {
                        Task { await reopenThread(rootId: comment.id) }
                    } label: {
                        Text("Reopen")
                            .font(.system(size: VP.Size.xs, weight: .semibold))
                            .foregroundColor(VP.accent)
                    }
                    .buttonStyle(.plain)
                }
                if isClosed {
                    Text("· Closed")
                        .font(.system(size: VP.Size.xs))
                        .foregroundColor(VP.dim)
                }
                Spacer()
            }
            .padding(.top, 4)
        }

        // "Allow another reply" — shown on the expert's own replies inside
        // an expert thread, when the asker chain has hit the cap and no
        // free pass has been granted yet. The expert must have posted in
        // the thread (this is, by construction, their own reply, so the
        // server-side check trivially passes).
        if isMyComment && canAllowFollowup,
           let myExpertId = myId,
           let root = threadRoot(for: comment),
           root.isExpertThreadRoot == true,
           let askerId = root.userId,
           askerId != myExpertId {
            // Pull all chain rows for this root where the expert is me.
            // Surface a button per asker that's at cap with no free pass.
            let cappedAskers = threadChainsByKey.values
                .filter { $0.rootId == root.id && $0.expertId == myExpertId
                    && $0.askerReplyCount >= 2 && $0.freePassGrantedAt == nil }
            ForEach(cappedAskers, id: \.askerId) { chain in
                Button {
                    Task { await grantFreePass(rootId: root.id, askerUserId: chain.askerId) }
                } label: {
                    Text("Allow another reply")
                        .font(.system(size: VP.Size.xs, weight: .semibold))
                        .foregroundColor(VP.accent)
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
            }
        }
    }

    /// Compute "N replies left" / "Conversation complete with @maria"
    /// affordance copy + disabled state for the Reply button. Returns
    /// nil copy when the affordance shouldn't render (not in a thread, or
    /// viewer is the expert, or no chain row yet).
    private func askerReplyState(for comment: VPComment) -> (disabled: Bool, copy: String?) {
        guard let myId = auth.currentUser?.id else { return (false, nil) }
        guard let root = threadRoot(for: comment),
              root.isExpertThreadRoot == true,
              let askerId = root.userId else {
            return (false, nil)
        }
        // Affordance only applies when the viewer IS the asker — the
        // expert side has unlimited replies.
        guard askerId == myId else { return (false, nil) }
        // The expert in this chain is the comment's author when viewing
        // an expert reply, OR the deepest expert who posted in the thread
        // when viewing a non-expert reply. iOS keeps it simple: anchor to
        // the verified-expert comment in the root's reply tree.
        let expertReplies = comments.filter {
            ($0.id == root.id || $0.expertThreadRootId == root.id)
                && $0.userId != askerId
                && $0.users?.isExpert == true
        }
        guard let expertReply = expertReplies.last,
              let expertId = expertReply.userId else {
            return (false, nil)
        }
        let key = chainKey(root: root.id, asker: askerId, expert: expertId)
        guard let chain = threadChainsByKey[key] else {
            return (false, nil)
        }
        if chain.freePassGrantedAt != nil {
            return (false, "free pass — keep going")
        }
        let left = max(0, 2 - chain.askerReplyCount)
        if left == 0 {
            let uname = expertReply.users?.username ?? "expert"
            return (true, "Conversation complete with @\(uname) — they can grant another reply if you have a follow-up.")
        }
        return (false, "\(left) repl\(left == 1 ? "y" : "ies") left")
    }

    // MARK: - Toast overlay
    @ViewBuilder private var toastOverlay: some View {
        if showAchievementToast {
            Text(achievementToastText)
                .font(.system(.footnote, design: .default, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: VP.radiusMD).fill(VP.accent))
                .shadow(radius: 4)
                .padding(.top, 8)
                .transition(.move(edge: .top).combined(with: .opacity))
                .onAppear {
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                }
        }
    }

    // MARK: - Reading progress ribbon
    // Thin VP.accent bar under the tab bar that fills as the reader scrolls
    // through the article. Uses the ArticleScrollOffsetKey/ContentHeightKey
    // preference values populated from the ScrollView background. Hidden when
    // the active tab is not the article (no progress to report there).
    @ViewBuilder private var readingProgressRibbon: some View {
        if activeTab == .story {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Rectangle().fill(VP.rule)
                    Rectangle()
                        .fill(VP.accent)
                        .frame(width: geo.size.width * readingProgress)
                }
            }
            .frame(height: 2)
            .accessibilityHidden(true)
        }
    }

    // Clamped 0...1. Uses the visible viewport against total content so the
    // ribbon hits 1.0 when the last paragraph clears the bottom edge rather
    // than waiting for the user to scroll past empty space.
    private var readingProgress: CGFloat {
        let scrollable = max(contentHeight - viewportHeight, 1)
        let raw = scrollOffset / scrollable
        return min(max(raw, 0), 1)
    }

    // MARK: - Quiz pass burst (subtle particle moment + +X points delta)
    @ViewBuilder private var quizPassBurst: some View {
        if showPassBurst {
            VStack(spacing: 8) {
                Image(systemName: "star.fill")
                    .font(.system(size: 44, weight: .bold))
                    .foregroundColor(VP.accent)
                    .symbolEffect(.bounce, value: showPassBurst)
                if let delta = pointsDelta, pointsDeltaVisible {
                    Text("+\(delta) points")
                        .font(.system(.subheadline, design: .default, weight: .bold))
                        .foregroundColor(VP.accent)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(RoundedRectangle(cornerRadius: VP.radiusFull).fill(VP.accent.opacity(0.1)))
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .transition(.opacity)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }

    // MARK: - Up Next sheet
    // Slide-in (system .sheet) recommendation list. Loaded once on mount; tap
    // a card to push the next StoryDetailView via the existing
    // navigationDestination(for: Story.self) wired in HomeView.
    @ViewBuilder private var upNextSheet: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("UP NEXT")
                        .font(.system(.caption2, design: .default, weight: .bold))
                        .tracking(1)
                        .foregroundColor(VP.dim)
                        .padding(.horizontal, 20)
                        .padding(.top, 12)
                    if upNextStories.isEmpty {
                        Text("Nothing else queued in this category yet.")
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                            .padding(.horizontal, 20)
                            .padding(.bottom, 24)
                    } else {
                        VStack(spacing: 10) {
                            ForEach(upNextStories) { s in
                                NavigationLink(value: s) {
                                    upNextCard(s)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.bottom, 32)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(VP.bg)
            .navigationTitle("Up next")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { showUpNext = false }
                        .foregroundColor(VP.accent)
                }
            }
            .navigationDestination(for: Story.self) { next in
                StoryDetailView(story: next).environmentObject(auth)
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func upNextCard(_ s: Story) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if let cat = categoryName, !cat.isEmpty {
                Text(cat.uppercased())
                    .font(.system(.caption2, design: .default, weight: .semibold))
                    .tracking(1)
                    .foregroundColor(VP.accent)
            }
            Text(s.title ?? "Untitled")
                .font(.system(.callout, design: .serif, weight: .semibold))
                .foregroundColor(VP.text)
                .multilineTextAlignment(.leading)
                .lineLimit(3)
            if let summary = s.summary, !summary.isEmpty {
                Text(summary)
                    .font(.caption)
                    .foregroundColor(VP.soft)
                    .lineSpacing(2)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
    }

    // MARK: - Scroll + engagement triggers
    private func handleScrollOffset(_ value: CGFloat) {
        scrollOffset = value
        let scrollable = max(contentHeight - viewportHeight, 1)
        // End-of-article Up Next trigger fires once when the reader reaches
        // ~95% of the body. Skipped until recommendations have loaded so we
        // don't pop an empty sheet.
        if !endOfArticleHit, !upNextStories.isEmpty, value / scrollable >= 0.95 {
            endOfArticleHit = true
            // Don't auto-pop while the keyboard is up or the user is in the
            // middle of an interaction (composer focus = active session).
            if !composerFocused && !showUpNext {
                if reduceMotion {
                    showUpNext = true
                } else {
                    withAnimation(.easeOut(duration: 0.35)) { showUpNext = true }
                }
            }
        }
    }

    // Triggered when userPassedQuiz flips false→true. Combines a subtle
    // burst overlay, points-delta animation, focus on the composer, and a
    // success haptic. Reduce-motion strips the animation but keeps the
    // scroll + focus + haptic so the functional behaviour is preserved.
    // Also pins activeTab to .discussion so the composer is in the tree
    // before the scrollProxy tries to reach it.
    private func triggerQuizPassMoment(scrollProxy: ScrollViewProxy) {
        let success = UINotificationFeedbackGenerator()
        success.notificationOccurred(.success)
        let delta = quizResult?.correct ?? 0
        pointsDelta = delta > 0 ? delta : nil
        // Quiz lives inside discussionContent already, but pinning the tab
        // explicitly keeps the composer in the tree even if the user taps
        // Article during the burst.
        activeTab = .discussion
        if reduceMotion {
            scrollProxy.scrollTo("composer", anchor: .top)
            composerFocused = true
            return
        }
        withAnimation(.easeOut(duration: 0.25)) { showPassBurst = true }
        withAnimation(.easeOut(duration: 0.5).delay(0.1)) { pointsDeltaVisible = true }
        withAnimation(.easeInOut(duration: 0.45).delay(0.55)) {
            scrollProxy.scrollTo("composer", anchor: .top)
        }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_400_000_000)
            withAnimation(.easeIn(duration: 0.35)) {
                showPassBurst = false
                pointsDeltaVisible = false
            }
            try? await Task.sleep(nanoseconds: 350_000_000)
            composerFocused = true
        }
    }

    // MARK: - Up Next loader
    // Same category, recently published, excluding this article. Limit 3.
    private func loadUpNextStories() async {
        guard !upNextRequested else { return }
        upNextRequested = true
        guard let catId = story.categoryId else { return }
        do {
            let next: [Story] = try await client.from("articles")
                .select("id, title, story_id, stories(slug), excerpt, body, cover_image_url, category_id, status, is_breaking, is_developing, published_at, created_at")
                .eq("category_id", value: catId)
                .eq("status", value: "published")
                .eq("browse_only", value: false)
                .neq("id", value: story.id)
                .order("published_at", ascending: false)
                .limit(3)
                .execute().value
            await MainActor.run { upNextStories = next }
        } catch {
            Log.d("[StoryDetail] up-next load error:", error)
        }
    }

    // MARK: - Helpers

    // Word-count-based read time. 200 wpm matches the web /story page
    // (added in the same engagement-polish ship). Always shows at least
    // "1 min read" so the meta line is consistent on stub articles.
    private var estimatedReadMinutes: Int {
        let body = story.content ?? ""
        if body.isEmpty { return 1 }
        let words = body
            .split { $0.isWhitespace || $0.isNewline }
            .filter { !$0.isEmpty }
            .count
        return max(1, words / 200)
    }

    private func badge(_ text: String, color: Color) -> some View {
        // Canonical solid-bg + white-text style, matches web story-page
        // Breaking/Developing badges (commit 46c27d2) + iOS HomeView card
        // badge. Was previously a tinted variant (color.opacity(0.12));
        // unified 2026-04-21.
        Text(text)
            .font(.system(.caption2, design: .default, weight: .heavy))
            .tracking(0.5)
            .foregroundColor(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(RoundedRectangle(cornerRadius: VP.radiusXS).fill(color))
    }

    private func formatDate(_ date: Date) -> String {
        return StoryDetailView.displayDateFormatter.string(from: date)
    }

    private func fetchStoryByArticleId(_ articleId: String) async -> Story? {
        let c = SupabaseManager.shared.client
        return try? await c.from("articles")
            .select("*, stories(slug)")
            .eq("id", value: articleId)
            .single()
            .execute()
            .value
    }

    // MARK: - Data loading
    private func loadData() async {
        await SettingsService.shared.loadIfNeeded()
        do {
            // D1/D6/D8: the quiz pool is NEVER loaded client-side. Questions
            // arrive only through /api/quiz/start, which strips is_correct.
            async let tReq: [TimelineEvent] = client.from("timelines").select().eq("story_id", value: story.storyId ?? "").order("event_date", ascending: true).execute().value
            async let sReq: [SourceLink] = client.from("sources").select().eq("article_id", value: story.id).execute().value
            async let cReq: [VPComment] = client.from("comments")
                // A126 — pull the soft-delete + edit + mentions fields so
                // [deleted] tombstones, (edited) labels, and tap-to-profile
                // mention runs render at parity with web.
                // EXPERT_THREADS Wave 5 — pull thread-mode columns
                // (is_expert_thread_root, expert_thread_root_id,
                // expert_thread_closed_at, expert_thread_closed_by,
                // last_reopen_at) so close/reopen + cap affordances render.
                .select("id, user_id, article_id, parent_id, body, is_pinned, is_context_pinned, is_expert_reply, is_expert_thread_root, expert_thread_root_id, expert_thread_closed_at, expert_thread_closed_by, last_reopen_at, upvote_count, downvote_count, helpful_count, cite_needed_count, off_topic_count, quality_score, agree_count, disagree_count, created_at, deleted_at, status, is_edited, context_tag_count, mentions")
                .eq("article_id", value: story.id)
                .eq("status", value: "visible")
                .is("deleted_at", value: nil)
                .order("is_context_pinned", ascending: false)
                .order("created_at", ascending: false)
                .limit(100)
                .execute().value
            let (t, s, c) = try await (tReq, sReq, cReq)
            let authorIds = Array(Set(c.compactMap { $0.userId }))
            var authorById: [String: VPComment.AuthorRef] = [:]
            if !authorIds.isEmpty,
               let authors: [VPComment.AuthorRef] = try? await client
                   .from("public_profiles_v")
                   .select("id, username, avatar_url, avatar_color, is_expert, is_verified_public_figure")
                   .in("id", values: authorIds)
                   .execute()
                   .value {
                for author in authors {
                    if let aid = author.id { authorById[aid] = author }
                }
            }
            // EXPERT_THREADS Wave 5 — verified-categories map for distinctive
            // expert chrome. The Verified Expert chip + accent border attach
            // when `author.is_expert == true AND article.category ∈
            // verifiedCategoryIds` — author-attribute-driven, not
            // thread-mode-driven (spec §2). Fetched here so commentRow can
            // read it off the AuthorRef without per-row queries.
            if !authorIds.isEmpty {
                struct CatJoinRow: Decodable {
                    let categoryId: String?
                    let expertApplications: AppRef?

                    enum CodingKeys: String, CodingKey {
                        case categoryId = "category_id"
                        case expertApplications = "expert_applications"
                    }

                    struct AppRef: Decodable {
                        let userId: String?
                        let status: String?

                        enum CodingKeys: String, CodingKey {
                            case userId = "user_id"
                            case status
                        }
                    }
                }
                let catRows: [CatJoinRow] = (try? await client
                    .from("expert_application_categories")
                    .select("category_id, expert_applications!inner(user_id, status)")
                    .eq("expert_applications.status", value: "approved")
                    .in("expert_applications.user_id", values: authorIds)
                    .execute().value) ?? []
                var byUser: [String: [String]] = [:]
                for row in catRows {
                    guard let uid = row.expertApplications?.userId,
                          let cid = row.categoryId else { continue }
                    byUser[uid, default: []].append(cid)
                }
                for (uid, cats) in byUser {
                    if var existing = authorById[uid] {
                        existing.verifiedCategoryIds = cats
                        authorById[uid] = existing
                    }
                }
            }
            timeline = t
            sources = s
            comments = c.map { row in
                var mutable = row
                if let uid = row.userId { mutable.users = authorById[uid] }
                return mutable
            }
            loadError = nil

            // EXPERT_THREADS Wave 5 — load chain rows for any expert thread
            // root in the visible page. Drives the asker "1 reply left"
            // affordance + cap-hit disable on Reply.
            await loadExpertThreadChains(comments: c)

            // Bug 32: article category label (was hardcoded "NEWS").
            if let catId = story.categoryId {
                struct Cat: Decodable { let name: String }
                if let cat: Cat = try? await client.from("categories")
                    .select("name")
                    .eq("id", value: catId)
                    .single()
                    .execute().value {
                    categoryName = cat.name
                }
            }
        } catch {
            Log.d("StoryDetail load error:", error)
            loadError = "We couldn't load this story. Check your connection and try again."
        }
        loading = false

        // D29: Articles have no reactions — reaction loading removed.

        // Bookmark and quiz-history fetches are secondary — the article body is already
        // loaded before these run. Failures degrade gracefully: isBookmarked defaults to
        // false (safe; worst case the user re-bookmarks), quiz history defaults to empty
        // (safe; user re-takes the quiz). Neither failure should block article reading.
        if let session = try? await client.auth.session {
            let userId = session.user.id.uuidString
            struct BM: Decodable { let id: String }
            do {
                let bm: BM = try await client.from("bookmarks")
                    .select("id")
                    .eq("user_id", value: userId)
                    .eq("article_id", value: story.id)
                    .single()
                    .execute()
                    .value
                isBookmarked = true
                bookmarkId = bm.id
            } catch {
                // PostgREST surfaces "no rows" via `single()` as a thrown
                // error — that's the not-found case we swallow. Anything
                // else is a real failure that gates persisted UI.
                let msg = error.localizedDescription.lowercased()
                let isNotFound = msg.contains("no rows") || msg.contains("pgrst116")
                if !isNotFound {
                    Log.d("[StoryDetail] bookmark check failed:", error)
                }
            }

            struct PassRow: Decodable { let attempt_number: Int?; let is_correct: Bool? }
            let rows: [PassRow]
            do {
                rows = try await client.from("quiz_attempts")
                    .select("attempt_number, is_correct")
                    .eq("user_id", value: userId)
                    .eq("article_id", value: story.id)
                    .execute()
                    .value
            } catch {
                Log.d("[StoryDetail] quiz attempts read failed:", error)
                rows = []
            }
            var byAttempt: [Int: (correct: Int, total: Int)] = [:]
            for row in rows {
                let k = row.attempt_number ?? 0
                var e = byAttempt[k] ?? (0, 0)
                e.total += 1
                if row.is_correct == true { e.correct += 1 }
                byAttempt[k] = e
            }
            // Server semantic: pass = `correct >= 3` per attempt (hardcoded in
            // submit_quiz_attempt + user_passed_article_quiz RPCs in
            // schema/012_phase4_quiz_helpers.sql). The prior integer-division
            // %ile (`* 10 / total >= 7`) required 4/5 = 80%, locking out users
            // who scored 3/5 = 60% on web — the actual server pass.
            // passThreshold (line 125-130) already uses 3 for UI copy; keep it
            // a single literal here too. If the server ever moves the threshold
            // off the literal 3 (e.g. read from settings.quiz_pass_score), this
            // line moves with it.
            userPassedQuiz = byAttempt.values.contains { $0.total > 0 && $0.correct >= 3 }

            await loadMuteState(userId: userId)
        }

        await trackReading()

        // Load the current user's agree/disagree reactions.
        if let session = try? await client.auth.session {
            let userId = session.user.id.uuidString
            let ids = comments.map { $0.id }
            if !ids.isEmpty {
                struct R: Decodable { let comment_id: String; let reaction: String }
                let mine: [R] = (try? await client.from("comment_agree_disagree")
                    .select("comment_id, reaction")
                    .eq("user_id", value: userId)
                    .in("comment_id", values: ids)
                    .execute().value) ?? []
                agreedComments = Set(mine.filter { $0.reaction == "agree" }.map { $0.comment_id })
                disagreedComments = Set(mine.filter { $0.reaction == "disagree" }.map { $0.comment_id })
            }
        }

    }

    // MARK: - Mute-state fetch
    // Mirrors web CommentComposer.jsx pre-submit check. Queries the current
    // user's row for ban/mute flags; if the user is banned or has an active
    // mute (mute_level >= 1 and muted_until in the future or null), sets
    // `muteState` so the composer renders the appeal banner instead.
    private func loadMuteState(userId: String) async {
        struct Row: Decodable {
            let is_banned: Bool?
            let is_muted: Bool?
            let mute_level: Int?
            let muted_until: String?
        }
        guard let row: Row = try? await client.from("users")
            .select("is_banned, is_muted, mute_level, muted_until")
            .eq("id", value: userId)
            .single()
            .execute().value
        else { return }

        let banned = row.is_banned == true
        let untilDate: Date? = {
            guard let s = row.muted_until, !s.isEmpty else { return nil }
            if let d = StoryDetailView.muteISOFmt.date(from: s) { return d }
            return StoryDetailView.muteISOFmtFallback.date(from: s)
        }()
        let muteActive = (row.is_muted == true)
            && ((row.mute_level ?? 0) >= 1)
            && (untilDate == nil || untilDate! > Date())

        if banned || muteActive {
            muteState = MuteState(banned: banned, mutedUntil: untilDate)
        } else {
            muteState = nil
        }
    }

    // MARK: - Realtime comments
    // Subscribes to INSERT + UPDATE events on comments filtered by this
    // story. INSERT prepends new rows; UPDATE finds the existing row by id
    // and replaces it (carries soft-delete, edit, vote-count changes, and
    // mod-action transitions in one channel).
    // The Task is cancelled whenever story.id changes (see .task(id: story.id)).
    //
    // A37 — channel cleanup is owned by withTaskCancellationHandler with
    // detached unsubscribe hops on both branches.
    // A124 — UPDATE listener added so soft-deleted comments and edited
    // bodies render live without a story re-load.
    private func subscribeToNewComments() async {
        let channel = client.channel("comments-story-\(story.id)")
        let inserts = channel.postgresChange(
            InsertAction.self,
            schema: "public",
            table: "comments",
            filter: "article_id=eq.\(story.id)"
        )
        let updates = channel.postgresChange(
            UpdateAction.self,
            schema: "public",
            table: "comments",
            filter: "article_id=eq.\(story.id)"
        )
        await channel.subscribe()
        await withTaskCancellationHandler {
            await withTaskGroup(of: Void.self) { group in
                group.addTask { @MainActor in
                    for await change in inserts {
                        guard let idValue = change.record["id"],
                              case let .string(newId) = idValue else { continue }
                        if comments.contains(where: { $0.id == newId }) { continue }
                        guard var fresh: VPComment = try? await client.from("comments")
                            .select("id, user_id, article_id, parent_id, body, is_pinned, is_context_pinned, is_expert_reply, upvote_count, downvote_count, helpful_count, cite_needed_count, off_topic_count, quality_score, agree_count, disagree_count, created_at, deleted_at, status, is_edited, context_tag_count, mentions")
                            .eq("id", value: newId)
                            .single()
                            .execute()
                            .value else { continue }
                        if let uid = fresh.userId,
                           let author: VPComment.AuthorRef = try? await client
                               .from("public_profiles_v")
                               .select("id, username, avatar_url, avatar_color, is_expert, is_verified_public_figure")
                               .eq("id", value: uid)
                               .single()
                               .execute()
                               .value {
                            fresh.users = author
                        }
                        if !comments.contains(where: { $0.id == fresh.id }) {
                            // Append and re-sort: pinned first, then newest.
                            comments.append(fresh)
                            comments.sort { a, b in
                                let aPinned = a.isContextPinned == true
                                let bPinned = b.isContextPinned == true
                                if aPinned != bPinned { return aPinned && !bPinned }
                                return (a.createdAt ?? .distantPast) > (b.createdAt ?? .distantPast)
                            }
                        }
                    }
                }
                group.addTask { @MainActor in
                    for await change in updates {
                        guard let idValue = change.record["id"],
                              case let .string(updatedId) = idValue else { continue }
                        // Re-fetch the bare columns; postgres_changes only carries
                        // bare columns. Author data is preserved from the existing
                        // displayed comment (updates don't change authorship).
                        guard var refreshed: VPComment = try? await client.from("comments")
                            .select("id, user_id, article_id, parent_id, body, is_pinned, is_context_pinned, is_expert_reply, upvote_count, downvote_count, helpful_count, cite_needed_count, off_topic_count, quality_score, agree_count, disagree_count, created_at, deleted_at, status, is_edited, context_tag_count, mentions")
                            .eq("id", value: updatedId)
                            .single()
                            .execute()
                            .value else { continue }
                        // Preserve existing author data if the comment is already displayed;
                        // updates (edits, vote counts, status changes) don't change authorship.
                        if let existing = comments.first(where: { $0.id == updatedId }) {
                            refreshed.users = existing.users
                        } else if let uid = refreshed.userId,
                                  let author: VPComment.AuthorRef = try? await client
                                      .from("public_profiles_v")
                                      .select("id, username, avatar_url, avatar_color, is_expert, is_verified_public_figure")
                                      .eq("id", value: uid)
                                      .single()
                                      .execute()
                                      .value {
                            refreshed.users = author
                        }
                        if let idx = comments.firstIndex(where: { $0.id == updatedId }) {
                            comments[idx] = refreshed
                        }
                    }
                }
                await group.waitForAll()
            }
            Task.detached { @Sendable in
                await channel.unsubscribe()
            }
        } onCancel: {
            Task.detached { @Sendable in
                await channel.unsubscribe()
            }
        }
    }

    // MARK: - Bookmark
    // D13: routes through /api/bookmarks (service client) so the D13 cap
    // trigger runs server-side and RLS can stay ownership-only per
    // migration 045. Direct supabase-client inserts hit the old RLS wall
    // and bypass server-side validation.
    //
    // A118 — server-side cap is the source of truth. The trigger raises
    // `P0001 bookmark_cap_exceeded`, which the API route surfaces as a
    // 403 with `{"error":"bookmark_cap_exceeded"}`. We read the body,
    // route a cap-exceeded response into the upgrade alert, and treat
    // every other non-2xx as a transient failure.
    private func toggleBookmark() async {
        guard let session = try? await client.auth.session else { return }
        let site = SupabaseManager.shared.siteURL
        if isBookmarked, let bid = bookmarkId {
            guard let url = URL(string: "/api/bookmarks/\(bid)", relativeTo: site) else { return }
            var req = URLRequest(url: url)
            req.httpMethod = "DELETE"
            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            if let (_, response) = try? await URLSession.shared.data(for: req),
               let http = response as? HTTPURLResponse, http.statusCode == 200 {
                isBookmarked = false; bookmarkId = nil
            }
        } else {
            guard let url = URL(string: "/api/bookmarks", relativeTo: site) else { return }
            struct Body: Encodable { let article_id: String }
            struct Resp: Decodable { let id: String }
            struct ErrResp: Decodable { let error: String? }
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            req.httpBody = try? JSONEncoder().encode(Body(article_id: story.id))
            guard let (data, response) = try? await URLSession.shared.data(for: req),
                  let http = response as? HTTPURLResponse else {
                return
            }
            if http.statusCode == 200,
               let decoded = try? JSONDecoder().decode(Resp.self, from: data) {
                isBookmarked = true
                bookmarkId = decoded.id
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                return
            }
            // Cap-exceeded — surface upgrade affordance instead of failing
            // silently. The route returns 403 with `error: "bookmark_cap_exceeded"`
            // when the trigger raises P0001. Anything else is a transient
            // failure we just log.
            if let err = try? JSONDecoder().decode(ErrResp.self, from: data),
               err.error == "bookmark_cap_exceeded" {
                await MainActor.run { showUpgradeAlert = true }
                return
            }
            Log.d("[StoryDetail] bookmark POST non-2xx:", http.statusCode)
        }
    }

    /// D13: users without `bookmarks.unlimited` may bookmark up
    /// to 10 articles; users with it are uncapped. Removing an existing
    /// bookmark never hits the cap.
    ///
    /// A118 — the iOS client used to pre-count bookmarks before posting,
    /// which raced against the server's `bookmarks_cap` trigger: between
    /// the SELECT and the POST another tab/web session could land row #11.
    /// We now trust the server-side trigger and parse its P0001
    /// "bookmark_cap_exceeded" reply (surfaced by /api/bookmarks as a 403)
    /// into the upgrade affordance, mirroring what the web client does.
    /// The pre-check is gone end-to-end.
    private func attemptBookmark() async {
        guard (try? await client.auth.session) != nil else {
            await MainActor.run { showRegistrationSheet = true }
            return
        }
        await toggleBookmark()
    }

    // D29: Articles have no reactions — toggleReaction removed.

    // MARK: - Reading
    // Bug 33 + 42: route through `/api/stories/read` so the server applies
    // the kid-safety gate, same-day dedupe, atomic view-count increment, and
    // the scoring/streak pipeline. The prior implementation hit the table
    // directly and skipped all four. The server also owns `read_percentage`
    // and `time_spent_seconds` defaults, so iOS no longer needs to populate
    // them manually (we can pass scroll depth later when we track it).
    private func trackReading() async {
        guard let session = try? await client.auth.session else { return }
        struct Body: Encodable {
            let articleId: String
            let completed: Bool
            let kidProfileId: String?
        }
        do {
            let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/stories/read")
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            req.httpBody = try JSONEncoder().encode(Body(
                articleId: story.id,
                completed: true,
                kidProfileId: nil
            ))
            _ = try await URLSession.shared.data(for: req)
        } catch {
            #if DEBUG
            Log.d("[StoryDetailView] trackReading error:", error)
            #endif
        }
    }

    // MARK: - Quiz: server-graded start + submit
    // /api/quiz/start returns {questions, attempt_number, attempts_used,
    // max_attempts}. Questions have no is_correct. /api/quiz/submit grades
    // and returns pass/fail + per-question breakdown with explanations.
    private func startQuiz() async {
        await MainActor.run {
            quizStage = .loading
            quizError = nil
            quizAnswers = [:]
            quizCurrent = 0
            quizResult = nil
        }
        guard let session = try? await client.auth.session else {
            await MainActor.run { quizStage = .idle; quizError = "Sign in to take quizzes." }
            return
        }
        let siteUrl = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/quiz/start", relativeTo: siteUrl) else {
            await MainActor.run { quizStage = .idle; quizError = "We couldn't start the quiz — try again." }
            return
        }
        struct Body: Encodable {
            let article_id: String
            let kid_profile_id: String?
        }
        let payload = Body(article_id: story.id, kid_profile_id: nil)
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = try? JSONEncoder().encode(payload)
        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                let rawMsg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
                let msg = friendlyApiError(rawMsg, fallback: "We couldn\u{2019}t start the quiz \u{2014} try again.")
                await MainActor.run { quizStage = .idle; quizError = msg }
                return
            }
            let decoded = try JSONDecoder().decode(APIQuizStartResponse.self, from: data)
            await MainActor.run {
                quizQuestions = decoded.questions
                quizAttemptMeta = APIQuizAttemptMeta(
                    attempt_number: decoded.attempt_number,
                    attempts_used: decoded.attempts_used,
                    max_attempts: decoded.max_attempts
                )
                quizStartedAt = Date()
                quizStage = .answering
            }
        } catch {
            await MainActor.run { quizStage = .idle; quizError = "Connection issue \u{2014} check your internet and try again." }
        }
    }

    private func submitQuiz() async {
        await MainActor.run {
            quizStage = .submitting
            quizError = nil
        }
        guard let session = try? await client.auth.session else {
            await MainActor.run { quizStage = .answering; quizError = "Sign in to take quizzes." }
            return
        }
        let siteUrl = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/quiz/submit", relativeTo: siteUrl) else {
            await MainActor.run { quizStage = .answering; quizError = "We couldn\u{2019}t start the quiz \u{2014} try again." }  // URL build failure
            return
        }
        struct AnswerEntry: Encodable {
            let quiz_id: String
            let selected_answer: String
        }
        struct Body: Encodable {
            let article_id: String
            let answers: [AnswerEntry]
            let kid_profile_id: String?
            let time_taken_seconds: Int?
        }
        let answers: [AnswerEntry] = quizQuestions.map { q in
            AnswerEntry(quiz_id: q.id, selected_answer: quizAnswers[q.id] ?? "")
        }
        let elapsed = quizStartedAt.map { Int(Date().timeIntervalSince($0)) }
        let payload = Body(article_id: story.id, answers: answers, kid_profile_id: nil, time_taken_seconds: elapsed)
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = try? JSONEncoder().encode(payload)
        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                let rawMsg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
                let msg = friendlyApiError(rawMsg, fallback: "Couldn\u{2019}t submit quiz.")
                await MainActor.run { quizStage = .answering; quizError = msg }
                return
            }
            let decoded = try JSONDecoder().decode(APIQuizSubmitResponse.self, from: data)
            await MainActor.run {
                quizResult = decoded
                quizStage = .result
                if decoded.passed {
                    userPassedQuiz = true
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) {
                        showPassBurst = true
                    }
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                        withAnimation { showPassBurst = false }
                    }
                    if push.status == .notDetermined,
                       !push.prePromptRecentlyDeclined,
                       !push.hasBeenPrompted {
                        showPushPrompt = true
                    }
                } else {
                    UINotificationFeedbackGenerator().notificationOccurred(.error)
                }
            }
        } catch {
            await MainActor.run { quizStage = .answering; quizError = "Connection issue \u{2014} check your internet and try again." }
        }
    }

    // MARK: - Apple Guideline 1.2 — moderation actions

    private func submitCommentReport(commentId: String, reason: ReportReason) async {
        let ok = await ReportService.submit(targetType: .comment, targetId: commentId, reason: reason)
        await MainActor.run {
            flashModerationToast(ok ? "Thanks for the report. We\u{2019}ll review it." : "Couldn\u{2019}t send report. Try again.")
        }
    }

    private func submitArticleReport(reason: ReportReason) async {
        let ok = await ReportService.submit(targetType: .article, targetId: story.id, reason: reason)
        await MainActor.run {
            flashModerationToast(ok ? "Thanks for reporting. Our team reviews these within 24 hours." : "Couldn\u{2019}t send report. Try again.")
        }
    }

    private func performBlock(targetId: String, username: String?) async {
        let ok = await BlockService.shared.block(targetId: targetId)
        await MainActor.run {
            if ok {
                let label = username.map { "@\($0)" } ?? "User"
                flashModerationToast("\(label) blocked.")
            } else {
                flashModerationToast("Couldn\u{2019}t block. Try again.")
            }
        }
    }

    @MainActor
    private func flashModerationToast(_ text: String) {
        moderationToast = text
        Task {
            try? await Task.sleep(nanoseconds: 2_400_000_000)
            await MainActor.run {
                if moderationToast == text { moderationToast = nil }
            }
        }
    }

    // MARK: - EXPERT_THREADS Wave 5 — thread-mode helpers

    /// Build the `<rootId>:<askerId>:<expertId>` chain key that maps a
    /// (root, asker, expert) tuple to its row in `expert_thread_chains`.
    private func chainKey(root: String, asker: String, expert: String) -> String {
        "\(root):\(asker):\(expert)"
    }

    /// Load expert_thread_chains rows for all visible thread roots so
    /// commentRow can render "N replies left" / "cap reached" affordances
    /// without a per-render query. Mirrors web CommentThread.tsx behaviour.
    private func loadExpertThreadChains(comments: [VPComment]) async {
        let rootIds = comments
            .filter { $0.isExpertThreadRoot == true }
            .map(\.id)
        guard !rootIds.isEmpty else {
            await MainActor.run { threadChainsByKey = [:] }
            return
        }
        struct ChainRow: Decodable {
            let threadRootId: String
            let askerUserId: String
            let expertUserId: String
            let askerReplyCount: Int
            let freePassGrantedAt: String?

            enum CodingKeys: String, CodingKey {
                case threadRootId = "thread_root_id"
                case askerUserId = "asker_user_id"
                case expertUserId = "expert_user_id"
                case askerReplyCount = "asker_reply_count"
                case freePassGrantedAt = "free_pass_granted_at"
            }
        }
        let rows: [ChainRow] = (try? await client.from("expert_thread_chains")
            .select("thread_root_id, asker_user_id, expert_user_id, asker_reply_count, free_pass_granted_at")
            .in("thread_root_id", values: rootIds)
            .execute().value) ?? []
        var map: [String: ThreadChainState] = [:]
        let iso = ISO8601DateFormatter()
        for row in rows {
            let granted = row.freePassGrantedAt.flatMap { iso.date(from: $0) }
            map[chainKey(root: row.threadRootId, asker: row.askerUserId, expert: row.expertUserId)] =
                ThreadChainState(
                    rootId: row.threadRootId,
                    askerId: row.askerUserId,
                    expertId: row.expertUserId,
                    askerReplyCount: row.askerReplyCount,
                    freePassGrantedAt: granted
                )
        }
        await MainActor.run { threadChainsByKey = map }
    }

    /// Returns the comment that's the thread-root for the given comment
    /// (itself if `isExpertThreadRoot`, else the parent referenced by
    /// `expertThreadRootId`, else nil).
    private func threadRoot(for comment: VPComment) -> VPComment? {
        if comment.isExpertThreadRoot == true { return comment }
        if let rid = comment.expertThreadRootId {
            return comments.first { $0.id == rid }
        }
        return nil
    }

    /// Spec §2 "Asker reply cap: ≤ 2 per expert chain in that thread."
    /// Returns nil when no chain row exists yet (e.g. asker hasn't posted
    /// a reply since the @expert root).
    private func askerRepliesLeft(rootId: String, askerId: String, expertId: String) -> Int? {
        guard let chain = threadChainsByKey[chainKey(root: rootId, asker: askerId, expert: expertId)] else {
            return nil
        }
        if chain.freePassGrantedAt != nil { return nil }   // unlimited
        // Default cap is 2 (spec §2.5 default).
        return max(0, 2 - chain.askerReplyCount)
    }

    /// Asker close-thread. Server enforces the 60-sec cooldown computed as
    /// `GREATEST(last_expert_reply_at, last_reopen_at) + close_cooldown`.
    /// 429 with `wait_for_cooldown` surfaces as a countdown.
    private func closeThread(rootId: String) async {
        guard let session = try? await client.auth.session else { return }
        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/comments/\(rootId)/close", relativeTo: site) else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse else { return }
            if http.statusCode == 429 {
                struct CooldownResp: Decodable {
                    let ok: Bool?
                    let reason: String?
                    let secondsRemaining: Int?
                    enum CodingKeys: String, CodingKey {
                        case ok, reason
                        case secondsRemaining = "seconds_remaining"
                    }
                }
                if let parsed = try? JSONDecoder().decode(CooldownResp.self, from: data),
                   parsed.reason == "wait_for_cooldown",
                   let secs = parsed.secondsRemaining {
                    await MainActor.run {
                        closeCooldownByRoot[rootId] = secs
                        startCloseCooldownTask(rootId: rootId)
                        flashModerationToast("Wait \(secs)s before closing.")
                    }
                    return
                }
            }
            if !(200...299).contains(http.statusCode) {
                await MainActor.run { flashModerationToast("Couldn\u{2019}t close thread.") }
                return
            }
            await MainActor.run {
                if let idx = comments.firstIndex(where: { $0.id == rootId }) {
                    comments[idx].expertThreadClosedAt = Date()
                }
                flashModerationToast("Thread closed.")
            }
        } catch {
            await MainActor.run { flashModerationToast("Couldn\u{2019}t close thread.") }
        }
    }

    /// Mod reopen — clears `expert_thread_closed_at`, sets `last_reopen_at`.
    /// Permission gate: `comments.moderate`.
    private func reopenThread(rootId: String) async {
        guard let session = try? await client.auth.session else { return }
        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/comments/\(rootId)/close?action=reopen", relativeTo: site) else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        do {
            let (_, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                await MainActor.run { flashModerationToast("Couldn\u{2019}t reopen thread.") }
                return
            }
            await MainActor.run {
                if let idx = comments.firstIndex(where: { $0.id == rootId }) {
                    comments[idx].expertThreadClosedAt = nil
                    comments[idx].lastReopenAt = Date()
                }
                flashModerationToast("Thread reopened.")
            }
        } catch {
            await MainActor.run { flashModerationToast("Couldn\u{2019}t reopen thread.") }
        }
    }

    /// Lift the asker's reply cap for a single (asker, expert) chain.
    /// Permission: `comments.expert_thread.allow_followup`. The expert must
    /// also have posted in the thread (RPC enforces).
    private func grantFreePass(rootId: String, askerUserId: String) async {
        guard let session = try? await client.auth.session else { return }
        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/expert/threads/\(rootId)/grant", relativeTo: site) else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["asker_user_id": askerUserId])
        do {
            let (_, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                await MainActor.run { flashModerationToast("Couldn\u{2019}t grant another reply.") }
                return
            }
            await MainActor.run {
                guard let myId = auth.currentUser?.id else { return }
                let key = chainKey(root: rootId, asker: askerUserId, expert: myId)
                if var chain = threadChainsByKey[key] {
                    chain.freePassGrantedAt = Date()
                    threadChainsByKey[key] = chain
                } else {
                    // No row yet — synthesize so UI flips immediately.
                    threadChainsByKey[key] = ThreadChainState(
                        rootId: rootId,
                        askerId: askerUserId,
                        expertId: myId,
                        askerReplyCount: 0,
                        freePassGrantedAt: Date()
                    )
                }
                flashModerationToast("Asker can reply again.")
            }
        } catch {
            await MainActor.run { flashModerationToast("Couldn\u{2019}t grant another reply.") }
        }
    }

    @MainActor
    private func startCloseCooldownTask(rootId: String) {
        closeCooldownTasks[rootId]?.cancel()
        closeCooldownTasks[rootId] = Task { @MainActor in
            while let s = closeCooldownByRoot[rootId], s > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
                if let cur = closeCooldownByRoot[rootId] {
                    closeCooldownByRoot[rootId] = max(0, cur - 1)
                }
            }
            closeCooldownByRoot.removeValue(forKey: rootId)
            closeCooldownTasks.removeValue(forKey: rootId)
        }
    }

    /// Spec §2 "Distinctive expert reply chrome — attaches to
    /// `author.is_expert AND article.category ∈ author.verified_categories`,
    /// NOT to thread mode."
    private func showsExpertChrome(_ comment: VPComment) -> Bool {
        guard comment.users?.isExpert == true else { return false }
        guard let articleCat = story.categoryId else { return false }
        let cats = comment.users?.verifiedCategoryIds ?? []
        return cats.contains(articleCat)
    }

    // MARK: - Comment post + upvote
    private func postComment() async {
        let body = commentText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        guard let session = try? await client.auth.session else { return }
        commentSubmitting = true
        defer { commentSubmitting = false }

        // Route through /api/comments so rate limits, quiz gate, banned-user
        // check, and counters all apply. Direct Supabase insert would skip those.
        let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/comments")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        // POST /api/comments expects { article_id, body, parent_id?, mentions? }.
        // mentions is empty; free-tier mentions are stripped server-side per D21.
        struct Payload: Encodable {
            let article_id: String
            let body: String
            let parent_id: String?
        }
        let parentId = replyingTo?.id
        req.httpBody = try? JSONEncoder().encode(
            Payload(article_id: story.id, body: body, parent_id: parentId)
        )

        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse else { return }
            if http.statusCode == 200 {
                // Some servers can return 200 with `{ "error": "..." }` if the
                // comment was accepted but moderation deferred or a soft fault
                // occurred. Try the success shape first; fall back to error.
                struct Resp: Decodable { let comment: VPComment }
                struct Err: Decodable { let error: String? }
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601
                if let decoded = try? decoder.decode(Resp.self, from: data) {
                    await MainActor.run {
                        comments.insert(decoded.comment, at: 0)
                        commentText = ""
                        replyingTo = nil
                        composerFocused = false
                        // Success haptic to confirm the comment was posted.
                        UINotificationFeedbackGenerator().notificationOccurred(.success)
                        // Post-send Up Next: show once, only if we have
                        // recommendations queued and the user hasn't already seen
                        // the sheet via the end-of-article trigger.
                        if !upNextStories.isEmpty && !showUpNext {
                            if reduceMotion {
                                showUpNext = true
                            } else {
                                withAnimation(.easeOut(duration: 0.35)) { showUpNext = true }
                            }
                        }
                        let ss = SettingsService.shared
                        if ss.commentBool("rate_limit_comments") {
                            let delay = ss.commentNumber("comment_rate_sec", default: 30)
                            startCommentRateLimit(seconds: delay)
                        }
                    }
                } else {
                    let rawErr = (try? decoder.decode(Err.self, from: data))?.error
                    let err = friendlyApiError(rawErr, fallback: "Comment couldn\u{2019}t be posted. Try again.")
                    await MainActor.run { flashModerationToast(err) }
                }
            } else {
                struct Err: Decodable {
                    let error: String?
                    let composer_message: String?
                    let detail: String?
                }
                let parsed = try? JSONDecoder().decode(Err.self, from: data)
                let rawErr = parsed?.error
                // EXPERT_THREADS Wave 5 — surface the spec-mandated lowercase
                // composer messages verbatim for mention_cap_hit (asker-cap)
                // and the duplicate-@-same-expert reject. Both come back from
                // /api/comments/can-mention or post_comment with the exact
                // copy already lowercase; pass through unchanged.
                let isCapHit = http.statusCode == 429 && rawErr == "mention_cap_hit"
                let isDuplicate = (parsed?.detail == "duplicate_expert_mention")
                    || (rawErr ?? "").lowercased().contains("you've already @'d this expert")
                let err: String = {
                    if let msg = parsed?.composer_message, isCapHit { return msg }
                    if isDuplicate {
                        return "you've already @'d this expert in this comment."
                    }
                    return friendlyApiError(rawErr, fallback: "Couldn\u{2019}t post your comment. Try again.")
                }()
                await MainActor.run {
                    if isCapHit || isDuplicate {
                        // Inline composer notice — same surface as the
                        // picker-rate-limit / duplicate-@-from-picker copy.
                        expertPickerNotice = err
                    } else {
                        flashModerationToast(err)
                    }
                    // Generic 429 (route rate-limit, not mention cap) still
                    // burns the 30-sec submit cooldown; mention_cap_hit is
                    // a daily cap, not a per-second cap, so don't double-
                    // muzzle the composer.
                    if http.statusCode == 429 && !isCapHit {
                        startCommentRateLimit(seconds: 30)
                    }
                }
            }
        } catch {
            Log.d("Post comment error:", error)
            await MainActor.run { flashModerationToast("Couldn\u{2019}t post your comment. Try again.") }
        }
    }

    @MainActor
    private func startCommentRateLimit(seconds: Int) {
        commentRateTask?.cancel()
        commentRateRemainingSec = max(0, seconds)
        guard commentRateRemainingSec > 0 else { return }
        commentRateTask = Task { @MainActor in
            while commentRateRemainingSec > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
                commentRateRemainingSec = max(0, commentRateRemainingSec - 1)
            }
        }
    }

    /// D29 comment voting. Routes through /api/comments/[id]/vote which
    /// calls the `toggle_vote` RPC — the single source of truth for
    /// up/down/clear transitions (kept identical between web and iOS).
    /// POST /api/comments/[id]/agree — toggles agree or disagree.
    /// Server handles: same reaction again = remove; opposite = switch.
    private func reactOnComment(_ comment: VPComment, reaction: String) async {
        let wasAgreed = agreedComments.contains(comment.id)
        let wasDisagreed = disagreedComments.contains(comment.id)
        // Optimistic toggle.
        await MainActor.run {
            UISelectionFeedbackGenerator().selectionChanged()
            if reaction == "agree" {
                if wasAgreed { agreedComments.remove(comment.id) }
                else { agreedComments.insert(comment.id); disagreedComments.remove(comment.id) }
            } else {
                if wasDisagreed { disagreedComments.remove(comment.id) }
                else { disagreedComments.insert(comment.id); agreedComments.remove(comment.id) }
            }
        }
        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/comments/\(comment.id)/agree", relativeTo: site) else { return }
        guard let session = try? await client.auth.session else {
            await MainActor.run {
                agreedComments = wasAgreed ? agreedComments.union([comment.id]) : agreedComments.subtracting([comment.id])
                disagreedComments = wasDisagreed ? disagreedComments.union([comment.id]) : disagreedComments.subtracting([comment.id])
                flashModerationToast("Please sign in again.")
            }
            return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["reaction": reaction])
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                throw URLError(.badServerResponse)
            }
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                await MainActor.run {
                    let serverReaction = json["reaction"] as? String
                    agreedComments = serverReaction == "agree" ? agreedComments.union([comment.id]) : agreedComments.subtracting([comment.id])
                    disagreedComments = serverReaction == "disagree" ? disagreedComments.union([comment.id]) : disagreedComments.subtracting([comment.id])
                }
            }
        } catch {
            await MainActor.run {
                agreedComments = wasAgreed ? agreedComments.union([comment.id]) : agreedComments.subtracting([comment.id])
                disagreedComments = wasDisagreed ? disagreedComments.union([comment.id]) : disagreedComments.subtracting([comment.id])
                flashModerationToast("Couldn\u{2019}t update reaction. Try again.")
            }
        }
    }

    // MARK: - Section A: comment tag chips

    // Order matches web DEFAULT_TAG_KINDS. No insightful/sarcastic.
    private static let commentTagOrder: [(kind: String, label: String, color: Color)] = [
        ("helpful",     "Helpful",     VP.tagHelpful),
        ("context",     "Context",     VP.accent),
        ("cite_needed", "Cite needed", VP.tagCiteNeeded),
        ("off_topic",   "Off-topic",   VP.tagOffTopic),
    ]

    // Returns the community count for a tag kind on a given comment.
    private func tagCount(for comment: VPComment, kind: String) -> Int {
        switch kind {
        case "helpful":    return commentHelpfulCounts[comment.id] ?? comment.helpfulCount ?? 0
        case "context":    return comment.contextTagCount ?? 0
        case "cite_needed": return comment.citeNeededCount ?? 0
        case "off_topic":  return comment.offTopicCount ?? 0
        default:           return 0
        }
    }

    @ViewBuilder
    private func commentTagChipsRow(for comment: VPComment) -> some View {
        let userTags = commentTagsByUser[comment.id] ?? []
        // Active: cast by user OR community count > 0
        let active = Self.commentTagOrder.filter { entry in
            userTags.contains(entry.kind) || tagCount(for: comment, kind: entry.kind) > 0
        }
        let inactive = Self.commentTagOrder.filter { entry in
            !userTags.contains(entry.kind) && tagCount(for: comment, kind: entry.kind) == 0
        }
        if active.isEmpty && !tagPickerOpen(for: comment) {
            Button {
                withAnimation(.easeOut(duration: 0.15)) { tagOpenCommentId = comment.id }
            } label: {
                Text("+ Tag")
                    .font(.system(size: VP.Size.xs, weight: .medium))
                    .foregroundColor(VP.dim.opacity(0.7))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .overlay(RoundedRectangle(cornerRadius: 5).stroke(VP.border, style: StrokeStyle(lineWidth: 1, dash: [4])))
            }
            .buttonStyle(.plain)
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(active, id: \.kind) { entry in
                        tagChipButton(comment: comment, entry: entry, isCast: userTags.contains(entry.kind))
                    }
                    if !inactive.isEmpty {
                        Button {
                            withAnimation(.easeOut(duration: 0.15)) {
                                tagOpenCommentId = tagPickerOpen(for: comment) ? nil : comment.id
                            }
                        } label: {
                            Text(tagPickerOpen(for: comment) ? "\u{2212}" : "+")
                                .font(.system(size: VP.Size.xs, weight: .medium))
                                .foregroundColor(VP.dim.opacity(0.7))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .overlay(RoundedRectangle(cornerRadius: 5).stroke(VP.border, style: StrokeStyle(lineWidth: 1, dash: [4])))
                        }
                        .buttonStyle(.plain)
                    }
                    if tagPickerOpen(for: comment) {
                        ForEach(inactive, id: \.kind) { entry in
                            tagChipButton(comment: comment, entry: entry, isCast: false)
                        }
                    }
                }
            }
        }
    }

    private func tagPickerOpen(for comment: VPComment) -> Bool {
        tagOpenCommentId == comment.id
    }

    @ViewBuilder
    private func tagChipButton(comment: VPComment, entry: (kind: String, label: String, color: Color), isCast: Bool) -> some View {
        let busy = commentTagBusyKey == "\(comment.id):\(entry.kind)"
        Button {
            withAnimation(.easeOut(duration: 0.12)) { tagOpenCommentId = nil }
            Task { await toggleCommentTag(comment, kind: entry.kind) }
        } label: {
            Text(entry.label)
                .font(.system(size: VP.Size.xs, weight: isCast ? .bold : .medium))
                .foregroundColor(isCast ? entry.color : VP.dim)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(isCast ? entry.color.opacity(0.12) : Color.clear)
                .overlay(
                    RoundedRectangle(cornerRadius: 5)
                        .stroke(isCast ? entry.color : VP.border, lineWidth: 1)
                )
                .opacity(busy ? 0.6 : 1)
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .accessibilityLabel("\(isCast ? "Remove" : "Add") \(entry.label) tag")
    }

    /// POSTs through /api/comments/[id]/context-tag. Server-side rate-limits + self-tag
    /// guards apply; we optimistically toggle local state and revert on
    /// any non-2xx.
    private func toggleCommentTag(_ comment: VPComment, kind: String) async {
        let key = "\(comment.id):\(kind)"
        await MainActor.run { commentTagBusyKey = key }
        defer { Task { @MainActor in if commentTagBusyKey == key { commentTagBusyKey = "" } } }

        // Optimistic local toggle.
        let wasCast = (commentTagsByUser[comment.id] ?? []).contains(kind)
        await MainActor.run {
            var set = commentTagsByUser[comment.id] ?? []
            if wasCast { set.remove(kind) } else { set.insert(kind) }
            if set.isEmpty { commentTagsByUser.removeValue(forKey: comment.id) }
            else { commentTagsByUser[comment.id] = set }
            // Pre-emptive helpful_count tweak; server response overrides.
            if kind == "helpful" {
                let current = commentHelpfulCounts[comment.id] ?? comment.helpfulCount ?? 0
                commentHelpfulCounts[comment.id] = max(0, current + (wasCast ? -1 : 1))
            }
        }

        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/comments/\(comment.id)/context-tag", relativeTo: site) else { return }
        guard let session = try? await client.auth.session else {
            await MainActor.run {
                revertCommentTagOptimistic(commentId: comment.id, kind: kind, wasCast: wasCast)
                flashModerationToast("Please sign in again.")
            }
            return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["tag_kind": kind])
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                throw URLError(.badServerResponse)
            }
            // Reconcile with server truth where it ships. RPC returns
            // { tagged, count, tag_kind, helpful_count, is_pinned }.
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                await MainActor.run {
                    if let h = json["helpful_count"] as? Int {
                        commentHelpfulCounts[comment.id] = h
                    }
                    if let tagged = json["tagged"] as? Bool {
                        var set = commentTagsByUser[comment.id] ?? []
                        if tagged { set.insert(kind) } else { set.remove(kind) }
                        if set.isEmpty { commentTagsByUser.removeValue(forKey: comment.id) }
                        else { commentTagsByUser[comment.id] = set }
                    }
                    // context_tag_count + is_context_pinned only echo for kind='context'.
                    if kind == "context",
                       let count = json["count"] as? Int,
                       let idx = comments.firstIndex(where: { $0.id == comment.id }) {
                        comments[idx].contextTagCount = count
                        if let pinned = json["is_pinned"] as? Bool {
                            comments[idx].isContextPinned = pinned
                        }
                    }
                }
            }
        } catch {
            await MainActor.run {
                revertCommentTagOptimistic(commentId: comment.id, kind: kind, wasCast: wasCast)
                flashModerationToast("Couldn\u{2019}t update tag. Try again.")
            }
        }
    }

    private func revertCommentTagOptimistic(commentId: String, kind: String, wasCast: Bool) {
        var set = commentTagsByUser[commentId] ?? []
        if wasCast { set.insert(kind) } else { set.remove(kind) }
        if set.isEmpty { commentTagsByUser.removeValue(forKey: commentId) }
        else { commentTagsByUser[commentId] = set }
        if kind == "helpful" {
            let current = commentHelpfulCounts[commentId] ?? 0
            commentHelpfulCounts[commentId] = max(0, current + (wasCast ? 1 : -1))
        }
    }

    // MARK: - C3: Moderator comment actions

    /// C3 — hide a comment (comments.moderate permission required).
    /// POSTs to /api/comments/[id]/hide with a reason in the body so the
    /// server-side hide_comment RPC has audit context. On success, removes
    /// the comment from the local array (optimistic UI). No undo
    /// affordance — the moderator dashboard is the canonical recovery path.
    private func hideComment(_ comment: VPComment) async {
        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/comments/\(comment.id)/hide", relativeTo: site) else { return }
        guard let session = try? await client.auth.session else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = try? JSONSerialization.data(withJSONObject: [
            "reason": "Hidden via iOS moderator action",
        ])
        _ = try? await URLSession.shared.data(for: req)
        // Optimistic UI: remove from local comments array.
        await MainActor.run { comments.removeAll { $0.id == comment.id } }
    }

    /// C3 — flag a comment for supervisor review (comments.supervisor_flag
    /// permission required). POSTs to /api/comments/[id]/flag with the
    /// article's category_id (so the flag routes to the right supervisor
    /// pool) and a fast-lane reason string. No optimistic UI — the comment
    /// stays visible; the flag is a signal to the moderation queue only.
    /// If the article has no category_id (legacy / unbacked stories), we
    /// can't route to a supervisor, so we no-op rather than send a 400.
    private func flagForSupervisor(_ comment: VPComment) async {
        guard let categoryId = story.categoryId else { return }
        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/comments/\(comment.id)/flag", relativeTo: site) else { return }
        guard let session = try? await client.auth.session else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = try? JSONSerialization.data(withJSONObject: [
            "category_id": categoryId,
            "reason": "Flagged for supervisor review via iOS",
        ])
        _ = try? await URLSession.shared.data(for: req)
        // No optimistic UI — the comment stays visible after flagging.
    }

}

// MARK: - Server-graded quiz API shapes (D1/D6/D8/D41)
// Mirrors /api/quiz/start + /api/quiz/submit response bodies. Correct-
// answer data arrives ONLY in the submit response, and only for completed
// attempts — never in /start.

struct APIQuizOption: Codable {
    let text: String
}

struct APIQuizQuestion: Codable, Identifiable {
    let id: String
    let question_text: String
    let options: [APIQuizOption]
}

struct APIQuizAttemptMeta {
    let attempt_number: Int?
    let attempts_used: Int?
    let max_attempts: Int?
}

struct APIQuizStartResponse: Codable {
    let questions: [APIQuizQuestion]
    let attempt_number: Int?
    let attempts_used: Int?
    let max_attempts: Int?
}

struct APIQuizResultRow: Codable, Identifiable {
    let quiz_id: String
    let question_text: String
    let selected_answer: Int?
    let correct_answer: Int
    let is_correct: Bool
    let explanation: String?
    let options: [APIQuizOption]
    var id: String { quiz_id }
}

struct APIQuizSubmitResponse: Codable {
    let passed: Bool
    let correct: Int
    let total: Int
    let percentile: Int?
    let attempts_remaining: Int?
    let results: [APIQuizResultRow]
}

// MARK: - API error mapping

/// Maps raw API error codes to user-facing copy. Strings that are already
/// user-friendly pass through unchanged; developer-shaped codes and schema
/// descriptions return the caller-supplied fallback.
private func friendlyApiError(_ raw: String?, fallback: String) -> String {
    guard let raw = raw?.trimmingCharacters(in: .whitespaces), !raw.isEmpty else {
        return fallback
    }
    switch raw {
    case "comment_too_long", "payload too large":
        return "Your comment is too long."
    case "Unauthenticated":
        return "Please sign in and try again."
    case "Not allowed to post comments":
        return "You\u{2019}re not able to post comments right now."
    case "Not allowed to start quiz":
        return "You don\u{2019}t have access to this quiz."
    case "Forbidden":
        return fallback
    default:
        // Developer-shaped strings that are never meant for users: JSON schema
        // literals, internal field references, and similar internal prefixes.
        if raw.contains("{") ||
           raw.hasPrefix("article_id") ||
           raw.hasPrefix("each answer") ||
           raw.hasPrefix("Kid profile") ||
           raw.hasPrefix("Expected ") {
            return fallback
        }
        return raw
    }
}

// MARK: - Expert picker data shapes (Wave 5)
//
// Mirrors the JSON shape returned by GET /api/expert/picker (Wave 4b on
// web). The picker filters server-side: NOT paused, NOT in quiet hours,
// NOT at per-day quota, NOT at per-post quota for this article. Empty
// `experts` is a valid response — the broadcast button still renders.

struct ExpertPickerData: Codable, Equatable {
    let categoryId: String
    let categoryName: String
    let experts: [ExpertPickerEntry]

    enum CodingKeys: String, CodingKey {
        case categoryId = "category_id"
        case categoryName = "category_name"
        case experts
    }
}

struct ExpertPickerEntry: Codable, Identifiable, Equatable {
    let id: String
    let username: String
    let displayName: String?
    let avatarUrl: String?
    let avatarColor: String?
    let expertTitle: String?

    enum CodingKeys: String, CodingKey {
        case id, username
        case displayName = "display_name"
        case avatarUrl = "avatar_url"
        case avatarColor = "avatar_color"
        case expertTitle = "expert_title"
    }
}

/// Per-(root, asker, expert) chain state for the asker reply-cap affordance.
/// Replies-left = max(0, asker_replies_per_chain - asker_reply_count) when
/// `freePassGrantedAt` is nil; unlimited when set. Spec §2 "Asker reply cap"
/// + §2 "Asker-side reply count affordance."
struct ThreadChainState: Equatable {
    let rootId: String
    let askerId: String
    let expertId: String
    var askerReplyCount: Int
    var freePassGrantedAt: Date?
}

// MARK: - Registration wall sheet (Slice 6)
// Shown to anonymous users who tap Bookmark or the quiz/discussion CTA.
// Presents a half-sheet with a Sign up link; does not require auth context.
private struct RegistrationSheetView: View {
    var body: some View {
        VStack(spacing: 20) {
            Text("Read more on Verity Post")
                .font(.title2.bold())
                .multilineTextAlignment(.center)
            Text("Join free to unlock more.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            VStack(alignment: .leading, spacing: 12) {
                Label("Bookmark articles to read later", systemImage: "bookmark")
                Label("Join discussions after passing the quiz", systemImage: "bubble.left.and.bubble.right")
                Label("Follow topics you care about", systemImage: "star")
            }
            .font(.subheadline)
            Link("Sign up — free", destination: SupabaseManager.shared.siteURL.appendingPathComponent("login"))
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .tint(.primary)
        }
        .padding(28)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }
}
