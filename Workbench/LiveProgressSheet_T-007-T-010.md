# LiveProgressSheet — T-007 / T-010: CLAUDE.md stale facts + .gitignore .mcp.json
Started: 2026-04-26

## User Intent

**T-007**: Fix stale facts in CLAUDE.md and the memory context. Three specific fixes:
1. Remove/update the CLAUDE.md line 93 comment claiming FALLBACK_CATEGORIES is still in page.tsx — grep confirms zero results; it is gone.
2. Update the "23 rules-of-hooks disables" claim. The claim lives in MEMORY.md line 16 (not CLAUDE.md). The task description says actual count is 25; user prompt says ~105; live grep of `rules-of-hooks` in web/src/ returns exactly 25. The user says "remove the specific count if it will keep drifting" — remove the hard number.
3. Update CLAUDE.md line 96 "3800-line settings page" — live wc shows 5,278 lines.

**T-010**: Remove `.mcp.json` from `.gitignore` (currently at line 57) and stage the existing `.mcp.json` file (which exists at project root, 320 bytes, no secrets).

## Live Code State

### T-007 — Verified states

**Fact 1 — FALLBACK_CATEGORIES**
- CLAUDE.md line 93: `home feed (FALLBACK_CATEGORIES hardcode still there — tracked in MASTER_TRIAGE_2026-04-23.md)`
- `grep -n "FALLBACK_CATEGORIES" web/src/app/page.tsx` → zero results
- Fix: remove the parenthetical. New text: `home feed`

**Fact 2 — hooks-disable count**
- MEMORY.md line 16: `23 inline // eslint-disable-next-line react-hooks/rules-of-hooks`
- Live grep of `eslint-disable.*react-hooks/rules-of-hooks` in web/src/: **25 lines** (not 23)
- CLAUDE.md has no hooks count anywhere — this claim is in MEMORY.md only
- Fix: update MEMORY.md line 16, remove the specific number (it will keep drifting)

**Fact 3 — settings page line count**
- CLAUDE.md line 96: `the 3800-line settings page`
- `wc -l web/src/app/profile/settings/page.tsx` → **5,278 lines**
- Fix: update to "5,200-line" (round figure less likely to go stale) or exact "5,278-line"

### T-010 — Verified states

- `.gitignore` line 57: `.mcp.json`
- `.mcp.json` exists at project root: `-rw-r--r--@ 1 veritypost staff 320 Apr 21 09:40 .mcp.json`
- No secrets in .mcp.json (it's an MCP tool configuration file with no credentials)
- Fix: remove line 57 from `.gitignore`; `git add .mcp.json` in the commit

### Out-of-scope items from T-007 task entry (Current Tasks.md item 136)

The task entry lists 6 fixes but the user's runtime prompt scopes to 3:
- Apple dev account claim → not in scope per user prompt (status is accurate)
- ParentalGate callers claim → not in scope per user prompt
- 100_backfill path claim → not in scope per user prompt
These three are left for a future T-007 continuation.

## Contradictions

| Agent | File:line | Expected | Actual | Impact |
|-------|-----------|----------|--------|--------|
| Intake | MEMORY.md:16 | claim: "23 hooks disables" | live: 25 | Low — MEMORY.md only, not CLAUDE.md |
| Intake | CLAUDE.md:93 | FALLBACK_CATEGORIES present | zero grep hits | Low — comment is stale |
| Intake | CLAUDE.md:96 | 3800-line settings page | 5,278 lines | Low — doc only |
| Intake | .gitignore:57 | .mcp.json ignored | file exists, no secrets | Low — forces manual recreation |

## Agent Votes
- Planner: APPROVE — plan verified against live code, reviewer simplification adopted for Change 3
- Reviewer: APPROVE — all 4 changes verified; .mcp.json has no secrets (sources creds from separate .env file)
- Final Reviewer: APPROVE — simplest correct solution; no adjacent scope missed; no tsc/xcodebuild needed
- Consensus: 3/3 APPROVE

## PLANNER PLAN FINAL

1. CLAUDE.md line 93: `home feed (FALLBACK_CATEGORIES hardcode still there — tracked in MASTER_TRIAGE_2026-04-23.md)` → `home feed`
2. CLAUDE.md line 96: `the 3800-line settings page` → `the ~5,300-line settings page`
3. MEMORY.md line 16: `23 rules-of-hooks disables,` → `inline rules-of-hooks disables,`
4. .gitignore line 57: remove `.mcp.json` line
5. git add .mcp.json and commit all

Commit: `docs(T-007,T-010): fix 3 stale facts in CLAUDE.md + track .mcp.json`

## 4th Agent (if needed)
[filled only if vote is split]

## Implementation Progress
Status: SHIPPED
2026-04-26 — Changed CLAUDE.md:93 — removed FALLBACK_CATEGORIES parenthetical (zero grep hits in page.tsx)
2026-04-26 — Changed CLAUDE.md:96 — updated settings page size from "3800-line" to "~5,300-line"
2026-04-26 — Changed MEMORY.md:16 — removed hardcoded "23" from rules-of-hooks count, replaced with "inline"
2026-04-26 — Changed .gitignore:57 — removed .mcp.json line
2026-04-26 — Added .mcp.json to repo (no secrets; sources creds from .env.supabase-readonly)
tsc: N/A (no TypeScript touched)
xcodebuild: N/A (no iOS touched)

## Completed

SHIPPED 2026-04-26
Commit: 56c8dad — docs(T-007,T-010): fix 3 stale facts in CLAUDE.md + track .mcp.json
Files touched: CLAUDE.md, .gitignore, .mcp.json (new), Workbench/LiveProgressSheet_T-007-T-010.md
T-010: fully closed (item 137 removed from Current Tasks.md)
T-007: partially closed — 3 of 6 facts fixed; item 136 updated with remaining 3 open facts
