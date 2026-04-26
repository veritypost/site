# Change Log

Every change made during audit execution sessions. Format per entry:
- **What** — the specific change
- **Files** — files touched
- **Why** — the reason; OwnersAudit task reference where applicable

---

## 2026-04-26

### Leaderboard — OwnersAudit Tasks 1, 2, 3, 4

**Removed Weekly tab**
- **What** — Removed `'Weekly'` from the `TABS` constant and its corresponding data-fetch branch from the second `useEffect`. Weekly was a duplicate of Top Verifiers + This Week — identical RPC call, same cutoff, same results.
- **Files** — `web/src/app/leaderboard/page.tsx`
- **Why** — OwnersAudit Leaderboard Task 2. IA cleanup: tabs should answer "rank by what," not mix ranking mode with time window.

**Removed expand drawer; streak shown inline**
- **What** — Removed the tap-to-expand row drawer (5 `StatRow` bars: Score, Articles Read, Quizzes Passed, Comments, Streak). Rows are now static. Streak is surfaced inline below the username as `"{n} day streak"` when non-zero. Cleaned up all associated state (`expanded`, `setExpanded`), props (`onToggle`, `expanded`, `topScore`, `topReads`, `topQuizzes`, `topComments`, `topStreak`), the `StatRow` import, and the row-level ARIA button attributes (`role`, `tabIndex`, `onKeyDown`, `aria-expanded`).
- **Files** — `web/src/app/leaderboard/page.tsx`
- **Why** — OwnersAudit Leaderboard Task 1. Reduce chrome between page load and list content. The expand drawer added interaction overhead for stats that weren't the ranking criterion.

**Period filter pill touch target**
- **What** — Added `minHeight: 36` to period filter pill button style.
- **Files** — `web/src/app/leaderboard/page.tsx`
- **Why** — OwnersAudit Leaderboard Task 3. Pills rendered at ~26px with no minimum; 36px is the audit-specified floor for secondary filter pills inline with other controls.

**Period labels sentence case (web + iOS)**
- **What** — Changed `PERIOD_LABELS` from `['This Week', 'This Month', 'All Time']` to `['This week', 'This month', 'All time']`. Updated `WINDOW_DAYS` object keys to match. Updated all four string comparisons/references in `page.tsx`. Updated Swift enum `rawValue` strings to match.
- **Files** — `web/src/lib/leaderboardPeriod.ts`, `web/src/app/leaderboard/page.tsx`, `VerityPost/VerityPost/LeaderboardPeriod.swift`
- **Why** — OwnersAudit Leaderboard Task 4. Product standard is sentence case for all UI labels.
