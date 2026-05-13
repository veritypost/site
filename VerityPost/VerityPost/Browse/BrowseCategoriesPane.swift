import SwiftUI
import UIKit

/// Pane 1 of the iPhone Browse slider — adult top-level categories list.
///
/// Presentational view: reads everything from `BrowseState`, calls back
/// into `state.selectCategory(_:)` on tap (which advances paneIndex →
/// kicks off the subcategory load). No `.searchable` filter here —
/// global article search lives in FindView via Today's magnifier. This
/// pane is just the 14 sections, alphabetical.
///
/// 2px red left rule denotes the active row on iPad split-view (where the
/// pane stays mounted); on the iPhone slider `active` is always false
/// because the row is gone the moment you tap it.
struct BrowseCategoriesPane: View {
    @ObservedObject var state: BrowseState
    /// True on iPad split-view; lets the row render `active` styling for
    /// the selected category. iPhone slider passes false.
    var showsActiveSelection: Bool = false

    var body: some View {
        Group {
            if state.isLoadingCategories {
                loadingView
            } else if let err = state.categoriesError {
                errorView(err)
            } else if state.categories.isEmpty {
                emptyView
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(state.categories) { cat in
                    Button {
                        Task { await state.selectCategory(cat) }
                    } label: {
                        categoryRow(
                            cat,
                            active: showsActiveSelection && state.selectedCategory?.id == cat.id
                        )
                    }
                    .buttonStyle(.plain)
                    Divider().background(VP.border)
                }
            }
        }
    }

    private func categoryRow(_ cat: VPCategory, active: Bool) -> some View {
        HStack(spacing: 12) {
            Rectangle()
                .fill(active ? VP.breaking : Color.clear)
                .frame(width: 2)
            VStack(alignment: .leading, spacing: 4) {
                Text(cat.name)
                    .font(.system(size: 18, weight: .medium, design: .serif))
                    .foregroundColor(VP.text)
                    .multilineTextAlignment(.leading)
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

    private var emptyView: some View {
        VStack(spacing: 8) {
            Text("No sections to show.")
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
                Task { await state.loadCategoriesIfNeeded(force: true) }
            }
            .font(.system(.footnote, weight: .semibold))
            .foregroundColor(VP.accent)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
