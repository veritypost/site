# Session 10 — `schema/` migrations overlap map

**Scope:** every numbered migration in `schema/`, plus `reset_and_rebuild_v2.sql` and `schema/snapshots/`.

**Read end-to-end / sampled:**

- **Listing:** 169 `.sql` files counted; numeric prefix range 005 → 177 with **gaps at 1-4, 7-8, 52, 92-93, 100**.
- **Sample reads:** headers + first DDL block of `005`, `010`, `011`, `012`, `017`, `019`, `022`, `030` (error_logs table def), `032` (test articles seed), `056` (verity score RPCs), `057` (RPC lockdown), `094`, `095`, `099`, `105` (remove superadmin), `106` (kid trial freeze notification), `108` (events pipeline), `109` (verity score events — rolled back by `111`), `111` (rollback), `114` (F7 foundation), `116` (cluster locks), `117-149` (rollback pattern verified), `126` (newsroom redesign), `127` (rollback — perm-key mismatch verified), `162` (kids quiz threshold), `167` (ext audit CC.1+CC.7), `170` (cleanup_rate_limit_events RPC — column-name bug verified), `177` (grant ai_models). 
- **`reset_and_rebuild_v2.sql`** (7,287 lines) — head 30 + grep for rate_limit_events table.
- **`schema/snapshots/snapshot-2026-04-18-pre-perms-import.sql`** — 0 bytes (empty placeholder).
- **Cross-check via grep:** `superadmin` references, `rollback_` filenames, `_seed_` filenames, `cleanup_rate_limit_events` body, `user_passed_article_quiz` body, `>= 3` quiz threshold.

**Anchor SHA at session open:** `5ad6ad4`.

---

## Overlap map by topic

### T1 — Numbering: 169 files, max 177, 8 gaps

| Range | Status | Why |
|---|---|---|
| 001-004 | **MISSING on disk** | Initial Supabase setup likely applied via dashboard before numbered-migration convention was established |
| 005-006 | present | test content + comments seeds |
| 007-008 | **MISSING on disk** | unknown; likely applied live, never committed (similar pattern to 092/093/100) |
| 009-051 | present (43 files) | phases 1-22 + targeted fixes |
| 052 | **MISSING on disk** | unknown |
| 053-091 | present | RPCs + cleanup |
| 092-093 | **MISSING on disk** | Round A RLS lockdown + Round B RPC actor-spoof; SQL bodies live in `Archived/2026-04-19-prelaunch-sprint/round_a_migration.sql` + `round_b_migration.sql`. **Confirms AuditV2 C2.** Per `Archived/restructure-2026-04-19/2026-04-19-audit.md`: SQL was applied directly via MCP; numbered files never committed. |
| 094-099 | present | round_e through 099_rls_hardening_kid_jwt |
| 100 | **MISSING on disk in `schema/`** | Backfill of `require_outranks` + `caller_can_assign_role` RPCs. File body lives in `Archived/100_backfill_admin_rank_rpcs_2026_04_19.sql` (Session 6 + Session 7 finding). CLAUDE.md says it's in `schema/` — **stale.** **Confirms AuditV2 C2 + Session 6 finding.** |
| 101-177 | present | seeds + perms + F7 + ext_audit batches |
| MAX | 177 | grant ai_models SELECT (2026-04-25 owner-applied per Session 5) |

DR replay via `reset_and_rebuild_v2.sql` does NOT include the missing 092/093/100 logic — they'd need to be added or the rebuild diverges from prod.

### T2 — Rollback file convention is consistent from 111-149, then drops

20 rollback files exist. Pattern: every odd N from 111 to 149 has a paired `<N+1>_rollback_<N>_*.sql` rollback. Migrations after 150 don't have paired rollbacks — newer migrations either ship without rollbacks, or rollback strategy changed.

Files:
- `111_rollback_parallel_score_ledger.sql` (rolls back the disastrous schema/109 — see T7 below)
- `113`, `115`, `117`, `119`, `121`, `123`, `125`, `127`, `129`, `131`, `133`, `135`, `137`, `139`, `141`, `143`, `145`, `147`, `149` — all rollback their immediate predecessor

