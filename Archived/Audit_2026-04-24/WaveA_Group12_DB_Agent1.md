---
wave: A
group: 12 (DB schema + RLS + RPCs + perm matrix)
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Wave A, Group 12, Agent 1/3

## CRITICAL

### F-12-1-01 — 35 Tables without RLS policies in reset_and_rebuild_v2.sql
**File:line:** `schema/reset_and_rebuild_v2.sql:1-10000` (see data below)
**Evidence:**
```
113 total tables in reset_and_rebuild_v2.sql
78 tables with CREATE POLICY statements
35 tables without any RLS policy:

access_code_uses, access_codes, access_requests, ad_campaigns, ad_daily_stats,
ad_impressions, ad_placements, ad_units, alert_preferences, analytics_events,
app_config, article_relations, behavioral_anomalies, bookmark_collections,
campaign_recipients, category_supervisors, cohort_members, comment_context_tags,
consent_records, deep_links, device_profile_bindings, email_templates,
expert_application_categories, expert_queue_items, family_achievement_progress,
feed_cluster_articles, iap_transactions, invoices, kid_category_permissions,
kid_expert_questions, kid_expert_sessions, media_assets, notifications,
perms_global_version, pipeline_costs, pipeline_runs, promo_codes, promo_uses,
push_receipts, rate_limit_events, reading_log, reserved_usernames, score_rules,
search_history, sessions, sources, sponsored_quizzes, streaks, subscription_events,
support_tickets, ticket_messages, timelines, translations, user_warnings, webhook_log,
weekly_recap_*.
```
**Impact:** Data exposure risk. Any unauthenticated or cross-role user can SELECT/INSERT/UPDATE/DELETE on these tables at the database level. While some may be reference data (e.g., score_rules, email_templates), operational tables (sessions, notifications, subscription_events, kid_expert_questions) leak user-scoped data. Critical for expert interactions, kid sessions, and billing events.
**Reproduction:** `reset_and_rebuild_v2.sql` compiled state; verified by diff of CREATE TABLE ↔ CREATE POLICY with 113:78 ratio.
**Suggested fix direction:** Add ENABLE ROW LEVEL SECURITY to every table; create sensible default policies (SELECT for public, INSERT/UPDATE/DELETE gated by role or user_id match).
**Confidence:** HIGH

### F-12-1-02 — RLS policy on permission_scope_overrides allows USING (true) in select for certain conditions
**File:line:** `schema/087_tighten_pso_select_rls_2026_04_19.sql:8-14`
**Evidence:**
```sql
DROP POLICY IF EXISTS pso_select ON public.permission_scope_overrides;
CREATE POLICY pso_select ON public.permission_scope_overrides
  FOR SELECT
  USING (
    public.is_admin_or_above()
    OR (scope_type = 'user' AND scope_id = auth.uid())
  );
```
**Impact:** Migration 087 tightened an existing policy that had `USING (true)`, which allowed full read. The fix is in place, but **prior to 087**, any user could read all permission scope overrides (including admin-only grants, grants to other users). This is a historical risk if backups or data exports were taken between initial policy creation and 2026-04-19.
**Reproduction:** Check git log for original CREATE POLICY pso_select before migration 087. Code-reading only; no active vuln post-087.
**Suggested fix direction:** Verify no leaked backups or snapshots from before 2026-04-19 contain unredacted permission_scope_overrides. Consider audit log review.
**Confidence:** MEDIUM (fixed in place, but historical)

## HIGH

### F-12-1-03 — Billing RPC permission version bumps required manual callsite review
**File:line:** `schema/148_billing_rpcs_bump_perms_version.sql:1-30`
**Evidence:**
```
Migration comment: "Stripe + Apple webhooks ... never bumped users.perms_version.
Result: every paid plan change via webhook left the user's permission cache stale
until next explicit refresh — paid users denied paid features after upgrade,
frozen users keeping paid features after freeze."

Four RPCs patched: billing_cancel_subscription, billing_resubscribe, 
billing_change_plan, billing_unfreeze_subscription. Each now calls:
  PERFORM bump_user_perms_version(p_user_id);

BUT: /api/promo/redeem (line 27 comment) writes users.plan_id directly 
WITHOUT an RPC, NOT covered by this migration.
```
**Impact:** Promo redemption mutations users.plan_id but may leave perms_version stale. If route-level bump missing, user's client-side permission cache won't reflect plan change. User sees stale feature gates.
**Reproduction:** Redeem a promo code → check if users.perms_version incremented in same transaction. Route-level audit required in `/api/promo/redeem`.
**Suggested fix direction:** Verify `/api/promo/redeem` calls `bump_user_perms_version()` after plan_id update or uses an RPC that does.
**Confidence:** HIGH

### F-12-1-04 — 70 migrations use SECURITY DEFINER but 253 total functions defined (rate ~77%)
**File:line:** `schema/[0-9]*.sql` (aggregated), `schema/reset_and_rebuild_v2.sql:55` (57 instances)
**Evidence:**
```
Total CREATE OR REPLACE FUNCTION calls: ~253
Migrations with ≥1 SECURITY DEFINER: 70 files
Total SECURITY DEFINER occurrences in migrations: ~197
In reset_and_rebuild_v2.sql alone: 57

Gap: ~56 functions in migrations likely missing SECURITY DEFINER or using INVOKER.
Most are helpers (e.g., _user_tier_or_anon, is_user_expert), but some mutate
(e.g., submit_expert_application line 14 in 014_phase6_expert_helpers.sql).
```
**Impact:** Functions without SECURITY DEFINER run as the caller's role. If a helper function queries auth.uid() and caller is 'anon', it returns NULL. If a mutation RPC omits SECURITY DEFINER, it runs with caller privileges (e.g., anon can't mutate but thinks they did). UX: silent failures or false success signals.
**Reproduction:** Grep for CREATE OR REPLACE FUNCTION in each migration; count those missing SECURITY DEFINER. Audit 010-030 phases (early, unaudited).
**Suggested fix direction:** Audit all function definitions; add SECURITY DEFINER (SET search_path TO 'public') to any RPC that must run elevated or queries auth.uid().
**Confidence:** MEDIUM (high prevalence but low immediate breakage if mostly helpers)

