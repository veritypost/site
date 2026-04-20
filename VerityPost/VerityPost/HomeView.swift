import SwiftUI
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified home_feed 2026-04-18
// @feature-verified search 2026-04-18

struct HomeView: View {
    @EnvironmentObject var auth: AuthViewModel
    @StateObject private var perms = PermissionStore.shared
    private let client = SupabaseManager.shared.client
    @State private var canSeeRecap: Bool = false
    @State private var adsSuppressed: Bool = false
    @State private var canViewHomeFeed: Bool = true
    @State private var canViewBreakingBanner: Bool = false
    @State private var canViewBreakingBannerPaid: Bool = false
    // Search gates — mirror site/src/app/search/page.tsx.
    // `canSearch` hides the magnifyingglass button entirely when an admin
    // revokes `search.view`. `canAdvancedSearch` hides the paid filter
    // surfaces (source, date range, category panel) inside the overlay.
    @State private var canSearch: Bool = true
    @State private var canAdvancedSearch: Bool = false
    @State private var canSearchFilterCategory: Bool = false
    @State private var canSearchFilterDate: Bool = false
    @State private var canSearchFilterSource: Bool = false

    @State private var stories: [Story] = []
    @State private var categories: [VPCategory] = []
    @State private var subcategories: [VPSubcategory] = []
    @State private var sources: [SourceLink] = []
    @State private var selectedCategory: String? = nil
    @State private var selectedSubcategory: String? = nil
    @State private var loading = true
    @State private var loadError: String? = nil
    @State private var page = 0
    @State private var hasMoreStories = true
    @State private var showRegistrationWall = false

    // Search overlay
    @State private var showSearch = false
    @State private var searchText = ""
    @State private var searchMode: SearchMode = .headline
    @State private var selectedSource: String? = nil
    @State private var datePreset: DatePreset = .any
    @State private var customFrom: Date = Calendar.current.date(byAdding: .month, value: -1, to: Date()) ?? Date()
    @State private var customTo: Date = Date()
    @State private var searchCategoryId: String? = nil
    @State private var searchSubcategoryId: String? = nil
    @State private var expandedSearchCat: String? = nil

    enum SearchMode: String, CaseIterable {
        case headline = "Headline"
        case keyword = "Keyword"
        case slug = "Slug"
        case quiz = "Quiz"
    }

    enum DatePreset: String, CaseIterable {
        case any = "Any"
        case today = "Today"
        case yesterday = "Yesterday"
        case thisWeek = "This Week"
        case thisMonth = "This Month"
        case custom = "Custom"
    }

