-- Wave 7 — AI picks category + subcategory per newly-formed story so the
-- result-screen card can render Category › Subcategory › Slug without a
-- Generate-time LLM hit.
--
-- Both columns are NULLABLE so existing rows need no backfill.
-- ai_category_id    → the best-matching category the Haiku call selected
-- ai_subcategory_id → the best-matching subcategory (child of ai_category_id)
--
-- Subcategories are rows in `categories` with a non-null parent_id
-- (there is no separate subcategories table — see Wave 1 schema notes).

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS ai_category_id    uuid REFERENCES public.categories(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_subcategory_id uuid REFERENCES public.categories(id)    ON DELETE SET NULL;
