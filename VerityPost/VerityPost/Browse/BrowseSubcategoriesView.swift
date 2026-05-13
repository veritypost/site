import SwiftUI
import UIKit

/// Pane 2 of the Browse tab — subcategories of a parent + sort pill.
///
/// Subcategories are fetched fresh on appear so `article_count` stays
/// current. The sort pill ("Latest | Trending") is gated on the
/// `directory.sort_trending` permission key; locked taps surface a paywall
/// sheet instead of changing state.
///
/// "Flat" categories (no subcategory rows) skip pane 2 entirely — the
/// `BrowseArticlesView` pushes onto the same navigation stack as soon as
/// the empty-state load completes, so the user lands directly on the
/// article list. On iPad split-view the flat case still renders the pane
/// (with a "No subsections" notice) so the detail column has a visible
/// anchor.
struct BrowseSubcategoriesView: View {
    @EnvironmentObject var auth: AuthViewModel
    @ObservedObject private var perms = PermissionStore.shared
    @Environment(\.horizontalSizeClass) private var hClass
    @Environment(\.verticalSizeClass) private var vClass

    let category: VPCategory
    /// Bound from the iPad split-view parent so taps mutate the parent's
    /// selection state and the detail column re-renders. Nil on iPhone.
    var splitSelectedSubcategory: Binding<VPCategory?>? = nil

    @State private var subcategories: [VPCategory] = []
    @State private var sort: BrowseSort = .recent
    @State private var canTrendingSort: Bool = false
    @State private var isLoading: Bool = true
    @State private var error: String? = nil
    @State private var didPushFlat: Bool = false
    @State private var showTrendingUpsell: Bool = false

    private let client = SupabaseManager.shared.client

    private var isRegular: Bool {
        hClass == .regular && vClass == .regular
    }

    /// Two-way binding that gates the auto-push for flat categories. Only
    /// flips true on iPhone (compact) — the iPad split-view never pushes.
    private var flatPushBinding: Binding<Bool> {
        Binding(
            get: { !isRegular && didPushFlat },
            set: { didPushFlat = $0 }
        )
    }

    init(category: VPCategory, splitSelectedSubcategory: Binding<VPCategory?>? = nil) {
        self.category = category
        self.splitSelectedSubcategory = splitSelectedSubcategory
    }

