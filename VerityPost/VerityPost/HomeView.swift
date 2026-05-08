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
//   - HomeRecapCard inline (recap stays at /recap; not on home)
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

    // Category accent palette — mirrors web/src/app/page.tsx CATEGORY_PALETTE.
    // color_hex in DB is null for all live rows (2026-04-26); slug-based fallback
    // until editorial populates the column.
    private static let categoryPalette: [String: Color] = [
        "politics":          Color(hex: "1e3a5f"),
        "congress":          Color(hex: "1e3a5f"),
        "space":             Color(hex: "1a1a2e"),
        "science":           Color(hex: "0f3d2e"),
        "ai":                Color(hex: "1a1a2e"),
        "markets":           Color(hex: "1b2a1b"),
        "personal-finance":  Color(hex: "1b2a1b"),
        "jobs":              Color(hex: "1b2a1b"),
        "weather":           Color(hex: "1a3050"),
        "public-health":     Color(hex: "3d1a1a"),
        "nfl":               Color(hex: "1a2a3d"),
        "movies":            Color(hex: "2a1a2a"),
        "asia":              Color(hex: "2a1a1a"),
        "animals":           Color(hex: "1a2a1a"),
        "kids-science":      Color(hex: "0f3d2e"),
        "kids-animals":      Color(hex: "1a2a1a"),
    ]

    private func heroBg(for story: Story) -> Color {
        if let cat = categories.first(where: { $0.id == story.categoryId }) {
            if let hex = cat.colorHex, !hex.isEmpty { return Color(hex: hex) }
            if let slug = cat.slug, let c = HomeView.categoryPalette[slug] { return c }
        }
        return Color(hex: "1a1a1a")
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
                                // Ads — wired 2026-05-08. Same positions as the
                                // web feed: home_top after hero; home_in_feed_1
                                // / _2 between cards; home_below_fold below the
                                // last card. Slot self-hides on no-fill.
                                HomeAdSlot(placement: "home_top", page: "home")
                            }

                            let supporting = Array(stories.dropFirst())
                            if !supporting.isEmpty {
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
                                            HomeAdSlot(placement: "home_in_feed_1", page: "home")
                                                .padding(.top, 24)
                                        }
                                        if idx == 7 {
                                            HomeAdSlot(placement: "home_in_feed_2", page: "home")
                                                .padding(.top, 24)
                                        }
                                    }
                                }
                                .padding(.top, 40)
                                HomeAdSlot(placement: "home_below_fold", page: "home")
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
                if story.isBreaking == true {
                    Text("Breaking")
                        .font(.system(.caption2, design: .default, weight: .semibold))
                        .tracking(0.8)
                        .textCase(.uppercase)
                        .foregroundColor(.white.opacity(0.9))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 3).fill(Color.black.opacity(0.25)))
                        .padding(.bottom, 8)
                } else if story.isDeveloping == true {
                    Text("Developing")
                        .font(.system(.caption2, design: .default, weight: .semibold))
                        .tracking(0.8)
                        .textCase(.uppercase)
                        .foregroundColor(VP.warn)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 3).fill(Color.black.opacity(0.25)))
                        .padding(.bottom, 8)
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
                Text(timeShort(story.publishedAt))
                    .font(.system(.footnote, design: .default, weight: .medium))
                    .foregroundColor(.white.opacity(0.55))
                    .padding(.top, 10)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.vertical, 40)
            .background(bg.ignoresSafeArea(edges: .horizontal))
        }
        .buttonStyle(.plain)
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
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
            }

            metaLine(for: story)
                .padding(.top, 10)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 24)
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
                .select("*, stories(slug)")
                .eq("status", value: "published")
                .eq("browse_only", value: false)
                .order("published_at", ascending: false)
                .limit(12)
                .execute()
                .value

            // Dedicated breaking query — runs independently of the top-of-feed
            // so a breaking story always surfaces above the masthead.
            async let breakingReq: [Story] = client.from("articles")
                .select("*, stories(slug)")
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
                .select("position, articles!inner(id, title, story_id, published_at, excerpt, cover_image_url, category_id, is_breaking, is_developing, stories(slug))")
                .order("position")
                .execute()
                .value

            let raw = try await storiesReq
            let breakingFirst = try await breakingReq.first
            let cats = try await catsReq
            let topRows = (try? await topStoriesReq) ?? []

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
}

