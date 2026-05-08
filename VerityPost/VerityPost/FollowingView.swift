import SwiftUI
import Supabase

// Owner cleanup item 12 (2026-05-08) — Following tab.
// Lists every story the user has explicitly followed (story_follows
// table). Each row shows an unread dot when a new article has landed
// on the story since the user's last visit (last_seen_at on the
// follow row). Tap → latest article on the story's timeline + RPC
// mark_story_seen to clear the dot.

private struct FollowRow: Decodable, Identifiable {
    let storyId: String
    let lastSeenAt: Date?
    let stories: StoryRef?
    var id: String { storyId }

    enum CodingKeys: String, CodingKey {
        case storyId = "story_id"
        case lastSeenAt = "last_seen_at"
        case stories
    }
}

private struct StoryRef: Decodable {
    let id: String
    let slug: String?
    let title: String
    let lifecycleStatus: String
    let publishedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, slug, title
        case lifecycleStatus = "lifecycle_status"
        case publishedAt = "published_at"
    }
}

private struct LatestArticleRow: Decodable {
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

private struct DisplayRow: Identifiable {
    let storyId: String
    let title: String
    let lifecycleStatus: String
    let lastSeenAt: Date?
    let latestArticleTitle: String?
    let latestArticlePublishedAt: Date?
    let unread: Bool
    let storyRef: Story?  // for NavigationLink to StoryDetailView

    var id: String { storyId }
}

struct FollowingView: View {
    @EnvironmentObject var auth: AuthViewModel

    @State private var rows: [DisplayRow] = []
    @State private var loading = true
    @State private var loadError: String? = nil

    private let client = SupabaseManager.shared.client

    var body: some View {
        Group {
            if auth.currentUser == nil {
                SignInGate(
                    feature: "Follow stories",
                    detail: "Sign in to follow stories and get a dot when new articles land."
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
        } else if rows.isEmpty {
            VStack(spacing: 16) {
                Spacer()
                Text("Tap Follow on a story to start tracking it.")
                    .font(.subheadline)
                    .foregroundColor(VP.dim)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
                Spacer()
            }
        } else {
            List {
                ForEach(rows) { row in
                    if let story = row.storyRef {
                        NavigationLink(value: story) {
                            renderRow(row)
                        }
                        .simultaneousGesture(
                            TapGesture().onEnded { Task { await markSeen(row.storyId) } }
                        )
                        .listRowBackground(VP.bg)
                        .listRowSeparatorTint(VP.rule)
                    } else {
                        renderRow(row)
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
    private func renderRow(_ row: DisplayRow) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(row.unread ? VP.accent : Color.clear)
                .frame(width: 8, height: 8)
                .padding(.top, 8)
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(statusLabel(row.lifecycleStatus))
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(0.8)
                        .foregroundColor(statusColor(row.lifecycleStatus))
                        .textCase(.uppercase)
                    Text(row.title)
                        .font(.system(.subheadline, design: .serif, weight: row.unread ? .bold : .semibold))
                        .foregroundColor(VP.text)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let latestTitle = row.latestArticleTitle {
                    let prefix = row.unread ? "New: " : "Latest: "
                    let suffix = row.latestArticlePublishedAt
                        .map { " · " + Self.dateFmt.string(from: $0) } ?? ""
                    Text(prefix + latestTitle + suffix)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundColor(VP.muted)
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 8)
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
            // 1) The user's follows joined to stories.
            let follows: [FollowRow] = try await client
                .from("story_follows")
                .select("story_id, last_seen_at, stories(id, slug, title, lifecycle_status, published_at)")
                .eq("user_id", value: userId)
                .order("followed_at", ascending: false)
                .execute()
                .value

            let storyIds = follows.compactMap { $0.stories?.id }
            guard !storyIds.isEmpty else {
                rows = []
                return
            }

            // 2) Latest published article per followed story. One bulk
            //    fetch ordered by published_at DESC, reduced client-side.
            let articles: [LatestArticleRow] = try await client
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

            var latestByStory: [String: LatestArticleRow] = [:]
            for a in articles {
                if latestByStory[a.storyId] == nil { latestByStory[a.storyId] = a }
            }

            // 3) Build display rows. unread = latest.publishedAt > lastSeenAt.
            rows = follows.compactMap { f -> DisplayRow? in
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
                return DisplayRow(
                    storyId: s.id,
                    title: s.title,
                    lifecycleStatus: s.lifecycleStatus,
                    lastSeenAt: f.lastSeenAt,
                    latestArticleTitle: latest?.title,
                    latestArticlePublishedAt: latest?.publishedAt,
                    unread: unread,
                    storyRef: storyRef
                )
            }
        } catch {
            loadError = "Couldn't load your followed stories."
        }
    }

    private func markSeen(_ storyId: String) async {
        // Optimistic local clear.
        await MainActor.run {
            rows = rows.map { row in
                guard row.storyId == storyId else { return row }
                return DisplayRow(
                    storyId: row.storyId,
                    title: row.title,
                    lifecycleStatus: row.lifecycleStatus,
                    lastSeenAt: Date(),
                    latestArticleTitle: row.latestArticleTitle,
                    latestArticlePublishedAt: row.latestArticlePublishedAt,
                    unread: false,
                    storyRef: row.storyRef
                )
            }
        }
        // Server bump via RPC.
        do {
            try await client
                .rpc("mark_story_seen", params: ["p_story_id": storyId])
                .execute()
        } catch {
            // Non-fatal: next load reconciles.
        }
    }
}
