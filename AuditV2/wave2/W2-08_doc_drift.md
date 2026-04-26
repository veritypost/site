# W2-08: Doc Drift + Retired References + Site/ Path Rot

## Note: AuditV1/ exists

The repo has an existing `AuditV1/` directory (mtime 2026-04-25 20:18, created during today's session) with 4 completed overlap-map files (01-reference, 02-current-projects, 03-audit-2026-04-24, 04-projects-silos). It's the same audit-v2 task started earlier with a different methodology. **Findings below incorporate AuditV1's confirmed conclusions where they overlap.**

## Q1: README.md — STALE (per Z01 + AuditV1)

Refers to nonexistent `WORKING.md`, retired `docs/` + `test-data/`, says "kids iOS doesn't exist yet" (false; both apps exist), still cites `@admin-verified` marker rule (retired 2026-04-23), migration range 005-094 (live: 177).

**Action:** rewrite as a minimal "this is the Verity Post repo" pointer, or delete.

## Q2: FEATURE_LEDGER.md — STALE (per Z01 + AuditV1)

mtime 2026-04-18. References:
- Deleted `site/` paths (lines 22, 42, 62, 82+)
- Retired `05-Working/` folder
- `@admin-verified` marker as authoritative for 66 LOCKED files (retired)
- `perms_global_version=4409` (likely outdated)

**Action:** rewrite or archive. AuditV1/01 lists this as one of the highest-staleness items.

## Q3: parity/ docs — STALE (per Z01)

`parity/Shared.md`, `parity/Web-Only.md`, `parity/iOS-Only.md`:
- localhost:3333 (actual port: 3000)
- /kids/* on web treated as a real surface (per CLAUDE.md, kids has no web surface; just redirects)
- references removed `KidViews.swift` (kid-mode removed from adult iOS 2026-04-19)
- no acknowledgement of `VerityPostKids/` target

**Action:** Wave 3 should rewrite or delete. parity/README also needs review.

## Q4: CUTOVER.md — DRIFT (per Z01 + Z09)

- Cross-refs `/TODO.md §OWNER` (TODO.md retired into MASTER_TRIAGE per CLAUDE.md)
- §5 smoke section openly TBD
- Cites `Archived/_retired-2026-04-21/TEST_WALKTHROUGH.md` as if it's still live (Z09 confirmed it's archived)

**Action:** rewrite §5 or remove.

## Q5: Charter retired-but-still-cited (per Z06 + Z08)

Charter retired:
- `04_TRUST_INFRASTRUCTURE.md`
- `17_REFUSAL_LIST.md`
- `db/07_standards_doc_table.md`
- 4 `web-standards/refusals/corrections/masthead.html` mockups

Still cited as deps by:
- `Future Projects/05_*.md`
- `Future Projects/06_*.md`
- `Future Projects/10_*.md`
- `Future Projects/19_*.md`
- `Future Projects/24_*.md`
- `Future Projects/db/05_*.md`

views/ docs still ask to add UI links to:
- `/standards`
- `/corrections`
- `/refusals`
- `/editorial-log`
- `/masthead`

None of these routes exist in `web/src/app/`. **Action:** mass-edit citing docs to remove dead deps; mass-edit views/ docs to remove dead UI link items, OR resurrect the Charter docs if they're still relevant.

## Q6: Future Projects/db/00_INDEX.md — migration count drift (per Z06)

Says latest migration is `20260420020544`. Verified live state: that IS the latest entry in `supabase_migrations.schema_migrations` log, but **78 subsequent migrations exist on disk through 177** (W2-10 finding). The doc is correct about the log but the log itself is stale because subsequent migrations applied via SQL editor paste don't update the log (per CLAUDE.md "MCP-verify schema, never trust supabase_migrations log").

**Action:** rewrite db/00_INDEX.md to count by `ls schema/` not by log.

## Q7: Unconfirmed Projects/ — STALE (per Z10)

`product-roadmap.md` and `UI_IMPROVEMENTS.md`:
- `site/` paths
- retired layout (`docs/`, `test-data/`)
- 9-plan billing claim (DB has 9 plan rows but only 5 active tiers — `verity_family_annual` + both `verity_family_xl` are `is_active=false`)
- DUNS-blocked iOS claim (per memory: Apple Dev account is now active 2026-04-25)

**Action:** archive or rewrite.

## Q8: .gitignore — DEAD PATTERNS (per Z10)

- Lines 12-13: `site/.env*` patterns. `site/` was renamed to `web/` 2026-04-20.
- Line 57: `.mcp.json` ignored, but `.mcp.json` IS committed (verified via `ls -la`). Likely added with `git add -f` or pre-existed the rule.

**Action:** delete dead `site/` lines; either remove `.mcp.json` from gitignore (if intentionally tracked) or remove from tracking.

## Q9: @admin-verified marker residual mentions — 7 ACTIVE-DOC HITS

Active-doc residuals (verified by grep):
1. `Current Projects/F7-DECISIONS-LOCKED.md:18`
2. `Current Projects/F7-PM-LAUNCH-PROMPT.md:61`
3. `Current Projects/F7-PM-LAUNCH-PROMPT.md:203`
4. `Future Projects/views/00_INDEX.md:51`
5. `Future Projects/db/00_INDEX.md:41`
6. `Future Projects/08_DESIGN_TOKENS.md:19`
7. `web/src/app/admin/pipeline/runs/page.tsx` (per Z14, stale comment)
8. `Reference/FEATURE_LEDGER.md` (multiple lines, per AuditV1)
9. `Reference/README.md:36` (per AuditV1)

Plus 5 hits in `AuditV1/*.md` itself (acceptable — it's audit findings about the marker).

**Action:** sweep all 9 active-doc occurrences; remove or replace with "6-agent ship pattern" reference per CLAUDE.md.

## Q10: site/ vs web/ in active docs

Verified — bulk of remaining `site/` references are:
- `Current Projects/APP_STORE_METADATA.md` — multiple lines (5+ inline + 6 cross-refs per AuditV1) — **load-bearing for App Store submission, must fix**
- `Reference/CHANGELOG.md` — historical entries (intentional; archive note)
- `Reference/FEATURE_LEDGER.md` — multiple lines (intentional rewrite needed per Q2)
- `web/src/app/profile/settings/page.tsx:2111` — comment only
- `web/src/components/admin/Toast.jsx:7`, `ConfirmDialog.jsx:19`
- `web/src/lib/permissionKeys.js:5`, `adminPalette.js:38`
- `web/types/admin-components.d.ts:2`
- One in `Sessions/04-21-2026/Session 1/SESSION_LOG_2026-04-21.md:252` (historical session log, OK)

**Action:** prioritize APP_STORE_METADATA fix (P0); code comments are P3 cleanup.

## Q11: PROFILE_FULL_FLOW promotion (Z08)

Z08 candidate to promote to `Reference/`. **Wave 3 should evaluate** by reading the file directly.

## AuditV1's findings worth incorporating

Per `AuditV1/02-current-projects-overlap-map.md:1-15`:
- F7-pipeline-restructure ~60% superseded (matches W2-02)
- F7-PM-LAUNCH-PROMPT self-supersedes its own §5 + still cites stale migrations 105-111
- F7-DECISIONS-LOCKED has internal contradiction: Decision 8 vs §5 step list line 348 (quiz "patches wrong correct_index" vs "throw-and-regenerate")
- F7-PHASE-3-RUNBOOK has multiple internal inconsistencies + duplicates DECISIONS-LOCKED canonical vocabulary
- F1 design conflicts with PRELAUNCH §3.2
- F4 design conflicts with PRELAUNCH §3.1
- F2 silently dropped by PRELAUNCH (not even mentioned)
- F3 absorbed into PRELAUNCH §3.2 (no cross-ref either direction)
- F5 has 8 unanswered owner decisions — unfilled-form artifact, retire as superseded by F6
- F6 §5 fully stale (rolled-back schema/109 design)
- PM_PUNCHLIST line 60 says `tsconfig 'strict':false`, contradicts web config (Wave 3 verify)
- PRELAUNCH internal contradiction Part 5 vs §3.13

## Confirmed duplicates / overlap
- AuditV1/ + this AuditV2 effort cover overlapping ground (V2 is more parallel/automated; V1 is more sequential/handcrafted). Recommendation: archive AuditV1 once V2 is final, or merge V1's session notes into V2.
- F7-DECISIONS-LOCKED + F7-PHASE-3-RUNBOOK duplicate the 12-step canonical vocabulary

## Confirmed stale (high-confidence)
- README.md
- FEATURE_LEDGER.md
- parity/{Shared, Web-Only, iOS-Only}.md
- CUTOVER.md (partial)
- Unconfirmed Projects/{product-roadmap, UI_IMPROVEMENTS}.md
- Future Projects/db/00_INDEX.md (migration count snapshot)
- F7-pipeline-restructure.md (~60% superseded)
- F2-reading-receipt.md (silently dropped by PRELAUNCH)
- F5-ads-gameplan.md (unfilled form, superseded by F6)
- F6 §5 (rolled-back schema/109 design)

## Confirmed conflicts
- 7 active-doc `@admin-verified` residuals contradict CLAUDE.md retirement
- 6 Charter-retired-but-still-cited deps
- 8 retired public routes referenced in views/ specs
- F1/F4 vs PRELAUNCH; F2/F3 vs PRELAUNCH; F5 vs F6
- F7-DECISIONS-LOCKED Decision 8 vs §5 line 348 (internal contradiction)
- PRELAUNCH Part 5 ("schema stays the same") vs §3.13 (proposes new column)
- PM_PUNCHLIST line 60 `tsconfig 'strict':false` vs web config (Wave 3 verify)

## Unresolved (Wave 3)
- PROFILE_FULL_FLOW.md promotion decision
- tsconfig strict flag actual value
- Mass-resurrect-or-mass-delete decision for Charter-retired docs

## Recommended actions (P0/P1/P2/P3)

**P0** (load-bearing, ship-blocking):
1. Fix `APP_STORE_METADATA.md` site/ paths (App Store submission depends on it)
2. Update `Reference/CLAUDE.md` Apple-block paragraph (W2-04 cross-link)
3. Update `Reference/CLAUDE.md` FALLBACK_CATEGORIES comment removal (W2-07 cross-link)

**P1** (active-doc rot):
4. Rewrite `Reference/README.md` (or delete)
5. Rewrite `Reference/FEATURE_LEDGER.md`
6. Rewrite `Reference/parity/*.md` (3 files)
7. Sweep 7 active-doc `@admin-verified` residuals
8. Decide Charter-retired fate (resurrect 4 docs OR mass-edit 6 citing docs)
9. Archive `Unconfirmed Projects/` (move to Archived/)
10. Fix `Reference/runbooks/CUTOVER.md` §5

**P2** (cleanup):
11. Delete dead `.gitignore` `site/.env*` lines
12. Decide `.mcp.json` tracking
13. Archive `Future Projects/F7-pipeline-restructure.md`
14. Mark `F2-reading-receipt.md` as "dropped by PRELAUNCH" with explicit retirement note
15. Mark `F5-ads-gameplan.md` as "superseded by F6"
16. Fix `Future Projects/db/00_INDEX.md` migration count
17. Resolve F7-DECISIONS-LOCKED Decision 8 vs §5 line 348 contradiction
18. Resolve PRELAUNCH Part 5 vs §3.13 contradiction

**P3**:
19. Sweep code-comment `site/` references (5 files)
20. Promote `PROFILE_FULL_FLOW.md` if Wave 3 confirms still useful
21. Consider archiving `AuditV1/` after AuditV2 final
