import SwiftUI

// MARK: - HomeFilterPicker
//
// Sheet content for the compact masthead's filter pill. Mirrors web's
// HomeFilterPill drawer (web/src/app/_home/HomeFilterPill.tsx) — three
// stacked cards: SCOPE / VIEW / TIME, plus a conditional Date Range row
// when TIME == .dateRange.
//
// Owner ask 2026-05-18: bottom-sheet form on iPhone so the user can
// dismiss with a swipe-down, and there's room to breathe for the three
// native iOS Pickers. The picker writes directly into a `Binding<HomeFilter>`
// and the parent's `.task(id:)` reloads the feed on any axis change.
struct HomeFilterPicker: View {
    let categories: [VPCategory]
    @Binding var filter: HomeFilter
    var onDismiss: () -> Void

    // Top-level cats (parent_id IS NULL), display-order sorted.
    private var topLevelCats: [VPCategory] {
        categories.filter { $0.categoryId == nil && ($0.visible ?? true) }
            .sorted { ($0.displayOrder ?? 999) < ($1.displayOrder ?? 999) }
    }

    // Active top-level parent — the active topic itself or its parent if
    // the active topic is a sub. Mirrors web `activeParent`.
    private var activeParent: VPCategory? {
        guard let slug = filter.topicSlug else { return nil }
        if let exact = categories.first(where: { $0.slug == slug }) {
            if exact.categoryId == nil { return exact }
            return categories.first(where: { $0.id == exact.categoryId })
        }
        return nil
    }

    private var activeSubcategories: [VPCategory] {
        guard let parent = activeParent else { return [] }
        return categories.filter { $0.categoryId == parent.id && ($0.visible ?? true) }
            .sorted { ($0.displayOrder ?? 999) < ($1.displayOrder ?? 999) }
    }

    // Currently selected sub (when filter.topicSlug points at a child).
    private var activeSubSlug: String? {
        guard let slug = filter.topicSlug,
              let exact = categories.first(where: { $0.slug == slug }),
              exact.categoryId != nil
        else { return nil }
        return slug
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    scopeCard
                    viewCard
                    timeCard
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
            }
            .background(VP.surfaceSunken.ignoresSafeArea())
            .navigationTitle("Filter feed")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    // 2026-05-18 — labelled "Explore" to mirror the web
                    // merged-pill's commit CTA. Native iOS behavior is
                    // already two-way binding (changes apply on pick), so
                    // this button dismisses the sheet rather than firing a
                    // separate commit; semantically it confirms the choice.
                    Button("Explore", action: onDismiss)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(VP.burgundy)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    // MARK: SCOPE card

    private var scopeCard: some View {
        card(label: "Scope") {
            VStack(alignment: .leading, spacing: 12) {
                pickerRow(title: "Category") {
                    Picker("Category", selection: parentSlugBinding) {
                        Text("Home").tag(String?.none)
                        ForEach(topLevelCats) { cat in
                            Text(cat.displayName).tag(Optional(cat.slug ?? ""))
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(VP.ink)
                }
                if !activeSubcategories.isEmpty {
                    pickerRow(title: "Subcategory") {
                        Picker("Subcategory", selection: subSlugBinding) {
                            Text("All").tag(String?.none)
                            ForEach(activeSubcategories) { sub in
                                Text(sub.displayName).tag(Optional(sub.slug ?? ""))
                            }
                        }
                        .pickerStyle(.menu)
                        .tint(VP.ink)
                    }
                }
            }
        }
    }

    // Binding for the SCOPE/category Picker. Reads as the active parent
    // slug, writes by clearing the sub and switching the topic slug.
    private var parentSlugBinding: Binding<String?> {
        Binding(
            get: { activeParent?.slug },
            set: { newSlug in
                var f = filter
                f.topicSlug = (newSlug?.isEmpty == false) ? newSlug : nil
                filter = f
            }
        )
    }

    // Binding for the SCOPE/subcategory Picker. nil = "All" (parent only).
    private var subSlugBinding: Binding<String?> {
        Binding(
            get: { activeSubSlug },
            set: { newSlug in
                guard let parent = activeParent else { return }
                var f = filter
                f.topicSlug = (newSlug?.isEmpty == false) ? newSlug : parent.slug
                filter = f
            }
        )
    }

    // MARK: VIEW card

    private var viewCard: some View {
        card(label: "View") {
            pickerRow(title: "View") {
                Picker("View", selection: $filter.view) {
                    ForEach(HomeFilter.View.allCases) { v in
                        Text(v.label).tag(v)
                    }
                }
                .pickerStyle(.menu)
                .tint(VP.ink)
            }
        }
    }

    // MARK: TIME card

    private var timeCard: some View {
        card(label: "Time") {
            VStack(alignment: .leading, spacing: 12) {
                pickerRow(title: "Time") {
                    Picker("Time", selection: $filter.time) {
                        ForEach(HomeFilter.Time.allCases) { t in
                            Text(t.label).tag(t)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(VP.ink)
                }
                if filter.time == .dateRange {
                    dateRangeRow
                }
            }
        }
    }

    private var dateRangeRow: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Text("From")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(VP.inkMuted)
                    .frame(width: 56, alignment: .leading)
                DatePicker(
                    "",
                    selection: fromDateBinding,
                    in: ...Date(),
                    displayedComponents: .date
                )
                .labelsHidden()
                .tint(VP.burgundy)
            }
            HStack(spacing: 12) {
                Text("To")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(VP.inkMuted)
                    .frame(width: 56, alignment: .leading)
                DatePicker(
                    "",
                    selection: toDateBinding,
                    in: ...Date(),
                    displayedComponents: .date
                )
                .labelsHidden()
                .tint(VP.burgundy)
            }
        }
        .padding(.top, 4)
    }

    // Date Range bindings — seed missing dates with sensible defaults so
    // the DatePicker has something to render the moment .dateRange flips
    // on. From = 30d ago, To = today.
    private var fromDateBinding: Binding<Date> {
        Binding(
            get: { filter.dateFrom ?? Calendar.current.date(byAdding: .day, value: -30, to: Date()) ?? Date() },
            set: { newVal in
                var f = filter
                f.dateFrom = newVal
                filter = f
            }
        )
    }
    private var toDateBinding: Binding<Date> {
        Binding(
            get: { filter.dateTo ?? Date() },
            set: { newVal in
                var f = filter
                f.dateTo = newVal
                filter = f
            }
        )
    }

    // MARK: Card chrome

    @ViewBuilder
    private func card<Content: View>(label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .tracking(1.0)
                .foregroundColor(VP.burgundy)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(VP.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(VP.borderSoft, lineWidth: 1)
        )
    }

    @ViewBuilder
    private func pickerRow<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 12) {
            Text(title)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(VP.inkMuted)
                .frame(width: 96, alignment: .leading)
            Spacer(minLength: 0)
            content()
        }
    }
}