    var body: some View {
        ZStack {
            // Main feed
            ScrollView {
                VStack(spacing: 0) {
                    // Streak header — plain text per design rules (no flame icon).
                    if let streak = auth.currentUser?.streak, streak > 0 {
                        HStack {
                            Text("Day \(streak)")
                                .font(.system(.footnote, design: .default, weight: .semibold))
                                .foregroundColor(VP.text)
                            Spacer()
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 12)
                    }

                    // Category pills
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            PillButton(label: "All", isActive: selectedCategory == nil) {
                                selectedCategory = nil
                                selectedSubcategory = nil
                            }
                            ForEach(categories) { cat in
                                PillButton(label: cat.displayName, isActive: selectedCategory == cat.id) {
                                    selectedCategory = cat.id
                                    selectedSubcategory = nil
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 16)
                    }

                    // Subcategory pills (when a category is selected, logged-in only)
                    if auth.currentUser != nil, let catId = selectedCategory {
                        let subs = subcategories.filter { $0.categoryId == catId }
                        if !subs.isEmpty {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    PillButton(label: "All", isActive: selectedSubcategory == nil) {
                                        selectedSubcategory = nil
                                    }
                                    ForEach(subs) { sub in
                                        PillButton(label: sub.name, isActive: selectedSubcategory == sub.id) {
                                            selectedSubcategory = sub.id
                                        }
                                    }
                                }
                                .padding(.horizontal, 20)
                                .padding(.bottom, 12)
                            }
                        }
                    }

                    if loading {
                        ProgressView()
                            .padding(.top, 60)
                    } else if let loadError = loadError {
                        VStack(spacing: 10) {
                            Text("Couldn't load stories")
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
                    } else if filteredStories.isEmpty {
                        VStack(spacing: 8) {
                            Text("No stories found")
                                .font(.system(.callout, design: .default, weight: .semibold))
                                .foregroundColor(VP.text)
                            Text("Check back soon for new stories, or try a different category.")
                                .font(.footnote)
                                .foregroundColor(VP.dim)
                                .multilineTextAlignment(.center)
                        }
                        .padding(.horizontal, 40)
                        .padding(.top, 60)
                    } else {
                        LazyVStack(spacing: 0) {
                            // Recap card (users with recap permission; self-hides if no recap).
                            if canSeeRecap {
                                HomeRecapCard()
                                    .environmentObject(auth)
                            }

                            ForEach(Array(filteredStories.enumerated()), id: \.element.id) { idx, story in
                                NavigationLink(value: story) {
                                    StoryCard(
                                        story: story,
                                        categoryName: categories.first(where: { $0.id == story.categoryId })?.displayName
                                    )
                                }
                                .buttonStyle(.plain)

                                // Ads every 6 items for free/verity; hidden for pro+.
                                if shouldShowAd(afterIndex: idx) {
                                    HomeAdSlot()
                                }
                            }

                            // Load More button
                            if hasMoreStories {
                                Button {
                                    Task { await loadMore() }
                                } label: {
                                    Text("Load More")
                                        .font(.system(.subheadline, design: .default, weight: .semibold))
                                        .foregroundColor(VP.accent)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 14)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .navigationDestination(for: Story.self) { story in
                            StoryDetailView(story: story)
                                .onAppear {
                                    trackArticleView(articleId: story.id)
                                }
                        }
                    }
                }
                .padding(.bottom, 100)
            }
            .background(VP.bg.ignoresSafeArea())
            .refreshable { await loadData() }

            // Search overlay
            if showSearch {
                searchOverlay
            }

            // Registration wall overlay
            if showRegistrationWall {
                ZStack {
                    Color.black.opacity(0.5).ignoresSafeArea()
                    VStack(spacing: 16) {
                        Text("Create a free account")
                            .font(.system(.title3, design: .default, weight: .bold))
                            .foregroundColor(VP.text)
                        Text("You've read your free articles. Sign up to continue reading.")
                            .font(.subheadline)
                            .foregroundColor(VP.dim)
                            .multilineTextAlignment(.center)
                        NavigationLink {
                            SignupView()
                                .environmentObject(auth)
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
        }
        .toolbar {
            // Matches site's sticky nav: VP logo square + "Verity Post" title.
            ToolbarItem(placement: .principal) {
                HStack(spacing: 8) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(VP.text)
                            .frame(width: 28, height: 28)
                        Text("VP")
                            .font(.system(.caption, design: .default, weight: .black))
                            .foregroundColor(.white)
                    }
                    Text("Verity Post")
                        .font(.system(.headline, design: .default, weight: .heavy))
                        .tracking(-0.48)
                        .foregroundColor(VP.text)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                if canSearch {
                    Button {
                        showSearch.toggle()
                    } label: {
                        Image(systemName: showSearch ? "xmark" : "magnifyingglass")
                            .font(.headline)
                            .foregroundColor(VP.dim)
                    }
                }
            }
        }
        .task { await loadData() }
        .task(id: perms.changeToken) {
            canSeeRecap = await PermissionService.shared.has("recap.list.view")
            adsSuppressed = await PermissionService.shared.has("ads.suppress")
            canViewHomeFeed = await PermissionService.shared.has("home.feed.view")
            canViewBreakingBanner = await PermissionService.shared.has("home.breaking_banner.view")
            canViewBreakingBannerPaid = await PermissionService.shared.has("home.breaking_banner.view.paid")
            // Search gates — match site parity.
            let hasView = await PermissionService.shared.has("search.view")
            let hasBasic = await PermissionService.shared.has("search.basic")
            let hasFreeArticles = await PermissionService.shared.has("search.articles.free")
            canSearch = hasView || hasBasic || hasFreeArticles
            canAdvancedSearch = await PermissionService.shared.has("search.advanced")
            canSearchFilterCategory = await PermissionService.shared.has("search.advanced.category")
            canSearchFilterDate = await PermissionService.shared.has("search.advanced.date_range")
            canSearchFilterSource = await PermissionService.shared.has("search.advanced.source")
        }
    }

    // MARK: - Filtered stories

    private var filteredStories: [Story] {
        var result = stories
        if let cat = selectedCategory {
            result = result.filter { $0.categoryId == cat }
        }
        if let sub = selectedSubcategory {
            result = result.filter { $0.subcategoryId == sub }
        }
        return result
    }

    // MARK: - Permission-aware slot gating

    /// Ads: suppressed when the user has the `ads.suppress` permission
    /// (consolidates kids-mode + paid-tier logic server-side).
    private var shouldShowAds: Bool {
        !adsSuppressed
    }

    /// Insert an ad slot after every 6th story (0-based: after indices 5, 11, …).
    private func shouldShowAd(afterIndex i: Int) -> Bool {
        guard shouldShowAds else { return false }
        return (i + 1) % 6 == 0
    }

    // MARK: - Search overlay

    private var searchOverlay: some View {
        ZStack {
            VP.bg.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Search input
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(VP.dim)
                        TextField("Search stories...", text: $searchText)
                            .font(.subheadline)
                    }
                    .padding(12)
                    .background(VP.card)
                    .cornerRadius(10)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))

                    // Search mode
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Search by")
                            .font(.system(.caption, design: .default, weight: .medium))
                            .foregroundColor(VP.dim)
                        HStack(spacing: 8) {
                            ForEach(SearchMode.allCases, id: \.self) { mode in
                                PillButton(label: mode.rawValue, isActive: searchMode == mode) {
                                    searchMode = mode
                                }
                            }
                        }
                    }

                    // Date presets — paid-tier filter (search.advanced.date_range)
                    if canAdvancedSearch && canSearchFilterDate {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Date range")
                            .font(.system(.caption, design: .default, weight: .medium))
                            .foregroundColor(VP.dim)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(DatePreset.allCases, id: \.self) { preset in
                                    PillButton(label: preset.rawValue, isActive: datePreset == preset) {
                                        datePreset = preset
                                    }
                                }
                            }
                        }
                        if datePreset == .custom {
                            HStack(spacing: 12) {
                                DatePicker("From", selection: $customFrom, displayedComponents: .date)
                                    .labelsHidden()
                                Text("to")
                                    .font(.caption)
                                    .foregroundColor(VP.dim)
                                DatePicker("To", selection: $customTo, displayedComponents: .date)
                                    .labelsHidden()
                            }
                        }
                    }
                    } // end canSearchFilterDate

                    // Source filter — paid-tier (search.advanced.source)
                    if canAdvancedSearch && canSearchFilterSource && !sources.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Source")
                                .font(.system(.caption, design: .default, weight: .medium))
                                .foregroundColor(VP.dim)
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    PillButton(label: "All", isActive: selectedSource == nil) {
                                        selectedSource = nil
                                    }
                                    ForEach(sources) { src in
                                        PillButton(label: src.outletName ?? "Unknown", isActive: selectedSource == src.id) {
                                            selectedSource = src.id
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Categories + subcategories — paid-tier (search.advanced.category)
                    if canAdvancedSearch && canSearchFilterCategory {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Categories")
                            .font(.system(.caption, design: .default, weight: .medium))
                            .foregroundColor(VP.dim)

                        ForEach(categories) { cat in
                            VStack(spacing: 0) {
                                Button {
                                    if expandedSearchCat == cat.id {
                                        expandedSearchCat = nil
                                    } else {
                                        expandedSearchCat = cat.id
                                    }
                                    searchCategoryId = cat.id
                                    searchSubcategoryId = nil
                                } label: {
                                    HStack {
                                        Text(cat.displayName)
                                            .font(.system(.footnote, design: .default, weight: .semibold))
                                            .foregroundColor(searchCategoryId == cat.id ? VP.accent : VP.text)
                                        Spacer()
                                        let subs = subcategories.filter { $0.categoryId == cat.id }
                                        if !subs.isEmpty {
                                            Image(systemName: "chevron.right")
                                                .font(.caption)
                                                .foregroundColor(VP.dim)
                                                .rotationEffect(.degrees(expandedSearchCat == cat.id ? 90 : 0))
                                        }
                                    }
                                    .padding(.vertical, 10)
                                    .padding(.horizontal, 14)
                                    .background(searchCategoryId == cat.id ? VP.card : .clear)
                                    .cornerRadius(8)
                                }
                                .buttonStyle(.plain)

                                // Subcategories
                                if expandedSearchCat == cat.id {
                                    let subs = subcategories.filter { $0.categoryId == cat.id }
                                    ForEach(subs) { sub in
                                        Button {
                                            searchSubcategoryId = sub.id
                                        } label: {
                                            Text(sub.name)
                                                .font(.caption)
                                                .foregroundColor(searchSubcategoryId == sub.id ? VP.accent : VP.dim)
                                                .padding(.vertical, 6)
                                                .padding(.leading, 28)
                                                .frame(maxWidth: .infinity, alignment: .leading)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                        }
                    }
                    } // end canSearchFilterCategory

                    // Active filters summary
                    if hasActiveFilters {
                        HStack {
                            Text("Filters active")
                                .font(.system(.caption, design: .default, weight: .medium))
                                .foregroundColor(VP.accent)
                            Spacer()
                            Button("Clear all") { clearFilters() }
                                .font(.system(.caption, design: .default, weight: .semibold))
                                .foregroundColor(VP.danger)
                        }
                        .padding(.vertical, 10)
                        .padding(.horizontal, 14)
                        .background(VP.card)
                        .cornerRadius(8)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border))
                    }

                    // Search button
                    Button {
                        Task { await performSearch() }
                    } label: {
                        Text("Search")
                            .font(.system(.subheadline, design: .default, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: 48)
                            .background(VP.text)
                            .foregroundColor(.white)
                            .cornerRadius(12)
                    }
                }
                .padding(20)
                .padding(.bottom, 100)
            }
        }
    }

    private var hasActiveFilters: Bool {
        !searchText.isEmpty || selectedSource != nil || datePreset != .any || searchCategoryId != nil
    }

    private func clearFilters() {
        searchText = ""
        selectedSource = nil
        datePreset = .any
        searchCategoryId = nil
        searchSubcategoryId = nil
        expandedSearchCat = nil
        searchMode = .headline
    }

    // MARK: - Data loading

    private func loadData() async {
        // Load admin settings
        await SettingsService.shared.loadIfNeeded()

        page = 0
        hasMoreStories = true
        do {
            async let storiesReq: [Story] = client.from("articles")
                .select()
                .eq("status", value: "published")
                .order("published_at", ascending: false)
                .limit(20)
                .execute()
                .value

            // v2 categories table is self-referential (parent_id). Pull
            // both parents and subs in one go so the subcategory pills can
            // appear conditionally when a parent is selected.
            async let catsReq: [VPCategory] = client.from("categories")
                .select()
                .eq("is_kids_safe", value: false)
                .eq("is_active", value: true)
                .order("sort_order")
                .execute()
                .value

            async let srcReq: [SourceLink] = client.from("sources")
                .select()
                .execute()
                .value

            let fetchedStories = try await storiesReq
            stories = fetchedStories
            hasMoreStories = fetchedStories.count >= 20

            let allCats = try await catsReq
            // Top-level rows are categories. Anything with a non-nil
            // parent goes into subcategories.
            categories = allCats.filter { $0.categoryId == nil }
            subcategories = allCats.compactMap { c in
                guard let parent = c.categoryId else { return nil }
                return VPSubcategory(id: c.id, categoryId: parent, name: c.name, slug: c.slug)
            }

            sources = try await srcReq
            loadError = nil
        } catch {
            Log.d("Failed to load home data: \(error)")
            loadError = "We couldn't reach Verity Post. Check your connection and try again."
        }
        loading = false
    }

    private func loadMore() async {
        page += 1
        let offset = page * 20
        do {
            let moreStories: [Story] = try await client.from("articles")
                .select()
                .eq("status", value: "published")
                .order("published_at", ascending: false)
                .range(from: offset, to: offset + 19)
                .execute()
                .value
            stories.append(contentsOf: moreStories)
            hasMoreStories = moreStories.count >= 20
            loadError = nil
        } catch {
            Log.d("Load more error: \(error)")
            // Roll the page pointer back so the next retry re-requests the
            // same page rather than silently skipping it.
            page = max(0, page - 1)
            loadError = "Couldn\u{2019}t load more stories. Tap to retry."
        }
    }

    private func performSearch() async {
        showSearch = false
        loading = true
        do {
            var query = client.from("articles")
                .select()
                .eq("status", value: "published")

            if !searchText.isEmpty {
                switch searchMode {
                case .headline:
                    query = query.ilike("title", value: "%\(searchText)%")
                case .keyword:
                    query = query.ilike("body", value: "%\(searchText)%")
                case .slug:
                    query = query.ilike("slug", value: "%\(searchText)%")
                case .quiz:
                    query = query.ilike("title", value: "%\(searchText)%")
                }
            }

            if let subId = searchSubcategoryId {
                query = query.eq("subcategory_id", value: subId)
            } else if let catId = searchCategoryId {
                query = query.eq("category_id", value: catId)
            }

            let cal = Calendar.current
            let now = Date()
            var fromDate: Date? = nil
            switch datePreset {
            case .any: break
            case .today: fromDate = cal.startOfDay(for: now)
            case .yesterday: fromDate = cal.startOfDay(for: cal.date(byAdding: .day, value: -1, to: now) ?? now)
            case .thisWeek: fromDate = cal.date(from: cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: now))
            case .thisMonth: fromDate = cal.date(from: cal.dateComponents([.year, .month], from: now))
            case .custom: fromDate = customFrom
            }
            if let from = fromDate {
                query = query.gte("published_at", value: ISO8601DateFormatter().string(from: from))
            }
            if datePreset == .custom {
                query = query.lte("published_at", value: ISO8601DateFormatter().string(from: customTo))
            }

            let results: [Story] = try await query
                .order("published_at", ascending: false)
                .limit(20)
                .execute().value
            stories = results
            hasMoreStories = results.count >= 20
            loadError = nil
        } catch {
            Log.d("Search error:", error)
            loadError = "Search failed. Check your connection and try again."
        }
        loading = false
    }

    // MARK: - Registration wall

    private func trackArticleView(articleId: String) {
        let ss = SettingsService.shared
        guard ss.isEnabled("registration_wall") else { return }
        guard !auth.isLoggedIn else { return }

        // Count each article once — swiping back and forth should never
        // consume additional entries from the anonymous free quota.
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
}

