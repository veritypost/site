import SwiftUI
import Supabase

// Kid-safe article list for a category. Shown when a kid taps a category
// tile on home. Leads into KidReaderView → KidQuizEngineView.

struct ArticleListView: View {
    let categoryName: String
    let categoryColor: Color
    let categorySlug: String?

    @State private var articles: [KidArticle] = []
    @State private var loading: Bool = true
    @State private var loadError: String? = nil

    @State private var openArticle: KidArticle? = nil

    var onClose: () -> Void

    private var client: SupabaseClient { SupabaseKidsClient.shared.client }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if loading && articles.isEmpty {
                        ProgressView().padding(.top, 60)
                    } else if articles.isEmpty {
                        emptyState
                    } else {
                        ForEach(articles) { article in
                            Button { openArticle = article } label: {
                                card(article)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    if let loadError {
                        Text(loadError)
                            .font(.system(.caption, design: .rounded))
                            .foregroundStyle(K.coralDark)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 40)
            }
            .background(K.bg.ignoresSafeArea())
            .navigationTitle(categoryName)
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { onClose() } label: {
                        Image(systemName: "xmark")
                            .font(.system(.subheadline, weight: .bold))
                            .foregroundStyle(K.text)
                            .frame(width: 44, height: 44)
                            .background(K.card)
                            .clipShape(Circle())
                            .overlay(Circle().strokeBorder(K.border, lineWidth: 1))
                    }
                }
            }
            .fullScreenCover(item: $openArticle) { article in
                KidReaderView(article: article, categoryColor: categoryColor)
            }
        }
        .task { await load() }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "newspaper")
                .font(.system(.largeTitle, weight: .bold))
                .foregroundStyle(K.dim)
            Text("No articles here yet.\nCheck back soon!")
                .font(.system(.subheadline, design: .rounded, weight: .medium))
                .foregroundStyle(K.dim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func card(_ article: KidArticle) -> some View {
        HStack(alignment: .top, spacing: 14) {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(categoryColor.opacity(0.15))
                .frame(width: 72, height: 72)
                .overlay(
                    Image(systemName: "newspaper.fill")
                        .font(.system(.title2, weight: .bold))
                        .foregroundStyle(categoryColor)
                )

            VStack(alignment: .leading, spacing: 6) {
                Text(article.title ?? "Untitled")
                    .font(.system(.subheadline, design: .rounded, weight: .heavy))
                    .foregroundStyle(K.text)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                if let summary = article.kidsSummary ?? article.excerpt, !summary.isEmpty {
                    Text(summary)
                        .font(.system(.caption, design: .rounded, weight: .medium))
                        .foregroundStyle(K.dim)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }

                if let mins = article.readingTimeMinutes {
                    HStack(spacing: 4) {
                        Image(systemName: "clock")
                            .font(.system(.caption2, weight: .bold))
                        Text("\(mins) min")
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                    }
                    .foregroundStyle(K.dim)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(K.border, lineWidth: 1)
        )
    }

    private func load() async {
        loading = true
        defer { loading = false }

        do {
            var query = client
                .from("articles")
                .select("id, title, slug, excerpt, kids_summary, cover_image_url, category_id, reading_time_minutes, difficulty_level, published_at")
                .eq("status", value: "published")
                .eq("is_kids_safe", value: true)

            if let slug = categorySlug, !slug.isEmpty {
                // Filter by category via category slug lookup would need a join.
                // For MVP, the caller passes the slug and we do a two-step:
                // 1) resolve category id, 2) filter articles.
                // Optimization: cache in state on home.
            }

            let articles: [KidArticle] = try await query
                .order("published_at", ascending: false)
                .limit(30)
                .execute()
                .value
            self.articles = articles
        } catch {
            self.loadError = "Couldn't load articles"
            self.articles = []
        }
    }
}
