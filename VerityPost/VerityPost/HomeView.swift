import SwiftUI
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified home_feed 2026-04-23

// Hand-curated front page per Future Projects/09_HOME_FEED_REBUILD.md.
// 1 hero + up to 7 supporting, dated, page ends. Mirrors web/src/app/page.tsx
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
    @StateObject private var perms = PermissionStore.shared
    private let client = SupabaseManager.shared.client

    @State private var stories: [Story] = []
    @State private var breakingStory: Story? = nil
    @State private var categories: [VPCategory] = []
    @State private var loading = true
    @State private var loadError: String? = nil
    @State private var showRegistrationWall = false

    @State private var canViewBreakingBanner: Bool = false
    @State private var canViewBreakingBannerPaid: Bool = false

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
            ScrollView {
                VStack(spacing: 0) {
                    // Breaking strip — narrow, above masthead. Renders only
                    // when an active breaking-flagged article exists today
                    // AND the viewer has the permission. Mirrors the
                    // dedicated `is_breaking=true` query the web home runs
                    // (separate from the 8-slot front page so a breaking
                    // story always surfaces even if the editor didn't flag
                    // it as today's hero). Per spec: rate-limited, Senior
                    // Editor only.
                    if canViewBreakingBanner, let breaking = breakingStory {
                        NavigationLink(value: breaking) {
                            breakingStrip(for: breaking)
                        }
                        .buttonStyle(.plain)
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Breaking news: \(breaking.title ?? "Breaking news")")
                    }

                    masthead

                    if loading {
                        loadingState
                    } else if let err = loadError {
                        errorState(err)
                    } else if stories.isEmpty {
                        emptyDayState
                    } else {
                        if let hero = stories.first {
                            heroBlock(hero)
                        }

                        let supporting = Array(stories.dropFirst().prefix(7))
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
            .background(VP.bg.ignoresSafeArea())
            .refreshable { await loadData() }

            if showRegistrationWall {
                registrationWallOverlay
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            today = HomeView.computeToday()
            await loadData()
        }
        .task(id: perms.changeToken) {
            canViewBreakingBanner = await PermissionService.shared.has("home.breaking_banner.view")
            canViewBreakingBannerPaid = await PermissionService.shared.has("home.breaking_banner.view.paid")
        }
    }

    // MARK: - Masthead

    private var masthead: some View {
        VStack(spacing: 14) {
            Text("Verity")
                .font(.system(size: 44, weight: .bold, design: .serif))
                .tracking(-0.6)
                .foregroundColor(VP.text)

            Text(today.humanDate)
                .font(.system(size: 16, weight: .medium, design: .serif))
                .foregroundColor(VP.soft)

            Text("Today’s stories, chosen by an editor.")
                .font(.system(size: 13, weight: .regular, design: .serif))
                .italic()
                .foregroundColor(VP.dim)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 32)
        .padding(.bottom, 28)
        .padding(.horizontal, 20)
        .overlay(
            Rectangle().fill(VP.rule).frame(height: 1),
            alignment: .bottom
        )
        .padding(.bottom, 48)
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

    private var emptyDayState: some View {
        VStack(spacing: 20) {
            Text("No new stories yet today.")
                .font(.system(size: 16, weight: .regular, design: .serif))
                .italic()
                .foregroundColor(VP.dim)

            NavigationLink {
                BrowseLanding()
            } label: {
                Text("Browse all categories →")
                    .font(.system(size: 15, weight: .medium, design: .serif))
                    .foregroundColor(VP.accent)
                    .underline(true, color: VP.accent)
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 80)
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 12) {
            Text(message)
                .font(.system(size: 14, weight: .regular, design: .serif))
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
            Button {
                Task { await loadData() }
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
        loading = true
        loadError = nil
        today = HomeView.computeToday()

        do {
            let todayStartIso = HomeView.loadDataISOFmt.string(from: today.startUtc)

            async let storiesReq: [Story] = client.from("articles")
                .select()
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
                .select()
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
            // Hero-pick first, then most-recent. Same logic as web.
            let ranked = raw.sorted { a, b in
                let aHero = (a.heroPickForDate == today.isoDate) ? 1 : 0
                let bHero = (b.heroPickForDate == today.isoDate) ? 1 : 0
                if aHero != bHero { return aHero > bHero }
                let aT = a.publishedAt ?? .distantPast
                let bT = b.publishedAt ?? .distantPast
                return aT > bT
            }
            stories = Array(ranked.prefix(8))
            breakingStory = try await breakingReq.first
            categories = try await catsReq
        } catch {
            Log.d("Home load failed: \(error)")
            loadError = "We couldn’t reach Verity Post. Check your connection."
        }
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

        let seenKey = "vp_articles_viewed_ids"
        var seen = Set(UserDefaults.standard.stringArray(forKey: seenKey) ?? [])
        if seen.contains(articleId) { return }
        seen.insert(articleId)
        UserDefaults.standard.set(Array(seen), forKey: seenKey)

        let countKey = "vp_articles_viewed"
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

// MARK: - Browse landing (placeholder destination for Browse all categories)
//
// Lightweight category list. The full /sections route per
// Future Projects/09_HOME_FEED_REBUILD.md is deferred; this provides a
// real destination so the front-page link isn’t a dangling CTA.
private struct BrowseLanding: View {
    @State private var categories: [VPCategory] = []
    @State private var loading = true
    private let client = SupabaseManager.shared.client

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
                        NavigationLink(value: cat) {
                            HStack {
                                Text(cat.displayName)
                                    .font(.system(size: 18, weight: .medium, design: .serif))
                                    .foregroundColor(VP.text)
                                Spacer(minLength: 8)
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(VP.dim)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                            .padding(.vertical, 14)
                        }
                        .buttonStyle(.plain)

                        Rectangle()
                            .fill(VP.rule)
                            .frame(height: 1)
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

    private func load() async {
        do {
            let cats: [VPCategory] = try await client.from("categories")
                .select()
                .eq("is_active", value: true)
                .order("sort_order")
                .execute()
                .value
            categories = cats
            loading = false
        } catch {
            Log.d("Browse load failed: \(error)")
            loading = false
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
private struct CategoryDetailView: View {
    let category: VPCategory

    @State private var stories: [Story] = []
    @State private var loading = true
    @State private var loadFailed = false
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
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        loading = true
        loadFailed = false
        do {
            let s: [Story] = try await client.from("articles")
                .select()
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