// MARK: - Browse landing (destination for "Browse all categories")
//
// Per-category card with a 7-day article count + 1-2 most-recent previews,
// mirroring web /sections. Tapping a preview pushes StoryDetailView; tapping
// the category header (or its chevron) pushes the full CategoryDetailView.
//
// Fetch shape: one categories query for the list, then a parallel fan-out
// — one count + one limit-2 preview per category. Category count is small
// (~15-20), so 2N fanout against PostgREST is acceptable and keeps each
// query cleanly scoped to a single index.
struct BrowseLanding: View {
    @EnvironmentObject var auth: AuthViewModel

    private struct ActiveStoryRow: Decodable {
        let categoryId: String
        let storyId: String
        enum CodingKeys: String, CodingKey {
            case categoryId = "category_id"
            case storyId = "story_id"
        }
    }

    @ScaledMetric(relativeTo: .largeTitle) private var screenTitleSize: CGFloat = 32

    @State private var categories: [VPCategory] = []
    @State private var loading = true
    @State private var loadError: String?
    @State private var activeStoryCounts: [String: Int] = [:]
    @State private var searchText = ""
    private let client = SupabaseManager.shared.client

    private var filteredCategories: [VPCategory] {
        if searchText.isEmpty { return categories }
        return categories.filter { $0.displayName.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Browse")
                    .font(.system(size: screenTitleSize, weight: .bold, design: .serif))
                    .tracking(-0.4)
                    .foregroundColor(VP.text)
                    .padding(.top, 24)
                    .padding(.bottom, 16)

                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: VP.Size.base, weight: .medium))
                        .foregroundColor(VP.muted)
                    TextField("Search stories, topics, timelines…", text: $searchText)
                        .font(.system(size: VP.Size.base, design: .serif))
                        .foregroundColor(VP.text)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: VP.radiusSM)
                        .fill(VP.bg)
                        .overlay(
                            RoundedRectangle(cornerRadius: VP.radiusSM)
                                .stroke(VP.rule, lineWidth: 1)
                        )
                )
                .padding(.bottom, 20)

                if loading {
                    VStack(spacing: 0) {
                        ForEach(0..<5, id: \.self) { _ in
                            HStack {
                                VStack(alignment: .leading, spacing: 8) {
                                    SkeletonBar(width: 140, height: 16)
                                    SkeletonBar(width: 80, height: 11)
                                }
                                Spacer()
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 14)
                            Rectangle().fill(VP.rule).frame(height: 1).padding(.vertical, 4)
                        }
                    }
                    .accessibilityLabel("Loading categories")
                } else if let err = loadError {
                    VStack(spacing: 12) {
                        Text(err)
                            .font(.system(size: VP.Size.base, design: .serif))
                            .italic()
                            .foregroundColor(VP.dim)
                            .multilineTextAlignment(.center)
                        Button("Try again") { Task { await load() } }
                            .font(.system(size: VP.Size.base, weight: .medium, design: .serif))
                            .foregroundColor(VP.accent)
                    }
                    .padding(.vertical, 48)
                    .frame(maxWidth: .infinity)
                } else if filteredCategories.isEmpty {
                    Text(searchText.isEmpty ? "No categories available." : "No results.")
                        .font(.system(size: VP.Size.base, design: .serif))
                        .italic()
                        .foregroundColor(VP.dim)
                        .padding(.vertical, 48)
                        .frame(maxWidth: .infinity)
                } else {
                    ForEach(filteredCategories) { cat in
                        categoryBlock(cat)
                        Rectangle()
                            .fill(VP.rule)
                            .frame(height: 1)
                            .padding(.vertical, 4)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 80)
        }
        .background(VP.bg.ignoresSafeArea())
        .navigationTitle("Browse")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: VPCategory.self) { cat in
            CategoryDetailView(category: cat)
        }
        .navigationDestination(for: Story.self) { story in
            StoryDetailView(story: story).environmentObject(auth)
        }
        .task { await load() }
    }

    @ViewBuilder
    private func categoryBlock(_ cat: VPCategory) -> some View {
        NavigationLink(value: cat) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(cat.displayName)
                        .font(.system(size: VP.Size.xl, weight: .semibold, design: .serif))
                        .foregroundColor(VP.text)
                    activityLabel(for: cat)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: VP.Size.base, weight: .semibold))
                    .foregroundColor(VP.dim)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .padding(.vertical, 12)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func activityLabel(for cat: VPCategory) -> some View {
        if let n = activeStoryCounts[cat.id], n > 0 {
            Text(n == 1 ? "1 active story" : "\(n) active stories")
                .font(.system(size: VP.Size.sm, weight: .regular, design: .serif))
                .foregroundColor(VP.dim)
        } else {
            Text("quiet this week")
                .font(.system(size: VP.Size.sm, weight: .regular, design: .serif))
                .foregroundColor(VP.muted)
        }
    }

    private func load() async {
        loadError = nil
        do {
            let cats: [VPCategory] = try await client.from("categories")
                .select()
                .not("slug", operator: .like, value: "kids-%")
                .order("sort_order")
                .execute()
                .value
            categories = cats
            loading = false
            await loadActiveStoryCounts()
        } catch {
            Log.d("Browse load failed: \(error)")
            loading = false
            loadError = "Couldn't load categories. Try again."
        }
    }

    private func loadActiveStoryCounts() async {
        do {
            let rows: [ActiveStoryRow] = try await client
                .from("articles")
                .select("category_id, story_id, stories!inner(lifecycle_status)")
                .eq("status", value: "published")
                .eq("visibility", value: "public")
                .in("stories.lifecycle_status", values: ["breaking", "developing"])
                .not("story_id", operator: .is, value: "null")
                .execute()
                .value
            var seenByCategory: [String: Set<String>] = [:]
            for row in rows {
                seenByCategory[row.categoryId, default: []].insert(row.storyId)
            }
            activeStoryCounts = seenByCategory.mapValues { $0.count }
        } catch {
            Log.d("Browse active story count failed: \(error)")
        }
    }
}

