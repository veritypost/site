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

    // Breaking-news banner — dismissed banner ids stored as a comma-joined
    // string in @AppStorage so each article only reappears if explicitly un-
    // dismissed by clearing app storage. Set semantics, list serialization.
    @AppStorage("home.breaking_dismissed") private var dismissedBreakingCSV: String = ""

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
            // Main feed — mirrors web mobile (web/src/app/page.tsx): a single
            // scroll of category pills, breaking banner, streak line, story
            // cards, load-more. iOS intentionally shows everything open —
            // we do not propagate web's launch-hide `{false && ...}` gates
            // to iOS; the pill rows render live here.
            ScrollView {
                VStack(spacing: 0) {
                    // Flat top bar — matches web's rgba(255,255,255,0.97) fixed
                    // top bar. Rendered inside ScrollView (not as NavigationStack
                    // toolbar) because iOS 26's default toolbar wraps items in
                    // a floating glass bubble + adds a scroll-edge gray shadow
                    // that .toolbarBackground can't fully override.
                    HStack(spacing: 0) {
                        Text("verity post")
                            .font(.system(size: 15, weight: .heavy))
                            .tracking(-0.15)
                            .foregroundColor(VP.text)
                            .lineLimit(1)
                            .fixedSize(horizontal: true, vertical: false)
                        Spacer()
                        if canSearch {
                            Button {
                                showSearch.toggle()
                            } label: {
                                Image(systemName: showSearch ? "xmark" : "magnifyingglass")
                                    .font(.system(size: 20, weight: .regular))
                                    .foregroundColor(VP.dim)
                                    .frame(width: 44, height: 44)
                                    .contentShape(Rectangle())
                            }
                            .accessibilityLabel(showSearch ? "Close search" : "Search stories")
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(VP.bg)
                    .overlay(
                        Rectangle()
                            .fill(VP.border)
                            .frame(height: 1),
                        alignment: .bottom
                    )

                    // Category pill row — horizontal scroll, "All" first then
                    // one pill per loaded category. Selecting a pill filters
                    // the feed and clears any previously selected subcategory.
                    if !categories.isEmpty {
                        categoryPillRow
                    }

                    // Subcategory pill row — only when a category is active
                    // and it has subcategories. Matches web's conditional
                    // render (page.tsx: activeCategory !== 'All' && subs > 0).
                    if let catId = selectedCategory,
                       !subcategories.filter({ $0.categoryId == catId }).isEmpty {
                        subcategoryPillRow(categoryId: catId)
                    }

                    if loading {
                        // Matches web mobile: centered text, 48pt vertical
                        // padding, dim color, 15pt size.
                        Text("Loading articles...")
                            .font(.system(size: 15))
                            .foregroundColor(VP.dim)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 48)
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
                            .buttonStyle(.bordered)
                            .padding(.top, 4)
                        }
                        .padding(.horizontal, 40)
                        .padding(.vertical, 48)
                    } else if filteredStories.isEmpty {
                        // Match web mobile's exact empty copy ("No articles
                        // found.") and layout — centered, 48pt padding, dim.
                        Text("No articles found.")
                            .font(.system(size: 15))
                            .foregroundColor(VP.dim)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 48)
                    } else {
                        LazyVStack(spacing: 0) {
                            // Breaking-news banner — top of feed when an
                            // unbroken-and-undismissed `is_breaking` story is
                            // present and the viewer has the permission.
                            if canViewBreakingBanner, let breaking = visibleBreakingStory {
                                NavigationLink(value: breaking) {
                                    breakingBanner(for: breaking)
                                }
                                .buttonStyle(.plain)
                            }

                            // Streak count intentionally NOT rendered on
                            // adult home. Server still advances the streak
                            // via the reading_log trigger (migration 134);
                            // count shows on profile / achievements /
                            // leaderboard. Home stays clean.

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

                            // Load more — mirrors web's card-style full-width
                            // button (page.tsx "Load more articles"): #f7f7f7
                            // background, 1.5px border, 12pt radius, 14pt
                            // padding, 14pt text weight 600 accent color.
                            if hasMoreStories {
                                Button {
                                    Task { await loadMore() }
                                } label: {
                                    Text("Load more articles")
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundColor(VP.accent)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 14)
                                        .background(
                                            RoundedRectangle(cornerRadius: 12)
                                                .fill(VP.card)
                                        )
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 12)
                                                .stroke(VP.border, lineWidth: 1.5)
                                        )
                                }
                                .buttonStyle(.plain)
                                .padding(.horizontal, 16)
                                .padding(.top, 8)
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
        // Hide native nav bar entirely — custom flat top bar renders inside
        // ScrollView. iOS 26 toolbar defaults to liquid-glass bubble +
        // scroll-edge shadow which .toolbarBackground can't fully override.
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
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

    // MARK: - Category + subcategory pill rows

    /// Category pill row — "All" + one pill per loaded category. Matches the
    /// web styling spec: 14x8 padding, 13pt weight 600, capsule, active uses
    /// VP.text bg + VP.bg text, inactive uses VP.bg + VP.text text with a 1pt
    /// VP.border outline. Horizontal scroll, 6pt spacing, 8pt container inset.
    private var categoryPillRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                homePill(
                    label: "All",
                    isActive: selectedCategory == nil,
                    action: {
                        selectedCategory = nil
                        selectedSubcategory = nil
                    }
                )
                ForEach(categories) { cat in
                    homePill(
                        label: cat.displayName,
                        isActive: selectedCategory == cat.id,
                        action: {
                            selectedCategory = cat.id
                            selectedSubcategory = nil
                        }
                    )
                }
            }
            .padding(.horizontal, 8)
        }
        .padding(.top, 6)
        .padding(.bottom, 6)
    }

    /// Subcategory pill row — "All <cat>" + one pill per subcategory of the
    /// selected category. Same styling as the category row for parity with
    /// web's second pill strip.
    @ViewBuilder
    private func subcategoryPillRow(categoryId: String) -> some View {
        let subs = subcategories.filter { $0.categoryId == categoryId }
        let catName = categories.first(where: { $0.id == categoryId })?.displayName ?? ""
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                homePill(
                    label: catName.isEmpty ? "All" : "All \(catName)",
                    isActive: selectedSubcategory == nil,
                    action: { selectedSubcategory = nil }
                )
                ForEach(subs) { sub in
                    homePill(
                        label: sub.name,
                        isActive: selectedSubcategory == sub.id,
                        action: {
                            selectedSubcategory = selectedSubcategory == sub.id ? nil : sub.id
                        }
                    )
                }
            }
            .padding(.horizontal, 8)
        }
        .padding(.bottom, 8)
    }

    /// Shared pill styling for home category/subcategory rows. 13pt / 600 /
    /// capsule / 14x8 padding. Active inverts (VP.text bg + VP.bg text),
    /// inactive is VP.bg bg + VP.text text + 1pt VP.border outline.
    @ViewBuilder
    private func homePill(label: String, isActive: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(isActive ? VP.bg : VP.text)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(
                    Capsule().fill(isActive ? VP.text : VP.bg)
                )
                .overlay(
                    Capsule().stroke(isActive ? VP.text : VP.border, lineWidth: 1)
                )
                .fixedSize(horizontal: true, vertical: false)
        }
        .buttonStyle(.plain)
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

    // MARK: - Breaking-news banner

    /// Article ids the viewer dismissed (parsed from @AppStorage CSV).
    private var dismissedBreakingIds: Set<String> {
        Set(dismissedBreakingCSV.split(separator: ",").map { String($0) }.filter { !$0.isEmpty })
    }

    /// First breaking story in the current filtered feed that the viewer has
    /// not already dismissed. nil hides the banner entirely.
    private var visibleBreakingStory: Story? {
        let dismissed = dismissedBreakingIds
        return filteredStories.first(where: { $0.isBreaking == true && !dismissed.contains($0.id) })
    }

    /// Persist a dismissal — appends to the CSV (set-semantics, no dupes).
    private func dismissBreaking(_ id: String) {
        var set = dismissedBreakingIds
        set.insert(id)
        dismissedBreakingCSV = set.sorted().joined(separator: ",")
    }

    @ViewBuilder
    private func breakingBanner(for story: Story) -> some View {
        // 80-char truncation per spec; SwiftUI's lineLimit handles tail trim
        // but we cap upstream so the banner stays a single line on every
        // device width.
        let raw = story.title ?? "Breaking news"
        let truncated = raw.count > 80 ? String(raw.prefix(80)) + "\u{2026}" : raw

        HStack(alignment: .center, spacing: 10) {
            Text("BREAKING")
                .font(.system(.caption2, design: .default, weight: .heavy))
                .tracking(0.5)
                .foregroundColor(VP.danger)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(RoundedRectangle(cornerRadius: 4).fill(Color.white))
            Text(truncated)
                .font(.system(.footnote, design: .default, weight: .semibold))
                .foregroundColor(.white)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
            Button {
                dismissBreaking(story.id)
            } label: {
                Image(systemName: "xmark")
                    .font(.system(.caption, design: .default, weight: .bold))
                    .foregroundColor(.white)
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dismiss breaking news banner")
        }
        .padding(.leading, 16)
        .padding(.trailing, 4)
        .padding(.vertical, 4)
        .background(VP.danger)
        .cornerRadius(10)
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .padding(.bottom, 4)
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
                                .buttonStyle(.bordered)
                                .controlSize(.small)
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

/// Article card — mirrors web/src/app/page.tsx feed card exactly.
/// 16:9 cover image on top (or category-tinted fallback), then body padding
/// 14×16: category badge (11pt 600 uppercase #111) + optional BREAKING chip,
/// title 15pt 700, excerpt 13pt #666, date 11pt #666. Card background #f7f7f7,
/// 1pt #e5e5e5 border, 12pt radius, 12pt vertical gap between cards.
struct StoryCard: View {
    let story: Story
    var categoryName: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // 16:9 cover image — matches web's CardThumbnail. AsyncImage with
            // a tinted fallback so missing-image cards still feel intentional.
            CardThumbnail(
                url: story.imageUrl,
                seed: categoryName ?? story.title ?? story.id,
                label: (categoryName ?? "").uppercased()
            )

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    if let cat = categoryName, !cat.isEmpty {
                        // Web: 11pt weight 600, 0.03em tracking, #111 accent.
                        Text(cat.uppercased())
                            .font(.system(size: 11, weight: .semibold))
                            .tracking(0.33)
                            .foregroundColor(VP.accent)
                    }
                    if story.isBreaking == true {
                        // Web: 10pt weight 800, 0.05em tracking, white on
                        // #ef4444, 6×2 padding, 4pt radius.
                        Text("BREAKING")
                            .font(.system(size: 10, weight: .heavy))
                            .tracking(0.5)
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(RoundedRectangle(cornerRadius: 4).fill(Color(hex: "ef4444")))
                    }
                }
                .padding(.top, 4)

                // Web title: 15pt weight 700, line-height 1.4, #111.
                Text(story.title ?? "Untitled")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(VP.text)
                    .lineSpacing(15 * 0.4) // 1.4 line-height
                    .multilineTextAlignment(.leading)
                    .padding(.top, 4)

                if let summary = story.summary, !summary.isEmpty {
                    // Web excerpt: 13pt, line-height 1.5, #666.
                    Text(summary)
                        .font(.system(size: 13))
                        .foregroundColor(VP.dim)
                        .lineSpacing(13 * 0.5) // 1.5 line-height
                        .multilineTextAlignment(.leading)
                        .padding(.top, 4)
                }

                if let date = story.publishedAt {
                    // Web date: 11pt #666, 6pt top margin.
                    Text(absoluteDate(date))
                        .font(.system(size: 11))
                        .foregroundColor(VP.dim)
                        .padding(.top, 6)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(VP.card)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border, lineWidth: 1))
        .padding(.horizontal, 16)
        // Web uses `marginBottom: 12` on each card; mirror as a 6/6 split so
        // the first card hugs the streak line above and adjacent cards keep
        // a 12pt gap between them.
        .padding(.vertical, 6)
    }

    private func absoluteDate(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "MMM d, yyyy"
        return f.string(from: d)
    }
}

