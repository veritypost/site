# Archived + Completed Projects — Current Standing (2026-04-26)

Scope scanned:
- `Archived/`
- `Completed Projects/`

Goal:
- Identify what is still trustworthy as historical record
- Identify what is stale/wrong for current repo state
- Identify concrete cleanup tasks

---

## Legend

- `GREEN` = done/correct as historical artifact (safe reference with context)
- `YELLOW` = partially correct, but stale for current operations
- `RED` = wrong as a current source of truth (use only as old snapshot)

---

## 1) Completed Projects/ verdict

### `Completed Projects/CATEGORY_FIXES.md`
- Verdict: `RED` (not current-source-safe)
- Why:
  - Heavy references to retired path prefix `site/src/...`
  - Contains migration-era statements tied to old file topology
  - Useful only as historical change log, not as a current checklist
- Keep for history? Yes.
- Use for current implementation decisions? No.

### `Completed Projects/FINAL_WIRING_LOG.md`
- Verdict: `YELLOW`
- Why:
  - Good historical narrative of what was shipped in that pass
  - But mixes stale paths (`site/src/...`) and assumptions from an older structure
  - Some “blocked” items are now outdated in context
- Keep for history? Yes.
- Use as current truth? Only after cross-checking against live code.

### `Completed Projects/MIGRATION_PAGE_MAP.md`
- Verdict: `RED`
- Why:
  - Explicitly a `v1 -> v2 migration` planning doc
  - References old path layout and pre-cutover phases
  - Not a live status document
- Keep for history? Yes.
- Use as current roadmap? No.

---

## 2) Archived/ verdict by folder

### `Archived/2026-04-18-admin-lockdown`
- Verdict: `YELLOW`
- Why:
  - Internally coherent and marked DONE
  - But references old path conventions and old admin surface snapshots
- Value now:
  - Historical verification/audit trail
  - Not a direct current-file map

### `Archived/2026-04-18-phases-1-2`
- Verdict: `YELLOW`
- Why:
  - Useful for permission-migration history
  - Mentions superseded live docs and old structure
- Value now:
  - Background only

### `Archived/2026-04-18-security-rounds-2-7`
- Verdict: `GREEN` (historical)
- Why:
  - Clearly prep/audit artifacts for completed rounds
  - Not pretending to be current-state source
- Value now:
  - Security hardening history

### `Archived/2026-04-18-ui-ios-audits`
- Verdict: `GREEN` (historical)
- Why:
  - Read-only audits, explicitly closed
- Value now:
  - Reference when tracing historical UX findings

### `Archived/2026-04-19-prelaunch-sprint`
- Verdict: `GREEN` with one important caveat
- Why:
  - Capstone/hardening records are coherent historical artifacts
  - Contains migration SQL files (`round_a_migration.sql`, `round_b_migration.sql`) that are still relevant as provenance for schema gaps
- Caveat:
  - Do not treat plan docs here as live TODOs

### `Archived/2026-04-20-consolidation`
- Verdict: `YELLOW`
- Why:
  - Useful transition snapshot
  - Includes retired trackers (`DONE.md`, `NEXT_SESSION.md`, `TASKS.md`) and old assumptions
- Value now:
  - Historical context only

### `Archived/2026-04-24-tracker-retirement`
- Verdict: `YELLOW`
- Why:
  - Valuable as transition context from `FIX_SESSION_1` era
  - But this is not the current canonical tracker surface anymore
- Value now:
  - Session-era handoff evidence

### `Archived/_from-05-Working`
- Verdict: `RED` (as current truth)
- Why:
  - Explicitly from retired working-doc era
  - Contains obsolete pointers

### `Archived/_retired-2026-04-21`
- Verdict: `RED` (as current truth)
- Why:
  - Explicitly retired
  - Includes superseded TODO/plans/test-data docs

### `Archived/obsolete-snapshots`
- Verdict: `RED`
- Why:
  - Folder itself says obsolete/superseded snapshots
  - Many references to retired paths/process docs

### `Archived/one-off-plans`
- Verdict: `GREEN` (historical)
- Why:
  - Explicitly one-off and shipped
  - Safe for “why we chose X then” context

### `Archived/restructure-2026-04-19`
- Verdict: `GREEN` (historical)
- Why:
  - Narrow historical planning set
  - Not represented as live source of truth

### `Archived/scratch-ui`
- Verdict: `RED` (for product truth), `GREEN` (for design exploration)
- Why:
  - Mockups/prototypes and exploratory specs
  - Not implementation-accurate now

### `Archived/100_backfill_admin_rank_rpcs_2026_04_19.sql`
- Verdict: `YELLOW`
- Why:
  - Historical sync artifact; useful provenance
  - Not a canonical migration replacement by itself

---

## 3) What appears done/correct vs wrong right now

### Done/correct (historical, safe to keep)
- Most dated archive folders that explicitly declare DONE and are clearly historical:
  - `2026-04-18-security-rounds-2-7`
  - `2026-04-18-ui-ios-audits`
  - `2026-04-19-prelaunch-sprint` (including gap-provenance SQL)
  - `one-off-plans`
  - `restructure-2026-04-19`

### Wrong/stale as current operational source
- Entire `Completed Projects/` set for current path-truth
- `Archived/obsolete-snapshots`
- `Archived/_retired-2026-04-21`
- `Archived/_from-05-Working`
- Any docs still centered on `site/src/...` pathing or retired tracker model

---

## 4) Immediate cleanup tasks (recommended)

1. Add a short banner at top of each `Completed Projects/*.md` file:
   - “Historical migration-era artifact; do not use as live source of truth.”
2. Create `Completed Projects/README.md` with a single pointer to the current canonical trackers.
3. Add a root-level archive index file (or extend an existing one) that marks:
   - historical-only folders
   - retired/obsolete folders
   - provenance-critical items (e.g., `round_a_migration.sql`, `round_b_migration.sql`, `100_backfill...sql`)
4. If desired, move the most stale retired docs into one deeper bucket:
   - `Archived/_obsolete-readonly/` to reduce accidental reuse.

---

## 5) Canonical live status surfaces (for “where things stand”)

When you want current truth, use these first:
- `Current Projects/MASTER_TRIAGE_2026-04-23.md`
- `Reference/STATUS.md`
- Latest session logs under `Sessions/`

Treat `Archived/` and `Completed Projects/` as supporting history, not source-of-truth planning surfaces.
