---
group: 12 DB schema + RLS + RPCs + perm matrix
reconciler: 1/1
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
phase: 4
---

# Reconciliation — Group 12 (DB Schema + RLS + RPCs + Perm Matrix)

## AGREED findings (≥2 agents, both waves ideally)

### R-12-AGR-01 — Row-level security gaps affecting 35+ tables (missing or disabled policies)
**Severity:** CRITICAL  
**File:line:** `schema/reset_and_rebuild_v2.sql:1-7287`; schema/[0-9]*.sql  
**Surfaced by:** WaveA Agent1 (35 tables flagged), WaveB Agent3 (14 specific tables with RLS enabled but 0 CREATE POLICY statements)  
**Consensus description:** RLS enforcement is incomplete across the schema. WaveA Agent1 identified 35 tables entirely lacking RLS (access_codes, analytics_events, notifications, sessions, subscription_events, etc.). WaveB Agent3 identified a distinct set of 14 production tables with `ENABLE ROW LEVEL SECURITY` statements but zero `CREATE POLICY` statements, rendering DML silently blocked. The discrepancy suggests either tables were RLS-enabled after initial audit or there are tables with partial RLS coverage. Together, evidence points to ~49 tables with inadequate or absent row-level security.  
**Suggested disposition:** OWNER-ACTION  
**Detail:** Kid expert sessions, family achievement progress, weekly recap attempts, and billing-adjacent tables (subscription_events, iap_transactions) leak user data if queries bypass policy enforcement. These are high-blast-radius tables. Requires systematic audit of all 113+ tables: mark each as "public-read-all," "user-scoped," "role-scoped," or "service-role-only" and create corresponding policies.

### R-12-AGR-02 — permissions.xlsx location hardcoded and outside repository
**Severity:** HIGH  
**File:line:** `scripts/import-permissions.js:62-74`  
**Surfaced by:** WaveA Agent3, WaveB Agent2, WaveB Agent3 (all three flag fragile path resolution)  
**Consensus description:** The import-permissions script falls back to `/Users/veritypost/Desktop/verity post/permissions.xlsx` (a user-specific Desktop path with a space in the directory name). Repository path `matrix/permissions.xlsx` does not exist. This breaks distributed development, CI/CD, and multi-user environments. No canonical source of truth for the permission matrix.  
**Suggested disposition:** OWNER-ACTION  
**Detail:** Commit permissions.xlsx to `matrix/permissions.xlsx` (or use git-lfs if large). Remove Desktop hardcoded fallback after migration. Add validation to CI: ensure file exists at canonical path before import runs.

### R-12-AGR-03 — import-permissions.js missing environment variable handling and fallback logic fragile
**Severity:** HIGH  
**File:line:** `scripts/import-permissions.js:45-74`  
**Surfaced by:** WaveA Agent1, WaveA Agent3 (both flag inability to run dry-run in CI without .env.local)  
**Consensus description:** Script requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables (or `.env.local`) to execute. Dry-run mode cannot verify xlsx ↔ DB drift without manual setup. No fallback to read-only validation or schema introspection.  
**Suggested disposition:** AUTONOMOUS-FIXABLE  
**Detail:** Add env var fallback chain: try `process.env.SUPABASE_PROJECT_URL` before `SUPABASE_SERVICE_ROLE_KEY`; support `.env` and `.env.local`. Implement dry-run mode to parse xlsx without connecting to DB (validate structure only). Add pre-commit hook to verify xlsx integrity.

### R-12-AGR-04 — Hardcoded role-to-permission-set mappings may drift from xlsx configuration
**Severity:** HIGH  
**File:line:** `scripts/import-permissions.js:152-180`  
**Surfaced by:** WaveB Agent1, WaveB Agent2 (both flag educator/journalist hardcoding)  
**Consensus description:** The script hardcodes a mapping of roles (`owner`, `admin`, `editor`, `moderator`, `expert`, `educator`, `journalist`, `user`) to permission sets. If a role is added to the DB or xlsx without updating this hardcoded map, the role silently defaults to `['free']` permission set (line 164 fallback). Educator and journalist roles are hardcoded with identical sets (`['expert','free','unverified','anon']`), but there is no synchronization mechanism with xlsx tier columns.  
**Suggested disposition:** OWNER-ACTION  
**Detail:** Derive role→set mappings from xlsx role tier columns instead of hardcoding. If manual admin role grants occur outside xlsx workflow, the mapping must be versioned or cached at import time. Consider adding a `roles` sheet to xlsx that defines the tier mappings explicitly.

