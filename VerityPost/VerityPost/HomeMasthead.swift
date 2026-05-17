import SwiftUI

// MARK: - HomeFilter
//
// State shape for the inline catbar + filter strip masthead. Mirrors web's
// vp-rh-masthead query params: ?<chip-key> for sort/time chips, /<slug>
// path for active topic. `topicSlug` is the slug of the currently selected
// top-level OR sub-category (web treats subcategories as first-class
// active topics — see HomeLayout.tsx activeCat lookup).
//
// "chip" covers time-window filters (today / this_week / developing /
// updated_recently / newest_article). "sort" covers the right-hand sort
// chips (most_discussed / most_recent_comments / most_viewed). "questions"
// is its own boolean because web routes it as `/?questions` and it can
// stack with a topic. Mutually exclusive within group is enforced at the
// tap site, not by the data shape — keeps loadData simple.
struct HomeFilter: Equatable, Hashable {
    var topicSlug: String? = nil
    var chip: String? = nil
    var sort: String? = nil
    var questions: Bool = false

    var isAll: Bool { topicSlug == nil && chip == nil && sort == nil && !questions }
}

// MARK: - HomeMasthead
//
// Compact-width-only masthead that mirrors the web mobile masthead
// structure (web/src/app/_home/HomeLayout.tsx + styles.tsx vp-rh-masthead).
// Rows: wordmark+auth · search pill · catbar · filter strip · (optional)
// subcategory strip. The whole block sits on VP.surface with rounded
// corners + 1pt VP.borderSoft hairlines between rows.
//
// Wired in HomeView only when horizontalSizeClass == .compact. Regular
// width (iPad) keeps the legacy `topBar` + modal HomeSectionsSheet path
// untouched per owner ask.
struct HomeMasthead: View {
    @EnvironmentObject var auth: AuthViewModel
    let categories: [VPCategory]
    @Binding var filter: HomeFilter
    /// Theme cycle binding — same @AppStorage key the legacy topBar uses.
    @Binding var vpTheme: String
    /// Tap forwards into FindView for now. Owner ask: search is being
    /// reworked separately, push to FindView rather than over-invest on an
    /// inline dropdown in this pass.
    var onTapSearch: () -> Void
    var onSignIn: () -> Void
    var onSignOut: () -> Void

    private static let filterItems: [FilterItem] = [
        .chip(key: "today", label: "Today"),
        .chip(key: "this_week", label: "This week"),
        .chip(key: "developing", label: "Developing"),
        .chip(key: "updated_recently", label: "Recent updates"),
        .chip(key: "newest_article", label: "Recently posted"),
        .separator,
        .sort(key: "most_discussed", label: "Most discussed"),
        .sort(key: "most_recent_comments", label: "Most recent comments"),
        .sort(key: "most_viewed", label: "Most viewed"),
        .questions(key: "questions", label: "Questions"),
    ]

    var body: some View {
        VStack(spacing: 0) {
            wordmarkRow
            Rectangle().fill(VP.borderSoft).frame(height: 1)
            searchRow
            Rectangle().fill(VP.borderSoft).frame(height: 1)
            catbarRow
            Rectangle().fill(VP.borderSoft).frame(height: 1)
            filterRow
            if let subs = activeSubcategories, !subs.isEmpty {
                Rectangle().fill(VP.borderSoft).frame(height: 1)
                subcategoryRow(subs)
            }
        }
        .background(VP.surface)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(VP.borderSoft, lineWidth: 1)
        )
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    // MARK: Row 1 — wordmark + auth controls

