import SwiftUI
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-22
//
// Profile shell port — Session 4 part 2, locked 2026-05-12, shipped 2026-05-12.
// Mirrors web/src/app/profile/_components/ProfileApp.tsx (21-section master/
// detail). iPhone = NavigationStack rooted at a List whose first item is the
// inline-expanded "You" dashboard; the other 20 sections render as
// NavigationLink rows below grouped by Library / Family & expert / Settings /
// Account. iPad ≥700pt = NavigationSplitView two-column, default selection
// You. Outstanding.md Q-E1, Q-E3, Q-E5, Q-NEW6 (revised) baked in.
//
// Section catalog ordering follows ProfileApp.tsx:249-525 verbatim. Expert
// Queue + Expert Profile stay launch-hidden (commit 7b3541a1; iOS has no
// owner-mode toggle so they're absent rather than `hidden: !isOwnerMode`).
//
// Data flow:
//   - users.verity_score / quizzes_completed_count / comment_count /
//     followers_count / following_count / display_name / bio
//     — loaded by AuthViewModel.loadUser
//   - reading_log / quiz_attempts / comments — Activity section
//   - categories / reading_log / quiz_attempts / comments / comment_votes — Categories section
//   - user_achievements + achievements — Milestones section
//   - get_unread_counts RPC — Messages row badge (mirrors web ProfileApp.tsx:108-117)

// MARK: - Section catalog

enum ProfileSectionID: String, CaseIterable, Identifiable, Hashable {
    case you, publicProfile, background
    case activity, messages, categories, milestones
    case family
    case identity, security, sessions, notifications, appearance, privacy
    case plan, refer, help, data, signout

    var id: String { rawValue }
}

struct ProfileSectionDef: Identifiable, Hashable {
    let id: ProfileSectionID
    let glyph: String
    let group: String?  // nil = ungrouped (top of list)
    let title: String
    let reason: String

    var listID: String { id.rawValue }
}

/// Action card spec for the You section's grid of CTAs (web parity with
/// YouSection.tsx's ActionCard list). `section` is the destination route.
private struct ActionCardSpec: Identifiable {
    let section: ProfileSectionID
    let title: String
    let body: String
    var id: String { section.rawValue }
}

// MARK: - ProfileView

struct ProfileView: View {
    @EnvironmentObject var auth: AuthViewModel
    @ObservedObject private var perms = PermissionStore.shared
    private let client = SupabaseManager.shared.client
    @Environment(\.accessibilityReduceMotion) var reduceMotion
    @Environment(\.horizontalSizeClass) private var hSize

    // Layout-mode aware sizing.
    @AppStorage(VP.layoutModeKey) private var storedLayoutMode: String = VPLayoutMode.auto.rawValue
    @State private var viewportWidth: CGFloat = 0
    private var effectiveLayout: VPLayoutMode {
        vpEffectiveLayoutMode(stored: storedLayoutMode, sizeClass: hSize, width: viewportWidth)
    }
    /// Hero avatar bump (96pt) when iPad-class viewport. Lowered from the
    /// locked 768pt to 700pt to capture iPad mini portrait — see Q-NEW5.
    private var shouldBumpHero: Bool {
        hSize == .regular && viewportWidth >= VP.LayoutBreak.avatarBump
    }
    /// iPad master/detail when `.regular` AND viewport ≥ 700pt. Width gate
    /// excludes iPhone Plus/Pro Max landscape (reports `.regular` <700pt) and
    /// iPad Split-View thirds (reports `.compact` regardless of stored mode).
    private var useSplitView: Bool {
        effectiveLayout == .expanded && viewportWidth >= VP.LayoutBreak.avatarBump
    }

    // Permission-gated flags. Populated in `.task(id: perms.changeToken)`.
    @State private var canShareProfileCard = false
    @State private var canViewCard = false
    @State private var canViewActivity = false
    @State private var canViewCategories = false
    @State private var canViewAchievements = false
    @State private var canViewActivityFullHistory = false
    @State private var canViewMessages = false
    @State private var canViewFamily = false
    @State private var canViewFollowers = false
    @State private var canViewFollowing = false
    @State private var permsLoaded = false

    // T244 — handle for the in-flight pull-to-refresh load.
    @State private var refreshTask: Task<Void, Never>? = nil

    // iPad sidebar selection.
    @State private var selectedSection: ProfileSectionID? = .you

    // Messages row badge — `get_unread_counts` RPC sum.
    @State private var unreadDMCount: Int = 0

    // Activity filter — All / Articles / Comments
    enum ActivityFilter: String, CaseIterable, Identifiable {
        case all = "All"
        case articles = "Articles"
        case comments = "Comments"
        var id: String { rawValue }
    }
    @State private var activityFilter: ActivityFilter = .all

    // Loaded data
    @State private var activity: [ActivityItem] = []
    @State private var activityLoaded = false
    @State private var activityLoadError = false
    @State private var categories: [VPCategory] = []
    @State private var subcategories: [VPSubcategory] = []
    @State private var catStats: [String: CategoryStats] = [:]
    @State private var subStats: [String: CategoryStats] = [:]
    @State private var catUpvotes: [String: Int] = [:]
    @State private var subUpvotes: [String: Int] = [:]
    @State private var categoriesLoaded = false
    @State private var categoriesLoadError = false
    @State private var userAchievements: [UserAchievement] = []
    @State private var allAchievements: [Achievement] = []
    @State private var earnedMap: [String: Date] = [:]
    @State private var achievementsLoaded = false

    // Expansion state (categories drilldown)
    @State private var expandedCat: String? = nil
    @State private var expandedSub: String? = nil

    // Story nav
    @State private var navigateToSlug: String? = nil
    @State private var navigatedStory: Story? = nil

    // Sheets
    @State private var showAvatarEdit = false
    @State private var showLogin = false
    @State private var showSignup = false

    // Per-subcategory thresholds for progress bars (match site)
    private let subThresholds: (reads: Int, quizzes: Int, comments: Int, upvotes: Int) = (20, 20, 10, 10)

    private func profileCardURL(for username: String) -> URL? {
        let encoded = username.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? username
        return URL(string: "https://veritypost.com/card/\(encoded)")
    }