// MARK: - CategoryDetailView

struct CategoryDetailView: View {
    private struct ArticleRow: Decodable {
        let id: String
        let storyId: String?
        let publishedAt: Date?
        let stories: StoryRef?

        struct StoryRef: Decodable {
            let id: String
            let title: String
            let lifecycleStatus: String
            let createdAt: Date?
            enum CodingKeys: String, CodingKey {
                case id, title
                case lifecycleStatus = "lifecycle_status"
                case createdAt = "created_at"
            }
        }

        enum CodingKeys: String, CodingKey {
            case id
            case storyId = "story_id"
            case publishedAt = "published_at"
            case stories
        }
    }

    private struct StoryItem: Identifiable {
        let id: String
        let title: String
        let lifecycleStatus: String
        let createdAt: Date?
        let articleCount: Int
        let mostRecentDate: Date?
    }

    let category: VPCategory

    @State private var storyItems: [StoryItem] = []
    @State private var latestArticle: [String: Story] = [:]
    @State private var loading = true
    @State private var loadFailed = false
    @State private var refreshTask: Task<Void, Never>? = nil
    private let client = SupabaseManager.shared.client

    private static let dateFmt: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "MMM d"
        return f
    }()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text(category.displayName)
                    .font(.system(size: 32, weight: .bold, design: .serif))
                    .tracking(-0.4)
                    .foregroundColor(VP.text)
                    .padding(.top, 24)
                    .padding(.bottom, 16)

                if loading {
                    VStack(spacing: 0) {
                        ForEach(0..<4, id: \.self) { _ in
                            VStack(alignment: .leading, spacing: 8) {
                                SkeletonBar(width: 120, height: 11)
                                SkeletonBar(height: 15)
                                SkeletonBar(width: 200, height: 15)
                                SkeletonBar(width: 80, height: 11)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 14)
                            Rectangle().fill(VP.rule).frame(height: 1)
                        }
                    }
                    .accessibilityLabel("Loading stories")
                } else if loadFailed {
                    Text("Couldn't load stories. Pull to retry.")
                        .font(.system(size: VP.Size.base, design: .serif))
                        .italic()
                        .foregroundColor(VP.dim)
                        .padding(.vertical, 48)
                        .frame(maxWidth: .infinity)
                } else if storyItems.isEmpty {
                    Text("No active stories in this category.")
                        .font(.system(size: VP.Size.base, design: .serif))
                        .italic()
                        .foregroundColor(VP.dim)
                        .padding(.vertical, 48)
                        .frame(maxWidth: .infinity)
                } else {
                    ForEach(storyItems) { item in
                        if let article = latestArticle[item.id] {
                            NavigationLink(value: article) {
                                storyRow(item)
                            }
                            .buttonStyle(.plain)
                        } else {
                            storyRow(item)
                        }
                        Rectangle().fill(VP.rule).frame(height: 1)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 80)
        }
        .background(VP.bg.ignoresSafeArea())
        .navigationTitle(category.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            refreshTask?.cancel()
            refreshTask = Task { await load() }
            _ = await refreshTask?.value
        }
        .task { await load() }
    }

    @ViewBuilder
    private func storyRow(_ item: StoryItem) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(lifecycleLabel(item.lifecycleStatus))
                    .font(.system(size: VP.Size.xs, weight: .semibold))
                    .tracking(0.8)
                    .foregroundColor(lifecycleColor(item.lifecycleStatus))
                    .textCase(.uppercase)
                Text(item.title)
                    .font(.system(.subheadline, design: .serif, weight: .semibold))
                    .foregroundColor(VP.text)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(scopeText(item))
                .font(.system(size: VP.Size.sm, weight: .regular))
                .foregroundColor(VP.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 14)
    }

    private func scopeText(_ item: StoryItem) -> String {
        let n = item.articleCount
        let days = daysIn(from: item.createdAt)
        let daysLabel = days == 0 ? "started today" : "\(days) \(days == 1 ? "day" : "days") in"
        var parts = ["\(n) \(n == 1 ? "article" : "articles")", daysLabel]
        if let date = item.mostRecentDate {
            parts.append(Self.dateFmt.string(from: date))
        }
        return parts.joined(separator: " · ")
    }

    private func lifecycleLabel(_ status: String) -> String {
        switch status.lowercased() {
        case "breaking": return "Breaking"
        case "developing": return "Developing"
        default: return status
        }
    }

    private func lifecycleColor(_ status: String) -> Color {
        switch status.lowercased() {
        case "breaking": return VP.breaking
        case "developing": return VP.warn
        default: return VP.dim
        }
    }

    private func daysIn(from date: Date?) -> Int {
        guard let date else { return 0 }
        return max(0, Calendar.current.dateComponents([.day], from: date, to: Date()).day ?? 0)
    }

    private func load() async {
        loading = true
        loadFailed = false
        do {
            let articleRows: [ArticleRow] = try await client
                .from("articles")
                .select("id, story_id, published_at, stories(id, title, lifecycle_status, created_at)")
                .eq("category_id", value: category.id)
                .eq("status", value: "published")
                .eq("visibility", value: "public")
                .not("story_id", operator: .is, value: "null")
                .in("stories.lifecycle_status", values: ["breaking", "developing", "resolved"])
                .order("published_at", ascending: false)
                .limit(200)
                .execute()
                .value

            var orderedIds: [String] = []
            var seenIds: Set<String> = []
            var storyRefs: [String: ArticleRow.StoryRef] = [:]
            var articleCounts: [String: Int] = [:]
            var mostRecentDates: [String: Date] = [:]
            var latestArticleIds: [String: String] = [:]

            for row in articleRows {
                guard let sid = row.storyId, let ref = row.stories else { continue }
                if !seenIds.contains(sid) {
                    seenIds.insert(sid)
                    orderedIds.append(sid)
                    storyRefs[sid] = ref
                    mostRecentDates[sid] = row.publishedAt
                    latestArticleIds[sid] = row.id
                }
                articleCounts[sid, default: 0] += 1
            }

            storyItems = orderedIds.compactMap { sid in
                guard let ref = storyRefs[sid] else { return nil }
                return StoryItem(
                    id: sid,
                    title: ref.title,
                    lifecycleStatus: ref.lifecycleStatus,
                    createdAt: ref.createdAt,
                    articleCount: articleCounts[sid] ?? 0,
                    mostRecentDate: mostRecentDates[sid]
                )
            }

            let articleIds = Array(latestArticleIds.values)
            if !articleIds.isEmpty {
                let navArticles: [Story] = try await client
                    .from("articles")
                    .select("id, title, story_id, published_at, excerpt, cover_image_url, category_id, is_breaking, is_developing, stories(slug)")
                    .in("id", values: articleIds)
                    .execute()
                    .value
                var byStory: [String: Story] = [:]
                for article in navArticles {
                    guard let sid = article.storyId else { continue }
                    byStory[sid] = article
                }
                latestArticle = byStory
            }
            loading = false
        } catch {
            Log.d("CategoryDetailView load failed: \(error)")
            loadFailed = true
            loading = false
        }
    }
}

