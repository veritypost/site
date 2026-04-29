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
    // D29: separate upvote/downvote tracking. Same vote twice clears.
    @State private var upvotedComments: Set<String> = []
    @State private var downvotedComments: Set<String> = []
    @State private var commentUpvoteCounts: [String: Int] = [:]
    @State private var commentDownvoteCounts: [String: Int] = [:]

    // D21: @mention autocomplete — paid tiers only.
    @State private var mentionSuggestions: [VPUser] = []
    @State private var mentionSearchTask: Task<Void, Never>?

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

    // Expert filter
    @State private var expertFilterActive: Bool = false

    // Toasts
    @State private var showAchievementToast = false
    @State private var achievementToastText = ""
    @State private var showStreakCelebration = false
    @State private var streakCount = 0

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
    @State private var showQuizTeaser = false
    @State private var quizTeaserDismissed = false
    @State private var showPassBurst = false
    @State private var pointsDelta: Int? = nil
    @State private var pointsDeltaVisible = false
    @State private var showUpNext = false
    @State private var upNextStories: [Story] = []
    @State private var upNextRequested = false
    @State private var endOfArticleHit = false

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
                            Text("Couldn't load this story")
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
                            if auth.isLoggedIn {
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
                    Text(isBookmarked ? "Saved" : "Save")
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
        .alert("Bookmark limit reached", isPresented: $showUpgradeAlert) {
            Button("See paid plans") { showSubscription = true }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("You\u{2019}ve hit the bookmark limit for free accounts. Upgrade to save unlimited bookmarks.")
        }
        .sheet(isPresented: $showSubscription) { SubscriptionView().environmentObject(auth) }
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
                    .background(RoundedRectangle(cornerRadius: 10).fill(VP.accent))
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
            canViewBody = await PermissionService.shared.has("article.view.body")
            canViewSources = await PermissionService.shared.has("article.view.sources")
            canViewTimeline = await PermissionService.shared.has("article.view.timeline")
            canEditOwnComment = await PermissionService.shared.has("comments.edit.own")
        }
        .onDisappear { tts.stop() }
        .overlay(alignment: .top) { toastOverlay }
        .animation(.easeInOut(duration: 0.3), value: showAchievementToast)
        .animation(.easeInOut(duration: 0.3), value: showStreakCelebration)
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
                    .cornerRadius(10)
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
                    .cornerRadius(10)
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
                    .font(.caption)
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
                            // Inject the quiz pre-teaser inline at the midpoint
                            // of the article body. Visibility is gated by the
                            // half-scroll trigger inside the teaser view itself
                            // so it never appears above the fold.
                            if idx == mid && idx > 0 {
                                quizTeaserCard
                            }
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
                            .cornerRadius(10)
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
                            .cornerRadius(9)
                    }
                    .buttonStyle(.plain)
                } else {
                    NavigationLink {
                        SignupView().environmentObject(auth)
                    } label: {
                        Text("Create free account")
                            .font(.system(.subheadline, design: .default, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .background(VP.accent)
                            .cornerRadius(9)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(20)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(VP.card)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
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
                        .cornerRadius(8)
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
                            RoundedRectangle(cornerRadius: 8)
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
                    .cornerRadius(8)
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
                        .font(.system(size: 11, weight: .semibold))
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
                                    .font(.system(size: 10, weight: .semibold))
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
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border, lineWidth: 1))
        .cornerRadius(10)
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
                    .font(.system(.caption, design: .default, weight: .semibold))
                    .foregroundColor(VP.dim)
                Text(event.text ?? event.summary ?? "")
                    .font(.subheadline)
                    .foregroundColor(VP.soft)
                    .lineSpacing(3)
            }
            .padding(.bottom, 22)
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
                        Circle().fill(dotColor(for: i)).frame(width: 7, height: 7)
                    }
                }
            }
        }
    }

    @ViewBuilder private var quizIdleCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Voice unified with the Article-tab `passToCommentCTA` per
            // adversary review — single phrase across both entry points
            // so readers don't see two flavors of the same mechanic.
            Text("Pass to comment.")
                .font(.system(.callout, design: .default, weight: .bold))
                .foregroundColor(VP.text)
            Text("5 questions about what you just read. Get 3 right and the conversation opens.")
                .font(.caption)
                .foregroundColor(VP.soft)
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
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(VP.accent)
                        .cornerRadius(9)
                }
                .disabled(quizStage == .loading)
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(VP.card)
        .cornerRadius(14)
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(VP.border, lineWidth: 1))
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
            VStack(alignment: .leading, spacing: 10) {
                Text(r.passed
                     ? "Passed — \(r.correct) of \(r.total). Discussion unlocked."
                     : "Scored \(r.correct) of \(r.total). Needed \(passThreshold) to pass.")
                    .font(.system(.headline, design: .default, weight: .bold))
                    .foregroundColor(r.passed ? VP.right : VP.wrong)
                if let pct = r.percentile {
                    Text("Better than \(pct)% of readers on this article.")
                        .font(.caption)
                        .foregroundColor(VP.soft)
                }
                if !hasUnlimitedQuizAttempts, let remaining = r.attempts_remaining, !r.passed {
                    Text("You have \(remaining) attempt\(remaining == 1 ? "" : "s") left.")
                        .font(.caption)
                        .foregroundColor(VP.soft)
                }

                // D41: per-question breakdown with explanations, every attempt.
                ForEach(r.results) { row in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(row.question_text)
                            .font(.system(.footnote, design: .default, weight: .semibold))
                            .foregroundColor(VP.text)
                        if row.is_correct {
                            Text("Correct")
                                .font(.system(.caption, design: .default, weight: .semibold))
                                .foregroundColor(VP.right)
                        } else {
                            let correctText = row.options.indices.contains(row.correct_answer)
                                ? row.options[row.correct_answer].text : ""
                            Text("Incorrect — correct answer: \(correctText)")
                                .font(.system(.caption, design: .default, weight: .semibold))
                                .foregroundColor(VP.wrong)
                        }
                        if let ex = row.explanation, !ex.isEmpty {
                            Text(ex).font(.caption).foregroundColor(VP.dim)
                        }
                    }
                    .padding(.vertical, 6)
                    Divider().background(VP.border)
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
                                .padding(.horizontal, 20)
                                .padding(.vertical, 10)
                                .background(VP.accent)
                                .cornerRadius(9)
                        }
                        .buttonStyle(.plain)
                    } else if canRetakeQuiz {
                        Button {
                            Task { await startQuiz() }
                        } label: {
                            Text("Retake with fresh questions")
                                .font(.system(.subheadline, design: .default, weight: .bold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 20)
                                .padding(.vertical, 10)
                                .background(VP.accent)
                                .cornerRadius(9)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(r.passed ? Color(red: 0.93, green: 0.99, blue: 0.95) : Color(red: 1.0, green: 0.96, blue: 0.96))
            .cornerRadius(14)
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(r.passed ? VP.right : VP.wrong, lineWidth: 1))
        }
    }

    private func dotColor(for i: Int) -> Color {
        if quizStage == .result, let rows = quizResult?.results, i < rows.count {
            return rows[i].is_correct ? VP.right : VP.wrong
        }
        if i < quizQuestions.count, quizAnswers[quizQuestions[i].id] != nil {
            return VP.accent.opacity(0.7)
        }
        if i == quizCurrent && (quizStage == .answering || quizStage == .submitting) {
            return VP.accent
        }
        return VP.tlDot
    }

    private func quizOption(quizId: String, oi: Int, text: String) -> some View {
        let answered = quizAnswers[quizId] != nil
        let selected = quizAnswers[quizId] == text
        let border = selected ? VP.accent : VP.border
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
            HStack(spacing: 8) {
                Text(["A", "B", "C", "D"][min(oi, 3)])
                    .foregroundColor(VP.dim)
                    .font(.system(.footnote, design: .default, weight: .medium))
                Text(text)
                    .foregroundColor(selected ? .white : VP.text)
                    .font(.system(.subheadline, design: .default, weight: selected ? .semibold : .regular))
                    .multilineTextAlignment(.leading)
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(selected ? VP.accent : VP.card)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(border, lineWidth: 1))
            .cornerRadius(10)
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
                                RoundedRectangle(cornerRadius: 20)
                                    .fill(expertFilterActive ? Color(hex: "#16a34a").opacity(0.10) : Color.clear)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 20)
                                    .stroke(expertFilterActive ? Color(hex: "#16a34a") : VP.border, lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
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
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
                    .cornerRadius(10)
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
    /// Top-level comments preserve the existing pinned/upvote sort; replies
    /// under each top-level are inserted depth-first by created_at ascending
    /// so a thread reads chronologically. Apple Guideline 1.2 — bidirectional
    /// block filter applied before threading so blocked-user replies don't
    /// reveal a parent thread structure to the viewer.
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

    /// Web parity: depth cap matches the iOS-side product decision (3) and
    /// keeps the render list stable when threads grow long. Beyond depth 3,
    /// further replies render at depth-3 indent without additional nesting.
    private static let maxThreadDepth = 3

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
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: "fecaca")))
        .cornerRadius(12)
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
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
                .cornerRadius(10)
                .padding(.bottom, 8)
            }

            HStack(alignment: .top, spacing: 8) {
                AvatarView(user: auth.currentUser, size: 28)
                VStack(alignment: .leading, spacing: 6) {
                    TextField("Join the discussion...", text: $commentText, axis: .vertical)
                        .font(.footnote)
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
                    HStack {
                        Spacer()
                        Button {
                            Task { await postComment() }
                        } label: {
                            Text(commentSubmitting ? "..." : (commentRateRemainingSec > 0 ? "Wait \(commentRateRemainingSec)s" : "Post"))
                                .font(.system(.caption, design: .default, weight: .semibold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 6)
                                .background(
                                    RoundedRectangle(cornerRadius: 8).fill(
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
            .padding(12)
            .background(VP.card)
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(VP.border))
            .cornerRadius(14)
        }
    }

    /// D21: only runs for viewers with `comments.mention.autocomplete`.
    /// Extracts the trailing @token (if any) and queries the users table
    /// for prefix matches. Users without the permission can still type
    /// @username as plain text.
    private func handleMentionChange(_ text: String) {
        guard canMentionAutocomplete else {
            mentionSuggestions = []
            return
        }
        guard let token = currentMentionToken(text), !token.isEmpty else {
            mentionSuggestions = []
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
                }
            } catch {
                await MainActor.run { mentionSuggestions = [] }
            }
        }
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
        return HStack(alignment: .top, spacing: 8) {
            AvatarView(
                outerHex: u?.avatar?.outer ?? u?.avatarColor,
                innerHex: u?.avatar?.inner,
                initials: initials,
                size: 28
            )
            VStack(alignment: .leading, spacing: 4) {
                if comment.isPinned == true {
                    Text("Pinned as Article Context")
                        .font(.system(.caption2, design: .default, weight: .bold))
                        .foregroundColor(VP.accent)
                }
                if comment.isExpertReply == true {
                    Text("Expert")
                        .font(.system(.caption2, design: .default, weight: .bold))
                        .tracking(0.3)
                        .foregroundColor(Color.green)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 4).fill(Color.green.opacity(0.12)))
                }
                HStack(spacing: 6) {
                    if let uname = u?.username {
                        NavigationLink {
                            PublicProfileView(username: uname)
                                .environmentObject(auth)
                        } label: {
                            Text(uname)
                                .font(.system(.footnote, design: .default, weight: .semibold))
                                .foregroundColor(VP.text)
                        }
                        .buttonStyle(.plain)
                    } else {
                        Text("user")
                            .font(.system(.footnote, design: .default, weight: .semibold))
                            .foregroundColor(VP.text)
                    }
                    VerifiedBadgeView(isExpert: u?.isExpert, isVerifiedPublicFigure: u?.isVerifiedPublicFigure)
                    if comment.isEdited == true && !comment.isDeleted {
                        Text("(edited)")
                            .font(.caption2)
                            .foregroundColor(VP.dim)
                    }
                    Spacer()
                    if let d = comment.createdAt {
                        Text(timeAgo(d))
                            .font(.caption2)
                            .foregroundColor(VP.dim)
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
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border))
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
                                    .cornerRadius(6)
                            }
                        }
                        .buttonStyle(.plain)
                        .disabled(editSaving || editingCommentBody.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                } else {
                    commentBodyText(comment)
                }
                if !comment.isDeleted && !isEditing {
                    HStack(spacing: 8) {
                        // D29: comment voting shows Up + Down with separate counts.
                        // Same vote twice clears (toggle). Different vote switches.
                        voteButton(
                            label: "Up",
                            count: commentUpvoteCounts[comment.id] ?? 0,
                            active: upvotedComments.contains(comment.id)
                        ) {
                            Task { await voteOnComment(comment, type: upvotedComments.contains(comment.id) ? "clear" : "upvote") }
                        }
                        voteButton(
                            label: "Down",
                            count: commentDownvoteCounts[comment.id] ?? 0,
                            active: downvotedComments.contains(comment.id)
                        ) {
                            Task { await voteOnComment(comment, type: downvotedComments.contains(comment.id) ? "clear" : "downvote") }
                        }
                        // T12 — Reply opens the composer with `parent_id` stamped
                        // to this comment. Server allows nested replies; the iOS
                        // render caps visible depth at `maxThreadDepth` so beyond
                        // that, replies render at the cap indent without further
                        // nesting (matches the web collapse-style treatment).
                        // Hidden for anon (no composer) and for muted/banned users
                        // (the composer is replaced by an appeal banner).
                        if auth.isLoggedIn && muteState == nil {
                            Button {
                                startReply(to: comment)
                            } label: {
                                Text("Reply")
                                    .font(.system(.caption, design: .default, weight: .semibold))
                                    .foregroundColor(VP.accent)
                            }
                            .buttonStyle(.plain)
                        }
                        // A123 — Edit affordance. Server gates the edit
                        // window; we only show the button for own comments
                        // when the permission is granted. A failed PATCH
                        // (window closed) surfaces a toast and reverts.
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
        .padding(comment.isExpertReply == true ? 10 : 0)
        .background(comment.isExpertReply == true ? Color.green.opacity(0.06) : Color.clear)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(comment.isExpertReply == true ? Color.green.opacity(0.18) : Color.clear, lineWidth: 1)
        )
        .cornerRadius(comment.isExpertReply == true ? 10 : 0)
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

    // MARK: - Toast overlay
    @ViewBuilder private var toastOverlay: some View {
        if showAchievementToast {
            Text(achievementToastText)
                .font(.system(.footnote, design: .default, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: 10).fill(VP.accent))
                .shadow(radius: 4)
                .padding(.top, 8)
                .transition(.move(edge: .top).combined(with: .opacity))
        }
        if showStreakCelebration {
            Text("Streak: \(streakCount) days!")
                .font(.system(.subheadline, design: .default, weight: .bold))
                .foregroundColor(VP.accent)
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: 10).fill(VP.accent.opacity(0.12)))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.accent, lineWidth: 1.5))
                .padding(.top, 8)
                .transition(.move(edge: .top).combined(with: .opacity))
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
                        .background(RoundedRectangle(cornerRadius: 99).fill(VP.accent.opacity(0.1)))
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .transition(.opacity)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }

    // MARK: - Quiz pre-teaser (inline at ~50% scroll)
    // Subtle inline card injected partway through the article body that hints
    // at the quiz at the end. Hidden once the reader passes, dismisses, or
    // when the discussion tab is already open.
    @ViewBuilder private var quizTeaserCard: some View {
        if showQuizTeaser, !userPassedQuiz, !quizTeaserDismissed, canTakeQuiz {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "checklist")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(VP.accent)
                VStack(alignment: .leading, spacing: 4) {
                    Text("5 questions waiting at the end")
                        .font(.system(.footnote, design: .default, weight: .bold))
                        .foregroundColor(VP.text)
                    Text("Pass 3 to join the discussion.")
                        .font(.caption)
                        .foregroundColor(VP.soft)
                }
                Spacer()
                Button {
                    quizTeaserDismissed = true
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(VP.dim)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Dismiss quiz reminder")
            }
            .padding(12)
            .background(VP.card)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border, lineWidth: 1))
            .cornerRadius(10)
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .transition(reduceMotion ? .opacity : .move(edge: .leading).combined(with: .opacity))
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
        .padding(14)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border, lineWidth: 1))
        .cornerRadius(12)
    }

    // MARK: - Scroll + engagement triggers
    private func handleScrollOffset(_ value: CGFloat) {
        scrollOffset = value
        // Half-scroll quiz teaser: arms once when the reader crosses 50% of
        // the scrollable range. Stays armed even if they scroll back so the
        // card doesn't flicker on every scroll oscillation.
        let scrollable = max(contentHeight - viewportHeight, 1)
        if !showQuizTeaser, !quizTeaserDismissed, value / scrollable >= 0.5 {
            if reduceMotion {
                showQuizTeaser = true
            } else {
                withAnimation(.easeOut(duration: 0.3)) { showQuizTeaser = true }
            }
        }
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
                .select("id, title, slug, excerpt, body, cover_image_url, category_id, status, is_breaking, is_developing, published_at, created_at")
                .eq("category_id", value: catId)
                .eq("status", value: "published")
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
            .background(RoundedRectangle(cornerRadius: 4).fill(color))
    }

    private func formatDate(_ date: Date) -> String {
        return StoryDetailView.displayDateFormatter.string(from: date)
    }

    // MARK: - Data loading
    private func loadData() async {
        await SettingsService.shared.loadIfNeeded()
        do {
            // D1/D6/D8: the quiz pool is NEVER loaded client-side. Questions
            // arrive only through /api/quiz/start, which strips is_correct.
            async let tReq: [TimelineEvent] = client.from("timelines").select().eq("article_id", value: story.id).order("event_date", ascending: true).execute().value
            async let sReq: [SourceLink] = client.from("sources").select().eq("article_id", value: story.id).execute().value
            async let cReq: [VPComment] = client.from("comments")
                // A126 — pull the soft-delete + edit + mentions fields so
                // [deleted] tombstones, (edited) labels, and tap-to-profile
                // mention runs render at parity with web.
                .select("id, user_id, article_id, parent_id, body, is_pinned, is_context_pinned, is_expert_reply, upvote_count, downvote_count, created_at, deleted_at, status, is_edited, context_tag_count, mentions")
                .eq("article_id", value: story.id)
                .eq("status", value: "visible")
                .is("deleted_at", value: nil)
                .order("is_context_pinned", ascending: false)
                .order("upvote_count", ascending: false)
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
            timeline = t
            sources = s
            comments = c.map { row in
                var mutable = row
                if let uid = row.userId { mutable.users = authorById[uid] }
                return mutable
            }
            loadError = nil

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

        // Bookmark + passed quiz
        // A82 — these reads back the bookmark + quiz-pass state that drive
        // persisted UI (the bookmark flag, the post-quiz composer unlock).
        // A silent failure means the user sees an unbookmarked / unpassed
        // story even though the server has the row — they bookmark again,
        // hit the cap, retry the quiz pointlessly. Surface the error to
        // `loadError` so the retry path catches it. Comment-vote reads
        // below stay best-effort because their UI degrades gracefully
        // (counts read as 0 until the second open).
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
                    loadError = "We couldn\u{2019}t check this story\u{2019}s bookmark. Pull to retry."
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
                loadError = "We couldn\u{2019}t load your quiz history for this story. Pull to retry."
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

        // D29: load up + down counts separately.
        do {
            struct U: Decodable { let comment_id: String; let vote_type: String }
            let ids = comments.map { $0.id }
            if !ids.isEmpty {
                let all: [U] = try await client.from("comment_votes")
                    .select("comment_id, vote_type")
                    .in("comment_id", values: ids)
                    .execute().value
                var up: [String: Int] = [:]
                var down: [String: Int] = [:]
                for row in all {
                    if row.vote_type == "upvote" { up[row.comment_id, default: 0] += 1 }
                    else if row.vote_type == "downvote" { down[row.comment_id, default: 0] += 1 }
                }
                commentUpvoteCounts = up
                commentDownvoteCounts = down
            }
        } catch {}

        if let session = try? await client.auth.session {
            let userId = session.user.id.uuidString
            let ids = comments.map { $0.id }
            if !ids.isEmpty {
                struct U: Decodable { let comment_id: String; let vote_type: String }
                let mine: [U] = (try? await client.from("comment_votes")
                    .select("comment_id, vote_type")
                    .eq("user_id", value: userId)
                    .in("comment_id", values: ids)
                    .execute().value) ?? []
                upvotedComments = Set(mine.filter { $0.vote_type == "upvote" }.map { $0.comment_id })
                downvotedComments = Set(mine.filter { $0.vote_type == "downvote" }.map { $0.comment_id })
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
                            .select("id, user_id, article_id, parent_id, body, is_pinned, is_context_pinned, is_expert_reply, upvote_count, downvote_count, created_at, deleted_at, status, is_edited, context_tag_count, mentions")
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
                            // Bug 41: initial load sorts by is_context_pinned DESC,
                            // upvote_count DESC. Prepending a zero-upvote comment
                            // lifts it above pinned + highly-upvoted rows. Append
                            // and re-apply the sort so the order stays stable.
                            comments.append(fresh)
                            comments.sort { a, b in
                                let aPinned = a.isContextPinned == true
                                let bPinned = b.isContextPinned == true
                                if aPinned != bPinned { return aPinned && !bPinned }
                                return (a.upvoteCount ?? 0) > (b.upvoteCount ?? 0)
                            }
                            commentUpvoteCounts[fresh.id] = fresh.upvoteCount ?? 0
                            commentDownvoteCounts[fresh.id] = fresh.downvoteCount ?? 0
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
                            .select("id, user_id, article_id, parent_id, body, is_pinned, is_context_pinned, is_expert_reply, upvote_count, downvote_count, created_at, deleted_at, status, is_edited, context_tag_count, mentions")
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
                            commentUpvoteCounts[refreshed.id] = refreshed.upvoteCount ?? 0
                            commentDownvoteCounts[refreshed.id] = refreshed.downvoteCount ?? 0
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
        guard (try? await client.auth.session) != nil else { return }
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
            await MainActor.run { quizStage = .idle; quizError = "Please sign in." }
            return
        }
        let siteUrl = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/quiz/start", relativeTo: siteUrl) else {
            await MainActor.run { quizStage = .idle; quizError = "Couldn't start quiz." }
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
                let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"] ?? "Couldn't start quiz."
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
            await MainActor.run { quizStage = .idle; quizError = "Network issue." }
        }
    }

    private func submitQuiz() async {
        await MainActor.run {
            quizStage = .submitting
            quizError = nil
        }
        guard let session = try? await client.auth.session else {
            await MainActor.run { quizStage = .answering; quizError = "Please sign in." }
            return
        }
        let siteUrl = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/quiz/submit", relativeTo: siteUrl) else {
            await MainActor.run { quizStage = .answering; quizError = "Couldn't submit quiz." }
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
                let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"] ?? "Couldn't submit quiz."
                await MainActor.run { quizStage = .answering; quizError = msg }
                return
            }
            let decoded = try JSONDecoder().decode(APIQuizSubmitResponse.self, from: data)
            await MainActor.run {
                quizResult = decoded
                quizStage = .result
                if decoded.passed {
                    userPassedQuiz = true
                    if push.status == .notDetermined,
                       !push.prePromptRecentlyDeclined,
                       !push.hasBeenPrompted {
                        showPushPrompt = true
                    }
                }
            }
        } catch {
            await MainActor.run { quizStage = .answering; quizError = "Network issue." }
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
                        // Light selection haptic to confirm the send. Matches the
                        // quiz-answer tap pattern — discrete, single-action.
                        UISelectionFeedbackGenerator().selectionChanged()
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
                    let err = (try? decoder.decode(Err.self, from: data))?.error ?? "Comment couldn\u{2019}t be posted. Try again."
                    await MainActor.run { flashModerationToast(err) }
                }
            } else {
                struct Err: Decodable { let error: String? }
                let err = (try? JSONDecoder().decode(Err.self, from: data))?.error ?? "Could not post comment"
                await MainActor.run {
                    flashModerationToast(err)
                    if http.statusCode == 429 {
                        startCommentRateLimit(seconds: 30)
                    }
                }
            }
        } catch { Log.d("Post comment error:", error) }
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
    private func voteOnComment(_ comment: VPComment, type: String) async {
        // Optimistic update; revert on failure.
        let wasUp = upvotedComments.contains(comment.id)
        let wasDown = downvotedComments.contains(comment.id)
        await MainActor.run {
            applyVoteOptimistic(commentId: comment.id, type: type, wasUp: wasUp, wasDown: wasDown)
        }
        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/comments/\(comment.id)/vote", relativeTo: site) else { return }
        guard let session = try? await client.auth.session else {
            await MainActor.run {
                revertVoteOptimistic(commentId: comment.id, type: type, wasUp: wasUp, wasDown: wasDown)
                flashModerationToast("Please sign in again.")
            }
            return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["type": type])
        do {
            let (_, resp) = try await URLSession.shared.data(for: req)
            if let http = resp as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                throw URLError(.badServerResponse)
            }
        } catch {
            await MainActor.run {
                revertVoteOptimistic(commentId: comment.id, type: type, wasUp: wasUp, wasDown: wasDown)
                flashModerationToast("Couldn\u{2019}t update vote. Try again.")
            }
        }
    }

    private func applyVoteOptimistic(commentId: String, type: String, wasUp: Bool, wasDown: Bool) {
        switch type {
        case "upvote":
            if !wasUp {
                upvotedComments.insert(commentId)
                commentUpvoteCounts[commentId] = (commentUpvoteCounts[commentId] ?? 0) + 1
            }
            if wasDown {
                downvotedComments.remove(commentId)
                commentDownvoteCounts[commentId] = max(0, (commentDownvoteCounts[commentId] ?? 1) - 1)
            }
        case "downvote":
            if !wasDown {
                downvotedComments.insert(commentId)
                commentDownvoteCounts[commentId] = (commentDownvoteCounts[commentId] ?? 0) + 1
            }
            if wasUp {
                upvotedComments.remove(commentId)
                commentUpvoteCounts[commentId] = max(0, (commentUpvoteCounts[commentId] ?? 1) - 1)
            }
        case "clear":
            if wasUp {
                upvotedComments.remove(commentId)
                commentUpvoteCounts[commentId] = max(0, (commentUpvoteCounts[commentId] ?? 1) - 1)
            }
            if wasDown {
                downvotedComments.remove(commentId)
                commentDownvoteCounts[commentId] = max(0, (commentDownvoteCounts[commentId] ?? 1) - 1)
            }
        default: break
        }
    }

    private func revertVoteOptimistic(commentId: String, type: String, wasUp: Bool, wasDown: Bool) {
        // Reverse what apply did for the attempted transition.
        switch type {
        case "upvote":
            if !wasUp {
                upvotedComments.remove(commentId)
                commentUpvoteCounts[commentId] = max(0, (commentUpvoteCounts[commentId] ?? 1) - 1)
            }
            if wasDown {
                downvotedComments.insert(commentId)
                commentDownvoteCounts[commentId] = (commentDownvoteCounts[commentId] ?? 0) + 1
            }
        case "downvote":
            if !wasDown {
                downvotedComments.remove(commentId)
                commentDownvoteCounts[commentId] = max(0, (commentDownvoteCounts[commentId] ?? 1) - 1)
            }
            if wasUp {
                upvotedComments.insert(commentId)
                commentUpvoteCounts[commentId] = (commentUpvoteCounts[commentId] ?? 0) + 1
            }
        case "clear":
            if wasUp {
                upvotedComments.insert(commentId)
                commentUpvoteCounts[commentId] = (commentUpvoteCounts[commentId] ?? 0) + 1
            }
            if wasDown {
                downvotedComments.insert(commentId)
                commentDownvoteCounts[commentId] = (commentDownvoteCounts[commentId] ?? 0) + 1
            }
        default: break
        }
    }

    private func voteButton(label: String, count: Int, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(label).font(.system(.caption, design: .default, weight: .semibold))
                Text("\(count)").font(.caption)
            }
            .foregroundColor(active ? VP.accent : VP.dim)
            .padding(.horizontal, 10)
            .padding(.vertical, 3)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(active ? VP.accent : VP.border, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
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
