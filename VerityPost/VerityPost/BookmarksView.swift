import SwiftUI
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified bookmarks 2026-04-18

/// Bookmarks list — mirrors site/src/app/bookmarks/page.js.
/// Free: 10-cap, flat list. Verity+: unlimited + collections + notes.
struct BookmarksView: View {
    @EnvironmentObject var auth: AuthViewModel
    @StateObject private var perms = PermissionStore.shared
    private let client = SupabaseManager.shared.client

    @State private var items: [BookmarkItem] = []
    @State private var loading = true
    @State private var activeCollection: String = "all"
    @State private var collections: [String] = []
    @State private var navigatedStory: Story? = nil
    @State private var errorText: String? = nil
    @State private var hasUnlimitedBookmarks: Bool = false
    @State private var hasCollections: Bool = false

    private var isFreeTier: Bool { !hasUnlimitedBookmarks }

    private var atCap: Bool { isFreeTier && items.count >= 10 }
    // T-088: proactive cap counter — visible at 50%+ of the 10-bookmark free cap.
    // Tone escalates: neutral (5-6), amber (7-8), danger (9+).
    private var nearCap: Bool { isFreeTier && items.count >= 5 }
    private var capToneColor: Color {
        if items.count >= 9 { return Color(hex: "dc2626") }
        if items.count >= 7 { return Color(hex: "b45309") }
        return VP.dim
    }

    private var filtered: [BookmarkItem] {
        if activeCollection == "all" { return items }
        if activeCollection == "uncategorised" { return items.filter { ($0.collectionName ?? "").isEmpty } }
        return items.filter { ($0.collectionName ?? "") == activeCollection }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                headerRow
                    .padding(.horizontal, 16)
                    .padding(.top, 20)
                    .padding(.bottom, 16)

                if atCap {
                    banner(
                        tone: .warn,
                        title: "You\u{2019}ve hit the free bookmark cap.",
                        body: "Unlimited bookmarks, collections, notes, and export are available on paid plans."
                    )
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
                }

                if let err = errorText {
                    banner(tone: .danger, title: "Problem", body: err)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 12)
                }

                if hasCollections && !collections.isEmpty {
                    collectionPills
                        .padding(.bottom, 12)
                }

