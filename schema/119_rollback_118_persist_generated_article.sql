-- schema/119_rollback_118_persist_generated_article.sql
-- 2026-04-22 — Rollback for schema/118_f7_persist_generated_article.sql
--
-- Idempotent: DROP FUNCTION IF EXISTS tolerates prior full/partial drops.
-- Reverses exactly the single addition in 118 and nothing more.
--
-- Pre-existing articles/kid_articles rows are not mutated. Drafts already
-- written by the RPC remain as status='draft' rows; they can be archived
-- or deleted separately.

BEGIN;

DROP FUNCTION IF EXISTS public.persist_generated_article(jsonb);

COMMIT;
