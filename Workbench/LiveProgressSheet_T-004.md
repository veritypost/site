# LiveProgressSheet — T-004: Remove dead superadmin role references from RPCs and policies
Started: 2026-04-26

## User Intent

Strip the dead `'superadmin'` string from all `IN (...)` role-check clauses in live DB functions and RLS policies. Migration 105 removed the superadmin role from the `roles` table; these are orphaned references that can never match but clutter the codebase and imply the role still exists.

Task definition verbatim from Current Tasks.md item 5:
> Remove dead `superadmin` role references from 8 RPCs and 12 policies (T-004, Q16) — write a migration stripping `superadmin` from `IN (...)` clauses in all affected routine bodies and policies. Affects: `schema/014`, `016`, `026`, `167`, `174` (new migration needed).

## Live Code State

### RPCs containing 'superadmin' in live DB (confirmed via pg_proc query)

8 functions:
1. `_user_is_moderator(uuid)` — `'moderator', 'editor', 'admin', 'superadmin', 'owner'`
   Source: schema/016_phase8_trust_safety.sql:193
2. `approve_expert_answer(uuid, uuid)` — `'editor', 'admin', 'superadmin', 'owner'`
   Source: schema/167_ext_audit_cc1_cc7.sql:99 (latest rewrite of this function)
3. `approve_expert_application(uuid, uuid, text)` — `'editor', 'admin', 'superadmin', 'owner'`
   Source: schema/014_phase6_expert_helpers.sql:171
4. `expert_can_see_back_channel(uuid)` — `'expert', 'educator', 'journalist', 'editor', 'admin', 'superadmin', 'owner'`
   Source: schema/014_phase6_expert_helpers.sql:46
5. `grant_role(uuid, uuid, text)` — `'admin', 'superadmin', 'owner'`
   Source: schema/026_phase18_sql.sql:275 (latest rewrite)
6. `mark_probation_complete(uuid, uuid)` — `'admin', 'superadmin', 'owner'`
   Source: schema/014_phase6_expert_helpers.sql:608
7. `reject_expert_application(uuid, uuid, text)` — `'editor', 'admin', 'superadmin', 'owner'`
   Source: schema/014_phase6_expert_helpers.sql:237
8. `revoke_role(uuid, uuid, text)` — `'admin', 'superadmin', 'owner'`
   Source: schema/026_phase18_sql.sql:313 (latest rewrite)

### RLS policies containing 'superadmin' in live DB (confirmed via pg_policies query)

2 policies (4 expressions — USING + WITH CHECK on each):
1. `weekly_recap_questions_modify` on `public.weekly_recap_questions`
   Source: schema/174_ext_audit_rls_six_tables.sql:150,158
2. `weekly_recap_quizzes_modify` on `public.weekly_recap_quizzes`
   Source: schema/174_ext_audit_rls_six_tables.sql:179,187

### Out-of-scope superadmin hits (correct, not touching)
- `schema/092 line 62`: inside a one-time data UPDATE (already executed)
- `schema/103 line 20`: reserved username seed row — correct to keep
- `web/src/app/api/auth/signup/route.js:69`: comment only
- `reset_and_rebuild_v2.sql`: zero superadmin references (grep confirmed)

## Contradictions

Intake Agent | Task description says "12 policies" | Expected: 12 | Actual: 2 policy objects (4 expressions) | Low impact — DB is authoritative. "12" likely counted individual IN(...) expression hits across migration files, not distinct live policy objects. No action needed.

## Agent Votes
- Planner: APPROVE
- Reviewer: APPROVE
- Final Reviewer: APPROVE
- Consensus: 3/3 APPROVE

## 4th Agent (if needed)
Not needed — unanimous.

## Implementation Progress
Migration written: schema/180_strip_superadmin_references.sql
- 8 RPCs rewritten with CREATE OR REPLACE FUNCTION (superadmin removed from IN clauses only)
- 2 policies replaced with DROP + CREATE (same pattern as schema/174)
- All signatures and non-superadmin logic unchanged
- Wrapped in BEGIN/COMMIT
- Verification queries included as comments

## Completed
SHIPPED 2026-04-26
- Migration: schema/180_strip_superadmin_references.sql
- Owner applies via Supabase dashboard SQL editor
- Post-apply verification: run the two commented SELECT queries at bottom of migration — both should return 0 rows