The rollback discipline is good. After 149, rollbacks need to be authored on demand if needed.

### T3 — `reset_and_rebuild_v2.sql` is 7,287 lines + has a session-GUC destructive guard

Lines 1-26: refuses to execute unless `SET vp.allow_destroy = 'yes'` is set in the session. Strong production-paste guard. Then `DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;` etc.

The file contains the full schema + RLS + indexes + functions. The DR-replay flow is: paste this file (with the guard) into a clean Supabase project to reproduce prod schema state.

But per Session 6 + Session 7 + AuditV2 finding: **8 numbered migrations are missing on disk**, so DR replay via `reset_and_rebuild_v2.sql` would diverge from live for the missing migration logic IF the rebuild file isn't keeping up with each new migration. CLAUDE.md says: "Owner pastes 144 SQL → applied; runbook also requires updating reset_and_rebuild_v2.sql to keep DR fresh."

### T4 — `schema/snapshots/snapshot-2026-04-18-pre-perms-import.sql` is 0 bytes

Per file mtime 2026-04-18 11:27 — created at the moment of the perms import per Session 6 finding. The file exists for the convention but has no content. Either delete the empty file or populate with the actual pre-import snapshot SQL.

### T5 — `cleanup_rate_limit_events` RPC has a column-name bug — P0 runtime issue

Per `schema/170_ext_audit_cc2_cccs2_cccs5.sql`:
```sql
DELETE FROM rate_limit_events
 WHERE occurred_at < now() - make_interval(days => p_retention_days)
```

But `rate_limit_events` table per `reset_and_rebuild_v2.sql:947+` has column `created_at`, not `occurred_at`. The function will error (`column "occurred_at" does not exist`) on every invocation. **Confirms AuditV2 C1 (P0).**

The mismatch likely stems from `error_logs` table (`schema/030_phase22_error_logs.sql:11`) — that table DOES have `occurred_at`. The RPC author confused the two table schemas.

`web/src/app/api/cron/rate-limit-cleanup` (per the comment in the RPC file) calls this daily. AuditV2 W3 said `rate_limit_events` is at 8,562 rows and growing unbounded. Verify by querying live + applying a fix migration.

### T6 — `user_passed_article_quiz` hardcodes `>= 3` threshold

`schema/012_phase4_quiz_helpers.sql:` defines the function with `WHERE t.correct_sum >= 3`. Same hardcode at `submit_quiz_attempt` in the same file: `v_passed := (v_correct >= 3)`.

By contrast, kids has `settings.kids.quiz.pass_threshold_pct = 60` per `schema/162_kids_quiz_pass_threshold_pct.sql`. **Asymmetry**: kids threshold is DB-driven; adult is hardcoded.

**Confirms AuditV2 C13 (P1).** Adult fix would be to add `quiz.unlock_threshold` setting + parameterize the RPC to read from it.

### T7 — schema/109 + 111 self-supersede (verity_score_events table never lived in prod)

Per `schema/111_rollback_parallel_score_ledger.sql` + `Archived/_retired-2026-04-21/07-owner-next-actions.md` ("URGENT — apply schema/111"): schema/109 introduced a parallel `verity_score_events` table + double-credit trigger; was rolled back days later. Net effect: prod uses the original `score_events` ledger from `schema/022_phase14_scoring.sql`.

`Future Projects/F6 §5 Scoring system` (Session 4 read) describes the rolled-back schema/109 design. AuditV2 §2.B + C31 both flag F6 §5 as stale.

### T8 — schema/127 rollback uses wrong perm-key form — corrupts the rollback path

`schema/127_rollback_126_newsroom_redesign.sql` lines 24-26 reference `pipeline.manage_clusters`, `pipeline.manage_presets`, `pipeline.manage_categories`. But the forward migration 126 used the canonical `admin.pipeline.<noun>.<verb>` form (per Session 5 SESSION_LOG_2026-04-22 catch in the migration paste cycle: "`pipeline.manage_*` → `admin.pipeline.<noun>.<verb>`").