    private static let achFormatter: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "MMM d, yyyy"; return f
    }()

    /// Section catalog — drives sidebar/list rendering. Mirror of
    /// `web/src/app/profile/_components/ProfileApp.tsx:249-525`.
    /// Permission-gated sections (`messages`, `family`) are dropped from the
    /// list when their gate is false (matches web's `hidden:` flag).
    /// Expert Queue + Expert Profile are launch-hidden across both platforms
    /// (commit 7b3541a1, owner direction 2026-05-08).
    private var sectionCatalog: [ProfileSectionDef] {
        var defs: [ProfileSectionDef] = [
            // ── Top: identity surfaces ─────────────────────────
            ProfileSectionDef(id: .you, glyph: "✶", group: nil, title: "You",
                              reason: "Your tier, the numbers behind it, and what to do next."),
            ProfileSectionDef(id: .publicProfile, glyph: "◐", group: nil, title: "Public profile",
                              reason: "A faithful preview of what others see when they land on your profile."),
            ProfileSectionDef(id: .background, glyph: "✥", group: nil, title: "Background",
                              reason: "A short line that says who you are when you comment."),
        ]
        // ── Library ────────────────────────────────────────
        defs.append(ProfileSectionDef(id: .activity, glyph: "⌛", group: "Library", title: "Activity",
                                      reason: "Everything you've read, commented on, or followed."))
        if !permsLoaded || canViewMessages {
            defs.append(ProfileSectionDef(id: .messages, glyph: "✉", group: "Library", title: "Messages",
                                          reason: "Direct conversations with readers and experts."))
        }
        defs.append(ProfileSectionDef(id: .categories, glyph: "◇", group: "Library", title: "Categories",
                                      reason: "Your strongest topics and where to grow."))
        defs.append(ProfileSectionDef(id: .milestones, glyph: "✺", group: "Library", title: "Milestones",
                                      reason: "The badges you've earned and what's next on the ladder."))
        // ── Family & expert (conditional) ──────────────────
        if !permsLoaded || canViewFamily {
            defs.append(ProfileSectionDef(id: .family, glyph: "◓", group: "Family & expert", title: "Family & kids",
                                          reason: "Manage kid accounts, seats, and supervisors on your plan."))
        }
        // ── Settings ───────────────────────────────────────
        defs.append(contentsOf: [
            ProfileSectionDef(id: .identity, glyph: "✎", group: "Settings", title: "Identity",
                              reason: "Your display name and @handle."),
            ProfileSectionDef(id: .security, glyph: "⛨", group: "Settings", title: "Security",
                              reason: "Email, password, and two-factor authentication."),
            ProfileSectionDef(id: .sessions, glyph: "⌬", group: "Settings", title: "Login activity",
                              reason: "Where you're currently signed in."),
            ProfileSectionDef(id: .notifications, glyph: "☷", group: "Settings", title: "Notifications",
                              reason: "How and where we reach you."),
            ProfileSectionDef(id: .appearance, glyph: "◑", group: "Settings", title: "Appearance",
                              reason: "Light, dark, or system."),
            ProfileSectionDef(id: .privacy, glyph: "⊘", group: "Settings", title: "Privacy",
                              reason: "Who can message you, see your activity, or find your profile."),
        ])
        // ── Account ────────────────────────────────────────
        defs.append(contentsOf: [
            ProfileSectionDef(id: .plan, glyph: "◈", group: "Account", title: "Plan",
                              reason: "Your subscription, payment method, and renewal."),
            ProfileSectionDef(id: .refer, glyph: "⌘", group: "Account", title: "Invite friends",
                              reason: "Invite links to share."),
            ProfileSectionDef(id: .help, glyph: "?", group: "Account", title: "Help & support",
                              reason: "FAQs and how to reach a human."),
            ProfileSectionDef(id: .data, glyph: "✕", group: "Account", title: "Your data",
                              reason: "Get a copy of your data, or close your account."),
            ProfileSectionDef(id: .signout, glyph: "↪", group: "Account", title: "Sign out",
                              reason: "End this session, or sign out of every device on your account."),
        ])
        return defs
    }

    /// Group rendering order. Sections with `group == nil` render first
    /// (mirroring web's ungrouped you/public/background at top).
    private let groupOrder: [String] = ["Library", "Family & expert", "Settings", "Account"]

    var body: some View {
        Group {
            if let user = auth.currentUser {
                if useSplitView {
                    iPadShell(user: user)
                } else {
                    phoneShell(user: user)
                }
            } else if auth.isLoggedIn, let errMsg = auth.userLoadError {
                userLoadErrorView(message: errMsg)
            } else {
                anonProfileHero
            }
        }
        .background(VP.bg.ignoresSafeArea())
        .background(
            GeometryReader { proxy in
                Color.clear
                    .preference(key: ProfileViewportWidthKey.self, value: proxy.size.width)
            }
        )
        .onPreferenceChange(ProfileViewportWidthKey.self) { viewportWidth = $0 }
        .toolbar(.hidden, for: .navigationBar)
        // Pull-to-refresh + navigationDestination moved into phoneShell /
        // iPadShell so they bind to the correct container — see adversary
        // findings (BLOCKER, 2026-05-12). The outer Group level couldn't
        // propagate either modifier reliably into the iPad detail pane's
        // nested NavigationStack.
        .task { await SettingsService.shared.loadIfNeeded() }
        .task {
            if let uid = auth.currentUser?.id {
                async let a: Void = loadActivity(userId: uid)
                async let ach: Void = loadAchievements(userId: uid)
                _ = await (a, ach)
            }
        }
        .task(id: perms.changeToken) { await loadPerms() }
        .task(id: auth.currentUser?.id ?? "") { await loadUnreadDMCount() }
        .onChange(of: navigateToSlug) {
            guard let slug = navigateToSlug else { return }
            navigateToSlug = nil
            Task { if let s = await fetchStoryBySlug(slug) { navigatedStory = s } }
        }
        .sheet(isPresented: $showLogin) { LoginView().environmentObject(auth) }
        .sheet(isPresented: $showSignup) { SignupView().environmentObject(auth) }
        .sheet(isPresented: $showAvatarEdit) {
            if let u = auth.currentUser {
                AvatarQuickEditSheet(user: u).environmentObject(auth)
            }
        }
    }

    private func loadPerms() async {
        canShareProfileCard = await PermissionService.shared.has("profile.card_share")
        canViewCard = await PermissionService.shared.has("profile.card.view")
        canViewActivity = await PermissionService.shared.has("profile.activity")
        canViewActivityFullHistory = await PermissionService.shared.has("profile.activity.full_history")
        canViewCategories = await PermissionService.shared.has("profile.categories")
        canViewAchievements = await PermissionService.shared.has("profile.achievements")
        canViewMessages = await PermissionService.shared.has("messages.inbox.view")
        canViewFamily = await PermissionService.shared.has("settings.family.view")
        canViewFollowers = await PermissionService.shared.has("profile.followers.view.own")
        canViewFollowing = await PermissionService.shared.has("profile.following.view.own")
        permsLoaded = true
    }

    /// Mirrors web ProfileApp.tsx:108-117 — total unread DM count via the
    /// migration 038 `get_unread_counts` RPC. Drives the Messages row badge.
    private func loadUnreadDMCount() async {
        guard auth.currentUser?.id != nil else { unreadDMCount = 0; return }
        struct UnreadRow: Decodable { let conversation_id: String; let unread: Int }
        let rows: [UnreadRow] = (try? await client.rpc("get_unread_counts").execute().value) ?? []
        unreadDMCount = rows.reduce(0) { $0 + $1.unread }
    }

    // MARK: - User-load error fallback
    @ViewBuilder
    private func userLoadErrorView(message: String) -> some View {
        VStack(spacing: 0) {
            topBar
            VStack(spacing: 12) {
                Text(message)
                    .font(.system(.subheadline, design: .default, weight: .semibold))
                    .foregroundColor(VP.text)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
                Button { Task { await auth.retryLoadUser() } } label: {
                    Text("Tap to retry")
                        .font(.system(.footnote, design: .default, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .frame(minHeight: 44)
                        .background(VP.accent)
                        .clipShape(RoundedRectangle(cornerRadius: VP.radiusSM))
                }
            }
            .padding(.top, 80)
            Spacer()
        }
    }

    // MARK: - Top bar (brand only — no gear, no Kids pill; settings live inline)
    private var topBar: some View {
        HStack(spacing: 0) {
            Text("Verity Post")
                .font(.system(size: VP.Size.base, weight: .heavy))
                .tracking(-0.15)
                .foregroundColor(VP.text)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(VP.bg)
        .overlay(Rectangle().fill(VP.border).frame(height: 1), alignment: .bottom)
    }

    // MARK: - Anon hero (shown when not logged in)
    private var anonProfileHero: some View {
        VStack(spacing: 0) {
            topBar
            VStack(spacing: 14) {
                Spacer().frame(height: 32)
                AvatarView(outerHex: "#818cf8", innerHex: nil, initials: "?", size: 64)
                Text("Guest reader")
                    .font(.system(.title3, design: .default, weight: .bold))
                    .foregroundColor(VP.text)
                Text("Sign in to track reading, quizzes, and achievements.")
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
                    .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
                Button("Create free account") { showSignup = true }
                    .font(.system(.footnote, design: .default, weight: .medium))
                    .foregroundColor(VP.accent)
                Spacer().frame(height: 80)
            }
            Spacer()
        }
    }

    // MARK: - Verify-email gate (rendered inline in You section)
    //
    // Web parity: mirrors the `!perms.viewOwn && !user.email_verified` branch
    // on web. iOS shell port narrows the scope per Outstanding.md Q-E5
    // adversary review — Identity / Security / Sessions remain reachable
    // from the section list so the user can self-serve verification without
    // a dead-end. Other section content gracefully degrades.
    private var verifyEmailGate: some View {
        VStack(spacing: 12) {
            Spacer().frame(height: 32)
            Image(systemName: "envelope.badge.shield.half.filled")
                .font(.system(size: VP.Size.display, weight: .regular))
                .foregroundColor(VP.dim)
            Text("Verify your email")
                .font(.system(.title3, design: .default, weight: .bold))
                .foregroundColor(VP.text)
            Text("Confirm your email to get started. The rest of your profile unlocks once it's verified.")
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
                    .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
            }
            Spacer().frame(height: 20)
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Phone shell (iPhone, iPad Split-View thirds, anything <700pt)
    @ViewBuilder
    private func phoneShell(user: VPUser) -> some View {
        ScrollView {
            VStack(spacing: 0) {
                topBar
                // Inline-You at top (Q-NEW6 revised — no auto-push; You
                // dashboard renders inline as first list "item", section
                // rows below). Native iOS pattern (Health/Wallet/News).
                youSection(user: user)
                Divider().background(VP.border).padding(.top, 4)
                // Group rendering — ungrouped first, then group headers
                // in `groupOrder`. NavigationLink rows expose the section
                // destinations.
                sectionRows(user: user)
                logoutFooter
            }
        }
        // Pull-to-refresh + cross-section story nav must live on the
        // ScrollView itself (not the outer Group) so SwiftUI binds them
        // to the correct container. Adversary finding — outer-Group
        // placement was unreliable on iPad detail panes.
        .refreshable {
            refreshTask?.cancel()
            refreshTask = Task { await refreshAll() }
            _ = await refreshTask?.value
        }
        .navigationDestination(item: $navigatedStory) { story in
            StoryDetailView(story: story).environmentObject(auth)
        }
    }

    // MARK: - iPad shell (NavigationSplitView ≥ 700pt + `.regular`)
    @ViewBuilder
    private func iPadShell(user: VPUser) -> some View {
        NavigationSplitView {
            List(selection: $selectedSection) {
                ForEach(sectionCatalog) { def in
                    if def.id == .you {
                        NavigationLink(value: ProfileSectionID.you) {
                            sidebarRowLabel(def: def, badge: badgeText(for: def.id))
                        }
                    } else {
                        sectionListItem(def: def, user: user, isSidebar: true)
                    }
                }
            }
            .navigationTitle("Profile")
            .listStyle(.sidebar)
        } detail: {
            // Detail-pane NavigationStack owns story deep-links and the
            // section-internal push hierarchy (e.g., Security hub →
            // EmailSettingsView). `navigationDestination` lives here so
            // tapping an activity-preview row in You section can resolve
            // the Story binding on the correct stack.
            NavigationStack {
                detailView(for: selectedSection ?? .you, user: user)
                    .navigationDestination(item: $navigatedStory) { story in
                        StoryDetailView(story: story).environmentObject(auth)
                    }
            }
        }
    }

    // MARK: - Section rows (phone shell)
    @ViewBuilder
    private func sectionRows(user: VPUser) -> some View {
        let allSections = sectionCatalog.filter { $0.id != .you }
        let ungrouped = allSections.filter { $0.group == nil }
        let groupedByName: [String: [ProfileSectionDef]] = Dictionary(grouping: allSections.filter { $0.group != nil }) { $0.group ?? "" }

        VStack(spacing: 0) {
            // Ungrouped (public profile, background) — rendered without a
            // header, matching web's three top sections at ProfileApp.tsx:249-285.
            ForEach(ungrouped) { def in
                sectionListItem(def: def, user: user, isSidebar: false)
            }
            ForEach(groupOrder, id: \.self) { group in
                if let items = groupedByName[group], !items.isEmpty {
                    groupHeader(group)
                    ForEach(items) { def in
                        sectionListItem(def: def, user: user, isSidebar: false)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func groupHeader(_ name: String) -> some View {
        Text(name.uppercased())
            .font(.system(.caption2, design: .default, weight: .bold))
            .tracking(1)
            .foregroundColor(VP.dim)
            .padding(.horizontal, 16)
            .padding(.top, 20)
            .padding(.bottom, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder
    private func sectionListItem(def: ProfileSectionDef, user: VPUser, isSidebar: Bool) -> some View {
        if isSidebar {
            sidebarRowLabel(def: def, badge: badgeText(for: def.id))
                .tag(def.id)
        } else {
            NavigationLink {
                detailView(for: def.id, user: user)
            } label: {
                phoneRowLabel(def: def, badge: badgeText(for: def.id))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(rowAccessibility(for: def))
        }
    }

    private func badgeText(for id: ProfileSectionID) -> String? {
        if id == .messages, unreadDMCount > 0 {
            return unreadDMCount > 99 ? "99+" : String(unreadDMCount)
        }
        return nil
    }

    @ViewBuilder
    private func phoneRowLabel(def: ProfileSectionDef, badge: String?) -> some View {
        HStack(spacing: 12) {
            Text(def.glyph)
                .font(.system(size: VP.Size.lg, weight: .regular))
                .foregroundColor(VP.dim)
                .frame(width: 24, alignment: .center)
            VStack(alignment: .leading, spacing: 2) {
                Text(def.title)
                    .font(.system(.subheadline, design: .default, weight: .semibold))
                    .foregroundColor(VP.text)
                Text(def.reason)
                    .font(.caption2)
                    .foregroundColor(VP.dim)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            if let badge {
                Text(badge)
                    .font(.system(.caption2, design: .default, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(VP.accent)
                    .clipShape(Capsule())
            }
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(VP.dim)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(minHeight: 56)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .overlay(Rectangle().fill(VP.rule).frame(height: 1).padding(.leading, 52), alignment: .bottom)
    }

    @ViewBuilder
    private func sidebarRowLabel(def: ProfileSectionDef, badge: String?) -> some View {
        HStack(spacing: 10) {
            Text(def.glyph)
                .font(.system(size: VP.Size.base, weight: .regular))
                .foregroundColor(VP.dim)
                .frame(width: 20, alignment: .center)
            Text(def.title)
                .font(.system(.subheadline, design: .default, weight: .semibold))
                .foregroundColor(VP.text)
            Spacer()
            if let badge {
                Text(badge)
                    .font(.system(.caption2, design: .default, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(VP.accent)
                    .clipShape(Capsule())
            }
        }
        .accessibilityLabel(rowAccessibility(for: def))
    }

    private func rowAccessibility(for def: ProfileSectionDef) -> String {
        if def.id == .messages, unreadDMCount > 0 {
            return "\(def.title). \(unreadDMCount) unread. \(def.reason)"
        }
        return "\(def.title). \(def.reason)"
    }

    // MARK: - Detail dispatch (phone NavigationLink target + iPad detail pane)
    @ViewBuilder
    private func detailView(for id: ProfileSectionID, user: VPUser) -> some View {
        switch id {
        case .you:
            // iPad detail view of You — render the same dashboard as the
            // phone shell's first item, inside a scroll container with
            // its own top bar so the detail pane has a title.
            ScrollView {
                VStack(spacing: 0) {
                    youSection(user: user)
                }
            }
            .navigationTitle("You")
            .navigationBarTitleDisplayMode(.inline)
        case .publicProfile:
            PublicProfileEditor()
                .environmentObject(auth)
        case .background:
            SettingsBackgroundView()
                .environmentObject(auth)
                .navigationTitle("Background")
                .navigationBarTitleDisplayMode(.inline)
        case .activity:
            activitySection
                .navigationTitle("Activity")
                .navigationBarTitleDisplayMode(.inline)
        case .messages:
            MessagesView()
                .environmentObject(auth)
        case .categories:
            categoriesSection
                .navigationTitle("Categories")
                .navigationBarTitleDisplayMode(.inline)
        case .milestones:
            milestonesSection(user: user)
                .navigationTitle("Milestones")
                .navigationBarTitleDisplayMode(.inline)
        case .family:
            FamilyDashboardView()
                .environmentObject(auth)
        case .identity:
            AccountSettingsView()
                .environmentObject(auth)
        case .security:
            securityHub
                .navigationTitle("Security")
                .navigationBarTitleDisplayMode(.inline)
        case .sessions:
            LoginActivityView()
                .environmentObject(auth)
        case .notifications:
            NotificationsSettingsView()
                .environmentObject(auth)
        case .appearance:
            AppearanceSettingsView()
                .environmentObject(auth)
        case .privacy:
            DataPrivacyView()
                .environmentObject(auth)
        case .plan:
            SubscriptionSettingsView()
                .environmentObject(auth)
        case .refer:
            InviteFriendsView()
        case .help:
            helpSection
                .navigationTitle("Help & support")
                .navigationBarTitleDisplayMode(.inline)
        case .data:
            DataPrivacyView()
                .environmentObject(auth)
        case .signout:
            signoutSection
                .navigationTitle("Sign out")
                .navigationBarTitleDisplayMode(.inline)
        }
    }

    // MARK: - You section (inline-expanded dashboard)
    @ViewBuilder
    private func youSection(user: VPUser) -> some View {
        if user.emailVerified == false {
            verifyEmailGate
        } else {
            VStack(spacing: 0) {
                heroCard(user)
                statRow(user)
                socialRow(user)
                quickActionsRow(user)
                actionCardsRow(user)
                recentActivityPreview
                achievementsPreview(user: user)
                bioAndCard(user)
                memberSinceFooter(user)
                    .padding(.bottom, 8)
            }
        }
    }

    // MARK: - Hero card (avatar + display name + verity score)
    @ViewBuilder
    private func heroCard(_ user: VPUser) -> some View {
        let score = user.verityScore ?? 0
        let displayTitle = (user.displayName?.trimmingCharacters(in: .whitespaces).isEmpty == false
                            ? user.displayName
                            : user.username) ?? "Reader"

        let bump = shouldBumpHero
        HStack(alignment: .center, spacing: bump ? 18 : 14) {
            Button {
                showAvatarEdit = true
            } label: {
                AvatarView(user: user, size: bump ? 96 : 68)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Edit avatar color and display name")

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Text(displayTitle)
                        .font(.system(size: bump ? VP.Size.xxl : VP.Size.xl, weight: .semibold, design: .serif))
                        .foregroundColor(VP.ink)
                        .lineLimit(1)
                    VerifiedBadgeView(user: user, size: 11)
                    if user.isExpert == true,
                       let title = user.expertTitle?.trimmingCharacters(in: .whitespaces),
                       !title.isEmpty {
                        Text(title)
                            .font(.system(size: VP.Size.xs, weight: .semibold))
                            .foregroundColor(VP.inkSoft)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(VP.surfaceSunken)
                            .overlay(
                                RoundedRectangle(cornerRadius: VP.radiusXS, style: .continuous)
                                    .stroke(VP.borderSoft)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: VP.radiusXS, style: .continuous))
                            .lineLimit(1)
                    }
                }

                // Web parity 2026-05-16: "Verity Score" caps muted label on
                // top, then large numeric below — same vertical order as the
                // editorial hero tile in YouSection.tsx. Weight 600 (not 800/
                // heavy) per the demoted spec; iOS uses .rounded design so the
                // numerals stay legible at this weight.
                VStack(alignment: .leading, spacing: 2) {
                    Text("Verity Score")
                        .font(.system(size: VP.Size.xs, weight: .semibold))
                        .tracking(0.3)
                        .foregroundColor(VP.inkMuted)
                    Text(score.formatted())
                        .font(.system(size: VP.Size.xxl, weight: .semibold, design: .rounded))
                        .tracking(-0.8)
                        .foregroundColor(VP.ink)
                        .contentTransition(.numericText())
                        .accessibilityLabel("Verity Score \(score)")
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(VP.surfaceRaised)
        .overlay(
            RoundedRectangle(cornerRadius: VP.radiusMD, style: .continuous)
                .stroke(VP.borderSoft)
        )
        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD, style: .continuous))
        .vpShadowAmbient()
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
    }

    // MARK: - Stat row
    // Web parity: YouSection.tsx renders Quizzes + Discussion StatTiles that
    // deep-link to `?section=activity`. iOS mirrors this by wrapping each
    // tile in a NavigationLink that pushes the Activity section. Memory rule:
    // user-facing copy says "Discussion" not "Comments" (the Activity filter
    // chip stays "Comments" since web's filter ID does too — this is the stat
    // label only).
    @ViewBuilder
    private func statRow(_ user: VPUser) -> some View {
        HStack(spacing: 8) {
            NavigationLink {
                activitySection
                    .navigationTitle("Activity")
                    .navigationBarTitleDisplayMode(.inline)
            } label: {
                statTile(
                    label: "Quizzes",
                    value: "\((user.quizzesCompletedCount ?? 0).formatted())",
                    icon: "checkmark.seal.fill"
                )
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Quizzes \((user.quizzesCompletedCount ?? 0)). Opens activity.")
            NavigationLink {
                activitySection
                    .navigationTitle("Activity")
                    .navigationBarTitleDisplayMode(.inline)
            } label: {
                statTile(
                    label: "Discussion",
                    value: "\((user.commentCount ?? 0).formatted())",
                    icon: "bubble.left.fill"
                )
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Discussion \((user.commentCount ?? 0)). Opens activity.")
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }

    private func statTile(label: String, value: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: VP.Size.sm, weight: .semibold))
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
        .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.border))
        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
    }

    // MARK: - Social row (Followers / Following)
    @ViewBuilder
    private func socialRow(_ user: VPUser) -> some View {
        if permsLoaded && (canViewFollowers || canViewFollowing) {
            HStack(spacing: 8) {
                if canViewFollowers {
                    NavigationLink {
                        UserFollowListView(userId: user.id, mode: .followers)
                            .environmentObject(auth)
                    } label: {
                        statTile(
                            label: "Followers",
                            value: "\((user.followersCount ?? 0).formatted())",
                            icon: "person.2.fill"
                        )
                    }
                    .buttonStyle(.plain)
                }
                if canViewFollowing {
                    NavigationLink {
                        UserFollowListView(userId: user.id, mode: .following)
                            .environmentObject(auth)
                    } label: {
                        statTile(
                            label: "Following",
                            value: "\((user.followingCount ?? 0).formatted())",
                            icon: "person.crop.circle.badge.plus"
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
    }

    // MARK: - Quick actions row (Inbox / Share / Kids — chip-style)
    @ViewBuilder
    private func quickActionsRow(_ user: VPUser) -> some View {
        let showShare = canShareProfileCard && (user.username?.isEmpty == false)

        HStack(spacing: 8) {
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
                .accessibilityLabel("Share profile")
            }
            if canViewFamily {
                NavigationLink {
                    FamilyDashboardView().environmentObject(auth)
                } label: {
                    quickActionChip(icon: "figure.2.and.child.holdinghands", label: "Kids")
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
                .font(.system(size: VP.Size.lg, weight: .semibold))
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
        .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.border))
        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
    }

    // MARK: - Action cards row
    // Web parity: YouSection.tsx renders an auto-fit grid of ActionCard
    // links (Avatar & display name / Bio & expertise / Privacy / optional
    // Expert queue + Family). iOS mirrors with NavigationLinks into the
    // existing section destinations. Expert queue is launch-hidden across
    // both platforms (commit 7b3541a1) so the iOS catalog never adds it.
    @ViewBuilder
    private func actionCardsRow(_ user: VPUser) -> some View {
        let cards: [ActionCardSpec] = {
            var arr: [ActionCardSpec] = [
                ActionCardSpec(
                    section: .identity,
                    title: "Avatar & display name",
                    body: "Set how you show up in comments, expert answers, and the leaderboard."
                ),
                ActionCardSpec(
                    section: .publicProfile,
                    title: "Bio & expertise",
                    body: "A short blurb readers see next to your name. Helps replies land."
                ),
                ActionCardSpec(
                    section: .privacy,
                    title: "Privacy",
                    body: "Who can message you, see your activity, or find your profile."
                ),
            ]
            if canViewFamily {
                arr.append(ActionCardSpec(
                    section: .family,
                    title: "Family",
                    body: "Manage kid accounts, seats, and supervisors on your plan."
                ))
            }
            return arr
        }()

        VStack(spacing: 8) {
            ForEach(cards) { card in
                NavigationLink {
                    actionCardDestination(for: card.section)
                } label: {
                    actionCard(title: card.title, body: card.body)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(card.title). \(card.body)")
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)   // S[7]=44 on web → toned down for phone density
        .padding(.bottom, 12)
    }

    /// Standalone destination resolver for action-card NavigationLinks.
    /// We can't reuse `detailView(for:user:)` here — the Swift compiler can't
    /// infer the opaque return type when `detailView` (called inside
    /// `youSection`) transitively references `youSection` via its `.you`
    /// branch, creating a recursive type. Keeping a narrow dispatcher with
    /// just the 4 You-section CTA targets sidesteps the cycle.
    @ViewBuilder
    private func actionCardDestination(for id: ProfileSectionID) -> some View {
        switch id {
        case .identity:
            AccountSettingsView()
                .environmentObject(auth)
        case .publicProfile:
            PublicProfileEditor()
                .environmentObject(auth)
        case .privacy:
            DataPrivacyView()
                .environmentObject(auth)
        case .family:
            FamilyDashboardView()
                .environmentObject(auth)
        default:
            EmptyView()
        }
    }

    private func actionCard(title: String, body: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: VP.Size.md, weight: .semibold, design: .serif))
                    .foregroundColor(VP.ink)
                    .tracking(-0.3)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                Text(body)
                    .font(.system(size: VP.Size.sm, weight: .regular))
                    .foregroundColor(VP.inkMuted)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(VP.dim)
                .padding(.top, 4)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(VP.surfaceRaised)
        .overlay(
            RoundedRectangle(cornerRadius: VP.radiusMD, style: .continuous)
                .stroke(VP.borderSoft)
        )
        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD, style: .continuous))
        .vpShadowAmbient()
    }

    // MARK: - Recent activity preview (top 3, navigates to Activity section)
    @ViewBuilder
    private var recentActivityPreview: some View {
        let top3 = Array(combinedActivityAllTypes().prefix(3))
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                sectionTitle("Recent activity")
                Spacer()
                NavigationLink {
                    activitySection
                        .navigationTitle("Activity")
                        .navigationBarTitleDisplayMode(.inline)
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
                .simultaneousGesture(TapGesture().onEnded {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                })
            }

            if !activityLoaded && !activityLoadError {
                compactSkeletonRow()
                compactSkeletonRow()
                compactSkeletonRow()
            } else if activityLoadError {
                Text("Couldn\u{2019}t load activity. Pull to refresh.")
                    .font(.caption)
                    .foregroundColor(VP.danger)
                    .padding(.vertical, 8)
            } else if top3.isEmpty {
                Text("No activity yet.")
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
                .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.border))
                .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
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
                        RoundedRectangle(cornerRadius: VP.radiusXS)
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
            RoundedRectangle(cornerRadius: VP.radiusXS).fill(VP.surfaceSunken)
                .frame(width: 40, height: 14)
            RoundedRectangle(cornerRadius: VP.radiusXS).fill(VP.surfaceSunken)
                .frame(height: 14)
            Spacer()
            RoundedRectangle(cornerRadius: VP.radiusXS).fill(VP.surfaceSunken)
                .frame(width: 36, height: 10)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.border))
        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
    }

    private func compactLastRowId() -> String {
        combinedActivityAllTypes().prefix(3).last?.id ?? ""
    }

    // MARK: - Achievements preview (top 3, navigates to Milestones section)
    @ViewBuilder
    private func achievementsPreview(user: VPUser) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                sectionTitle("Achievements")
                Spacer()
                NavigationLink {
                    milestonesSection(user: user)
                        .navigationTitle("Milestones")
                        .navigationBarTitleDisplayMode(.inline)
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
                .simultaneousGesture(TapGesture().onEnded {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                })
            }

            if !achievementsLoaded {
                HStack(spacing: 10) {
                    ForEach(0..<3, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: VP.radiusMD).fill(VP.surfaceSunken)
                            .frame(height: 68)
                    }
                }
            } else if userAchievements.isEmpty {
                Text("Complete a quiz to earn your first badge.")
                    .font(.caption)
                    .foregroundColor(VP.dim)
                    .padding(.vertical, 8)
            } else {
                HStack(spacing: 10) {
                    ForEach(Array(userAchievements.prefix(3))) { ua in
                        achievementChip(ua)
                    }
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
                .font(.system(size: VP.Size.md, weight: .semibold))
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
        .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.success.opacity(0.4)))
        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
    }

    private func nextAchievementPlaceholder() -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: "lock.fill")
                .font(.system(size: VP.Size.md, weight: .semibold))
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
            RoundedRectangle(cornerRadius: VP.radiusMD)
                .stroke(style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                .foregroundColor(VP.border)
        )
    }

    // MARK: - Bio + profile card preview (inline within You section)
    @ViewBuilder
    private func bioAndCard(_ user: VPUser) -> some View {
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

            if canViewCard, let uname = user.username, !uname.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    sectionTitle("Profile card")
                    profileCardPreview(user: user)
                    HStack(spacing: 8) {
                        if let cardURL = profileCardURL(for: uname) {
                            Link(destination: cardURL) {
                                Text("View public card")
                                    .font(.system(.footnote, design: .default, weight: .semibold))
                                    .foregroundColor(VP.text)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 8)
                                    .frame(minHeight: 36)
                                    .overlay(RoundedRectangle(cornerRadius: VP.radiusSM).stroke(VP.border))
                            }
                            .buttonStyle(.plain)
                        }

                        if canShareProfileCard, let url = profileCardURL(for: uname) {
                            ShareLink(item: url) {
                                Text("Share")
                                    .font(.system(.footnote, design: .default, weight: .semibold))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 8)
                                    .frame(minHeight: 36)
                                    .background(VP.accent)
                                    .clipShape(RoundedRectangle(cornerRadius: VP.radiusSM))
                            }
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 8)
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.system(.subheadline, design: .default, weight: .semibold))
            .foregroundColor(VP.text)
    }

    private func profileCardPreview(user: VPUser) -> some View {
        HStack(spacing: 12) {
            AvatarView(user: user, size: 44)
            VStack(alignment: .leading, spacing: 2) {
                Text(profileCardTitle(user))
                    .font(.system(.subheadline, design: .default, weight: .semibold))
                    .foregroundColor(VP.text)
                if let uname = user.username {
                    Text("@\(uname)").font(.caption).foregroundColor(VP.dim)
                }
                HStack(spacing: 10) {
                    inlineStat(value: "\((user.verityScore ?? 0).formatted())", label: "score")
                    inlineStat(value: "\((user.quizzesCompletedCount ?? 0).formatted())", label: "quizzes")
                    inlineStat(value: "\((user.commentCount ?? 0).formatted())", label: "discussion")
                }
                .padding(.top, 2)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.border))
        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
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

    // MARK: - Activity section (full filtered list)
    @ViewBuilder
    private var activitySection: some View {
        ScrollView {
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
                                    RoundedRectangle(cornerRadius: VP.radiusSM).stroke(activityFilter == f ? VP.accent : VP.border)
                                )
                                .clipShape(RoundedRectangle(cornerRadius: VP.radiusSM))
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 12)

                if !activityLoaded && !activityLoadError {
                    VStack(spacing: 8) {
                        ForEach(0..<6, id: \.self) { _ in compactSkeletonRow() }
                    }
                    .padding(.horizontal, 16)
                } else if activityLoadError {
                    emptyState(
                        title: "Couldn\u{2019}t load activity",
                        description: "There was a problem loading your activity. Pull to refresh."
                    )
                } else {
                    let filtered = filteredActivityItems()
                    if filtered.isEmpty {
                        VStack(spacing: 10) {
                            emptyState(
                                title: "No activity yet — read an article to get started.",
                                description: "Read an article or leave a comment to see it here."
                            )
                            Button {
                                auth.pendingHomeJump = true
                            } label: {
                                Text("Browse articles")
                                    .font(.system(.footnote, design: .default, weight: .semibold))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 20)
                                    .padding(.vertical, 10)
                                    .frame(minHeight: 44)
                                    .background(VP.accent)
                                    .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
                            }
                        }
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
        .task { await ensureActivityLoaded() }
    }

    private func ensureActivityLoaded() async {
        guard !activityLoaded, !activityLoadError, let uid = auth.currentUser?.id else { return }
        await loadActivity(userId: uid)
    }

    private func combinedActivityAllTypes() -> [ActivityItem] {
        activity.sorted { $0.time > $1.time }
    }

    private func filteredActivityItems() -> [ActivityItem] {
        switch activityFilter {
        case .all:       return combinedActivityAllTypes()
        case .articles:  return activity.filter { $0.type == .read || $0.type == .quiz }
        case .comments:  return activity.filter { $0.type == .comment }
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
                        RoundedRectangle(cornerRadius: VP.radiusXS)
                            .stroke(activityColor(item.type), lineWidth: 1)
                    )
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.label)
                        .font(.system(.footnote, design: .default, weight: .medium))
                        .foregroundColor(VP.text)
                        .lineLimit(1)
                    if item.type == .comment, !item.detail.isEmpty {
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
        case .read:    return "Read"
        case .quiz:    return "Quiz"
        case .comment: return "Comment"
        }
    }

    private func activityColor(_ t: ActivityItem.ActivityType) -> Color {
        switch t {
        case .read:    return VP.readColor
        case .quiz:    return VP.quizColor
        case .comment: return VP.commentColor
        }
    }

    // MARK: - Categories section
    @ViewBuilder
    private var categoriesSection: some View {
        ScrollView {
            VStack(spacing: 10) {
                if !categoriesLoaded && !categoriesLoadError {
                    VStack(spacing: 8) {
                        ForEach(0..<4, id: \.self) { _ in
                            RoundedRectangle(cornerRadius: VP.radiusMD)
                                .fill(VP.surfaceSunken)
                                .frame(height: 48)
                                .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.border))
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                } else if categoriesLoadError {
                    emptyState(
                        title: "Couldn\u{2019}t load categories",
                        description: "There was a problem loading your category progress. Pull to refresh."
                    )
                } else if categories.isEmpty {
                    emptyState(
                        title: "No category stats yet — start reading to see your breakdown.",
                        description: "Choose topics you care about to personalize your feed and unlock category scoring."
                    )
                } else {
                    ForEach(categories) { cat in
                        categoryCard(cat)
                    }
                    .padding(.top, 12)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .task { await ensureCategoriesLoaded() }
    }

    private func ensureCategoriesLoaded() async {
        guard !categoriesLoaded, !categoriesLoadError, let uid = auth.currentUser?.id else { return }
        await loadCategories(userId: uid)
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
                .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.border))
                .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
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
                            .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: isExpanded)
                    }
                    .padding(14)
                }
                .buttonStyle(.plain)

                if isExpanded {
                    Divider().background(VP.border)
                    VStack(alignment: .leading, spacing: 0) {
                        StatRowView(label: "Read", value: catReads, total: max(totalReads, 1))
                        StatRowView(label: "Quizzes", value: catQuizzes, total: max(totalQuizzes, 1))
                        StatRowView(label: "Discussion", value: catComments, total: max(totalComments, 1))
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
        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
        .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(anyProgress ? VP.border : Color.clear))
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
                            .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: open)
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
                    StatRowView(label: "Discussion", value: stats.comments, total: subThresholds.comments)
                    StatRowView(label: "Upvotes", value: upv, total: subThresholds.upvotes)
                }
                .padding(.leading, 8)
                .padding(.vertical, 6)
            }
        }
        .opacity(unlocked ? 1 : 0.5)
    }

    // MARK: - Milestones section
    @ViewBuilder
    private func milestonesSection(user: VPUser) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
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
                        LazyVGrid(
                            columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)],
                            spacing: 10
                        ) {
                            ForEach(0..<4, id: \.self) { _ in
                                VStack(spacing: 8) {
                                    SkeletonBar(width: 44, height: 44, radius: VP.radiusMD)
                                    SkeletonBar(width: 80, height: 12)
                                    SkeletonBar(width: 56, height: 10)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(12)
                                .background(VP.card)
                                .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
                            }
                        }
                        .padding(.top, 8)
                        .accessibilityLabel("Loading achievements")
                    } else if allAchievements.isEmpty {
                        emptyState(
                            title: "No achievements unlocked yet — keep reading and quizzing to earn your first.",
                            description: "Complete a quiz to start collecting badges."
                        )
                    } else {
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
            .padding(.top, 12)
            .padding(.bottom, 24)
        }
        .task { await ensureAchievementsLoaded() }
    }

    private func ensureAchievementsLoaded() async {
        guard !achievementsLoaded, let uid = auth.currentUser?.id else { return }
        await loadAchievements(userId: uid)
    }

    private func achievementCard(_ a: Achievement, earnedAt: Date?) -> some View {
        let isEarned = earnedAt != nil
        return VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .top) {
                HStack(spacing: 6) {
                    Image(systemName: isEarned ? "rosette" : "lock.fill")
                        .font(.system(size: VP.Size.sm, weight: .semibold))
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
                        RoundedRectangle(cornerRadius: VP.radiusXS)
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
        .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.border))
        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
        .opacity(isEarned ? 1 : 0.55)
    }

    // MARK: - Security hub (wraps Email + Password + MFA as sub-rail)
    //
    // Web's SecuritySection bundles email + 2FA in one view; iOS already
    // ships dedicated EmailSettingsView (:1560), PasswordSettingsView (:1639),
    // MFASettingsView (:1970). The hub renders them as 3 NavigationLink rows
    // so the section parity holds without rewriting each subview.
    @ViewBuilder
    private var securityHub: some View {
        List {
            NavigationLink {
                EmailSettingsView().environmentObject(auth)
            } label: {
                hubRow(icon: "envelope", title: "Email", caption: "Update your email and resend verification.")
            }
            NavigationLink {
                PasswordSettingsView().environmentObject(auth)
            } label: {
                hubRow(icon: "lock", title: "Password", caption: "Change your password.")
            }
            NavigationLink {
                MFASettingsView().environmentObject(auth)
            } label: {
                hubRow(icon: "key.horizontal", title: "Two-factor authentication", caption: "Authenticator app for sign-in.")
            }
        }
        .listStyle(.insetGrouped)
    }

    private func hubRow(icon: String, title: String, caption: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: VP.Size.lg, weight: .regular))
                .foregroundColor(VP.dim)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(.subheadline, design: .default, weight: .semibold))
                    .foregroundColor(VP.text)
                Text(caption)
                    .font(.caption2)
                    .foregroundColor(VP.dim)
                    .lineLimit(2)
            }
            Spacer()
        }
        .padding(.vertical, 4)
    }

    // MARK: - Help section (mirrors web LinkOutSection)
    @ViewBuilder
    private var helpSection: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("FAQs, status, and how to reach a human.")
                    .font(.subheadline)
                    .foregroundColor(VP.soft)
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                VStack(spacing: 10) {
                    Link(destination: URL(string: "https://veritypost.com/help")!) {
                        linkOutRow(icon: "questionmark.circle.fill", label: "Open help center", subtitle: "Browse the FAQ", isPrimary: true)
                    }
                    Link(destination: URL(string: "https://veritypost.com/contact")!) {
                        linkOutRow(icon: "envelope.fill", label: "Contact support", subtitle: "Send a note to the team", isPrimary: false)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
        }
    }

    private func linkOutRow(icon: String, label: String, subtitle: String, isPrimary: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: VP.Size.lg, weight: .regular))
                .foregroundColor(isPrimary ? .white : VP.text)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.system(.subheadline, design: .default, weight: .semibold))
                    .foregroundColor(isPrimary ? .white : VP.text)
                Text(subtitle)
                    .font(.caption2)
                    .foregroundColor(isPrimary ? .white.opacity(0.85) : VP.dim)
            }
            Spacer()
            Image(systemName: "arrow.up.right.square")
                .font(.caption)
                .foregroundColor(isPrimary ? .white.opacity(0.85) : VP.dim)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(minHeight: 56)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(isPrimary ? VP.accent : VP.card)
        .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(isPrimary ? Color.clear : VP.border))
        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
    }

    // MARK: - Sign out section
    @ViewBuilder
    private var signoutSection: some View {
        ScrollView {
            VStack(spacing: 16) {
                Text("Sign out of this device. You can sign back in any time.")
                    .font(.subheadline)
                    .foregroundColor(VP.soft)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                    .padding(.top, 16)
                Button { Task { await auth.logout() } } label: {
                    Text("Sign out")
                        .font(.system(.subheadline, design: .default, weight: .semibold))
                        .foregroundColor(VP.wrong)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.border))
                }
                .padding(.horizontal, 16)
                Spacer()
            }
        }
    }

    // MARK: - Web fallback (sections without iOS analogues)
    @ViewBuilder
    private func webFallback(title: String, body: String, path: String) -> some View {
        let url = URL(string: "https://veritypost.com\(path)")!
        ScrollView {
            VStack(spacing: 14) {
                Spacer().frame(height: 24)
                Image(systemName: "globe")
                    .font(.system(size: VP.Size.display, weight: .regular))
                    .foregroundColor(VP.dim)
                Text(title)
                    .font(.system(.title3, design: .default, weight: .bold))
                    .foregroundColor(VP.text)
                Text(body)
                    .font(.footnote)
                    .foregroundColor(VP.dim)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                Link(destination: url) {
                    HStack(spacing: 6) {
                        Text("Open on web")
                            .font(.system(.subheadline, design: .default, weight: .semibold))
                        Image(systemName: "arrow.up.right.square")
                            .font(.caption)
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 22)
                    .padding(.vertical, 12)
                    .frame(minHeight: 44)
                    .background(VP.accent)
                    .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
                }
                Spacer()
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Logout footer (phone shell bottom)
    private var logoutFooter: some View {
        VStack(spacing: 0) {
            Button { Task { await auth.logout() } } label: {
                Text("Sign out")
                    .font(.system(.subheadline, design: .default, weight: .semibold))
                    .foregroundColor(VP.wrong)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.border))
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 100)
        }
    }

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

    // MARK: - Refresh (pull-to-refresh)
    private func refreshAll() async {
        guard let uid = auth.currentUser?.id else { return }
        async let a: Void = loadActivity(userId: uid)
        async let c: Void = loadCategories(userId: uid)
        async let ach: Void = loadAchievements(userId: uid)
        async let u: Void = auth.loadUser(id: uid)
        async let unread: Void = loadUnreadDMCount()
        _ = await (a, c, ach, u, unread)
    }

    // MARK: - Data loaders (unchanged from pre-shell-port)
    private func loadActivity(userId: String) async {
        do {
            let cutoff = canViewActivityFullHistory
                ? "1970-01-01T00:00:00Z"
                : ISO8601DateFormatter().string(from: Date().addingTimeInterval(-30 * 24 * 3600))
            async let r: [ReadingLogItem] = client.from("reading_log")
                .select("id, read_at, completed, articles(title, stories(slug))")
                .eq("user_id", value: userId)
                .is("kid_profile_id", value: nil)
                .gte("created_at", value: cutoff)
                .order("created_at", ascending: false).limit(50).execute().value
            async let q: [QuizAttempt] = client.from("quiz_attempts")
                .select("id, article_id, attempt_number, is_correct, points_earned, created_at, articles(title, stories(slug))")
                .eq("user_id", value: userId)
                .is("kid_profile_id", value: nil)
                .gte("created_at", value: cutoff)
                .order("created_at", ascending: false).limit(200).execute().value
            async let c: [VPComment] = client.from("comments")
                .select("id, body, created_at, articles(title, stories(slug))")
                .eq("user_id", value: userId)
                .gte("created_at", value: cutoff)
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
        } catch {
            Log.d("Load activity error: \(error)")
            activityLoadError = true
            return
        }
        activityLoaded = true
    }

    private func loadCategories(userId: String) async {
        do {
            async let allCats: [VPCategory] = client.from("categories")
                .select()
                .eq("is_kids_safe", value: false)
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

            struct TallyRow: Decodable {
                let category_id: String?
                let subcategory_id: String?
                let n: Int
            }
            struct TallyParams: Encodable { let p_user_id: String }
            let tallyRows: [TallyRow] = (try? await client
                .rpc("user_received_upvote_category_tally", params: TallyParams(p_user_id: userId))
                .execute().value) ?? []
            var catU: [String: Int] = [:]
            var subU: [String: Int] = [:]
            for r in tallyRows {
                if let cid = r.category_id { catU[cid, default: 0] += r.n }
                if let sid = r.subcategory_id { subU[sid, default: 0] += r.n }
            }
            catUpvotes = catU
            subUpvotes = subU
        } catch {
            Log.d("Load categories error: \(error)")
            categoriesLoadError = true
            return
        }
        categoriesLoaded = true
    }

    private func loadAchievements(userId: String) async {
        do {
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
        let filtered = initials.filter { $0.isLetter || $0.isNumber }
        return String(filtered.prefix(3))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
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
                            .font(.system(size: VP.Size.sm))
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
            .font(.system(size: VP.Size.sm, weight: .semibold))
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

// MARK: - Follower / Following list

enum UserFollowMode { case followers, following }

struct UserFollowListView: View {
    @EnvironmentObject var auth: AuthViewModel
    let userId: String
    let mode: UserFollowMode
    private let client = SupabaseManager.shared.client

    struct FollowUser: Decodable, Identifiable {
        let id: String
        let username: String?
        let avatar_color: String?
        let avatar_url: String?
    }

    private struct FollowRow: Decodable {
        let users: FollowUser?
    }

    @State private var users: [FollowUser] = []
    @State private var loaded = false
    @State private var loadError = false

    var body: some View {
        Group {
            if !loaded {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            } else if loadError {
                VStack(spacing: 8) {
                    Text("Couldn\u{2019}t load list.")
                        .font(.system(.callout, design: .default, weight: .semibold))
                        .foregroundColor(VP.text)
                    Button("Try again") { loaded = false; loadError = false; Task { await load() } }
                        .font(.system(.footnote, design: .default, weight: .medium))
                        .foregroundColor(VP.brand)
                }
                .frame(maxWidth: .infinity).padding(.top, 60)
            } else if users.isEmpty {
                Text(mode == .followers ? "No followers yet." : "Not following anyone yet.")
                    .font(.footnote).foregroundColor(VP.dim)
                    .frame(maxWidth: .infinity).padding(.top, 60)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(Array(users.enumerated()), id: \.element.id) { idx, u in
                            HStack(spacing: 12) {
                                AvatarView(
                                    outerHex: u.avatar_color,
                                    initials: String(u.username?.prefix(1).uppercased() ?? "?"),
                                    size: 36
                                )
                                Text(u.username ?? "user")
                                    .font(.system(size: VP.Size.base, weight: .medium))
                                    .foregroundColor(VP.text)
                                Spacer()
                            }
                            .padding(.horizontal, 20)
                            .padding(.vertical, 12)
                            .overlay(alignment: .bottom) {
                                if idx < users.count - 1 {
                                    Rectangle()
                                        .fill(VP.border.opacity(0.6))
                                        .frame(height: 1)
                                        .padding(.leading, 68)
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(mode == .followers ? "Followers" : "Following")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        struct Params: Encodable { let p_user_id: String; let p_limit: Int }
        do {
            let fn = mode == .followers ? "list_user_followers" : "list_user_following"
            let rows: [FollowUser] = try await client
                .rpc(fn, params: Params(p_user_id: userId, p_limit: 200))
                .execute().value
            users = rows
            loaded = true
        } catch {
            Log.d("UserFollowListView load error:", error)
            loadError = true
            loaded = true
        }
    }
}

// Q-NEW5 (2026-05-12) — viewport-width measurement.
private struct ProfileViewportWidthKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}
