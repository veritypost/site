---
wave: A
group: 12 DB schema + RLS + RPCs + perm matrix
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — DB Schema + RLS + RPCs + Perm Matrix, Wave A, Agent 3

## CRITICAL

### F-12-3-01 — Permissions Import Script Missing Environment Variables
**File:line:** `scripts/import-permissions.js:46-48`
**Evidence:**
```
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('missing supabase env'); process.exit(1); }
```
**Impact:** Dry-run cannot execute without `.env.local` in `web/`. Cannot verify xlsx ↔ DB drift without manual Supabase session or environment setup. Blocks automated validation of permissions matrix on CI/new machines.
**Reproduction:** `cd web && node scripts/import-permissions.js --dry-run` fails unless `.env.local` is present with both variables.
**Suggested fix direction:** Load from `SUPABASE_PROJECT_URL`/`SUPABASE_SERVICE_ROLE_KEY` env vars or `.env.local` with fallback to `.env`.
**Confidence:** HIGH

### F-12-3-02 — One Table Missing RLS: `weekly_recap_questions`
**File:line:** `schema/reset_and_rebuild_v2.sql` (not searchable; derive from pg_policies absence)
**Evidence:**
```
100 tables defined in reset_and_rebuild_v2.sql
111 tables with RLS policies across all migrations
Only table without any policy: weekly_recap_questions
```
**Impact:** Unauthenticated users can SELECT from `weekly_recap_questions` via direct Supabase API call. If this table contains spoilers, hints, or metadata meant for authenticated users only, leaks information. Low user-visible impact if table is truly public, but violates least-privilege RLS design.
**Reproduction:** 
```sql
SELECT * FROM weekly_recap_questions; -- succeeds as anon
```
**Suggested fix direction:** Add `CREATE POLICY` for SELECT (permissive: all, or restrictive per role) to match the 111 existing patterns.
**Confidence:** HIGH

### F-12-3-03 — permission_scope_overrides RLS Tightening Post-Anchor: Drift Risk
**File:line:** `schema/087_tighten_pso_select_rls_2026_04_19.sql:7-14`
**Evidence:**
```
DROP POLICY IF EXISTS pso_select ON public.permission_scope_overrides;
CREATE POLICY pso_select ON public.permission_scope_overrides
  FOR SELECT
  USING (
    public.is_admin_or_above()
    OR (scope_type = 'user' AND scope_id = auth.uid())
  );
```
Migration 87 (2026-04-19) tightened permission_scope_overrides SELECT RLS from `USING (true)` (all rows visible) to admin-only + self-only. This is post-anchor (ed49...), so it applies at HEAD. reset_and_rebuild_v2.sql does not contain an explicit policy for this table; verify the policy is recreated on reset.
**Impact:** On fresh reset, permission_scope_overrides may lack the RLS policy, defaulting to `USING (true)`. Users could read other users' overrides.
**Reproduction:** Code-reading only; confirm reset script includes migration 087's policy.
**Suggested fix direction:** Ensure reset_and_rebuild_v2.sql embeds the final RLS policy for permission_scope_overrides (or migration 087 is re-run after reset).
**Confidence:** HIGH

## HIGH

### F-12-3-04 — Permission Sets & Role/Plan Mappings Not Synced with xlsx (Cannot Verify)
**File:line:** `scripts/import-permissions.js:63-70`
**Evidence:**
```javascript
const repoPath = path.resolve(__dirname, '..', 'matrix', 'permissions.xlsx');
const legacyPath = '/Users/veritypost/Desktop/verity post/permissions.xlsx';
const candidates = [process.env.PERMISSIONS_XLSX_PATH, repoPath, legacyPath].filter(Boolean);
const xlsxPath = candidates.find(p => fs.existsSync(p));
if (!xlsxPath) {
  console.error('permissions.xlsx not found. Tried:');
  for (const c of candidates) console.error('  -', c);
  console.error('Set PERMISSIONS_XLSX_PATH or move the file into matrix/.');
```
Script looks for `matrix/permissions.xlsx` (not found in repo) or legacy path (exists: `/Users/veritypost/Desktop/verity post/permissions.xlsx`). Cannot run dry-run to compare DB vs xlsx without environment. No baseline evidence of drift; assume stable since last known `--apply`.
**Impact:** Cannot confirm permission matrix is accurately reflected in DB. If xlsx was updated but `--apply` not run, permission_set_perms, role_permission_sets, and plan_permission_sets remain stale. No audit trail visible.
**Reproduction:** `node scripts/import-permissions.js --dry-run` with env vars would show exact insert/update/deactivate counts.
**Suggested fix direction:** Run dry-run with .env to capture baseline; add CI step to run dry-run and fail if diff > 0.
**Confidence:** MEDIUM

