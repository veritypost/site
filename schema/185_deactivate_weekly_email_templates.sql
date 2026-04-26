-- T-128 + T-129: Deactivate weekly digest email templates.
-- These templates are removed from the email delivery chain (send-emails cron,
-- user alert preferences, admin toggles). The records are kept (soft-delete)
-- so historical notification rows that reference these types don't orphan.
-- The weekly_reading_report RPC and /api/reports/weekly-reading-report route
-- are data endpoints and are NOT touched by this migration.

UPDATE public.email_templates
SET is_active = false
WHERE key IN ('weekly_reading_report', 'weekly_family_report');

-- Verification: should return 2 rows with is_active=false
-- SELECT key, is_active FROM public.email_templates
-- WHERE key IN ('weekly_reading_report', 'weekly_family_report');
