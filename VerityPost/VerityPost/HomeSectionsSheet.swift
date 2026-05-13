import SwiftUI
import Supabase

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
            // Owner cleanup item 12 (2026-05-08, refined) — Following row
            // at the top of the Sections sheet. Lazy-fetches the user's
            // story_follows when the section is expanded.
            FollowingSection()

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
                                Text(ex).font(.caption).foregroundColor(VP.dim)
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

// MARK: - FollowingSection (owner cleanup item 12)
//
// Lives at the top of HomeSectionsSheet.categoryList. Lazy-loads the
// user's story_follows on first appear, renders one row per followed
// story with an unread dot when a new article has landed since
// last_seen_at. Tap a row → land on the latest article + RPC
// mark_story_seen so the dot clears.

private struct FollowingSheetRow: Decodable, Identifiable {
    let storyId: String
    let lastSeenAt: Date?
    let stories: FollowingSheetStory?
    var id: String { storyId }
    enum CodingKeys: String, CodingKey {
        case storyId = "story_id"
        case lastSeenAt = "last_seen_at"
        case stories
    }
}

private struct FollowingSheetStory: Decodable {
    let id: String
    let slug: String?
    let title: String
    let publishedAt: Date?
    enum CodingKeys: String, CodingKey {
        case id, slug, title
        case publishedAt = "published_at"
    }
}

private struct FollowingSheetLatest: Decodable {
    let id: String
    let title: String
    let storyId: String
    let publishedAt: Date?
    enum CodingKeys: String, CodingKey {
        case id, title
        case storyId = "story_id"
        case publishedAt = "published_at"
    }
}

private struct FollowingSheetDisplay: Identifiable {
    let storyId: String
    let title: String
    let unread: Bool
    let latestStory: Story?
    var id: String { storyId }
}

struct FollowingSection: View {
    @EnvironmentObject var auth: AuthViewModel
    @State private var rows: [FollowingSheetDisplay] = []
    @State private var loaded = false
    @State private var loading = false
    private let client = SupabaseManager.shared.client

    var body: some View {
        Section("Following") {
            if !loaded && loading {
                HStack {
                    Spacer()
                    ProgressView().controlSize(.small)
                    Spacer()
                }
            } else if rows.isEmpty {
                Text(auth.currentUser == nil
                     ? "Sign in to follow stories."
                     : "Tap Follow on any story to track it here.")
                    .font(.system(.subheadline))
                    .foregroundColor(VP.dim)
            } else {
                ForEach(rows) { row in
                    if let story = row.latestStory {
                        NavigationLink(destination: StoryDetailView(story: story)) {
                            HStack(spacing: 8) {
                                Circle()
                                    .fill(row.unread ? VP.accent : Color.clear)
                                    .frame(width: 7, height: 7)
                                Text(row.title)
                                    .font(.system(.subheadline, weight: row.unread ? .bold : .semibold))
                                    .foregroundColor(VP.text)
                                    .lineLimit(2)
                            }
                        }
                        .simultaneousGesture(
                            TapGesture().onEnded { Task { await markSeen(row.storyId) } }
                        )
                    } else {
                        HStack(spacing: 8) {
                            Circle()
                                .fill(row.unread ? VP.accent : Color.clear)
                                .frame(width: 7, height: 7)
                            Text(row.title)
                                .font(.system(.subheadline, weight: .medium))
                                .foregroundColor(VP.dim)
                                .lineLimit(2)
                        }
                    }
                }
            }
        }
        .task {
            guard !loaded, auth.currentUser != nil else {
                loaded = true
                return
            }
            await load()
        }
    }

    private func load() async {
        loading = true
        defer { loading = false; loaded = true }
        guard let userId = auth.currentUser?.id else { return }
        do {
            let follows: [FollowingSheetRow] = try await client
                .from("story_follows")
                .select("story_id, last_seen_at, stories(id, slug, title, published_at)")
                .eq("user_id", value: userId)
                .order("followed_at", ascending: false)
                .execute()
                .value
            let storyIds = follows.compactMap { $0.stories?.id }
            guard !storyIds.isEmpty else { rows = []; return }
            let articles: [FollowingSheetLatest] = try await client
                .from("articles")
                .select("id, title, story_id, published_at")
                .in("story_id", values: storyIds)
                .eq("status", value: "published")
                .not("published_at", operator: .is, value: "null")
                .is("deleted_at", value: nil)
                .order("published_at", ascending: false)
                .limit(storyIds.count * 5)
                .execute()
                .value
            var latestByStory: [String: FollowingSheetLatest] = [:]
            for a in articles {
                if latestByStory[a.storyId] == nil { latestByStory[a.storyId] = a }
            }
            rows = follows.compactMap { f -> FollowingSheetDisplay? in
                guard let s = f.stories else { return nil }
                let latest = latestByStory[s.id]
                let unread: Bool = {
                    guard let pub = latest?.publishedAt else { return false }
                    guard let seen = f.lastSeenAt else { return true }
                    return pub > seen
                }()
                let storyRef = latest.map { la in
                    Story(
                        id: la.id,
                        storyId: s.id,
                        stories: s.slug.map { StorySlugRef(slug: $0) },
                        title: s.title,
                        summary: nil,
                        content: nil,
                        imageUrl: nil,
                        categoryId: nil,
                        subcategoryId: nil,
                        status: nil,
                        isBreaking: nil,
                        isDeveloping: nil,
                        publishedAt: la.publishedAt,
                        createdAt: nil,
                        heroPickForDate: nil
                    )
                }
                return FollowingSheetDisplay(
                    storyId: s.id,
                    title: s.title,
                    unread: unread,
                    latestStory: storyRef
                )
            }
        } catch {
            rows = []
        }
    }

    private func markSeen(_ storyId: String) async {
        await MainActor.run {
            rows = rows.map { r in
                guard r.storyId == storyId else { return r }
                return FollowingSheetDisplay(
                    storyId: r.storyId,
                    title: r.title,
                    unread: false,
                    latestStory: r.latestStory
                )
            }
        }
        try? await client
            .rpc("mark_story_seen", params: ["p_story_id": storyId])
            .execute()
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
                                Text(ex).font(.caption).foregroundColor(VP.dim)
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
