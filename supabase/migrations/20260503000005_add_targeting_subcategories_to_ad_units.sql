-- Slice 2: add targeting_subcategories to ad_units
--
-- The subcategory system already exists via categories.parent_id hierarchy.
-- articles.subcategory_id already has FK to categories(id).
-- This adds the one missing column so ad targeting can filter by subcategory (Slice 7).
-- Mirrors the existing targeting_categories / targeting_plans / targeting_cohorts pattern.

ALTER TABLE public.ad_units
  ADD COLUMN IF NOT EXISTS targeting_subcategories jsonb;
