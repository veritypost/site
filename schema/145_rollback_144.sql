-- 145_rollback_144.sql
--
-- Rollback for 144_articles_hero_pick.sql.
-- Drops the three hero-pick columns + the partial index. Idempotent.

BEGIN;

DROP INDEX IF EXISTS public.idx_articles_hero_pick_today;

ALTER TABLE public.articles
  DROP COLUMN IF EXISTS hero_pick_for_date,
  DROP COLUMN IF EXISTS hero_pick_set_by,
  DROP COLUMN IF EXISTS hero_pick_set_at;

COMMIT;