Result: if someone runs the rollback, the `DELETE FROM permissions WHERE key IN (pipeline.manage_*)` won't match anything because the actual perm keys are `admin.pipeline.*.manage`. The 3 perms inserted by 126 would survive the rollback. **Confirms AuditV2 C7 (P1).**

### T9 — `superadmin` role still referenced by 8 RPC bodies on disk

Despite `schema/105_remove_superadmin_role.sql` (per Session 5 commit history) removing the role, grep finds `superadmin` references in:
- `010_fix_user_roles.sql`, `014_phase6_expert_helpers.sql`, `016_phase8_trust_safety.sql`, `026_phase18_sql.sql` — these are pre-105 migrations; references baked in at the time of authoring (historical correctness).
- `103_seed_reserved_usernames.sql` — likely seed value.
- `105_remove_superadmin_role.sql` — the removal migration itself (mentions the role 19 times, expected).
- `167_ext_audit_cc1_cc7.sql`, `174_ext_audit_rls_six_tables.sql` — recent migrations potentially still referencing the role.

Per AuditV2 C6 (P1): 8 RPC bodies in pg_proc still reference `superadmin` (live state). Source-side: the recent migrations likely still ship the references. Sweep needed: dump pg_proc, identify 8 functions, write a CREATE-OR-REPLACE migration to clean them.

### T10 — `schema/032_seed_test_articles.sql` introduces 5 "Test:" articles

Per the file header: "5 published articles + 12 quiz questions each. Safe to re-run … Each article title starts 'Test:' and has slug prefix 'test-' so they are trivially greppable for cleanup."

Per Session 6 + AuditV2 + multiple older audits: these need to be removed before launch (article title not ILIKE 'test%' must be ≥10 real). Owner directive (Session 04-23 OWNER_QUESTIONS §4.1): articles will be wiped pre-launch; F7 pipeline regenerates everything.

`schema/032` is intentionally re-runnable + intentionally deletable. Doesn't need a fix.

### T11 — Migration headers carry good documentation

Sampled headers (e.g., `057_rpc_lockdown.sql`, `056_verity_score_rpcs.sql`, `162_kids_quiz_pass_threshold_pct.sql`, `167_ext_audit_cc1_cc7.sql`, `170_ext_audit_cc2_cccs2_cccs5.sql`, `177_grant_ai_models_select.sql`, `127_rollback_126_newsroom_redesign.sql`) all carry substantial comment headers explaining: motivation, related audit IDs, what the migration does, related future cleanup. The convention is consistent.

The doc-quality is high enough that re-reading a migration months later, the author intent is recoverable from the file alone.

### T12 — F7 migrations cluster: 112, 114, 116, 118, 120, 122, 124, 126

8 F7-related migrations applied 2026-04-22 per Session 5 reads. Confirmed in `schema/`:
- `112_kids_waitlist.sql`
- `114_f7_foundation.sql` (the foundation — admin grant gap exposed in `schema/177` was here)
- `116_f7_cluster_locks_and_perms.sql`
- `118_f7_persist_generated_article.sql`
- `120_f7_pipeline_runs_error_type.sql`
- `122_f7_cluster_id_fks.sql`
- `124_f7_drop_kids_summary_from_rpc.sql`
- `126_newsroom_redesign_clusters_presets_mutations.sql`

Each has a paired rollback. Then later: kids-side migrations 153, 154, 162 (kid quiz threshold) extend the F7 cluster.

### T13 — Recent ext_audit batch (167-176) ships closeout fixes

10 files numbered 167-176 all start `ext_audit_*` — per Session 3 + Session 5 reads, this batch closed out the `Audit_2026-04-24` external-audit findings. Each file is small + targeted (e.g., 168 = award_points advisory lock; 174 = RLS for six tables; 175-176 = batch36 + export completeness). 

### T14 — Migration log ordering matches commit history

