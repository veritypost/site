import SwiftUI
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
//
// Layout parity with web/src/app/profile/page.tsx (mobile breakpoint):
//   - Flat top bar (brand + Settings) — nav bar hidden like HomeView.
//   - 4-tab strip: Overview / Activity / Categories / Milestones. Underline
//     style with active = VP.text + 600, inactive = VP.dim + 500.
//   - Overview: identity card w/ tier ring + progress-to-next-tier; Quick
//     Links (Messages / Bookmarks / Kids); Profile card preview; Quick
//     stats grid (Articles read / Quizzes completed / Comments).
//   - Activity: filter row (All/Articles/Comments/Bookmarks) + rows. iOS
//     preserves the quiz-attempt rollup from the existing loader — richer
//     than web; intentional iOS-native superset.
//   - Categories: preserved per-category drilldown with subcategory stats
//     + upvotes — richer than web's flat list; iOS-native superset.
//   - Milestones: tier-progress card on top, then achievement grid grouped
//     by category with earned/locked badges.
//
// iOS idioms intentionally preserved (do not match web 1:1):
//   - pull-to-refresh on the outer ScrollView
//   - 44pt tap targets on header buttons
//   - system font stack
//
// Launch-hide gates from the web profile (the `{false && ...}` and
// kill-switch Quick Link gates) are NOT propagated here. iOS shows
// permission-granted features live — the adult app treats perm-gated
// surfaces as product features, not launch-hidden drift.

struct ProfileView: View {
    @EnvironmentObject var auth: AuthViewModel
    @StateObject private var perms = PermissionStore.shared
    private let client = SupabaseManager.shared.client

    // Permission-gated flags. Populated in a `.task(id: perms.changeToken)`.
    @State private var canShareProfileCard: Bool = false
    @State private var canViewCard: Bool = false
    @State private var canViewActivity: Bool = false
    @State private var canViewCategories: Bool = false
    @State private var canViewAchievements: Bool = false
    @State private var canViewBookmarks: Bool = false
    @State private var canViewMessages: Bool = false
    @State private var canViewExpertQueue: Bool = false
    @State private var canViewFamily: Bool = false
    @State private var permsLoaded: Bool = false

    // Tabs — 4-item set mirroring web. Quizzes + Achievements folded into
    // Activity and Milestones respectively (web has no standalone tab for
    // either). Kids surfaces as a Quick Link in Overview.
    enum ProfileTab: String, CaseIterable, Identifiable {
        case overview   = "Overview"
        case activity   = "Activity"
        case categories = "Categories"
        case milestones = "Milestones"
        var id: String { rawValue }
    }
    @State private var tab: ProfileTab = .overview

    // Activity filter — mirrors web's All / Articles / Comments / Bookmarks
    // toggle. iOS also surfaces quiz rows under "Articles" since reads and
    // quiz attempts both map to article-interaction rows.
    enum ActivityFilter: String, CaseIterable, Identifiable {
        case all = "All"
        case articles = "Articles"
        case comments = "Comments"
        case bookmarks = "Bookmarks"
        var id: String { rawValue }
    }
    @State private var activityFilter: ActivityFilter = .all

    // Loaded data
    @State private var activity: [ActivityItem] = []
    @State private var activityLoaded = false
    @State private var bookmarkItems: [BookmarkRow] = []
    @State private var categories: [VPCategory] = []
    @State private var subcategories: [VPSubcategory] = []
    @State private var catStats: [String: CategoryStats] = [:]
    @State private var subStats: [String: CategoryStats] = [:]
    @State private var catUpvotes: [String: Int] = [:]
    @State private var subUpvotes: [String: Int] = [:]
    @State private var milestonesLoaded = false
    @State private var userAchievements: [UserAchievement] = []
    @State private var achievementsLoaded = false
    @State private var scoreTiers: [ScoreTierRow] = []

    // Expansion state (milestones / categories drilldown)
    @State private var expandedCat: String? = nil
    @State private var expandedSub: String? = nil

    // Story nav
    @State private var navigateToSlug: String? = nil
    @State private var navigatedStory: Story? = nil

    // Sheets
    @State private var showSubscription = false

    // Anon state
    @State private var showLogin = false
    @State private var showSignup = false

    // Per-subcategory thresholds for progress bars (match site)
    private let subThresholds: (reads: Int, quizzes: Int, comments: Int, upvotes: Int) = (20, 20, 10, 10)