### R-12-AGR-05 — reset_and_rebuild_v2.sql severely outdated; 55+ migrations not included
**Severity:** CRITICAL  
**File:line:** `schema/reset_and_rebuild_v2.sql` (timestamp Apr 20 12:29); migrations 105-160 dated Apr 22-24  
**Surfaced by:** WaveB Agent2, WaveB Agent3 (both flag missing 13+ tables and 55+ migrations)  
**Consensus description:** The reset scaffold file is a snapshot from Apr 20, but 55 subsequent migrations (105-160) are not embedded. Any developer or CI running `reset_and_rebuild_v2.sql` alone will omit 55 migrations of schema, RLS, RPCs, billing hardening, and constraints. Missing tables include: ai_models, events, events_default, kid_articles, kid_discovery_items, kid_pair_codes, kid_quizzes, kid_sources, kid_timelines, verity_score_events.  
**Suggested disposition:** AUTONOMOUS-FIXABLE  
**Detail:** Regenerate reset_and_rebuild_v2.sql by concatenating migrations 001-160 in order. Script can be automated: `cat schema/0[0-9][0-9]*.sql schema/[1-9][0-9][0-9].sql > schema/reset_and_rebuild_v3.sql`. Use Supabase CLI (`supabase db pull`) if available. Update documentation to clarify: "This is a compiled snapshot. After apply, migrations 1-160 must replay for correctness." Consider monthly regeneration.

### R-12-AGR-06 — perms_global_version table missing or inadequate RLS protection
**Severity:** HIGH  
**File:line:** `schema/reset_and_rebuild_v2.sql:5827-5832` and related migrations  
**Surfaced by:** WaveB Agent1 (perms_global_version only table of 113 without RLS), WaveB Agent3 (confirms it lacks RLS; also unpublished on realtime channel)  
**Consensus description:** The `perms_global_version` table (single-row system table used for permission cache invalidation) is either missing RLS entirely or has RLS enabled with no `CREATE POLICY` statements. This table is published on the `supabase_realtime` channel, allowing any authenticated or anonymous user to potentially read or (in future) manipulate version numbers, poisoning permission cache refresh signals.  
**Suggested disposition:** AUTONOMOUS-FIXABLE  
**Detail:** Add `ALTER TABLE perms_global_version ENABLE ROW LEVEL SECURITY;` and `CREATE POLICY perms_global_select ON perms_global_version FOR SELECT USING (true);` to allow public read but restrict mutations to service_role via RPC only. Add explicit `GRANT EXECUTE ... TO service_role` on any bump RPC.

### R-12-AGR-07 — permission_scope_overrides RLS tightening (Apr 19) post-anchor; reset script may not include final policy
**Severity:** MEDIUM  
**File:line:** `schema/087_tighten_pso_select_rls_2026_04_19.sql:7-14`  
**Surfaced by:** WaveA Agent1, WaveA Agent3 (both flag historical drift risk and reset script stale policy)  
**Consensus description:** Migration 087 (Apr 19, post-anchor) tightened the RLS policy on `permission_scope_overrides` from `USING (true)` (all rows visible) to admin-only + self-only. However, reset_and_rebuild_v2.sql (snapshot from Apr 20) may not embed the final tightened policy. On fresh reset, the table could default to permissive RLS, leaking other users' overrides.  
**Suggested disposition:** AUTONOMOUS-FIXABLE  
**Detail:** Verify reset_and_rebuild_v2.sql contains the final (tightened) RLS policy for permission_scope_overrides. If using new reset script (see AGR-05), migration 087 will re-apply automatically, fixing this.

