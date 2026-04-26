# Session 6 — `Archived/` overlap map

**Scope:** entire `Archived/` tree — 13 dated/topical subfolders + 1 stray top-level SQL file.

**Read end-to-end / sampled:**

- **2026-04-24-tracker-retirement/** (full read): 424_PROMPT.md (192 lines), 426_PROMPT.md (160 lines), 427_PROMPT.md (141 lines); FIX_SESSION_1.md head 120 lines (full file 1183 lines — sampled the verdict summary + first item bodies).
- **2026-04-20-consolidation/** (sampled): BATCH_FIXES_2026_04_20.md (head 120 of 227), DONE.md (head 80 of 404), TASKS.md (head 80 of 510), NEXT_SESSION.md (head 80 of 167), DEPLOY_PREP.md (head 50 of 229), PROFILE_FULL_FLOW.md (head 50 of 404), FUTURE_DEDICATED_KIDS_APP.md (head 40 of 130), kidsactionplan.md (head 40 of 128), CUTOVER.md.old + TEST_WALKTHROUGH.md.old (filename-only — `.old` marks them retired).
- **_retired-2026-04-21/** (sampled): TODO.md (full 105 lines), 07-owner-next-actions.md (head 40 of 150), PERMISSION_MIGRATION.md (head 40 of 1685), PRELAUNCH_HOME_SCREEN.md (head 40 of 159), PRE_LAUNCH_AUDIT_LOG_2026-04-20.md (head 60 of 179), TEST_WALKTHROUGH.md (head 40 of 184), UI_AUDIT_REVIEW.md (head 50 of 596), future-projects-README.md (full 39 lines), seed-test-accounts.js + 4 xlsx + .docx binaries (filename-only); test-data/ (8 backup JSONs from 2026-04-18 + ACCOUNTS.md + accounts.json — filename-only).
- **2026-04-19-prelaunch-sprint/** (sampled): _README.md (full 26 lines); ~25 round-_ planning + verification + reviewer files (filename-only — covered by README).
- **2026-04-18-admin-lockdown/** (sampled): _README.md (full 11 lines); ADMIN_AUDIT, ADMIN_STATUS, ADMIN_VERIFICATION, E2E_VERIFICATION, PERMISSIONS_AUDIT (filename-only — covered by README).
- **2026-04-18-phases-1-2/** (sampled): _README.md (full 13 lines); MIGRATION_STATUS.md (filename-only).
- **2026-04-18-security-rounds-2-7/** (sampled): _README.md (full 20 lines); 16 _round*_ files (filename-only — covered by README).
- **2026-04-18-ui-ios-audits/** (sampled): _README.md (full 9 lines); 5 audit MDs + IOS_UI_AGENT_BRIEF.md (filename-only).
- **obsolete-snapshots/** (sampled): _README.md (full 16 lines); STATE.md (head 25 of unknown — substantial); INDEX, REFERENCE, OWNER_TO_DO, PM_HANDOFF, PROJECT_STATUS, LIVE_TEST_BUGS, "z-Remaining Items.md", APPLY_ALL_MIGRATIONS.sql, "00-Folder Structure.md", "00-New-Findings.md" (filename-only — superseded per README).
- **one-off-plans/** (sampled): _README.md (full 8 lines); 3 plan files (filename-only — covered by README).
- **restructure-2026-04-19/** (sampled): structure-synthesis.md (head 25 of unknown), 2026-04-19-audit.md (head 30), future-structure-plan.md (filename-only).
- **scratch-ui/** (sampled): "Kids UX Design Spec.md" (head 25 — beta redesign manifesto), 2 adult-profile HTML mockups + 1 JSX preview + 17 kids HTML/JSX/CSS files (filename-only — exploratory, scratch).
- **_from-05-Working/** (sampled): 2026-04-20-task-synthesis/_REVIEW_NOTES.md (head 25 — Agent 3 verification log), _CONSOLIDATED_TASKS.md + _GAP_TASKS.md (filename-only); 2026-04-20-working-md-retired/WORKING.md (head 20 of unknown).
- **Top-level stray:** `100_backfill_admin_rank_rpcs_2026_04_19.sql` (head 15 lines — file body is a recreated DDL of two RPCs already in prod; "no DB change applied").

**Anchor SHA at session open:** `5ad6ad4`.

---

## Overlap map by topic

### T1 — `Archived/` is the canonical "shipped, do not act on" zone

13 of the 14 subfolders carry an `_README.md` that classifies the subfolder as `Status: DONE`. Convention is consistent: dated event-folder + leading-underscore README + leading-underscore subordinate files. The two un-prefixed top-level items (the lone `100_backfill...sql`, and a few content files) break the convention slightly.

### T2 — `_retired-2026-04-21/` is the largest retired-content bucket

11 markdown files + 4 binary docs (.docx, .xlsx) + a deleted seed script + a `test-data/` subfolder. Per Session 1 + Session 5 reads, this is where 2026-04-21 reorg parked content that was either wrong, superseded, or dropped from scope. Notable contents:

- `TODO.md` — the old root-level TODO with 6 owner items + 6 dev items, several explicitly handed to FIX_SESSION_1.
- `UI_AUDIT_REVIEW.md` — 596-line verification log with a critical takeaway: "**Previous PM's audit was 25% overstated** — 5/20 items were hallucinated, already fixed, or misframed (#19 would've regressed security)." This is the empirical foundation of the memory `feedback_verify_audit_findings_before_acting.md`.
- `PERMISSION_MIGRATION.md` — 1685-line "every file gets `// @migrated-to-permissions <date>` marker" plan. Marker-based audit completed; CLAUDE.md still mentions the marker convention.
- `PRELAUNCH_HOME_SCREEN.md` — blueprint that was implemented (the holding-card / `NEXT_PUBLIC_SITE_MODE=coming_soon` flow shipped 2026-04-24).
- `PRE_LAUNCH_AUDIT_LOG_2026-04-20.md` — predecessor of MASTER_TRIAGE; surfaced the urgent Supabase URL typo.
- `TEST_WALKTHROUGH.md` — references seed accounts + paths (`scripts/seed-test-accounts.js`, `test-data/`) that no longer exist.
- `future-projects-README.md` — old `proposedideas/` README listing only 8 docs (01-08); has nothing to do with the current 24-doc panel-driven `Future Projects/` set.
- `test-data/backup-2026-04-18/` — 8 permission-table snapshot JSONs taken before xlsx → DB import.
- `seed-test-accounts.js` — the script CLAUDE.md says is retired (matches current state).

### T3 — `2026-04-24-tracker-retirement/` holds the FIX_SESSION_1 retirement payload

Four files:
- `FIX_SESSION_1.md` (1183 lines) — the canonical pre-MASTER_TRIAGE tracker, with per-item SHIPPED/STALE/PARKED markers.
- `424_PROMPT.md`, `426_PROMPT.md`, `427_PROMPT.md` — the three numbered handoff prompts that drove the 04-23/04-24 ship cycles. Each prompt is self-contained; each was archived after the next prompt landed.

`424_PROMPT.md` opens at "tip = `4ca9d97`"; `426_PROMPT.md` at `593c4b9`; `427_PROMPT.md` at `a1b30d7`. The handoff chain is intact. None of the three is referenced from any live doc post-retirement (per spot-check of CLAUDE.md / STATUS.md / MASTER_TRIAGE).

### T4 — `2026-04-20-consolidation/` holds the BATCH_FIXES → DONE → TASKS chain plus three retired root-level docs

- `BATCH_FIXES_2026_04_20.md` (227 lines) — 51 fixes across 12 batches; ship log.
- `DONE.md` (404 lines) — append-only ship log keyed by area. CLAUDE.md says "DONE.md retired; ship status is tracked inline in `Current Projects/MASTER_TRIAGE_2026-04-23.md`". This archived DONE.md is the predecessor.
- `TASKS.md` (510 lines) — 86-item task tracker (P0-P4 × 8 lenses). CLAUDE.md says "TASKS.md retired into Current Projects/FIX_SESSION_1.md per-item SHIPPED blocks", which itself was then absorbed into MASTER_TRIAGE.
- `NEXT_SESSION.md` (167 lines) — the predecessor of NEXT_SESSION_PROMPT.md (Session 5 read).
- `DEPLOY_PREP.md` (229 lines) — owner-side checklist: "45-60 min single sitting"; many items have since shipped per Session 5 logs.
- `PROFILE_FULL_FLOW.md` (404 lines) — full feature inventory part-1 + role/tier ladder part-2.
- `FUTURE_DEDICATED_KIDS_APP.md` (130 lines) — explicit reasoning for keeping kids inside the unified iOS app: "Unified app is launch-ready (feature-verified kids + family_admin tracks)". **The decision recorded here was reversed:** kids was forked into `VerityPostKids/` per memory `kids_scope.md` and current CLAUDE.md.
- `kidsactionplan.md` — Pass 1-4 done log for the kids app build-out.
- `CUTOVER.md.old`, `TEST_WALKTHROUGH.md.old` — `.old` suffix marks files superseded by newer versions in `Reference/runbooks/` (CUTOVER) or already retired entirely (TEST_WALKTHROUGH).

### T5 — `2026-04-19-prelaunch-sprint/` is the 9-round capstone sprint that took the project to "ship-ready"

Per `_README.md`: 87 raw issues → 59 deduped → fixed across rounds A–I. Capstone-verified. Multiple `_claims/` token files suggest parallel-track execution. This sprint produced migrations 092 + 093 + 094 (per references). The sprint is referenced from current memory entries (`project_prelaunch_state.md`).

### T6 — `2026-04-18-*` folders capture the foundation: admin lockdown + permission system + security rounds + UI audits

Four chronologically-clustered subfolders. The admin-lockdown README still says: "Admin files still carry the `@admin-verified` marker in the live repo — the lock is real and enforced by convention." **This is no longer true** — the marker was dropped 2026-04-23 per memory `feedback_admin_marker_dropped.md` and per Session 5 finding T5. The README is stale.

### T7 — `obsolete-snapshots/` declares everything inside is superseded by `/STATUS.md` and `/WORKING.md`

The README enumerates ~10 superseded files plus says: "For current state see `/STATUS.md` and `/WORKING.md` at repo root."

- `/STATUS.md` exists (symlink → Reference/STATUS.md).
- `/WORKING.md` does **not** exist anymore — it was retired into `_from-05-Working/2026-04-20-working-md-retired/WORKING.md`.

The obsolete-snapshots README references a retired path.

### T8 — `_from-05-Working/` holds the 4 files extracted from the retired `05-Working/` working-folder

Two subfolders:
- `2026-04-20-task-synthesis/` — `_CONSOLIDATED_TASKS.md`, `_GAP_TASKS.md`, `_REVIEW_NOTES.md` (Agent 1 / Agent 2 / Agent 3 of the 110-task synthesis that produced `2026-04-20-consolidation/TASKS.md`).
- `2026-04-20-working-md-retired/WORKING.md` — the retired root-level WORKING.md.

This is reasonable forensic preservation; the working-md-retired naming is precise.

### T9 — `restructure-2026-04-19/` holds the 3-architect repo-restructure synthesis that wasn't taken

Per `structure-synthesis.md` head: "**Method:** Three architects produced independent proposals. A fourth synthesized…  **Status:** Ready for owner review. Nothing executed yet."

Convergences (verbatim from doc) include "Adopt without debate" items like "monorepo with **pnpm workspaces**", "shared Swift code extracts into ONE Swift Package", "Supabase migrations live under `platform/`". **None of these landed** — the actual repo today uses npm in `web/`, two independent iOS Xcode projects without a shared package, and `schema/` at the root rather than under `platform/`. The restructure was archived without execution.

`2026-04-19-audit.md` (in the same folder) flags missing migrations 092 + 093 — same finding that was later resolved by the 100_backfill mechanism.

### T10 — `scratch-ui/` is the `beta ui ux kids/` HTML mockup set

Manifesto-style spec: "Zero emojis anywhere. No social affordances. PIN-gated exit only. Per-kid theme colour. Chunky, tactile, rounded." 17 HTML/JSX/CSS files. **Substantively identical in spirit to `Future Projects/14_KIDS_CHOREOGRAPHY.md` + `views/ios_kids_*` (Session 4 read)** — same product intent, earlier expression. The spec lives in code as `VerityPostKids/`. The beta mockups are exploratory — fine in scratch-ui.

The two `adult-profile-*` HTML files + `profile-settings-preview.jsx` are scratch designs for adult web settings — nothing visible in current code.

### T11 — `one-off-plans/` is two shipped focused plans plus a v1/v2 superseded pair

`_q1_card_plan.md` + `_q1_card_plan_v2.md` (v2 supersedes v1 — both kept) + `_q2_stripe_portal_plan.md`. README marks all as DONE.

### T12 — `Archived/100_backfill_admin_rank_rpcs_2026_04_19.sql` is a stray SQL file at the top of `Archived/`

Header (lines 1-15): "no DB change is applied by this file — prod already matches it byte-for-byte". The file is a recreated DDL of two RPCs (`require_outranks`, `caller_can_assign_role`) that already exist live.

**Cross-check with CLAUDE.md repo tree:** `schema/100_backfill_admin_rank_rpcs_*.sql   backfill of live RPCs, not a real migration (tracked in MASTER_TRIAGE_2026-04-23.md)`. So CLAUDE.md says the file is in `schema/`. Filesystem check: `ls schema/` shows 101–109 (no 100). The file lives in `Archived/`, not `schema/`. CLAUDE.md is stale on this path.

### T13 — Cross-archive content overlap

The same conceptual content recurs across multiple archive folders:

- "Owner action checklist" appears in `_retired-2026-04-21/TODO.md`, `2026-04-20-consolidation/DEPLOY_PREP.md`, `2026-04-20-consolidation/NEXT_SESSION.md`, and `_from-05-Working/2026-04-20-working-md-retired/WORKING.md`. All four overlap in scope; each is a snapshot at a different moment.
- The 2026-04-19 capstone sprint is referenced from `2026-04-20-consolidation/*` and `restructure-2026-04-19/2026-04-19-audit.md` as upstream.
- `2026-04-18-admin-lockdown/PERMISSIONS_AUDIT.md` is referenced as the historical seed for the 928-permission matrix; current state is in `Reference/PERMISSIONS_DECISIONS.md` (per Session 1 read).

This isn't drift — it's the shape of an append-only archive. Each snapshot was correct when written.

### T14 — Several archived docs reference live paths that have since moved

Spot-checks:
- `_retired-2026-04-21/TEST_WALKTHROUGH.md` references `test-data/` (now in `Archived/_retired-2026-04-21/test-data/`) and `scripts/seed-test-accounts.js` (deleted).
- `obsolete-snapshots/_README.md` references `/STATUS.md` (lives, via symlink) and `/WORKING.md` (does not).
- `2026-04-18-admin-lockdown/_README.md` says "@admin-verified" markers are live (they were dropped 2026-04-23).
- Multiple archived docs reference `site/` paths (renamed to `web/`) and `01-Schema/` paths (renamed to `schema/`) and `05-Working/` (dissolved).
- `2026-04-20-consolidation/FUTURE_DEDICATED_KIDS_APP.md` says "unified app is launch-ready" — kids was forked into `VerityPostKids/` 2026-04-19, so this archived statement is incorrect-by-current-state.

These are all expected-to-be-historical references — nobody navigates from these archived docs as a primary entry point. Inside the archive they're internally consistent at the date of authoring.

---

## Confident bucket (ready for cleanup decisions)

**C-1.** `Archived/2026-04-18-admin-lockdown/_README.md` line 11: "Admin files still carry the `@admin-verified` marker in the live repo — the lock is real and enforced by convention." Update to: "Admin files **carried** the `@admin-verified` marker until 2026-04-23, when the marker was dropped per memory `feedback_admin_marker_dropped.md`. Admin protection now governed by the 6-agent ship pattern — see CLAUDE.md."

**C-2.** `Archived/obsolete-snapshots/_README.md` lines 3 + 13: references `/WORKING.md` at repo root. This file no longer exists; it was archived to `_from-05-Working/2026-04-20-working-md-retired/WORKING.md`. Update reference or remove the line.

**C-3.** `Archived/100_backfill_admin_rank_rpcs_2026_04_19.sql` is at the top level of `Archived/` (not in any dated subfolder) and is a recreated DDL of already-live RPCs. Either move it to a dated subfolder (e.g., `Archived/2026-04-19-prelaunch-sprint/` since it was captured during that sprint) or to `Archived/_retired-2026-04-21/`. CLAUDE.md repo tree lists it as `schema/100_*.sql` — fix the CLAUDE.md tree entry to point at the actual `Archived/100_*.sql` location, OR move the file back into `schema/` (latter only if owner wants the historical DDL adjacent to the live numbered migrations).

**C-4.** `Archived/2026-04-20-consolidation/FUTURE_DEDICATED_KIDS_APP.md` says "Unified app is launch-ready (feature-verified kids + family_admin tracks)". The decision was reversed — kids was forked into `VerityPostKids/` 2026-04-19. Annotate at the top: "**Status flipped 2026-04-19** — kids forked into `VerityPostKids/` (custom-JWT pair-code flow). The unified-app posture this doc describes was abandoned. See memory `kids_scope.md` and CLAUDE.md."

**C-5.** `Archived/restructure-2026-04-19/structure-synthesis.md` says "Status: Ready for owner review. Nothing executed yet." Three weeks later: nothing is executed; the actual repo took a different shape. Annotate: "**Not adopted.** Repo restructure took a different shape (no monorepo, no `platform/` consolidation, no shared Swift Package). Kept for design-decision archaeology."

**C-6.** `Archived/2026-04-24-tracker-retirement/` — clean, well-bounded, no action.

**C-7.** `Archived/_from-05-Working/2026-04-20-task-synthesis/` and `_from-05-Working/2026-04-20-working-md-retired/` — clean, naming is precise, no action.

**C-8.** `Archived/_retired-2026-04-21/test-data/backup-2026-04-18/` — 8 permission-table JSON snapshots from before the xlsx import. CLAUDE.md says "the only canonical source [for permissions] is `permissions.xlsx`". The backup is forensic — useful if a permission-restore-from-backup ever needs to happen. Keep, no action.

**C-9.** `Archived/_retired-2026-04-21/PERMISSION_MIGRATION.md` (1685 lines) is a per-file checklist for adding `@migrated-to-permissions <date>` markers. The marker convention is still in CLAUDE.md ("File markers: `@migrated-to-permissions <date>` = file moved to new perms system"). This is consistent — the marker remains in current code, and the doc is just the historical execution log. No action.

**C-10.** Multiple archived docs reference `site/` (now `web/`), `01-Schema/` (now `schema/`), `05-Working/` (dissolved), `proposedideas/` (dissolved), `docs/` (dissolved), `Ongoing Projects/` (renamed `Future Projects/`). Period-correct — no action by default. If owner wants archives navigable today, these references would all need to be patched.

---

## Inconsistent bucket (project-itself-is-inconsistent — flag for resolution session)

**I-1.** CLAUDE.md repo tree (Session 1 read) says `schema/100_backfill_admin_rank_rpcs_*.sql` exists in `schema/` — actual filesystem state has the file in `Archived/` only, with `schema/` starting at 101. Either CLAUDE.md is stale or the file should move back to `schema/`. (Captured as C-3 with a recommendation.)

**I-2.** `Archived/2026-04-18-admin-lockdown/_README.md` asserts `@admin-verified` markers are live and enforced. Memory `feedback_admin_marker_dropped.md` says they were dropped 2026-04-23. CLAUDE.md current state says "no special markers" + "6-agent ship pattern". Three sources of truth, all written at different times, with the same noun (`@admin-verified`). The README is the only outdated voice — straightforward fix per C-1.

**I-3.** `Archived/2026-04-20-consolidation/FUTURE_DEDICATED_KIDS_APP.md` recorded a decision that was immediately reversed. Inside the archive folder, the doc is internally consistent ("here's what we'd do IF we forked"); the inconsistency is between the archive (saying "deferred, unified is launch-ready") and current state (the fork shipped). Fix per C-4.

**I-4.** `Archived/restructure-2026-04-19/` describes a 3-architect repo-restructure that was not adopted. Several "convergences — adopt without debate" never landed (pnpm, monorepo, shared Swift package, `platform/` folder). The doc carries no "REJECTED" marker. Fix per C-5.

**I-5.** Several archived docs reference Future Projects in different ways: `_retired-2026-04-21/future-projects-README.md` is the OLD 8-doc README (matches the pre-04-21 8-doc set: 01-08); `Future Projects/` today (per Session 4 read) has 24 strategy docs + `db/` + `views/` + `mockups/`. The two file sets are entirely disjoint. The archived README accurately describes its content (8 docs that were moved into Current Projects with F1-F7 prefixes), but a reader navigating from archive to live `Future Projects/` will find nothing matches. (Cross-zone hook to Session 4 / Session 5 chronology question — captured there.)

---

## Open questions (need owner direction)

**Q-1.** Should archived docs that reference retired paths (`/WORKING.md`, `site/`, `01-Schema/`, `05-Working/`, `docs/`, `Ongoing Projects/`, `proposedideas/`, `test-data/`, `scripts/seed-test-accounts.js`) be patched to use the current paths, or left period-correct? The "leave period-correct" position is defensible for archive (history is history), but readers landing on archive content via grep will bounce off broken paths.

**Q-2.** Three archived "owner action checklists" exist — `_retired-2026-04-21/TODO.md`, `2026-04-20-consolidation/DEPLOY_PREP.md`, `_from-05-Working/2026-04-20-working-md-retired/WORKING.md`. Each has overlapping items. None has a header asserting which item-status (DONE / OPEN / SUPERSEDED) applies to its individual checkboxes today. Either annotate each with "this list is frozen at <date>; current owner items live in `Current Projects/Audit_2026-04-24/OWNER_TODO_2026-04-24.md`" or accept that archived TODOs read as misleading.

**Q-3.** `Archived/scratch-ui/` mockup set is exploratory; the `beta ui ux kids/` content is conceptually-equivalent to `Future Projects/14_KIDS_CHOREOGRAPHY.md` + `views/ios_kids_*`. Keep both for design-decision archaeology, or retire the scratch-ui set as fully superseded?

---

## Cross-zone hooks (carried forward)

- **CZ-A** (continued from S2/S3/S4/S5): F7 prompt versioning. No new info from `Archived/`. Resolves Session 8 + 11.
- **CZ-F** (continued from S5): `Future Projects/` chronology — `_retired-2026-04-21/future-projects-README.md` confirms an OLD 8-doc set existed; current 24-doc set is materially different. Two file sets, no recorded transition.
- **CZ-J** (new): `2026-04-18-admin-lockdown/PERMISSIONS_AUDIT.md` is the seed of the 928-permission matrix; `Reference/PERMISSIONS_DECISIONS.md` is the canonical current source per Session 1. Confirm no live doc cites the archived audit as authoritative.
- **CZ-K** (new): `2026-04-20-consolidation/PROFILE_FULL_FLOW.md` is a 404-line "every feature the app can do" + "role/tier ladder" inventory. Resolves Session 7 + 8 — verify whether this inventory is still complete vs current code, or if the canonical inventory now lives elsewhere (likely the permissions matrix itself).

---

## Plan for Session 7

Root files + `scripts/` + `supabase/`. Per the earlier folder audit:

- Root `.md` files: `STATUS.md` (symlink → Reference/STATUS.md), `CLAUDE.md` (symlink → Reference/CLAUDE.md). Both targets read in Session 1; the symlinks themselves need a quick check that they resolve.
- Root config files: `.git-blame-ignore-revs`, `.gitignore`, `.mcp.json` (gitignored), `package.json` (if any?), other.
- `scripts/`: `import-permissions.js` (the perms xlsx → DB sync tool, central to perms-matrix maintenance). Plus possibly other scripts (need to list).
- `supabase/`: per Session 1 + earlier folder note this might be empty or near-empty.

Approach:
1. List repo-root contents (`ls -la /Users/veritypost/Desktop/verity-post/`).
2. Read root config files end-to-end.
3. Verify symlinks resolve.
4. List + read every file in `scripts/`.
5. List + read every file in `supabase/`.
6. Cross-reference any scripts against `package.json` script names + CLAUDE.md "machinery" section.
7. Write `AuditV1/07-root-and-scripts-overlap-map.md`.
8. Update `AuditV1/00-README.md` status table.