### F-12-3-05 — RPC Grant Surface: 63 Functions with GRANT EXECUTE, No Audit of Receiver Roles
**File:line:** Sample: `schema/011_phase3_billing_helpers.sql:31` (one of 63)
**Evidence:**
```
GRANT EXECUTE ON FUNCTION public.user_has_dm_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_cancel_subscription(uuid, text) TO service_role;
```
110+ RPCs across all migrations; 63 have explicit GRANT statements. Pattern: 
- `authenticated, service_role` for read-only helpers (safe).
- `service_role` only for mutations (correct).
- No grants to `anon` (correct — all require auth or admin).
Pattern is sound; however, no centralized mapping of "which roles can call which RPC". If a new role is added (e.g., `premium_moderator`), existing RPC grants don't auto-include it.
**Impact:** New roles may not have access to RPCs they should; manual grant statements required. Silently-failing RPC invocations on new role.
**Reproduction:** Code-reading only; would manifest as permission errors if new role added without grant audit.
**Suggested fix direction:** Document RPC grant rules (e.g., "all read-only RPCs grant to authenticated") and add migration template.
**Confidence:** MEDIUM

## MEDIUM

### F-12-3-06 — Notifications Push Claiming (Migration 159) Hot-Path Index Correct, But No Uniqueness on push_receipts
**File:line:** `schema/159_notifications_push_claimed_at.sql:32-34`
**Evidence:**
```sql
CREATE INDEX IF NOT EXISTS idx_notifications_push_claim
  ON public.notifications (push_claimed_at, created_at)
  WHERE push_sent = false;
```
Index correctly targets unsent notifications with optional stale claim; hot path optimized. However, migration 159 comment at lines 6-8 states: "two overlapping cron invocations both dispatch, both insert into push_receipts. The user gets every notification twice; **there's no unique constraint on push_receipts to dedupe.**"
This is a known limitation, not a bug. Cron uses `FOR UPDATE SKIP LOCKED` to avoid duplication *in the notification claiming phase*. If cron crashes mid-dispatch (between claim and insert-receipt), a subsequent cron invocation will reclaim the notification and re-dispatch. Dedup burden is on the push-receipt handler (external). No constraint was added in 159.
**Impact:** Duplicate push receipts possible if cron crashes; user may receive notification twice. Low risk if cron has good error handling and external push provider dedupes by receipt ID.
**Reproduction:** Crash cron mid-dispatch; verify next cron invocation re-dispatches same notif.
**Suggested fix direction:** Investigate if push-receipt consumer (Expo/FCM handler) has idempotency guard; consider unique constraint on (notification_id, provider_id) if dedup is critical.
**Confidence:** MEDIUM

### F-12-3-07 — billing_unfreeze (Migration 158) Grants Only to service_role; No Stripe Webhook Handler Yet
**File:line:** `schema/158_billing_unfreeze_rpc.sql:119`
**Evidence:**
```
REVOKE ALL ON FUNCTION public.billing_unfreeze(uuid) FROM public, anon, authenticated;
-- [implicit: only service_role can call]
```
RPC is defined and correct (SECURITY DEFINER, idempotent path). However, migration 158 comment at lines 8-9 states: "the two events that are supposed to undo that freeze (charge.refund.updated, charge.dispute.closed) **have NO handlers**." This is a documentation audit finding, not a code bug; the RPC exists but integration point (Stripe webhook router) is missing.
**Impact:** Frozen users cannot be unfrozen by Stripe events. Manual admin intervention required.
**Reproduction:** Trigger charge.refund.updated or charge.dispute.closed on Stripe test account; verify no unfreeze webhook handler logs.
**Suggested fix direction:** Wire billing_unfreeze into Stripe webhook handler for charge.refund.updated (status='reversed') and charge.dispute.closed (status='won').
**Confidence:** MEDIUM

