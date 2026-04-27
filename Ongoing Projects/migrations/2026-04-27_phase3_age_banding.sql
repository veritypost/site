-- =====================================================================
-- 2026-04-27_phase3_age_banding.sql
-- Phase 3 of AI + Plan Change Implementation: age banding
-- =====================================================================
-- Decisions locked 2026-04-26:
--   - 3 reading bands: kids (7-9) / tweens (10-12) / graduated (13+)
--   - Ratchet-only progression: never reverts (graduated > tweens > kids)
--   - System-derived from kid_profiles.date_of_birth, never user-set
--   - articles.age_band tags every article into one of: kids|tweens|adult
--   - RLS keyed off (is_kids_safe, age_band, profile.reading_band):
--       kids profiles see age_band='kids' only
--       tweens profiles see age_band IN ('kids','tweens')
--       graduated profiles see nothing in kid app (their JWT no longer
--         resolves; they go through adult app)
--
-- This migration:
--   A. Adds reading_band + band_changed_at + band_history to kid_profiles
--   B. Backfills reading_band from existing date_of_birth values
--   C. Drops vestigial kid_profiles.age_range column
--   D. Drops the 5 (Kids) category variants and reparents any refs
--   E. Ensures base kid-safe categories are flagged is_kids_safe=true
--   F. Adds feed_clusters sibling FK columns
--   G. Helper SQL functions for band-aware RLS (kid_visible_bands +
--      current_kid_profile_id)
--   H. Rewrites articles RLS for kid SELECT to gate on band visibility
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- A. kid_profiles: reading_band + band_changed_at + band_history
-- ---------------------------------------------------------------------

ALTER TABLE public.kid_profiles
  ADD COLUMN IF NOT EXISTS reading_band text NOT NULL DEFAULT 'kids'
    CHECK (reading_band IN ('kids', 'tweens', 'graduated'));

ALTER TABLE public.kid_profiles
  ADD COLUMN IF NOT EXISTS band_changed_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.kid_profiles
  ADD COLUMN IF NOT EXISTS band_history jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ---------------------------------------------------------------------
-- B. Backfill reading_band from date_of_birth
--    Ages 0-9 → 'kids'; 10-12 → 'tweens'; 13+ → 'graduated' (these
--    profiles will be retired by the graduation flow when Phase 5 ships;
--    flag them now so kid app reads return empty for graduated rows).
-- ---------------------------------------------------------------------
UPDATE public.kid_profiles
SET reading_band = CASE
  WHEN date_of_birth IS NULL THEN 'kids'
  WHEN extract(year FROM age(date_of_birth)) >= 13 THEN 'graduated'
  WHEN extract(year FROM age(date_of_birth)) >= 10 THEN 'tweens'
  ELSE 'kids'
END,
  band_changed_at = now(),
  band_history = jsonb_build_array(
    jsonb_build_object(
      'band', CASE
        WHEN date_of_birth IS NULL THEN 'kids'
        WHEN extract(year FROM age(date_of_birth)) >= 13 THEN 'graduated'
        WHEN extract(year FROM age(date_of_birth)) >= 10 THEN 'tweens'
        ELSE 'kids'
      END,
      'set_at', now(),
      'set_by', null,
      'reason', 'phase3_backfill_from_dob'
    )
  );

-- ---------------------------------------------------------------------
-- C. Drop vestigial kid_profiles.age_range column
--    Audit found 0 production rows had this set (1 row total in DB,
--    age_range NULL). Adult app's iOS Models.swift reads it for
--    legacy ageLabel paths but Phase 5 of the plan retires those.
--    Defensive: column exists; drop with IF EXISTS so re-runs are safe.
-- ---------------------------------------------------------------------
ALTER TABLE public.kid_profiles
  DROP COLUMN IF EXISTS age_range;