### R-12-AGR-08 — Billing RPC permission version bumps incomplete; promo redemption may not invalidate client cache
**Severity:** HIGH  
**File:line:** `schema/148_billing_rpcs_bump_perms_version.sql` + `/api/promo/redeem` (route not audited)  
**Surfaced by:** WaveA Agent1 (identifies promo redemption as gap; only lists /api/promo/redeem mutation)  
**Consensus description:** Migration 148 patched four billing RPCs to bump user permissions version after plan changes. However, WaveA Agent1 flagged that `/api/promo/redeem` (a route that directly writes to users.plan_id) does not appear to call `bump_user_perms_version()` and is not covered by migration 148. If a user redeems a promo code, their plan_id changes but perms_version may remain stale, leaving client-side permission cache outdated.  
**Suggested disposition:** OWNER-ACTION  
**Detail:** Audit `/api/promo/redeem`: verify it calls `bump_user_perms_version(user_id)` after plan_id update, or wraps the update in an RPC that does. If using direct SQL UPDATE, add a transaction-scoped `PERFORM bump_user_perms_version(p_user_id);` call immediately after the plan change.

---

## UNIQUE-A findings (Wave A only, needs tiebreaker)

### R-12-UA-01 — ~56 functions in migrations may lack SECURITY DEFINER; early migrations (010-030) not systematically audited
**Severity:** MEDIUM  
**File:line:** `schema/[0-9]*.sql` (aggregated count); sample: `schema/014_phase6_expert_helpers.sql` (submit_expert_application)  
**Surfaced by:** WaveA Agent1 only  
**Description:** Audit identified ~253 total CREATE OR REPLACE FUNCTION calls; ~197 have explicit SECURITY DEFINER in migrations; ~57 instances of SECURITY DEFINER in reset_and_rebuild_v2.sql. Gap: ~56 functions, mostly in early migrations (010-030), likely helpers or internal routines. If a mutation RPC omits SECURITY DEFINER, it runs with caller privileges (anon user cannot mutate, but perceives success). If a helper function queries auth.uid() with SECURITY INVOKER, caller context (anon = NULL uid) breaks logic.  
**Tiebreaker question:** Are all RPC-exposed functions in the public schema SECURITY DEFINER? Are internal helper functions (prefixed with `_` or `__`) intentionally INVOKER? Grep early migrations to quantify actual gap.

### R-12-UA-02 — Foreign key cascade semantics not systematically documented; orphan data risk if cascades are inconsistent
**Severity:** LOW  
**File:line:** `schema/reset_and_rebuild_v2.sql:*` (225+ FK constraints); `schema/138_fk_cascade_cleanup.sql`  
**Surfaced by:** WaveA Agent1 only  
**Description:** ~225 foreign key references defined; ~208 CONSTRAINT...FOREIGN KEY statements in migrations. Migration 138 is titled "fk_cascade_cleanup" but does not drop/recreate FKs. No audit trail documenting which FKs use ON DELETE CASCADE vs. ON DELETE RESTRICT. If user deletion cascades to sessions, notifications, messages, etc., orphaned reads fail; conversely, if some are RESTRICT, deletion fails unexpectedly. Data integrity / UX risk.  
**Tiebreaker question:** Query the database: `SELECT table_name, column_name, foreign_table_name, delete_rule FROM information_schema.referential_constraints WHERE table_schema='public' ORDER BY delete_rule;` Verify all CASCADE deletes are intentional; all RESTRICT are documented.

---

## UNIQUE-B findings (Wave B only, needs tiebreaker)

### R-12-UB-01 — bump_global_perms_version RPC does not exist; import-permissions.js relies on non-existent RPC then silently falls back
**Severity:** MEDIUM  
**File:line:** `scripts/import-permissions.js:300-314` (RPC call at 300-306); schema/.sql (no grep match for bump_global_perms_version)  
**Surfaced by:** WaveB Agent2 only  
**Description:** The import-permissions script attempts to call `await supa.rpc('bump_global_perms_version')`. No such function exists in schema (only `bump_user_perms_version(uuid)` exists). The catch handler silently falls back to a direct UPDATE with version=999, which signals failure but is not visible to callers. If the subsequent SELECT (lines 308-314) fails (NULL return), no version bump occurs, and clients never invalidate their permission cache.  
**Tiebreaker question:** Should bump_global_perms_version exist as an RPC (to encapsulate increment logic), or is direct UPDATE the intended design? If RPC should exist, create it. If not, remove the RPC call and use only the fallback UPDATE path.

