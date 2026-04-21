-- =====================================================================
-- Round A — RLS-layer lockdown
-- File: 092_rls_lockdown.sql
-- =====================================================================
-- Closes:
--   C-03  PII leak on public.users (anon reads everything)
--   C-05  authorization-table CRUD granted to authenticated
--   C-06  audit_log forgery (actor_id not bound to auth.uid())
--   H-07  anon EXECUTE on auth-check helpers
--   H-20  perms_global_version RLS disabled + UPDATE grant to authenticated
--   M-16  webhook_log_insert WITH CHECK true
--   N-01  12 tables with RLS enabled but ZERO policies
--   N-02  public.users column grants leak write primitives to authenticated
--
-- Per-table N-01 decisions (see block 7 for implementation):
--   user-facing (bind SELECT/INSERT to auth.uid()):
--     bookmark_collections             user_id
--     user_warnings                    user_id  (SELECT own + moderators see all)
--     weekly_recap_attempts            user_id
--     family_achievement_progress      family_owner_id
--     comment_context_tags             user_id
--     category_supervisors             user_id  (SELECT own + moderators see all)
--   admin/service-only (revoke user grants, route through service_role):
--     behavioral_anomalies             (moderator read, service write)
--     expert_queue_items               (service-mediated via /api/expert/queue)
--     family_achievements              (reference data, already service read)
--     sponsored_quizzes                (admin only)
--     weekly_recap_questions           (service-mediated via /api/recap)
--     weekly_recap_quizzes             (service-mediated via /api/recap)
--
-- WARNING — caller-code coupling:
--   This migration REVOKES INSERT/UPDATE/DELETE on 6 auth tables from
--   authenticated. Three caller paths must ship BEFORE OR WITH this
--   migration or they will 42501:
--     - /api/auth/signup         user_roles.insert, audit_log.insert
--     - /api/auth/callback       user_roles.insert, audit_log.insert
--     - /api/auth/login          users.update(last_login_ip), audit_log.insert
--     - /admin/users/page.tsx    user_roles delete+insert (ship as /api route)
--     - /admin/permissions/*     permissions/permission_sets CRUD
--     - /admin/plans/page.tsx    plans.update
--     - /admin/subscriptions     audit_log.insert
--     - /api/promo/redeem        audit_log.insert
--   See round_a_caller_changes.md for the full list and required edits.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) C-03  public.users PII lockdown
-- ---------------------------------------------------------------------

-- 1a. Public-profile view — SECURITY INVOKER so it respects caller RLS.
-- Whitelist widened per owner resolution #1 (Round A implementer brief):
-- /card/[username] is designed to be fully public. Security is enforced
-- by the REVOKE list on PII columns below, not by view scope.
CREATE OR REPLACE VIEW public.public_user_profiles
WITH (security_invoker = true) AS
SELECT
  id,
  display_name,
  username,
  avatar_url,
  avatar_color,
  banner_url,
  bio,
  verity_score,
  streak_current,
  is_expert,
  expert_title,
  expert_organization,
  is_verified_public_figure,
  created_at,
  profile_visibility
FROM public.users
WHERE profile_visibility = 'public'
  AND COALESCE(is_banned, false) = false
  AND deleted_at IS NULL;

COMMENT ON VIEW public.public_user_profiles IS
  'C-03 / Round A: whitelisted public columns (owner resolution #1). SECURITY INVOKER respects RLS on public.users.';

-- 1b. REVOKE SELECT on PII columns from anon. Authenticated keeps SELECT
-- (RLS still gates to own row + public profiles). "PII column" is the
-- narrow high-sensitivity set; harmless display counters remain anon-
-- readable so leaderboard / nav / card pages still work on the anon
-- client. Extended lockdown beyond this list is Round B-plus territory.
REVOKE SELECT (
  email,
  phone,
  date_of_birth,
  first_name,
  last_name,
  country_code,
  gender,
  locale,
  timezone,
  stripe_customer_id,
  parent_pin_hash,
  kids_pin_hash,
  password_hash,
  last_login_ip,
  last_login_device,
  last_login_at,
  login_count,
  failed_login_count,
  locked_until,
  pin_attempts,
  pin_locked_until,
  primary_auth_provider,
  referral_code,
  referred_by,
  notification_email,
  notification_push,
  email_verified_at,
  phone_verified_at,
  metadata,
  deletion_requested_at,
  deletion_scheduled_for,
  deletion_completed_at,
  deletion_reason,
  frozen_at,
  frozen_verity_score,
  kid_trial_started_at,
  kid_trial_ends_at,
  kid_trial_used,
  ban_reason,
  banned_at,
  banned_by,
  plan_id,
  plan_status,
  plan_grace_period_ends_at,
  onboarding_completed_at,
  perms_version,
  perms_version_bumped_at,
  warning_count,
  last_warning_at,
  att_prompted_at,
  att_status,
  supervisor_opted_in,
  has_kids_profiles,
  is_kids_mode_enabled,
  allow_messages,
  dm_read_receipts_enabled,
  show_activity,
  show_on_leaderboard,
  is_muted,
  is_shadow_banned,
  mute_level,
  muted_until,
  streak_freeze_remaining,
  streak_freeze_week_start,
  streak_frozen_today,
  streak_last_active_date,
  deleted_at,
  is_active
) ON public.users FROM anon;

-- 1c. GRANT the view to anon + authenticated.
GRANT SELECT ON public.public_user_profiles TO anon, authenticated;

-- 1d. Flip default + backfill civilians to private. Staff (owner, admin,
-- editor, expert, moderator, superadmin, journalist, educator) stay
-- public by default.
ALTER TABLE public.users ALTER COLUMN profile_visibility SET DEFAULT 'private';

UPDATE public.users
SET profile_visibility = 'private'
WHERE profile_visibility = 'public'
  AND id NOT IN (
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE r.name IN (
      'owner','superadmin','admin','editor','expert','moderator','journalist','educator'
    )
  );

-- ---------------------------------------------------------------------
-- 2) C-05  REVOKE CRUD on authorization tables from authenticated
-- ---------------------------------------------------------------------
-- SELECT is retained so the client can render role names / plan tier.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles             FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_permission_sets   FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.roles                  FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.permissions            FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.permission_sets        FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.plans                  FROM authenticated;

-- ---------------------------------------------------------------------
-- 3) C-06  audit_log — block all authenticated writes, force service-role
-- ---------------------------------------------------------------------
-- Preferred route per the attack plan: revoke the grant entirely. All
-- legitimate audit writes already have or must move to the service
-- client (see caller-changes doc).
REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated;

-- Belt-and-suspenders: replace the policy body with a hard false so a
-- future regrant cannot re-open the hole without an explicit policy
-- change.
DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;
CREATE POLICY audit_log_insert ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- ---------------------------------------------------------------------
-- 4) H-07  REVOKE anon EXECUTE on auth-check helpers
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.is_admin_or_above()     FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_editor_or_above()    FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_mod_or_above()       FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_paid_user()          FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_premium()            FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_has_role(text)     FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(text)    FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission_for(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_permission_keys()    FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_capabilities(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_verified_email()    FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_banned()             FROM anon;

-- Authenticated keeps EXECUTE (idempotent re-grant to be explicit).
GRANT EXECUTE ON FUNCTION public.is_admin_or_above()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_editor_or_above()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_mod_or_above()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_paid_user()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_premium()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_role(text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission_for(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_permission_keys()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_capabilities(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_verified_email()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_banned()             TO authenticated;

-- ---------------------------------------------------------------------
-- 5) H-20  perms_global_version — enable RLS, revoke write grants
-- ---------------------------------------------------------------------
ALTER TABLE public.perms_global_version ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.perms_global_version FROM authenticated;
-- SELECT is implied by the my_perms_version() DEFINER function; table
-- reads from client do not happen today. No policy is added; RLS with
-- zero policies = default-deny, and all writes go through DEFINER
-- bump_perms_global_version which is service_role-only.

-- ---------------------------------------------------------------------
-- 6) M-16  webhook_log — force service-role only
-- ---------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.webhook_log FROM authenticated;

DROP POLICY IF EXISTS webhook_log_insert ON public.webhook_log;
CREATE POLICY webhook_log_insert ON public.webhook_log
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- ---------------------------------------------------------------------
-- 7) N-01  12 RLS-enabled-no-policy tables
-- ---------------------------------------------------------------------

-- 7a. bookmark_collections — user-facing, user_id binding.
-- Reads come from /bookmarks/page.tsx via authenticated client; writes
-- already go through service-role RPC create_bookmark_collection.
CREATE POLICY bookmark_collections_select_own ON public.bookmark_collections
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- No INSERT/UPDATE/DELETE policy — writes run via service_role.
REVOKE INSERT, UPDATE, DELETE ON public.bookmark_collections FROM authenticated;

-- 7b. user_warnings — user sees own + moderators see all.
-- Reads from /appeal (own rows) and /admin/moderation (all rows).
-- Writes run via service-role from admin API handlers.
CREATE POLICY user_warnings_select_own_or_mod ON public.user_warnings
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_mod_or_above());
REVOKE INSERT, UPDATE, DELETE ON public.user_warnings FROM authenticated;

-- 7c. weekly_recap_attempts — user-facing, user_id binding.
-- Reads via /api/recap (service), but add a policy anyway for direct
-- authenticated reads + to satisfy advisor.
CREATE POLICY weekly_recap_attempts_select_own ON public.weekly_recap_attempts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY weekly_recap_attempts_insert_own ON public.weekly_recap_attempts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
-- No UPDATE/DELETE — attempts are append-only from the user side.
REVOKE UPDATE, DELETE ON public.weekly_recap_attempts FROM authenticated;

-- 7d. family_achievement_progress — household-scoped via family_owner_id.
-- Reads via /api/family/achievements (service) but policy enables direct
-- authenticated SELECT where the caller IS the family owner OR a member
-- of the household. Conservative: restrict to owner only; members reach
-- their data via the service-mediated API.
CREATE POLICY family_achievement_progress_select_owner ON public.family_achievement_progress
  FOR SELECT TO authenticated
  USING (family_owner_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.family_achievement_progress FROM authenticated;

-- 7e. comment_context_tags — user-facing own-vote marker, user_id binding.
CREATE POLICY comment_context_tags_select_own ON public.comment_context_tags
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY comment_context_tags_insert_own ON public.comment_context_tags
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY comment_context_tags_delete_own ON public.comment_context_tags
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
-- No UPDATE policy — tags are create/delete only.
REVOKE UPDATE ON public.comment_context_tags FROM authenticated;

-- 7f. category_supervisors — user sees own + moderators see all.
-- Read from /profile/settings (own row) and admin surfaces. Writes
-- run via service-role opt-in/opt-out routes.
CREATE POLICY category_supervisors_select_own_or_mod ON public.category_supervisors
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_mod_or_above());
REVOKE INSERT, UPDATE, DELETE ON public.category_supervisors FROM authenticated;

-- 7g. behavioral_anomalies — admin/mod only. Revoke user grants entirely.
-- Moderator reads happen via admin routes on service-role.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.behavioral_anomalies FROM authenticated, anon;

-- 7h. expert_queue_items — service-mediated via /api/expert/queue.
-- iOS ExpertQueueView currently reads this table with the authenticated
-- client and will need to move to the API route OR get a policy. For
-- Round A, revoke user grants; iOS caller update ships in the same batch.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.expert_queue_items FROM authenticated, anon;

-- 7i. family_achievements — reference data, served via /api/family/achievements.
-- Revoke user grants (anon retains nothing, authenticated gets none).
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.family_achievements FROM authenticated, anon;

-- 7j. sponsored_quizzes — admin-only table.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.sponsored_quizzes FROM authenticated, anon;

-- 7k. weekly_recap_questions — service-mediated via /api/recap/[id].
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.weekly_recap_questions FROM authenticated, anon;

-- 7l. weekly_recap_quizzes — service-mediated via /api/recap.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.weekly_recap_quizzes FROM authenticated, anon;

-- ---------------------------------------------------------------------
-- 8) N-02  public.users column write grants + trigger extension
-- ---------------------------------------------------------------------
-- Primary defense: revoke column INSERT/UPDATE from authenticated.
REVOKE INSERT, UPDATE ON COLUMN public.users.parent_pin_hash    FROM authenticated;
REVOKE INSERT, UPDATE ON COLUMN public.users.kids_pin_hash      FROM authenticated;
REVOKE INSERT, UPDATE ON COLUMN public.users.failed_login_count FROM authenticated;
REVOKE INSERT, UPDATE ON COLUMN public.users.locked_until       FROM authenticated;
REVOKE INSERT, UPDATE ON COLUMN public.users.last_login_ip      FROM authenticated;

-- Secondary defense: extend reject_privileged_user_updates to cover
-- the same columns, so a future regrant (or a privileged column snuck
-- in through a batch update) still trips the trigger.
CREATE OR REPLACE FUNCTION public.reject_privileged_user_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR current_user IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin')
     OR public.is_admin_or_above() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_expert, false) IS TRUE
       OR COALESCE(NEW.is_verified_public_figure, false) IS TRUE
       OR COALESCE(NEW.is_banned, false) IS TRUE
       OR COALESCE(NEW.is_shadow_banned, false) IS TRUE
       OR COALESCE(NEW.is_active, true) IS FALSE
       OR NEW.plan_id IS NOT NULL
       OR COALESCE(NEW.plan_status, 'free') <> 'free'
       OR COALESCE(NEW.verity_score, 0) <> 0
       OR COALESCE(NEW.warning_count, 0) <> 0
       OR COALESCE(NEW.perms_version, 1) <> 1
       OR NEW.ban_reason IS NOT NULL
       OR NEW.banned_at IS NOT NULL
       OR NEW.banned_by IS NOT NULL
       OR NEW.muted_until IS NOT NULL
       OR COALESCE(NEW.mute_level, 0) <> 0
       OR NEW.frozen_at IS NOT NULL
       OR NEW.frozen_verity_score IS NOT NULL
       OR NEW.plan_grace_period_ends_at IS NOT NULL
       OR NEW.stripe_customer_id IS NOT NULL
       OR NEW.deletion_scheduled_for IS NOT NULL
       OR NEW.deletion_completed_at IS NOT NULL
       OR COALESCE(NEW.streak_best, 0) <> 0
       -- N-02 additions
       OR NEW.parent_pin_hash IS NOT NULL
       OR NEW.kids_pin_hash IS NOT NULL
       OR COALESCE(NEW.failed_login_count, 0) <> 0
       OR NEW.locked_until IS NOT NULL
       OR NEW.last_login_ip IS NOT NULL
    THEN
      RAISE EXCEPTION 'privileged column value on insert denied for user %', auth.uid()
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.plan_status IS DISTINCT FROM OLD.plan_status
     OR NEW.is_expert IS DISTINCT FROM OLD.is_expert
     OR NEW.is_verified_public_figure IS DISTINCT FROM OLD.is_verified_public_figure
     OR NEW.is_banned IS DISTINCT FROM OLD.is_banned
     OR NEW.is_shadow_banned IS DISTINCT FROM OLD.is_shadow_banned
     OR NEW.verity_score IS DISTINCT FROM OLD.verity_score
     OR NEW.warning_count IS DISTINCT FROM OLD.warning_count
     OR NEW.perms_version IS DISTINCT FROM OLD.perms_version
     OR NEW.ban_reason IS DISTINCT FROM OLD.ban_reason
     OR NEW.banned_at IS DISTINCT FROM OLD.banned_at
     OR NEW.banned_by IS DISTINCT FROM OLD.banned_by
     OR NEW.muted_until IS DISTINCT FROM OLD.muted_until
     OR NEW.mute_level IS DISTINCT FROM OLD.mute_level
     OR NEW.frozen_at IS DISTINCT FROM OLD.frozen_at
     OR NEW.frozen_verity_score IS DISTINCT FROM OLD.frozen_verity_score
     OR NEW.plan_grace_period_ends_at IS DISTINCT FROM OLD.plan_grace_period_ends_at
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.deletion_scheduled_for IS DISTINCT FROM OLD.deletion_scheduled_for
     OR NEW.deletion_completed_at IS DISTINCT FROM OLD.deletion_completed_at
     OR NEW.streak_best IS DISTINCT FROM OLD.streak_best
     -- N-02 additions
     OR NEW.parent_pin_hash IS DISTINCT FROM OLD.parent_pin_hash
     OR NEW.kids_pin_hash IS DISTINCT FROM OLD.kids_pin_hash
     OR NEW.failed_login_count IS DISTINCT FROM OLD.failed_login_count
     OR NEW.locked_until IS DISTINCT FROM OLD.locked_until
     OR NEW.last_login_ip IS DISTINCT FROM OLD.last_login_ip
  THEN
    RAISE EXCEPTION 'privileged column update denied for user %', auth.uid()
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

-- =====================================================================
-- VERIFICATION QUERIES — run after migration commits
-- =====================================================================

-- V1  C-03 view exists + is SECURITY INVOKER.
SELECT schemaname, viewname, definition ~ 'security_invoker' AS invoker_ok
FROM pg_views WHERE viewname = 'public_user_profiles';

-- V2  C-03 anon SELECT revoked on PII columns.
SELECT column_name
FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name='users' AND grantee='anon'
  AND column_name IN ('email','phone','date_of_birth','stripe_customer_id',
                      'parent_pin_hash','kids_pin_hash','last_login_ip',
                      'failed_login_count','locked_until','password_hash');
-- Expect: 0 rows.

-- V3  C-03 profile_visibility default + backfill.
SELECT column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='users' AND column_name='profile_visibility';
-- Expect: 'private'::character varying.
SELECT profile_visibility, COUNT(*) FROM public.users GROUP BY profile_visibility;
-- Expect: public count == staff count (about 8), private == civilians (about 40).

-- V4  C-05 authenticated can no longer CRUD auth tables.
SELECT table_name, privilege_type
FROM information_schema.table_privileges
WHERE table_schema='public' AND grantee='authenticated'
  AND table_name IN ('user_roles','user_permission_sets','roles','permissions','permission_sets','plans')
  AND privilege_type IN ('INSERT','UPDATE','DELETE');
-- Expect: 0 rows.

-- V5  C-06 audit_log INSERT revoked + policy now false.
SELECT privilege_type FROM information_schema.table_privileges
WHERE table_schema='public' AND table_name='audit_log' AND grantee='authenticated'
  AND privilege_type='INSERT';
-- Expect: 0 rows.
SELECT with_check FROM pg_policies WHERE tablename='audit_log' AND policyname='audit_log_insert';
-- Expect: 'false'.

-- V6  H-07 anon no longer holds EXECUTE on auth-check helpers.
SELECT routine_name FROM information_schema.routine_privileges
WHERE routine_schema='public' AND grantee='anon'
  AND routine_name IN ('is_admin_or_above','is_editor_or_above','is_mod_or_above',
                       'is_paid_user','is_premium','user_has_role','has_permission',
                       'has_permission_for','my_permission_keys','get_my_capabilities',
                       'has_verified_email','is_banned');
-- Expect: 0 rows.

-- V7  H-20 perms_global_version RLS on + writes revoked.
SELECT relrowsecurity FROM pg_class WHERE relname='perms_global_version';
-- Expect: true.
SELECT privilege_type FROM information_schema.table_privileges
WHERE table_schema='public' AND table_name='perms_global_version' AND grantee='authenticated';
-- Expect: SELECT only (no INSERT/UPDATE/DELETE).

-- V8  M-16 webhook_log INSERT revoked + policy now false.
SELECT privilege_type FROM information_schema.table_privileges
WHERE table_schema='public' AND table_name='webhook_log' AND grantee='authenticated'
  AND privilege_type='INSERT';
-- Expect: 0 rows.
SELECT with_check FROM pg_policies WHERE tablename='webhook_log' AND policyname='webhook_log_insert';
-- Expect: 'false'.

-- V9  N-01 all 12 tables now have at least one policy OR zero user grants.
SELECT c.relname,
       (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename=c.relname) AS policy_count,
       (SELECT string_agg(privilege_type, ',') FROM information_schema.table_privileges tp
          WHERE tp.table_name=c.relname AND tp.grantee='authenticated') AS authed_privs
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('behavioral_anomalies','bookmark_collections','category_supervisors',
                    'comment_context_tags','expert_queue_items','family_achievement_progress',
                    'family_achievements','sponsored_quizzes','user_warnings',
                    'weekly_recap_attempts','weekly_recap_questions','weekly_recap_quizzes')
ORDER BY c.relname;
-- Expect: user-facing tables have >=1 policy, admin-only tables have
-- 0 policies AND authed_privs IS NULL.

-- V10 N-02 column grants revoked.
SELECT column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name='users' AND grantee='authenticated'
  AND column_name IN ('parent_pin_hash','kids_pin_hash','failed_login_count','locked_until','last_login_ip')
  AND privilege_type IN ('INSERT','UPDATE');
-- Expect: 0 rows.

-- V11 N-02 trigger body now references the five columns.
SELECT prosrc ~ 'parent_pin_hash'       AS has_parent_pin,
       prosrc ~ 'kids_pin_hash'         AS has_kids_pin,
       prosrc ~ 'failed_login_count'    AS has_failed_login,
       prosrc ~ 'locked_until'          AS has_locked_until,
       prosrc ~ 'last_login_ip'         AS has_last_login_ip
FROM pg_proc WHERE proname='reject_privileged_user_updates';
-- Expect: all true.
