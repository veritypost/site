import SwiftUI

// MARK: - HomeFilter
//
// State shape for the compact masthead's filter pill + Explore search.
// Mirrors web's HomeFilterPill contract (web/src/app/_home/HomeFilterPill.tsx
// + web/src/app/page.tsx CHIP_KEYS / SORT_KEYS / TYPE_KEYS) so the same
// filter state produces the same feed on both platforms.
//
// Three axes — SCOPE (topic/sub slugs), VIEW (8 options), TIME (4 options
// + a Date Range pair). `topicSlug == nil` means "Home" (no category
// filter); when topicSlug points at a sub, the parent rolls up via
// `subcategory_id` rather than `category_id` in the feed query.
struct HomeFilter: Equatable, Hashable {
    // VIEW — the 8 lenses that map to web's `sort` / `type` / chip-like-`view`
    // keys. Ordering matches the drawer.
    enum View: String, CaseIterable, Identifiable, Hashable {
        case top                 // default — no extra filter, no sort override
        case mostCommented       // sort comment_count desc nullsLast
        case mostViewed          // sort view_count desc nullsLast
        case new                 // published_at >= now - 24h
        case noDiscussion        // comment_count is null OR = 0
        case openQuestions       // articles with intent='question' comments
        case updatedTimelines    // sort updated_at desc (timelines-updated proxy)
        case newest              // sort published_at desc
        var id: String { rawValue }

        var label: String {
            switch self {
            case .top:              return "Top Stories"
            case .mostCommented:    return "Most Commented"
            case .mostViewed:       return "Most Viewed"
            case .new:              return "New"
            case .noDiscussion:     return "No Discussion Yet"
            case .openQuestions:    return "Open Questions"
            case .updatedTimelines: return "Updated Timelines"
            case .newest:           return "Newest"
            }
        }
    }

    // TIME — Today / Week / Month / explicit Date Range. dateRange writes
    // dateFrom + dateTo; the other three derive their lower bound from
    // calendar boundaries at load time.
    enum Time: String, CaseIterable, Identifiable, Hashable {
        case today
        case thisWeek
        case thisMonth
        case dateRange
        var id: String { rawValue }

        var label: String {
            switch self {
            case .today:     return "Today"
            case .thisWeek:  return "This Week"
            case .thisMonth: return "This Month"
            case .dateRange: return "Date Range"
            }
        }
    }

    var topicSlug: String? = nil      // nil = Home; otherwise resolves to a parent or sub
    var view: View = .top
    var time: Time = .today
    var dateFrom: Date? = nil         // only populated when time == .dateRange
    var dateTo: Date? = nil

    /// Default state — Home + Top + Today + no explicit dates. The
    /// home_layouts data path only renders for `isAll` since pinned slots
    /// are an editorial choice for All, not for an arbitrary slice.
    var isAll: Bool {
        topicSlug == nil
            && view == .top
            && time == .today
            && dateFrom == nil
            && dateTo == nil
    }

    // MARK: - Pill label
    //
    // Compact `Scope · View · Time` summary. Examples:
    //   - "Home · Top Stories · Today"
    //   - "Politics → Congress · Most Commented · This Month"
    //   - "Technology → AI · Newest · 09/01/25 → 09/30/25"
    func pillLabelParts(categories: [VPCategory]) -> (scope: String, view: String, time: String) {
        let scope = scopeLabel(categories: categories)
        let viewLabel = view.label
        let timeLabel: String
        if time == .dateRange, dateFrom != nil || dateTo != nil {
            timeLabel = "\(Self.shortDate(dateFrom)) → \(Self.shortDate(dateTo))"
        } else {
            timeLabel = time.label
        }
        return (scope, viewLabel, timeLabel)
    }

    private func scopeLabel(categories: [VPCategory]) -> String {
        guard let slug = topicSlug,
              let exact = categories.first(where: { $0.slug == slug })
        else { return "Home" }
        if let parentId = exact.categoryId,
           let parent = categories.first(where: { $0.id == parentId }) {
            return "\(parent.displayName) → \(exact.displayName)"
        }
        // Parent itself selected — show "<Parent> → All" to mirror web.
        return "\(exact.displayName) → All"
    }

