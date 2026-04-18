-- 041_expert_reverification.sql
-- Annual expert re-verification flagging (Blueprint 2.4). Notify experts
-- whose credentials expire within 30 days; set a flag so admins see them
-- in /admin/verification; do NOT auto-revoke roles. Idempotent.

BEGIN;

-- Dedup flag: when set, the expert has already been notified for the
-- current credential cycle. Cleared/advanced by the RPC each run.
-- NULL means "never notified yet" (e.g. credentials approved pre-feature).
ALTER TABLE expert_applications
  ADD COLUMN IF NOT EXISTS reverification_notified_at timestamptz;

-- Seed the email template that send-emails will render for the
-- expert_reverification_due notification type. Overwrite-safe.
INSERT INTO email_templates (key, name, subject, body_html, body_text, from_name, variables, is_active)
VALUES (
  'expert_reverification_due',
  'Expert Re-verification Due',
  'Your Verity Post credential renewal is due soon',
  '<p>Hi {{username}},</p>' ||
    '<p>Your Verity Post {{role_label}} credential is due for renewal on {{expires_at}}.</p>' ||
    '<p>Annual re-verification keeps the credibility layer on the platform honest. Please re-submit your credentials before the expiry date to keep your badge active.</p>' ||
    '<p><a href="{{action_url}}">Start re-verification</a></p>' ||
    '<p>If you do not re-verify before the expiry date, an admin will review your status and may contact you directly.</p>' ||
    '<p>-- Verity Post</p>',
  'Hi {{username}},' || E'\n\n' ||
    'Your Verity Post {{role_label}} credential is due for renewal on {{expires_at}}.' || E'\n\n' ||
    'Annual re-verification keeps the credibility layer on the platform honest. Please re-submit your credentials before the expiry date to keep your badge active.' || E'\n\n' ||
    'Start re-verification: {{action_url}}' || E'\n\n' ||
    'If you do not re-verify before the expiry date, an admin will review your status and may contact you directly.' || E'\n\n' ||
    '-- Verity Post',
  'Verity Post',
  '["username","role_label","action_url","expires_at"]'::jsonb,
  true
)
ON CONFLICT (key) DO UPDATE SET
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  body_text = EXCLUDED.body_text,
  from_name = EXCLUDED.from_name,
  variables = EXCLUDED.variables,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- flag_expert_reverifications_due:
-- Finds approved expert applications whose credentials expire within the
-- warning window and have not yet been notified for this credential
-- cycle. For each: creates an expert_reverification_due notification and
-- stamps reverification_notified_at = now(). Returns the count flagged.
CREATE OR REPLACE FUNCTION public.flag_expert_reverifications_due(
  p_warning_days integer DEFAULT 30
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app expert_applications%ROWTYPE;
  v_count integer := 0;
  v_site_url text := COALESCE(current_setting('app.site_url', true), 'https://veritypost.com');
  v_reverify_url text;
  v_role_label text;
BEGIN
  FOR v_app IN
    SELECT *
      FROM expert_applications
     WHERE status = 'approved'
       AND credential_expires_at IS NOT NULL
       AND credential_expires_at < now() + make_interval(days => p_warning_days)
       AND (
         reverification_notified_at IS NULL
         OR reverification_notified_at < credential_verified_at
       )
  LOOP
    v_reverify_url := v_site_url || '/signup/expert';
    v_role_label := CASE v_app.application_type
                      WHEN 'expert'     THEN 'expert'
                      WHEN 'educator'   THEN 'educator'
                      WHEN 'journalist' THEN 'journalist'
                      ELSE v_app.application_type
                    END;

    PERFORM create_notification(
      v_app.user_id,
      'expert_reverification_due',
      'Your credential renewal is due soon',
      'Your ' || v_role_label || ' credential expires on '
        || to_char(v_app.credential_expires_at, 'YYYY-MM-DD')
        || '. Re-verify to keep your badge active.',
      v_reverify_url,
      'expert_application',
      v_app.id,
      'normal',
      jsonb_build_object(
        'role_label',  v_role_label,
        'expires_at',  to_char(v_app.credential_expires_at, 'YYYY-MM-DD'),
        'application_id', v_app.id
      )
    );

    UPDATE expert_applications
       SET reverification_notified_at = now(),
           updated_at = now()
     WHERE id = v_app.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.flag_expert_reverifications_due(integer) TO service_role;

COMMIT;

-- Verify (manual):
-- SELECT * FROM expert_applications
--   WHERE status='approved'
--     AND credential_expires_at < now() + interval '30 days';
-- SELECT public.flag_expert_reverifications_due(30);
-- SELECT key, is_active FROM email_templates WHERE key='expert_reverification_due';
