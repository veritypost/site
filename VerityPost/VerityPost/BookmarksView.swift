import SwiftUI
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified bookmarks 2026-04-18

/// Bookmarks list — mirrors site/src/app/bookmarks/page.js.
/// Free: 10-cap, flat list. Verity+: unlimited + collections + notes.
struct BookmarksView: View {
    @EnvironmentObject var auth: AuthViewModel
    @ObservedObject private var perms = PermissionStore.shared
    private let client = SupabaseManager.shared.client

    @State private var items: [BookmarkItem] = []
    @State private var loading = true
    @State private var activeCollection: String = "all"
    @State private var collections: [String] = []
    @State private var navigatedStory: Story? = nil
    @State private var errorText: String? = nil
    @State private var hasUnlimitedBookmarks: Bool = false
    @State private var hasCollections: Bool = false
    /// A119 — pagination state. The list page shows up to `pageSize`
    /// rows; if the server returns a full page we offer "Load more"
    /// which appends the next page using created_at as the cursor.
    @State private var loadingMore: Bool = false
    @State private var canLoadMore: Bool = false
    private static let pageSize = 50
    /// A121 — pending undo state. After a Remove tap, the row is removed
    /// from the visible list optimistically and a 5-second undo banner
    /// appears at the bottom. The actual server DELETE is queued via
    /// `pendingDeleteTask`; tapping Undo cancels the task and restores
    /// the row.
    @State private var pendingDelete: BookmarkItem?
    @State private var pendingDeleteOriginalIndex: Int?
    @State private var pendingDeleteTask: Task<Void, Never>?
    /// A120 — confirmation-dialog target. Set when the user taps Remove,
    /// cleared when they confirm or cancel.
    @State private var confirmRemoveTarget: BookmarkItem?

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
                        if canLoadMore {
                            Button {
                                Task { await loadMore() }
                            } label: {
                                if loadingMore {
                                    ProgressView()
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 12)
                                } else {
                                    Text("Load more")
                                        .font(.system(.footnote, design: .default, weight: .semibold))
                                        .foregroundColor(VP.accent)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 12)
                                }
                            }
                            .disabled(loadingMore)
                            .buttonStyle(.plain)
                            .padding(.top, 4)
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
        .task(id: auth.currentUser?.id) { await subscribeToBookmarkChanges() }
        .task(id: perms.changeToken) {
            hasUnlimitedBookmarks = await PermissionService.shared.has("bookmarks.unlimited")
            hasCollections = await PermissionService.shared.has("bookmarks.collection.create")
        }
        .navigationDestination(item: $navigatedStory) { story in
            StoryDetailView(story: story).environmentObject(auth)
        }
        // A120 — confirmation prompt. Native dialog matches platform
        // expectations and avoids a custom alert sheet.
        .confirmationDialog(
            "Remove this bookmark?",
            isPresented: confirmRemoveBinding,
            titleVisibility: .visible,
            presenting: confirmRemoveTarget
        ) { target in
            Button("Remove", role: .destructive) {
                queueOptimisticRemove(target)
                confirmRemoveTarget = nil
            }
            Button("Cancel", role: .cancel) {
                confirmRemoveTarget = nil
            }
        } message: { target in
            if let title = target.articles?.title, !title.isEmpty {
                Text(title)
            } else {
                Text("You'll have 5 seconds to undo.")
            }
        }
        .overlay(alignment: .bottom) {
            if let pending = pendingDelete {
                undoBanner(for: pending)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .padding(.bottom, 16)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: pendingDelete?.id)
    }

    /// A120 — binding adapter so `.confirmationDialog(isPresented:)` can
    /// flip false on the dialog's own dismiss path while still using
    /// `confirmRemoveTarget` as the source of truth.
    private var confirmRemoveBinding: Binding<Bool> {
        Binding(
            get: { confirmRemoveTarget != nil },
            set: { newValue in
                if !newValue { confirmRemoveTarget = nil }
            }
        )
    }

    // MARK: - A121 — optimistic remove + 5s undo

    private func queueOptimisticRemove(_ target: BookmarkItem) {
        // Cancel any prior pending delete first so two fast removes
        // don't stack overlapping banners; commit the prior one
        // immediately to honour the prior intent.
        if let prior = pendingDelete {
            pendingDeleteTask?.cancel()
            Task { await commitRemove(prior) }
        }
        guard let idx = items.firstIndex(where: { $0.id == target.id }) else { return }
        pendingDelete = target
        pendingDeleteOriginalIndex = idx
        items.remove(at: idx)
        pendingDeleteTask = Task {
            // SwiftUI View is a struct — `[weak self]` is invalid. The
            // closure captures the View by value; @State is reference-
            // backed under the hood, so writes still hit the live store.
            try? await Task.sleep(nanoseconds: 5 * 1_000_000_000)
            guard !Task.isCancelled else { return }
            await commitRemove(target)
            await MainActor.run {
                if pendingDelete?.id == target.id {
                    pendingDelete = nil
                    pendingDeleteOriginalIndex = nil
                    pendingDeleteTask = nil
                }
            }
        }
    }

    private func undo() {
        pendingDeleteTask?.cancel()
        pendingDeleteTask = nil
        if let pending = pendingDelete {
            let idx = pendingDeleteOriginalIndex ?? 0
            let safeIdx = min(max(0, idx), items.count)
            items.insert(pending, at: safeIdx)
        }
        pendingDelete = nil
        pendingDeleteOriginalIndex = nil
    }

    private func commitRemove(_ b: BookmarkItem) async {
        guard let session = try? await client.auth.session else {
            // Restore on auth-loss so the user doesn't lose the row
            // silently — the optimistic UI already removed it locally.
            await MainActor.run {
                if pendingDelete?.id == b.id {
                    let idx = pendingDeleteOriginalIndex ?? 0
                    let safeIdx = min(max(0, idx), items.count)
                    items.insert(b, at: safeIdx)
                    pendingDelete = nil
                    pendingDeleteOriginalIndex = nil
                    errorText = "Sign in to manage your bookmarks."
                }
            }
            return
        }
        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/bookmarks/\(b.id)", relativeTo: site) else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        do {
            let (_, response) = try await URLSession.shared.data(for: req)
            if let http = response as? HTTPURLResponse, http.statusCode != 200 {
                Log.d("[Bookmarks] DELETE non-200:", http.statusCode)
            }
        } catch {
            Log.d("[Bookmarks] DELETE failed:", error)
        }
    }

    @ViewBuilder
    private func undoBanner(for pending: BookmarkItem) -> some View {
        HStack(spacing: 12) {
            Text("Removed")
                .font(.system(.footnote, design: .default, weight: .semibold))
                .foregroundColor(.white)
            if let title = pending.articles?.title, !title.isEmpty {
                Text(title)
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.85))
                    .lineLimit(1)
            }
            Spacer()
            Button("Undo") { undo() }
                .font(.system(.footnote, design: .default, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .frame(minHeight: 36)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(VP.text)
        .cornerRadius(10)
        .padding(.horizontal, 20)
    }

    // MARK: - Realtime
    // A77 — listen for INSERT and DELETE on `bookmarks` filtered by the
    // current user's id. INSERT (e.g., a parallel web tab saved one)
    // triggers a re-load to pick up the joined article + categories
    // shape. DELETE (web-side undo, admin purge) drops the row from the
    // local list immediately so the count + cap-state stay in sync.
    //
    // Both Action types are registered on one channel, then we drain
    // each stream concurrently. The channel is subscribed once
    // (drainRealtimeChannel for the inserts handles it); the deletes
    // loop drains in parallel and the second drainRealtimeChannel call
    // for cleanup is gated to only fire unsubscribe once via the
    // outer cancellation handler.
    private func subscribeToBookmarkChanges() async {
        guard let userId = auth.currentUser?.id else { return }
        let channelName = "bookmarks-\(userId)-\(Int(Date().timeIntervalSince1970))"
        let channel = client.channel(channelName)
        let inserts = channel.postgresChange(
            InsertAction.self,
            schema: "public",
            table: "bookmarks",
            filter: "user_id=eq.\(userId)"
        )
        let deletes = channel.postgresChange(
            DeleteAction.self,
            schema: "public",
            table: "bookmarks",
            filter: "user_id=eq.\(userId)"
        )
        await channel.subscribe()
        await withTaskCancellationHandler {
            await withTaskGroup(of: Void.self) { group in
                group.addTask { @MainActor in
                    for await change in inserts {
                        guard case let .string(newId) = change.record["id"] else { continue }
                        if items.contains(where: { $0.id == newId }) { continue }
                        // Fetch the joined shape — postgres_changes only
                        // carries bare columns, not the categories(name)
                        // join the list relies on.
                        await load()
                    }
                }
                group.addTask { @MainActor in
                    for await change in deletes {
                        // DeleteAction record carries the OLD row's id
                        // under .oldRecord.
                        guard case let .string(deletedId) = change.oldRecord["id"] else { continue }
                        items.removeAll { $0.id == deletedId }
                    }
                }
                await group.waitForAll()
            }
            Task.detached { @Sendable in
                await channel.unsubscribe()
            }
        } onCancel: {
            Task.detached { @Sendable in
                await channel.unsubscribe()
            }
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
                    Button(role: .destructive) {
                        // A120 — confirmation prompt before remove. A121 —
                        // optimistic remove + 5s undo banner; server DELETE
                        // is queued so an Undo tap cancels it cleanly.
                        confirmRemoveTarget = b
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
                // T66 — request a tab swap to Home. ContentView observes
                // `auth.pendingHomeJump` and applies the switch + clears
                // the flag (also pops this view's NavigationStack as a
                // side effect of the parent re-render).
                auth.pendingHomeJump = true
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
            // A119 — first page. `limit(pageSize + 1)` is the standard
            // "is there a next page?" probe — if we got back exactly
            // pageSize+1 rows, the (pageSize+1)th is dropped from the
            // visible list and `canLoadMore` flips true.
            let rows: [BookmarkItem] = try await client.from("bookmarks")
                .select("id, notes, collection_id, collection_name, created_at, articles(id, title, slug, excerpt, published_at, categories(name))")
                .eq("user_id", value: userId)
                .order("created_at", ascending: false)
                .limit(BookmarksView.pageSize + 1)
                .execute().value
            if rows.count > BookmarksView.pageSize {
                items = Array(rows.prefix(BookmarksView.pageSize))
                canLoadMore = true
            } else {
                items = rows
                canLoadMore = false
            }
            let names = Set(items.compactMap { $0.collectionName }.filter { !$0.isEmpty })
            collections = Array(names).sorted()
        } catch {
            errorText = "Couldn\u{2019}t load bookmarks."
        }
    }

    /// A119 — append the next page. Uses the oldest current item's
    /// created_at as the cursor (`created_at < oldestCursor`) so the
    /// pagination stays stable even if a realtime INSERT lands between
    /// pulls. Probes pageSize+1 to know whether to keep the load-more
    /// affordance visible.
    private func loadMore() async {
        guard let userId = auth.currentUser?.id else { return }
        guard let cursor = items.compactMap({ $0.createdAt }).min() else { return }
        loadingMore = true
        defer { loadingMore = false }
        do {
            let cursorIso = ISO8601DateFormatter().string(from: cursor)
            let rows: [BookmarkItem] = try await client.from("bookmarks")
                .select("id, notes, collection_id, collection_name, created_at, articles(id, title, slug, excerpt, published_at, categories(name))")
                .eq("user_id", value: userId)
                .lt("created_at", value: cursorIso)
                .order("created_at", ascending: false)
                .limit(BookmarksView.pageSize + 1)
                .execute().value
            let appended: [BookmarkItem]
            if rows.count > BookmarksView.pageSize {
                appended = Array(rows.prefix(BookmarksView.pageSize))
                canLoadMore = true
            } else {
                appended = rows
                canLoadMore = false
            }
            // Dedupe by id in case realtime + page-fetch race.
            let known = Set(items.map { $0.id })
            items.append(contentsOf: appended.filter { !known.contains($0.id) })
            let names = Set(items.compactMap { $0.collectionName }.filter { !$0.isEmpty })
            collections = Array(names).sorted()
        } catch {
            errorText = "Couldn\u{2019}t load more bookmarks."
        }
    }

    // A120 + A121 — the prior immediate-remove `removeBookmark` was
    // replaced by `queueOptimisticRemove` (5s undo) → `commitRemove`
    // (server DELETE). The confirmation dialog gates the queue entry
    // point. The 5-second undo banner replaces the earlier on-success-or-
    // failure inline error revert.

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

    private static let bookmarkDateFmt: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .short
        return f
    }()

    private func shortDate(_ d: Date) -> String {
        return BookmarksView.bookmarkDateFmt.string(from: d)
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
