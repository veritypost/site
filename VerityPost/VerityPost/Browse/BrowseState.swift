import Foundation
import SwiftUI
import UIKit

/// Shared controller for the Browse tab's 3-pane horizontal slider on
/// iPhone. The iPad `NavigationSplitView` path reads the same state but
/// doesn't use `paneIndex` (the split-view chrome handles navigation).
///
/// Mirrors the web /directory mobile pattern: Categories → Subcategories →
/// Articles slide horizontally in a single mounted ScrollView. Tapping a
/// row animates `paneIndex` forward; the back bar decrements it. Article
/// taps still push StoryDetailView onto the surrounding NavigationStack —
/// that part is a real navigation, not part of the slider.
///
/// All async work (load categories, load subcategories, load articles +
/// editor's edge) lives here so panes stay presentational and the slider
/// doesn't re-fetch when SwiftUI re-renders.
@MainActor
final class BrowseState: ObservableObject {
    // MARK: - Pane index

    /// 0 = Categories, 1 = Subcategories, 2 = Articles. Drives the HStack
    /// offset in `BrowseView`. `.easeOut(duration: 0.3)` animation is
    /// applied at the view layer so this value can be mutated freely from
    /// async load paths without animation surprises.
    @Published var paneIndex: Int = 0

    // MARK: - Categories pane

    @Published var categories: [VPCategory] = []
    @Published var isLoadingCategories: Bool = true
    @Published var categoriesError: String? = nil

    // MARK: - Subcategories pane

    @Published var selectedCategory: VPCategory? = nil
    @Published var subcategories: [VPCategory] = []
    @Published var isLoadingSubcategories: Bool = false
    @Published var subcategoriesError: String? = nil

    // MARK: - Articles pane

    @Published var selectedSubcategory: VPCategory? = nil
    @Published var articles: [Story] = []
    @Published var editorsEdge: EditorsEdgePick? = nil
    @Published var isLoadingArticles: Bool = false
    @Published var articlesError: String? = nil

    // MARK: - Sort + permissions

    @Published var sort: BrowseSort = .recent
    @Published var canTrendingSort: Bool = false
    @Published var canExpertDepth: Bool = false

    // MARK: - Follow state (article rows)

    @Published var followBusyStoryIds: Set<String> = []
    @Published var followedStoryIds: Set<String> = []

    private let client = SupabaseManager.shared.client

    // MARK: - Public actions (called by panes)

    /// Load adult top-level categories. Idempotent — skipped when already
    /// populated and not forced.
    func loadCategoriesIfNeeded(force: Bool = false) async {
        if !force && !categories.isEmpty { return }
        isLoadingCategories = true
        categoriesError = nil
        do {
            let rows: [VPCategory] = try await client
                .from("categories")
                .select()
                .is("parent_id", value: nil)
                .eq("is_kids_safe", value: false)
                .is("deleted_at", value: nil)
                .not("slug", operator: .like, value: "kids-%")
                .order("sort_order")
                .order("name")
                .execute()
                .value
            categories = rows
            isLoadingCategories = false
        } catch {
            Log.d("BrowseState load categories failed:", error)
            categoriesError = "Couldn\u{2019}t load sections."
            isLoadingCategories = false
        }
    }

    /// User tapped a category in pane 1. Sets `selectedCategory`,
    /// optimistically advances to pane 2, kicks off the subcategory load.
    /// If the category turns out to be flat (no subcategories), advances
    /// straight to pane 3 + loads articles for the category-only scope.
    func selectCategory(_ cat: VPCategory) async {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        selectedCategory = cat
        selectedSubcategory = nil
        subcategories = []
        articles = []
        editorsEdge = nil
        paneIndex = 1
        await loadSubcategories(for: cat)
        // Flat category — no subcategories → auto-advance to pane 3 and
        // load category-only articles. Matches the web mobile flow.
        if subcategoriesError == nil && subcategories.isEmpty {
            await advanceToArticles(subcategory: nil)
        }
    }

    /// User tapped a subcategory (or the "All of <category>" row → nil).
    /// Loads articles + editor's edge and animates to pane 3.
    func selectSubcategory(_ sub: VPCategory?) async {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        await advanceToArticles(subcategory: sub)
    }

    /// Pane 3 sort pill flip. Locked taps surface the upsell upstream; the
    /// caller only passes a value when allowed (or when the user lacks the
    /// perm and we're snapping back to .recent defensively).
    func setSort(_ s: BrowseSort) async {
        if sort == s { return }
        sort = s
        await loadArticles(force: true)
    }

