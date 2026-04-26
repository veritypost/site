-- 093_rpc_actor_lockdown_2026_04_19.sql
-- Migration: 20260419203646 093_rpc_actor_lockdown_2026_04_19
--
-- Round A RPC actor lockdown — restrict 10 elevated RPCs to service_role only;
-- rewrite create_support_ticket to derive user_id from auth.uid() (drops p_user_id + p_email params).
-- Reconstructed 2026-04-26 from supabase_migrations.schema_migrations.statements column.
-- No DB change applied by this file — prod already matches it.

BEGIN;

-- 1) family_weekly_report
REVOKE EXECUTE ON FUNCTION public.family_weekly_report(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.family_weekly_report(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.family_weekly_report(uuid) TO service_role;

-- 2) family_members
REVOKE EXECUTE ON FUNCTION public.family_members(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.family_members(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.family_members(uuid) TO service_role;

-- 3) weekly_reading_report
REVOKE EXECUTE ON FUNCTION public.weekly_reading_report(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.weekly_reading_report(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.weekly_reading_report(uuid) TO service_role;

-- 4) breaking_news_quota_check
REVOKE EXECUTE ON FUNCTION public.breaking_news_quota_check(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.breaking_news_quota_check(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.breaking_news_quota_check(uuid) TO service_role;

-- 5) check_user_achievements
REVOKE EXECUTE ON FUNCTION public.check_user_achievements(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_user_achievements(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_user_achievements(uuid) TO service_role;

-- 6) start_conversation
REVOKE EXECUTE ON FUNCTION public.start_conversation(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.start_conversation(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.start_conversation(uuid, uuid) TO service_role;

-- 7) _user_freeze_allowance
REVOKE EXECUTE ON FUNCTION public._user_freeze_allowance(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._user_freeze_allowance(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public._user_freeze_allowance(uuid, uuid) TO service_role;

-- 8) user_article_attempts
REVOKE EXECUTE ON FUNCTION public.user_article_attempts(uuid, uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.user_article_attempts(uuid, uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_article_attempts(uuid, uuid, uuid) TO service_role;

-- 9) user_has_dm_access
REVOKE EXECUTE ON FUNCTION public.user_has_dm_access(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.user_has_dm_access(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_has_dm_access(uuid) TO service_role;

-- 10) can_user_see_discussion
REVOKE EXECUTE ON FUNCTION public.can_user_see_discussion(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.can_user_see_discussion(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.can_user_see_discussion(uuid, uuid) TO service_role;

-- 11) create_support_ticket — DROP p_user_id + p_email
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

UPDATE public.perms_global_version SET version = version + 1, bumped_at = now() WHERE id = 1;

COMMIT;
