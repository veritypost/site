import SwiftUI
import UIKit

/// One article row in the Browse pane-3 list.
///
/// Layout mirrors FindView's `storyRow`/`metaLine` (no thumbnail; meta on
/// top, serif title, optional excerpt). Decoration fields (reading time,
/// expert count, verified flag, source publisher) are surfaced when the
/// pane fetches them via the web API; PostgREST-direct rows leave them
/// nil and the meta line collapses gracefully.
struct BrowseArticleRow: View {
    let story: Story
    let decor: BrowseArticleDecor?
    let categoryName: String?
    let showExpertDepthOnTap: Bool

    /// Tap on the "N experts" meta chip. When `showExpertDepthOnTap` is
    /// true the parent fetches `/api/directory/expert-coverage` and shows
    /// the expert sheet; when false it surfaces the upsell.
    var onTapExperts: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            metaLine
            Text(story.title ?? "Untitled")
                .font(.system(size: 17, weight: .medium, design: .serif))
                .tracking(-0.17)
                .foregroundColor(VP.text)
                .multilineTextAlignment(.leading)
                .lineLimit(2)
            if let excerpt = story.excerpt, !excerpt.isEmpty {
                Text(excerpt)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundColor(VP.muted)
                    .lineSpacing(2)
                    .multilineTextAlignment(.leading)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
        .contentShape(Rectangle())
    }

    // MARK: - Meta line

    @ViewBuilder
    private var metaLine: some View {
        let dateText = relativeDate(story.publishedAt)
        let publisher = decor?.sourceName
        let readMin = decor?.readingTimeMinutes
        let expertCount = decor?.expertCount ?? 0

        HStack(spacing: 6) {
            if let dateText {
                metaChip(dateText.uppercased())
            }
            if let publisher, !publisher.isEmpty {
                metaSep
                metaChip(publisher.uppercased())
            } else if let cat = categoryName, !cat.isEmpty {
                metaSep
                metaChip(cat.uppercased())
            }
            if let readMin, readMin > 0 {
                metaSep
                metaChip("\(readMin)M READ")
            }
            if expertCount > 0 {
                metaSep
                expertChip(count: expertCount)
            }
            Spacer(minLength: 0)
        }
    }

    private func metaChip(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold, design: .monospaced))
            .tracking(1.0)
            .foregroundColor(VP.muted)
    }

    @ViewBuilder
    private var metaSep: some View {
        Text("\u{00B7}")
            .font(.system(size: 11, weight: .semibold, design: .monospaced))
            .foregroundColor(VP.muted)
    }

    private func expertChip(count: Int) -> some View {
        // Tappable when `onTapExperts` is provided. The count text reads
        // "N EXPERTS" or "1 EXPERT".
        let label = "\(count) \(count == 1 ? "EXPERT" : "EXPERTS")"
        return Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            onTapExperts?()
        } label: {
            Text(label)
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .tracking(1.0)
                .foregroundColor(showExpertDepthOnTap ? VP.brand : VP.muted)
                .padding(.vertical, 2)
                .padding(.horizontal, 4)
                .background(
                    showExpertDepthOnTap
                        ? VP.brand.opacity(0.08)
                        : Color.clear
                )
                .cornerRadius(3)
        }
        .buttonStyle(.plain)
        .disabled(onTapExperts == nil)
    }

    // MARK: - Date helper

    private static let fallbackFmt: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f
    }()

    private func relativeDate(_ date: Date?) -> String? {
        guard let date else { return nil }
        let secs = Date().timeIntervalSince(date)
        if secs < 60 { return "just now" }
        let mins = Int(secs / 60)
        if mins < 60 { return "\(mins)m ago" }
        let hours = mins / 60
        if hours < 24 { return "\(hours)h ago" }
        let days = hours / 24
        if days < 7 { return "\(days)d ago" }
        return BrowseArticleRow.fallbackFmt.string(from: date)
    }
}
