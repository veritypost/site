-- 102_seed_data_export_ready_email_template.sql
-- T-012 — seed the `data_export_ready` template referenced by the
-- send-emails cron (web/src/app/api/cron/send-emails/route.js:23).
-- The cron maps 7 notification types; the email_templates table has
-- 6 matching rows. Without this seed, `data_export_ready`
-- notifications are silently skipped (ineligible branch at :67-76).
--
-- Variables available from the cron: username, title, body,
-- action_url, plus anything in notifications.metadata. The
-- data-export queue writes the download URL into action_url.
--
-- Idempotent via ON CONFLICT (key).

INSERT INTO public.email_templates
  (key, name, subject, body_html, body_text, from_name, variables, is_active)
VALUES
  ('data_export_ready',
   'Data Export Ready',
   'Your Verity Post data export is ready',
   '<p>Hi {{username}},</p>' ||
   '<p>Your account data export is ready to download.</p>' ||
   '<p><a href="{{action_url}}">Download your data</a></p>' ||
   '<p>This link expires in 7 days. If you did not request this export, please <a href="mailto:support@veritypost.com">contact support</a> immediately.</p>' ||
   '<p>— Verity Post</p>',
   'Hi {{username}},' || E'\n\n' ||
   'Your Verity Post data export is ready.' || E'\n\n' ||
   'Download: {{action_url}}' || E'\n\n' ||
   'This link expires in 7 days. If you did not request this, contact support@veritypost.com.',
   'Verity Post',
   '["username","action_url"]'::jsonb,
   true)
ON CONFLICT (key) DO UPDATE
  SET name       = EXCLUDED.name,
      subject    = EXCLUDED.subject,
      body_html  = EXCLUDED.body_html,
      body_text  = EXCLUDED.body_text,
      from_name  = EXCLUDED.from_name,
      variables  = EXCLUDED.variables,
      is_active  = EXCLUDED.is_active,
      updated_at = now();