## MEDIUM

### F-12-1-05 — Drift risk: import-permissions.js unable to verify (env required)
**File:line:** `scripts/import-permissions.js:45-50`
**Evidence:**
```javascript
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('missing supabase env'); process.exit(1); }
```
**Impact:** Script cannot run in dry-run mode without .env.local, so no automated xlsx ↔ DB verification in CI/audit. Permissions drifted historically (import-permissions 1.0 bumped perms from 81→927), but no continuous gate to catch creep.
**Reproduction:** Run `node scripts/import-permissions.js --dry-run` outside of web/ dir without SUPABASE env. Script exits.
**Suggested fix direction:** Configure SUPABASE env in CI or provide standalone script that doesn't require web/.env. Add pre-commit hook or CI check to verify xlsx integrity.
**Confidence:** MEDIUM (documentation/automation gap, not data loss)

### F-12-1-06 — 152 schema migrations but reset_and_rebuild_v2.sql may lag
**File:line:** `schema/reset_and_rebuild_v2.sql` (62 CREATE OR REPLACE FUNCTION) vs migrations 1-160 (197+ SECURITY DEFINER total)
**Evidence:**
```
reset_and_rebuild_v2.sql was last updated in commit fa185a8 (2026-04-18).
Migrations 148-160 (billing RPCs, kid freeze, avatars, etc.) committed after.

count: 152 files on disk (001-160 + reset_and_rebuild)
Functions in reset_and_rebuild: 62
Functions in 148_billing_rpcs_bump_perms_version alone: 4

If reset_and_rebuild runs, then migrations 148+ replay, functions redefine.
No conflict, but reset_and_rebuild is stale snapshot ≠ current applied state.
```
**Impact:** If rebuild is needed, reset_and_rebuild_v2.sql + full migration replay = correct state. But if someone rolls back to reset_and_rebuild alone, they lose 2+ weeks of RPC hardening. Documentation risk.
**Reproduction:** Compare CREATE OR REPLACE FUNCTION bodies between reset_and_rebuild_v2.sql and 148_billing_rpcs_bump_perms_version.sql; note version differences.
**Suggested fix direction:** Add comment to reset_and_rebuild_v2.sql: "This is a compiled snapshot as of [date]. After apply, migrations 1-160 must replay." Consider a `reset_and_rebuild_v3.sql` quarterly.
**Confidence:** MEDIUM (process/documentation, not runtime issue)

## LOW

### F-12-1-07 — Foreign key cascade deletes not fully audited
**File:line:** `schema/reset_and_rebuild_v2.sql` (225 FK constraints), `schema/138_fk_cascade_cleanup.sql`
**Evidence:**
```
208 CONSTRAINT ... FOREIGN KEY statements across migrations
225 FK references in reset_and_rebuild_v2.sql
Migration 138 is titled "fk_cascade_cleanup" but does not drop/recreate FKs.
No ON DELETE CASCADE review; unclear if all FKs are intentional cascades or restrict.
```
**Impact:** If a user is deleted, do all user-scoped rows (sessions, notifications, messages) cascade or remain orphaned? Orphaned reads fail; cascades may surprise admins. Not a security issue but data integrity / UX.
**Reproduction:** Query for orphaned user_id values in sessions, messages, etc. Check git log for intentional cascade policy.
**Suggested fix direction:** Document FK policy (cascade vs restrict). Add foreign key index checks (see Supabase advisor for hot FK lookups).
**Confidence:** LOW (not observed failure, but lack of explicit policy)

## UNSURE

### F-12-1-08 — Permission matrix xlsx cell values (in /Users/veritypost/Desktop/verity post/) not verified against DB structure
**File:line:** `permissions.xlsx` (Apr 18 snapshot)
**Evidence:**
```
import-permissions.js expects two sheets: "permissions" and "Permission Sets".
Columns: permission_key, surface, feature + 10 tier columns (anon, ..., owner).
Script upserts 927 permissions, 10 sets (line 118-119 comments).

DB schema: permissions.id, permissions.key (UNIQUE), is_active, created_at.
Missing: surface, feature, display_name columns in DB schema.
These are added during upsert (line 223-226), but schema does not define them.
```
**Impact:** ASSUMPTION: script works (permissions table is dynamic JSONB?). If schema mismatch, import fails silently. Needs verification that upsert succeeds and fields appear in DB.
**Reproduction:** Run import-permissions.js --dry-run with env configured; check if 927 perms appear in output. Inspect database schema for surface/feature columns.
**Suggested fix direction:** Verify import-permissions.js output or add a post-import verification query to confirm permission keys and sets sync 1:1 with xlsx.
**Confidence:** LOW (likely works, but unable to verify without env)

---

**Summary:** One CRITICAL gap (35 tables without RLS), one historical RLS softening (now fixed), one active billing RPC gap (promo redemption), and ~56 functions likely missing SECURITY DEFINER. All others are process/documentation issues. Recommend immediate audit of /api/promo/redeem and systematic RLS enforcement on 35 tables.