    // D32: profile card share is now gated by `profile.card.share_link`
    // (server-side plan→permission mapping in `compute_effective_perms`).
    private func profileCardURL(for username: String) -> URL? {
        let encoded = username.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? username
        return URL(string: "https://veritypost.com/card/\(encoded)")
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // Flat top bar — matches HomeView's fix for iOS 26's floating
                // glass-bubble nav. Rendered inside ScrollView, not as a
                // NavigationStack toolbar, so there's no shadow strip.
                topBar

                if let user = auth.currentUser {
                    identityCard(user)
                    tabBar
                    tabContent(user)
                    logoutButton
                } else {
                    anonProfileHero
                }
            }
        }
        .background(VP.bg.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await refreshAll() }
        .task { await SettingsService.shared.loadIfNeeded() }
        .task { await loadScoreTiers() }
        .task(id: tab) { loadTabData() }
        .task(id: perms.changeToken) {
            canShareProfileCard = await PermissionService.shared.has("profile.card.share_link")
            canViewCard = await PermissionService.shared.has("profile.card.view")
            canViewActivity = await PermissionService.shared.has("profile.activity.view.own")
            canViewCategories = await PermissionService.shared.has("profile.score.view.own.categories")
            canViewAchievements = await PermissionService.shared.has("profile.achievements.view.own")
            canViewBookmarks = await PermissionService.shared.has("bookmarks.list.view")
            canViewMessages = await PermissionService.shared.has("messages.inbox.view")
            canViewExpertQueue = await PermissionService.shared.has("expert.queue.view")
            canViewFamily = await PermissionService.shared.has("settings.family.view")
            permsLoaded = true
        }
        .navigationDestination(item: $navigatedStory) { story in
            StoryDetailView(story: story).environmentObject(auth)
        }
        .onChange(of: navigateToSlug) {
            guard let slug = navigateToSlug else { return }
            navigateToSlug = nil
            Task { if let s = await fetchStoryBySlug(slug) { navigatedStory = s } }
        }
        .sheet(isPresented: $showSubscription) { SubscriptionView().environmentObject(auth) }
        .sheet(isPresented: $showLogin) { LoginView().environmentObject(auth) }
        .sheet(isPresented: $showSignup) { SignupView().environmentObject(auth) }
    }

    // MARK: - Top bar (brand + Settings)
    private var topBar: some View {
        HStack(spacing: 0) {
            Text("verity post")
                .font(.system(size: 15, weight: .heavy))
                .tracking(-0.15)
                .foregroundColor(VP.text)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
            Spacer()
            // Mirrors web's PageHeader actions — Kids (if family perm) +
            // Settings. Kids button is hidden until perms resolve to avoid
            // a late-appearing button after mount.
            if permsLoaded && canViewFamily {
                NavigationLink {
                    FamilyDashboardView().environmentObject(auth)
                } label: {
                    Text("Kids")
                        .font(.system(.subheadline, design: .default, weight: .semibold))
                        .foregroundColor(VP.text)
                        .padding(.horizontal, 12)
                        .frame(height: 36)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border))
                }
                .buttonStyle(.plain)
                .padding(.trailing, 8)
            }
            NavigationLink {
                SettingsView().environmentObject(auth)
            } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundColor(VP.dim)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Settings")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(VP.bg)
        .overlay(
            Rectangle().fill(VP.border).frame(height: 1),
            alignment: .bottom
        )
    }

    // MARK: - Anon hero (shown when not logged in)
    private var anonProfileHero: some View {
        VStack(spacing: 14) {
            Spacer().frame(height: 32)
            AvatarView(outerHex: "#818cf8", innerHex: nil, initials: "?", size: 64)
            Text("Guest reader")
                .font(.system(.title3, design: .default, weight: .bold))
                .foregroundColor(VP.text)
            Text("Sign in to track reading, quizzes, streaks, bookmarks, and achievements.")
                .font(.footnote)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button("Sign in") { showLogin = true }
                .font(.system(.subheadline, design: .default, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 28)
                .padding(.vertical, 12)
                .frame(minHeight: 44)
                .background(VP.accent)
                .cornerRadius(10)
            Button("Create free account") { showSignup = true }
                .font(.system(.footnote, design: .default, weight: .medium))
                .foregroundColor(VP.accent)

            Spacer().frame(height: 80)
        }
    }

    // MARK: - Identity card (tier ring + score blocks + progress-to-next)
    //
    // Mirrors web profile's OverviewTab header card:
    //   - avatar wrapped in a conic-gradient ring colored by current tier,
    //     with progress rotation = fraction-to-next-tier
    //   - display name (falls back to username; VPUser has no display_name
    //     column) + tier pill
    //   - "@username · Member since <Month YYYY>"
    //   - 3 score blocks: Verity score / Current streak / Best streak
    //   - progress bar toward the next tier
    @ViewBuilder
    private func identityCard(_ user: VPUser) -> some View {
        let score = user.verityScore ?? 0
        let current = tierFor(score: score)
        let next = nextTier(after: current)
        let minScore = current?.minScore ?? 0
        let range = (next?.minScore ?? 0) - minScore
        let progress: Double = {
            guard let next = next, range > 0 else { return 1.0 }
            _ = next
            return min(1.0, max(0.0, Double(score - minScore) / Double(range)))
        }()
        let tierColor = Color(hex: current?.colorHex ?? "999999")
        let tierLabel = current?.displayName ?? "Newcomer"
        let title = user.username ?? "Reader"

        VStack(spacing: 16) {
            HStack(alignment: .top, spacing: 14) {
                // Tier ring around avatar — conic gradient replicates the
                // web's progress-ring look. SwiftUI has no direct conic
                // conic-gradient rotation API, so we draw a ring trim on
                // top of a full-color circle.
                ZStack {
                    Circle()
                        .trim(from: 0, to: 1)
                        .stroke(VP.border, lineWidth: 3)
                    Circle()
                        .trim(from: 0, to: CGFloat(progress))
                        .stroke(tierColor, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    AvatarView(user: user, size: 64)
                }
                .frame(width: 72, height: 72)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(title)
                            .font(.system(.title3, design: .default, weight: .bold))
                            .foregroundColor(VP.text)
                            .lineLimit(1)
                        VerifiedBadgeView(user: user, size: 10)
                    }

                    // Tier pill — bordered, colored by tier hex.
                    Text(tierLabel)
                        .font(.system(.caption, design: .default, weight: .semibold))
                        .foregroundColor(tierColor)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .overlay(
                            RoundedRectangle(cornerRadius: 99)
                                .stroke(tierColor, lineWidth: 1)
                        )

                    Text(memberSinceLine(user))
                        .font(.caption)
                        .foregroundColor(VP.dim)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }

            // 3 score blocks, matching web's ScoreBlock label copy.
            HStack(alignment: .top, spacing: 0) {
                scoreBlock(label: "Verity score", value: score.formatted())
                Spacer(minLength: 8)
                scoreBlock(label: "Current streak", value: "\(user.streakCurrent ?? 0)d")
                Spacer(minLength: 8)
                scoreBlock(label: "Best streak", value: "\(user.streakBest ?? 0)d")
                Spacer(minLength: 0)
            }

            // Progress-to-next-tier bar — hidden at top tier.
            if let next = next {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Progress to \(next.displayName)")
                            .font(.caption2)
                            .foregroundColor(VP.dim)
                        Spacer()
                        Text("\(score.formatted()) / \(next.minScore.formatted())")
                            .font(.caption2)
                            .foregroundColor(VP.dim)
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 3)
                                .fill(VP.border)
                                .frame(height: 6)
                            RoundedRectangle(cornerRadius: 3)
                                .fill(tierColor)
                                .frame(width: geo.size.width * CGFloat(progress), height: 6)
                        }
                    }
                    .frame(height: 6)
                }
            }
        }
        .padding(20)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border))
        .cornerRadius(12)
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 16)
    }

    private func scoreBlock(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.system(.title2, design: .default, weight: .bold))
                .foregroundColor(VP.text)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(label.uppercased())
                .font(.system(.caption2, design: .default, weight: .semibold))
                .tracking(0.4)
                .foregroundColor(VP.dim)
        }
    }

    private func memberSinceLine(_ user: VPUser) -> String {
        let uname = user.username.map { "@\($0)" } ?? ""
        let since = user.memberSince
        if uname.isEmpty && since.isEmpty { return "" }
        if uname.isEmpty { return "Member since \(since)" }
        if since.isEmpty { return uname }
        return "\(uname) · Member since \(since)"
    }

    // MARK: - Tab bar (4 items, underline style)
    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(ProfileTab.allCases) { t in
                    Button { tab = t } label: {
                        Text(t.rawValue)
                            .font(.system(.subheadline, design: .default, weight: tab == t ? .semibold : .medium))
                            .foregroundColor(tab == t ? VP.text : VP.dim)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .frame(minHeight: 44)
                            .overlay(alignment: .bottom) {
                                Rectangle()
                                    .fill(tab == t ? VP.text : Color.clear)
                                    .frame(height: 2)
                            }
                    }
                    .buttonStyle(.plain)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
        }
        .overlay(alignment: .bottom) {
            Rectangle().fill(VP.border).frame(height: 1)
        }
        .padding(.bottom, 16)
    }

    // MARK: - Tab content dispatch
    @ViewBuilder
    private func tabContent(_ user: VPUser) -> some View {
        switch tab {
        case .overview:   overviewTab(user)
        case .activity:   activityTab
        case .categories: categoriesTab
        case .milestones: milestonesTab(user)
        }
    }

    // MARK: - Overview tab
    @ViewBuilder
    private func overviewTab(_ user: VPUser) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            // Quick Links — the discovery row web calls "My stuff".
            // Rendered only after perms resolve to avoid flicker.
            if permsLoaded && (canViewMessages || canViewBookmarks || canViewFamily || canViewExpertQueue) {
                VStack(alignment: .leading, spacing: 10) {
                    sectionTitle("My stuff")
                    VStack(spacing: 8) {
                        if canViewMessages {
                            quickLink(label: "Messages",
                                      description: "Your direct conversations",
                                      destination: AnyView(MessagesView().environmentObject(auth)))
                        }
                        if canViewBookmarks {
                            quickLink(label: "Bookmarks",
                                      description: "Articles you've saved",
                                      destination: AnyView(BookmarksView().environmentObject(auth)))
                        }
                        if canViewFamily {
                            quickLink(label: "Kids",
                                      description: "Manage your family plan and kid profiles",
                                      destination: AnyView(FamilyDashboardView().environmentObject(auth)))
                        }
                        if canViewExpertQueue {
                            quickLink(label: "Expert Queue",
                                      description: "Questions from readers",
                                      destination: AnyView(ExpertQueueView().environmentObject(auth)))
                        }
                    }
                }
            }

            // Profile card preview — mirrors web's card-preview section.
            if canViewCard, let uname = user.username, !uname.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    sectionTitle("Profile card")
                    Text("A preview of your public card. Share it on socials or link to your public profile.")
                        .font(.caption)
                        .foregroundColor(VP.dim)
                    profileCardPreview(user: user, tierColor: tierColorFor(score: user.verityScore ?? 0))
                    HStack(spacing: 8) {
                        NavigationLink {
                            PublicProfileView(username: uname).environmentObject(auth)
                        } label: {
                            Text("View public card")
                                .font(.system(.footnote, design: .default, weight: .semibold))
                                .foregroundColor(VP.text)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .frame(minHeight: 36)
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border))
                        }
                        .buttonStyle(.plain)

                        if canShareProfileCard, let url = profileCardURL(for: uname) {
                            ShareLink(item: url) {
                                Text("Share")
                                    .font(.system(.footnote, design: .default, weight: .semibold))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 8)
                                    .frame(minHeight: 36)
                                    .background(VP.accent)
                                    .cornerRadius(8)
                            }
                        }
                    }
                }
            }

            // Quick stats — web shows 5 (incl Followers/Following). VPUser
            // doesn't carry follower counts, so iOS shows the 3 stats the
            // adult app has populated. Adding follower counts is a separate
            // data-layer change; tracked as an iOS-native delta.
            VStack(alignment: .leading, spacing: 10) {
                sectionTitle("Quick stats")
                LazyVGrid(columns: [
                    GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8),
                ], spacing: 8) {
                    statCardTile(label: "Articles read", value: "\((user.articlesReadCount ?? 0).formatted())")
                    statCardTile(label: "Quizzes completed", value: "\((user.quizzesCompletedCount ?? 0).formatted())")
                    statCardTile(label: "Comments", value: "\((user.commentCount ?? 0).formatted())")
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.system(.subheadline, design: .default, weight: .semibold))
            .foregroundColor(VP.text)
    }

    private func quickLink(label: String, description: String, destination: AnyView) -> some View {
        NavigationLink { destination } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(label)
                        .font(.system(.subheadline, design: .default, weight: .semibold))
                        .foregroundColor(VP.text)
                    Text(description)
                        .font(.caption)
                        .foregroundColor(VP.dim)
                }
                Spacer()
                Text("\u{203A}")
                    .font(.title3)
                    .foregroundColor(VP.dim)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(VP.card)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
            .cornerRadius(10)
        }
        .buttonStyle(.plain)
    }

    private func profileCardPreview(user: VPUser, tierColor: Color) -> some View {
        HStack(spacing: 12) {
            AvatarView(user: user, size: 44)
            VStack(alignment: .leading, spacing: 2) {
                Text(user.username ?? "Reader")
                    .font(.system(.subheadline, design: .default, weight: .semibold))
                    .foregroundColor(VP.text)
                HStack(spacing: 4) {
                    if let uname = user.username { Text("@\(uname)").font(.caption).foregroundColor(VP.dim) }
                    Text("·").font(.caption).foregroundColor(VP.dim)
                    Text(tierFor(score: user.verityScore ?? 0)?.displayName ?? "Newcomer")
                        .font(.system(.caption, design: .default, weight: .semibold))
                        .foregroundColor(tierColor)
                }
                HStack(spacing: 10) {
                    inlineStat(value: "\((user.verityScore ?? 0).formatted())", label: "score")
                    inlineStat(value: "\(user.streakCurrent ?? 0)d", label: "streak")
                    inlineStat(value: "\((user.articlesReadCount ?? 0).formatted())", label: "read")
                }
                .padding(.top, 2)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
        .cornerRadius(10)
    }

    private func inlineStat(value: String, label: String) -> some View {
        HStack(spacing: 3) {
            Text(value).font(.system(.caption2, design: .default, weight: .bold)).foregroundColor(VP.text)
            Text(label).font(.caption2).foregroundColor(VP.dim)
        }
    }

    private func statCardTile(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.system(.headline, design: .default, weight: .bold))
                .foregroundColor(VP.text)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label)
                .font(.caption2)
                .foregroundColor(VP.dim)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
        .cornerRadius(10)
    }

    // MARK: - Activity tab
    private var activityTab: some View {
        VStack(spacing: 0) {
            // Filter row — mirrors web's secondary-button row.
            HStack(spacing: 8) {
                ForEach(ActivityFilter.allCases) { f in
                    Button { activityFilter = f } label: {
                        Text(f.rawValue)
                            .font(.system(.footnote, design: .default, weight: .semibold))
                            .foregroundColor(activityFilter == f ? .white : VP.dim)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(activityFilter == f ? VP.accent : Color.white)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8).stroke(activityFilter == f ? VP.accent : VP.border)
                            )
                            .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)

            if !activityLoaded {
                ProgressView().padding(.top, 40)
            } else {
                let filtered = filteredActivityItems()
                if filtered.isEmpty {
                    emptyState(
                        title: "No activity yet",
                        description: "Read an article, leave a comment, or save a bookmark to see it here."
                    )
                } else {
                    VStack(spacing: 0) {
                        ForEach(filtered) { item in
                            activityRow(item)
                        }
                    }
                }
            }
        }
    }

    private func filteredActivityItems() -> [ActivityItem] {
        switch activityFilter {
        case .all:       return activity + bookmarkItems.map { $0.asActivityItem }
        case .articles:  return activity.filter { $0.type == .read || $0.type == .quiz }
        case .comments:  return activity.filter { $0.type == .comment }
        case .bookmarks: return bookmarkItems.map { $0.asActivityItem }
        }
    }

    private func activityRow(_ item: ActivityItem) -> some View {
        Button {
            if let slug = item.slug { navigateToSlug = slug }
        } label: {
            HStack(alignment: .top, spacing: 10) {
                Text(activityBadgeLabel(item.type))
                    .font(.system(.caption2, design: .default, weight: .semibold))
                    .foregroundColor(activityColor(item.type))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4)
                            .stroke(activityColor(item.type), lineWidth: 1)
                    )
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.label)
                        .font(.system(.footnote, design: .default, weight: .medium))
                        .foregroundColor(VP.text)
                        .lineLimit(1)
                    if (item.type == .comment || item.type == .bookmark), !item.detail.isEmpty {
                        Text(item.detail)
                            .font(.caption)
                            .foregroundColor(VP.dim)
                            .lineLimit(2)
                    }
                }
                Spacer()
                Text(timeAgo(item.time))
                    .font(.caption2)
                    .foregroundColor(VP.dim)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .bottom) {
                Rectangle().fill(VP.rule).frame(height: 1)
            }
        }
        .buttonStyle(.plain)
    }

    private func activityBadgeLabel(_ t: ActivityItem.ActivityType) -> String {
        switch t {
        case .read:     return "Read"
        case .quiz:     return "Quiz"
        case .comment:  return "Comment"
        case .bookmark: return "Bookmark"
        }
    }

    private func activityColor(_ t: ActivityItem.ActivityType) -> Color {
        switch t {
        case .read:     return VP.readColor
        case .quiz:     return VP.quizColor
        case .comment:  return VP.commentColor
        case .bookmark: return VP.muted
        }
    }

    // MARK: - Categories tab (preserves subcategory drilldown)
    private var categoriesTab: some View {
        VStack(spacing: 10) {
            if !milestonesLoaded {
                ProgressView().padding(.top, 40)
            } else if categories.isEmpty {
                emptyState(
                    title: "No categories yet",
                    description: "Choose topics you care about to personalize your feed and unlock category scoring."
                )
            } else {
                ForEach(categories) { cat in
                    categoryCard(cat)
                }
            }
        }
        .padding(.horizontal, 16)
    }

    private func categoryCard(_ cat: VPCategory) -> some View {
        let subs = subcategories.filter { $0.categoryId == cat.id }
        let isExpanded = expandedCat == cat.id
        let anyProgress = (catStats[cat.id]?.total ?? 0) > 0

        let catReads = catStats[cat.id]?.reads ?? 0
        let catQuizzes = catStats[cat.id]?.quizzes ?? 0
        let catComments = catStats[cat.id]?.comments ?? 0
        let catUpv = catUpvotes[cat.id] ?? 0
        let totalReads = subs.count * subThresholds.reads
        let totalQuizzes = subs.count * subThresholds.quizzes
        let totalComments = subs.count * subThresholds.comments
        let totalUpvotes = subs.count * subThresholds.upvotes

        return VStack(spacing: 0) {
            if !anyProgress {
                VStack(spacing: 6) {
                    Image(systemName: "lock.fill").font(.title2).foregroundColor(VP.dim)
                    Text(cat.displayName).font(.system(.footnote, design: .default, weight: .semibold)).foregroundColor(VP.dim)
                    Text("Start reading to unlock").font(.caption2).foregroundColor(VP.dim)
                }
                .frame(maxWidth: .infinity)
                .padding(14)
                .background(VP.card)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
                .cornerRadius(10)
                .opacity(0.45)
            } else {
                Button {
                    expandedCat = isExpanded ? nil : cat.id
                } label: {
                    HStack {
                        Text(cat.displayName)
                            .font(.system(.subheadline, design: .default, weight: .semibold))
                            .foregroundColor(VP.text)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption).foregroundColor(VP.dim)
                            .rotationEffect(.degrees(isExpanded ? 90 : 0))
                            .animation(.easeOut(duration: 0.2), value: isExpanded)
                    }
                    .padding(14)
                }
                .buttonStyle(.plain)

                if isExpanded {
                    Divider().background(VP.border)
                    VStack(alignment: .leading, spacing: 0) {
                        StatRowView(label: "Read", value: catReads, total: max(totalReads, 1))
                        StatRowView(label: "Quizzes", value: catQuizzes, total: max(totalQuizzes, 1))
                        StatRowView(label: "Comments", value: catComments, total: max(totalComments, 1))
                        StatRowView(label: "Upvotes", value: catUpv, total: max(totalUpvotes, 1))

                        if !subs.isEmpty {
                            Text("SUBCATEGORIES")
                                .font(.system(.caption2, design: .default, weight: .bold))
                                .tracking(1)
                                .foregroundColor(VP.dim)
                                .padding(.top, 4)
                                .padding(.bottom, 6)

                            ForEach(Array(subs.enumerated()), id: \.element.id) { _, sub in
                                subcategoryRow(sub: sub)
                            }
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.bottom, 14)
                }
            }
        }
        .background(anyProgress ? VP.card : Color.clear)
        .cornerRadius(10)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(anyProgress ? VP.border : Color.clear))
    }

    private func subcategoryRow(sub: VPSubcategory) -> some View {
        let stats = subStats[sub.id] ?? CategoryStats()
        let unlocked = stats.total > 0
        let open = expandedSub == sub.id
        let upv = subUpvotes[sub.id] ?? 0

        return VStack(spacing: 0) {
            Button {
                if unlocked { expandedSub = open ? nil : sub.id }
            } label: {
                HStack {
                    if unlocked {
                        Text(sub.name).font(.system(.caption, design: .default, weight: .medium)).foregroundColor(VP.text)
                    } else {
                        HStack(spacing: 4) {
                            Image(systemName: "lock.fill").font(.caption2)
                            Text(sub.name).font(.caption)
                        }
                        .foregroundColor(VP.dim)
                    }
                    Spacer()
                    if unlocked {
                        Image(systemName: "chevron.right")
                            .font(.caption2).foregroundColor(VP.dim)
                            .rotationEffect(.degrees(open ? 90 : 0))
                            .animation(.easeOut(duration: 0.2), value: open)
                    }
                }
                .padding(.vertical, 8)
            }
            .buttonStyle(.plain)
            .overlay(alignment: .bottom) {
                Rectangle().fill(VP.rule).frame(height: 1)
            }

            if unlocked && open {
                VStack(alignment: .leading, spacing: 0) {
                    StatRowView(label: "Read", value: stats.reads, total: subThresholds.reads)
                    StatRowView(label: "Quizzes", value: stats.quizzes, total: subThresholds.quizzes)
                    StatRowView(label: "Comments", value: stats.comments, total: subThresholds.comments)
                    StatRowView(label: "Upvotes", value: upv, total: subThresholds.upvotes)
                }
                .padding(.leading, 8)
                .padding(.vertical, 6)
            }
        }
        .opacity(unlocked ? 1 : 0.5)
    }

    // MARK: - Milestones tab (tier-progress + achievements grouped)
    @ViewBuilder
    private func milestonesTab(_ user: VPUser) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            // Tier progress card — mirrors web's Milestones tier block.
            let score = user.verityScore ?? 0
            let current = tierFor(score: score)
            let next = nextTier(after: current)
            let tierColor = Color(hex: current?.colorHex ?? "999999")
            let tierLabel = current?.displayName ?? "Newcomer"
            let minScore = current?.minScore ?? 0
            let range = (next?.minScore ?? 0) - minScore
            let progress: Double = (next == nil || range <= 0) ? 1.0 : min(1.0, max(0.0, Double(score - minScore) / Double(range)))

            VStack(alignment: .leading, spacing: 8) {
                sectionTitle("Tier progress")
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(tierLabel)
                                .font(.system(.subheadline, design: .default, weight: .bold))
                                .foregroundColor(VP.text)
                            Text(next == nil ? "Top tier reached"
                                 : "\(((next?.minScore ?? 0) - score).formatted()) points to \(next!.displayName)")
                                .font(.caption2)
                                .foregroundColor(VP.dim)
                        }
                        Spacer()
                        Text("\(score.formatted()) pts")
                            .font(.system(.caption, design: .default, weight: .semibold))
                            .foregroundColor(tierColor)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .overlay(
                                RoundedRectangle(cornerRadius: 99).stroke(tierColor, lineWidth: 1)
                            )
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 3).fill(VP.border).frame(height: 6)
                            RoundedRectangle(cornerRadius: 3)
                                .fill(tierColor)
                                .frame(width: geo.size.width * CGFloat(progress), height: 6)
                        }
                    }
                    .frame(height: 6)
                }
                .padding(14)
                .background(VP.card)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
                .cornerRadius(10)
            }

            // Achievements grid — mirrors web's grouped-by-category layout.
            VStack(alignment: .leading, spacing: 10) {
                sectionTitle("Achievements")
                if !achievementsLoaded {
                    ProgressView().padding(.top, 8)
                } else if userAchievements.isEmpty {
                    emptyState(
                        title: "No achievements yet",
                        description: "Complete a quiz or hit your first streak to start collecting badges."
                    )
                } else {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        ForEach(userAchievements) { ua in
                            achievementCard(ua)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    private func achievementCard(_ ua: UserAchievement) -> some View {
        let a = ua.achievements
        return VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .top) {
                Text(a?.name ?? "Achievement")
                    .font(.system(.subheadline, design: .default, weight: .semibold))
                    .foregroundColor(VP.text)
                    .lineLimit(2)
                Spacer(minLength: 4)
                Text("Earned")
                    .font(.system(.caption2, design: .default, weight: .semibold))
                    .foregroundColor(VP.success)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(VP.success, lineWidth: 1))
            }
            if let d = a?.description, !d.isEmpty {
                Text(d)
                    .font(.caption)
                    .foregroundColor(VP.soft)
                    .lineLimit(3)
            }
            if let u = ua.earnedAt {
                Text("Unlocked \(Self.achFormatter.string(from: u))")
                    .font(.caption2)
                    .foregroundColor(VP.dim)
                    .padding(.top, 2)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
        .cornerRadius(10)
    }

    private static let achFormatter: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "MMM d, yyyy"; return f
    }()

    // MARK: - Empty state helper
    private func emptyState(title: String, description: String) -> some View {
        VStack(spacing: 6) {
            Text(title)
                .font(.system(.subheadline, design: .default, weight: .semibold))
                .foregroundColor(VP.text)
            Text(description)
                .font(.caption)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 40)
        .padding(.vertical, 40)
    }

    // MARK: - Logout button
    private var logoutButton: some View {
        Button { Task { await auth.logout() } } label: {
            Text("Sign out")
                .font(.system(.subheadline, design: .default, weight: .semibold))
                .foregroundColor(VP.wrong)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 100)
    }

    // MARK: - Tier helpers (score_tiers)
    struct ScoreTierRow: Decodable, Identifiable {
        let key: String
        let displayName: String
        let minScore: Int
        let colorHex: String?
        let sortOrder: Int?
        var id: String { key }
        enum CodingKeys: String, CodingKey {
            case key
            case displayName = "display_name"
            case minScore = "min_score"
            case colorHex = "color_hex"
            case sortOrder = "sort_order"
        }
    }

    private func tierFor(score: Int) -> ScoreTierRow? {
        // Tiers are sorted ascending by min_score; pick highest whose
        // min_score is <= score.
        var best: ScoreTierRow? = nil
        for t in scoreTiers where t.minScore <= score {
            if best == nil || t.minScore > (best?.minScore ?? Int.min) { best = t }
        }
        return best
    }

    private func nextTier(after current: ScoreTierRow?) -> ScoreTierRow? {
        let currentMin = current?.minScore ?? -1
        let sorted = scoreTiers.sorted { $0.minScore < $1.minScore }
        return sorted.first(where: { $0.minScore > currentMin })
    }

    private func tierColorFor(score: Int) -> Color {
        Color(hex: tierFor(score: score)?.colorHex ?? "999999")
    }

    private func loadScoreTiers() async {
        do {
            let rows: [ScoreTierRow] = try await client.from("score_tiers")
                .select("key, display_name, min_score, color_hex, sort_order")
                .eq("is_active", value: true)
                .order("min_score", ascending: true)
                .execute().value
            scoreTiers = rows
        } catch { Log.d("Load score_tiers error: \(error)") }
    }

    // MARK: - Refresh (pull-to-refresh)
    private func refreshAll() async {
        guard let uid = auth.currentUser?.id else { return }
        async let a: Void = loadActivity(userId: uid)
        async let m: Void = loadMilestones(userId: uid)
        async let ach: Void = loadAchievements(userId: uid)
        async let t: Void = loadScoreTiers()
        _ = await (a, m, ach, t)
    }

    // MARK: - Data loading
    private func loadTabData() {
        guard let userId = auth.currentUser?.id else { return }
        switch tab {
        case .activity where !activityLoaded: Task { await loadActivity(userId: userId) }
        case .categories where !milestonesLoaded: Task { await loadMilestones(userId: userId) }
        case .milestones where !milestonesLoaded: Task { await loadMilestones(userId: userId) }
        case .milestones where !achievementsLoaded: Task { await loadAchievements(userId: userId) }
        default: break
        }
        // Load achievements the first time Milestones opens even if
        // milestones was already loaded (the case statement above bails
        // after the first match).
        if tab == .milestones && !achievementsLoaded {
            Task { await loadAchievements(userId: userId) }
        }
    }

    private func loadActivity(userId: String) async {
        do {
            async let r: [ReadingLogItem] = client.from("reading_log")
                .select("id, read_at, completed, articles(title, slug)")
                .eq("user_id", value: userId)
                .order("created_at", ascending: false).limit(50).execute().value
            async let q: [QuizAttempt] = client.from("quiz_attempts")
                .select("id, article_id, attempt_number, is_correct, points_earned, created_at, articles(title, slug)")
                .eq("user_id", value: userId)
                .order("created_at", ascending: false).limit(200).execute().value
            async let c: [VPComment] = client.from("comments")
                .select("id, body, created_at, articles(title, slug)")
                .eq("user_id", value: userId)
                .order("created_at", ascending: false).limit(50).execute().value
            async let b: [BookmarkJoined] = client.from("bookmarks")
                .select("id, created_at, notes, articles(title, slug)")
                .eq("user_id", value: userId)
                .order("created_at", ascending: false).limit(50).execute().value
            let reads = try await r
            let quizzes_ = try await q
            let comments = try await c
            let bookmarks = (try? await b) ?? []

            var items: [ActivityItem] = []
            for x in reads {
                items.append(ActivityItem(
                    id: "r-\(x.id)", type: .read,
                    label: x.articles?.title ?? "Untitled", slug: x.articles?.slug,
                    detail: (x.completed ?? false) ? "Finished" : "Started",
                    time: x.readAt ?? Date.distantPast))
            }
            var quizGrouped: [String: (correct: Int, total: Int, title: String, slug: String?, time: Date)] = [:]
            for x in quizzes_ {
                let key = "\(x.articleId ?? "")#\(x.attemptNumber ?? 0)"
                var entry = quizGrouped[key] ?? (0, 0, x.articles?.title ?? "Untitled", x.articles?.slug, x.createdAt ?? Date.distantPast)
                entry.total += 1
                if x.isCorrect == true { entry.correct += 1 }
                quizGrouped[key] = entry
            }
            for (key, entry) in quizGrouped {
                items.append(ActivityItem(
                    id: "q-\(key)", type: .quiz,
                    label: entry.title, slug: entry.slug,
                    detail: "\(entry.correct)/\(entry.total)",
                    time: entry.time))
            }
            for x in comments {
                items.append(ActivityItem(
                    id: "c-\(x.id)", type: .comment,
                    label: x.articles?.title ?? "Untitled", slug: x.articles?.slug,
                    detail: x.body ?? "", time: x.createdAt ?? Date.distantPast))
            }
            items.sort { $0.time > $1.time }
            activity = items

            bookmarkItems = bookmarks.map {
                BookmarkRow(
                    id: "b-\($0.id ?? UUID().uuidString)",
                    label: $0.articles?.title ?? "Untitled",
                    slug: $0.articles?.slug,
                    notes: $0.notes ?? "",
                    time: $0.createdAt ?? Date.distantPast
                )
            }
        } catch { Log.d("Load activity error: \(error)") }
        activityLoaded = true
    }

    private func loadMilestones(userId: String) async {
        do {
            async let cats: [VPCategory] = client.from("categories")
                .select()
                .eq("is_kids_safe", value: false).eq("is_active", value: true)
                .order("sort_order").execute().value
            async let reads: [ReadingLogItem] = client.from("reading_log")
                .select("article_id, articles(category_id, subcategory_id)")
                .eq("user_id", value: userId).execute().value
            async let qs: [QuizAttempt] = client.from("quiz_attempts")
                .select("article_id, articles(category_id, subcategory_id)")
                .eq("user_id", value: userId).execute().value
            async let cs: [VPComment] = client.from("comments")
                .select("article_id, articles(category_id, subcategory_id)")
                .eq("user_id", value: userId).execute().value

            categories = try await cats
            subcategories = []

            var cat: [String: CategoryStats] = [:]
            var sub: [String: CategoryStats] = [:]
            func tally(_ c: String?, _ s: String?, _ kp: WritableKeyPath<CategoryStats, Int>) {
                if let c = c { cat[c, default: CategoryStats()][keyPath: kp] += 1 }
                if let s = s { sub[s, default: CategoryStats()][keyPath: kp] += 1 }
            }
            for x in try await reads { tally(x.articles?.categoryId, x.articles?.subcategoryId, \.reads) }
            for x in try await qs { tally(x.articles?.categoryId, x.articles?.subcategoryId, \.quizzes) }
            for x in try await cs { tally(x.articles?.categoryId, x.articles?.subcategoryId, \.comments) }
            catStats = cat
            subStats = sub

            // Upvotes: join comment_votes -> comments (own only) -> articles.
            struct UpRow: Decodable {
                let comments: CommentJoin?
                struct CommentJoin: Decodable {
                    let user_id: String?
                    let articles: StoryJoin?
                    struct StoryJoin: Decodable { let category_id: String?; let subcategory_id: String? }
                }
            }
            let ups: [UpRow] = (try? await client.from("comment_votes")
                .select("comments!inner(user_id, articles(category_id, subcategory_id))")
                .eq("comments.user_id", value: userId)
                .execute().value) ?? []
            var catU: [String: Int] = [:]
            var subU: [String: Int] = [:]
            for u in ups {
                if let cid = u.comments?.articles?.category_id { catU[cid, default: 0] += 1 }
                if let sid = u.comments?.articles?.subcategory_id { subU[sid, default: 0] += 1 }
            }
            catUpvotes = catU
            subUpvotes = subU
        } catch { Log.d("Load milestones error: \(error)") }
        milestonesLoaded = true
    }

    private func loadAchievements(userId: String) async {
        do {
            let data: [UserAchievement] = try await client.from("user_achievements")
                .select("id, user_id, achievement_id, earned_at, achievements(id, name, category, description)")
                .eq("user_id", value: userId)
                .order("earned_at", ascending: false).execute().value
            userAchievements = data
        } catch { Log.d("Load achievements error: \(error)") }
        achievementsLoaded = true
    }

    private func fetchStoryBySlug(_ slug: String) async -> Story? {
        do {
            let list: [Story] = try await client.from("articles")
                .select().eq("slug", value: slug).limit(1).execute().value
            return list.first
        } catch { return nil }
    }
}

// MARK: - Bookmark row for Activity's "Bookmarks" filter

private struct BookmarkJoined: Decodable {
    let id: String?
    let createdAt: Date?
    let notes: String?
    let articles: ArticleJoin?
    struct ArticleJoin: Decodable {
        let title: String?
        let slug: String?
    }
    enum CodingKeys: String, CodingKey {
        case id, notes, articles
        case createdAt = "created_at"
    }
}

struct BookmarkRow: Identifiable {
    let id: String
    let label: String
    let slug: String?
    let notes: String
    let time: Date

    var asActivityItem: ActivityItem {
        ActivityItem(
            id: id,
            type: .bookmark,
            label: label,
            slug: slug,
            detail: notes,
            time: time
        )
    }
}