-- ---------------------------------------------------------------------
-- D. Category dedup: drop (Kids) variants, reparent refs to base.
--    Verified categories with the suffix 2026-04-26: 5 variants exist
--    (Science (Kids), World (Kids), Tech (Kids), Sports (Kids),
--    Health (Kids)). Each has a base counterpart ("Science", "World",
--    "Tech", "Sports", "Health"). Reparent any FK references then drop
--    the variant rows.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_pair record;
BEGIN
  FOR v_pair IN
    SELECT k.id AS kid_id, k.name AS kid_name,
           b.id AS base_id, b.name AS base_name
    FROM public.categories k
    JOIN public.categories b ON regexp_replace(k.name, ' \(Kids\)$', '') = b.name
    WHERE k.name LIKE '% (Kids)'
  LOOP
    -- Reparent articles
    UPDATE public.articles SET category_id = v_pair.base_id WHERE category_id = v_pair.kid_id;
    -- Reparent any prompt overrides that reference the variant
    UPDATE public.ai_prompt_overrides SET category_id = v_pair.base_id WHERE category_id = v_pair.kid_id;
    -- Reparent feed_clusters
    UPDATE public.feed_clusters SET category_id = v_pair.base_id WHERE category_id = v_pair.kid_id;
    -- Now safe to delete the variant
    DELETE FROM public.categories WHERE id = v_pair.kid_id;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- E. Ensure base kid-safe categories are flagged is_kids_safe=true.
--    Some natural-kid base categories may not have the flag set in DB;
--    set defensively. Audit 2026-04-26 verified `is_kids_safe` exists
--    on categories.
-- ---------------------------------------------------------------------
UPDATE public.categories
SET is_kids_safe = true
WHERE name IN (
  'Animals', 'Arts', 'History', 'Space', 'Weather',
  'Health', 'Science', 'Technology', 'World', 'Sports',
  'Education'
)
  AND (is_kids_safe IS NULL OR is_kids_safe = false);

-- ---------------------------------------------------------------------
-- F. feed_clusters sibling FK columns for the 3-article cluster pattern
--    primary_article_id stays as "the adult article" for back-compat.
--    primary_kid_article_id + primary_tween_article_id track the kid/tween
--    siblings produced by Phase 3's band-loop generation.
-- ---------------------------------------------------------------------
ALTER TABLE public.feed_clusters
  ADD COLUMN IF NOT EXISTS primary_kid_article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primary_tween_article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_feed_clusters_primary_kid
  ON public.feed_clusters (primary_kid_article_id)
  WHERE primary_kid_article_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feed_clusters_primary_tween
  ON public.feed_clusters (primary_tween_article_id)
  WHERE primary_tween_article_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- G. Helper SQL functions for band-aware RLS
-- ---------------------------------------------------------------------

-- Returns the array of age_band values a given kid profile can read.
-- Stable so RLS can call it once per query.
CREATE OR REPLACE FUNCTION public.kid_visible_bands(p_profile_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_band text;
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;
  SELECT reading_band INTO v_band FROM public.kid_profiles WHERE id = p_profile_id;
  RETURN CASE v_band
    WHEN 'kids' THEN ARRAY['kids']
    WHEN 'tweens' THEN ARRAY['kids', 'tweens']
    -- graduated → empty (kid app login is rejected; defensive return)
    ELSE ARRAY[]::text[]
  END;
END;
$$;

-- Pulls the active kid_profile_id from JWT app_metadata for kid sessions.
-- Returns NULL for non-kid JWTs.
CREATE OR REPLACE FUNCTION public.current_kid_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(auth.jwt() -> 'app_metadata' ->> 'kid_profile_id', '')::uuid
$$;

-- ---------------------------------------------------------------------
-- H. Rewrite articles RLS for kid SELECT to gate on band visibility.
--    The Phase 1 consolidation (kid_articles → articles + is_kids_safe)
--    ran without updating any kid-specific RLS. Phase 3 wires the band
--    filter so a kids-band JWT can only see age_band='kids' articles,
--    and tweens see kids+tweens. Adults are unaffected.
--
--    is_kid_delegated() is the existing helper for kid sessions.
-- ---------------------------------------------------------------------

-- Drop any leftover or pre-existing kid-on-articles policies first
DROP POLICY IF EXISTS articles_read_kid_jwt ON public.articles;

CREATE POLICY articles_read_kid_jwt ON public.articles
  FOR SELECT
  USING (
    is_kid_delegated()
    AND status = 'published'
    AND is_kids_safe = true
    AND (age_band IS NULL OR age_band = ANY(public.kid_visible_bands(public.current_kid_profile_id())))
  );

COMMIT;
