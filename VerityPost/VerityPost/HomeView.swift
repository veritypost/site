import SwiftUI
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified home_feed 2026-04-23

// Hand-curated front page per Future Projects/09_HOME_FEED_REBUILD.md.
// 1 hero + supporting stories, dated, page ends. Mirrors web/src/app/page.tsx
// — same hero-pick-by-date mechanism via the schema/144 columns
// (`hero_pick_for_date`), same editorial timezone (America/New_York), same
// "page ends with Browse all categories" dismount. No category pills, no
// search, no ads, no algorithmic feed, no infinite scroll on this surface.
//
// Stripped vs prior HomeView (commit before 2026-04-23):
//   - categoryPillRow + subcategoryPillRow
//   - searchOverlay (entire search UI; /search stays accessible elsewhere)
//   - HomeAdSlot + shouldShowAd (ads move to in-article only)
//   - "Load more articles" pagination (page ends per spec)
//   - All loadMore + performSearch + page tracking state

struct HomeView: View {
    @EnvironmentObject var auth: AuthViewModel
    @ObservedObject private var perms = PermissionStore.shared
    private let client = SupabaseManager.shared.client

    @State private var stories: [Story] = []
    @State private var breakingStory: Story? = nil
    @State private var categories: [VPCategory] = []
    @State private var loading = true
    @State private var loadError: String? = nil
    @State private var showRegistrationWall = false
    // T244 — handle for the in-flight pull-to-refresh load. Cancelled
    // before each new pull so two fast drags don't stack parallel HTTP
    // requests fighting to write the same @State.
    @State private var refreshTask: Task<Void, Never>? = nil

    @ScaledMetric(relativeTo: .largeTitle) private var heroTitleSize: CGFloat = 32
    @ScaledMetric(relativeTo: .title3) private var cardTitleSize: CGFloat = 21

    @State private var canViewBreakingBanner: Bool = false
    @State private var canViewBreakingBannerPaid: Bool = false
    // Search affordance — magnifier above the masthead, gated by
    // `search.basic`. The icon used to live in the global tab-bar/top-bar
    // chrome; it was relocated to the home feed so the search entry point
    // is contextual rather than persistent on every surface.
    @State private var canSearch: Bool = false
    // Sections sheet — grid icon in top bar opens HomeSectionsSheet.
    @State private var showSectionsMenu = false
    // "New since last visit" pill — tracks when home was last opened.
    @State private var lastVisitDate: Date? = nil
    // Theme preference — shares storage with SettingsView's Appearance row
    // and VerityPostApp's .preferredColorScheme(). The top-bar button below
    // mirrors web's NavWrapper theme toggle (vp_theme localStorage / data-
    // theme attribute), letting users cycle light/dark/system without
    // diving into Settings.
    @AppStorage("vp_theme") private var vpTheme: String = "system"
    // Q-NEW3 (2026-05-12) — iPad cap + 2-col grid. Width fed by a passive
    // `.background(GeometryReader)` on the outer body so layout reflows
    // through Split View / Slide Over / Stage Manager width changes.
    @Environment(\.horizontalSizeClass) private var hSize
    @State private var viewportWidth: CGFloat = 0
    private var isGridMode: Bool {
        hSize == .regular && viewportWidth > VP.LayoutBreak.homeGrid
    }

    private static let editorialTimeZone = TimeZone(identifier: "America/New_York") ?? .current

