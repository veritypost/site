import SwiftUI

/// Root of the Browse tab.
///
/// iPhone (compact): a single mounted HStack of 3 panes (Categories,
/// Subcategories, Articles) that translate horizontally by `state.paneIndex`
/// — no NavigationStack push between panes, no system slide animation,
/// no "redirected to a new page" feel. Article taps still push
/// StoryDetailView (that's a real navigation).
///
/// iPad (regular×regular): a 3-column `NavigationSplitView` — sidebar +
/// content + detail. The slider state machine doesn't move on iPad; taps
/// mutate the split-view bindings directly.
///
/// Animation matches the web mobile `.vp-directory-mobile` slide
/// (~300ms ease-out cubic-bezier). The iPhone back affordance is a small
/// mono "← Back" bar pinned to the top when `paneIndex > 0`.
struct BrowseView: View {
    @EnvironmentObject var auth: AuthViewModel
    @ObservedObject private var perms = PermissionStore.shared
    @StateObject private var state = BrowseState()
    @Environment(\.horizontalSizeClass) private var hClass
    @Environment(\.verticalSizeClass) private var vClass

    private var isRegular: Bool {
        hClass == .regular && vClass == .regular
    }

    var body: some View {
        Group {
            if isRegular {
                iPadSplitView
            } else {
                iPhoneSliderView
            }
        }
        .navigationTitle(navTitle)
        .navigationBarTitleDisplayMode(.large)
        .task {
            await state.loadCategoriesIfNeeded()
        }
        .task(id: perms.changeToken) {
            await state.refreshPermissions()
        }
    }

    /// Top-bar title — defaults to "Browse" on pane 0; deeper panes inline
    /// the section/subsection name so the user keeps context. The back bar
    /// renders a separate mono label below this for orientation.
    private var navTitle: String {
        if !isRegular {
            switch state.paneIndex {
            case 1: return state.selectedCategory?.name ?? "Browse"
            case 2:
                return state.selectedSubcategory?.name
                    ?? state.selectedCategory?.name
                    ?? "Browse"
            default: return "Browse"
            }
        }
        return "Browse"
    }

    // MARK: - iPhone slider

    private var iPhoneSliderView: some View {
        ZStack(alignment: .top) {
            GeometryReader { geo in
                HStack(spacing: 0) {
                    BrowseCategoriesPane(state: state)
                        .frame(width: geo.size.width)
                    BrowseSubcategoriesPane(state: state)
                        .frame(width: geo.size.width)
                    BrowseArticlesPane(state: state)
                        .environmentObject(auth)
                        .frame(width: geo.size.width)
                }
                .frame(width: geo.size.width * 3, alignment: .leading)
                .offset(x: -CGFloat(state.paneIndex) * geo.size.width)
                .animation(.easeOut(duration: 0.3), value: state.paneIndex)
            }

            if state.paneIndex > 0 {
                BrowseBackBar(state: state)
                    .transition(.opacity)
            }
        }
        .clipped()
    }

    // MARK: - iPad split view

    private var iPadSplitView: some View {
        NavigationSplitView {
            // Sidebar — categories list. Tap mutates state.selectedCategory
            // via the controller, which fires the subcategory load. paneIndex
            // is irrelevant on iPad; only the selection state matters.
            Group {
                if state.isLoadingCategories {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let err = state.categoriesError {
                    VStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle")
                            .foregroundColor(VP.danger)
                        Text(err)
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                        Button("Try again") {
                            Task { await state.loadCategoriesIfNeeded(force: true) }
                        }
                    }
                    .padding(24)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    BrowseCategoriesPane(state: state, showsActiveSelection: true)
                }
            }
            .navigationTitle("Sections")
        } content: {
            // Middle column — subcategories of selected category.
            if state.selectedCategory != nil {
                BrowseSubcategoriesPane(
                    state: state,
                    splitSelectedSubcategory: Binding(
                        get: { state.selectedSubcategory },
                        set: { newValue in
                            // iPad: bypass the slider auto-advance. Update
                            // selection and re-fetch articles for the new
                            // (cat, optional sub) scope.
                            state.selectedSubcategory = newValue
                            Task {
                                await state.refreshArticles()
                            }
                        }
                    )
                )
            } else {
                ContentUnavailableView(
                    "Pick a section",
                    systemImage: "list.bullet.rectangle",
                    description: Text("Choose a category on the left to see its subsections.")
                )
            }
        } detail: {
            // Right column — articles for the (cat, optional sub) scope.
            if state.selectedCategory != nil {
                BrowseArticlesPane(state: state)
                    .environmentObject(auth)
            } else {
                ContentUnavailableView(
                    "Stories appear here",
                    systemImage: "newspaper",
                    description: Text("Pick a section and subsection to see its articles.")
                )
            }
        }
    }
}

#Preview {
    NavigationStack {
        BrowseView()
            .environmentObject(AuthViewModel())
    }
}
