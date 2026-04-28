-- S1-A95 — articles: drop 4 dead columns
--
-- difficulty_level, ai_confidence_score, canonical_url, csam_scanned are
-- not referenced by any active code path, RLS policy, or index. They add
-- noise to SELECT * queries and can confuse future engineers. All confirmed
-- present (information_schema, 2026-04-27).
--
-- Callers: none found in web/ or ios/ source trees.
-- Dependent views/functions: none found referencing these columns.
--
-- Pre-flight: confirm all 4 present. Post-check: confirm all 4 gone.
-- Each DROP is in a single transaction so partial removal is impossible.

BEGIN;

DO $$
DECLARE
  v_missing text[] := '{}';
  c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['difficulty_level','ai_confidence_score','canonical_url','csam_scanned']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='articles' AND column_name=c
    ) THEN
      v_missing := array_append(v_missing, c);
    END IF;
  END LOOP;
  IF array_length(v_missing, 1) > 0 THEN
    RAISE NOTICE 'S1-A95 partial no-op: missing columns %', v_missing;
  END IF;
END $$;

ALTER TABLE public.articles
  DROP COLUMN IF EXISTS difficulty_level,
  DROP COLUMN IF EXISTS ai_confidence_score,
  DROP COLUMN IF EXISTS canonical_url,
  DROP COLUMN IF EXISTS csam_scanned;

DO $$
DECLARE c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['difficulty_level','ai_confidence_score','canonical_url','csam_scanned']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='articles' AND column_name=c
    ) THEN
      RAISE EXCEPTION 'S1-A95 post-check failed: column % still present', c;
    END IF;
  END LOOP;
  RAISE NOTICE 'S1-A95 applied: 4 dead articles columns removed';
END $$;

COMMIT;
