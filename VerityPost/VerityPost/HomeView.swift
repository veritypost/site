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

    @State private var canViewBreakingBanner: Bool = false
    @State private var canViewBreakingBannerPaid: Bool = false
    // Search affordance — magnifier above the masthead, gated by
    // `search.basic`. The icon used to live in the global tab-bar/top-bar
    // chrome; it was relocated to the home feed so the search entry point
    // is contextual rather than persistent on every surface.
    @State private var canSearch: Bool = false

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
                            EmptyView()
                        } else {
                            if let hero = stories.first {
                                heroBlock(hero)
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
                                    }
                                }
                                .padding(.top, 40)
                            }

                            endOfFrontPage
                        }
                    }
                    .navigationDestination(for: Story.self) { story in
                        StoryDetailView(story: story)
                            .onAppear { trackArticleView(articleId: story.id) }
                    }
                    .padding(.bottom, 80)
                }
                .refreshable {
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
            today = HomeView.computeToday()
            refreshTask?.cancel()
            refreshTask = Task { await loadData() }
            _ = await refreshTask?.value
        }
        .task(id: perms.changeToken) {
            canViewBreakingBanner = await PermissionService.shared.has("home.breaking_banner.view")
            canViewBreakingBannerPaid = await PermissionService.shared.has("home.breaking_banner.view.paid")
            canSearch = await PermissionService.shared.has("search.basic")
        }
    }

    // MARK: - Top bar (brand + search)
    //
    // Mirrors ProfileView.topBar shape so the brand chrome reads the same
    // across the app. Wordmark on the left, magnifier on the right when
    // the viewer has `search.basic` (logged-in only — anon's PermissionStore
    // returns false for everything). Pushes FindView via NavigationLink so
    // the search experience inherits the tab's navigation stack.

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
            if canSearch {
                NavigationLink {
                    FindView().environmentObject(auth)
                } label: {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 18, weight: .regular))
                        .foregroundColor(VP.dim)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Search")
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(VP.bg)
        .overlay(
            Rectangle().fill(VP.border).frame(height: 1),
            alignment: .bottom
        )
    }

    // MARK: - Hero / Supporting

    @ViewBuilder
    private func heroBlock(_ story: Story) -> some View {
        let bg = heroBg(for: story)
        NavigationLink(value: story) {
            VStack(alignment: .leading, spacing: 0) {
                if let cat = categoryName(for: story.categoryId) {
                    Text(cat.uppercased())
                        .font(.system(size: 11, weight: .semibold, design: .serif))
                        .tracking(1.4)
                        .foregroundColor(.white.opacity(0.65))
                        .padding(.bottom, 14)
                }
                Text(story.title ?? "Untitled")
                    .font(.system(size: 32, weight: .bold, design: .serif))
                    .tracking(-0.4)
                    .lineSpacing(2)
                    .foregroundColor(.white)
                    .fixedSize(horizontal: false, vertical: true)
                if let excerpt = story.excerpt, !excerpt.isEmpty {
                    Text(excerpt)
                        .font(.system(size: 18, weight: .regular, design: .serif))
                        .lineSpacing(4)
                        .foregroundColor(.white.opacity(0.80))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 14)
                }
                Text(timeShort(story.publishedAt))
                    .font(.system(size: 13, weight: .medium))
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
        VStack(alignment: .leading, spacing: 0) {
            if let cat = categoryName(for: story.categoryId) {
                eyebrow(cat).padding(.bottom, 8)
            }

            Text(story.title ?? "Untitled")
                .font(.system(size: 21, weight: .bold, design: .serif))
                .tracking(-0.2)
                .lineSpacing(1)
                .foregroundColor(VP.text)
                .fixedSize(horizontal: false, vertical: true)

            if let excerpt = story.excerpt, !excerpt.isEmpty {
                Text(excerpt)
                    .font(.system(size: 15, weight: .regular, design: .serif))
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
            .font(.system(size: 11, weight: .semibold, design: .serif))
            .tracking(1.4)
            .foregroundColor(VP.muted)
    }

    @ViewBuilder
    private func metaLine(for story: Story) -> some View {
        Text(timeShort(story.publishedAt))
            .font(.system(size: 13, weight: .medium))
            .foregroundColor(VP.muted)
    }

    private var hairline: some View {
        Rectangle()
            .fill(VP.rule)
            .frame(height: 1)
    }

    // MARK: - End of front page

    private var endOfFrontPage: some View {
        VStack(spacing: 14) {
            Rectangle()
                .fill(VP.rule)
                .frame(height: 1)
                .padding(.horizontal, 20)
                .padding(.top, 56)
                .padding(.bottom, 24)

            Text("That’s today’s front page.")
                .font(.system(size: 14, weight: .regular, design: .serif))
                .italic()
                .foregroundColor(VP.dim)

            NavigationLink {
                BrowseLanding()
            } label: {
                Text("Browse all categories →")
                    .font(.system(size: 16, weight: .medium, design: .serif))
                    .foregroundColor(VP.accent)
                    .underline(true, color: VP.accent)
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 24)
    }

    // MARK: - Empty / loading / error

    private var loadingState: some View {
        Text("Loading today’s front page…")
            .font(.system(size: 15, weight: .regular, design: .serif))
            .italic()
            .foregroundColor(VP.dim)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 64)
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 12) {
            Text(message)
                .font(.system(size: 14, weight: .regular, design: .serif))
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
            Button {
                refreshTask?.cancel()
                refreshTask = Task { await loadData() }
            } label: {
                Text("Try again")
                    .font(.system(size: 14, weight: .medium))
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
                .font(.system(size: 11, weight: .heavy))
                .tracking(1.4)
                .foregroundColor(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(
                    RoundedRectangle(cornerRadius: 3).fill(Color.black.opacity(0.22))
                )

            Text(truncated)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.white)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)

            if canViewBreakingBannerPaid {
                Text(timeShort(story.publishedAt))
                    .font(.system(size: 11))
                    .foregroundColor(.white.opacity(0.85))
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 8)
        .background(VP.breaking)
    }

    // MARK: - Data

    private func loadData() async {
        await SettingsService.shared.loadIfNeeded()
        if Task.isCancelled { return }
        loading = true
        loadError = nil
        today = HomeView.computeToday()

        do {
            let todayStartIso = HomeView.loadDataISOFmt.string(from: today.startUtc)

            async let storiesReq: [Story] = client.from("articles")
                .select("*, stories(slug)")
                .eq("status", value: "published")
                .gte("published_at", value: todayStartIso)
                .order("published_at", ascending: false)
                .limit(20)
                .execute()
                .value

            // Dedicated breaking query — runs independently of the 8-slot
            // top-of-feed so a breaking story always surfaces above the
            // masthead even if the editor didn't flag it as today's hero.
            // Mirrors the web home (`web/src/app/page.tsx`).
            async let breakingReq: [Story] = client.from("articles")
                .select("*, stories(slug)")
                .eq("status", value: "published")
                .eq("is_breaking", value: true)
                .gte("published_at", value: todayStartIso)
                .order("published_at", ascending: false)
                .limit(1)
                .execute()
                .value

            async let catsReq: [VPCategory] = client.from("categories")
                .select()
                .eq("is_active", value: true)
                .order("sort_order")
                .execute()
                .value

            let raw = try await storiesReq
            let breakingFirst = try await breakingReq.first
            let cats = try await catsReq
            // Hero-pick first, then most-recent. Same logic as web.
            let ranked = raw.sorted { a, b in
                let aHero = (a.heroPickForDate == today.isoDate) ? 1 : 0
                let bHero = (b.heroPickForDate == today.isoDate) ? 1 : 0
                if aHero != bHero { return aHero > bHero }
                let aT = a.publishedAt ?? .distantPast
                let bT = b.publishedAt ?? .distantPast
                return aT > bT
            }
            // T244b — bail before mutating state so a cancelled task (replaced
            // by a pull-to-refresh that already kicked off a new fetch) can't
            // overwrite the newer task's results with its stale payload.
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
                        .background(RoundedRectangle(cornerRadius: 12).fill(VP.accent))
                }
                Button("Maybe Later") {
                    showRegistrationWall = false
                }
                .font(.footnote)
                .foregroundColor(VP.dim)
            }
            .padding(28)
            .background(RoundedRectangle(cornerRadius: 16).fill(VP.bg))
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
        if viewed > limit {
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
private struct BrowseLanding: View {
    @State private var categories: [VPCategory] = []
    @State private var loading = true
    @State private var categoryPreviews: [String: [Story]] = [:]
    @State private var categoryCounts7d: [String: Int] = [:]
    private let client = SupabaseManager.shared.client

    private static let timeShortFmt: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "MMM d"
        return f
    }()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Browse")
                    .font(.system(size: 32, weight: .bold, design: .serif))
                    .tracking(-0.4)
                    .foregroundColor(VP.text)
                    .padding(.top, 24)
                    .padding(.bottom, 24)

                if loading {
                    Text("Loading…")
                        .font(.system(size: 14, design: .serif))
                        .italic()
                        .foregroundColor(VP.dim)
                        .padding(.vertical, 48)
                        .frame(maxWidth: .infinity)
                } else if categories.isEmpty {
                    Text("No categories available.")
                        .font(.system(size: 14, design: .serif))
                        .italic()
                        .foregroundColor(VP.dim)
                        .padding(.vertical, 48)
                        .frame(maxWidth: .infinity)
                } else {
                    ForEach(categories) { cat in
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
        .task { await load() }
    }

    @ViewBuilder
    private func categoryBlock(_ cat: VPCategory) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            NavigationLink(value: cat) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(cat.displayName)
                            .font(.system(size: 20, weight: .semibold, design: .serif))
                            .foregroundColor(VP.text)
                        Text(countLabel(for: cat))
                            .font(.system(size: 12, weight: .regular, design: .serif))
                            .foregroundColor(VP.dim)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(VP.dim)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .padding(.vertical, 12)
            }
            .buttonStyle(.plain)

            let previews = categoryPreviews[cat.id] ?? []
            if !previews.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(previews) { story in
                        NavigationLink(value: story) {
                            previewRow(story)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.bottom, 10)
            }
        }
    }

    @ViewBuilder
    private func previewRow(_ story: Story) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(story.title ?? "Untitled")
                .font(.system(size: 15, weight: .semibold, design: .serif))
                .foregroundColor(VP.text)
                .multilineTextAlignment(.leading)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            if let excerpt = story.excerpt, !excerpt.isEmpty {
                Text(excerpt)
                    .font(.system(size: 13, weight: .regular, design: .serif))
                    .foregroundColor(VP.soft)
                    .lineLimit(1)
                    .multilineTextAlignment(.leading)
            }
            Text(timeShort(story.publishedAt))
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(VP.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func countLabel(for cat: VPCategory) -> String {
        switch categoryCounts7d[cat.id] {
        case nil: return "—"
        case .some(0): return "No articles this week"
        case .some(1): return "1 article this week"
        case .some(let n): return "\(n) articles this week"
        }
    }

    private func timeShort(_ date: Date?) -> String {
        guard let date else { return "" }
        let mins = Int(Date().timeIntervalSince(date) / 60)
        if mins < 1 { return "just now" }
        if mins < 60 { return "\(mins)m ago" }
        let hours = mins / 60
        if hours < 24 { return "\(hours)h ago" }
        return BrowseLanding.timeShortFmt.string(from: date)
    }

    private func load() async {
        do {
            let cats: [VPCategory] = try await client.from("categories")
                .select()
                .eq("is_active", value: true)
                .order("sort_order")
                .not("slug", operator: .like, value: "kids-%")
                .execute()
                .value
            categories = cats
            loading = false

            await loadPreviewsAndCounts(for: cats)
        } catch {
            Log.d("Browse load failed: \(error)")
            loading = false
        }
    }

    private func loadPreviewsAndCounts(for cats: [VPCategory]) async {
        // 7-day window so the count reflects "this week" copy. ISO-8601 since
        // PostgREST gte on timestamp columns expects RFC3339.
        let weekAgo = Date().addingTimeInterval(-7 * 24 * 60 * 60)
        let weekAgoIso = ISO8601DateFormatter().string(from: weekAgo)

        await withTaskGroup(of: (String, [Story], Int).self) { group in
            for cat in cats {
                let catId = cat.id
                let client = self.client
                group.addTask {
                    async let previewReq: [Story] = client.from("articles")
                        .select("*, stories(slug)")
                        .eq("category_id", value: catId)
                        .eq("status", value: "published")
                        .eq("visibility", value: "public")
                        .order("published_at", ascending: false)
                        .limit(2)
                        .execute()
                        .value
                    // `count: .exact, head: true` returns a HEAD response with
                    // the row count in the Content-Range header — no payload
                    // body shipped, so this stays cheap even on hot categories.
                    async let countReq: PostgrestResponse<Void> = client.from("articles")
                        .select("id", head: true, count: .exact)
                        .eq("category_id", value: catId)
                        .eq("status", value: "published")
                        .eq("visibility", value: "public")
                        .gte("published_at", value: weekAgoIso)
                        .execute()

                    let previews = (try? await previewReq) ?? []
                    let countResp = try? await countReq
                    let count = countResp?.count ?? 0
                    return (catId, previews, count)
                }
            }
            for await (id, previews, count) in group {
                categoryPreviews[id] = previews
                categoryCounts7d[id] = count
            }
        }
    }
}

// MARK: - CategoryDetailView
//
// Lists published articles in a single category. Reuses the same row
// shape as the home feed so tapping a story still navigates into
// StoryDetailView. Covers the gap reported by the owner: tapping a
// row in BrowseLanding previously did nothing because the rows were
// static Text, not Buttons / NavigationLinks.
//
// Internal (not private) so any per-category list affordance — currently
// HomeView's category sections — can push the same destination as the
// single source of truth for the per-category feed.
struct CategoryDetailView: View {
    let category: VPCategory

    @State private var stories: [Story] = []
    @State private var loading = true
    @State private var loadFailed = false
    @State private var refreshTask: Task<Void, Never>? = nil
    private let client = SupabaseManager.shared.client

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
                    Text("Loading…")
                        .font(.system(size: 14, design: .serif))
                        .italic()
                        .foregroundColor(VP.dim)
                        .padding(.vertical, 48)
                        .frame(maxWidth: .infinity)
                } else if loadFailed {
                    Text("Couldn't load stories. Pull to retry.")
                        .font(.system(size: 14, design: .serif))
                        .italic()
                        .foregroundColor(VP.dim)
                        .padding(.vertical, 48)
                        .frame(maxWidth: .infinity)
                } else if stories.isEmpty {
                    Text("No stories in this category yet.")
                        .font(.system(size: 14, design: .serif))
                        .italic()
                        .foregroundColor(VP.dim)
                        .padding(.vertical, 48)
                        .frame(maxWidth: .infinity)
                } else {
                    ForEach(stories) { story in
                        NavigationLink(value: story) {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(story.title ?? "Untitled")
                                    .font(.system(size: 20, weight: .semibold, design: .serif))
                                    .foregroundColor(VP.text)
                                    .multilineTextAlignment(.leading)
                                if let excerpt = story.excerpt, !excerpt.isEmpty {
                                    Text(excerpt)
                                        .font(.system(size: 15, design: .serif))
                                        .foregroundColor(VP.dim)
                                        .lineLimit(3)
                                        .multilineTextAlignment(.leading)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 16)
                        }
                        .buttonStyle(.plain)

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

    private func load() async {
        loading = true
        loadFailed = false
        do {
            let s: [Story] = try await client.from("articles")
                .select("*, stories(slug)")
                .eq("category_id", value: category.id)
                .eq("status", value: "published")
                .eq("visibility", value: "public")
                .order("published_at", ascending: false)
                .limit(50)
                .execute()
                .value
            stories = s
            loading = false
        } catch {
            Log.d("CategoryDetailView load failed: \(error)")
            loadFailed = true
            loading = false
        }
    }
}
