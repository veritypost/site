import SwiftUI
import Supabase

// Find tab — keyword search across published articles, with advanced
// filters (category / date range / source publisher) for callers with
// the matching permissions. Calls GET /api/search?q=&category=&from=
// &to=&source= — same endpoint and param shape the web /search page
// uses. Anon callers get title-only matching (basic mode); the server
// silently strips filters they aren't entitled to.

struct FindView: View {
    @EnvironmentObject var auth: AuthViewModel
    @ObservedObject private var perms = PermissionStore.shared
    private let client = SupabaseManager.shared.client

    @State private var query: String = ""
    @State private var results: [Story] = []
    @State private var loading = false
    @State private var errorText: String?
    @State private var hasSearched = false
    // category_id → display name lookup, populated once on mount so the
    // result rows can render the category label without an N+1 round trip.
    @State private var categoryNames: [String: String] = [:]
    // Full category list for the filter picker (top-level only — same
    // policy as web /search).
    @State private var categories: [VPCategory] = []

    // Advanced filter state.
    @State private var filterCategory: String = ""
    @State private var filterFromDate: Date?
    @State private var filterToDate: Date?
    @State private var filterSource: String = ""
    @State private var showFilterSheet = false

    // Permission gates — resolved on mount + on perms change.
    @State private var canAdvanced: Bool = false
    @State private var canFilterCategory: Bool = false
    @State private var canFilterDate: Bool = false
    @State private var canFilterSource: Bool = false

    // Simple debounce: cancel the previous search task when the query changes.
    @State private var searchTask: Task<Void, Never>?

