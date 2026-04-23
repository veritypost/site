-- 133_rollback_132_trigger_reading_log_score.sql
-- Rollback for 132. Drops the AFTER INSERT/UPDATE triggers on
-- reading_log and the helper function. Note: rolling back means kid
-- iOS reads stop scoring + advancing streak again — only roll back if
-- the scoring path is being replaced (Option B route, or a different
-- trigger shape).

DROP TRIGGER IF EXISTS trg_reading_log_score_update ON public.reading_log;
DROP TRIGGER IF EXISTS trg_reading_log_score_insert ON public.reading_log;
DROP FUNCTION IF EXISTS public.tg_reading_log_score_on_complete();
