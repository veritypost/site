import SwiftUI
import UIKit

/// Pane 3 of the iPhone Browse slider — article list for the
/// (category, optional subcategory) scope. Reads from `BrowseState` for
/// the article rows, editor's-edge hero, sort, follow state, and
/// permission gates.
///
/// Article taps still push `StoryDetailView` onto the surrounding
/// NavigationStack — that's a real navigation, not a slider step. The
/// `.swipeActions` follow-story gesture is preserved (signature iOS-only
/// behavior). `.refreshable` triggers `state.refreshArticles()` which
/// fires medium haptics + refetches article list + editor's edge.
struct BrowseArticlesPane: View {
    @EnvironmentObject var auth: AuthViewModel
    @ObservedObject var state: BrowseState

    @State private var expertSheetStory: Story? = nil
    @State private var expertCoverage: ExpertCoverageResponse? = nil
    @State private var expertSheetLoading: Bool = false
    @State private var showExpertUpsell: Bool = false

    private let client = SupabaseManager.shared.client

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                if let edge = state.editorsEdge {
                    editorsEdgeHero(edge)
                    Divider()
                        .background(VP.border)
                        .padding(.bottom, 4)
                }
                if state.isLoadingArticles {
                    loadingRows
                } else if let err = state.articlesError {
                    errorView(err)
                } else if state.articles.isEmpty {
                    emptyView
                } else {
                    articleList
                }
            }
        }
        .background(VP.bg)
        .refreshable {
            await state.refreshArticles()
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
        ForEach(state.articles) { story in
            NavigationLink {
                StoryDetailView(story: story)
                    .environmentObject(auth)
            } label: {
                BrowseArticleRow(
                    story: story,
                    decor: nil,
                    categoryName: state.selectedSubcategory?.name ?? state.selectedCategory?.name,
                    showExpertDepthOnTap: state.canExpertDepth,
                    onTapExperts: nil
                )
            }
            .buttonStyle(.plain)
            .simultaneousGesture(TapGesture().onEnded {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            })
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button {
                    Task { await state.toggleFollow(story: story) }
                } label: {
                    let isFollowing = story.storyId.map { state.followedStoryIds.contains($0) } ?? false
                    Label(
                        isFollowing ? "Unfollow" : "Follow",
                        systemImage: isFollowing ? "bell.slash" : "bell"
                    )
                }
                .tint(VP.brand)
                .disabled(story.storyId.map { state.followBusyStoryIds.contains($0) } ?? false)
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
                Task { await state.refreshArticles() }
            }
            .font(.system(.footnote, weight: .semibold))
            .foregroundColor(VP.accent)
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }

    private var emptyView: some View {
        let label = state.selectedSubcategory?.name ?? state.selectedCategory?.name ?? "this section"
        return VStack(spacing: 10) {
            Text("No articles in \u{201C}\(label)\u{201D} yet.")
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
                    Task { await state.toggleFollow(story: story) }
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
}
