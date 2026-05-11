-- =============================================================================
-- Wave 4 — article_quiz_sponsor placement
-- =============================================================================
-- New editorial-safe native placement: a "Presented by X" eyebrow above the
-- article quiz idle card. Sitewide rotation (NOT per-article); industry
-- exclusion enforced via the existing ad_targets exclude mechanism, not via
-- a placement-level schema column.
--
-- Tier visibility mirrors the other article_* placements — hidden entirely
-- for paid tiers (verity_pro / verity_family / verity_family_xl), reduced
-- frequency for the standard 'verity' sub tier.
--
-- COPPA is N/A at this layer: the article-page engagement zone (which holds
-- the quiz card) is already gated upstream for COPPA articles, so the quiz
-- never renders and this placement never fetches. is_kids_safe stays false
-- to match the rest of the article_* family.
--
-- Idempotent via ON CONFLICT (name) — re-running this migration is a no-op
-- once the row exists. ad_placements.name has a UNIQUE constraint
-- (ad_placements_name_key) so this clause is well-defined.
-- =============================================================================

BEGIN;

INSERT INTO public.ad_placements (
  name,
  display_name,
  page,
  position,
  placement_type,
  is_active,
  hidden_for_tiers,
  reduced_for_tiers,
  is_kids_safe
) VALUES (
  'article_quiz_sponsor',
  'Article — Quiz Sponsor',
  'article',
  'quiz_sponsor',
  'native',
  true,
  ARRAY['verity_pro','verity_family','verity_family_xl']::text[],
  ARRAY['verity']::text[],
  false
)
ON CONFLICT (name) DO NOTHING;

COMMIT;
