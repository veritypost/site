-- 106_kid_trial_freeze_notification.sql
-- Migration: extend freeze_kid_trial() to notify the parent.
--
-- Gap surfaced by TODO #41: the nightly cron sweep_kid_trial_expiries()
-- correctly freezes expired kid trial profiles (sets kid_profiles.is_active=false
-- + stamps trial_frozen_at metadata), but it never notified the parent.
-- The `kid_trial_expired` email template (seeded in schema/019) was orphaned;
-- nothing created a `notifications` row of that type.
--
-- D44 expects the parent to see "Your kid's trial has ended, upgrade to Family"
-- so they can convert. Without this notification, the kid profile quietly
-- disappears from the parent's dashboard and conversion drops.
--
-- Idempotent: CREATE OR REPLACE FUNCTION.

CREATE OR REPLACE FUNCTION public.freeze_kid_trial(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kid_name text;
  v_kid_count int := 0;
BEGIN
  -- Pick a kid name for the notification copy (parent may have multiple;
  -- use the first active trial kid). Done before the UPDATE because the
  -- UPDATE flips is_active=false.
  SELECT display_name INTO v_kid_name
    FROM kid_profiles
   WHERE parent_user_id = p_user_id
     AND (metadata->>'trial')::boolean = true
     AND is_active = true
   ORDER BY created_at
   LIMIT 1;

  -- Freeze every trial profile for this parent.
  UPDATE kid_profiles
     SET is_active = false,
         metadata = metadata || jsonb_build_object('trial_frozen_at', now()),
         updated_at = now()
   WHERE parent_user_id = p_user_id
     AND (metadata->>'trial')::boolean = true;

  GET DIAGNOSTICS v_kid_count = ROW_COUNT;

  -- T-041 — surface the freeze to the parent so they don't assume the
  -- trial is silently continuing. Uses the `kid_trial_expired` notification
  -- type (email template pre-seeded in schema/019).
  IF v_kid_count > 0 THEN
    PERFORM create_notification(
      p_user_id    := p_user_id,
      p_type       := 'kid_trial_expired',
      p_title      := COALESCE(v_kid_name, 'Your kid') || '''s trial has ended',
      p_body       := 'Upgrade to Verity Family to restore access and keep their streak.',
      p_action_url := '/profile/settings#billing',
      p_action_type := NULL,
      p_action_id   := NULL,
      p_priority    := 'normal',
      p_metadata    := jsonb_build_object(
        'kids_frozen', v_kid_count,
        'kid_name', v_kid_name,
        'upgrade_url', 'https://veritypost.com/profile/settings#billing'
      )
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.freeze_kid_trial(uuid) TO service_role;
