-- =====================================================================
-- Round B — RPC actor-spoof lockdown
-- File: 093_rpc_actor_lockdown.sql
-- =====================================================================
-- Closes:
--   C-04  11 DEFINER RPCs take spoofable user-id args + granted to
--         `authenticated`. Any signed-in user can pass an arbitrary
--         target id and the RPC acts on their behalf.
--   M-14  create_support_ticket stores caller-supplied p_email. If
--         staff reply via that address, a spoofed value routes the
--         response to an attacker.
--
-- Per-RPC strategy (chosen after caller grep over site/src +
-- VerityPost + scripts; see round_b_caller_changes.md for evidence):
--
--   REVOKE EXECUTE from authenticated (service_role only, signatures
--   preserved so internal DEFINER-to-DEFINER callers keep working):
--     1) family_weekly_report(uuid)
--     2) family_members(uuid)
--     3) weekly_reading_report(uuid)
--     4) breaking_news_quota_check(uuid)
--     5) check_user_achievements(uuid)
--     6) start_conversation(uuid, uuid)
--     7) _user_freeze_allowance(uuid, uuid)
--     8) user_article_attempts(uuid, uuid, uuid)
--     9) user_has_dm_access(uuid)
--    10) can_user_see_discussion(uuid, uuid)
--
--   DROP spoofable args, read from auth.uid()/users inside body
--   (authenticated keeps EXECUTE on new signature):
--    11) create_support_ticket — drop p_user_id + p_email.
--        Look up email from users WHERE id = auth.uid().
--        (M-14 + C-04 combined.)
--
-- Rationale for REVOKE-only on #1-10:
--   Every web caller is already server-side (`/api/*` route) using the
--   service-role client. The only place these RPCs could have been hit
--   by an attacker was a direct call via the anon/bearer-bound client
--   with a spoofed p_user_id. After REVOKE, `authenticated` sessions
--   cannot invoke them at all — the attack surface goes to zero. The
--   10 RPCs below are either purely internal predicate helpers called
--   by other DEFINER functions (items 4, 7, 8, 9, 10), or they are
--   called by server routes that already resolve the caller id from
--   `requirePermission()` and use the service-role client (items 1,
--   2, 3, 5, 6). Parent DEFINER functions are owned by `postgres`
--   which keeps EXECUTE implicitly, so nested calls continue to work.
--
--   NOT chosen: the "drop arg, read auth.uid()" strategy would break
--   service-role callers that legitimately pass a resolved owner/user
--   id (e.g., /api/family/leaderboard resolves ownerId from the
--   subscriptions table when the caller is a family member, not the
--   owner). Keeping the arg + revoking from authenticated preserves
--   that flexibility without widening any attack surface.
--
--   Guard ("IF p_user_id <> auth.uid() AND NOT is_admin_or_above()")
--   is not used on any RPC because no call site uses the session-bound
--   client for these RPCs.
--
-- WARNING — caller-code coupling:
--   Only ONE caller edit is required (support ticket — the new
--   create_support_ticket signature takes 3 args, not 5). Everything
--   else is service-role-only today so REVOKE is a pure nop for them.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) family_weekly_report(p_owner_id uuid) — REVOKE from authenticated
-- ---------------------------------------------------------------------
-- Current body unchanged. Only ACL change.
REVOKE EXECUTE ON FUNCTION public.family_weekly_report(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.family_weekly_report(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.family_weekly_report(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 2) family_members(p_owner_id uuid) — REVOKE from authenticated
-- ---------------------------------------------------------------------
-- Also called internally by family_weekly_report; postgres-owned
-- DEFINER-to-DEFINER dispatch keeps that wiring intact.
REVOKE EXECUTE ON FUNCTION public.family_members(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.family_members(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.family_members(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 3) weekly_reading_report(p_user_id uuid) — REVOKE from authenticated
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.weekly_reading_report(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.weekly_reading_report(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.weekly_reading_report(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 4) breaking_news_quota_check(p_user_id uuid) — REVOKE from authenticated
-- ---------------------------------------------------------------------
-- Internal helper only; called by create_notification (DEFINER, owned
-- by postgres). Zero JS callers in site/src or VerityPost.
REVOKE EXECUTE ON FUNCTION public.breaking_news_quota_check(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.breaking_news_quota_check(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.breaking_news_quota_check(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 5) check_user_achievements(p_user_id uuid) — REVOKE from authenticated
-- ---------------------------------------------------------------------
-- JS callers: lib/scoring.js (service client) + cron/check-user-
-- achievements (service client). No user-session call path exists.
REVOKE EXECUTE ON FUNCTION public.check_user_achievements(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_user_achievements(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_user_achievements(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 6) start_conversation(p_user_id uuid, p_other_user_id uuid)
--     — REVOKE from authenticated
-- ---------------------------------------------------------------------
-- Called from /api/conversations which uses the service-role client
-- and passes user.id resolved from requirePermission. See round 7
-- migration 069 + 089 for context.
REVOKE EXECUTE ON FUNCTION public.start_conversation(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.start_conversation(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.start_conversation(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 7) _user_freeze_allowance(p_user_id uuid, p_kid_profile_id uuid)
--     — REVOKE from authenticated
-- ---------------------------------------------------------------------
-- Internal helper called by advance_streak (DEFINER). Zero JS callers.
REVOKE EXECUTE ON FUNCTION public._user_freeze_allowance(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._user_freeze_allowance(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public._user_freeze_allowance(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 8) user_article_attempts(p_user_id, p_article_id, p_kid_profile_id)
--     — REVOKE from authenticated
-- ---------------------------------------------------------------------
-- Internal helper called by article_quiz_pool_size /
-- _next_attempt_number (DEFINER). Zero JS callers.
REVOKE EXECUTE ON FUNCTION public.user_article_attempts(uuid, uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.user_article_attempts(uuid, uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_article_attempts(uuid, uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 9) user_has_dm_access(p_user_id uuid) — REVOKE from authenticated
-- ---------------------------------------------------------------------
-- Internal helper called by start_conversation + post_message (both
-- DEFINER). Zero JS callers.
REVOKE EXECUTE ON FUNCTION public.user_has_dm_access(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.user_has_dm_access(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_has_dm_access(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 10) can_user_see_discussion(p_user_id uuid, p_article_id uuid)
--      — REVOKE from authenticated
-- ---------------------------------------------------------------------
-- Zero JS callers (only a types/database.ts declaration). Helper is
-- a thin wrapper over user_passed_article_quiz; comment-RPC gate
-- paths call user_passed_article_quiz directly inside DEFINER bodies.
REVOKE EXECUTE ON FUNCTION public.can_user_see_discussion(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.can_user_see_discussion(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.can_user_see_discussion(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 11) create_support_ticket — DROP p_user_id + p_email (C-04 + M-14)
-- ---------------------------------------------------------------------
-- New signature: (p_category, p_subject, p_body). Reads auth.uid() +
-- email from public.users inside the body. The old 5-arg overload is
-- dropped atomically so no caller can accidentally fall back to it.
-- Called from /api/support (session-bound supabase client; keeps
-- EXECUTE to authenticated under the new signature).
DROP FUNCTION IF EXISTS public.create_support_ticket(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_category  text,
  p_subject   text,
  p_body      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id       uuid := auth.uid();
  v_email         text;
  v_ticket_number text;
  v_ticket_id     uuid;
  v_body          text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_category IS NULL OR btrim(p_category) = '' THEN
    RAISE EXCEPTION 'category required';
  END IF;
  IF p_subject IS NULL OR btrim(p_subject) = '' THEN
    RAISE EXCEPTION 'subject required';
  END IF;
  v_body := btrim(COALESCE(p_body, ''));
  IF v_body = '' THEN RAISE EXCEPTION 'body required'; END IF;

  -- Canonical email from the users table. Spoofed email values cannot
  -- reach support_tickets any more.
  SELECT email INTO v_email
    FROM public.users
   WHERE id = v_user_id;

  v_ticket_number := 'VP-' || upper(to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint));

  INSERT INTO public.support_tickets (
    ticket_number, user_id, email, category, subject, status, source
  ) VALUES (
    v_ticket_number, v_user_id, v_email, p_category, p_subject, 'open', 'in_app'
  ) RETURNING id INTO v_ticket_id;

  INSERT INTO public.ticket_messages (ticket_id, sender_id, is_staff, body)
  VALUES (v_ticket_id, v_user_id, false, v_body);

  RETURN jsonb_build_object(
    'id',            v_ticket_id,
    'ticket_number', v_ticket_number,
    'status',        'open'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_support_ticket(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(text, text, text)
  TO authenticated, service_role;

-- Bump global perms version so clients re-fetch capabilities map.
UPDATE public.perms_global_version SET version = version + 1, bumped_at = now() WHERE id = 1;

COMMIT;

-- =====================================================================
-- VERIFICATION QUERIES — run after migration commits
-- =====================================================================

-- V1. authenticated holds no EXECUTE on the 10 revoked RPCs.
SELECT p.proname, p.pronargs, r.rolname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN aclexplode(p.proacl) ax ON true
JOIN pg_roles r ON r.oid = ax.grantee
WHERE n.nspname = 'public'
  AND p.proname IN (
    'family_weekly_report','family_members','weekly_reading_report',
    'breaking_news_quota_check','check_user_achievements','start_conversation',
    '_user_freeze_allowance','user_article_attempts','user_has_dm_access',
    'can_user_see_discussion'
  )
  AND r.rolname = 'authenticated'
  AND ax.privilege_type = 'EXECUTE';
-- Expect: 0 rows.

-- V2. service_role still holds EXECUTE on all 11 RPCs.
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN aclexplode(p.proacl) ax ON true
JOIN pg_roles r ON r.oid = ax.grantee
WHERE n.nspname = 'public'
  AND p.proname IN (
    'family_weekly_report','family_members','weekly_reading_report',
    'breaking_news_quota_check','check_user_achievements','start_conversation',
    '_user_freeze_allowance','user_article_attempts','user_has_dm_access',
    'can_user_see_discussion','create_support_ticket'
  )
  AND r.rolname = 'service_role'
  AND ax.privilege_type = 'EXECUTE'
ORDER BY p.proname;
-- Expect: 11 rows (one per RPC).

-- V3. Old 5-arg create_support_ticket overload is gone.
SELECT oid::regprocedure
FROM pg_proc
WHERE proname = 'create_support_ticket'
  AND pronamespace = 'public'::regnamespace;
-- Expect: exactly one row, signature
--   public.create_support_ticket(text, text, text)

-- V4. New create_support_ticket body reads auth.uid() and users.email.
SELECT prosrc ~ 'auth\\.uid' AS uses_auth_uid,
       prosrc ~ 'FROM public\\.users' AS reads_users_table,
       prosrc !~ 'p_email' AS no_p_email_arg
FROM pg_proc
WHERE proname = 'create_support_ticket'
  AND pronamespace = 'public'::regnamespace;
-- Expect: all three columns true.

-- =====================================================================
-- SPOOF ATTEMPT PROBES — run as an authenticated Postgres role
-- (simulate a logged-in user session). Each call must fail with
-- permission-denied 42501 or return empty state.
-- =====================================================================

-- P1. As authenticated, attempt family_weekly_report with an arbitrary
--     owner id.
--   SET ROLE authenticated;
--   SELECT public.family_weekly_report(gen_random_uuid());
--   -- Expect: ERROR 42501 permission denied for function family_weekly_report

-- P2. As authenticated, attempt family_members.
--   SELECT public.family_members(gen_random_uuid());
--   -- Expect: ERROR 42501

-- P3. As authenticated, attempt weekly_reading_report.
--   SELECT public.weekly_reading_report(gen_random_uuid());
--   -- Expect: ERROR 42501

-- P4. As authenticated, attempt breaking_news_quota_check.
--   SELECT public.breaking_news_quota_check(gen_random_uuid());
--   -- Expect: ERROR 42501

-- P5. As authenticated, attempt check_user_achievements.
--   SELECT public.check_user_achievements(gen_random_uuid());
--   -- Expect: ERROR 42501

-- P6. As authenticated, attempt start_conversation with a spoofed
--     p_user_id (attacker id != session id).
--   SELECT public.start_conversation(gen_random_uuid(), gen_random_uuid());
--   -- Expect: ERROR 42501

-- P7. As authenticated, attempt each internal helper.
--   SELECT public._user_freeze_allowance(gen_random_uuid(), NULL);  -- 42501
--   SELECT public.user_article_attempts(gen_random_uuid(), gen_random_uuid(), NULL); -- 42501
--   SELECT public.user_has_dm_access(gen_random_uuid());            -- 42501
--   SELECT public.can_user_see_discussion(gen_random_uuid(), gen_random_uuid()); -- 42501

-- P8. As authenticated, call create_support_ticket with NEW signature
--     AND an attempt to send the old p_email poison payload.
--   -- The p_email arg no longer exists; the call below should succeed
--   -- and store users.email for the current session user.
--   SELECT public.create_support_ticket('billing', 'Test', 'body text');
--   -- Then:
--   SELECT user_id, email FROM public.support_tickets
--    WHERE ticket_number = (current ticket number);
--   -- Expect: email = (SELECT email FROM public.users WHERE id = auth.uid()).

-- P9. As authenticated, attempt to call the OLD 5-arg signature.
--   SELECT public.create_support_ticket(
--     gen_random_uuid(), 'evil@x.com', 'billing', 'Test', 'body');
--   -- Expect: ERROR "function ... does not exist" (old overload dropped).

-- =====================================================================
-- DEFINER-to-DEFINER CHAIN SANITY
-- =====================================================================
-- These calls are made by parent DEFINER functions owned by postgres,
-- which keeps EXECUTE on every function it owns. Run these as service
-- role to confirm parent chains still work:
--
--   SELECT public.post_message(user_id, conversation_id, 'hi');
--     -- internally invokes user_has_dm_access + _user_is_dm_blocked
--
--   SELECT public.advance_streak(user_id, NULL);
--     -- internally invokes _user_freeze_allowance
--
--   SELECT public.create_notification(user_id, 'breaking_news', 'x', 'y');
--     -- internally invokes breaking_news_quota_check
--
--   SELECT public.post_comment(user_id, article_id, 'body');
--     -- internally invokes user_passed_article_quiz (untouched this round)
--
-- Expect: all succeed.