Sampled migration mtimes against Session 4-5 commit logs: 153/154/155/156 mtime 2026-04-24 (matches Session 04-24 OWNER apply queue); 157-160 mtime 2026-04-24 (Session 2 Apply queue); 162-176 mtime 2026-04-25; 177 mtime 2026-04-25 (Session 04-25 owner-applied).

The schema/ folder is the historical record of every applied migration EXCEPT the 8 missing-on-disk ones. Live DB tracking via `supabase_migrations.schema_migrations` should be the source of truth on what's actually applied.

### T15 — Cross-zone hook resolutions

| Hook | Status |
|---|---|
| **CZ-A** F7 V4 vs F7-DECISIONS-LOCKED | F7 schema confirmed in 8 migrations (112-126) — DB shipped. V4 is exploratory. Owner-call. |
| **CZ-L** AuditV2 P0 runtime bugs | **C1 (cleanup_rate_limit_events column bug) + C2 (092/093/100 missing) + C7 (127 rollback perm-key bug) verified.** Each needs a follow-up migration. |

---

## Confident bucket (ready for cleanup decisions)

**C-1.** `schema/170_ext_audit_cc2_cccs2_cccs5.sql` `cleanup_rate_limit_events` references nonexistent column `occurred_at`; correct column is `created_at`. **P0 — function errors on every invocation.** Author `schema/178_fix_cleanup_rate_limit_events_column.sql` with a CREATE OR REPLACE pinning `created_at`. **AuditV2 C1.**

**C-2.** Migrations **092 + 093 + 100 missing on disk** in `schema/`. SQL bodies live in `Archived/2026-04-19-prelaunch-sprint/round_a_migration.sql`, `round_b_migration.sql`, and `Archived/100_backfill_admin_rank_rpcs_2026_04_19.sql`. Either move/copy them to `schema/` (with the original filenames) so DR replay reproduces, or annotate `reset_and_rebuild_v2.sql` to inline the missing logic. **AuditV2 C2.**

**C-3.** Migrations **001-004, 007-008, 052** also missing on disk. Owner-decision: are these intentionally pre-numbered-convention setups (e.g., bootstrap done via Supabase dashboard) or genuine missing files? If missing: dump live DB DDL via MCP for the affected RPCs/tables and backfill numbered files.

**C-4.** `schema/127_rollback_126_newsroom_redesign.sql` lines 24-26 use the obsolete `pipeline.manage_*` perm-key form; live keys are `admin.pipeline.<noun>.<verb>`. Edit `schema/127` in place OR write `schema/179_corrected_127_rollback.sql`. **AuditV2 C7.**

**C-5.** `user_passed_article_quiz` hardcodes `>= 3` (adult quiz threshold). Add `settings.quiz.unlock_threshold = 3` row + CREATE OR REPLACE the RPC to read from settings (matches the kids-side pattern in schema/162). **AuditV2 C13.**

**C-6.** 8 RPC bodies still reference `superadmin` role (per AuditV2 C6 — pg_proc query). Dump the 8 function bodies + author a CREATE OR REPLACE migration to clean them. **AuditV2 C6.**

**C-7.** `schema/snapshots/snapshot-2026-04-18-pre-perms-import.sql` is 0 bytes — placeholder file with no content. Either populate with the real pre-import snapshot SQL or delete.

**C-8.** `reset_and_rebuild_v2.sql` (7,287 lines) appears not to include the missing 092/093/100 logic. After C-2, also update `reset_and_rebuild_v2.sql` to reflect the recovered DDL.

**C-9.** Rollback discipline drops at migration 150 (no paired rollbacks for 150-177). Either add them retroactively or document the new policy (e.g., "rollback only when the migration touches structural tables, not seed/grant changes").

---

## Inconsistent bucket (project-itself-is-inconsistent — flag for resolution session)

**I-1.** Adult quiz threshold hardcoded; kids quiz threshold DB-driven. Two parallel implementations of the same product behavior (quiz pass threshold), governed by different mechanisms. CLAUDE.md "DB is the default" says it should be DB-driven; kids matches the rule, adult violates it. (Captured as C-5 with the recommendation.)