// MARK: - Story Card

/// Article card — mirrors site/src/app/page.js feed card exactly.
/// Card background #f7f7f7, 1pt #e5e5e5 border, 12pt radius, 14x16 padding.
/// Category badge (uppercase 11pt 600, accent color) + optional BREAKING pill.
/// Title 15pt weight 700, line-height 1.4. Excerpt 13pt dim. Absolute date 11pt dim.
struct StoryCard: View {
    let story: Story
    var categoryName: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                if let cat = categoryName, !cat.isEmpty {
                    Text(cat.uppercased())
                        .font(.system(.caption, design: .default, weight: .semibold))
                        .tracking(0.33)
                        .foregroundColor(VP.accent)
                }
                if story.isBreaking == true {
                    Text("BREAKING")
                        .font(.system(.caption2, design: .default, weight: .heavy))
                        .tracking(0.5)
                        .foregroundColor(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 4).fill(Color(hex: "ef4444")))
                }
            }

            Text(story.title ?? "Untitled")
                .font(.system(.callout, design: .default, weight: .bold))
                .foregroundColor(VP.text)
                .lineSpacing(2)
                .multilineTextAlignment(.leading)

            if let summary = story.summary, !summary.isEmpty {
                Text(summary)
                    .font(.footnote)
                    .foregroundColor(VP.dim)
                    .lineSpacing(2)
                    .multilineTextAlignment(.leading)
            }

            if let date = story.publishedAt {
                Text(absoluteDate(date))
                    .font(.caption)
                    .foregroundColor(VP.dim)
                    .padding(.top, 2)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border, lineWidth: 1))
        .cornerRadius(12)
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
    }

    private func absoluteDate(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "MMM d, yyyy"
        return f.string(from: d)
    }
}