    private static let shortDateFmt: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "MM/dd/yy"
        return f
    }()

    private static func shortDate(_ d: Date?) -> String {
        guard let d else { return "" }
        return shortDateFmt.string(from: d)
    }
}

// MARK: - HomeMasthead
//
// Compact-width-only masthead. Three rows:
//   1) Verity Post wordmark + theme + auth control
//   2) Filter pill — `Scope · View · Time`, taps open HomeFilterPicker sheet
//   3) Search pill + black "Explore" button — routes through FindView
//
// Mirrors web's home masthead after commit 318f98ec (replaced the
// catbar + filter strip with a single compact pill + standalone Explore
// search). iPad (regular hSize) keeps the legacy `topBar` path on the
// HomeView side — this view is never mounted there.
struct HomeMasthead: View {
    @EnvironmentObject var auth: AuthViewModel
    let categories: [VPCategory]
    @Binding var filter: HomeFilter
    /// Theme cycle binding — preserved on the call site for backwards
    /// compatibility with HomeView, but no longer surfaced in the masthead.
    /// 2026-05-18 owner-locked spec: no theme toggle in the global chrome;
    /// theme lives in Profile → Appearance.
    @Binding var vpTheme: String
    /// Tap target for the Explore button + search pill. The owner-deferred
    /// search rework lands separately — for now both controls push the
    /// existing FindView.
    var onTapSearch: () -> Void
    var onSignIn: () -> Void
    /// Preserved on the call site; not surfaced in the masthead. Sign-out
    /// lives in Profile (reachable via the bottom-nav Profile tab).
    var onSignOut: () -> Void

    @State private var showPicker = false

    var body: some View {
        VStack(spacing: 0) {
            wordmarkRow
            Rectangle().fill(VP.borderSoft).frame(height: 1)
            filterPillRow
            Rectangle().fill(VP.borderSoft).frame(height: 1)
            searchRow
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
        .sheet(isPresented: $showPicker) {
            HomeFilterPicker(
                categories: categories,
                filter: $filter,
                onDismiss: { showPicker = false }
            )
        }
    }

    // MARK: Row 1 — wordmark + auth controls

    private var wordmarkRow: some View {
        // 2026-05-18 owner-locked: lowercase wordmark, no theme toggle,
        // no sign-out, no avatar on mobile (Profile is reachable through
        // the bottom-nav Profile tab). Only an anon Sign-in pill rides
        // along on row 1 for parity with web mobile.
        HStack(spacing: 12) {
            Text("verity post")
                .font(.system(size: 22, weight: .regular, design: .serif))
                .foregroundColor(VP.ink)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
            Spacer()
            if !auth.isLoggedIn {
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

    // MARK: Row 2 — filter pill

    private var filterPillRow: some View {
        let parts = filter.pillLabelParts(categories: categories)
        return Button {
            showPicker = true
        } label: {
            HStack(spacing: 8) {
                Text(parts.scope)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(VP.ink)
                    .lineLimit(1)
                Text("·")
                    .font(.system(size: 13, weight: .regular))
                    .foregroundColor(VP.inkDim)
                Text(parts.view)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundColor(VP.inkSoft)
                    .lineLimit(1)
                Text("·")
                    .font(.system(size: 13, weight: .regular))
                    .foregroundColor(VP.inkDim)
                Text(parts.time)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundColor(VP.inkSoft)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(VP.inkDim)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(VP.surfaceSunken)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(VP.borderSoft, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .accessibilityLabel("Filter: \(parts.scope), \(parts.view), \(parts.time)")
        .accessibilityHint("Opens the filter picker")
    }

    // MARK: Row 3 — search pill + Explore button

    private var searchRow: some View {
        HStack(spacing: 8) {
            Button(action: onTapSearch) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(VP.inkDim)
                    Text("Search a topic, person, policy, place, or storyline…")
                        .font(.system(size: 13))
                        .foregroundColor(VP.inkDim)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    Capsule().fill(VP.surfaceSunken)
                )
                .overlay(
                    Capsule().stroke(VP.borderSoft, lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Search")

            // Explore — black pill button. Mirrors web's `.vp-rh-explore`
            // CTA on the masthead search row. Routes through the same
            // FindView handler as the pill tap (search rework deferred).
            Button(action: onTapSearch) {
                Text("Explore")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(
                        Capsule().fill(VP.ink)
                    )
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Explore")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }
}
