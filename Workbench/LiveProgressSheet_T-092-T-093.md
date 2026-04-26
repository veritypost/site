# LiveProgressSheet — T-092 / T-093 — Leaderboard podium styling + sticky user rank
Started: 2026-04-26

## User Intent
T-092: Style top 3 leaderboard rows with podium treatment — gold/silver/bronze accent color on rank badge for ranks 1/2/3, slightly larger row padding for top 3. Web + iOS parity.
T-093: Sticky user rank bar pinned at bottom while scrolling — renders when user has a rank in the loaded list. Uses existing `myRank` state (web) / `users.firstIndex` lookup (iOS). Web: `position: fixed; bottom: 0`. iOS: `.safeAreaInset(edge: .bottom)`.
Bonus: Fix `ISO8601DateFormatter()` inline instantiation at LeaderboardView.swift lines 519 and 542 — promote to file-scope static.

## Live Code State
### web/src/app/leaderboard/page.tsx
- `LeaderRow` component at line 840; `rankColor` prop flows to rank badge `<span>` color at line 879
- All top-3 call sites pass `rankColor="var(--accent)"` (flat black) — no podium color exists
- `myRank` state at line 116 — populated via findIndex at lines 299-306; used only in top-of-page inline "Your rank" card (line 326-358)
- No `position: fixed` bar anywhere in the file
- Outer container `padding: '20px 16px 80px'` (line 321) — 80px bottom already accommodates sticky bar
- Existing zIndex: 3 at lines 635 and 774 (blur overlay cards) — sticky bar at zIndex 100 clears these

### VerityPost/VerityPost/LeaderboardView.swift
- `leaderboardRow` at line 316; rank rendered at line 335 with `foregroundColor(idx < 3 ? VP.accent : VP.dim)` — single color for all top-3
- `yourRankCard` at line 276 — scrolls with content, NOT sticky
- `Spacer().frame(height: 100)` at line 254 — bottom spacer
- `ISO8601DateFormatter()` inlined at lines 519 and 542 (per-call allocation)
- `.safeAreaInset` pattern already used in ContentView.swift:201 for tab bar — safe to use here too

## Contradictions
None found.

## Agent Votes
- Planner: APPROVE
- Reviewer: APPROVE
- Final Reviewer: APPROVE
- Consensus: 3/3 APPROVE

## 4th Agent (if needed)
[filled only if vote is split]

## Implementation Progress
[filled by background agents during execution]

## Completed
[SHIPPED block written here when done]
