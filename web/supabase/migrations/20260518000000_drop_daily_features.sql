-- Retire the Feature slot + daily_features table.
--
-- The Feature slot (web/src/app/_home/slots/Feature.tsx) was the
-- "By the numbers / Receipts / Quote / Pull quote" daily editorial
-- block surfaced on the templated homepage. Schema + read code
-- shipped 2026-05-10 (commit 86620cfd) but the admin write surface
-- was reserved-for and never built; the only data ever in the table
-- was the migration seed row (feature_date=2026-05-09).
--
-- Owner call 2026-05-18: retire the unfinished feature entirely.
-- Pre-flight verified live: 0 home_slots have kind='feature',
-- 0 home_slot_items have content_type='feature', and the table
-- contains only the seed row.

DROP TABLE IF EXISTS public.daily_features;

ALTER TABLE public.home_slots
  DROP CONSTRAINT IF EXISTS home_slots_kind_check;

ALTER TABLE public.home_slots
  ADD CONSTRAINT home_slots_kind_check
  CHECK (kind = ANY (ARRAY[
    'lead',
    'second_lead',
    'breaking_strip',
    'cluster',
    'list_rail',
    'engagement',
    'promo',
    'secondary_pair',
    'wide_strip',
    'editors_picks',
    'data_ticker',
    'insight_row',
    'discovery_feed',
    'quiz_from_article',
    'top_banner',
    'story_card',
    'rail_card',
    'square_row'
  ]));

ALTER TABLE public.home_slot_items
  DROP CONSTRAINT IF EXISTS home_slot_items_content_type_check;

ALTER TABLE public.home_slot_items
  ADD CONSTRAINT home_slot_items_content_type_check
  CHECK (content_type = ANY (ARRAY[
    'article',
    'quiz',
    'custom',
    'ad'
  ]));
