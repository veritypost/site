import SwiftUI
import UIKit

/// Pane 2 of the iPhone Browse slider — subcategories of the selected
/// section, plus the sort pill ("Latest | Trending"). Tap on a sub (or
/// the "All of <section>" affordance) calls `state.selectSubcategory(_:)`,
/// which animates the slider to pane 3.
///
/// Flat-section path (selectCategory found no subs) is handled in
/// `BrowseState` directly — the controller advances straight to pane 3
/// and this pane is never rendered for that case in practice (only
/// briefly during the load-empty transition).
struct BrowseSubcategoriesPane: View {
    @ObservedObject var state: BrowseState
    /// iPad split-view: tap mutates the parent's split-binding instead of
    /// advancing paneIndex (which the slider doesn't use on iPad).
    var splitSelectedSubcategory: Binding<VPCategory?>? = nil

    @State private var showTrendingUpsell: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            sortPill
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            Divider().background(VP.border)
            content
        }
        .sheet(isPresented: $showTrendingUpsell) {
            trendingUpsellSheet
                .presentationDetents([.medium])
        }
    }

    // MARK: - Sort pill

    private var sortPill: some View {
        HStack(spacing: 8) {
            sortPillButton(.recent, locked: false)
            sortPillButton(.trending, locked: !state.canTrendingSort)
            Spacer()
        }
    }

    private func sortPillButton(_ value: BrowseSort, locked: Bool) -> some View {
        let isActive = state.sort == value
        return Button {
            if locked {
                UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
                showTrendingUpsell = true
                return
            }
            Task { await state.setSort(value) }
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
        if state.isLoadingSubcategories {
            VStack(spacing: 12) {
                ProgressView()
                Text("Loading subsections\u{2026}")
                    .font(.footnote)
                    .foregroundColor(VP.dim)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let err = state.subcategoriesError {
            errorView(err)
        } else if state.subcategories.isEmpty {
            // Brief — BrowseState.selectCategory auto-advances to pane 3
            // when the load resolves empty, so this state only flashes
            // for the in-between moment.
            VStack(spacing: 10) {
                if let name = state.selectedCategory?.name {
                    Text("Opening \u{201C}\(name)\u{201D}\u{2026}")
                        .font(.footnote)
                        .foregroundColor(VP.dim)
                }
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
                allRow
                Divider().background(VP.border)
                ForEach(state.subcategories) { sub in
                    subcategoryRow(sub)
                    Divider().background(VP.border)
                }
            }
        }
    }

    private var allRow: some View {
        Group {
            if let binding = splitSelectedSubcategory {
                // iPad split path — flip the binding.
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    binding.wrappedValue = nil
                } label: {
                    rowLabel(
                        name: "All of \(state.selectedCategory?.name ?? "section")",
                        active: binding.wrappedValue == nil,
                        italic: true
                    )
                }
                .buttonStyle(.plain)
            } else {
                Button {
                    Task { await state.selectSubcategory(nil) }
                } label: {
                    rowLabel(
                        name: "All of \(state.selectedCategory?.name ?? "section")",
                        active: false,
                        italic: true
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func subcategoryRow(_ sub: VPCategory) -> some View {
        Group {
            if let binding = splitSelectedSubcategory {
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
                Button {
                    Task { await state.selectSubcategory(sub) }
                } label: {
                    rowLabel(name: sub.name, active: false, italic: false)
                }
                .buttonStyle(.plain)
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
                if let cat = state.selectedCategory {
                    Task { await state.selectCategory(cat) }
                }
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
    }
}