    private static let dateFmtFallback: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "MMM d"
        return f
    }()

    private static let dateFmtChip: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "MMM d"
        return f
    }()

    private var hasAnyFilter: Bool {
        !filterCategory.isEmpty
            || filterFromDate != nil
            || filterToDate != nil
            || !filterSource.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                searchBar
                if hasAnyFilter {
                    activeFilterChips
                }
                Divider().background(VP.border)
                resultArea
            }
            .background(VP.bg)
            .navigationTitle("Find")
            .navigationBarTitleDisplayMode(.inline)
            .task { await loadCategories() }
            .task(id: perms.changeToken) { await refreshPermissions() }
            .sheet(isPresented: $showFilterSheet) { filterSheet }
        }
    }

    // MARK: - Search bar

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(.subheadline, design: .default, weight: .medium))
                .foregroundColor(VP.dim)
            TextField("Search articles", text: $query)
                .font(.system(.subheadline))
                .foregroundColor(VP.text)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .submitLabel(.search)
                .onSubmit { performSearch(query) }
                .onChange(of: query) { _, newValue in
                    scheduleSearch(newValue)
                }
            if !query.isEmpty {
                Button {
                    query = ""
                    results = []
                    hasSearched = false
                    errorText = nil
                    searchTask?.cancel()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(.subheadline))
                        .foregroundColor(VP.dim)
                }
                .accessibilityLabel("Clear search")
                .buttonStyle(.plain)
            }
            // Filters affordance — text-only per editorial restraint
            // rule. Only renders when the caller has any advanced
            // filter permission so anon and free users don't see a
            // door they can't open.
            if canAdvanced && (canFilterCategory || canFilterDate || canFilterSource) {
                Button { showFilterSheet = true } label: {
                    Text("Filters")
                        .font(.system(size: 13, weight: hasAnyFilter ? .semibold : .medium))
                        .foregroundColor(hasAnyFilter ? VP.text : VP.dim)
                        .tracking(-0.05)
                }
                .accessibilityLabel("Open search filters")
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(VP.bg)
    }

    // MARK: - Active filter chips

    private var activeFilterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                if !filterCategory.isEmpty {
                    let name = categories.first { $0.id == filterCategory }?.displayName ?? "Category"
                    filterChip(label: name) { filterCategory = ""; performSearch(query) }
                }
                if let from = filterFromDate {
                    filterChip(label: "From " + Self.dateFmtChip.string(from: from)) {
                        filterFromDate = nil
                        performSearch(query)
                    }
                }
                if let to = filterToDate {
                    filterChip(label: "To " + Self.dateFmtChip.string(from: to)) {
                        filterToDate = nil
                        performSearch(query)
                    }
                }
                let src = filterSource.trimmingCharacters(in: .whitespaces)
                if !src.isEmpty {
                    filterChip(label: src) { filterSource = ""; performSearch(query) }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    @ViewBuilder
    private func filterChip(label: String, onClear: @escaping () -> Void) -> some View {
        // 12/600 active chip in the editorial action-chip family, pill
        // 20px radius, 32 min-height. Matches the web /search active
        // chip family.
        Button(action: onClear) {
            HStack(spacing: 6) {
                Text(label)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(VP.text)
                Text("\u{00D7}")
                    .font(.system(size: 13, weight: .regular))
                    .foregroundColor(VP.dim)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .frame(minHeight: 32)
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(VP.border, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Clear filter \(label)")
    }

    // MARK: - Filter sheet

    private var filterSheet: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    if canFilterCategory {
                        VStack(alignment: .leading, spacing: 10) {
                            sheetSectionLabel("Category")
                            Picker("Category", selection: $filterCategory) {
                                Text("All categories").tag("")
                                ForEach(categories.filter { $0.categoryId == nil }) { cat in
                                    Text(cat.displayName).tag(cat.id)
                                }
                            }
                            .pickerStyle(.menu)
                            .tint(VP.text)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(VP.border, lineWidth: 1)
                            )
                        }
                    }
                    if canFilterDate {
                        VStack(alignment: .leading, spacing: 10) {
                            sheetSectionLabel("Date range")
                            DatePicker(
                                "From",
                                selection: Binding(
                                    get: { filterFromDate ?? Date() },
                                    set: { filterFromDate = $0 }
                                ),
                                displayedComponents: .date
                            )
                            .font(.system(.footnote))
                            DatePicker(
                                "To",
                                selection: Binding(
                                    get: { filterToDate ?? Date() },
                                    set: { filterToDate = $0 }
                                ),
                                displayedComponents: .date
                            )
                            .font(.system(.footnote))
                            if filterFromDate != nil || filterToDate != nil {
                                Button("Clear dates") {
                                    filterFromDate = nil
                                    filterToDate = nil
                                }
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(VP.dim)
                            }
                        }
                    }
                    if canFilterSource {
                        VStack(alignment: .leading, spacing: 10) {
                            sheetSectionLabel("Source publisher")
                            TextField("e.g. nytimes.com", text: $filterSource)
                                .font(.system(.footnote))
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .padding(.horizontal, 12)
                                .padding(.vertical, 10)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(VP.border, lineWidth: 1)
                                )
                        }
                    }
                    Spacer(minLength: 32)
                }
                .padding(20)
            }
            .navigationTitle("Search filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Reset") {
                        filterCategory = ""
                        filterFromDate = nil
                        filterToDate = nil
                        filterSource = ""
                    }
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(VP.dim)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Apply") {
                        showFilterSheet = false
                        performSearch(query)
                    }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(VP.text)
                }
            }
            .background(VP.bg)
        }
    }

    @ViewBuilder
    private func sheetSectionLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold))
            .tracking(1.1)
            .foregroundColor(VP.dim)
            .textCase(.uppercase)
    }

    // MARK: - Result area

    @ViewBuilder
    private var resultArea: some View {
        if loading {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.top, 60)
        } else if let err = errorText {
            VStack(spacing: 8) {
                Text("Search failed")
                    .font(.system(.callout, design: .default, weight: .semibold))
                    .foregroundColor(VP.text)
                Text(err)
                    .font(.footnote)
                    .foregroundColor(VP.dim)
                Button("Try again") { performSearch(query) }
                    .font(.system(.footnote, design: .default, weight: .medium))
                    .foregroundColor(VP.text)
                    .padding(.top, 4)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 60)
        } else if hasSearched && results.isEmpty {
            VStack(spacing: 8) {
                Text("No results for \u{201C}\(query)\u{201D}")
                    .font(.system(size: 18, weight: .semibold))
                    .tracking(-0.18)
                    .foregroundColor(VP.text)
                Text("Try different keywords, or clear filters.")
                    .font(.footnote)
                    .foregroundColor(VP.dim)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 60)
        } else if !hasSearched {
            VStack(spacing: 8) {
                Text("Search for articles")
                    .font(.system(.callout, design: .default, weight: .regular))
                    .italic()
                    .foregroundColor(VP.dim)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 80)
        } else {
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(results) { story in
                        NavigationLink {
                            StoryDetailView(story: story)
                                .environmentObject(auth)
                        } label: {
                            storyRow(story)
                        }
                        .buttonStyle(.plain)
                        Divider()
                            .background(VP.border)
                    }
                }
                .padding(.horizontal, 20)
            }
        }
    }

    private func storyRow(_ story: Story) -> some View {
        // Editorial card-list family: 17px Source Serif 4 / 500 / -0.01em /
        // 1.3 line-height title; 14px muted-ink excerpt; 11/600/0.1em
        // uppercase byline meta. Same shape as UpNextSheet, NextStoryFooter,
        // SectionsMenu search results, and the web /search results.
        VStack(alignment: .leading, spacing: 6) {
            metaLine(for: story)
            Text(story.title ?? "Untitled")
                .font(.system(size: 17, weight: .medium, design: .serif))
                .tracking(-0.17)
                .foregroundColor(VP.text)
                .multilineTextAlignment(.leading)
                .lineLimit(2)
            if let excerpt = story.excerpt, !excerpt.isEmpty {
                Text(excerpt)
                    .font(.system(size: 14, weight: .regular))
                    .foregroundColor(VP.muted)
                    .lineSpacing(2)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 12)
    }

    @ViewBuilder
    private func metaLine(for story: Story) -> some View {
        let cat = story.categoryId.flatMap { categoryNames[$0] }
        let date = relativeDate(story.publishedAt)
        if cat != nil || date != nil {
            HStack(spacing: 6) {
                if let cat {
                    Text(cat.uppercased())
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(1.1)
                        .foregroundColor(VP.muted)
                }
                if cat != nil && date != nil {
                    Text("·")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(VP.muted)
                }
                if let date {
                    Text(date.uppercased())
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(1.1)
                        .foregroundColor(VP.muted)
                }
            }
        }
    }

    /// Short relative-time helper. Mirrors `HomeView.timeShort` so result
    /// rows read the same as the front page ("2h ago" / "3d ago" / "Apr 17").
    private func relativeDate(_ date: Date?) -> String? {
        guard let date else { return nil }
        let secs = Date().timeIntervalSince(date)
        if secs < 60 { return "just now" }
        let mins = Int(secs / 60)
        if mins < 60 { return "\(mins)m ago" }
        let hours = mins / 60
        if hours < 24 { return "\(hours)h ago" }
        let days = hours / 24
        if days < 7 { return "\(days)d ago" }
        return FindView.dateFmtFallback.string(from: date)
    }

    // MARK: - Categories + permissions

    private func loadCategories() async {
        guard categories.isEmpty else { return }
        do {
            let cats: [VPCategory] = try await client.from("categories")
                .select()
                .eq("is_kids_safe", value: false)
                .is("deleted_at", value: nil)
                .order("sort_order")
                .execute()
                .value
            var map: [String: String] = [:]
            for c in cats { map[c.id] = c.displayName }
            await MainActor.run {
                categories = cats
                categoryNames = map
            }
        } catch {
            Log.d("FindView category load failed: \(error)")
        }
    }

    private func refreshPermissions() async {
        async let advanced = PermissionService.shared.has("search.advanced")
        async let cat = PermissionService.shared.has("search.advanced.category")
        async let date = PermissionService.shared.has("search.advanced.date_range")
        async let src = PermissionService.shared.has("search.advanced.source")
        let (a, c, d, s) = await (advanced, cat, date, src)
        await MainActor.run {
            canAdvanced = a
            canFilterCategory = c
            canFilterDate = d
            canFilterSource = s
        }
    }

    // MARK: - Search

    /// Debounces input — waits 400ms after the last keystroke before firing.
    private func scheduleSearch(_ value: String) {
        searchTask?.cancel()
        let trimmed = value.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else {
            results = []
            hasSearched = false
            errorText = nil
            loading = false
            return
        }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            performSearch(trimmed)
        }
    }

    private func performSearch(_ value: String) {
        let trimmed = value.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        Task { await doSearch(trimmed) }
    }

    private func doSearch(_ q: String) async {
        await MainActor.run {
            loading = true
            errorText = nil
        }
        let site = SupabaseManager.shared.siteURL
        let searchURL = site.appendingPathComponent("api/search")
        var components = URLComponents(url: searchURL, resolvingAgainstBaseURL: false)
        var items: [URLQueryItem] = [URLQueryItem(name: "q", value: q)]
        if canFilterCategory && !filterCategory.isEmpty {
            items.append(URLQueryItem(name: "category", value: filterCategory))
        }
        if canFilterDate {
            let isoDay = ISO8601DateFormatter()
            isoDay.formatOptions = [.withFullDate]
            if let from = filterFromDate {
                items.append(URLQueryItem(name: "from", value: isoDay.string(from: from)))
            }
            if let to = filterToDate {
                items.append(URLQueryItem(name: "to", value: isoDay.string(from: to)))
            }
        }
        if canFilterSource {
            let src = filterSource.trimmingCharacters(in: .whitespaces)
            if !src.isEmpty {
                items.append(URLQueryItem(name: "source", value: src))
            }
        }
        components?.queryItems = items
        guard let url = components?.url else {
            await MainActor.run {
                errorText = "Configuration error."
                loading = false
            }
            return
        }
        do {
            var req = URLRequest(url: url)
            if let session = try? await client.auth.session {
                req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            }
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
                await MainActor.run {
                    errorText = "Server error."
                    loading = false
                    hasSearched = true
                }
                return
            }
            struct SearchResponse: Decodable {
                let articles: [Story]
            }
            let decoded = try JSONDecoder().decode(SearchResponse.self, from: data)
            await MainActor.run {
                results = decoded.articles
                loading = false
                hasSearched = true
            }
        } catch {
            await MainActor.run {
                errorText = "Network issue."
                loading = false
                hasSearched = true
            }
        }
    }
}
