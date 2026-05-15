-- Wave 8 (commit 0f0085d9) introduced four new home_slots.kind values --
-- top_banner, story_card, rail_card, square_row -- and started writing
-- home_slot_items rows with content_type='ad' from the admin home editor
-- (the pin path lives in /api/admin/home/items/route.ts ALLOWED_CONTENT_TYPES).
--
-- Both CHECK constraints were relaxed directly against the live database
-- in the Wave 8 turn but no migration file landed in the repo. This file
-- captures the live state as code so a fresh checkout / branch reset gets
-- the same constraints. Running this is a no-op on the production DB
-- (DROP IF EXISTS + identical ARRAY contents).
BEGIN;

ALTER TABLE public.home_slots
  DROP CONSTRAINT IF EXISTS home_slots_kind_check;

ALTER TABLE public.home_slots
  ADD CONSTRAINT home_slots_kind_check
  CHECK (kind = ANY (ARRAY[
    'lead'::text,
    'second_lead'::text,
    'breaking_strip'::text,
    'cluster'::text,
    'list_rail'::text,
    'feature'::text,
    'engagement'::text,
    'promo'::text,
    'secondary_pair'::text,
    'wide_strip'::text,
    'editors_picks'::text,
    'data_ticker'::text,
    'insight_row'::text,
    'discovery_feed'::text,
    'quiz_from_article'::text,
    'top_banner'::text,
    'story_card'::text,
    'rail_card'::text,
    'square_row'::text
  ]));

ALTER TABLE public.home_slot_items
  DROP CONSTRAINT IF EXISTS home_slot_items_content_type_check;

ALTER TABLE public.home_slot_items
  ADD CONSTRAINT home_slot_items_content_type_check
  CHECK (content_type = ANY (ARRAY[
    'article'::text,
    'quiz'::text,
    'feature'::text,
    'custom'::text,
    'ad'::text
  ]));

COMMIT;
