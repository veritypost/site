# LiveProgressSheet — T-003: Reconstruct missing DR schema sources for migrations 092, 093, 100
Started: 2026-04-26

## User Intent
Reconstruct the two missing schema source files for migrations 092 and 093, which exist in the Supabase migrations tracking table but have no corresponding files in schema/. Then add the require_outranks and caller_can_assign_role function definitions to reset_and_rebuild_v2.sql so a DR rebuild produces a complete schema.

Migration 100 is already covered by Archived/100_backfill_admin_rank_rpcs_2026_04_19.sql — no action needed there.

The RPC bodies (require_outranks, caller_can_assign_role) are already live in the DB and documented in Archived/100_backfill_admin_rank_rpcs_2026_04_19.sql. The only gaps are: (1) no schema/092 file, (2) no schema/093 file, (3) reset_and_rebuild_v2.sql does not define these two RPCs.

## Live Code State

### schema/ directory gap
- schema/091_get_own_login_activity_rpc_2026_04_18.sql EXISTS
- schema/092 — MISSING (no file)
- schema/093 — MISSING (no file)
- schema/094_round_e_auth_integrity_2026_04_19.sql EXISTS

### DB migrations table entries recovered
- version 20260419194732, name: 092_rls_lockdown_2026_04_19
  Full SQL: RLS lockdown round — creates public_user_profiles view (security_invoker), REVOKEs PII columns on public.users FROM anon, RLS on audit_log/webhook_log, RLS on bookmark_collections/user_warnings/weekly_recap_attempts/family_achievement_progress/comment_context_tags/category_supervisors and several tables, creates reject_privileged_user_updates() trigger function (SECURITY DEFINER), enables RLS on perms_global_version.
- version 20260419203646, name: 093_rpc_actor_lockdown_2026_04_19
  Full SQL: Wrapped in BEGIN/COMMIT. REVOKEs EXECUTE on 10 RPCs (family_weekly_report, family_members, weekly_reading_report, breaking_news_quota_check, check_user_achievements, start_conversation, _user_freeze_allowance, user_article_attempts, user_has_dm_access, can_user_see_discussion) from authenticated/PUBLIC, grants only to service_role. Drops old create_support_ticket(uuid, text, text, text, text) and replaces with 3-param version (p_category, p_subject, p_body) that derives user_id from auth.uid(). Bumps perms_global_version.

### Archived/100_backfill_admin_rank_rpcs_2026_04_19.sql
EXISTS at /Users/veritypost/Desktop/verity-post/Archived/100_backfill_admin_rank_rpcs_2026_04_19.sql
Contains full CREATE OR REPLACE FUNCTION bodies for both require_outranks(uuid) and caller_can_assign_role(text) plus REVOKE/GRANT statements.

### reset_and_rebuild_v2.sql
7287 lines. Does NOT contain require_outranks or caller_can_assign_role anywhere (grep confirmed zero hits).
Correct insertion point: after line 7157 (end of get_own_login_activity grants), before line 7159 (award_reading_points section header). This is within the "MODERN RPCs" section after the other admin/auth helpers.
Note: reset_and_rebuild_v2.sql still has the OLD create_support_ticket(uuid, text, text, text, text) signature at line 7083 — 093 rewrote this to (text, text, text). This is a pre-existing drift in reset_and_rebuild_v2.sql, out of scope for T-003 but logged as a contradiction.

## Contradictions
[filled by any agent that finds a conflict between the plan and live code]
Format: Agent name | File:line | Expected | Actual | Impact

Intake | reset_and_rebuild_v2.sql:7083-7126 | create_support_ticket should match 093 (3-param: p_category, p_subject, p_body) | Still has OLD 5-param signature (p_user_id, p_email, p_category, p_subject, p_body) | Out of scope for T-003 — logged for a separate DR audit task

## Agent Votes
- Planner: APPROVE — write schema/092 and schema/093 from DB statements; insert require_outranks + caller_can_assign_role into reset_and_rebuild_v2.sql after line 7157
- Reviewer: APPROVE — plan verified against live code; files confirmed absent; DB statements confirmed; insertion point confirmed correct (after get_own_login_activity, within MODERN RPCs section)
- Final Reviewer: APPROVE — faithful to task definition; simplest correct solution; no over-engineering; pre-existing drift (create_support_ticket signature, public_user_profiles missing from reset_and_rebuild_v2, SECURITY INVOKER vs DEFINER on reject_privileged_user_updates) logged as out-of-scope contradictions
- Consensus: 3/3 APPROVE

## 4th Agent (if needed)
[filled only if vote is split]

## Implementation Progress
[filled by background agents during execution]

## Completed
[SHIPPED block written here when done]
