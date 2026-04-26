# LiveProgressSheet — T-088: Add proactive bookmark cap counter
Started: 2026-04-26 11:45:27

## User Intent
T-088: Add a proactive bookmark cap counter that appears when free users reach 50%+ of their bookmark cap (items.length >= bookmarkCap * 0.5). Counter should be a subtle inline text indicator near the bookmarks header — not a banner. Escalation: different visual treatment at 7/9 of cap. Both web and iOS. Use existing `bookmarkCap` and `items.length` state values. LockedFeatureCTA is not yet built (T-044 pending) — do not use it.

Task def says "visible from save #1" but user's explicit instruction says "at 50%+" — follow user instruction.

## Live Code State

### web/src/app/bookmarks/page.tsx
- Line 15: `const FALLBACK_BOOKMARK_CAP = 10` — safety fallback
- Line 76: `const [bookmarkCap, setBookmarkCap] = useState<number>(FALLBACK_BOOKMARK_CAP)` — in state
- Line 92: `const atCap = !canUnlimited && items.length >= bookmarkCap` — atCap computed
- Lines 329–338: h1 already shows `${items.length} of ${bookmarkCap}` for free users when activeCollection === 'all', always (not just at 50%). Collection filter path shows `${filtered.length} of ${items.length}`.
- Lines 356–366: Full-cap banner only shown when `atCap`. Banner includes upgrade CTA link.
- No escalation styling exists (no amber at 7, no red at 9).
- No secondary counter element near the header — just the h1 count text.

### VerityPost/VerityPost/BookmarksView.swift
- Line 25: `private var atCap: Bool { isFreeTier && items.count >= 10 }` — hardcodes 10 (not using a state variable)
- Line 97: `let counter = isFreeTier ? "\(items.count) of 10" : "\(items.count)"` — hardcodes 10
- Line 98: "Saved articles · X of 10" always shown in header for free users
- Lines 41–49: Full-cap banner only when atCap
- No escalation styling, no dedicated counter element

### Helper Brief — What "done correctly" looks like
1. Web: Add a styled counter text element in the header div (near h1, or below it) that:
   - Only renders when `!canUnlimited && items.length >= Math.floor(bookmarkCap * 0.5)`
   - Shows `${items.length} of ${bookmarkCap}` with subtle styling
   - Escalates: different color at items.length >= 7 (amber-ish), warmer/bolder at items.length >= 9 (near-danger)
   - Is NOT the atCap full banner — subtler; the banner still fires at cap
   - Since h1 already shows X of Y for free users: the counter is the *escalation* — conditionally styled hint text or a progress indicator

2. iOS: Same escalation logic:
   - `isFreeTier && items.count >= (10/2)` = at 5+ show styled counter
   - Counter text or color change in headerRow at 5+, 7+, 9+ thresholds
   - Line 97 already shows "X of 10" in header — add escalation color

3. No new imports, no new components, no DB changes
4. No LockedFeatureCTA (not built yet)
5. tsc must pass; xcodebuild must pass

### Risks
- Web: h1 already shows "X of 10" always for free users — adding another counter element would duplicate. Resolution: the escalation IS the new element — add a small styled counter only visible at >=50%, positioned near the header, styled with color escalation. The h1 text shows the count but has no visual urgency — the new counter adds that.
- iOS: cap hardcoded as 10 everywhere — consistent with existing code; this task doesn't change the cap source, just adds escalation display
- atCap banner (full cap) must remain — this task adds a pre-cap warning, not a replacement

## Contradictions
[filled by any agent that finds a conflict between the plan and live code]
Format: Agent name | File:line | Expected | Actual | Impact

## Agent Votes
- Planner: APPROVE
- Reviewer: APPROVE (with note: use secondary caption line for iOS instead of Text concatenation)
- Final Reviewer: APPROVE
- Consensus: 3/3 APPROVE

## 4th Agent (if needed)
[filled only if vote is split]

## Implementation Progress
Status: IMPLEMENTATION COMPLETE — pending review
Queued at: 2026-04-26 11:46:00

2026-04-26 11:52 — Changed web/src/app/bookmarks/page.tsx:92 — Added nearCap (>=50% cap) and capCounterTone ('neutral'|'amber'|'danger') derived values after atCap
2026-04-26 11:52 — Changed web/src/app/bookmarks/page.tsx:349–369 — Added nearCap-gated <span> counter in header flex row; shows "X / Y bookmarks" with escalating color (neutral gray, amber at cap-3, red at cap-1)
2026-04-26 11:52 — Changed VerityPost/VerityPost/BookmarksView.swift:25 — Added nearCap (isFreeTier && count >= 5) and capToneColor (VP.dim / amber / danger) computed properties after atCap
2026-04-26 11:52 — Changed VerityPost/VerityPost/BookmarksView.swift:103 — Wrapped headerRow HStack in VStack(spacing:2); added conditional "X / 10 free bookmarks" caption2 line in capToneColor when nearCap

tsc: PASS
xcodebuild: Pre-existing failure (missing possibleChanges/*.html bundle resources — not introduced by T-088, confirmed via git stash test). No Swift compiler errors.

## Completed
[SHIPPED block written here when done]