                if loading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 40)
                } else if filtered.isEmpty {
                    emptyState
                } else {
                    LazyVStack(spacing: 8) {
                        ForEach(filtered) { b in
                            bookmarkCard(b)
                        }
                    }
                    .padding(.horizontal, 16)
                }

                Spacer().frame(height: 80)
            }
        }
        .background(VP.bg.ignoresSafeArea())
        .navigationTitle("Bookmarks")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: auth.currentUser?.id) { await load() }
        .task(id: perms.changeToken) {
            hasUnlimitedBookmarks = await PermissionService.shared.has("bookmarks.unlimited")
            hasCollections = await PermissionService.shared.has("bookmarks.collection.create")
        }
        .navigationDestination(item: $navigatedStory) { story in
            StoryDetailView(story: story).environmentObject(auth)
        }
    }

    // MARK: - Header

    private var headerRow: some View {
        // T-088: VStack wraps the title row so the proactive cap counter appears
        // as a small caption line below when the user is at 50%+ capacity.
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline) {
                let counter = isFreeTier ? "\(items.count) of 10" : "\(items.count)"
                Text("Saved articles · \(counter)")
                    .font(.system(.title3, design: .default, weight: .bold))
                    .foregroundColor(VP.text)
                Spacer()
            }
            if nearCap {
                Text("\(items.count) / 10 free bookmarks")
                    .font(.system(.caption2, design: .default, weight: .semibold))
                    .foregroundColor(capToneColor)
            }
        }
    }

    // MARK: - Collection pills (paid only)

    private var collectionPills: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                pill("All (\(items.count))", active: activeCollection == "all") { activeCollection = "all" }
                pill("Uncategorised", active: activeCollection == "uncategorised") { activeCollection = "uncategorised" }
                ForEach(collections, id: \.self) { name in
                    pill(name, active: activeCollection == name) { activeCollection = name }
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private func pill(_ label: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(.footnote, design: .default, weight: .semibold))
                .foregroundColor(active ? .white : VP.dim)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(active ? VP.accent : VP.card)
                .overlay(
                    RoundedRectangle(cornerRadius: 99)
                        .stroke(active ? Color.clear : VP.border)
                )
                .clipShape(RoundedRectangle(cornerRadius: 99))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Card

    private func bookmarkCard(_ b: BookmarkItem) -> some View {
        Button {
            Task {
                if let slug = b.articles?.slug, let s = await fetchStoryBySlug(slug) {
                    navigatedStory = s
                }
            }
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                Text(b.articles?.title ?? "Untitled")
                    .font(.system(.callout, design: .default, weight: .semibold))
                    .foregroundColor(VP.text)
                    .lineSpacing(2)
                    .multilineTextAlignment(.leading)

                HStack(spacing: 8) {
                    if let cat = b.articles?.categories?.displayName, !cat.isEmpty {
                        Text(cat)
                            .font(.system(.caption, design: .default, weight: .semibold))
                            .foregroundColor(VP.text)
                    }
                    if let date = b.createdAt {
                        Text("Saved \(shortDate(date))")
                            .font(.caption)
                            .foregroundColor(VP.dim)
                    }
                    Spacer()
                    Button {
                        Task { await removeBookmark(b) }
                    } label: {
                        Text("Remove")
                            .font(.system(.caption, design: .default, weight: .semibold))
                            .foregroundColor(VP.danger)
                    }
                    .buttonStyle(.plain)
                }

                if hasUnlimitedBookmarks, let notes = b.notes, !notes.isEmpty {
                    Text(notes)
                        .font(.caption)
                        .foregroundColor(VP.soft)
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.white)
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(VP.border))
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(VP.card)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
            .cornerRadius(10)
        }
        .buttonStyle(.plain)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Text("No saved articles here")
                .font(.system(.callout, design: .default, weight: .semibold))
                .foregroundColor(VP.text)
            Button {
                // Would navigate back to home; tab bar handles the actual swap.
            } label: {
                Text("Browse articles")
                    .font(.system(.footnote, design: .default, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .frame(minHeight: 44)
                    .background(VP.accent)
                    .cornerRadius(10)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    // MARK: - Banner

    private enum BannerTone { case warn, danger }

    private func banner(tone: BannerTone, title: String, body: String) -> some View {
        let (bg, border, color): (Color, Color, Color) = {
            switch tone {
            case .warn: return (Color(hex: "fffbeb"), Color(hex: "fde68a"), Color(hex: "b45309"))
            case .danger: return (Color(hex: "fef2f2"), Color(hex: "fca5a5"), Color(hex: "dc2626"))
            }
        }()
        return VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(.footnote, design: .default, weight: .bold))
                .foregroundColor(color)
            Text(body)
                .font(.caption)
                .foregroundColor(VP.dim)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(bg)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(border))
        .cornerRadius(10)
    }

    // MARK: - Data

    private func load() async {
        guard let userId = auth.currentUser?.id else { loading = false; return }
        loading = true
        defer { loading = false }
        do {
            let rows: [BookmarkItem] = try await client.from("bookmarks")
                .select("id, notes, collection_id, collection_name, created_at, articles(id, title, slug, excerpt, published_at, categories(name))")
                .eq("user_id", value: userId)
                .order("created_at", ascending: false)
                .limit(200)
                .execute().value
            items = rows
            let names = Set(rows.compactMap { $0.collectionName }.filter { !$0.isEmpty })
            collections = Array(names).sorted()
        } catch {
            errorText = "Couldn\u{2019}t load bookmarks."
        }
    }

    private func removeBookmark(_ b: BookmarkItem) async {
        let original = items.firstIndex(where: { $0.id == b.id })
        if let i = original { items.remove(at: i) }
        guard let session = try? await client.auth.session else {
            if let i = original, i <= items.count { items.insert(b, at: i) }
            errorText = "Please sign in."
            return
        }
        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/bookmarks/\(b.id)", relativeTo: site) else {
            if let i = original, i <= items.count { items.insert(b, at: i) }
            errorText = "Couldn\u{2019}t remove."
            return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        do {
            let (_, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                if let i = original, i <= items.count { items.insert(b, at: i) }
                errorText = "Couldn\u{2019}t remove."
                return
            }
        } catch {
            if let i = original, i <= items.count { items.insert(b, at: i) }
            errorText = "Couldn\u{2019}t remove."
        }
    }

    private func fetchStoryBySlug(_ slug: String) async -> Story? {
        do {
            let rows: [Story] = try await client.from("articles")
                .select()
                .eq("slug", value: slug)
                .limit(1)
                .execute().value
            return rows.first
        } catch { return nil }
    }

    private func shortDate(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateStyle = .short
        return f.string(from: d)
    }
}

// MARK: - Models (kept here to mirror the site's bookmark card shape)

struct BookmarkItem: Codable, Identifiable {
    let id: String
    var collectionId: String?
    var collectionName: String?
    var notes: String?
    var createdAt: Date?
    var articles: BookmarkStory?

    enum CodingKeys: String, CodingKey {
        case id, articles, notes
        case collectionId = "collection_id"
        case collectionName = "collection_name"
        case createdAt = "created_at"
    }
}

struct BookmarkStory: Codable {
    var id: String?
    var title: String?
    var slug: String?
    var excerpt: String?
    var publishedAt: Date?
    var categories: BookmarkCategory?

    enum CodingKeys: String, CodingKey {
        case id, title, slug, excerpt, categories
        case publishedAt = "published_at"
    }
}

struct BookmarkCategory: Codable {
    var name: String?

    /// Same strip-the-"Kids" rule as VPCategory.displayName.
    var displayName: String? {
        guard var s = name else { return nil }
        s = s.replacingOccurrences(of: #"\s*\((?i:kids?)\)\s*$"#, with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: #"\s+(?i:kids?)\s*$"#, with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: #"^(?i:kids?)\s+"#, with: "", options: .regularExpression)
        return s.trimmingCharacters(in: .whitespaces)
    }
}
