import Foundation

// Shared leaderboard period model — web + iOS keep the same 3-case
// canonical set: This Week / This Month / All Time, all rolling
// (now - 7d, now - 30d, nil). Mirrors `web/src/lib/leaderboardPeriod.ts`.
//
// Replaces the prior calendar-bucket math
// (`Calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], …)`)
// which produced different "This Week" answers from the web's rolling
// 7-day window.

enum LeaderboardPeriod: String, CaseIterable, Identifiable {
    case thisWeek = "This week"
    case thisMonth = "This month"
    case allTime = "All time"

    var id: String { rawValue }

    /// Rolling cutoff for the window. Returns `nil` for `.allTime`
    /// (caller should skip the date filter entirely).
    func since(date now: Date = Date()) -> Date? {
        switch self {
        case .thisWeek:  return now.addingTimeInterval(-7 * 86_400)
        case .thisMonth: return now.addingTimeInterval(-30 * 86_400)
        case .allTime:   return nil
        }
    }
}
