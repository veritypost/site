-- Wave 3: schema relaxation only. Renderer + admin UI wiring is deferred to
-- Wave 9 when /quiz/[slug] ships. The new kind is forward-compatible: the
-- CHECK accepts rows, the renderer returns null for unknown kinds today,
-- and the admin canvas omits unknown-kind tiles by virtue of KIND_LABEL
-- being a Record<SlotKind, ...> -- non-extended SlotKind means
-- quiz_from_article rows simply won't render in the admin canvas until
-- Wave 9.
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
    'quiz_from_article'::text
  ]));

COMMIT;