    private var wordmarkRow: some View {
        HStack(spacing: 12) {
            Text("Verity Post")
                .font(.system(size: 22, weight: .regular, design: .serif))
                .foregroundColor(VP.ink)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
            Spacer()
            // Theme cycle — preserved from legacy topBar so the inline
            // masthead keeps feature parity for compact width.
            Button {
                switch vpTheme {
                case "system": vpTheme = "light"
                case "light":  vpTheme = "dark"
                default:       vpTheme = "system"
                }
            } label: {
                Image(systemName: {
                    switch vpTheme {
                    case "light": return "sun.max.fill"
                    case "dark":  return "moon.fill"
                    default:      return "circle.lefthalf.filled"
                    }
                }())
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(VP.ink)
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel({
                switch vpTheme {
                case "light": return "Theme: Light"
                case "dark":  return "Theme: Dark"
                default:      return "Theme: System"
                }
            }())

            if auth.isLoggedIn {
                AvatarView(user: auth.currentUser, size: 28)
                Button("Sign out", action: onSignOut)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(VP.inkDim)
                    .buttonStyle(.plain)
            } else {
                Button(action: onSignIn) {
                    Text("Sign in")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .background(
                            Capsule().fill(VP.burgundy)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    // MARK: Row 2 — search pill

    private var searchRow: some View {
        Button(action: onTapSearch) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(VP.inkDim)
                Text("Search stories, topics, people…")
                    .font(.system(size: 14))
                    .foregroundColor(VP.inkDim)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                Capsule().fill(VP.bg)
            )
            .overlay(
                Capsule().stroke(VP.border, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .accessibilityLabel("Search")
    }

    // MARK: Row 3 — catbar (All + top categories)

    private var topLevelCats: [VPCategory] {
        categories.filter { $0.categoryId == nil && ($0.visible ?? true) }
            .sorted { ($0.displayOrder ?? 999) < ($1.displayOrder ?? 999) }
    }

    /// Active top-level category — either the active topic itself or its
    /// parent if the active topic is a subcategory. Mirrors web activeParent.
    private var activeParent: VPCategory? {
        guard let slug = filter.topicSlug else { return nil }
        if let exact = categories.first(where: { $0.slug == slug }) {
            if exact.categoryId == nil { return exact }
            return categories.first(where: { $0.id == exact.categoryId })
        }
        return nil
    }

    private var activeSubcategories: [VPCategory]? {
        guard let parent = activeParent else { return nil }
        let subs = categories.filter { $0.categoryId == parent.id && ($0.visible ?? true) }
            .sorted { ($0.displayOrder ?? 999) < ($1.displayOrder ?? 999) }
        return subs.isEmpty ? nil : subs
    }

    private var catbarRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 18) {
                catbarLink(label: "All", isActive: filter.isAll) {
                    filter = HomeFilter()
                }
                ForEach(topLevelCats) { cat in
                    catbarLink(
                        label: cat.displayName,
                        isActive: activeParent?.id == cat.id
                    ) {
                        var f = filter
                        f.topicSlug = cat.slug
                        filter = f
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
    }

    @ViewBuilder
    private func catbarLink(label: String, isActive: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Text(label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(isActive ? VP.burgundy : VP.ink)
                    .lineLimit(1)
                Rectangle()
                    .fill(isActive ? VP.burgundy : Color.clear)
                    .frame(height: 1.5)
            }
        }
        .buttonStyle(.plain)
        .fixedSize(horizontal: true, vertical: false)
    }

    // MARK: Row 4 — filter strip (chips + separator)

    private var filterRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(Array(Self.filterItems.enumerated()), id: \.offset) { _, item in
                    switch item {
                    case .separator:
                        Rectangle()
                            .fill(VP.borderSoft)
                            .frame(width: 1, height: 14)
                            .padding(.horizontal, 2)
                    case .chip(let key, let label):
                        filterChip(label: label, isActive: filter.chip == key) {
                            var f = filter
                            f.chip = (f.chip == key) ? nil : key
                            filter = f
                        }
                    case .sort(let key, let label):
                        filterChip(label: label, isActive: filter.sort == key) {
                            var f = filter
                            f.sort = (f.sort == key) ? nil : key
                            filter = f
                        }
                    case .questions(_, let label):
                        filterChip(label: label, isActive: filter.questions) {
                            var f = filter
                            f.questions.toggle()
                            filter = f
                        }
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
    }

    @ViewBuilder
    private func filterChip(label: String, isActive: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 3) {
                Text(label.uppercased())
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .tracking(0.8)
                    .foregroundColor(isActive ? VP.burgundy : VP.inkDim)
                    .lineLimit(1)
                Rectangle()
                    .fill(isActive ? VP.burgundy : Color.clear)
                    .frame(height: 1.5)
            }
        }
        .buttonStyle(.plain)
        .fixedSize(horizontal: true, vertical: false)
    }

    // MARK: Row 5 — subcategory strip (conditional)

    @ViewBuilder
    private func subcategoryRow(_ subs: [VPCategory]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 16) {
                ForEach(subs) { sub in
                    let active = filter.topicSlug == sub.slug
                    Button {
                        var f = filter
                        f.topicSlug = sub.slug
                        filter = f
                    } label: {
                        VStack(spacing: 3) {
                            Text(sub.displayName)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(active ? VP.burgundy : VP.inkMuted)
                                .lineLimit(1)
                            Rectangle()
                                .fill(active ? VP.burgundy : Color.clear)
                                .frame(height: 1.5)
                        }
                    }
                    .buttonStyle(.plain)
                    .fixedSize(horizontal: true, vertical: false)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
        }
    }

    private enum FilterItem {
        case chip(key: String, label: String)
        case sort(key: String, label: String)
        case questions(key: String, label: String)
        case separator
    }
}
