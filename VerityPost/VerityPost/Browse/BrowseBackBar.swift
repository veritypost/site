import SwiftUI

/// Top back-bar shown on panes 2 and 3 of the iPhone Browse slider.
/// Mirrors the web `.vp-directory-mobile-bar` look — small mono "← Back"
/// label + context title (parent section name). Tap dispatches
/// `BrowseState.goBack()`.
///
/// The slider sits inside a NavigationStack with its own large-title nav
/// bar (showing "Browse"), so this bar lives just below that — same row
/// padding as a list cell.
struct BrowseBackBar: View {
    @ObservedObject var state: BrowseState

    var body: some View {
        HStack(spacing: 10) {
            Button {
                state.goBack()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 12, weight: .bold))
                    Text("Back")
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .tracking(1.1)
                }
                .foregroundColor(VP.accent)
                .padding(.vertical, 10)
                .padding(.horizontal, 12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Back to \(backTargetLabel)")

            if let contextLabel {
                Text(contextLabel.uppercased())
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .tracking(1.2)
                    .foregroundColor(VP.muted)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 8)
        .background(VP.bg.opacity(0.96))
        .overlay(
            Rectangle()
                .fill(VP.border)
                .frame(height: 1),
            alignment: .bottom
        )
    }

    /// The right-aligned context chip. Pane 2 shows the section name (so
    /// the user knows which category's subs they're viewing); pane 3
    /// shows the subcategory name when one is selected, otherwise the
    /// section name.
    private var contextLabel: String? {
        switch state.paneIndex {
        case 1: return state.selectedCategory?.name
        case 2: return state.selectedSubcategory?.name ?? state.selectedCategory?.name
        default: return nil
        }
    }

    private var backTargetLabel: String {
        switch state.paneIndex {
        case 2:
            return state.subcategories.isEmpty
                ? "sections"
                : (state.selectedCategory?.name ?? "subsections")
        case 1: return "sections"
        default: return "sections"
        }
    }
}