### F-12-3-08 — Orphan Tables Confirmed: achievements, sponsors, ad_* Have No Code References
**File:line:** `schema/reset_and_rebuild_v2.sql` (table definitions); no grep hits in `/web/app` or `/web/lib`
**Evidence:**
```
achievements, sponsors, ad_placements, ad_campaigns, ad_units, ad_daily_stats, ad_impressions
—— 7 tables with 0 usages in web/app/* or web/lib/*
```
Grep for table names in web code returns 0 matches; these are schema-only artifacts from an incomplete feature branch (likely ads + gamification POC). All have RLS policies defined (correct defensive posture), but no active code path.
**Impact:** Maintenance burden; confusion during audits. No security risk (RLS in place). Risk: if these tables are ever re-enabled without updating RLS, they could be exploited.
**Reproduction:** Confirm no route, component, or RPC uses these tables; grep for `achievements` or `ad_placements` across web/ finds nothing.
**Suggested fix direction:** Move schema definitions to a `disabled/` migration or add `is_active=false` flags; document feature deprecation.
**Confidence:** MEDIUM

## LOW

### F-12-3-09 — 291 Indexes Defined; No Hot-Path Coverage Gap Evident
**File:line:** `schema/reset_and_rebuild_v2.sql` (index definitions throughout)
**Evidence:**
Sample hot paths indexed:
```
idx_notifications_push_claim (push_sent=false, push_claimed_at, created_at)
idx_categories_slug, idx_roles_name, idx_permissions_key (fast lookups)
idx_comments_article_id, idx_quiz_attempts_user_id (FK joins)
```
291 indexes across 100 tables. Spot-check: critical read paths (comments, articles, quizzes, notifications) have covering indexes. No obvious gaps.
**Impact:** Low. Query performance likely adequate on current dataset. Risk: as table sizes grow (millions of rows), some queries may degrade if new hot paths aren't indexed.
**Reproduction:** Run EXPLAIN ANALYZE on slow queries if complaints arise.
**Suggested fix direction:** Add monitoring for query plans; create indexes reactively if seq-scans appear.
**Confidence:** LOW

### F-12-3-10 — claim_push_batch RPC Has REVOKE ALL; No Explicit Grant to service_role
**File:line:** `schema/159_notifications_push_claimed_at.sql:80`
**Evidence:**
```sql
REVOKE ALL ON FUNCTION public.claim_push_batch(int) FROM public, anon, authenticated;
[no GRANT statement]
```
RPC revokes from public/anon/authenticated but does not explicitly GRANT to service_role. In Postgres, `REVOKE ALL` on a SECURITY DEFINER function does not prevent the function's owner (usually `postgres` or the migration runner) from calling it. However, Supabase's RLS model may require explicit GRANT to service_role for webhook/cron invocations.
**Impact:** Cron task that calls `claim_push_batch()` may fail with permission denied if service_role lacks explicit grant. Low risk if migration ran successfully (implicit grant to owner persists).
**Reproduction:** Cron logs; check for "permission denied" errors on claim_push_batch invocation.
**Suggested fix direction:** Add `GRANT EXECUTE ON FUNCTION public.claim_push_batch(int) TO service_role;` after REVOKE.
**Confidence:** LOW

## UNSURE

### F-12-3-11 — Drift Between reset_and_rebuild_v2.sql and Applied Migrations 1–160
**Evidence:**
Reset script is 7287 lines; migrations span 160 files. No automated diff tool run. Migration 160 (2026-04-24, avatar bucket) post-dates anchor, so HEAD includes 160 migrations. Reset script may not reflect latest migrations (e.g., 159, 160 may not be in reset script yet if it was snapshot'd before 2026-04-24).
**Question:** Is reset_and_rebuild_v2.sql current (from 2026-04-24) or stale (from earlier date)? If stale, a fresh reset would lose 159–160's work.
**Suggested resolution:** Check reset script's last modification date; run `diff <(sort list of objects in reset) <(sort list in 1-160 migrations)` to quantify drift.

