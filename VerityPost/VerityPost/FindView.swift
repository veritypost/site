import SwiftUI
import Supabase

// Find tab — keyword search across published articles.
// Calls GET /api/search?q=... using the same endpoint as the web /search page.
// Anon callers get title-only matching (basic mode); authenticated users on
// paid plans get full-text search with advanced filters (server-enforced).
// This view uses basic mode only — no filter UI — consistent with the MVP tab.
//
// T-117

struct FindView: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    @State private var query: String = ""
    @State private var results: [Story] = []
    @State private var loading = false
    @State private var errorText: String?
    @State private var hasSearched = false
    // category_id → display name lookup, populated once on mount so the
    // result rows can render the category label without an N+1 round trip.
    @State private var categoryNames: [String: String] = [:]

    // Simple debounce: cancel the previous search task when the query changes.
    @State private var searchTask: Task<Void, Never>?

    private static let dateFmtFallback: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "MMM d"
        return f
    }()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                searchBar
                Divider().background(VP.border)
                resultArea
            }
            .background(VP.bg)
            .navigationTitle("Find")
            .navigationBarTitleDisplayMode(.inline)
            .task { await loadCategoryNames() }
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
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(VP.bg)
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
                    .foregroundColor(VP.accent)
                    .padding(.top, 4)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 60)
        } else if hasSearched && results.isEmpty {
            VStack(spacing: 8) {
                Text("No results for \u{201C}\(query)\u{201D}")
                    .font(.system(.callout, design: .default, weight: .semibold))
                    .foregroundColor(VP.text)
                Text("Try different keywords.")
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
        VStack(alignment: .leading, spacing: 6) {
            metaLine(for: story)
            Text(story.title ?? "Untitled")
                .font(.system(.subheadline, design: .default, weight: .semibold))
                .foregroundColor(VP.text)
                .multilineTextAlignment(.leading)
                .lineLimit(2)
            if let excerpt = story.excerpt, !excerpt.isEmpty {
                Text(excerpt)
                    .font(.system(.caption, design: .default, weight: .regular))
                    .foregroundColor(VP.dim)
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
            HStack(spacing: 8) {
                if let cat {
                    Text(cat.uppercased())
                        .font(.system(size: 10, weight: .semibold, design: .serif))
                        .tracking(1.2)
                        .foregroundColor(VP.muted)
                }
                if cat != nil && date != nil {
                    Circle()
                        .fill(VP.muted)
                        .frame(width: 2, height: 2)
                }
                if let date {
                    Text(date)
                        .font(.system(size: 10, weight: .medium))
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

    // MARK: - Categories

    private func loadCategoryNames() async {
        guard categoryNames.isEmpty else { return }
        do {
            let cats: [VPCategory] = try await client.from("categories")
                .select()
                .eq("is_active", value: true)
                .execute()
                .value
            var map: [String: String] = [:]
            for c in cats { map[c.id] = c.displayName }
            await MainActor.run { categoryNames = map }
        } catch {
            Log.d("FindView category map load failed: \(error)")
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
        components?.queryItems = [URLQueryItem(name: "q", value: q)]
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
