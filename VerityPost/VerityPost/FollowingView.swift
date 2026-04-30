import SwiftUI
import Supabase

// MARK: - Decodable response types (file-private)

private struct ReadingLogRow: Decodable {
    let articleId: String
    let articles: ArticleStoryRef?
    enum CodingKeys: String, CodingKey {
        case articleId = "article_id"
        case articles
    }
}

private struct ArticleStoryRef: Decodable {
    let storyId: String?
    enum CodingKeys: String, CodingKey {
        case storyId = "story_id"
    }
}

private struct FollowedStoryContainer: Identifiable, Decodable {
    let id: String
    let title: String
    let lifecycleStatus: String
    let publishedAt: Date?
    enum CodingKeys: String, CodingKey {
        case id, title
        case lifecycleStatus = "lifecycle_status"
        case publishedAt = "published_at"
    }
}

// MARK: - FollowingView

struct FollowingView: View {
    @EnvironmentObject var auth: AuthViewModel

    @State private var followed: [FollowedStoryContainer] = []
    @State private var latestArticle: [String: Story] = [:]  // story container id → most recent article
    @State private var loading = true
    @State private var loadError: String? = nil

    private let client = SupabaseManager.shared.client

    var body: some View {
        Group {
            if auth.currentUser == nil {
                SignInGate(
                    feature: "Following",
                    detail: "Sign in to track stories as you read. Stories you've read at least one article from appear here."
                )
            } else {
                content
            }
        }
        .background(VP.bg.ignoresSafeArea())
        .navigationTitle("Following")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: auth.currentUser?.id) {
            guard auth.currentUser != nil else { return }
            await load()
        }
    }

    @ViewBuilder
    private var content: some View {
        if loading {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(VP.bg)
        } else if let err = loadError {
            VStack(spacing: 12) {
                Spacer()
                Text(err)
                    .font(.subheadline)
                    .foregroundColor(VP.dim)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
                Spacer()
            }
        } else if followed.isEmpty {
            VStack(spacing: 16) {
                Spacer()
                Text("Stories you follow will appear here. Read an article to start tracking it.")
                    .font(.subheadline)
                    .foregroundColor(VP.dim)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
                Spacer()
            }
        } else {
            List {
                ForEach(followed) { container in
                    if let article = latestArticle[container.id] {
                        NavigationLink(value: article) {
                            storyRow(container)
                        }
                        .listRowBackground(VP.bg)
                        .listRowSeparatorTint(VP.rule)
                    } else {
                        storyRow(container)
                            .listRowBackground(VP.bg)
                            .listRowSeparatorTint(VP.rule)
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(VP.bg)
            .navigationDestination(for: Story.self) { story in
                StoryDetailView(story: story)
            }
        }
    }

    @ViewBuilder
    private func storyRow(_ container: FollowedStoryContainer) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(statusLabel(container.lifecycleStatus))
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(0.8)
                    .foregroundColor(statusColor(container.lifecycleStatus))
                    .textCase(.uppercase)
                Text(container.title)
                    .font(.system(.subheadline, design: .serif, weight: .semibold))
                    .foregroundColor(VP.text)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let date = container.publishedAt {
                Text(Self.dateFmt.string(from: date))
                    .font(.system(size: 12, weight: .regular))
                    .foregroundColor(VP.muted)
            }
        }
        .padding(.vertical, 10)
    }

    private func statusLabel(_ status: String) -> String {
        switch status.lowercased() {
        case "breaking": return "Breaking"
        case "developing": return "Developing"
        default: return status
        }
    }

    private func statusColor(_ status: String) -> Color {
        switch status.lowercased() {
        case "breaking": return VP.breaking
        case "developing": return VP.warn
        default: return VP.dim
        }
    }

    private static let dateFmt: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "MMM d"
        return f
    }()

    private func load() async {
        loading = true
        loadError = nil
        defer { loading = false }

        guard let userId = auth.currentUser?.id else { return }

        do {
            // Step 1: distinct story_ids the user has read via reading_log → articles join
            let logRows: [ReadingLogRow] = try await client
                .from("reading_log")
                .select("article_id, articles(story_id)")
                .eq("user_id", value: userId)
                .execute()
                .value

            let storyIds = Set(logRows.compactMap { $0.articles?.storyId }.filter { !$0.isEmpty })
            guard !storyIds.isEmpty else {
                followed = []
                latestArticle = [:]
                return
            }

            // Steps 2 & 3 in parallel: active story containers + most recent article per container
            async let containersReq: [FollowedStoryContainer] = client
                .from("stories")
                .select("id, title, lifecycle_status, published_at")
                .in("id", values: Array(storyIds))
                .in("lifecycle_status", values: ["breaking", "developing"])
                .order("published_at", ascending: false)
                .limit(50)
                .execute()
                .value

            async let articlesReq: [Story] = client
                .from("articles")
                .select("id, title, story_id, published_at, excerpt, cover_image_url, category_id, is_breaking, is_developing, stories(slug)")
                .in("story_id", values: Array(storyIds))
                .order("published_at", ascending: false)
                .execute()
                .value

            let (containers, articles) = try await (containersReq, articlesReq)

            // Keep only the latest article per story container (articles are already ordered DESC)
            var byStory: [String: Story] = [:]
            for article in articles {
                guard let sid = article.storyId, byStory[sid] == nil else { continue }
                byStory[sid] = article
            }

            followed = containers
            latestArticle = byStory
        } catch {
            loadError = "Couldn't load your followed stories."
        }
    }
}
