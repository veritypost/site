-- 040_data_export_email_template.sql
-- Replaces the placeholder body on the seeded data_export_ready email
-- template with real copy, and corrects the declared variables list to
-- match what the cron actually populates (see send-emails/route.js).
-- Idempotent: safe to re-run; uses UPDATE so the row's id/created_at stay
-- stable and any admin overrides to name/subject only are preserved.
-- (Placeholder body always gets overwritten -- that's the point.)

BEGIN;

UPDATE email_templates SET
  subject = 'Your Verity Post data export is ready',
  body_html = '<p>Hi {{username}},</p>' ||
              '<p>Your Verity Post data archive is ready to download.</p>' ||
              '<p><a href="{{action_url}}">Download your data</a></p>' ||
              '<p>This link is signed and expires on {{expires_at}}. If the link expires before you download, request a new export from your account settings.</p>' ||
              '<p>If you did not request this export, you can ignore this email.</p>' ||
              '<p>-- Verity Post</p>',
  body_text = 'Hi {{username}},' || E'\n\n' ||
              'Your Verity Post data archive is ready to download.' || E'\n\n' ||
              'Download: {{action_url}}' || E'\n\n' ||
              'This link is signed and expires on {{expires_at}}. If the link expires before you download, request a new export from your account settings.' || E'\n\n' ||
              'If you did not request this export, you can ignore this email.' || E'\n\n' ||
              '-- Verity Post',
  from_name = 'Verity Post',
  variables = '["username","action_url","expires_at"]'::jsonb,
  is_active = true,
  updated_at = now()
WHERE key = 'data_export_ready';

COMMIT;

-- Verify (manual):
-- SELECT key, subject, left(body_html, 80), variables, is_active
--   FROM email_templates WHERE key = 'data_export_ready';