// MARK: - HomeSectionsSheet
//
// Sheet opened from the grid icon in HomeView's top bar. Shows all categories
// with sub-categories nested, plus an inline search. Mirrors the web
// HomeSectionsMenu component. Categories are passed from HomeView so no extra
// fetch is needed — HomeView already loads them on appear.

struct HomeSectionsSheet: View {
    let categories: [VPCategory]
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var searchResults: [Story] = []
    @State private var isSearching = false
    private let client = SupabaseManager.shared.client

    // Top-level categories: those with nil categoryId (the parent_id column).
    private var parentCats: [VPCategory] {
        categories.filter { $0.categoryId == nil }
            .sorted { ($0.displayOrder ?? 999) < ($1.displayOrder ?? 999) }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Search input
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(VP.dim)
                    TextField("Search articles\u{2026}", text: $query)
                        .font(.system(.body))
                        .foregroundColor(VP.text)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .onSubmit { Task { await runSearch() } }
                    if !query.isEmpty {
                        Button {
                            query = ""
                            searchResults = []
                        } label: {
                            Image(systemName: "xmark.circle.fill").foregroundColor(VP.dim)
                        }
                    }
                }
                .padding(10)
                .background(VP.surfaceSunken)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .padding(.horizontal, 16)
                .padding(.vertical, 12)