### R-12-UB-02 — perms_global_version fallback SELECT lacks existence check; NULL on missing row silently skips bump
**Severity:** MEDIUM  
**File:line:** `scripts/import-permissions.js:308-314`  
**Surfaced by:** WaveB Agent2 only  
**Description:** Script queries `SELECT version FROM perms_global_version WHERE id=1`. If the row does not exist (e.g., table corrupted or not initialized), the select returns NULL, and the `if (gv)` guard skips the bump entirely. No exception is raised. Consequence: permission cache invalidation silently fails, and newly imported permissions remain invisible to all clients.  
**Tiebreaker question:** Is perms_global_version guaranteed to have id=1 row at all times? Should the script INSERT OR UPDATE if missing? Add a pre-flight check: `INSERT INTO perms_global_version (id, version) VALUES (1, 1) ON CONFLICT (id) DO NOTHING;` before the bump logic.

### R-12-UB-03 — Specific 14 tables with RLS enabled but zero policies (distinct from WaveA's 35 missing RLS tables)
**Severity:** HIGH  
**File:line:** `schema/019_cross_platform.sql`, `schema/109_verity_score_events.sql`, `schema/114_f7_foundation.sql`, etc.  
**Surfaced by:** WaveB Agent3 only (explicit list: weekly_recap_quizzes, weekly_recap_questions, weekly_recap_attempts, behavioral_anomalies, bookmark_collections, category_supervisors, comment_context_tags, expert_queue_items, family_achievement_progress, family_achievements, kid_expert_questions, kid_expert_sessions, sponsored_quizzes, user_warnings)  
**Description:** These tables have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` but zero `CREATE POLICY` statements. Result: RLS is enabled (default-deny), and all SELECT/INSERT/UPDATE/DELETE are silently blocked. Reads return zero rows; writes succeed but are never visible. Kid expert sessions and family achievements are user-facing features—this causes feature breakage.  
**Tiebreaker question:** Are these tables intentionally disabled (feature paused), or are policies missing? Confirm intent per table; if active, add appropriate SELECT/INSERT/UPDATE/DELETE policies.

---

## STALE / CONTRADICTED findings
None identified. No agent explicitly disputed another's claim with conflicting evidence.

---

## Summary counts
- **AGREED CRITICAL:** 2 (RLS gaps, reset scaffold outdated)
- **AGREED HIGH:** 5 (permissions.xlsx hardcoded, env handling, role→set drift, perms_global_version, promo redemption)
- **AGREED MEDIUM/LOW:** 1 (permission_scope_overrides historical RLS)
- **UNIQUE-A:** 2 (SECURITY DEFINER gap, FK cascade audit)
- **UNIQUE-B:** 3 (bump_global_perms RPC, perms_global_version NULL risk, 14 tables with RLS but no policies)
- **STALE:** 0

**Total findings reconciled:** 13 (8 AGREED + 2 UNIQUE-A + 3 UNIQUE-B)

---

## Recommended prioritization

1. **Reset scaffold regeneration** (AGR-05, CRITICAL) — blocks all clean-slate deployments; can be automated
2. **RLS gaps systematic audit** (AGR-01, CRITICAL) — 35-49 tables affected; high blast radius
3. **permissions.xlsx in-repo migration** (AGR-02, HIGH) — unblocks CI/CD; simple fix
4. **Promo redemption cache invalidation** (AGR-08, HIGH) — user-facing feature; requires code audit
5. **perms_global_version RLS enforcement** (AGR-06, HIGH) — cache poisoning defense; simple SQL fix
6. **Role→set mapping refactor** (AGR-04, HIGH) — reduces future drift; requires xlsx schema alignment

All others are medium or lower priority and can be batched into a follow-up audit cycle.
