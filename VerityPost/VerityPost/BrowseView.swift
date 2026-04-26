import SwiftUI
import Supabase

// BrowseView — adult iOS Browse tab.
//
// Mirrors web /browse (web/src/app/browse/page.tsx):
//   - Featured "Latest" row: 3 most recently published articles (horizontal scroll)
//   - Category cards: tap-to-expand to show 3 latest in-category as
//     NavigationLinks pushing StoryDetailView
//   - "View all {cat} articles" pushes CategoryDetailView
//   - Skeleton loading state (vp-pulse-style opacity animation)
//   - Distinct error state ("Couldn't load content" + 44pt Retry)
//
// Data path: direct Supabase parallel queries (no API endpoint), matching
// the established iOS pattern (FindView, HomeView). Kids categories are
// filtered out via `not('slug', 'like', 'kids-%')` to match web — the
// existing in-home BrowseLanding view (HomeView.swift) does NOT do this,
// which is the gap closed here.
//
// Replaces the leaderboard tab in the bottom bar (IA shift, owner-locked
// 2026-04-26). LeaderboardView remains reachable via the Profile QuickLink
// added in the same session.

struct BrowseView: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    @State private var search: String = ""
    @State private var expandedCatId: String? = nil
    @State private var categories: [VPCategory] = []
    @State private var featured: [Story] = []
    @State private var countByCat: [String: Int] = [:]
    @State private var trendingByCat: [String: [Story]] = [:]
    @State private var catNameById: [String: String] = [:]
    @State private var loading: Bool = true
    @State private var loadFailed: Bool = false

    private var filteredCategories: [VPCategory] {
        guard !search.isEmpty else { return categories }
        let needle = search.lowercased()
        return categories.filter { $0.displayName.lowercased().contains(needle) }
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            content
        }
        .background(VP.bg.ignoresSafeArea())
        .navigationTitle("Browse")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    // MARK: - Header (search)

    private var header: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .font(.system(.subheadline, design: .default, weight: .medium))
                    .foregroundColor(VP.dim)
                TextField("Search categories", text: $search)
                    .font(.system(.subheadline))
                    .foregroundColor(VP.text)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                if !search.isEmpty {
                    Button { search = "" } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(.subheadline))
                            .foregroundColor(VP.dim)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Clear search")
                }
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(VP.card)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            Divider().background(VP.border)
        }
        .background(VP.bg)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if loading {
            BrowseSkeleton()
        } else if loadFailed {
            errorState
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24) {
                    featuredSection
                    categoriesSection
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 80)
            }
        }
    }

    private var errorState: some View {
        VStack(spacing: 8) {
            Spacer().frame(height: 60)
            Text("Couldn\u{2019}t load content")
                .font(.system(.subheadline, design: .default, weight: .semibold))
                .foregroundColor(VP.text)
            Text("Check your connection and try again.")
                .font(.footnote)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
            Button("Retry") {
                Task { await load() }
            }
            .font(.system(.footnote, design: .default, weight: .semibold))
            .foregroundColor(.white)
            .padding(.horizontal, 22)
            .padding(.vertical, 11)
            .frame(minHeight: 44)
            .background(VP.accent)
            .cornerRadius(8)
            .padding(.top, 6)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Featured ("Latest")

    @ViewBuilder
    private var featuredSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Latest")
                .font(.system(.subheadline, design: .default, weight: .heavy))
                .tracking(-0.2)
                .foregroundColor(VP.text)

            if featured.isEmpty {
                emptyFeaturedCard
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(featured) { story in
                            NavigationLink {
                                StoryDetailView(story: story).environmentObject(auth)
                            } label: {
                                featuredCard(for: story)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private var emptyFeaturedCard: some View {
        Text("No new stories yet.")
            .font(.footnote)
            .foregroundColor(VP.dim)
            .padding(.vertical, 24)
            .frame(maxWidth: .infinity)
            .background(VP.card)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(VP.border, style: StrokeStyle(lineWidth: 1, dash: [4]))
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func featuredCard(for story: Story) -> some View {
        let categoryName = (story.categoryId.flatMap { catNameById[$0] }) ?? "News"
        return VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                Rectangle().fill(VP.streakTrack).frame(width: 200, height: 60)
                Text(categoryName.uppercased())
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(0.6)
                    .foregroundColor(VP.dim)
                    .padding(.horizontal, 10)
                    .padding(.bottom, 6)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(story.title ?? "Untitled")
                    .font(.system(.footnote, design: .default, weight: .bold))
                    .foregroundColor(VP.text)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                HStack(spacing: 4) {
                    Text(categoryName)
                        .font(.caption2)
                        .foregroundColor(VP.dim)
                    if let d = story.publishedAt {
                        Text("\u{00B7}").font(.caption2).foregroundColor(VP.dim)
                        Text(timeAgo(d))
                            .font(.caption2)
                            .foregroundColor(VP.dim)
                    }
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 10)
        }
        .frame(width: 200)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Categories

    @ViewBuilder
    private var categoriesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("All categories")
                .font(.system(.subheadline, design: .default, weight: .heavy))
                .tracking(-0.2)
                .foregroundColor(VP.text)

            if filteredCategories.isEmpty {
                emptyCategoriesCard
            } else {
                LazyVStack(spacing: 10) {
                    ForEach(filteredCategories) { cat in
                        categoryCard(for: cat)
                    }
                }
            }
        }
    }

    private var emptyCategoriesCard: some View {
        VStack(spacing: 8) {
            Text("No categories match")
                .font(.system(.subheadline, design: .default, weight: .semibold))
                .foregroundColor(VP.text)
            Text("Try shorter keywords, or clear your search.")
                .font(.footnote)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
            if !search.isEmpty {
                Button("Clear search") { search = "" }
                    .font(.system(.footnote, design: .default, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 9)
                    .frame(minHeight: 44)
                    .background(VP.accent)
                    .cornerRadius(8)
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    }

    @ViewBuilder
    private func categoryCard(for cat: VPCategory) -> some View {
        let isExpanded = expandedCatId == cat.id
        let count = countByCat[cat.id] ?? 0
        let trending = trendingByCat[cat.id] ?? []
        let initial = String((cat.displayName.first ?? "?").uppercased())

        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.18)) {
                    expandedCatId = isExpanded ? nil : cat.id
                }
            } label: {
                HStack(spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 10)
                            .fill(VP.bg)
                            .frame(width: 42, height: 42)
                            .overlay(
                                RoundedRectangle(cornerRadius: 10).stroke(VP.border, lineWidth: 1)
                            )
                        Text(initial)
                            .font(.system(.subheadline, design: .default, weight: .heavy))
                            .foregroundColor(VP.text)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(cat.displayName)
                            .font(.system(.subheadline, design: .default, weight: .bold))
                            .foregroundColor(VP.text)
                        Text("\(count) article\(count == 1 ? "" : "s")")
                            .font(.caption2)
                            .foregroundColor(VP.dim)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.system(.caption, design: .default, weight: .semibold))
                        .foregroundColor(VP.dim)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(isExpanded ? "Collapses category details" : "Expands category details")

            if isExpanded {
                expandedRows(for: cat, trending: trending)
            }
        }
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private func expandedRows(for cat: VPCategory, trending: [Story]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Divider().background(VP.border)

            Text("Latest in \(cat.displayName)".uppercased())
                .font(.system(size: 10, weight: .heavy))
                .tracking(0.6)
                .foregroundColor(VP.dim)
                .padding(.horizontal, 14)
                .padding(.top, 12)
                .padding(.bottom, 4)

            if trending.isEmpty {
                Text("No articles yet.")
                    .font(.footnote)
                    .foregroundColor(VP.dim)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
            } else {
                ForEach(Array(trending.enumerated()), id: \.element.id) { idx, story in
                    if idx > 0 {
                        Divider().background(VP.border).padding(.leading, 14)
                    }
                    NavigationLink {
                        StoryDetailView(story: story).environmentObject(auth)
                    } label: {
                        HStack(alignment: .top, spacing: 8) {
                            Text("\(idx + 1).")
                                .font(.system(.footnote, design: .default, weight: .heavy))
                                .foregroundColor(VP.text)
                                .frame(minWidth: 18, alignment: .leading)
                            Text(story.title ?? "Untitled")
                                .font(.system(.footnote, design: .default, weight: .semibold))
                                .foregroundColor(VP.text)
                                .multilineTextAlignment(.leading)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }

            NavigationLink {
                CategoryDetailView(category: cat)
            } label: {
                Text("View all \(cat.displayName) articles")
                    .font(.system(.footnote, design: .default, weight: .heavy))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 44)
                    .background(VP.accent)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 14)
            .padding(.top, 10)
            .padding(.bottom, 14)
        }
    }

    // MARK: - Data

    private func load() async {
        await MainActor.run {
            loading = true
            loadFailed = false
        }
        do {
            // Mirror web /browse exactly: filter kids-* slugs out so kid-only
            // categories don't leak into the adult catalogue.
            async let catsAsync: [VPCategory] = client.from("categories")
                .select()
                .not("slug", operator: .like, value: "kids-%")
                .order("name")
                .execute()
                .value
            async let storiesAsync: [Story] = client.from("articles")
                .select()
                .eq("status", value: "published")
                .order("published_at", ascending: false)
                .limit(500)
                .execute()
                .value
            let cats = try await catsAsync
            let stories = try await storiesAsync

            var counts: [String: Int] = [:]
            var trending: [String: [Story]] = [:]
            for s in stories {
                guard let cid = s.categoryId else { continue }
                counts[cid, default: 0] += 1
                if (trending[cid]?.count ?? 0) < 3 {
                    trending[cid, default: []].append(s)
                }
            }
            let nameByCat = Dictionary(uniqueKeysWithValues: cats.map { ($0.id, $0.displayName) })
            let topFeatured = Array(stories.prefix(3))

            await MainActor.run {
                self.categories = cats
                self.featured = topFeatured
                self.countByCat = counts
                self.trendingByCat = trending
                self.catNameById = nameByCat
                self.loading = false
                self.loadFailed = false
            }
        } catch {
            Log.d("BrowseView load failed: \(error)")
            await MainActor.run {
                self.loading = false
                self.loadFailed = true
            }
        }
    }
}

// MARK: - Skeleton (vp-pulse-style opacity animation)

private struct BrowseSkeleton: View {
    @State private var pulse = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                bar(width: 60, height: 14)
                HStack(spacing: 12) {
                    ForEach(0..<3, id: \.self) { _ in featuredSkeletonCard }
                }
                bar(width: 110, height: 14)
                ForEach(0..<5, id: \.self) { _ in categorySkeletonCard }
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 80)
            .opacity(pulse ? 0.55 : 1.0)
            .animation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true), value: pulse)
        }
        .accessibilityHidden(true)
        .onAppear { pulse = true }
    }

    private var featuredSkeletonCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Rectangle().fill(VP.streakTrack).frame(width: 200, height: 60)
            VStack(alignment: .leading, spacing: 6) {
                bar(width: 160, height: 12)
                bar(width: 110, height: 12)
                bar(width: 70, height: 10)
            }
            .padding(10)
        }
        .frame(width: 200)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var categorySkeletonCard: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 10).fill(VP.streakTrack).frame(width: 42, height: 42)
            VStack(alignment: .leading, spacing: 6) {
                bar(width: 140, height: 13)
                bar(width: 70, height: 11)
            }
            Spacer()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func bar(width: CGFloat, height: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: 4).fill(VP.streakTrack).frame(width: width, height: height)
    }
}