    /// Back-bar tap. paneIndex 2 → 1 if a subcategory was picked; 2 → 0
    /// when the category was flat (no subs); 1 → 0.
    func goBack() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        if paneIndex == 2 {
            if subcategories.isEmpty {
                // Flat-category fast path — pane 2 never showed anything
                // useful, so back jumps the whole way home.
                paneIndex = 0
                selectedCategory = nil
                selectedSubcategory = nil
            } else {
                paneIndex = 1
                selectedSubcategory = nil
            }
        } else if paneIndex == 1 {
            paneIndex = 0
            selectedCategory = nil
        }
    }

    /// Pull-to-refresh on the articles pane. Refetches both the list and
    /// the editor's edge hero.
    func refreshArticles() async {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        await loadArticles(force: true)
        await loadEditorsEdge()
    }

    /// Refresh both gates when PermissionStore changes (e.g. user upgrades
    /// to Verity in another tab). Snaps sort back to .recent if the user
    /// just lost the trending perm.
    func refreshPermissions() async {
        async let trendingTask = PermissionService.shared.has("directory.sort_trending")
        async let expertTask = PermissionService.shared.has("directory.expert_depth")
        let (trending, expert) = await (trendingTask, expertTask)
        canTrendingSort = trending
        canExpertDepth = expert
        if !trending && sort == .trending {
            sort = .recent
            // Re-fetch in degraded mode if we were already viewing articles.
            if !articles.isEmpty {
                await loadArticles(force: true)
            }
        }
    }

    // MARK: - Internal pipeline

    private func loadSubcategories(for cat: VPCategory) async {
        isLoadingSubcategories = true
        subcategoriesError = nil
        do {
            let rows: [VPCategory] = try await client
                .from("categories")
                .select()
                .eq("parent_id", value: cat.id)
                .eq("is_kids_safe", value: false)
                .is("deleted_at", value: nil)
                .order("sort_order")
                .order("name")
                .execute()
                .value
            // Guard against a stale response landing after the user has
            // already navigated away. If selectedCategory has changed,
            // drop the result on the floor.
            guard selectedCategory?.id == cat.id else { return }
            subcategories = rows
            isLoadingSubcategories = false
        } catch {
            Log.d("BrowseState load subcategories failed:", error)
            guard selectedCategory?.id == cat.id else { return }
            subcategoriesError = "Couldn\u{2019}t load subsections."
            isLoadingSubcategories = false
        }
    }

    private func advanceToArticles(subcategory: VPCategory?) async {
        selectedSubcategory = subcategory
        articles = []
        editorsEdge = nil
        paneIndex = 2
        await loadArticles(force: true)
        await loadEditorsEdge()
    }

    private func loadArticles(force: Bool) async {
        guard let cat = selectedCategory else { return }
        if !force && !articles.isEmpty { return }
        isLoadingArticles = true
        articlesError = nil
        let pinnedCatId = cat.id
        let pinnedSubId = selectedSubcategory?.id
        let effectiveSort: BrowseSort = (sort == .trending && !canTrendingSort) ? .recent : sort

        do {
            var query = client
                .from("articles")
                .select("*, stories(slug)")
                .eq("status", value: "published")
                .eq("category_id", value: cat.id)
                .eq("is_kids_safe", value: false)
                .is("deleted_at", value: nil)
            if let sub = selectedSubcategory {
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

            // Stale-response guard — bail if the user changed scope while
            // this fetch was in flight.
            guard selectedCategory?.id == pinnedCatId,
                  selectedSubcategory?.id == pinnedSubId else { return }
            articles = rows
            isLoadingArticles = false
            await loadFollowState(rows: rows)
        } catch {
            Log.d("BrowseState load articles failed:", error)
            guard selectedCategory?.id == pinnedCatId,
                  selectedSubcategory?.id == pinnedSubId else { return }
            articlesError = "Couldn\u{2019}t load articles."
            isLoadingArticles = false
        }
    }

    private func loadEditorsEdge() async {
        guard let cat = selectedCategory else { return }
        let site = SupabaseManager.shared.siteURL
        var comps = URLComponents(
            url: site.appendingPathComponent("api/directory/editors-edge"),
            resolvingAgainstBaseURL: false
        )
        var qi: [URLQueryItem] = []
        if let s = cat.slug { qi.append(URLQueryItem(name: "category", value: s)) }
        if let sub = selectedSubcategory, let s = sub.slug {
            qi.append(URLQueryItem(name: "sub", value: s))
        }
        comps?.queryItems = qi
        guard let url = comps?.url else { return }
        let pinnedCatId = cat.id
        let pinnedSubId = selectedSubcategory?.id
        do {
            var req = URLRequest(url: url)
            if let session = try? await client.auth.session {
                req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            }
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse else { return }
            guard selectedCategory?.id == pinnedCatId,
                  selectedSubcategory?.id == pinnedSubId else { return }
            if http.statusCode == 404 {
                editorsEdge = nil
                return
            }
            guard http.statusCode == 200 else { return }
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let decoded = try decoder.decode(EditorsEdgeResponse.self, from: data)
            editorsEdge = decoded.pick
        } catch {
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
            followedStoryIds = Set(follows.map { $0.story_id })
        } catch {
            // Silent — follow indicator just doesn't render.
        }
    }

    // MARK: - Follow toggle (article row swipe action)

    func toggleFollow(story: Story) async {
        guard let storyId = story.storyId else { return }
        guard let session = try? await client.auth.session else {
            // Anon path — story follow opens registration on web; iOS
            // doesn't have a top-level sheet wired here yet. See
            // LockedDecisions / no-save. Drop silently.
            return
        }
        _ = followBusyStoryIds.insert(storyId)
        // Optimistic flip.
        if followedStoryIds.contains(storyId) {
            followedStoryIds.remove(storyId)
        } else {
            followedStoryIds.insert(storyId)
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
                // Revert optimistic flip.
                if followedStoryIds.contains(storyId) {
                    followedStoryIds.remove(storyId)
                } else {
                    followedStoryIds.insert(storyId)
                }
                return
            }
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let following = json["following"] as? Bool {
                if following {
                    followedStoryIds.insert(storyId)
                } else {
                    followedStoryIds.remove(storyId)
                }
            }
        } catch {
            // Revert on network error.
            if followedStoryIds.contains(storyId) {
                followedStoryIds.remove(storyId)
            } else {
                followedStoryIds.insert(storyId)
            }
        }
    }
}
