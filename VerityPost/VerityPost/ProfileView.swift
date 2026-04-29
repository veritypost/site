import SwiftUI
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-22
//
// World-class profile rebuild (2026-04-22). The screen is a live, dense
// "home for you" — hero stats are always visible; tabs drill into the
// full lists. Layout:
//
//   topBar (flat, shared with HomeView/SettingsView)
//   [ hero card: tier ring + score + tier pill + progress bar + delta-to-next ]
//   [ 30-day streak grid + streak summary row ]
//   [ stat row: Articles read / Quizzes passed / Comments ]
//   [ social row: Followers / Following — gated by profile.followers.view.own ]
//   [ quick action row: Bookmarks / Messages / Share / Kids ]
//   [ recent activity preview — 3 rows + "See all" ]
//   [ achievement preview — 3 tiles + "See all" ]
//   [ tab bar: Overview / Activity / Categories / Milestones ]
//   [ tab content ]
//
// iOS idioms preserved:
//   - pull-to-refresh on the outer ScrollView drives every loader
//   - 44pt tap targets on header/action buttons
//   - light haptic on tab switch + quick-action tap
//   - spring reveal on tier ring / streak grid on first appear
//   - Dynamic Type compatible (relative font styles used everywhere that
//     isn't fixed-size by design like the avatar glyph)
//
// Data sources (real, not mocked):
//   - users.verity_score / streak_current / streak_best / articles_read_count
//     / quizzes_completed_count / comment_count / followers_count /
//     following_count / display_name / bio — loaded by AuthViewModel.loadUser
//   - score_tiers — live query, cached per screen
//   - reading_log (30-day window) — built into a day-set to drive the grid
//   - reading_log / quiz_attempts / comments / bookmarks — activity feed
//   - user_achievements + achievements — badge showcase
//   - comment_votes — per-category upvote tally (milestones tab)

struct ProfileView: View {
    @EnvironmentObject var auth: AuthViewModel
    @ObservedObject private var perms = PermissionStore.shared
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
    @State private var canViewFollowers: Bool = false
    @State private var canViewFollowing: Bool = false
    @State private var permsLoaded: Bool = false
    // T244 — handle for the in-flight pull-to-refresh load. Cancelled
    // before each new pull so two fast drags don't race.
    @State private var refreshTask: Task<Void, Never>? = nil

    // Tabs — 4-item set. Overview is the "profile card + my stuff" deeper
    // view; the hero/stats/streak/quick-actions all sit above the tab bar
    // and stay visible regardless of tab.
    enum ProfileTab: String, CaseIterable, Identifiable {
        case overview   = "Overview"
        case activity   = "Activity"
        case categories = "Categories"
        case milestones = "Milestones"
        var id: String { rawValue }
    }
    @State private var tab: ProfileTab = .overview

    // Activity filter — All / Articles / Comments / Bookmarks
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
    @State private var categoriesLoaded = false
    @State private var userAchievements: [UserAchievement] = []
    /// All achievement definitions (earned + locked). The milestones grid
    /// renders both states — earned first, locked after — mirroring web's
    /// `loadMilestones` / earnedMap pattern at `web/src/app/profile/page.tsx`.
    @State private var allAchievements: [Achievement] = []
    /// Map of achievement_id → earned_at (ISO string), populated from the
    /// user_achievements rows. Empty value means locked.
    @State private var earnedMap: [String: Date] = [:]
    @State private var achievementsLoaded = false
    @State private var scoreTiers: [ScoreTierRow] = []
    @State private var scoreTiersLoaded = false

    // 30-day streak heatmap — midnight-aligned dates with a reading_log row.
    @State private var streakDays: Set<Date> = []
    @State private var streakLoaded = false

    // Reveal animation flags (first-load spring on hero + streak)
    @State private var streakGridReveal: Bool = false

    // Expansion state (milestones / categories drilldown)
    @State private var expandedCat: String? = nil
    @State private var expandedSub: String? = nil

    // Story nav
    @State private var navigateToSlug: String? = nil
    @State private var navigatedStory: Story? = nil

    // Sheets
    @State private var showSubscription = false
    @State private var showAvatarEdit = false

    // Anon state
    @State private var showLogin = false
    @State private var showSignup = false

    // Per-subcategory thresholds for progress bars (match site)
    private let subThresholds: (reads: Int, quizzes: Int, comments: Int, upvotes: Int) = (20, 20, 10, 10)

