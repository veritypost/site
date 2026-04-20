import SwiftUI
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18

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

    // Sub-tabs
    @State private var tab = "Overview"
    private let tabs = ["Overview", "Activity", "Quizzes", "Milestones", "Achievements", "Kids"]

    // Loaded data
    @State private var activity: [ActivityItem] = []
    @State private var activityLoaded = false
    @State private var quizzes: [QuizDisplay] = []
    @State private var quizzesLoaded = false
    @State private var categories: [VPCategory] = []
    @State private var subcategories: [VPSubcategory] = []
    @State private var catStats: [String: CategoryStats] = [:]
    @State private var subStats: [String: CategoryStats] = [:]
    @State private var catUpvotes: [String: Int] = [:]
    @State private var subUpvotes: [String: Int] = [:]
    @State private var milestonesLoaded = false
    @State private var userAchievements: [UserAchievement] = []
    @State private var achievementsLoaded = false
    @State private var children: [KidProfile] = []
    @State private var kidsLoaded = false

    // Expansion state
    @State private var expandedCat: String? = nil
    @State private var expandedSub: String? = nil

    // Story nav
    @State private var navigateToSlug: String? = nil
    @State private var navigatedStory: Story? = nil

    // Sheets
    @State private var showSubscription = false
    @State private var showFeedbackSheet = false
    @State private var feedbackCategory = "bug"
    @State private var feedbackBody = ""
    @State private var feedbackSubmitting = false
    @State private var editingChild: KidProfile? = nil
    @State private var editChildName = ""
    @State private var showAddChild = false
    @State private var newChildName = ""
    @State private var newChildColor = "#10b981"
    @State private var showPinSheet = false
    @State private var pinInput = ""

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
                if let user = auth.currentUser {
                    identityRow(user)
                    profileNavList(user)
                    logoutButton
                } else {
                    anonProfileHero
                }
            }
        }
        .background(VP.bg.ignoresSafeArea())
        .task { await SettingsService.shared.loadIfNeeded() }
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
        .sheet(isPresented: $showFeedbackSheet) { feedbackSheet }
        .sheet(item: $editingChild) { child in editChildSheet(child) }
        .sheet(isPresented: $showPinSheet) { pinSheet }
    }

    // MARK: - Anon hero (shown when not logged in)
    @State private var showLogin = false
    @State private var showSignup = false

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
        .sheet(isPresented: $showLogin) { LoginView().environmentObject(auth) }
        .sheet(isPresented: $showSignup) { SignupView().environmentObject(auth) }
    }

    // MARK: - Identity card
    //
    // Mirrors site/src/app/profile/page.js: avatar + username card on top,
    // 4-stat grid (Verity Score / Day Streak / Articles Read / Comments)
    // wrapped in a single #f7f7f7 container with inner bordered stat cells.
    private func identityRow(_ user: VPUser) -> some View {
        VStack(spacing: 16) {
            HStack(spacing: 14) {
                AvatarView(user: user, size: 56)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(user.username ?? "")
                            .font(.system(.title3, design: .default, weight: .bold))
                            .foregroundColor(VP.text)
                        VerifiedBadgeView(user: user, size: 10)
                    }
                    Text("\(user.planDisplay) · Member since \(user.memberSince)")
                        .font(.caption)
                        .foregroundColor(VP.dim)
                }
                Spacer()
                // D32: profile card share is permission-gated.
                if canShareProfileCard,
                   let name = user.username, !name.isEmpty,
                   let url = profileCardURL(for: name) {
                    ShareLink(item: url) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.headline)
                            .foregroundColor(VP.dim)
                            .padding(8)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border))
                    }
                }
                NavigationLink {
                    SettingsView().environmentObject(auth)
                } label: {
                    Image(systemName: "gearshape")
                        .font(.headline)
                        .foregroundColor(VP.dim)
                        .padding(8)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border))
                }
            }

            HStack(spacing: 0) {
                statCell("Verity Score", value: "\((user.verityScore ?? 0).formatted())")
                Rectangle().fill(VP.border).frame(width: 1, height: 50)
                statCell("Day Streak", value: "\(user.streak ?? 0)")
                Rectangle().fill(VP.border).frame(width: 1, height: 50)
                statCell("Articles Read", value: "\(user.articlesReadCount ?? 0)")
                Rectangle().fill(VP.border).frame(width: 1, height: 50)
                statCell("Comments", value: "\(user.commentCount ?? 0)")
            }
            .background(Color.white)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border))
            .cornerRadius(8)
        }
        .padding(20)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(VP.border))
        .cornerRadius(14)
        .padding(.horizontal, 16)
        .padding(.top, 20)
        .padding(.bottom, 20)
    }

    private func statCell(_ label: String, value: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(.headline, design: .default, weight: .bold))
                .foregroundColor(VP.text)
            Text(label.uppercased())
                .font(.system(.caption2, design: .default, weight: .semibold))
                .tracking(0.4)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .padding(.horizontal, 4)
    }

    /// DEPRECATED: the 4 stats now live inside identityRow's card grid. The
    /// old statsRow call site will still render as an empty spacer — a
    /// follow-up can delete the call entirely.
    private func statsRow(_ user: VPUser) -> some View {
        EmptyView()
    }

    // MARK: - Sub-tab bar
    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(tabs, id: \.self) { t in
                    Button {
                        tab = t
                    } label: {
                        Text(t)
                            .font(.system(.footnote, design: .default, weight: tab == t ? .semibold : .regular))
                            .foregroundColor(tab == t ? VP.text : VP.dim)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .overlay(alignment: .bottom) {
                                Rectangle()
                                    .fill(tab == t ? VP.text : Color.clear)
                                    .frame(height: 2)
                            }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .overlay(alignment: .bottom) {
            Rectangle().fill(VP.rule).frame(height: 1)
        }
        .padding(.bottom, 16)
    }

    // MARK: - Tab content
    @ViewBuilder
    private func tabContent(_ user: VPUser) -> some View {
        switch tab {
        case "Overview": overviewTab(user)
        case "Activity": activityTab
        case "Quizzes": quizzesTab
        case "Milestones": milestonesTab
        case "Achievements": achievementsTab
        case "Kids": kidsTab
        default: EmptyView()
        }
    }

    // MARK: - Overview
    private func overviewTab(_ user: VPUser) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Member since \(user.memberSince)")
                .font(.footnote)
                .foregroundColor(VP.soft)
            Text("\(user.commentCount ?? 0) comments · \(user.articlesReadCount ?? 0) articles read")
                .font(.caption)
                .foregroundColor(VP.dim)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.bottom, 24)
    }

    // MARK: - Activity
    private var activityTab: some View {
        VStack(spacing: 0) {
            if !activityLoaded {
                ProgressView().padding(.top, 40)
            } else if activity.isEmpty {
                VStack(spacing: 6) {
                    Text("No activity yet")
                        .font(.system(.subheadline, design: .default, weight: .semibold))
                        .foregroundColor(VP.text)
                    Text("Read articles, take quizzes, and comment to see your activity here.")
                        .font(.caption)
                        .foregroundColor(VP.dim)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 40)
                .padding(.top, 40)
            } else {
                VStack(spacing: 0) {
                    ForEach(activity) { item in
                        Button {
                            if let slug = item.slug { navigateToSlug = slug }
                        } label: {
                            HStack(alignment: .top, spacing: 10) {
                                Text(item.type.rawValue)
                                    .font(.system(.caption2, design: .default, weight: .semibold))
                                    .foregroundColor(activityColor(item.type))
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(activityColor(item.type), lineWidth: 1))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.label).font(.system(.footnote, design: .default, weight: .medium)).foregroundColor(VP.text).lineLimit(1)
                                }
                                Spacer()
                                Text(timeAgo(item.time))
                                    .font(.caption2)
                                    .foregroundColor(VP.dim)
                            }
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .overlay(alignment: .bottom) { Rectangle().fill(VP.rule).frame(height: 1) }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func activityColor(_ t: ActivityItem.ActivityType) -> Color {
        switch t {
        case .read: return VP.accent
        case .quiz: return VP.purple
        case .comment: return VP.right
        }
    }

    // MARK: - Quizzes
    private var quizzesTab: some View {
        VStack(spacing: 0) {
            if !quizzesLoaded {
                ProgressView().padding(.top, 40)
            } else {
                HStack(spacing: 10) {
                    quizStatCard(label: "Total", value: "\(quizzes.count)")
                    quizStatCard(label: "Avg Score", value: "\(quizAverage)%")
                    quizStatCard(label: "Best Streak", value: "\(quizStreak)")
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 16)

                if quizzes.isEmpty {
                    Text("No quizzes yet.")
                        .font(.footnote)
                        .foregroundColor(VP.dim)
                        .padding(.top, 40)
                } else {
                    VStack(spacing: 0) {
                        ForEach(quizzes) { q in
                            Button {
                                if let slug = q.slug { navigateToSlug = slug }
                            } label: {
                                HStack(spacing: 10) {
                                    Text("\(q.score)/\(q.total)")
                                        .font(.system(.subheadline, design: .default, weight: .bold))
                                        .foregroundColor(q.passed ? VP.right : VP.wrong)
                                        .frame(width: 38)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(q.title).font(.footnote).foregroundColor(VP.text).lineLimit(1)
                                    }
                                    Spacer()
                                    Text(q.date).font(.caption2).foregroundColor(VP.dim)
                                }
                                .padding(.horizontal, 20)
                                .padding(.vertical, 10)
                                .overlay(alignment: .bottom) { Rectangle().fill(VP.rule).frame(height: 1) }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private var quizAverage: Int {
        let total = quizzes.count
        guard total > 0 else { return 0 }
        let sum = quizzes.reduce(0.0) { $0 + Double($1.score) / Double(max($1.total, 1)) * 100 }
        return Int(sum / Double(total))
    }

    private var quizStreak: Int {
        var s = 0
        for q in quizzes {
            if q.passed { s += 1 } else { break }
        }
        return s
    }

    private func quizStatCard(label: String, value: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.system(.headline, design: .default, weight: .bold)).foregroundColor(VP.accent)
            Text(label).font(.caption2).foregroundColor(VP.dim)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border))
        .cornerRadius(8)
    }

    // MARK: - Milestones
    private var milestonesTab: some View {
        VStack(spacing: 10) {
            if !milestonesLoaded {
                ProgressView().padding(.top, 40)
            } else {
                ForEach(categories) { cat in
                    milestoneCard(cat)
                }
            }
        }
        .padding(.horizontal, 20)
    }

    private func milestoneCard(_ cat: VPCategory) -> some View {
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
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border))
                .cornerRadius(12)
                .opacity(0.4)
            } else {
                Button {
                    expandedCat = isExpanded ? nil : cat.id
                } label: {
                    HStack {
                        Text(cat.displayName).font(.system(.subheadline, design: .default, weight: .semibold)).foregroundColor(VP.text)
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
        .cornerRadius(12)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(anyProgress ? VP.border : Color.clear))
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

    // MARK: - Achievements
    private var achievementsTab: some View {
        VStack(spacing: 0) {
            if !achievementsLoaded {
                ProgressView().padding(.top, 40)
            } else if userAchievements.isEmpty {
                Text("No achievements unlocked yet.")
                    .font(.footnote)
                    .foregroundColor(VP.dim)
                    .padding(.top, 40)
            } else {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(userAchievements) { ua in
                        let a = ua.achievements
                        VStack(alignment: .leading, spacing: 4) {
                            Text(a?.name ?? "Achievement")
                                .font(.system(.subheadline, design: .default, weight: .semibold))
                                .foregroundColor(VP.text)
                            if let d = a?.description, !d.isEmpty {
                                Text(d)
                                    .font(.caption)
                                    .foregroundColor(VP.soft)
                                    .lineLimit(2)
                            }
                            if let u = ua.earnedAt {
                                Text("Unlocked \(Self.achFormatter.string(from: u))")
                                    .font(.caption2)
                                    .foregroundColor(VP.dim)
                            }
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(VP.card)
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
                        .cornerRadius(10)
                    }
                }
                .padding(.horizontal, 20)
            }
        }
    }

    private static let achFormatter: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "MMM d, yyyy"; return f
    }()

    // MARK: - Kids
    private var kidsTab: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Kids Mode").font(.system(.callout, design: .default, weight: .bold)).foregroundColor(VP.text)
                    Text("\(children.count) of 4 profiles").font(.caption).foregroundColor(VP.dim)
                }
                Spacer()
                if !showAddChild {
                    Button("+ Add") { showAddChild = true }
                        .font(.system(.caption, design: .default, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(VP.accent).cornerRadius(8)
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 14)

            if !kidsLoaded {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 20)
            } else {
                if showAddChild {
                    addChildForm.padding(.horizontal, 20).padding(.bottom, 14)
                }

                VStack(spacing: 8) {
                    ForEach(children) { child in
                        childCard(child)
                    }
                }
                .padding(.horizontal, 20)

                parentPinSection
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
            }
        }
    }

    // Round 6 iOS-DATA: the previous inline "Add child" form could not
    // satisfy the `/api/kids` POST contract, which requires `display_name`,
    // `date_of_birth` (under 13) and COPPA `consent.parent_name`. The
    // existing inline fields only captured name + color. Rather than
    // retrofit a full COPPA-compliant form into the tiny sheet, the inline
    // add path is disabled here and users are directed to the web flow
    // (veritypost.com profile/kids) where the complete consent capture
    // lives. A native iOS kid-create flow is queued for Round 7.
    private var addChildForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Add a Child Profile").font(.system(.subheadline, design: .default, weight: .bold)).foregroundColor(VP.text)
            Text("New child profiles require COPPA parental consent and date of birth. Please complete the setup on the web at veritypost.com (Profile > Kids), then pull to refresh here.")
                .font(.caption)
                .foregroundColor(VP.dim)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                Button("Close") { showAddChild = false }
                    .font(.system(.caption, design: .default, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 14).padding(.vertical, 7)
                    .background(VP.accent).cornerRadius(8)
            }
        }
        .padding(14)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
        .cornerRadius(10)
    }

    private func childCard(_ child: KidProfile) -> some View {
        HStack(spacing: 12) {
            AvatarView(
                outerHex: child.avatarColor,
                innerHex: nil,
                initials: String(child.safeName.prefix(1)),
                size: 40
            )
            VStack(alignment: .leading, spacing: 2) {
                Text(child.safeName).font(.system(.subheadline, design: .default, weight: .semibold)).foregroundColor(VP.text)
                Text(child.ageLabel).font(.caption).foregroundColor(VP.dim)
            }
            Spacer()
            Button("Edit") {
                editChildName = child.name ?? ""
                editingChild = child
            }
            .font(.caption).foregroundColor(VP.dim)
            .padding(.horizontal, 10).padding(.vertical, 5)
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(VP.border))
        }
        .padding(12)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
        .cornerRadius(10)
    }

    private var parentPinSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Parent PIN").font(.system(.footnote, design: .default, weight: .semibold)).foregroundColor(VP.text)
            Text("Set a PIN so kids can't switch back to your profile without you.")
                .font(.caption).foregroundColor(VP.dim)
            Button("Set PIN") { showPinSheet = true }
                .font(.system(.caption, design: .default, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 14).padding(.vertical, 7)
                .background(VP.accent).cornerRadius(8)
                .padding(.top, 4)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
        .cornerRadius(10)
    }

    // MARK: - Profile navigation list (matches site/src/app/profile/page.js mobile)
    //
    // Web shows: Profile Card, Activity, Categories, Achievements, Bookmarks
    // (paid), Messages (paid), Expert Queue (expert), Kids (family) →
    // then a "Help & Settings" group with Contact Us and Settings.

    private func profileNavList(_ user: VPUser) -> some View {
        // All visibility now sourced from `PermissionService`. No local plan /
        // role / isVerified inspection — the server is the single source of
        // truth for what should render here.

        struct Item {
            let label: String
            let desc: String
            let show: Bool
        }

        let mainItems: [Item] = [
            Item(label: "Profile Card",   desc: "Your shareable profile card", show: canViewCard),
            Item(label: "Activity",       desc: "Reading history, quizzes, and comments", show: canViewActivity),
            Item(label: "Categories",     desc: "Progress across all categories", show: canViewCategories),
            Item(label: "Achievements",   desc: "Badges and milestones", show: canViewAchievements),
            Item(label: "Bookmarks",      desc: "Saved articles and collections", show: canViewBookmarks),
            Item(label: "Messages",       desc: "Conversations and inbox", show: canViewMessages),
            Item(label: "Expert Queue",   desc: "Questions from readers", show: canViewExpertQueue),
            Item(label: "Kids",           desc: "Kid profiles and activity", show: canViewFamily),
        ].filter { $0.show }

        let helpItems: [Item] = [
            Item(label: "Contact Us", desc: "Get help or send feedback", show: true),
            Item(label: "Settings",   desc: "Profile, billing, security, privacy", show: true),
        ]

        return VStack(spacing: 20) {
            if !mainItems.isEmpty {
                VStack(spacing: 6) {
                    ForEach(mainItems, id: \.label) { item in
                        navRow(label: item.label, desc: item.desc, user: user)
                    }
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("HELP & SETTINGS")
                    .font(.system(.caption, design: .default, weight: .bold))
                    .tracking(0.66)
                    .foregroundColor(VP.dim)
                    .frame(maxWidth: .infinity, alignment: .leading)

                VStack(spacing: 6) {
                    ForEach(helpItems, id: \.label) { item in
                        navRow(label: item.label, desc: item.desc, user: user)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 20)
    }

    @ViewBuilder
    private func navRow(label: String, desc: String, user: VPUser) -> some View {
        NavigationLink {
            destination(for: label, user: user)
                .environmentObject(auth)
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(label)
                        .font(.system(.subheadline, design: .default, weight: .semibold))
                        .foregroundColor(VP.text)
                    Text(desc)
                        .font(.caption)
                        .foregroundColor(VP.dim)
                }
                Spacer()
                Text("\u{203A}")
                    .font(.title3)
                    .foregroundColor(VP.dim)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(VP.card)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
            .cornerRadius(10)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func destination(for label: String, user: VPUser) -> some View {
        switch label {
        case "Profile Card":
            if let uname = user.username {
                PublicProfileView(username: uname)
            } else { EmptyView() }
        case "Activity":     ProfileActivityView()
        case "Categories":   ProfileCategoriesView()
        case "Achievements": ProfileAchievementsView()
        case "Bookmarks":    BookmarksView()
        case "Messages":     MessagesView()
        case "Expert Queue": ExpertQueueView()
        case "Kids":         FamilyDashboardView()
        case "Contact Us":   ProfileContactView()
        case "Settings":     SettingsView()
        default: EmptyView()
        }
    }

    private var logoutButton: some View {
        Button { Task { await auth.logout() } } label: {
            Text("Sign out")
                .font(.system(.subheadline, design: .default, weight: .semibold))
                .foregroundColor(VP.wrong)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 100)
    }

    // MARK: - Sheets
    private var feedbackSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Picker("Category", selection: $feedbackCategory) {
                    Text("Bug Report").tag("bug")
                    Text("Feature Request").tag("feature_request")
                    Text("Other").tag("other")
                }
                .pickerStyle(.segmented)
                TextEditor(text: $feedbackBody)
                    .font(.subheadline)
                    .frame(minHeight: 120)
                    .padding(8)
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border))
                Button {
                    Task { await submitFeedback() }
                } label: {
                    Text(feedbackSubmitting ? "Submitting..." : "Submit Feedback")
                        .font(.system(.subheadline, design: .default, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .background(RoundedRectangle(cornerRadius: 10).fill(VP.accent))
                }
                .disabled(feedbackBody.trimmingCharacters(in: .whitespaces).isEmpty || feedbackSubmitting)
                Spacer()
            }
            .padding(20)
            .navigationTitle("Send Feedback")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { showFeedbackSheet = false }
                }
            }
        }
    }

    private func editChildSheet(_ child: KidProfile) -> some View {
        NavigationStack {
            Form {
                Section("Name") { TextField("Name", text: $editChildName) }
                Section {
                    Button("Save") {
                        Task {
                            let trimmed = editChildName.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !trimmed.isEmpty else { editingChild = nil; return }
                            guard let session = try? await client.auth.session else { editingChild = nil; return }
                            let url = SupabaseManager.shared.siteURL
                                .appendingPathComponent("api/kids/\(child.id)")
                            var req = URLRequest(url: url)
                            req.httpMethod = "PATCH"
                            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
                            req.httpBody = try? JSONSerialization.data(withJSONObject: ["display_name": trimmed])
                            do {
                                let (_, response) = try await URLSession.shared.data(for: req)
                                if let http = response as? HTTPURLResponse, http.statusCode == 200,
                                   let idx = children.firstIndex(where: { $0.id == child.id }) {
                                    var updated = children[idx]
                                    updated.displayName = trimmed
                                    children[idx] = updated
                                } else {
                                    Log.d("Edit kid save failed:", (response as? HTTPURLResponse)?.statusCode as Any)
                                }
                            } catch {
                                Log.d("Edit kid save error:", error)
                            }
                            editingChild = nil
                        }
                    }
                }
            }
            .navigationTitle("Edit Child")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var pinSheet: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Text("Enter a 4-digit PIN").font(.system(.headline, design: .default, weight: .semibold))
                SecureField("PIN", text: $pinInput)
                    .keyboardType(.numberPad).textFieldStyle(.roundedBorder)
                    .frame(width: 120).multilineTextAlignment(.center)
                Button("Save PIN") {
                    guard pinInput.count >= 4 else { return }
                    Keychain.set(pinInput, for: "parentPin")
                    UserDefaults.standard.removeObject(forKey: "parentPin")
                    pinInput = ""
                    showPinSheet = false
                }
                .font(.system(.subheadline, design: .default, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, 24).padding(.vertical, 10)
                .background(VP.accent).cornerRadius(10)
                Spacer()
            }
            .padding(.top, 40)
            .navigationTitle("Set PIN")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    // MARK: - Data loading
    private func loadTabData() {
        guard let userId = auth.currentUser?.id else { return }
        switch tab {
        case "Activity" where !activityLoaded: Task { await loadActivity(userId: userId) }
        case "Quizzes" where !quizzesLoaded: Task { await loadQuizzes(userId: userId) }
        case "Milestones" where !milestonesLoaded: Task { await loadMilestones(userId: userId) }
        case "Achievements" where !achievementsLoaded: Task { await loadAchievements(userId: userId) }
        case "Kids" where !kidsLoaded: Task { await loadKids(userId: userId) }
        default: break
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
            let reads = try await r
            let quizzes_ = try await q
            let comments = try await c
            var items: [ActivityItem] = []
            for x in reads {
                items.append(ActivityItem(
                    id: "r-\(x.id)", type: .read,
                    label: x.articles?.title ?? "Untitled", slug: x.articles?.slug,
                    detail: (x.completed ?? false) ? "Finished" : "Started",
                    time: x.readAt ?? Date.distantPast))
            }
            var quizGrouped: [String: (correct: Int, total: Int, title: String, slug: String?, time: Date, articleId: String)] = [:]
            for x in quizzes_ {
                let key = "\(x.articleId ?? "")#\(x.attemptNumber ?? 0)"
                var entry = quizGrouped[key] ?? (0, 0, x.articles?.title ?? "Untitled", x.articles?.slug, x.createdAt ?? Date.distantPast, x.articleId ?? "")
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
        } catch { Log.d("Load activity error: \(error)") }
        activityLoaded = true
    }

    private func loadQuizzes(userId: String) async {
        do {
            let results: [QuizAttempt] = try await client.from("quiz_attempts")
                .select("id, article_id, attempt_number, is_correct, points_earned, created_at, articles(title, slug)")
                .eq("user_id", value: userId)
                .order("created_at", ascending: false)
                .execute().value
            let formatter = DateFormatter(); formatter.dateFormat = "MMM d, yyyy"
            var grouped: [String: (correct: Int, total: Int, title: String, slug: String?, time: Date)] = [:]
            for r in results {
                let key = "\(r.articleId ?? "")#\(r.attemptNumber ?? 0)"
                var entry = grouped[key] ?? (0, 0, r.articles?.title ?? "Quiz", r.articles?.slug, r.createdAt ?? Date.distantPast)
                entry.total += 1
                if r.isCorrect == true { entry.correct += 1 }
                grouped[key] = entry
            }
            let passThreshold = 7
            quizzes = grouped.map { (key, entry) in
                let passed = entry.total > 0 && (entry.correct * 10 / max(entry.total, 1)) >= passThreshold
                return QuizDisplay(
                    id: key,
                    title: entry.title,
                    slug: entry.slug,
                    score: entry.correct, total: entry.total, passed: passed,
                    date: formatter.string(from: entry.time), time: ""
                )
            }.sorted { lhs, rhs in lhs.date > rhs.date }
        } catch { Log.d("Load quizzes error: \(error)") }
        quizzesLoaded = true
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

            // Upvotes: join comment_votes -> comments (own only) -> articles
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

    private func loadKids(userId: String) async {
        do {
            let data: [KidProfile] = try await client.from("kid_profiles")
                .select().eq("parent_user_id", value: userId).execute().value
            children = data
        } catch { Log.d("Load kids error: \(error)") }
        kidsLoaded = true
    }

    private func submitFeedback() async {
        guard auth.currentUser?.id != nil else { return }
        let trimmed = feedbackBody.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        feedbackSubmitting = true
        defer { feedbackSubmitting = false }
        // Round 6 iOS-DATA: route through /api/support. Previous direct
        // insert wrote a phantom `body` column on `support_tickets`; the
        // real message body lives in `ticket_messages`, handled server-side.
        struct SupportBody: Encodable {
            let category: String
            let subject: String
            let description: String
        }
        let subject = String(trimmed.prefix(80))
        let payload = SupportBody(category: feedbackCategory, subject: subject, description: trimmed)

        guard let session = try? await client.auth.session else { return }
        let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/support")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        do {
            req.httpBody = try JSONEncoder().encode(payload)
            let (_, resp) = try await URLSession.shared.data(for: req)
            if let http = resp as? HTTPURLResponse, http.statusCode == 200 {
                feedbackBody = ""; feedbackCategory = "bug"; showFeedbackSheet = false
            } else {
                Log.d("Submit feedback non-200: \((resp as? HTTPURLResponse)?.statusCode as Any)")
            }
        } catch { Log.d("Submit feedback error: \(error)") }
    }

    // Round 6 iOS-DATA: disabled. The inline form cannot satisfy COPPA
    // consent + date_of_birth validation required by /api/kids POST, and
    // the prior direct `kid_profiles` insert wrote phantom columns
    // (`name`, `username`, `age_tier`) that don't exist. Left as a stub
    // so any lingering call sites compile. Round 7 item: build a native
    // COPPA-compliant kid-create flow.
    private func addChild() async {
        #if false
        guard let userId = auth.currentUser?.id, !newChildName.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        // Legacy direct insert — removed in Round 6. See /api/kids contract.
        _ = userId
        #endif
        showAddChild = false
    }

    private func fetchStoryBySlug(_ slug: String) async -> Story? {
        do {
            let list: [Story] = try await client.from("articles")
                .select().eq("slug", value: slug).limit(1).execute().value
            return list.first
        } catch { return nil }
    }
}
