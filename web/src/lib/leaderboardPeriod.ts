// Shared leaderboard period model — web + iOS keep the same 3-case
// canonical set: This Week / This Month / All Time, all rolling
// (now - 7d, now - 30d, null). Matches `LeaderboardPeriod.swift`.
//
// Inline `d.setDate(d.getDate() - 30)` math + iOS calendar-bucket
// (`yearForWeekOfYear`, `weekOfYear`) was inconsistent across surfaces;
// this helper is the single source of truth.

export const PERIOD_LABELS = ['This Week', 'This Month', 'All Time'] as const;
export type Period = (typeof PERIOD_LABELS)[number];

const DAY_MS = 86_400_000;
const WINDOW_DAYS: Record<Period, number | null> = {
  'This Week': 7,
  'This Month': 30,
  'All Time': null,
};

/**
 * Rolling cutoff for a leaderboard window. Returns `null` for All Time
 * (caller should skip the cutoff filter entirely).
 */
export function periodSince(period: Period, now: Date = new Date()): Date | null {
  const days = WINDOW_DAYS[period];
  if (days == null) return null;
  return new Date(now.getTime() - days * DAY_MS);
}
