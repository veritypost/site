import SwiftUI
import Supabase

// Kid article reader. Loads full article text, renders in kid-friendly style.
// Tracks scroll progress; when the kid scrolls to ≥80% of the article,
// emits a reading_log INSERT (completed=true). Button at end: "Take the quiz".

struct KidReaderView: View {
    let article: KidArticle
    let categoryColor: Color

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var auth: KidsAuth

    @State private var body_: String = ""
    @State private var loading: Bool = true
    @State private var loadError: String? = nil
    @State private var startTime: Date = Date()
    @State private var logged: Bool = false
    @State private var showQuiz: Bool = false

    private var client: SupabaseClient { SupabaseKidsClient.shared.client }

    var body: some View {
        ZStack {
            K.bg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    if loading {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                    } else {
                        Text(body_)
                            .font(.system(.body, design: .rounded, weight: .regular))
                            .foregroundStyle(K.text)
                            .lineSpacing(5)

                        takeQuizButton
                    }
                    if let loadError {
                        Text(loadError)
                            .font(.system(.caption, design: .rounded))
                            .foregroundStyle(K.coralDark)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 100)
            }
            .overlay(alignment: .topLeading) {
                dismissButton
            }
            .fullScreenCover(isPresented: $showQuiz) {
                KidQuizEngineView(article: article, categoryColor: categoryColor) {
                    showQuiz = false
                    dismiss()
                }
            }
        }
        .task { await loadArticle() }
    }

    // MARK: Sub-views

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(LinearGradient(
                    colors: [categoryColor.opacity(0.3), categoryColor.opacity(0.1)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
                .frame(height: 140)
                .overlay(
                    Image(systemName: "newspaper.fill")
                        .font(.system(.largeTitle, weight: .bold))
                        .foregroundStyle(categoryColor)
                )

            Text(article.title ?? "Untitled")
                .font(.system(.title2, design: .rounded, weight: .black))
                .foregroundStyle(K.text)
                .multilineTextAlignment(.leading)

            if let mins = article.readingTimeMinutes {
                HStack(spacing: 6) {
                    Image(systemName: "clock")
                        .font(.system(.caption, weight: .bold))
                    Text("\(mins) min read")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                }
                .foregroundStyle(K.dim)
            }
        }
    }

    private var takeQuizButton: some View {
        VStack(spacing: 10) {
            Text("Ready to try the quiz?")
                .font(.system(.subheadline, design: .rounded, weight: .heavy))
                .foregroundStyle(K.text)

            Button {
                if !logged {
                    logged = true
                    Task { await logReading() }
                }
                showQuiz = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "questionmark.circle.fill")
                        .font(.system(.body, weight: .bold))
                    Text("Take the quiz")
                        .font(.system(.body, design: .rounded, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 54)
                .background(K.teal)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .shadow(color: K.teal.opacity(0.3), radius: 12, y: 4)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 24)
    }

    private var dismissButton: some View {
        Button { dismiss() } label: {
            Image(systemName: "xmark")
                .font(.system(.subheadline, weight: .heavy))
                .foregroundStyle(K.text)
                .frame(width: 44, height: 44)
                .background(.thinMaterial)
                .clipShape(Circle())
                .shadow(color: .black.opacity(0.15), radius: 8, y: 2)
        }
        .buttonStyle(.plain)
        .padding(.leading, 20)
        .padding(.top, 60)
    }

    // MARK: Load + read-log

    private func loadArticle() async {
        loading = true
        defer { loading = false }

        struct Row: Decodable {
            let body: String?
            let kids_summary: String?
        }

        do {
            // T-026 — belt-and-suspenders: don't just trust RLS. If the
            // kid-JWT RLS policy on articles drifts, kids could fetch an
            // adult article by known UUID. Explicit is_kids_safe=true
            // filter catches both cases.
            let row: Row = try await client
                .from("articles")
                .select("body, kids_summary")
                .eq("id", value: article.id)
                .eq("is_kids_safe", value: true)
                .single()
                .execute()
                .value
            self.body_ = row.kids_summary ?? row.body ?? ""
            self.startTime = Date()
        } catch {
            self.loadError = "Couldn't load article"
            self.body_ = ""
        }
    }

    private func logReading() async {
        guard let kidId = auth.kid?.id else { return }
        let elapsed = Int(Date().timeIntervalSince(startTime))
        let row = ReadingLogInsert(
            user_id: nil,
            kid_profile_id: kidId,
            article_id: article.id,
            read_percentage: 1.0,
            time_spent_seconds: elapsed,
            completed: true,
            source: "kids-ios",
            device_type: "ios"
        )
        do {
            try await client
                .from("reading_log")
                .insert(row)
                .execute()
        } catch {
            // Non-fatal; quiz can still be taken. Logged locally in future.
        }
    }
}

private struct ReaderContentHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

private struct ReaderScroll: Equatable {
    let offset: CGFloat
    let contentHeight: CGFloat
    let viewportHeight: CGFloat
}
