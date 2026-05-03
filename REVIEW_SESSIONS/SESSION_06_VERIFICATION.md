# Session 6 — End-to-End Verification + CLAUDE.md Cleanup

**You are the architect for this session.** Fresh conversation. Read this doc, then `/Users/veritypost/Desktop/verity-post/REVIEW_REPORT.md` (the entire file — synthesis at top, all PM sections, all CLOSED markers from Sessions 1-5), then start.

## Prerequisite

Sessions 1, 2, 3, 4, 5 marked complete. This session does NOT fix anything new — it verifies.

## Why a dedicated verification session

Multi-session refactors drift. State written in Session 1 may have been silently overwritten in Session 4. A finding closed in Session 2 may have regressed in Session 5. This session catches that.

## Mandatory reads

1. `REVIEW_REPORT.md` — entire file.
2. All five `SESSION_0X_*.md` `## Status` blocks.
3. `/Users/veritypost/Desktop/CLAUDE.md` — kill-switch inventory.
4. Owner memory:
   - `feedback_verify_audit_findings_before_acting.md` — verify against current state, especially Swift `.modifier()` calls.
   - `feedback_understand_before_acting.md`.

## Scope

This session has 4 mandatory passes:

### Pass 1 — Re-verify every CLOSED finding
For each `> CLOSED in Session N` marker in `REVIEW_REPORT.md`, dispatch a finding-verifier subagent that reads the current code and confirms the issue genuinely no longer exists. Drop the marker for any that regressed; surface a P0 alert for the owner.

### Pass 2 — Independent re-run of the original PM-N reviews on the cleaned codebase
Dispatch 5 fresh general-purpose PMs (one per surface cluster), each with 3-4 specialized subagents. Same scope split as Tier-A from the original review:

| PM | Surface |
|---|---|
| **VPM-1: Web (public + appshell + admin)** | Combines original PM-1 + PM-2 + PM-3 scope |
| **VPM-2: Web APIs + pipeline + cron** | Combines original PM-4 + PM-9 |
| **VPM-3: Billing + iOS bridge + DB/RLS** | Combines original PM-5 + PM-8 |
| **VPM-4: iOS adult + iOS kids** | Combines original PM-6 + PM-7 |
| **VPM-5: Cross-platform parity** | Original PM-10 scope, plus a CLAUDE.md kill-switch audit |

Each VPM only logs **NEW** findings (anything not already in the original report). Cap each at 25 findings to keep noise down. If the count comes in under 5 per VPM, that's a healthy signal.

### Pass 3 — CLAUDE.md kill-switch cleanup
Per PM-10's audit + locked Q-decisions: rows #1, #3, #4, #5 are stale; **add row #11 per Q09**. Edit `/Users/veritypost/Desktop/CLAUDE.md`:
- **Row #1** (`PUBLIC_PROFILE_ENABLED`) — flag is already `true`. Remove or mark as "re-enabled — kept for documentation."
- **Row #2** — tighten cite (`/profile/[id]/page.tsx` is pure redirect, doesn't reference flag).
- **Row #3** — only valid if Session 5 re-enabled the share-link block. If yes, remove. If no, mark as active bug pending.
- **Row #4** — add iOS counterpart `VPOAuthEnabled` at `VerityPost/VerityPost/AuthViewModel.swift:48`. Note both flags must flip together.
- **Row #5** (Q12c locked) — flag is now `false`. Update row line number `305 → 340`. Keep the row.
- **Row #11 (NEW, Q09 locked)** — append: `| 11 | Web Push notifications | Not built — iOS-only by design | n/a (no scaffolding) | Build out service worker + VAPID + cron webpush branch when web returns warrant it |`.

### Pass 4 — Final report consolidation
Edit the synthesis at the top of `REVIEW_REPORT.md`:
- Replace the original counts with: total findings closed / refuted / regressed.
- List every NEW finding from Pass 2 (the VPMs) under a `## Session 6 — Net-new findings` heading.
- Mark the synthesis as `Last updated: <date>, post-cleanup`.

## Orchestration

Run all 5 VPMs in parallel as background general-purpose agents. Pass 1 (re-verification) can run as one finding-verifier batch in parallel with the VPMs. Pass 3 (CLAUDE.md edit) only runs after Pass 1 completes (to know which kill-switch rows are now correct). Pass 4 runs last.

## Verification gates (meta-verification)

1. **Build-verifier** — type-check, lint, Xcode build. The codebase must build cleanly across all 5 sessions of edits.
2. **Smoke-tester** — exercise the golden path: anon → sign-up → magic-link → home → story → comment → bookmark → leaderboard → settings → email-change → cancel-subscription. Capture console errors.
3. **Cross-session regression check** — run the build-verifier sentinels from each session against current code. Anything that was cleaned in Session N should still be clean.

## Done definition

- Every `CLOSED` marker re-verified or downgraded with evidence.
- VPMs reported in (5 sections appended). Net-new findings listed.
- `CLAUDE.md` kill-switch inventory rewritten and verified.
- `REVIEW_REPORT.md` synthesis updated with final post-cleanup numbers.
- A final `## Status` block on this file containing: total closed, total refuted, total regressed, total net-new, recommendation for the owner.

## Recommendation block (final output to owner)

End with one section addressed to the owner:
- "Cleanup complete. N P0s closed. K net-new P1s discovered (here's the list). Recommended next step: [ship / one more session / specific item]."

## Status

(append final status block here)
