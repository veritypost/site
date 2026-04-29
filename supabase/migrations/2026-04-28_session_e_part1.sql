-- Session E PR 1 — drop the dead pipeline.max_concurrent_generations setting.
-- Per Wave 2C analysis, this setting exists in DB but is never read by code
-- (subsumed by Session A's pipeline_cost_reservations advisory-lock model).

BEGIN;

DELETE FROM public.settings
 WHERE settings.key = 'pipeline.max_concurrent_generations';

-- Session E PR 1 — deactivate two orphan permission keys.
-- Verified zero callers in web/src/ via the SESSION-E-AUDIT process; safe to retire.
-- The other 8 legacy keys still have active callers and stay active per FOLLOWUPS D9.

UPDATE public.permissions
   SET is_active = false
 WHERE permissions.key IN (
   'admin.moderation.ai_signals',
   'admin.articles.ai_regenerate'
 );

COMMIT;