    var body: some View {
        VStack(spacing: 0) {
            sortPill
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            Divider().background(VP.border)
            content
        }
        .navigationTitle(category.name)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: perms.changeToken) {
            await refreshPermissions()
        }
        .task {
            await loadSubcategories()
        }
        // Flat category path — once `isLoading=false` resolves with an
        // empty subcategories list, flip `didPushFlat=true` so the
        // `.navigationDestination(isPresented:)` below pushes
        // BrowseArticlesView for the category. Skipped on iPad split-view
        // (the detail column already handles the category-only state).
        .navigationDestination(isPresented: flatPushBinding) {
            BrowseArticlesView(
                category: category,
                subcategory: nil,
                sort: sort
            )
            .environmentObject(auth)
        }
        .sheet(isPresented: $showTrendingUpsell) {
            trendingUpsellSheet
        }
    }

    // MARK: - Sort pill

    private var sortPill: some View {
        HStack(spacing: 8) {
            sortPillButton(.recent, locked: false)
            sortPillButton(.trending, locked: !canTrendingSort)
            Spacer()
        }
    }

    private func sortPillButton(_ value: BrowseSort, locked: Bool) -> some View {
        let isActive = sort == value
        return Button {
            if locked {
                UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
                showTrendingUpsell = true
                return
            }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            sort = value
        } label: {
            HStack(spacing: 4) {
                if locked {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 10, weight: .bold))
                }
                Text(value.label)
                    .font(.system(.footnote, weight: isActive ? .semibold : .medium))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .foregroundColor(isActive ? .white : VP.dim)
            .background(isActive ? VP.breaking : Color(UIColor.secondarySystemBackground))
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(isActive ? Color.clear : VP.border, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if isLoading {
            VStack(spacing: 12) {
                ProgressView()
                Text("Loading subsections\u{2026}")
                    .font(.footnote)
                    .foregroundColor(VP.dim)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let err = error {
            errorView(err)
        } else if subcategories.isEmpty {
            // Flat category. On iPhone the NavigationLink in `.background`
            // takes over; this fallback view only briefly appears before
            // the push completes (or stays put on iPad where there's no
            // push to make).
            VStack(spacing: 10) {
                Text("Opening \u{201C}\(category.name)\u{201D}\u{2026}")
                    .font(.footnote)
                    .foregroundColor(VP.dim)
                ProgressView()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            subcategoryList
        }
    }

    private var subcategoryList: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                // "All of <category>" affordance — pushes/selects the
                // category-only article list without picking a subsection.
                allRow
                Divider().background(VP.border)
                ForEach(subcategories) { sub in
                    subcategoryRow(sub)
                    Divider().background(VP.border)
                }
            }
        }
    }

    private var allRow: some View {
        Group {
            if isRegular, let binding = splitSelectedSubcategory {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    binding.wrappedValue = nil
                } label: {
                    rowLabel(name: "All of \(category.name)", active: binding.wrappedValue == nil, italic: true)
                }
                .buttonStyle(.plain)
            } else {
                NavigationLink {
                    BrowseArticlesView(category: category, subcategory: nil, sort: sort)
                        .environmentObject(auth)
                } label: {
                    rowLabel(name: "All of \(category.name)", active: false, italic: true)
                }
                .buttonStyle(.plain)
                .simultaneousGesture(TapGesture().onEnded {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                })
            }
        }
    }

    private func subcategoryRow(_ sub: VPCategory) -> some View {
        Group {
            if isRegular, let binding = splitSelectedSubcategory {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    binding.wrappedValue = sub
                } label: {
                    rowLabel(
                        name: sub.name,
                        active: binding.wrappedValue?.id == sub.id,
                        italic: false
                    )
                }
                .buttonStyle(.plain)
            } else {
                NavigationLink {
                    BrowseArticlesView(category: category, subcategory: sub, sort: sort)
                        .environmentObject(auth)
                } label: {
                    rowLabel(name: sub.name, active: false, italic: false)
                }
                .buttonStyle(.plain)
                .simultaneousGesture(TapGesture().onEnded {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                })
            }
        }
    }

    private func rowLabel(name: String, active: Bool, italic: Bool) -> some View {
        HStack(spacing: 12) {
            Rectangle()
                .fill(active ? VP.breaking : Color.clear)
                .frame(width: 2)
            Text(name)
                .font(
                    italic
                    ? .system(size: 16, weight: .regular, design: .serif).italic()
                    : .system(size: 16, weight: .medium, design: .serif)
                )
                .foregroundColor(VP.text)
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(VP.muted)
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
        .contentShape(Rectangle())
    }

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .foregroundColor(VP.danger)
            Text(msg)
                .font(.footnote)
                .foregroundColor(VP.dim)
            Button("Try again") {
                Task { await loadSubcategories() }
            }
            .font(.system(.footnote, weight: .semibold))
            .foregroundColor(VP.accent)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Trending upsell

    private var trendingUpsellSheet: some View {
        VStack(spacing: 18) {
            Spacer().frame(height: 12)
            Image(systemName: "chart.line.uptrend.xyaxis")
                .font(.system(size: 32, weight: .semibold))
                .foregroundColor(VP.brand)
            Text("Trending sort is a Verity feature")
                .font(.system(size: 19, weight: .semibold, design: .serif))
                .foregroundColor(VP.text)
                .multilineTextAlignment(.center)
            Text("Upgrade to Verity to sort sections by what readers are actually reading right now.")
                .font(.footnote)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 28)
            Button {
                showTrendingUpsell = false
            } label: {
                Text("Maybe later")
                    .font(.system(.footnote, weight: .medium))
                    .foregroundColor(VP.dim)
            }
            Spacer()
        }
        .padding(.top, 28)
        .presentationDetents([.medium])
    }

    // MARK: - Networking

    private func loadSubcategories() async {
        await MainActor.run {
            isLoading = true
            error = nil
        }
        do {
            let rows: [VPCategory] = try await client
                .from("categories")
                .select()
                .eq("parent_id", value: category.id)
                .eq("is_kids_safe", value: false)
                .is("deleted_at", value: nil)
                .order("sort_order")
                .order("name")
                .execute()
                .value
            await MainActor.run {
                subcategories = rows
                isLoading = false
                // Auto-push for the flat-category case on iPhone. The
                // first time the load resolves empty, flip didPushFlat
                // true so the hidden NavigationLink fires once.
                if !isRegular && rows.isEmpty && !didPushFlat {
                    didPushFlat = true
                }
            }
        } catch {
            Log.d("BrowseSubcategoriesView load failed:", error)
            await MainActor.run {
                self.error = "Couldn\u{2019}t load subsections."
                isLoading = false
            }
        }
    }

    private func refreshPermissions() async {
        let trending = await PermissionService.shared.has("directory.sort_trending")
        await MainActor.run {
            canTrendingSort = trending
            // If the user lost the perm mid-session (downgrade), snap
            // back to Latest so the API call doesn't get silently degraded
            // out from under them.
            if !trending && sort == .trending {
                sort = .recent
            }
        }
    }
}
