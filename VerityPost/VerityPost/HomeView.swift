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
    // Wave 5 — home_layouts data path. Populated on compact width when
    // the live layout query succeeds; legacy `stories` array is still
    // populated as a fallback so the iPhone home never goes blank if
    // the layout query fails or returns no live layout.
    @State private var liveLayout: HomeLayoutRow? = nil
    // Per-slot list-rail rows. Keyed by slot.id since the same source
    // can appear in multiple slots with different `days` configs.
    @State private var listRailRows: [String: [HomeListRow]] = [:]
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
    // Compact-width inline masthead (mirrors web mobile vp-rh-masthead).
    // State lives here so loadData() can read it; HomeMasthead binds in.
    // Regular width (iPad) keeps the legacy `topBar` + modal sheet path
    // untouched per owner ask 2026-05-17.
    @State private var homeFilter = HomeFilter()
    // Anon "Sign in" pill in the inline masthead pushes the signup view.
    // Wrapped in a NavigationLink hidden trigger so we can fire from a
    // button action inside HomeMasthead without restructuring auth flow.
    @State private var showSignupPush = false
    // Inline masthead search pill pushes FindView. Owner ask 2026-05-17:
    // search is being reworked separately, so route through FindView for
    // now rather than over-investing on an inline dropdown.
    @State private var showFindPush = false
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
                // Compact (iPhone): inline masthead mirrors web mobile.
                // Regular (iPad): keep legacy `topBar` + modal sheet path
                // untouched — owner explicitly deferred iPad in this pass.
                if hSize == .compact {
                    HomeMasthead(
                        categories: categories,
                        filter: $homeFilter,
                        vpTheme: $vpTheme,
                        onTapSearch: { showFindPush = true },
                        onSignIn: { showSignupPush = true },
                        onSignOut: { Task { await auth.logout() } }
                    )
                    .environmentObject(auth)
                } else {
                    topBar
                }
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
                        } else if hSize == .compact, let layout = liveLayout {
                            // Wave 5 — layout-driven feed. iPhone walks
                            // home_slots in position order (span ignored
                            // per web mobile, which merges main/rail
                            // columns into one feed). iPad keeps the
                            // legacy `stories` path below.
                            layoutFeed(layout)
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
                    // Wave 5 — list-rail rows carry just (article_id,
                    // slug, title). Resolve the slug to a full Story on
                    // push so StoryDetailView's id-keyed fetches (.task,
                    // sources, timeline) have what they need.
                    .navigationDestination(for: HomeStorySlugLink.self) { link in
                        HomeListRailDestination(link: link)
                            .environmentObject(auth)
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

            // Hidden push triggers for the inline masthead. Wrapping these
            // as zero-frame NavigationLinks (vs a NavigationDestination
            // bound to a Bool item) keeps the navigation type-safe and
            // reuses the same NavigationStack that hosts NavigationLink<Story>.
            NavigationLink(isActive: $showFindPush) {
                FindView().environmentObject(auth)
            } label: { EmptyView() }
            .frame(width: 0, height: 0)
            .opacity(0)
            .accessibilityHidden(true)

            NavigationLink(isActive: $showSignupPush) {
                SignupView().environmentObject(auth)
            } label: { EmptyView() }
            .frame(width: 0, height: 0)
            .opacity(0)
            .accessibilityHidden(true)
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
        .task(id: homeFilter) {
            // Reload the feed when the inline masthead filter changes.
            // First render is handled by the unconditional `.task` above;
            // this branch skips the redundant first fire by short-circuiting
            // when nothing meaningful has been requested yet (categories
            // not loaded → topic slug can't resolve anyway).
            guard !categories.isEmpty else { return }
            refreshTask?.cancel()
            refreshTask = Task { await loadData() }
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

    // Size-class-gated hero. Compact (iPhone) renders the cream-on-cream
    // typographic hero card that matches the web mobile vp-rh-story-card
    // --hero (serif title, mono meta strip, no category-tinted banner).
    // Regular (iPad) keeps the legacy colored-banner path untouched per
    // owner ask 2026-05-17.
    @ViewBuilder
    private func heroBlock(_ story: Story) -> some View {
        if hSize == .compact {
            heroBlockCompact(story)
        } else {
            heroBlockLegacyBanner(story)
        }
    }

    // iPhone hero — mirrors web/src/app/_home/slots/StoryCard.tsx hero
    // variant (no category-tinted banner; cream-on-cream card; serif
    // title; mono meta strip with auto-ticking "Last changed Xm ago").
    // The 2-column timeline grid web uses at >=900px is intentionally
    // omitted here per the mobile media query `display:none` in
    // styles.tsx, and matches owner's "iPhone only in this pass" scope.
    @ViewBuilder
    private func heroBlockCompact(_ story: Story) -> some View {
        NavigationLink(value: story) {
            VStack(alignment: .leading, spacing: 0) {
                if let cat = categoryName(for: story.categoryId) {
                    // Kicker — mono caps in burgundy. 10pt, 0.1em tracking,
                    // semibold. Subcategory not modeled on iOS Story yet;
                    // category-only is the current parity baseline.
                    Text(cat.uppercased())
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .tracking(1.0)
                        .foregroundColor(VP.burgundy)
                        .padding(.bottom, 14)
                }
                // Title — system serif at the redesigned hero size (~32pt
                // on compact, scaling via @ScaledMetric `heroTitleSize`).
                // Regular weight + tight tracking + tight line-height
                // match the web `font-weight: 400` / `line-height: 1.05`
                // / `letter-spacing: -0.02em`.
                Text(story.title ?? "Untitled")
                    .font(.system(size: heroTitleSize, weight: .regular, design: .serif))
                    .tracking(-0.6)
                    .lineSpacing(0)
                    .foregroundColor(VP.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let excerpt = story.excerpt, !excerpt.isEmpty {
                    // Dek — system 16pt regular on muted ink. Capped at
                    // ~62ch via container max-width; line-spacing tuned
                    // to match web's 1.5 line-height.
                    Text(excerpt)
                        .font(.system(size: 16, weight: .regular))
                        .lineSpacing(6)
                        .foregroundColor(VP.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 14)
                }
                // Meta strip — auto-ticks every 30s like web's
                // RelativeTime component so "1m ago" → "2m ago" without
                // a manual refresh. TimelineView wakes the closure on
                // every tick and recomputes the bucketed label.
                if let pub = story.publishedAt {
                    TimelineView(.periodic(from: .now, by: 30)) { ctx in
                        Text("Last changed \(Self.relativeTimeBucket(pub, now: ctx.date))")
                            .font(.system(size: 11, weight: .regular, design: .monospaced))
                            .tracking(0.66)
                            .foregroundColor(VP.textSoft)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.top, 18)
                }
            }
            // 28pt internal padding matches web hero `.vp-rh-story-card
            // --hero .vp-rh-story-card__link { padding: 28px }` on
            // mobile. 28pt corner radius + 1pt VP.border + .vpShadowLg
            // match the cluster chrome (white→ivory gradient dropped
            // on mobile per `@media (max-width: 899px) { background:
            // transparent }`; we use the plain VP.surface raised tone
            // so the card sits on the cream canvas just like web).
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(28)
            .background(
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .fill(VP.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .strokeBorder(VP.border, lineWidth: 1)
            )
            .vpShadowLg()
            .padding(.horizontal, 20)
            // Whole-card tap target: the NavigationLink wraps the entire
            // VStack + chrome, so the hit-area covers padding + shadow.
            .contentShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(heroAccessibilityLabel(for: story))
            .accessibilityAddTraits(.isLink)
        }
        .buttonStyle(.plain)
    }

    // Legacy iPad hero — category-tinted dark banner, full-bleed. Left
    // untouched 2026-05-18 hero-parity step. Do NOT inline the compact
    // hero's chrome here; iPad parity is a separate session.
    @ViewBuilder
    private func heroBlockLegacyBanner(_ story: Story) -> some View {
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
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(heroAccessibilityLabel(for: story))
            .accessibilityAddTraits(.isLink)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Layout-driven feed (Wave 5 — home_layouts data path)
    //
    // Walks home_slots in position order, ignores span (web mobile
    // merges main + rail columns into one feed). Each slot dispatches
    // by kind. Unimplemented kinds collapse to nothing — no placeholder
    // — so the feed never shows "missing surface" stubs.
    @ViewBuilder
    private func layoutFeed(_ layout: HomeLayoutRow) -> some View {
        let slots = (layout.home_slots ?? []).sorted { $0.position < $1.position }
        VStack(spacing: 0) {
            ForEach(Array(slots.enumerated()), id: \.element.id) { idx, slot in
                renderSlot(slot)
                // One ad break after every 6 slots so the layout-driven
                // feed isn't ad-free vs the legacy path. Wave 6a AdMob
                // mount happens through HomeAdSlot.
                if idx == 3 {
                    HomeAdSlot(placement: iosHomePlacement(.inFeed1, authed: auth.isLoggedIn), page: "home")
                        .padding(.top, 16)
                } else if idx == 9 {
                    HomeAdSlot(placement: iosHomePlacement(.inFeed2, authed: auth.isLoggedIn), page: "home")
                        .padding(.top, 16)
                }
            }
            HomeAdSlot(placement: iosHomePlacement(.belowFold, authed: auth.isLoggedIn), page: "home")
                .padding(.top, 16)
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
            .padding(.top, 24)
        }
        .padding(.top, 8)
    }

    // Slot-kind dispatcher. Returns EmptyView for kinds without an iOS
    // renderer; future waves can fill those in without touching the
    // data path.
    @ViewBuilder
    private func renderSlot(_ slot: HomeSlotRow) -> some View {
        switch slot.kind {
        case "story_card":
            if slot.variant == "hero" {
                if let firstStory = (slot.home_slot_items ?? [])
                    .sorted(by: { $0.position < $1.position })
                    .compactMap({ $0.articles })
                    .first {
                    heroBlockCompact(firstStory)
                        .padding(.top, 14)
                }
            } else {
                if let firstStory = (slot.home_slot_items ?? [])
                    .sorted(by: { $0.position < $1.position })
                    .compactMap({ $0.articles })
                    .first {
                    NavigationLink(value: firstStory) {
                        supportingCard(firstStory)
                            .padding(.horizontal, 20)
                    }
                    .buttonStyle(.plain)
                    hairline.padding(.horizontal, 20)
                }
            }
        case "square_row":
            HomeSquareRowView(slot: slot, categories: categories)
        case "rail_card":
            if slot.variant == "list", let source = slot.sourceKey {
                let label = HomeListRailSource.label(
                    forSource: source,
                    cfgLabel: slot.config?["label"]?.stringValue
                )
                if let rows = listRailRows[slot.id], !rows.isEmpty {
                    HomeRailListView(label: label, rows: rows)
                } else {
                    // No rows resolved yet (or source returned empty).
                    // Match web's behavior — show the label + skeleton
                    // hint instead of collapsing, so the slot reads as
                    // "loading" not "broken."
                    HomeRailListView(label: label, rows: [])
                }
            } else {
                HomeRailCardView(slot: slot, categories: categories)
            }
        default:
            // top_banner, list_rail, data_ticker, insight_row,
            // discovery_feed, engagement, promo, cluster, lead,
            // second_lead, breaking_strip, secondary_pair, wide_strip,
            // editors_picks — no iOS renderer in this wave.
            EmptyView()
        }
    }

    // Bucketed relative time — mirrors web `relativeTimeBucket` in
    // web/src/app/_home/_shared.ts. Ramp: Xs / Xm / Xh / Xd / Xw / Xmo
    // / Xy. Identical thresholds (60s, 60m, 24h, 7d, 30d, 12mo) so an
    // article that shows "5m ago" on iPhone matches web to the same
    // bucket. `now` is parameterized so TimelineView's `ctx.date` can
    // drive recomputation every 30s instead of stale-on-render.
    //
    // Internal (not `fileprivate`) so StoryDetailView's article header
    // can share the exact same bucket — owner memory rule: don't fork a
    // second bucketer.
    static func relativeTimeBucket(_ date: Date, now: Date = Date()) -> String {
        let secs = max(0, Int(now.timeIntervalSince(date)))
        if secs < 60 { return "\(secs)s ago" }
        let mins = secs / 60
        if mins < 60 { return "\(mins)m ago" }
        let hrs = mins / 60
        if hrs < 24 { return "\(hrs)h ago" }
        let days = hrs / 24
        if days < 7 { return "\(days)d ago" }
        if days < 30 { return "\(days / 7)w ago" }
        let months = days / 30
        if months < 12 { return "\(months)mo ago" }
        return "\(months / 12)y ago"
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

            // Filter-aware base query. The inline masthead (compact width)
            // writes into `homeFilter`; regular width never mutates it so
            // this collapses to the legacy unfiltered query on iPad.
            // Subcategory rollup mirrors web HomeRoot.tsx: when the active
            // topic is a parent, the feed includes articles in any of its
            // child subcategories (e.g. /politics surfaces Congress +
            // Elections + White House, not just bare-parent pins).
            var q = client.from("articles")
                .select("*, ad_eligible, sensitivity_tags, stories(slug)")
                .eq("status", value: "published")
                .eq("browse_only", value: false)

            // Topic filter — match web's subcategory rollup. parent → any
            // of {parentId, childIds}; sub → exact match.
            if let topicSlug = homeFilter.topicSlug,
               let cat = categories.first(where: { $0.slug == topicSlug }) {
                if cat.categoryId == nil {
                    // Parent: roll up into any of its child cats too.
                    let childIds = categories
                        .filter { $0.categoryId == cat.id }
                        .map { $0.id }
                    let pool = [cat.id] + childIds
                    if pool.count == 1 {
                        q = q.eq("category_id", value: cat.id)
                    } else {
                        q = q.in("category_id", values: pool)
                    }
                } else {
                    // Subcategory: exact subcategory_id match. The article
                    // schema carries both category_id (parent) and
                    // subcategory_id, so narrow on the sub.
                    q = q.eq("subcategory_id", value: cat.id)
                }
            }

            // VIEW dimension — controls extra filter predicates AND/OR
            // sort overrides. Mirrors web HomeRoot.tsx filter block.
            switch homeFilter.view {
            case .new:
                // `new_24h` lens: published_at >= now - 24h. Takes
                // precedence over the TIME axis (web does the same — chip
                // is the time-window source of truth for this lens).
                let dayAgo = Date().addingTimeInterval(-24 * 3600)
                q = q.gte("published_at", value: HomeView.loadDataISOFmt.string(from: dayAgo))
            case .noDiscussion:
                // No-discussion lens: zero comments. Web uses
                // .or('comment_count.is.null,comment_count.eq.0').
                q = q.or("comment_count.is.null,comment_count.eq.0")
            case .openQuestions:
                // Open Questions: articles with at least one visible
                // `intent='question'` comment. Pre-query article_ids and
                // .in() into the main feed; same shape as web's
                // most_recent_comments pre-query.
                struct QArticleId: Decodable { let article_id: String? }
                let qRows: [QArticleId] = (try? await client.from("comments")
                    .select("article_id")
                    .eq("intent", value: "question")
                    .eq("status", value: "visible")
                    .is("deleted_at", value: nil)
                    .not("article_id", operator: .is, value: "null")
                    .order("created_at", ascending: false)
                    .limit(500)
                    .execute()
                    .value) ?? []
                var seen = Set<String>()
                let ids = qRows.compactMap { row -> String? in
                    guard let aid = row.article_id, !seen.contains(aid) else { return nil }
                    seen.insert(aid)
                    return aid
                }
                if ids.isEmpty {
                    // Match web's empty-feed sentinel.
                    q = q.in("id", values: ["00000000-0000-0000-0000-000000000000"])
                } else {
                    q = q.in("id", values: ids)
                }
            default:
                break
            }

            // TIME dimension — applies AFTER the view-side filters so
            // a Date Range can stack with No Discussion / Most Viewed /
            // etc. The `.new` view sets its own 24h window and ignores
            // the TIME axis (web behavior).
            if homeFilter.view != .new {
                switch homeFilter.time {
                case .today:
                    q = q.gte("published_at", value: todayStartIso)
                case .thisWeek:
                    var cal = Calendar(identifier: .gregorian)
                    cal.timeZone = HomeView.editorialTimeZone
                    // ISO week starts Monday; Calendar.firstWeekday is
                    // locale-driven, so force the start to whatever the
                    // platform considers week-start. Web uses now-7d
                    // rolling; we use calendar-week-start to honor the
                    // owner-locked spec ("This Week = start of this week").
                    let now = Date()
                    let comps = cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: now)
                    if let weekStart = cal.date(from: comps) {
                        q = q.gte("published_at", value: HomeView.loadDataISOFmt.string(from: weekStart))
                    }
                case .thisMonth:
                    var cal = Calendar(identifier: .gregorian)
                    cal.timeZone = HomeView.editorialTimeZone
                    let now = Date()
                    let comps = cal.dateComponents([.year, .month], from: now)
                    if let monthStart = cal.date(from: comps) {
                        q = q.gte("published_at", value: HomeView.loadDataISOFmt.string(from: monthStart))
                    }
                case .dateRange:
                    if let from = homeFilter.dateFrom {
                        q = q.gte("published_at", value: HomeView.loadDataISOFmt.string(from: from))
                    }
                    if let to = homeFilter.dateTo {
                        // Inclusive upper bound — push to end-of-day so
                        // an article published at 23:30 on `to` lands.
                        let endOfDay = Calendar.current.date(bySettingHour: 23, minute: 59, second: 59, of: to) ?? to
                        q = q.lte("published_at", value: HomeView.loadDataISOFmt.string(from: endOfDay))
                    }
                }
            }

            // Sort branch — VIEW selects the order column. Mirrors web's
            // sort ladder: most_discussed → comment_count desc nullsLast,
            // most_viewed → view_count desc nullsLast, newest →
            // published_at desc, updated_timelines → updated_at desc,
            // everything else → updated_at desc (default home order).
            let storiesReq: [Story]
            switch homeFilter.view {
            case .mostViewed:
                storiesReq = try await q
                    .order("view_count", ascending: false)
                    .limit(12)
                    .execute()
                    .value
            case .mostCommented:
                storiesReq = try await q
                    .order("comment_count", ascending: false)
                    .limit(12)
                    .execute()
                    .value
            case .newest:
                storiesReq = try await q
                    .order("published_at", ascending: false)
                    .limit(12)
                    .execute()
                    .value
            case .updatedTimelines:
                storiesReq = try await q
                    .order("updated_at", ascending: false)
                    .limit(12)
                    .execute()
                    .value
            case .top, .new, .noDiscussion, .openQuestions:
                // Default order — published_at desc. Top Stories keeps
                // the legacy hero-pick ranking below when isAll holds.
                storiesReq = try await q
                    .order("published_at", ascending: false)
                    .limit(12)
                    .execute()
                    .value
            }

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

            let rawAll = storiesReq
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

            // If top_stories has pinned rows, use them in position order
            // — but only when the masthead filter is in its default "All"
            // state. The moment a topic/chip/sort is active, the pinned
            // homepage row no longer represents the reader's request, so
            // the filtered server result wins.
            let ranked: [Story]
            if topRows.isEmpty || !homeFilter.isAll {
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

            // Wave 5 — try the home_layouts data path on compact width.
            // The legacy `stories` array above is the unconditional
            // fallback; if the layout query fails OR returns no live
            // layout, the iPhone home renders via the legacy path so
            // it never goes blank. The default filter ("All") is the
            // only state where the editor's layout is the right shape;
            // a topic/sort filter falls back to the legacy filtered
            // feed because home_slot_items pins are editorial choices
            // for All, not for an arbitrary topic slice.
            if hSize == .compact && homeFilter.isAll {
                await loadLiveLayout()
            } else {
                liveLayout = nil
                listRailRows = [:]
            }
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

    // MARK: - Live layout (Wave 5)
    //
    // Mirror of web/src/app/_home/data.ts `fetchLiveLayout`. Queries
    // home_layouts where status='live' with a single nested PostgREST
    // select that drags down home_slots + home_slot_items + the joined
    // articles row. Failure paths (no live layout / network error /
    // decode error) leave `liveLayout` nil so the dispatcher in `body`
    // falls back to the legacy `stories` array — same fail-open
    // posture as web.
    private func loadLiveLayout() async {
        let articleSelect = "id, title, story_id, published_at, excerpt, cover_image_url, category_id, is_breaking, is_developing, ad_eligible, sensitivity_tags, stories(slug)"
        let layoutSelect = """
        id, slug, name, status, ads_enabled,
        home_slots (
          id, key, kind, span, position, config,
          home_slot_items (
            id, position, content_type, ref_id, article_id, payload,
            articles!fk_home_slot_items_article_id (\(articleSelect))
          )
        )
        """
        do {
            let layouts: [HomeLayoutRow] = try await client.from("home_layouts")
                .select(layoutSelect)
                .eq("status", value: "live")
                .order("updated_at", ascending: false)
                .limit(1)
                .execute()
                .value
            guard let layout = layouts.first else {
                await MainActor.run {
                    liveLayout = nil
                    listRailRows = [:]
                }
                return
            }

            // Fetch list-rail rows in parallel — each list-variant
            // rail_card needs its own source-specific query. Web does
            // this server-side per card; on iOS we hoist all of them
            // into one TaskGroup so the feed doesn't fan out N HTTP
            // round-trips serially on render.
            let listSlots = (layout.home_slots ?? []).filter {
                $0.kind == "rail_card" &&
                $0.variant == "list" &&
                ($0.sourceKey).map { HomeListRailSource.defaultLabel[$0] != nil } ?? false
            }
            var rows: [String: [HomeListRow]] = [:]
            if !listSlots.isEmpty {
                await withTaskGroup(of: (String, [HomeListRow]).self) { group in
                    for slot in listSlots {
                        guard let source = slot.sourceKey else { continue }
                        let days = slot.configDays
                        group.addTask {
                            let r = await HomeListRailFetcher.fetch(
                                source: source,
                                cfgDays: days
                            )
                            return (slot.id, r)
                        }
                    }
                    for await (slotId, slotRows) in group {
                        rows[slotId] = slotRows
                    }
                }
            }

            if Task.isCancelled { return }
            await MainActor.run {
                liveLayout = layout
                listRailRows = rows
            }
        } catch {
            Log.d("[HomeView.loadLiveLayout] failed: \(error)")
            await MainActor.run {
                liveLayout = nil
                listRailRows = [:]
            }
        }
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
