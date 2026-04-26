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
    // K10: quiz outcome propagates from KidReaderView up to KidsAppRoot so the
    // celebration scene chain can present. Default no-op for previews/tests.
    var onQuizComplete: (KidQuizResult) -> Void = { _ in }

    private var client: SupabaseClient { SupabaseKidsClient.shared.client }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if loading && articles.isEmpty {
                        ProgressView().padding(.top, 60)
                    } else if loadError != nil {
                        // OwnersAudit Kids Task 4 — distinguish a network
                        // failure from a genuinely-empty category. The old
                        // path showed both emptyState ("No articles in this
                        // category yet") AND the error caption underneath,
                        // which contradicted itself.
                        VStack(spacing: 14) {
                            Text("Couldn't load articles right now.")
                                .font(.system(.subheadline, design: .rounded, weight: .medium))
                                .foregroundStyle(K.dim)
                                .multilineTextAlignment(.center)
                            Button { Task { await load() } } label: {
                                Text("Try again")
                                    .font(.system(.subheadline, design: .rounded, weight: .bold))
                                    .foregroundStyle(.white)
                                    .frame(maxWidth: 180, minHeight: 44)
                                    .background(K.teal)
                                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            }
                            .buttonStyle(.plain)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 50)
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
                    .accessibilityLabel("Close articles")
                }
            }
            .fullScreenCover(item: $openArticle) { article in
                KidReaderView(article: article, categoryColor: categoryColor) { result in
                    onQuizComplete(result)
                }
            }
        }
        .task { await load() }
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Image(systemName: "newspaper")
                .font(.system(.largeTitle, weight: .bold))
                .foregroundStyle(K.dim)
                .accessibilityHidden(true)
            Text("No articles in this category yet.\nTry another or go back home.")
                .font(.system(.subheadline, design: .rounded, weight: .medium))
                .foregroundStyle(K.dim)
                .multilineTextAlignment(.center)

            Button { onClose() } label: {
                Text("Go Home")
                    .font(.system(.subheadline, design: .rounded, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: 180, minHeight: 44)
                    .background(K.teal)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
            .accessibilityLabel("Go back to home")
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 50)
        .padding(.horizontal, 20)
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
        loadError = nil
        defer { loading = false }

        // K3: resolve categorySlug → category_id first, then filter articles.
        // If no slug supplied (or resolution fails), fall through to the
        // unfiltered list so the kid still has something to read.
        var categoryId: String? = nil
        if let slug = categorySlug, !slug.isEmpty {
            struct CatRow: Decodable { let id: String }
            do {
                let row: CatRow = try await client
                    .from("categories")
                    .select("id")
                    .eq("slug", value: slug)
                    .single()
                    .execute()
                    .value
                categoryId = row.id
            } catch {
                // Non-fatal — show all kid-safe articles instead of empty list.
                print("[ArticleListView] category slug lookup failed (\(slug)):", error)
            }
        }

        do {
            let baseQuery = client
                .from("articles")
                .select("id, title, slug, excerpt, kids_summary, cover_image_url, category_id, reading_time_minutes, difficulty_level, published_at")
                .eq("status", value: "published")
                .eq("is_kids_safe", value: true)

            let filtered = categoryId.map { baseQuery.eq("category_id", value: $0) } ?? baseQuery

            let articles: [KidArticle] = try await filtered
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