// MARK: - Card thumbnail

/// 16:9 image block with a category-tinted fallback. Mirrors web's
/// `CardThumbnail` (page.tsx): tries the cover_image_url; on missing/failed
/// load, renders a deterministic tinted background derived from the seed
/// string with the label as a soft watermark. Top corners are rounded so
/// the card's 12pt radius reads as one continuous shape.
struct CardThumbnail: View {
    let url: String?
    let seed: String
    let label: String

    var body: some View {
        let tint = Self.tint(for: seed)
        ZStack {
            tint
            if let raw = url, !raw.isEmpty, let imageURL = URL(string: raw) {
                AsyncImage(url: imageURL) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    case .failure, .empty:
                        // Watermark label inside the tinted block.
                        fallbackLabel
                    @unknown default:
                        fallbackLabel
                    }
                }
            } else {
                fallbackLabel
            }
        }
        .aspectRatio(16.0 / 9.0, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .clipped()
        // Round only the top corners so the bottom edge meets the body
        // padding cleanly inside the parent card's outer rounded rectangle.
        .clipShape(
            UnevenRoundedRectangle(
                cornerRadii: .init(topLeading: 12, bottomLeading: 0, bottomTrailing: 0, topTrailing: 12),
                style: .continuous
            )
        )
    }

    @ViewBuilder
    private var fallbackLabel: some View {
        if !label.isEmpty {
            Text(label)
                .font(.system(size: 13, weight: .bold))
                .tracking(1.04) // ~0.08em at 13pt
                .foregroundColor(Color(white: 17.0 / 255.0).opacity(0.45))
                .multilineTextAlignment(.center)
                .padding(16)
        } else {
            Color.clear
        }
    }

    /// Stable hue per seed string — same hash semantics as web's
    /// `tintFromString`, rendered as `hsl(hue, 28%, 88%)`.
    private static func tint(for seed: String) -> Color {
        var h: Int32 = 0
        for scalar in seed.unicodeScalars {
            h = (h &* 31) &+ Int32(scalar.value)
        }
        let hue = Double(abs(Int(h)) % 360) / 360.0
        return Color(hue: hue, saturation: 0.28, brightness: 0.88)
    }
}
