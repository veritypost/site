-- S1-T3.8 — resolve_report: notify reporter on resolution
--
-- The function updates the report row and writes an audit log entry but does
-- not tell the reporter anything. Reporters have no feedback loop: they file
-- a report and hear nothing back, which reduces trust and repeat reporting.
--
-- Verified state (2026-04-27): reports.reporter_id (uuid, nullable) exists.
-- No INSERT into notifications in the current prosrc.
--
-- Change: after the UPDATE + audit_log INSERT, look up reporter_id and insert
-- a notifications row. Skip if reporter_id IS NULL (anonymous/system reports).
-- email_sent=true pre-marks the row so the cron ignores it — 'report_resolved'
-- is not a cron-dispatched transactional type.
--
-- Signature, return type (void), SECURITY DEFINER, search_path preserved.
--
-- Acceptance: prosrc for resolve_report contains 'report_resolved'.

BEGIN;

DO $$
DECLARE
  body_text text;
BEGIN
  SELECT prosrc INTO body_text FROM pg_proc
   WHERE proname = 'resolve_report'
     AND pronamespace = 'public'::regnamespace;
  IF body_text IS NULL THEN
    RAISE NOTICE 'S1-T3.8 pre-flight: resolve_report absent (pre-dropped or first install) — DROP+CREATE below will install fresh';
  ELSIF body_text LIKE '%report_resolved%' THEN
    RAISE NOTICE 'S1-T3.8 no-op: resolve_report already notifies reporter — DROP+CREATE below reinstalls idempotently';
  END IF;
END $$;

-- Drop first: live function has parameter defaults that CREATE OR REPLACE
-- cannot remove (Postgres 42P13). Same signature, recreated below.
DROP FUNCTION IF EXISTS public.resolve_report(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.resolve_report(
  p_mod_id     uuid,
  p_report_id  uuid,
  p_resolution text,
  p_notes      text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_reporter_id uuid;
  v_target_type varchar;
BEGIN
  IF NOT _user_is_moderator(p_mod_id) THEN
    RAISE EXCEPTION 'moderator role required';
  END IF;

  UPDATE reports
     SET status           = 'resolved',
         resolution       = p_resolution,
         resolution_notes = p_notes,
         resolved_by      = p_mod_id,
         resolved_at      = now(),
         updated_at       = now()
   WHERE id = p_report_id
  RETURNING reporter_id, target_type INTO v_reporter_id, v_target_type;

  INSERT INTO audit_log (actor_id, actor_type, action, target_type, target_id, metadata)
  VALUES (p_mod_id, 'user', 'report.resolve', 'report', p_report_id,
          jsonb_build_object('resolution', p_resolution, 'notes', p_notes));

  -- Notify the reporter. Skip anonymous/system reports (reporter_id IS NULL).
  IF v_reporter_id IS NOT NULL THEN
    INSERT INTO notifications
      (user_id, type, title, body, metadata, email_sent)
    VALUES (
      v_reporter_id,
      'report_resolved',
      'Your report has been reviewed',
      format('A %s report you submitted has been resolved.',
             COALESCE(v_target_type, 'content')),
      jsonb_build_object(
        'report_id',   p_report_id,
        'resolution',  p_resolution,
        'target_type', v_target_type
      ),
      true  -- pre-mark; not a cron email type
    );
  END IF;
END;
$$;

DO $$
DECLARE
  body_text text;
BEGIN
  SELECT prosrc INTO body_text FROM pg_proc
   WHERE proname = 'resolve_report'
     AND pronamespace = 'public'::regnamespace;
  IF body_text NOT LIKE '%report_resolved%' THEN
    RAISE EXCEPTION 'S1-T3.8 post-check failed: report_resolved not in prosrc';
  END IF;
  RAISE NOTICE 'S1-T3.8 applied: resolve_report now notifies reporter';
END $$;

COMMIT;