    // D32: profile card share is gated by `profile.card.share_link`
    // (server-side plan→permission mapping in compute_effective_perms).
    private func profileCardURL(for username: String) -> URL? {
        let encoded = username.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? username
        return URL(string: "https://veritypost.com/card/\(encoded)")
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                topBar

                if let user = auth.currentUser {
                    if user.emailVerified == false {
                        // Web parity: the full hero/stats/streak/activity grid
                        // is hidden until the email is verified. Same copy
                        // and CTA as `web/src/app/profile/page.tsx` around
                        // the `!perms.viewOwn && !user.email_verified` branch.
                        verifyEmailGate
                        logoutButton
                    } else {
                        if user.frozenAt != nil {
                            frozenAccountBanner
                        }
                        heroCard(user)
                        streakStrip(user)
                        statRow(user)
                        socialRow(user)
                        quickActionsRow(user)
                        recentActivityPreview
                        achievementsPreview
                        tabBar
                        tabContent(user)
                        logoutButton
                    }
                } else {
                    anonProfileHero
                }
            }
        }
        .background(VP.bg.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            refreshTask?.cancel()
            refreshTask = Task { await refreshAll() }
            _ = await refreshTask?.value
        }
        .task { await SettingsService.shared.loadIfNeeded() }
        .task { await loadScoreTiers() }
        .task {
            if let uid = auth.currentUser?.id {
                async let a: Void = loadActivity(userId: uid)
                async let s: Void = loadStreak(userId: uid)
                async let ach: Void = loadAchievements(userId: uid)
                _ = await (a, s, ach)
            }
            withAnimation(.spring(response: 0.5, dampingFraction: 0.85)) {
                streakGridReveal = true
            }
        }
        .task(id: tab) { loadTabData() }
        .task(id: perms.changeToken) {
            canShareProfileCard = await PermissionService.shared.has("profile.card.share_link")
            canViewCard = await PermissionService.shared.has("profile.card.view")
            // OwnersAudit Profile Task 5 — switched to canonical short-form
            // keys (per CLAUDE.md). Web has always used these; iOS was on the
            // long-form variants which were a migration-142 artifact the 143
            // rollback was supposed to clean up. Cross-platform parity.
            // Requires the `profile.categories` DB binding migration to ship
            // FIRST — see Ongoing Projects/migrations/
            // 2026-04-26_profile_categories_canonical_binding.sql.
            canViewActivity = await PermissionService.shared.has("profile.activity")
            canViewCategories = await PermissionService.shared.has("profile.categories")
            canViewAchievements = await PermissionService.shared.has("profile.achievements")
            canViewBookmarks = await PermissionService.shared.has("bookmarks.list.view")
            canViewMessages = await PermissionService.shared.has("messages.inbox.view")
            canViewExpertQueue = await PermissionService.shared.has("expert.queue.view")
            canViewFamily = await PermissionService.shared.has("settings.family.view")
            canViewFollowers = await PermissionService.shared.has("profile.followers.view.own")
            canViewFollowing = await PermissionService.shared.has("profile.following.view.own")
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
        .sheet(isPresented: $showAvatarEdit) {
            if let u = auth.currentUser {
                AvatarQuickEditSheet(user: u).environmentObject(auth)
            }
        }
    }

    // MARK: - Top bar (brand + Kids + Settings)
    private var topBar: some View {
        HStack(spacing: 0) {
            // A52 — canonical brand casing is "Verity Post" (Title Case).
            Text("Verity Post")
                .font(.system(size: 15, weight: .heavy))
                .tracking(-0.15)
                .foregroundColor(VP.text)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
            Spacer()
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

    // MARK: - Verify-email gate (web parity)
    //
    // Mirrors the `!perms.viewOwn && !user.email_verified` branch on
    // `web/src/app/profile/page.tsx`. Hides the full profile until the
    // signup verification email is confirmed; resend lives on
    // SettingsView so we keep this surface as a clean dead-end with one
    // CTA back to the verify flow handled at app level.
    private var verifyEmailGate: some View {
        VStack(spacing: 12) {
            Spacer().frame(height: 32)
            Image(systemName: "envelope.badge.shield.half.filled")
                .font(.system(size: 40, weight: .regular))
                .foregroundColor(VP.dim)
            Text("Verify your email")
                .font(.system(.title3, design: .default, weight: .bold))
                .foregroundColor(VP.text)
            Text("Confirm your email to see your reading history, categories, and achievements.")
                .font(.footnote)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button {
                Task { _ = await auth.resendVerificationEmail() }
            } label: {
                Text("Resend verification email")
                    .font(.system(.subheadline, design: .default, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 22)
                    .padding(.vertical, 12)
                    .frame(minHeight: 44)
                    .background(VP.accent)
                    .cornerRadius(10)
            }
            Spacer().frame(height: 20)
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Frozen account banner (web parity)
    //
    // Mirrors the inline red notice on `web/src/app/profile/page.tsx`
    // shown when `user.frozen_at` is non-null. Tapping the banner opens
    // the SubscriptionView sheet so the resubscribe path is one tap.
    private var frozenAccountBanner: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            showSubscription = true
        } label: {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "snowflake")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(VP.danger)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Your Verity Score is frozen")
                        .font(.system(.footnote, design: .default, weight: .semibold))
                        .foregroundColor(VP.danger)
                    Text("Resubscribe to resume tracking progress.")
                        .font(.caption)
                        .foregroundColor(VP.danger.opacity(0.85))
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right")
                    .font(.caption2)
                    .foregroundColor(VP.danger)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(VP.danger.opacity(0.08))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.danger.opacity(0.32)))
            .cornerRadius(10)
            .padding(.horizontal, 16)
            .padding(.top, 12)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Verity Score frozen. Resubscribe to resume tracking.")
    }

    // MARK: - Hero card (avatar + display name + verity score)
    //
    // Per owner direction: no tier chip, no overall progress bar, no
    // delta-to-next caption. Tier identity stays neutral (rule
    // `feedback_no_color_per_tier`). Per-category progress bars live on
    // the Categories tab — those are engagement meters, unrelated to
    // tier visuals.
    @ViewBuilder
    private func heroCard(_ user: VPUser) -> some View {
        let score = user.verityScore ?? 0
        let displayTitle = (user.displayName?.trimmingCharacters(in: .whitespaces).isEmpty == false
                            ? user.displayName
                            : user.username) ?? "Reader"

        HStack(alignment: .center, spacing: 14) {
            Button {
                showAvatarEdit = true
            } label: {
                AvatarView(user: user, size: 68)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Edit avatar color and display name")

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Text(displayTitle)
                        .font(.system(size: 22, weight: .semibold, design: .serif))
                        .foregroundColor(VP.ink)
                        .lineLimit(1)
                    VerifiedBadgeView(user: user, size: 11)
                    if user.isExpert == true,
                       let title = user.expertTitle?.trimmingCharacters(in: .whitespaces),
                       !title.isEmpty {
                        Text(title)
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(VP.inkSoft)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(VP.surfaceSunken)
                            .overlay(
                                RoundedRectangle(cornerRadius: 4, style: .continuous)
                                    .stroke(VP.borderSoft)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                            .lineLimit(1)
                    }
                }

                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(score.formatted())
                        .font(.system(size: 22, weight: .heavy))
                        .tracking(-0.5)
                        .foregroundColor(VP.ink)
                        .contentTransition(.numericText())
                    Text("Verity score")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(VP.inkMuted)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(VP.surfaceRaised)
        .overlay(
            RoundedRectangle(cornerRadius: VP.Radius.lg, style: .continuous)
                .stroke(VP.borderSoft)
        )
        .clipShape(RoundedRectangle(cornerRadius: VP.Radius.lg, style: .continuous))
        .vpShadowAmbient()
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
    }

    // MARK: - Streak strip (30-day heatmap grid)
    @ViewBuilder
    private func streakStrip(_ user: VPUser) -> some View {
        let current = user.streakCurrent ?? 0
        let best = user.streakBest ?? 0
        let readDaysIn30 = readDaysInLast30()

        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("Last 30 days")
                    .font(.system(.subheadline, design: .default, weight: .semibold))
                    .foregroundColor(VP.text)
                Spacer()
                Text("\(readDaysIn30) read · \(current)-day streak")
                    .font(.caption)
                    .foregroundColor(VP.dim)
            }

            // 30-day grid — 10 cols × 3 rows, oldest → newest.
            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 10),
                spacing: 6
            ) {
                ForEach(lastNDays(30), id: \.self) { day in
                    let isRead = streakDays.contains(day)
                    let isFuture = day > todayMidnight()
                    RoundedRectangle(cornerRadius: 4)
                        .fill(
                            isFuture ? VP.streakTrack
                            : isRead ? VP.streakActive
                            : VP.streakMissed
                        )
                        .frame(height: 18)
                        .opacity(streakGridReveal ? 1 : 0)
                        .scaleEffect(streakGridReveal ? 1 : 0.6)
                        .animation(
                            .spring(response: 0.45, dampingFraction: 0.75)
                                .delay(Double(dayIndex(day)) * 0.012),
                            value: streakGridReveal
                        )
                        .accessibilityLabel(dayAccessibilityLabel(day: day, isRead: isRead))
                }
            }

            HStack(spacing: 12) {
                legendDot(color: VP.streakActive, label: "Read")
                legendDot(color: VP.streakMissed, label: "Missed")
                Spacer()
                Text("Best: \(best)d")
                    .font(.system(.caption2, design: .default, weight: .semibold))
                    .foregroundColor(VP.dim)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(VP.card)
                    .overlay(RoundedRectangle(cornerRadius: 99).stroke(VP.border))
                    .cornerRadius(99)
            }
        }
        .padding(14)
        .background(VP.bg)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border))
        .cornerRadius(12)
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }

    private func legendDot(color: Color, label: String) -> some View {
        HStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 8, height: 8)
            Text(label).font(.caption2).foregroundColor(VP.dim)
        }
    }

    // MARK: - Stat row (3 tiles)
    @ViewBuilder
    private func statRow(_ user: VPUser) -> some View {
        HStack(spacing: 8) {
            statTile(
                label: "Articles read",
                value: "\((user.articlesReadCount ?? 0).formatted())",
                icon: "book.fill"
            )
            statTile(
                label: "Quizzes passed",
                value: "\((user.quizzesCompletedCount ?? 0).formatted())",
                icon: "checkmark.seal.fill"
            )
            statTile(
                label: "Comments",
                value: "\((user.commentCount ?? 0).formatted())",
                icon: "bubble.left.fill"
            )
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }

    private func statTile(label: String, value: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(VP.dim)
            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(.system(.title3, design: .default, weight: .bold))
                    .foregroundColor(VP.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(label)
                    .font(.caption2)
                    .foregroundColor(VP.dim)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border))
        .cornerRadius(12)
    }

    // MARK: - Social row (Followers / Following)
    @ViewBuilder
    private func socialRow(_ user: VPUser) -> some View {
        if permsLoaded && (canViewFollowers || canViewFollowing) {
            HStack(spacing: 8) {
                if canViewFollowers {
                    statTile(
                        label: "Followers",
                        value: "\((user.followersCount ?? 0).formatted())",
                        icon: "person.2.fill"
                    )
                }
                if canViewFollowing {
                    statTile(
                        label: "Following",
                        value: "\((user.followingCount ?? 0).formatted())",
                        icon: "person.crop.circle.badge.plus"
                    )
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
    }

    // MARK: - Quick actions row (icon buttons)
    @ViewBuilder
    private func quickActionsRow(_ user: VPUser) -> some View {
        let showShare = canShareProfileCard && (user.username?.isEmpty == false)

        HStack(spacing: 8) {
            if canViewBookmarks {
                NavigationLink {
                    BookmarksView().environmentObject(auth)
                } label: {
                    quickActionChip(icon: "bookmark.fill", label: "Saved")
                }
                .buttonStyle(.plain)
                .simultaneousGesture(TapGesture().onEnded {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                })
            }
            if canViewMessages {
                NavigationLink {
                    MessagesView().environmentObject(auth)
                } label: {
                    quickActionChip(icon: "envelope.fill", label: "Inbox")
                }
                .buttonStyle(.plain)
                .simultaneousGesture(TapGesture().onEnded {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                })
            }
            if showShare, let uname = user.username, let url = profileCardURL(for: uname) {
                ShareLink(item: url) {
                    quickActionChip(icon: "square.and.arrow.up", label: "Share")
                }
            }
            if canViewFamily {
                NavigationLink {
                    FamilyDashboardView().environmentObject(auth)
                } label: {
                    quickActionChip(icon: "figure.2.and.child.holdinghands", label: "Kids")
                }
                .buttonStyle(.plain)
            } else if canViewExpertQueue {
                NavigationLink {
                    ExpertQueueView().environmentObject(auth)
                } label: {
                    quickActionChip(icon: "checkmark.bubble.fill", label: "Expert")
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }

    private func quickActionChip(icon: String, label: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(VP.text)
                .frame(height: 22)
            Text(label)
                .font(.system(.caption2, design: .default, weight: .semibold))
                .foregroundColor(VP.text)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .frame(minHeight: 64)
        .padding(.vertical, 10)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border))
        .cornerRadius(12)
    }

    // MARK: - Recent activity preview (top 3 + see all)
    @ViewBuilder
    private var recentActivityPreview: some View {
        let top3 = Array(combinedActivityAllTypes().prefix(3))
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                sectionTitle("Recent activity")
                Spacer()
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    withAnimation(.easeOut(duration: 0.2)) { tab = .activity }
                } label: {
                    HStack(spacing: 2) {
                        Text("See all")
                            .font(.system(.caption, design: .default, weight: .semibold))
                        Image(systemName: "chevron.right").font(.caption2)
                    }
                    .foregroundColor(VP.dim)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }

            if !activityLoaded {
                compactSkeletonRow()
                compactSkeletonRow()
                compactSkeletonRow()
            } else if top3.isEmpty {
                Text("No activity yet. Read an article or leave a comment.")
                    .font(.caption)
                    .foregroundColor(VP.dim)
                    .padding(.vertical, 8)
            } else {
                VStack(spacing: 0) {
                    ForEach(top3) { item in
                        compactActivityRow(item)
                    }
                }
                .background(VP.card)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border))
                .cornerRadius(12)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }

    private func compactActivityRow(_ item: ActivityItem) -> some View {
        Button {
            if let slug = item.slug { navigateToSlug = slug }
        } label: {
            HStack(alignment: .top, spacing: 10) {
                Text(activityBadgeLabel(item.type))
                    .font(.system(.caption2, design: .default, weight: .bold))
                    .foregroundColor(activityColor(item.type))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4)
                            .stroke(activityColor(item.type), lineWidth: 1)
                    )
                VStack(alignment: .leading, spacing: 1) {
                    Text(item.label)
                        .font(.system(.footnote, design: .default, weight: .medium))
                        .foregroundColor(VP.text)
                        .lineLimit(1)
                    if !item.detail.isEmpty {
                        Text(item.detail)
                            .font(.caption2)
                            .foregroundColor(VP.dim)
                            .lineLimit(1)
                    }
                }
                Spacer()
                Text(timeAgo(item.time))
                    .font(.caption2)
                    .foregroundColor(VP.dim)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .bottom) {
                Rectangle().fill(VP.rule).frame(height: 1)
                    .padding(.leading, 12)
                    .opacity(item.id == compactLastRowId() ? 0 : 1)
            }
        }
        .buttonStyle(.plain)
    }

    private func compactSkeletonRow() -> some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 4).fill(VP.streakTrack)
                .frame(width: 40, height: 14)
            RoundedRectangle(cornerRadius: 4).fill(VP.streakTrack)
                .frame(height: 14)
            Spacer()
            RoundedRectangle(cornerRadius: 4).fill(VP.streakTrack)
                .frame(width: 36, height: 10)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border))
        .cornerRadius(12)
    }

    private func compactLastRowId() -> String {
        combinedActivityAllTypes().prefix(3).last?.id ?? ""
    }

    // MARK: - Achievements preview (top 3 + see all)
    @ViewBuilder
    private var achievementsPreview: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                sectionTitle("Achievements")
                Spacer()
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    withAnimation(.easeOut(duration: 0.2)) { tab = .milestones }
                } label: {
                    HStack(spacing: 2) {
                        Text("See all")
                            .font(.system(.caption, design: .default, weight: .semibold))
                        Image(systemName: "chevron.right").font(.caption2)
                    }
                    .foregroundColor(VP.dim)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }

            if !achievementsLoaded {
                HStack(spacing: 10) {
                    ForEach(0..<3, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 12).fill(VP.streakTrack)
                            .frame(height: 68)
                    }
                }
            } else if userAchievements.isEmpty {
                Text("Complete a quiz or hit your first streak to earn badges.")
                    .font(.caption)
                    .foregroundColor(VP.dim)
                    .padding(.vertical, 8)
            } else {
                HStack(spacing: 10) {
                    ForEach(Array(userAchievements.prefix(3))) { ua in
                        achievementChip(ua)
                    }
                    // If the user has fewer than 3 achievements, pad with
                    // an aspirational "next up" slot so the strip always
                    // renders three cards.
                    if userAchievements.count < 3 {
                        ForEach(0..<(3 - userAchievements.count), id: \.self) { _ in
                            nextAchievementPlaceholder()
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }

    private func achievementChip(_ ua: UserAchievement) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: "rosette")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(VP.success)
            Text(ua.achievements?.name ?? "Badge")
                .font(.system(.caption, design: .default, weight: .semibold))
                .foregroundColor(VP.text)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.success.opacity(0.4)))
        .cornerRadius(12)
    }

    private func nextAchievementPlaceholder() -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: "lock.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(VP.muted)
            Text("Keep reading")
                .font(.system(.caption, design: .default, weight: .semibold))
                .foregroundColor(VP.dim)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color.clear)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                .foregroundColor(VP.border)
        )
    }

    // MARK: - Tab bar (4 items, underline style)
    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(ProfileTab.allCases) { t in
                    Button {
                        UISelectionFeedbackGenerator().selectionChanged()
                        withAnimation(.easeOut(duration: 0.2)) { tab = t }
                    } label: {
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
        case .activity:   if canViewActivity { activityTab } else { lockedTabView() }
        case .categories: if canViewCategories { categoriesTab } else { lockedTabView() }
        case .milestones: if canViewAchievements { milestonesTab(user) } else { lockedTabView() }
        }
    }

    // OwnersAudit Profile Task 2 — single locked-tab view for permission-gated
    // tabs. Mirrors web's `LockedTab` but with the iOS subscription sheet wired
    // through `showSubscription` (the same flow used elsewhere in this view).
    @ViewBuilder
    private func lockedTabView() -> some View {
        VStack(spacing: 14) {
            Spacer().frame(height: 40)
            Text("This tab is part of paid plans.")
                .font(.subheadline)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
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
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
    }

    // MARK: - Overview tab (bio + profile card + my-stuff list)
    @ViewBuilder
    private func overviewTab(_ user: VPUser) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            if let bio = user.bio?.trimmingCharacters(in: .whitespaces), !bio.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    sectionTitle("About")
                    Text(bio)
                        .font(.system(.subheadline, design: .default))
                        .foregroundColor(VP.soft)
                        .fixedSize(horizontal: false, vertical: true)
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

            // My stuff — quick-link list. All entries are perm-gated. The
            // earlier "Leaderboards" QuickLink was removed once the
            // "Most Informed" tab returned to the bottom bar (2026-04-26
            // second-pass IA revert) — the tab is the canonical entry now.
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

            memberSinceFooter(user)
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
                Image(systemName: "chevron.right")
                    .font(.caption)
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
                Text(profileCardTitle(user))
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

    private func profileCardTitle(_ user: VPUser) -> String {
        if let dn = user.displayName?.trimmingCharacters(in: .whitespaces), !dn.isEmpty { return dn }
        return user.username ?? "Reader"
    }

    @ViewBuilder
    private func memberSinceFooter(_ user: VPUser) -> some View {
        let since = user.memberSince
        if !since.isEmpty {
            Text("Member since \(since)")
                .font(.caption2)
                .foregroundColor(VP.dim)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.top, 4)
        }
    }

    // MARK: - Activity tab (full list + filters)
    private var activityTab: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                ForEach(ActivityFilter.allCases) { f in
                    Button {
                        UISelectionFeedbackGenerator().selectionChanged()
                        activityFilter = f
                    } label: {
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
                VStack(spacing: 8) {
                    ForEach(0..<6, id: \.self) { _ in compactSkeletonRow() }
                }
                .padding(.horizontal, 16)
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

    private func combinedActivityAllTypes() -> [ActivityItem] {
        (activity + bookmarkItems.map { $0.asActivityItem })
            .sorted { $0.time > $1.time }
    }

    private func filteredActivityItems() -> [ActivityItem] {
        switch activityFilter {
        case .all:       return combinedActivityAllTypes()
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
            if !categoriesLoaded {
                VStack(spacing: 8) {
                    ForEach(0..<4, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 10)
                            .fill(VP.streakTrack)
                            .frame(height: 48)
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
                    }
                }
                .padding(.horizontal, 16)
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

    // MARK: - Milestones tab (tier-progress + achievement grid)
    @ViewBuilder
    private func milestonesTab(_ user: VPUser) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            let score = user.verityScore ?? 0
            let current = tierFor(score: score)
            let next = nextTier(after: current)
            // Owner rule: no color-per-tier — neutral palette token only.
            let tierColor = VP.muted
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
                            Text(tierProgressSubtitle(score: score, next: next))
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

            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    sectionTitle("Achievements")
                    Spacer()
                    if achievementsLoaded && !allAchievements.isEmpty {
                        Text("\(earnedMap.count) of \(allAchievements.count) earned")
                            .font(.caption)
                            .foregroundColor(VP.dim)
                    }
                }
                if !achievementsLoaded {
                    ProgressView().padding(.top, 8)
                } else if allAchievements.isEmpty {
                    emptyState(
                        title: "No achievements yet",
                        description: "Complete a quiz or hit your first streak to start collecting badges."
                    )
                } else {
                    // Render earned first, then locked — same ordering
                    // convention as the web milestones grid. Each tile
                    // reflects its state: earned (filled, accent badge,
                    // date) vs locked (dimmed silhouette, Locked badge).
                    let earnedFirst = allAchievements.sorted { lhs, rhs in
                        let l = earnedMap[lhs.id] != nil
                        let r = earnedMap[rhs.id] != nil
                        if l != r { return l && !r }
                        return (lhs.name ?? "") < (rhs.name ?? "")
                    }
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        ForEach(earnedFirst) { a in
                            achievementCard(a, earnedAt: earnedMap[a.id])
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    /// Single card used for both earned and locked achievements. The
    /// state is driven by `earnedAt == nil`: locked tiles dim to 0.55
    /// opacity, use a `lock.fill` glyph and a neutral "Locked" badge;
    /// earned tiles are at full opacity with the success "Earned" badge
    /// and the unlocked-on date.
    private func achievementCard(_ a: Achievement, earnedAt: Date?) -> some View {
        let isEarned = earnedAt != nil
        return VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .top) {
                HStack(spacing: 6) {
                    Image(systemName: isEarned ? "rosette" : "lock.fill")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(isEarned ? VP.success : VP.muted)
                    Text(a.name ?? "Achievement")
                        .font(.system(.subheadline, design: .default, weight: .semibold))
                        .foregroundColor(VP.text)
                        .lineLimit(2)
                }
                Spacer(minLength: 4)
                Text(isEarned ? "Earned" : "Locked")
                    .font(.system(.caption2, design: .default, weight: .semibold))
                    .foregroundColor(isEarned ? VP.success : VP.dim)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4)
                            .stroke(isEarned ? VP.success : VP.border, lineWidth: 1)
                    )
            }
            if let d = a.description, !d.isEmpty {
                Text(d)
                    .font(.caption)
                    .foregroundColor(VP.soft)
                    .lineLimit(3)
            }
            if let u = earnedAt {
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
        .opacity(isEarned ? 1 : 0.55)
    }

    private func tierProgressSubtitle(score: Int, next: ScoreTierRow?) -> String {
        guard let next = next else { return "Top tier reached" }
        let delta = max(0, next.minScore - score)
        return "\(delta.formatted()) points to \(next.displayName)"
    }

    private static let achFormatter: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "MMM d, yyyy"; return f
    }()
    private static let dayLabelFmt: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f
    }()
    private static let streakISO = ISO8601DateFormatter()

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

    /// Owner rule: tiers don't get distinct hues. Every tier badge / ring
    /// renders in `VP.muted`. Helper kept so callers don't need to reach
    /// for the palette token directly (and so a future polish pass that
    /// wants to opacity-vary the muted token can land in one place).
    private func tierColorFor(score: Int) -> Color {
        _ = tierFor(score: score)
        return VP.muted
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
        // Always set the loaded flag — even on failure we want the hero to
        // exit the skeleton state and render a "Newcomer" fallback rather
        // than spin forever if score_tiers ever 404s.
        scoreTiersLoaded = true
    }

    // MARK: - Streak grid helpers
    private func todayMidnight() -> Date {
        Calendar.current.startOfDay(for: Date())
    }

    private func lastNDays(_ n: Int) -> [Date] {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        return (0..<n).compactMap { cal.date(byAdding: .day, value: -((n - 1) - $0), to: today) }
    }

    private func dayIndex(_ day: Date) -> Int {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let comps = cal.dateComponents([.day], from: day, to: today)
        return 29 - max(0, min(29, comps.day ?? 0))
    }

    private func readDaysInLast30() -> Int {
        let window = lastNDays(30)
        return window.filter { streakDays.contains($0) }.count
    }

    private func dayAccessibilityLabel(day: Date, isRead: Bool) -> String {
        return "\(ProfileView.dayLabelFmt.string(from: day)): \(isRead ? "read" : "no read")"
    }

    private func loadStreak(userId: String) async {
        struct Row: Decodable { let created_at: Date? }
        do {
            let cal = Calendar.current
            guard let since = cal.date(byAdding: .day, value: -30, to: cal.startOfDay(for: Date())) else { return }
            let iso = ProfileView.streakISO.string(from: since)
            // `.is("kid_profile_id", value: nil)` — every kids-app
            // reading_log row carries the kid_profile_id, so without
            // this filter the parent's own streak grid would also count
            // their kid's reads. Same guard added on every query that
            // joins user_id + a kids-eligible table.
            let rows: [Row] = try await client.from("reading_log")
                .select("created_at")
                .eq("user_id", value: userId)
                .is("kid_profile_id", value: nil)
                .gte("created_at", value: iso)
                .execute().value
            var days: Set<Date> = []
            for r in rows {
                if let d = r.created_at {
                    days.insert(cal.startOfDay(for: d))
                }
            }
            streakDays = days
        } catch { Log.d("Load streak error: \(error)") }
        streakLoaded = true
    }

    // MARK: - Refresh (pull-to-refresh)
    private func refreshAll() async {
        guard let uid = auth.currentUser?.id else { return }
        // Pull every data source the hero + tabs depend on. loadUser
        // re-fetches the users row so follower/score/streak counts update
        // inline without waiting for the next auth tick.
        async let a: Void = loadActivity(userId: uid)
        async let c: Void = loadCategories(userId: uid)
        async let ach: Void = loadAchievements(userId: uid)
        async let t: Void = loadScoreTiers()
        async let s: Void = loadStreak(userId: uid)
        async let u: Void = auth.loadUser(id: uid)
        _ = await (a, c, ach, t, s, u)
    }

    // MARK: - Tab-triggered data loading
    private func loadTabData() {
        guard let userId = auth.currentUser?.id else { return }
        switch tab {
        case .activity where !activityLoaded && canViewActivity:
            Task { await loadActivity(userId: userId) }
        case .categories where !categoriesLoaded && canViewCategories:
            Task { await loadCategories(userId: userId) }
        default: break
        }
        if tab == .milestones && !achievementsLoaded && canViewAchievements {
            Task { await loadAchievements(userId: userId) }
        }
    }

    private func loadActivity(userId: String) async {
        do {
            // reading_log + quiz_attempts carry kid_profile_id when the
            // row originated in the kids app — filter out so the parent's
            // adult Activity feed never surfaces their kid's reads or
            // quizzes. (comments + bookmarks have no kid_profile_id
            // column; kids don't comment or bookmark.)
            async let r: [ReadingLogItem] = client.from("reading_log")
                .select("id, read_at, completed, articles(title, stories(slug))")
                .eq("user_id", value: userId)
                .is("kid_profile_id", value: nil)
                .order("created_at", ascending: false).limit(50).execute().value
            async let q: [QuizAttempt] = client.from("quiz_attempts")
                .select("id, article_id, attempt_number, is_correct, points_earned, created_at, articles(title, stories(slug))")
                .eq("user_id", value: userId)
                .is("kid_profile_id", value: nil)
                .order("created_at", ascending: false).limit(200).execute().value
            async let c: [VPComment] = client.from("comments")
                .select("id, body, created_at, articles(title, stories(slug))")
                .eq("user_id", value: userId)
                .order("created_at", ascending: false).limit(50).execute().value
            async let b: [BookmarkJoined] = client.from("bookmarks")
                .select("id, created_at, notes, articles(title, stories(slug))")
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

    /// Loads the Categories tab data — top-level categories, their
    /// subcategories (`parent_id IS NOT NULL` rows from the same self-
    /// referential `categories` table), and the per-category/per-sub
    /// tally of reads/quizzes/comments/upvotes that drives the progress
    /// bars and lock states. Renamed from `loadMilestones` (the
    /// achievements grid is loaded separately by `loadAchievements`).
    private func loadCategories(userId: String) async {
        do {
            // Pull every active non-kids category in one round trip,
            // then split locally into top-level (parent_id == nil) and
            // sub (parent_id != nil) instead of issuing two queries.
            async let allCats: [VPCategory] = client.from("categories")
                .select()
                .eq("is_kids_safe", value: false).eq("is_active", value: true)
                .order("sort_order").execute().value
            async let reads: [ReadingLogItem] = client.from("reading_log")
                .select("article_id, articles(category_id, subcategory_id)")
                .eq("user_id", value: userId)
                .is("kid_profile_id", value: nil)
                .execute().value
            async let qs: [QuizAttempt] = client.from("quiz_attempts")
                .select("article_id, articles(category_id, subcategory_id)")
                .eq("user_id", value: userId)
                .is("kid_profile_id", value: nil)
                .execute().value
            async let cs: [VPComment] = client.from("comments")
                .select("article_id, articles(category_id, subcategory_id)")
                .eq("user_id", value: userId).execute().value

            let combined = try await allCats
            categories = combined.filter { $0.categoryId == nil }
            // Subcategories share the same VPCategory shape; cast into
            // VPSubcategory so the existing render path (which expects
            // VPSubcategory) keeps working unchanged.
            subcategories = combined
                .filter { $0.categoryId != nil }
                .map { VPSubcategory(id: $0.id, categoryId: $0.categoryId, name: $0.name, slug: $0.slug) }

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
        } catch { Log.d("Load categories error: \(error)") }
        categoriesLoaded = true
    }

    private func loadAchievements(userId: String) async {
        do {
            // Web parity (`web/src/app/profile/page.tsx` loadMilestones):
            // pull every public achievement definition AND the user's
            // earned rows in parallel, then render earned + locked in
            // the same grid. Without the locked half the user has no
            // sense of what's even possible to earn.
            //
            // `.is("kid_profile_id", value: nil)` keeps the parent's
            // adult achievement list separate from any kid-earned rows
            // tied to the same user_id (legacy data).
            async let mineRows: [UserAchievement] = client.from("user_achievements")
                .select("id, user_id, achievement_id, earned_at, achievements(id, name, category, description)")
                .eq("user_id", value: userId)
                .is("kid_profile_id", value: nil)
                .order("earned_at", ascending: false).execute().value
            async let allRows: [Achievement] = client.from("achievements")
                .select("id, name, category, description")
                .eq("is_active", value: true)
                .eq("is_secret", value: false)
                .order("category")
                .order("sort_order")
                .execute().value

            let mine = try await mineRows
            let all = try await allRows
            userAchievements = mine
            allAchievements = all

            var map: [String: Date] = [:]
            for ua in mine {
                if let aid = ua.achievementId, let ts = ua.earnedAt {
                    map[aid] = ts
                }
            }
            earnedMap = map
        } catch { Log.d("Load achievements error: \(error)") }
        achievementsLoaded = true
    }

    private func fetchStoryBySlug(_ slug: String) async -> Story? {
        do {
            struct StoryIdRow: Decodable { let id: String }
            let storyRows: [StoryIdRow] = try await client.from("stories")
                .select("id").eq("slug", value: slug).limit(1).execute().value
            guard let storyId = storyRows.first?.id else { return nil }
            let list: [Story] = try await client.from("articles")
                .select("*, stories(slug)").eq("story_id", value: storyId).limit(1).execute().value
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
        let stories: StorySlugRef?
        var slug: String? { stories?.slug }
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

// MARK: - Avatar quick-edit sheet (color + display name)
//
// Owner: tap-to-edit on the hero avatar. Single source of truth — calls
// the same `update_own_profile` RPC that SettingsView's AccountSettingsView
// uses (with the same avatar_color + display_name shape), so changes flow
// through the canonical write path. No parallel updaters.

struct AvatarQuickEditSheet: View {
    let user: VPUser
    @EnvironmentObject var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss

    // 12-color palette — neutrals + vivids. Enough variety, avoids paralysis.
    private let palette: [String] = [
        "#111827", "#6b7280", "#ffffff",
        "#ef4444", "#f59e0b", "#eab308",
        "#22c55e", "#14b8a6", "#3b82f6",
        "#8b5cf6", "#ec4899", "#f43f5e",
    ]

    @State private var outerColor: String
    @State private var innerColor: String
    @State private var textColor: String
    @State private var initials: String
    @State private var saving = false
    @State private var errorMsg: String?

    init(user: VPUser) {
        self.user = user
        let av = user.avatar
        let existingInitials = av?.initials
            ?? user.displayName?.prefix(1).uppercased()
            ?? user.username?.prefix(1).uppercased()
            ?? ""
        _outerColor = State(initialValue: av?.outer ?? user.avatarColor ?? "#3b82f6")
        _innerColor = State(initialValue: av?.inner ?? "#ffffff")
        _textColor  = State(initialValue: av?.textColor ?? "#111827")
        _initials   = State(initialValue: String(existingInitials.prefix(3)))
    }

    private var displayedInitials: String {
        // 1-3 chars, letters or numbers only, mixed case preserved.
        let filtered = initials.filter { $0.isLetter || $0.isNumber }
        return String(filtered.prefix(3))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    // Live preview — actually renders AvatarView so what you
                    // see here matches what shows on Profile / comments / DMs.
                    // Same stroke width, same font ratio, same tracking rules.
                    AvatarView(
                        outerHex: outerColor,
                        innerHex: innerColor,
                        initials: displayedInitials.isEmpty ? "?" : displayedInitials,
                        textHex: textColor,
                        size: 112
                    )
                    .padding(.top, 8)

                    VStack(alignment: .leading, spacing: 6) {
                        sectionLabel("Initials (1-3 characters)")
                        TextField("Up to 3 letters or numbers", text: $initials)
                            .textFieldStyle(.roundedBorder)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled(true)
                            .onChange(of: initials) { _, newValue in
                                let filtered = newValue.filter { $0.isLetter || $0.isNumber }
                                let capped = String(filtered.prefix(3))
                                if capped != newValue { initials = capped }
                            }
                    }

                    colorPicker(label: "Ring color", selected: $outerColor)
                    colorPicker(label: "Background color", selected: $innerColor)
                    colorPicker(label: "Text color", selected: $textColor)

                    if let err = errorMsg {
                        Text(err)
                            .font(.system(size: 13))
                            .foregroundColor(VP.danger)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(20)
            }
            .background(VP.bg)
            .navigationTitle("Edit avatar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await save() }
                    } label: {
                        if saving { ProgressView() } else { Text("Save").bold() }
                    }
                    .disabled(saving || displayedInitials.isEmpty)
                }
            }
        }
    }

    @ViewBuilder
    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .semibold))
            .foregroundColor(VP.dim)
    }

    @ViewBuilder
    private func colorPicker(label: String, selected: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionLabel(label)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 6), spacing: 10) {
                ForEach(palette, id: \.self) { c in
                    Button {
                        selected.wrappedValue = c
                        UISelectionFeedbackGenerator().selectionChanged()
                    } label: {
                        ZStack {
                            Circle()
                                .fill(Color(hex: c))
                                .overlay(
                                    Circle().strokeBorder(VP.border, lineWidth: c == "#ffffff" ? 1 : 0)
                                )
                                .frame(width: 36, height: 36)
                            if selected.wrappedValue == c {
                                Circle()
                                    .strokeBorder(VP.text, lineWidth: 3)
                                    .frame(width: 44, height: 44)
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .contentShape(Rectangle())
                    }
                    .accessibilityLabel("\(label) \(c)")
                }
            }
        }
    }

    private func save() async {
        saving = true
        errorMsg = nil

        // update_own_profile takes `p_fields` — a jsonb object of column
        // values. Avatar customisation writes both:
        //   - avatar_color (legacy; mirrors ring color so pre-metadata
        //     readers still render right)
        //   - metadata.avatar = { outer, inner, initials, text_color }
        //     (metadata merges server-side; other keys preserved)
        struct AvatarJSON: Encodable {
            let outer: String
            let inner: String
            let initials: String
            let text_color: String
        }
        struct MetadataPatch: Encodable { let avatar: AvatarJSON }
        struct Fields: Encodable {
            let avatar_color: String
            let metadata: MetadataPatch
        }
        struct Args: Encodable { let p_fields: Fields }

        let args = Args(p_fields: Fields(
            avatar_color: outerColor,
            metadata: MetadataPatch(avatar: AvatarJSON(
                outer: outerColor,
                inner: innerColor,
                initials: displayedInitials,
                text_color: textColor
            ))
        ))

        do {
            let client = SupabaseManager.shared.client
            try await client.rpc("update_own_profile", params: args).execute()
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            if let id = auth.currentUser?.id {
                await auth.loadUser(id: id)
            }
            await MainActor.run { dismiss() }
        } catch {
            await MainActor.run {
                errorMsg = "Couldn't save. Try again."
                saving = false
            }
        }
    }
}
