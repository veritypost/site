import SwiftUI
import UIKit

/// Pane 3 of the Browse tab — articles in a (category, optional subcategory)
/// scope, sorted by Latest or Trending.
///
/// Article rows are fetched directly via PostgREST so iOS doesn't pay the
/// extra hop through the web API for a list call. Editor's Edge + expert
/// coverage go through `/api/directory/*` because those endpoints carry
/// permission gates and (for expert-coverage) a 403 path that PostgREST
/// can't model cleanly.
///
/// Pull-to-refresh refetches both the article list and the Editor's Edge
/// hero. Swipe-left exposes the Follow Story action — wired into the same
/// `/api/story-follows` endpoint StoryDetailView uses, so iOS + web stay
/// in sync.
struct BrowseArticlesView: View {
    @EnvironmentObject var auth: AuthViewModel
    @ObservedObject private var perms = PermissionStore.shared

    let category: VPCategory
    let subcategory: VPCategory?
    @State var sort: BrowseSort

    @State private var articles: [Story] = []
    @State private var editorsEdge: EditorsEdgePick? = nil
    @State private var isLoading: Bool = true
    @State private var error: String? = nil
    @State private var canExpertDepth: Bool = false
    @State private var canTrendingSort: Bool = false

    @State private var followBusyStoryIds: Set<String> = []
    @State private var followedStoryIds: Set<String> = []

    @State private var expertSheetStory: Story? = nil
    @State private var expertCoverage: ExpertCoverageResponse? = nil
    @State private var expertSheetLoading: Bool = false

    @State private var showExpertUpsell: Bool = false

    private let client = SupabaseManager.shared.client

