import SwiftUI
import UIKit

/// Root of the Browse tab (pane 1).
///
/// Lists the adult top-level categories (parent_id IS NULL, is_kids_safe=false,
/// deleted_at IS NULL). A `.searchable` input filters in-memory by name.
/// Tap pushes `BrowseSubcategoriesView`. On regular×regular size class
/// (iPad landscape), switches to a 3-column `NavigationSplitView`.
///
/// Kids categories (is_kids_safe=true or slug LIKE 'kids-%') are excluded —
/// this surface is adult-only. Kids reach is via the kids app entirely.
struct BrowseCategoriesView: View {
    @EnvironmentObject var auth: AuthViewModel
    @Environment(\.horizontalSizeClass) private var hClass
    @Environment(\.verticalSizeClass) private var vClass

    @State private var categories: [VPCategory] = []
    @State private var categoryFilter: String = ""
    @State private var isLoading: Bool = true
    @State private var error: String? = nil

    // iPad split-view selection state — drives content + detail columns.
    @State private var splitSelectedCategory: VPCategory?
    @State private var splitSelectedSubcategory: VPCategory?

    private let client = SupabaseManager.shared.client

    private var isRegular: Bool {
        hClass == .regular && vClass == .regular
    }

    private var filteredCategories: [VPCategory] {
        let q = categoryFilter.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return categories }
        let needle = q.lowercased()
        return categories.filter { $0.name.lowercased().contains(needle) }
    }

    var body: some View {
        Group {
            if isRegular {
                ipadSplitView
            } else {
                iphoneListView
            }
        }
        .navigationTitle("Browse")
        .navigationBarTitleDisplayMode(.large)
        .searchable(text: $categoryFilter, prompt: "Filter sections")
        .task {
            await loadCategories()
        }
    }

    // MARK: - iPhone (NavigationStack push)

    private var iphoneListView: some View {
        Group {
            if isLoading {
                loadingView
            } else if let err = error {
                errorView(err)
            } else if filteredCategories.isEmpty {
                emptyFilterView
            } else {
                List(filteredCategories) { cat in
                    NavigationLink(value: cat) {
                        categoryRow(cat, active: false)
                    }
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                    .simultaneousGesture(TapGesture().onEnded {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    })
                }
                .listStyle(.plain)
            }
        }
        .navigationDestination(for: VPCategory.self) { cat in
            BrowseSubcategoriesView(category: cat)
                .environmentObject(auth)
        }
    }

    // MARK: - iPad (NavigationSplitView 3-column)

    private var ipadSplitView: some View {
        NavigationSplitView {
            // Sidebar — categories list
            Group {
                if isLoading {
                    loadingView
                } else if let err = error {
                    errorView(err)
                } else {
                    List(filteredCategories) { cat in
                        Button {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            splitSelectedCategory = cat
                            splitSelectedSubcategory = nil
                        } label: {
                            categoryRow(cat, active: splitSelectedCategory?.id == cat.id)
                        }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets())
                    }
                    .listStyle(.sidebar)
                }
            }
            .navigationTitle("Sections")
        } content: {
            // Middle column — subcategories of selected category
            if let cat = splitSelectedCategory {
                BrowseSubcategoriesView(
                    category: cat,
                    splitSelectedSubcategory: $splitSelectedSubcategory
                )
                .environmentObject(auth)
                .id(cat.id)
            } else {
                ContentUnavailableView(
                    "Pick a section",
                    systemImage: "list.bullet.rectangle",
                    description: Text("Choose a category on the left to see its subsections.")
                )
            }
        } detail: {
            // Right column — articles for the (cat, optional sub) selection
            if let cat = splitSelectedCategory {
                BrowseArticlesView(
                    category: cat,
                    subcategory: splitSelectedSubcategory,
                    sort: .recent
                )
                .environmentObject(auth)
                .id("\(cat.id)-\(splitSelectedSubcategory?.id ?? "all")")
            } else {
                ContentUnavailableView(
                    "Stories appear here",
                    systemImage: "newspaper",
                    description: Text("Pick a section and subsection to see its articles.")
                )
            }
        }
    }

    // MARK: - Row

    private func categoryRow(_ cat: VPCategory, active: Bool) -> some View {
        HStack(spacing: 12) {
            // 2px red left rule denotes selected state on the iPad sidebar.
            // iPhone push surface never renders active=true; the
            // NavigationStack already gives a transient highlight on tap.
            Rectangle()
                .fill(active ? VP.breaking : Color.clear)
                .frame(width: 2)
            VStack(alignment: .leading, spacing: 4) {
                Text(cat.name)
                    .font(.system(size: 18, weight: .medium, design: .serif))
                    .foregroundColor(VP.text)
                    .multilineTextAlignment(.leading)
                // article_count isn't surfaced on VPCategory; if/when the
                // model gains the field, drop it back into the meta line.
                // For now the slug appears as a faint mono hint.
                if let slug = cat.slug, !slug.isEmpty {
                    Text(slug.uppercased())
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .tracking(1.1)
                        .foregroundColor(VP.muted)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(VP.muted)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
        .contentShape(Rectangle())
    }

    private var loadingView: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text("Loading sections\u{2026}")
                .font(.footnote)
                .foregroundColor(VP.dim)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .foregroundColor(VP.danger)
            Text(msg)
                .font(.footnote)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
            Button("Try again") {
                Task { await loadCategories() }
            }
            .font(.system(.footnote, weight: .semibold))
            .foregroundColor(VP.accent)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyFilterView: some View {
        VStack(spacing: 8) {
            Text("No sections match \u{201C}\(categoryFilter)\u{201D}")
                .font(.footnote)
                .foregroundColor(VP.dim)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Networking

    private func loadCategories() async {
        await MainActor.run {
            isLoading = true
            error = nil
        }
        do {
            // Adult top-level categories only. Filters mirror Stream B's
            // /api/directory/categories (parent_id IS NULL, !is_kids_safe,
            // !deleted_at). Slug LIKE 'kids-%' is excluded by is_kids_safe
            // on the seeded rows; the LIKE-not is defensive in case any
            // adult-flag drift slips through.
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
            await MainActor.run {
                categories = rows
                isLoading = false
            }
        } catch {
            Log.d("BrowseCategoriesView load failed:", error)
            await MainActor.run {
                self.error = "Couldn\u{2019}t load sections."
                isLoading = false
            }
        }
    }
}

#Preview {
    NavigationStack {
        BrowseCategoriesView()
            .environmentObject(AuthViewModel())
    }
}