                Divider()

                if !query.isEmpty {
                    searchResultsList
                } else {
                    categoryList
                }
            }
            .background(VP.bg)
            .navigationTitle("Sections")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                        .font(.system(.body, weight: .medium))
                        .foregroundColor(VP.accent)
                }
            }
        }
        .onChange(of: query) { _, newVal in
            if newVal.count >= 2 { Task { await runSearch() } }
            else if newVal.isEmpty { searchResults = [] }
        }
    }

    private var categoryList: some View {
        List {
            ForEach(parentCats) { cat in
                let subs = categories.filter { $0.categoryId == cat.id }
                    .sorted { ($0.displayOrder ?? 999) < ($1.displayOrder ?? 999) }
                Section {
                    NavigationLink(destination: categoryFeedView(cat: cat)) {
                        Text(cat.displayName)
                            .font(.system(.body, weight: .semibold))
                            .foregroundColor(VP.text)
                            .padding(.vertical, 2)
                    }
                    ForEach(subs) { sub in
                        NavigationLink(destination: categoryFeedView(cat: sub)) {
                            Text(sub.displayName)
                                .font(.system(.subheadline))
                                .foregroundColor(VP.dim)
                                .padding(.leading, 8)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var searchResultsList: some View {
        Group {
            if isSearching {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if searchResults.isEmpty && query.count >= 2 {
                Text("No results for \u{201C}\(query)\u{201D}")
                    .font(.subheadline).foregroundColor(VP.dim)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(searchResults) { story in
                    NavigationLink(destination: StoryDetailView(story: story)) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(story.title ?? "")
                                .font(.system(.subheadline, weight: .semibold))
                                .foregroundColor(VP.text)
                                .lineLimit(2)
                            if let ex = story.excerpt {
                                Text(ex).font(.caption).foregroundColor(VP.dim).lineLimit(2)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    private func categoryFeedView(cat: VPCategory) -> some View {
        CategoryFeedView(category: cat)
            .onDisappear { dismiss() }
    }

    private func runSearch() async {
        guard query.count >= 2 else { return }
        isSearching = true
        defer { isSearching = false }
        do {
            let results: [Story] = try await client.from("articles")
                .select("*, stories(slug)")
                .eq("status", value: "published")
                .eq("browse_only", value: false)
                .ilike("title", value: "%\(query)%")
                .order("published_at", ascending: false)
                .limit(20)
                .execute()
                .value
            searchResults = results
        } catch {
            searchResults = []
        }
    }
}

// MARK: - CategoryFeedView
//
// Simple article list for a single category or subcategory.
// Used as the drill-in destination from HomeSectionsSheet.
// Distinguishes top-level vs sub by checking VPCategory.categoryId (parent_id).

struct CategoryFeedView: View {
    let category: VPCategory
    @State private var stories: [Story] = []
    @State private var loading = true
    private let client = SupabaseManager.shared.client

    var body: some View {
        Group {
            if loading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if stories.isEmpty {
                Text("No articles in \(category.displayName).")
                    .foregroundColor(VP.dim)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(stories) { story in
                    NavigationLink(destination: StoryDetailView(story: story)) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(story.title ?? "")
                                .font(.system(.subheadline, weight: .semibold))
                                .foregroundColor(VP.text)
                                .lineLimit(3)
                            if let ex = story.excerpt {
                                Text(ex).font(.caption).foregroundColor(VP.dim).lineLimit(2)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle(category.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            // Top-level categories filter by category_id; subcategories by subcategory_id.
            let col = category.categoryId == nil ? "category_id" : "subcategory_id"
            stories = try await client.from("articles")
                .select("*, stories(slug)")
                .eq("status", value: "published")
                .eq("browse_only", value: false)
                .eq(col, value: category.id)
                .order("published_at", ascending: false)
                .limit(20)
                .execute()
                .value
        } catch {
            stories = []
        }
    }
}