**I-2.** Migration numbering integrity: 169 files vs MAX number 177, with 8 gaps. The gaps split into two stories: pre-perms-import bootstrap (001-004, 007-008, 052) which may be intentional, and the 092/093/100 set which is documented to be a missed-commit pattern (Round A/B SQL applied via MCP without committing). Both stories need separate decisions.

**I-3.** `cleanup_rate_limit_events` shipping with a column-name bug (C-1) that errors on every invocation suggests the migration didn't get tested against live DB before being committed. Worth checking whether a pre-commit hook or smoke test could catch column-mismatches in DDL. (Process-level, not file-level.)

**I-4.** F6 doc references the rolled-back schema/109 design (`verity_score_events` table) — already flagged in Session 2 (CZ-zone) and AuditV2 C31. The schema is consistent (109 is rolled back); the doc isn't.

---

## Open questions (need owner direction)

**Q-1.** Schema gaps 001-004, 007-008, 052 — backfill from live DB DDL, or document the gap as expected (pre-numbered-convention bootstrap)?

**Q-2.** schema/127 rollback (perm-key bug) — edit-in-place or write a new corrected rollback file? Edit-in-place is technically a history rewrite; new file is the safer convention but leaves the broken file in the tree.

**Q-3.** Rollback discipline post-150 — establish a written policy (which kinds of migrations get rollbacks)? Today it's case-by-case.

**Q-4.** Adult quiz threshold (C-5) — add `settings.quiz.unlock_threshold` now or wait for owner direction on whether the threshold ever changes?

---

## Cross-zone hooks (carried forward to Session 11)

- **CZ-A** (continued): F7 V4 vs F7-DECISIONS-LOCKED — schema is DECISIONS-LOCKED-aligned; V4 doc is exploratory.
- **CZ-H** (continued): ADMIN_ROUTE_COMPLIANCE — Session 11 follow-up.
- **CZ-I** (continued): TODO_2026-04-21.md unchecked items — Session 11.
- **CZ-L** (resolved this session): AuditV2 P0 DB bugs verified.
- **CZ-M** (continued): Proposed Tree adoption — Session 11.
- **CZ-N** (continued): hasPermissionServer dual-export.
- **CZ-O** (continued): lib/plans.js half-migrated.
- **CZ-P** (continued): iOS app version bump pattern.
- **CZ-Q** (new): Schema gaps 001-004, 007-008, 052, 092-093, 100 — backfill plan.

---

## Plan for Session 11

Final synthesis. Three deliverables:

1. **`AuditV1/99-final-synthesis.md`** — single document combining:
   - **Confident bucket** (cross-session): every C-N item from Sessions 1-10, deduplicated, sorted by surface (docs / code / DB / config / tests). Each item names file:line + recommended action. Goal: a checklist the owner could execute in priority order.
   - **Inconsistent bucket** (cross-session): every I-N item, framed as "the project itself is inconsistent on X — owner needs to decide Y". Goal: a brief for a separate "decisions" session.
   - **Cross-zone hooks resolution table**: every CZ-A through CZ-Q, with status (resolved / partial / owner-call).
   - **Open questions** (cross-session): every Q-N.

2. **AuditV1 vs AuditV2 reconciliation note**: per owner direction "they are both separate things", this is a brief side-by-side mapping of which findings overlap, which are unique to each, which contradict. Output goes in the synthesis doc as an appendix, not as a recommendation to merge.

3. **Update `AuditV1/00-README.md`** to mark Session 11 complete and the audit closed.

Approach:
- Re-read each session-doc's "Confident bucket" + "Inconsistent bucket" + "Open questions" sections (10 session docs).
- Group cross-session duplicates (e.g., the @admin-verified residuals appear in S4, S5, S6, S7, S8 — collapse into one item).
- Sort by impact + ease.
- Write the synthesis.
- Generate the priority-ordered punch list.