    init(category: VPCategory, subcategory: VPCategory?, sort: BrowseSort) {
        self.category = category
        self.subcategory = subcategory
        self._sort = State(initialValue: sort)
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                if let edge = editorsEdge {
                    editorsEdgeHero(edge)
                    Divider()
                        .background(VP.border)
                        .padding(.bottom, 4)
                }
                if isLoading {
                    loadingRows
                } else if let err = error {
                    errorView(err)
                } else if articles.isEmpty {
                    emptyView
                } else {
                    articleList
                }
            }
        }
        .background(VP.bg)
        .navigationTitle(subcategory?.name ?? category.name)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            await loadArticles(force: true)
            await loadEditorsEdge()
        }
        .task(id: perms.changeToken) { await refreshPermissions() }
        .task { await initialLoad() }
        .onChange(of: sort) { _, _ in
            Task { await loadArticles(force: true) }
        }
        .sheet(item: $expertSheetStory) { story in
            expertSheet(for: story)
                .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showExpertUpsell) {
            expertUpsellSheet
                .presentationDetents([.medium])
        }
    }

    // MARK: - Article list

    private var articleList: some View {
        ForEach(articles) { story in
            NavigationLink {
                StoryDetailView(story: story)
                    .environmentObject(auth)
            } label: {
                BrowseArticleRow(
                    story: story,
                    decor: nil,
                    categoryName: subcategory?.name ?? category.name,
                    showExpertDepthOnTap: canExpertDepth,
                    onTapExperts: nil
                )
            }
            .buttonStyle(.plain)
            .simultaneousGesture(TapGesture().onEnded {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            })
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button {
                    Task { await toggleFollow(story: story) }
                } label: {
                    let isFollowing = story.storyId.map { followedStoryIds.contains($0) } ?? false
                    Label(
                        isFollowing ? "Unfollow" : "Follow",
                        systemImage: isFollowing ? "bell.slash" : "bell"
                    )
                }
                .tint(VP.brand)
                .disabled(story.storyId.map { followBusyStoryIds.contains($0) } ?? false)
            }
            Divider().background(VP.border)
        }
    }

    private var loadingRows: some View {
        VStack(spacing: 14) {
            ForEach(0..<4, id: \.self) { _ in
                VStack(alignment: .leading, spacing: 6) {
                    SkeletonBar(width: 120, height: 10)
                    SkeletonBar(height: 16)
                    SkeletonBar(width: 240, height: 12)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
        }
        .padding(.top, 16)
    }

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .foregroundColor(VP.danger)
            Text(msg)
                .font(.footnote)
                .foregroundColor(VP.dim)
            Button("Try again") {
                Task { await loadArticles(force: true) }
            }
            .font(.system(.footnote, weight: .semibold))
            .foregroundColor(VP.accent)
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }

    private var emptyView: some View {
        VStack(spacing: 10) {
            Text("No articles in \u{201C}\(subcategory?.name ?? category.name)\u{201D} yet.")
                .font(.footnote)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
        }
        .padding(.vertical, 60)
        .frame(maxWidth: .infinity)
    }

    // MARK: - Editor's Edge hero

    private func editorsEdgeHero(_ edge: EditorsEdgePick) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text((edge.edgeLabel ?? "Editor\u{2019}s Edge").uppercased())
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .tracking(1.4)
                .foregroundColor(VP.breaking)
            Text(edge.title ?? "Untitled")
                .font(.system(size: 22, weight: .semibold, design: .serif))
                .tracking(-0.3)
                .foregroundColor(VP.text)
                .lineLimit(3)
            if let excerpt = edge.excerpt, !excerpt.isEmpty {
                Text(excerpt)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundColor(VP.muted)
                    .lineSpacing(2)
                    .lineLimit(2)
            }
            HStack(spacing: 6) {
                if let publisher = edge.sourceName, !publisher.isEmpty {
                    Text(publisher.uppercased())
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .tracking(1.1)
                        .foregroundColor(VP.muted)
                }
                if let r = edge.readingTimeMinutes, r > 0 {
                    Text("\u{00B7}")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundColor(VP.muted)
                    Text("\(r)M READ")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .tracking(1.1)
                        .foregroundColor(VP.muted)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 18)
        .background(VP.brandSoft)
    }

    // MARK: - Expert sheets

    @ViewBuilder
    private func expertSheet(for story: Story) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Expert coverage")
                .font(.system(size: 20, weight: .semibold, design: .serif))
                .foregroundColor(VP.text)
                .padding(.top, 8)
            if expertSheetLoading {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 40)
            } else if let coverage = expertCoverage, !coverage.experts.isEmpty {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(coverage.experts) { expert in
                            HStack(spacing: 12) {
                                Circle()
                                    .fill(VP.brandSoft)
                                    .frame(width: 36, height: 36)
                                    .overlay(
                                        Text(String((expert.displayName ?? "?").prefix(1)))
                                            .font(.system(size: 14, weight: .semibold))
                                            .foregroundColor(VP.brand)
                                    )
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(expert.displayName ?? "Expert")
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundColor(VP.text)
                                    if let t = expert.expertTitle, !t.isEmpty {
                                        Text(t)
                                            .font(.system(size: 12, weight: .regular))
                                            .foregroundColor(VP.dim)
                                            .lineLimit(2)
                                    }
                                }
                                Spacer(minLength: 0)
                            }
                        }
                    }
                }
                Button {
                    Task { await toggleFollow(story: story) }
                    expertSheetStory = nil
                } label: {
                    Text("Follow this story")
                        .font(.system(.footnote, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(VP.brand)
                        .cornerRadius(8)
                }
                .buttonStyle(.plain)
            } else {
                Text("No expert coverage yet.")
                    .font(.footnote)
                    .foregroundColor(VP.dim)
                    .padding(.vertical, 24)
            }
            Spacer()
        }
        .padding(.horizontal, 20)
    }

    private var expertUpsellSheet: some View {
        VStack(spacing: 18) {
            Spacer().frame(height: 12)
            Image(systemName: "person.2.crop.square.stack")
                .font(.system(size: 32, weight: .semibold))
                .foregroundColor(VP.brand)
            Text("Expert coverage is a Verity feature")
                .font(.system(size: 19, weight: .semibold, design: .serif))
                .foregroundColor(VP.text)
                .multilineTextAlignment(.center)
            Text("See which subject-matter experts are following a story and follow them in one tap.")
                .font(.footnote)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 28)
            Button {
                showExpertUpsell = false
            } label: {
                Text("Maybe later")
                    .font(.system(.footnote, weight: .medium))
                    .foregroundColor(VP.dim)
            }
            Spacer()
        }
        .padding(.top, 28)
    }

    // MARK: - Networking

    private func initialLoad() async {
        await loadArticles(force: false)
        await loadEditorsEdge()
    }

    private func loadArticles(force: Bool) async {
        if !force && !articles.isEmpty { return }
        await MainActor.run {
            isLoading = true
            error = nil
        }
        do {
            // PostgREST direct fetch. The web API would apply a silent
            // sort-degrade on trending when the user lacks the perm; we
            // pre-snap to .recent client-side in BrowseSubcategoriesView
            // for the same reason, but defend here in case the user
            // landed via deep link with a stale sort.
            let effectiveSort: BrowseSort = (sort == .trending && !canTrendingSort) ? .recent : sort

            var query = client
                .from("articles")
                .select("*, stories(slug)")
                .eq("status", value: "published")
                .eq("category_id", value: category.id)
                .eq("is_kids_safe", value: false)
                .is("deleted_at", value: nil)
            if let sub = subcategory {
                query = query.eq("subcategory_id", value: sub.id)
            }

            let rows: [Story]
            switch effectiveSort {
            case .recent:
                rows = try await query
                    .order("published_at", ascending: false)
                    .limit(30)
                    .execute()
                    .value
            case .trending:
                // Trending = last-7-days view_count DESC. We can't easily
                // filter "last 7 days" on PostgREST without computing a
                // timestamp client-side; published_at >= now-7d gives a
                // pragmatic approximation and stays consistent with the
                // web's window. published_at fallback keeps newer ties stable.
                let cutoff = ISO8601DateFormatter().string(
                    from: Date().addingTimeInterval(-7 * 24 * 60 * 60)
                )
                rows = try await query
                    .gte("published_at", value: cutoff)
                    .order("view_count", ascending: false)
                    .order("published_at", ascending: false)
                    .limit(30)
                    .execute()
                    .value
            }

            await MainActor.run {
                articles = rows
                isLoading = false
            }
            await loadFollowState(rows: rows)
        } catch {
            Log.d("BrowseArticlesView load failed:", error)
            await MainActor.run {
                self.error = "Couldn\u{2019}t load articles."
                isLoading = false
            }
        }
    }

    private func loadEditorsEdge() async {
        let site = SupabaseManager.shared.siteURL
        var comps = URLComponents(
            url: site.appendingPathComponent("api/directory/editors-edge"),
            resolvingAgainstBaseURL: false
        )
        var qi: [URLQueryItem] = []
        if let s = category.slug { qi.append(URLQueryItem(name: "category", value: s)) }
        if let sub = subcategory, let s = sub.slug {
            qi.append(URLQueryItem(name: "sub", value: s))
        }
        comps?.queryItems = qi
        guard let url = comps?.url else { return }
        do {
            var req = URLRequest(url: url)
            if let session = try? await client.auth.session {
                req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            }
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse else { return }
            if http.statusCode == 404 {
                await MainActor.run { editorsEdge = nil }
                return
            }
            guard http.statusCode == 200 else { return }
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let decoded = try decoder.decode(EditorsEdgeResponse.self, from: data)
            await MainActor.run { editorsEdge = decoded.pick }
        } catch {
            // Silent — hero is optional.
            Log.d("editors-edge fetch failed:", error)
        }
    }

    private func loadFollowState(rows: [Story]) async {
        let storyIds = rows.compactMap { $0.storyId }
        guard !storyIds.isEmpty, (try? await client.auth.session) != nil else { return }
        do {
            struct FollowRow: Decodable { let story_id: String }
            let follows: [FollowRow] = try await client
                .from("story_follows")
                .select("story_id")
                .in("story_id", values: storyIds)
                .execute()
                .value
            await MainActor.run {
                followedStoryIds = Set(follows.map { $0.story_id })
            }
        } catch {
            // Silent — follow indicator just doesn't render.
        }
    }

    // MARK: - Follow action

    private func toggleFollow(story: Story) async {
        guard let storyId = story.storyId else { return }
        guard let session = try? await client.auth.session else {
            // Anon path — story follow opens the registration sheet on
            // web; iOS doesn't have a top-level sheet wired here, so the
            // tap drops silently for now. Re-route via auth.signInRequested
            // if a future session wires it. See LockedDecisions / no-save.
            return
        }
        await MainActor.run {
            _ = followBusyStoryIds.insert(storyId)
            if followedStoryIds.contains(storyId) {
                followedStoryIds.remove(storyId)
            } else {
                followedStoryIds.insert(storyId)
            }
        }
        defer {
            Task { @MainActor in followBusyStoryIds.remove(storyId) }
        }
        let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/story-follows")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["story_id": storyId])
        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                await MainActor.run {
                    // Revert optimistic flip.
                    if followedStoryIds.contains(storyId) {
                        followedStoryIds.remove(storyId)
                    } else {
                        followedStoryIds.insert(storyId)
                    }
                }
                return
            }
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let following = json["following"] as? Bool {
                await MainActor.run {
                    if following {
                        followedStoryIds.insert(storyId)
                    } else {
                        followedStoryIds.remove(storyId)
                    }
                }
            }
        } catch {
            await MainActor.run {
                if followedStoryIds.contains(storyId) {
                    followedStoryIds.remove(storyId)
                } else {
                    followedStoryIds.insert(storyId)
                }
            }
        }
    }

    // MARK: - Permissions

    private func refreshPermissions() async {
        async let trendingTask = PermissionService.shared.has("directory.sort_trending")
        async let expertTask = PermissionService.shared.has("directory.expert_depth")
        let (trending, expert) = await (trendingTask, expertTask)
        await MainActor.run {
            canTrendingSort = trending
            canExpertDepth = expert
            if !trending && sort == .trending {
                sort = .recent
            }
        }
    }
}