    // MARK: - Formatters (static to avoid per-render allocation)
    private static let computeIsoFmt: DateFormatter = {
        let f = DateFormatter()
        f.timeZone = editorialTimeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
    private static let computeHumanFmt: DateFormatter = {
        let f = DateFormatter()
        f.timeZone = editorialTimeZone
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "EEEE, MMMM d, yyyy"
        return f
    }()
    private static let loadDataISOFmt = ISO8601DateFormatter()

    // MARK: - Editorial ad gate (Wave 2.5c)
    //
    // Sensitivity tags that disqualify an article from appearing next to a
    // home-page ad slot. Mirrors web/src/app/_home/data.ts and the serve_ad
    // RPC's per-article block; HomeAdSlot here doesn't pass article_id, so
    // we have to gate at the feed-fetch layer instead of at ad-serve time.
    private static let blockingSensitivityTags: Set<String> = [
        "tragedy",
        "breaking_casualty",
        "suicide_coverage",
        "cw_sa",
        "cw_violence",
        "obit",
    ]

    private static func isHomeBlocked(_ article: Story) -> Bool {
        if article.adEligible == false { return true }
        guard let tags = article.sensitivityTags, !tags.isEmpty else { return false }
        return tags.contains { blockingSensitivityTags.contains($0) }
    }
    private static let timeShortFmt: DateFormatter = {
        let f = DateFormatter()
        f.timeZone = editorialTimeZone
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "MMM d"
        return f
    }()

    private struct EditorialToday {
        let isoDate: String   // "2026-04-23" matching `hero_pick_for_date`
        let startUtc: Date    // midnight ETZ today, expressed as Date (UTC under the hood)
        let humanDate: String // "Thursday, April 23, 2026" for the masthead
    }

    private static func computeToday() -> EditorialToday {
        let now = Date()

        let isoFmt = HomeView.computeIsoFmt

        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = editorialTimeZone

        let humanFmt = HomeView.computeHumanFmt

        return EditorialToday(
            isoDate: isoFmt.string(from: now),
            startUtc: cal.startOfDay(for: now),
            humanDate: humanFmt.string(from: now)
        )
    }

    @State private var today: EditorialToday = HomeView.computeToday()

    // Category accent palette. Stale comment removed 2026-05-13: there is
    // no web `CATEGORY_PALETTE` to mirror — web has no per-category band.
    // 16 slugs, 9 unique colors by design (politics+congress, the three
    // money slugs, animals+kids-animals share parent hues). adaptive:true
    // wraps each so dark-mode picks a +0.22-brightness HSB lift; see
    // Theme.swift `Color.init(hex:adaptive:)`.
    private static let categoryPalette: [String: Color] = [
        "politics":          Color(hex: "1e3a5f", adaptive: true),
        "congress":          Color(hex: "1e3a5f", adaptive: true),
        "space":             Color(hex: "1a1a2e", adaptive: true),
        "science":           Color(hex: "0f3d2e", adaptive: true),
        "ai":                Color(hex: "1a1a2e", adaptive: true),
        "markets":           Color(hex: "1b2a1b", adaptive: true),
        "personal-finance":  Color(hex: "1b2a1b", adaptive: true),
        "jobs":              Color(hex: "1b2a1b", adaptive: true),
        "weather":           Color(hex: "1a3050", adaptive: true),
        "public-health":     Color(hex: "3d1a1a", adaptive: true),
        "nfl":               Color(hex: "1a2a3d", adaptive: true),
        "movies":            Color(hex: "2a1a2a", adaptive: true),
        "asia":              Color(hex: "2a1a1a", adaptive: true),
        "animals":           Color(hex: "1a2a1a", adaptive: true),
        "kids-science":      Color(hex: "0f3d2e", adaptive: true),
        "kids-animals":      Color(hex: "1a2a1a", adaptive: true),
    ]

    private func heroBg(for story: Story) -> Color {
        if let cat = categories.first(where: { $0.id == story.categoryId }) {
            // Editorial-picked color also gets the dark-mode lift. If
            // editorial ever needs to opt a specific category OUT of the
            // lift (e.g. a deliberately near-black band for a memorial
            // section), the call below becomes branch-by-cat.
            if let hex = cat.colorHex, !hex.isEmpty { return Color(hex: hex, adaptive: true) }
            if let slug = cat.slug, let c = HomeView.categoryPalette[slug] { return c }
        }
        // Fallback for categoryless stories — lifted in dark to match the
        // palette's edge-against-systemBackground behaviour.
        return Color(hex: "1a1a1a", adaptive: true)
    }

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                topBar
                ScrollView {
                    VStack(spacing: 0) {
                        // Breaking strip — narrow, top of feed. Renders only
                        // when an active breaking-flagged article exists today
                        // AND the viewer has the permission. Mirrors the
                        // dedicated `is_breaking=true` query the web home
                        // runs.
                        if canViewBreakingBanner, let breaking = breakingStory {
                            NavigationLink(value: breaking) {
                                breakingStrip(for: breaking)
                            }
                            .buttonStyle(.plain)
                            .accessibilityElement(children: .combine)
                            .accessibilityLabel("Breaking news: \(breaking.title ?? "Breaking news")")
                        }

                        if loading {
                            loadingState
                        } else if let err = loadError {
                            errorState(err)
                        } else if stories.isEmpty {
                            VStack(spacing: 8) {
                                Text("Nothing published today.")
                                    .font(.system(.callout, design: .default, weight: .semibold))
                                    .foregroundColor(VP.text)
                                Text("Check back soon for the latest news.")
                                    .font(.system(.footnote, design: .default, weight: .regular))
                                    .foregroundColor(VP.dim)
                                    .multilineTextAlignment(.center)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.horizontal, 40)
                            .padding(.top, 60)
                        } else {
                            if let hero = stories.first {
                                heroBlock(hero)
                                // Ads — placements own their tier split via
                                // `ios_home_<slot>_<tier>` names; helper picks
                                // anon vs free based on auth state. Paid tiers
                                // are hidden server-side via hidden_for_tiers.
                                // Migration `ios_home_placements_tier_split`
                                // (2026-05-13) owns the names. Self-hides on
                                // no-fill. Adjacency safety lives in the
                                // feed-fetch filter (see isHomeBlocked below).
                                HomeAdSlot(placement: iosHomePlacement(.top, authed: auth.isLoggedIn), page: "home")
                            }

                            let supporting = Array(stories.dropFirst())
                            if !supporting.isEmpty {
                                // Q-NEW3 (2026-05-12) — single-column stays
                                // 680pt-capped (phone + iPad portrait + iPad
                                // Pro 12.9" portrait at 1024pt); flips to a
                                // 2-col `LazyVGrid` when `.regular` size
                                // class AND viewport >1100pt (iPad Pro 11"
                                // landscape, iPad Pro 12.9" landscape).
                                // Inter-feed ad slots drop in grid mode —
                                // they're authored as full-width column
                                // breaks; `home_below_fold` stays.
                                if isGridMode {
                                    LazyVGrid(
                                        columns: [
                                            GridItem(.flexible(), spacing: 24),
                                            GridItem(.flexible(), spacing: 24),
                                        ],
                                        alignment: .leading,
                                        spacing: 32
                                    ) {
                                        ForEach(supporting) { story in
                                            NavigationLink(value: story) {
                                                supportingCard(story)
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                    .padding(.horizontal, 20)
                                    .frame(maxWidth: VP.LayoutBreak.homeGrid, alignment: .leading)
                                    .frame(maxWidth: .infinity)
                                    .padding(.top, 40)
                                } else {
                                    VStack(spacing: 0) {
                                        ForEach(Array(supporting.enumerated()), id: \.element.id) { idx, story in
                                            if idx > 0 {
                                                hairline.padding(.horizontal, 20)
                                            }
                                            NavigationLink(value: story) {
                                                supportingCard(story)
                                                    .padding(.horizontal, 20)
                                            }
                                            .buttonStyle(.plain)
                                            if idx == 3 {
                                                HomeAdSlot(placement: iosHomePlacement(.inFeed1, authed: auth.isLoggedIn), page: "home")
                                                    .padding(.top, 24)
                                            }
                                            if idx == 7 {
                                                HomeAdSlot(placement: iosHomePlacement(.inFeed2, authed: auth.isLoggedIn), page: "home")
                                                    .padding(.top, 24)
                                            }
                                        }
                                    }
                                    .frame(maxWidth: VP.LayoutBreak.readingColumn, alignment: .leading)
                                    .frame(maxWidth: .infinity)
                                    .padding(.top, 40)
                                }
                                HomeAdSlot(placement: iosHomePlacement(.belowFold, authed: auth.isLoggedIn), page: "home")
                                    .padding(.top, 16)
                            }

                            NavigationLink {
                                RecapListView().environmentObject(auth)
                            } label: {
                                HStack {
                                    Image(systemName: "clock.fill")
                                        .font(.system(size: VP.Size.sm, weight: .semibold))
                                        .foregroundColor(VP.brand)
                                    Text("See all recaps")
                                        .font(.system(size: VP.Size.base, weight: .semibold))
                                        .foregroundColor(VP.text)
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.system(size: VP.Size.sm, weight: .semibold))
                                        .foregroundColor(VP.muted)
                                }
                                .padding(.horizontal, 20)
                                .padding(.vertical, 16)
                                .background(VP.card)
                                .overlay(Rectangle().fill(VP.border).frame(height: 1), alignment: .top)
                            }
                            .buttonStyle(.plain)
                            .padding(.top, 32)

                        }
                    }
                    .navigationDestination(for: Story.self) { story in
                        StoryDetailView(story: story)
                            .onAppear { trackArticleView(articleId: story.id) }
                    }
                    .padding(.bottom, 80)
                }
                .refreshable {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    refreshTask?.cancel()
                    refreshTask = Task { await loadData() }
                    _ = await refreshTask?.value
                }
            }
            .background(VP.bg.ignoresSafeArea())

            if showRegistrationWall {
                registrationWallOverlay
            }
        }
        .background(
            GeometryReader { proxy in
                Color.clear
                    .preference(key: HomeViewportWidthKey.self, value: proxy.size.width)
            }
        )
        .onPreferenceChange(HomeViewportWidthKey.self) { viewportWidth = $0 }
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            // T244b — share `refreshTask` with `.refreshable` so a pull-to-refresh
            // started before the initial load finishes cancels the in-flight task
            // instead of stacking a second writer onto the same @State.
            // Capture last visit before loading so "New" badges reflect the
            // previous session, then stamp the current visit time.
            lastVisitDate = UserDefaults.standard.object(forKey: "vp_last_home_visit_at") as? Date
            UserDefaults.standard.set(Date(), forKey: "vp_last_home_visit_at")
            today = HomeView.computeToday()
            refreshTask?.cancel()
            refreshTask = Task { await loadData() }
            _ = await refreshTask?.value
        }
        .task(id: perms.changeToken) {
            guard perms.isLoaded else { return }
            canViewBreakingBanner = await PermissionService.shared.has("home.breaking_banner.view")
            canViewBreakingBannerPaid = await PermissionService.shared.has("home.breaking_banner.view.paid")
            canSearch = await PermissionService.shared.has("search.basic")
        }
        // Section E.1 — listen for the foreground-staleness signal from
        // VerityPostApp's scenePhase handler. Reuses the existing
        // refreshTask path so .refreshable + scenePhase + perms all share
        // one writer instead of stacking parallel loads.
        .onReceive(NotificationCenter.default.publisher(for: .vpHomeFeedRefreshIfStale)) { _ in
            refreshTask?.cancel()
            refreshTask = Task { await loadData() }
        }
    }

    // MARK: - Top bar (brand + sections + search)
    //
    // Nav restructure 2026-05-06: mirrors mobile web top bar.
    // Wordmark left; sections grid icon + optional search icon right.
    // Date moved out of the top bar (was mid-bar; web doesn't show it there).

    private var topBar: some View {
        HStack(spacing: 0) {
            Text("Verity Post")
                .font(.system(size: VP.Size.base, weight: .heavy))
                .tracking(-0.15)
                .foregroundColor(VP.text)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
            Spacer()
            if canSearch {
                NavigationLink {
                    FindView().environmentObject(auth)
                } label: {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: VP.Size.lg, weight: .regular))
                        .foregroundColor(VP.dim)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Search")
                .buttonStyle(.plain)
            }
            // Theme cycle — mirrors web's tap-to-cycle ThemeToggle. Icon
            // represents the CURRENT mode (so the accessibility label
            // matches what the user is on). Tap order: system → light →
            // dark → system, identical to web. Persistence + app-wide
            // .preferredColorScheme() are already wired through
            // VerityPostApp + the existing Settings row.
            Button {
                switch vpTheme {
                case "system": vpTheme = "light"
                case "light":  vpTheme = "dark"
                default:       vpTheme = "system"
                }
            } label: {
                Image(systemName: {
                    switch vpTheme {
                    case "light": return "sun.max.fill"
                    case "dark":  return "moon.fill"
                    default:      return "circle.lefthalf.filled"
                    }
                }())
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(VP.text)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel({
                switch vpTheme {
                case "light": return "Theme: Light"
                case "dark":  return "Theme: Dark"
                default:      return "Theme: System"
                }
            }())
            Button {
                showSectionsMenu = true
            } label: {
                Image(systemName: "square.grid.2x2")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(VP.text)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Browse sections")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(VP.bg)
        .overlay(
            Rectangle().fill(VP.border).frame(height: 1),
            alignment: .bottom
        )
        .sheet(isPresented: $showSectionsMenu) {
            HomeSectionsSheet(categories: categories)
        }
    }

    // MARK: - Hero / Supporting

    @ViewBuilder
    private func heroBlock(_ story: Story) -> some View {
        let bg = heroBg(for: story)
        NavigationLink(value: story) {
            VStack(alignment: .leading, spacing: 0) {
                if let cat = categoryName(for: story.categoryId) {
                    Text(cat.uppercased())
                        .font(.system(.caption2, design: .serif, weight: .semibold))
                        .tracking(1.4)
                        .foregroundColor(.white.opacity(0.65))
                        .padding(.bottom, 14)
                }
                Text(story.title ?? "Untitled")
                    .font(.system(size: heroTitleSize, weight: .bold, design: .serif))
                    .tracking(-0.4)
                    .lineSpacing(2)
                    .foregroundColor(.white)
                    .fixedSize(horizontal: false, vertical: true)
                if let excerpt = story.excerpt, !excerpt.isEmpty {
                    Text(excerpt)
                        .font(.system(.body, design: .serif, weight: .regular))
                        .lineSpacing(4)
                        .foregroundColor(.white.opacity(0.80))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 14)
                }
                heroStatusRow(for: story)
                    .padding(.top, 14)
                    .padding(.bottom, 4)
            }
            // Q-NEW3 (2026-05-12) — content capped at 680pt centered;
            // colored hero background still runs edge-to-edge as a banner
            // via `ignoresSafeArea(edges: .horizontal)` below.
            .frame(maxWidth: VP.LayoutBreak.readingColumn, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.vertical, 40)
            .frame(maxWidth: .infinity)
            .background(bg.ignoresSafeArea(edges: .horizontal))
            // VoiceOver: collapse the 5 Text nodes into a single focusable
            // element + composed label. `.ignore` (not `.combine`) so the
            // headline reads first instead of being buried behind the
            // category eyebrow + Breaking/Developing badge.
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(heroAccessibilityLabel(for: story))
            .accessibilityAddTraits(.isLink)
        }
        .buttonStyle(.plain)
    }

    // Lead status row — mono pills under the hero deck. Mirrors the v2 web
    // Lead's `LIFECYCLE · N events · Updated Xm ago` strip. iOS hero feed
    // doesn't fetch timeline events, so the event-count pill is omitted by
    // design; lifecycle (BREAKING / DEVELOPING) and the relative published
    // time render when the underlying data is present, and a pill is gracefully
    // skipped when its field is missing.
    @ViewBuilder
    private func heroStatusRow(for story: Story) -> some View {
        let lifecycleLabel: String? = {
            if story.isBreaking == true { return "BREAKING" }
            if story.isDeveloping == true { return "DEVELOPING" }
            return nil
        }()
        let updatedLabel: String? = story.publishedAt.map { "Updated \(timeAgo($0))" }

        let segments: [(text: String, isLifecycle: Bool)] = {
            var out: [(String, Bool)] = []
            if let l = lifecycleLabel { out.append((l, true)) }
            if let u = updatedLabel { out.append((u, false)) }
            return out
        }()

        // Hero sits on a category-tinted dark bg (see heroBg). Burgundy text
        // on warm-tone palettes (public-health #3d1a1a, asia #2a1a1a, movies
        // #2a1a2a) sub-AA — burgundy-on-burgundy is invisible. Use white-
        // opacity family on iOS hero so contrast works on every category
        // tint. Web Lead uses burgundy because its bg is cream gradient.
        if !segments.isEmpty {
            HStack(spacing: 6) {
                ForEach(Array(segments.enumerated()), id: \.offset) { idx, seg in
                    if idx > 0 {
                        Text("·")
                            .font(.system(.caption2, design: .monospaced, weight: .medium))
                            .foregroundColor(.white.opacity(0.4))
                    }
                    if seg.isLifecycle {
                        Text(seg.text)
                            .font(.system(.caption2, design: .monospaced, weight: .medium))
                            .tracking(1.2)
                            .textCase(.uppercase)
                            .foregroundColor(.white.opacity(0.95))
                    } else {
                        Text(seg.text)
                            .font(.system(.caption2, design: .monospaced, weight: .medium))
                            .tracking(1.0)
                            .foregroundColor(.white.opacity(0.65))
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    private func supportingCard(_ story: Story) -> some View {
        let isNew: Bool = {
            guard let pub = story.publishedAt, let last = lastVisitDate else { return false }
            return pub > last
        }()
        VStack(alignment: .leading, spacing: 0) {
            if isNew {
                Text("New")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(VP.accent)
                    .clipShape(Capsule())
                    .padding(.bottom, 6)
            }
            if let cat = categoryName(for: story.categoryId) {
                eyebrow(cat).padding(.bottom, 8)
            }
            if story.isBreaking == true {
                Text("Breaking")
                    .font(.system(.caption2, design: .default, weight: .semibold))
                    .tracking(0.8)
                    .textCase(.uppercase)
                    .foregroundColor(VP.breaking)
                    .padding(.bottom, 4)
            } else if story.isDeveloping == true {
                Text("Developing")
                    .font(.system(.caption2, design: .default, weight: .semibold))
                    .tracking(0.8)
                    .textCase(.uppercase)
                    .foregroundColor(VP.warn)
                    .padding(.bottom, 4)
            }

            Text(story.title ?? "Untitled")
                .font(.system(size: cardTitleSize, weight: .bold, design: .serif))
                .tracking(-0.2)
                .lineSpacing(1)
                .foregroundColor(VP.text)
                .fixedSize(horizontal: false, vertical: true)

            if let excerpt = story.excerpt, !excerpt.isEmpty {
                Text(excerpt)
                    .font(.system(.subheadline, design: .serif, weight: .regular))
                    .lineSpacing(2)
                    .foregroundColor(VP.soft)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
            }

            metaLine(for: story)
                .padding(.top, 10)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 24)
        // VoiceOver: collapse the up-to-6 Text nodes (New / eyebrow /
        // Breaking|Developing / title / excerpt / time) into a single
        // focusable element + composed label. `.ignore` keeps headline
        // first; isLink restores the NavigationLink trait the wrapper
        // applies, since children's intrinsic traits get dropped.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(supportingAccessibilityLabel(for: story, isNew: isNew))
        .accessibilityAddTraits(.isLink)
    }

    @ViewBuilder
    private func eyebrow(_ name: String) -> some View {
        Text(name.uppercased())
            .font(.system(.caption2, design: .serif, weight: .semibold))
            .tracking(1.4)
            .foregroundColor(VP.muted)
    }

    @ViewBuilder
    private func metaLine(for story: Story) -> some View {
        Text(timeShort(story.publishedAt))
            .font(.system(.footnote, design: .default, weight: .medium))
            .foregroundColor(VP.muted)
    }

    private var hairline: some View {
        Rectangle()
            .fill(VP.rule)
            .frame(height: 1)
    }

    // MARK: - Empty / loading / error

    private var loadingState: some View {
        VStack(spacing: 0) {
            // Hero block skeleton
            VStack(alignment: .leading, spacing: 12) {
                SkeletonBar(width: 72, height: 10)
                SkeletonBar(height: 26)
                SkeletonBar(height: 26)
                SkeletonBar(width: 200, height: 26)
                SkeletonBar(width: 56, height: 10)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.vertical, 40)
            .background(Color(hex: "d4d4d4").opacity(0.5))

            // Three supporting card skeletons
            VStack(spacing: 0) {
                ForEach(0..<3, id: \.self) { i in
                    VStack(alignment: .leading, spacing: 10) {
                        SkeletonBar(width: 68, height: 10)
                        SkeletonBar(height: 20)
                        SkeletonBar(width: 220, height: 20)
                        SkeletonBar(width: 56, height: 10)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 24)
                    if i < 2 {
                        Rectangle().fill(VP.rule).frame(height: 1).padding(.horizontal, 20)
                    }
                }
            }
            .padding(.top, 40)
        }
        .accessibilityLabel("Loading today’s front page")
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 12) {
            Text(message)
                .font(.system(size: VP.Size.base, weight: .regular, design: .serif))
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
            Button {
                refreshTask?.cancel()
                refreshTask = Task { await loadData() }
            } label: {
                Text("Try again")
                    .font(.system(size: VP.Size.base, weight: .medium))
                    .foregroundColor(VP.accent)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 64)
        .padding(.horizontal, 20)
    }

    // MARK: - Breaking strip

    @ViewBuilder
    private func breakingStrip(for story: Story) -> some View {
        let raw = story.title ?? "Breaking news"
        let truncated = raw.count > 80 ? String(raw.prefix(80)) + "…" : raw

        HStack(spacing: 10) {
            Text("BREAKING")
                .font(.system(size: VP.Size.xs, weight: .heavy))
                .tracking(1.4)
                .foregroundColor(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(
                    RoundedRectangle(cornerRadius: 3).fill(Color.black.opacity(0.22))
                )

            Text(truncated)
                .font(.system(size: VP.Size.sm, weight: .medium))
                .foregroundColor(.white)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)

            if canViewBreakingBannerPaid {
                Text(timeShort(story.publishedAt))
                    .font(.system(size: VP.Size.xs))
                    .foregroundColor(.white.opacity(0.85))
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 8)
        .background(VP.breaking)
    }

    // MARK: - Data

    private struct TopStoryRow: Decodable {
        let position: Int
        let articles: Story?
    }

    private func loadData() async {
        loading = true
        loadError = nil
        today = HomeView.computeToday()
        await SettingsService.shared.loadIfNeeded()
        if Task.isCancelled { loading = false; return }

        do {
            let todayStartIso = HomeView.loadDataISOFmt.string(from: today.startUtc)

            async let storiesReq: [Story] = client.from("articles")
                .select("*, ad_eligible, sensitivity_tags, stories(slug)")
                .eq("status", value: "published")
                .eq("browse_only", value: false)
                .order("published_at", ascending: false)
                .limit(12)
                .execute()
                .value

            // Dedicated breaking query — runs independently of the top-of-feed
            // so a breaking story always surfaces above the masthead.
            async let breakingReq: [Story] = client.from("articles")
                .select("*, ad_eligible, sensitivity_tags, stories(slug)")
                .eq("status", value: "published")
                .eq("is_breaking", value: true)
                .eq("browse_only", value: false)
                .order("published_at", ascending: false)
                .limit(1)
                .execute()
                .value

            async let catsReq: [VPCategory] = client.from("categories")
                .select()
                .order("sort_order")
                .execute()
                .value

            async let topStoriesReq: [TopStoryRow] = client.from("top_stories")
                .select("position, articles!inner(id, title, story_id, published_at, excerpt, cover_image_url, category_id, is_breaking, is_developing, ad_eligible, sensitivity_tags, stories(slug))")
                .order("position")
                .execute()
                .value

            let rawAll = try await storiesReq
            let breakingFirstAll = try await breakingReq.first
            let cats = try await catsReq
            let topRowsAll = (try? await topStoriesReq) ?? []

            // Wave 2.5c — editorial gate. HomeAdSlot placements (home_top /
            // home_in_feed_1 / home_in_feed_2 / home_below_fold) don't pass
            // article_id, so serve_ad's per-article ad_eligible/sensitivity
            // check can't fire for the home feed. Filter blocked articles
            // out of the feed itself so ads never sit adjacent to a
            // tragedy/obit headline. Mirrors web/src/app/_home/data.ts.
            let raw = rawAll.filter { !HomeView.isHomeBlocked($0) }
            let breakingFirst = breakingFirstAll.flatMap {
                HomeView.isHomeBlocked($0) ? nil : $0
            }
            let topRows = topRowsAll.filter { row in
                guard let a = row.articles else { return true }
                return !HomeView.isHomeBlocked(a)
            }

            // If top_stories has pinned rows, use them in position order.
            // Otherwise fall back to hero_pick_for_date sort on today’s articles.
            let ranked: [Story]
            if topRows.isEmpty {
                ranked = raw.sorted { a, b in
                    let aHero = (a.heroPickForDate == today.isoDate) ? 1 : 0
                    let bHero = (b.heroPickForDate == today.isoDate) ? 1 : 0
                    if aHero != bHero { return aHero > bHero }
                    let aT = a.publishedAt ?? .distantPast
                    let bT = b.publishedAt ?? .distantPast
                    return aT > bT
                }
            } else {
                ranked = topRows.compactMap { $0.articles }
            }

            // T244b — bail before mutating state so a cancelled task can’t
            // overwrite a newer task’s results with a stale payload.
            if Task.isCancelled { return }
            stories = ranked
            breakingStory = breakingFirst
            categories = cats
            // Section E.1 — stamp the last successful load. App-foreground
            // staleness check (HomeFeedRefreshPolicy.postIfStale) keys off
            // this so a failed load can't fake freshness.
            UserDefaults.standard.set(Date(), forKey: HomeFeedRefreshPolicy.lastLoadKey)
        } catch {
            if Task.isCancelled { return }
            Log.d("Home load failed: \(error)")
            loadError = "We couldn’t reach Verity Post. Check your connection."
        }
        if Task.isCancelled { return }
        loading = false
    }

    // MARK: - Registration wall

    private var registrationWallOverlay: some View {
        ZStack {
            Color.black.opacity(0.5).ignoresSafeArea()
            VStack(spacing: 16) {
                Text("Create a free account")
                    .font(.system(.title3, design: .default, weight: .bold))
                    .foregroundColor(VP.text)
                Text("You’ve read your free articles. Sign up to continue reading.")
                    .font(.subheadline)
                    .foregroundColor(VP.dim)
                    .multilineTextAlignment(.center)
                NavigationLink {
                    SignupView().environmentObject(auth)
                } label: {
                    Text("Create free account")
                        .font(.system(.subheadline, design: .default, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(RoundedRectangle(cornerRadius: VP.radiusMD).fill(VP.accent))
                }
                Button("Maybe Later") {
                    showRegistrationWall = false
                }
                .font(.footnote)
                .foregroundColor(VP.dim)
                .frame(minHeight: 44)
            }
            .padding(28)
            .background(RoundedRectangle(cornerRadius: VP.radiusLG).fill(VP.bg))
            .padding(.horizontal, 32)
            .shadow(radius: 10)
        }
    }

    private func trackArticleView(articleId: String) {
        let ss = SettingsService.shared
        guard ss.isEnabled("registration_wall") else { return }
        guard !auth.isLoggedIn else { return }

        // A16 — namespace the counter by user-id so an account switch /
        // sign-out doesn't inherit the prior viewer's free-article tally.
        // Anon viewers share the `_anon` slot; signing in flips the gate
        // off via the early return above, and signing out and signing in
        // as a different free user gets a fresh tally instead of being
        // walled out instantly.
        let scope = auth.currentUser?.id ?? "_anon"
        let seenKey = "vp_articles_viewed_ids_\(scope)"
        var seen = Set(UserDefaults.standard.stringArray(forKey: seenKey) ?? [])
        if seen.contains(articleId) { return }
        seen.insert(articleId)
        UserDefaults.standard.set(Array(seen), forKey: seenKey)

        let countKey = "vp_articles_viewed_\(scope)"
        let viewed = seen.count
        UserDefaults.standard.set(viewed, forKey: countKey)

        let limit = ss.getNumber("free_article_limit", default: 3)
        if viewed >= limit {
            showRegistrationWall = true
        }
    }

    // MARK: - Helpers

    private func categoryName(for id: String?) -> String? {
        guard let id else { return nil }
        return categories.first(where: { $0.id == id })?.displayName
    }

    private func timeShort(_ date: Date?) -> String {
        guard let date else { return "" }
        let mins = Int(Date().timeIntervalSince(date) / 60)
        if mins < 1 { return "just now" }
        if mins < 60 { return "\(mins)m ago" }
        let hours = mins / 60
        if hours < 24 { return "\(hours)h ago" }
        return HomeView.timeShortFmt.string(from: date)
    }

    // VoiceOver: read the headline first, then context. Order chosen to
    // mimic a reader scanning the page — headline carries the meaning;
    // category + freshness are framing. Excerpt deliberately omitted —
    // it's the body preview a user activates the link to read, and
    // dragging it into the label creates VO fatigue on a 12-card feed.
    private func heroAccessibilityLabel(for story: Story) -> String {
        var parts: [String] = []
        if story.isBreaking == true { parts.append("Breaking") }
        else if story.isDeveloping == true { parts.append("Developing") }
        parts.append(story.title ?? "Untitled")
        if let cat = categoryName(for: story.categoryId) { parts.append(cat) }
        let t = timeShort(story.publishedAt)
        if !t.isEmpty { parts.append(t) }
        return parts.joined(separator: ". ")
    }

    private func supportingAccessibilityLabel(for story: Story, isNew: Bool) -> String {
        var parts: [String] = []
        if isNew { parts.append("New") }
        if story.isBreaking == true { parts.append("Breaking") }
        else if story.isDeveloping == true { parts.append("Developing") }
        parts.append(story.title ?? "Untitled")
        if let cat = categoryName(for: story.categoryId) { parts.append(cat) }
        let t = timeShort(story.publishedAt)
        if !t.isEmpty { parts.append(t) }
        return parts.joined(separator: ". ")
    }
}

// Q-NEW3 (2026-05-12) — viewport-width measurement for the grid-mode
// threshold. Reads ScrollView area width (== viewport width on iOS).
private struct HomeViewportWidthKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}
