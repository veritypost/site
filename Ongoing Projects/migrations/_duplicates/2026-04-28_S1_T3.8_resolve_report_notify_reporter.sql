-- =====================================================================
-- 2026-04-28_S1_T3.8_resolve_report_notify_reporter.sql
-- S1-T3.8 — resolve_report writes a notification to the reporter
-- Source: Ongoing Projects/Sessions/Session_01_DB_Migrations.md (S1-T3.8)
-- Severity: P2 (moderation chain dead at the final link)
-- =====================================================================
-- Verified state (2026-04-28 via pg_get_functiondef + information_schema):
--   resolve_report(p_mod_id, p_report_id, p_resolution, p_notes) only
--   updates the reports row + writes audit_log. No notification path.
--   reports table has reporter_id, target_type, target_id columns
--   (verified). Users who report don't see outcome.
--
-- Fix: after updating the report, look up the reporter + the reported
-- target (for action_url) and INSERT a notifications row with the
-- resolution outcome. email_sent=true (moderation outcomes are in-app
-- only, per memory project_email_notifications_scope: email is
-- security/billing only).
--
-- Rollback:
--   Restore prior body without the notification INSERT block.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc
                 WHERE proname='resolve_report'
                   AND pronamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'resolve_report RPC missing — abort';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='reports'
                   AND column_name='reporter_id') THEN
    RAISE EXCEPTION 'reports.reporter_id missing — surface column-name drift before applying';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_report(
  p_mod_id uuid,
  p_report_id uuid,
  p_resolution text,
  p_notes text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_report public.reports%ROWTYPE;
  v_action_url text := '/';
  v_target_kind text;
BEGIN
  IF NOT _user_is_moderator(p_mod_id) THEN
    RAISE EXCEPTION 'moderator role required';
  END IF;

  -- Pull the report first so the reporter notification has all the
  -- context (reporter_id, target_type, target_id).
  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'report % not found', p_report_id;
  END IF;

  UPDATE public.reports
     SET status = 'resolved',
         resolution = p_resolution,
         resolution_notes = p_notes,
         resolved_by = p_mod_id,
         resolved_at = now(),
         updated_at = now()
   WHERE id = p_report_id;

  INSERT INTO public.audit_log (actor_id, actor_type, action, target_type, target_id, metadata)
  VALUES (p_mod_id, 'user', 'report.resolve', 'report', p_report_id,
          jsonb_build_object('resolution', p_resolution, 'notes', p_notes));

  -- T3.8 — notify the reporter so they can see the outcome. Skip when
  -- the report has no reporter_id (e.g., system-generated reports).
  -- email_sent=true keeps moderation outcomes in-app only.
  IF v_report.reporter_id IS NOT NULL THEN
    -- Resolve a sensible action_url back to the offending content. For
    -- comment targets, link to the comment thread. For user targets,
    -- link to their public profile. Otherwise fall back to root.
    v_target_kind := COALESCE(v_report.target_type, '');
    IF v_target_kind = 'comment' AND v_report.target_id IS NOT NULL THEN
      SELECT format('/story/%s#comment-%s',
                    COALESCE(a.slug, c.article_id::text),
                    c.id)
        INTO v_action_url
        FROM public.comments c
        LEFT JOIN public.articles a ON a.id = c.article_id
       WHERE c.id = v_report.target_id;
    ELSIF v_target_kind = 'user' AND v_report.target_id IS NOT NULL THEN
      SELECT format('/u/%s', u.username)
        INTO v_action_url
        FROM public.users u
       WHERE u.id = v_report.target_id;
    END IF;
    v_action_url := COALESCE(v_action_url, '/');

    INSERT INTO public.notifications
      (user_id, type, title, body, action_url, metadata, email_sent)
    VALUES (
      v_report.reporter_id,
      'report_resolved',
      'Your report was reviewed',
      CASE p_resolution
        WHEN 'removed'   THEN 'We removed the content you reported. Thanks for helping keep the community safe.'
        WHEN 'dismissed' THEN 'We reviewed your report. After review, we determined no action was needed.'
        WHEN 'warned'    THEN 'We reviewed your report and warned the user. Thanks for helping keep the community safe.'
        ELSE 'Your report has been reviewed.'
      END,
      v_action_url,
      jsonb_build_object(
        'report_id', p_report_id,
        'resolution', p_resolution,
        'target_type', v_target_kind,
        'target_id', v_report.target_id
      ),
      true
    );
  END IF;
END;
$function$;

DO $$ BEGIN RAISE NOTICE 'S1-T3.8 applied: resolve_report notifies reporter'; END $$;

COMMIT;
