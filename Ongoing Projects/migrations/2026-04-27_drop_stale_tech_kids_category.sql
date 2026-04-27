-- T4.9 — Drop stale "Tech (Kids)" category row left over from the
-- Phase 3 category-dedup migration. Per the dedup pass, kid-safe Tech
-- content lives under the base "Technology" row (id 04c484f4-…); the
-- "Tech (Kids)" sibling at slug='kids-tech' is an orphan with no
-- consumers.
--
-- Pre-flight verified 2026-04-27 against prod:
--
--   Row to drop:
--     id   = 5a9695c9-df49-45c8-9e82-29292107c472
--     name = 'Tech (Kids)'
--     slug = 'kids-tech'
--     parent_id = NULL
--     is_kids_safe = true
--     is_active = true
--     deleted_at = NULL
--     article_count = 0
--
--   References across every category_id column in the public schema
--   (18 tables: ai_prompt_overrides{,subcat}, ai_prompt_presets,
--   articles{,subcat}, category_scores, category_supervisors,
--   expert_application_categories, expert_discussions, expert_queue_items
--   (target_category_id), feed_clusters, feeds, kid_category_permissions,
--   kid_expert_sessions, reports (supervisor_category_id), score_events,
--   user_preferred_categories, weekly_recap_quizzes) — all return 0.
--
--   Children (categories.parent_id = …472): 0.
--
-- No FK constraints declared on categories.id at the DB level (verified
-- via information_schema), so RESTRICT is not enforcing anything; the
-- drop succeeds because the row is genuinely unreferenced.
--
-- A repoint-then-delete dance is unnecessary — there is nothing to
-- repoint. Single DELETE, guarded by id + slug + name so a future
-- environment that has already cleared the row (or seeded a different
-- "Tech (Kids)" id) silently no-ops instead of dropping the wrong row.

BEGIN;

-- Defensive: re-verify zero references inside the transaction before the
-- DELETE. If any of the 18 category_id columns now hold the stale id,
-- abort the transaction so the operator can investigate. Counts are
-- summed into a single row to keep the check compact.
DO $$
DECLARE
  ref_count integer;
BEGIN
  SELECT
    (SELECT count(*) FROM ai_prompt_overrides WHERE category_id = '5a9695c9-df49-45c8-9e82-29292107c472') +
    (SELECT count(*) FROM ai_prompt_overrides WHERE subcategory_id = '5a9695c9-df49-45c8-9e82-29292107c472') +
    (SELECT count(*) FROM ai_prompt_presets WHERE category_id = '5a9695c9-df49-45c8-9e82-29292107c472') +
    (SELECT count(*) FROM articles WHERE category_id = '5a9695c9-df49-45c8-9e82-29292107c472') +
    (SELECT count(*) FROM articles WHERE subcategory_id = '5a9695c9-df49-45c8-9e82-29292107c472') +
    (SELECT count(*) FROM category_scores WHERE category_id = '5a9695c9-df49-45c8-9e82-29292107c472') +
    (SELECT count(*) FROM category_supervisors WHERE category_id = '5a9695c9-df49-45c8-9e82-29292107c472') +
    (SELECT count(*) FROM expert_application_categories WHERE category_id = '5a9695c9-df49-45c8-9e82-29292107c472') +
    (SELECT count(*) FROM expert_discussions WHERE category_id = '5a9695c9-df49-45c8-9e82-29292107c472') +
    (SELECT count(*) FROM expert_queue_items WHERE target_category_id = '5a9695c9-df49-45c8-9e82-29292107c472') +
    (SELECT count(*) FROM feed_clusters WHERE category_id = '5a9695c9-df49-45c8-9e82-29292107c472') +
    (SELECT count(*) FROM feeds WHERE category_id = '5a9695c9-df49-45c8-9e82-29292107c472') +
    (SELECT count(*) FROM kid_category_permissions WHERE category_id = '5a9695c9-df49-45c8-9e82-29292107c472') +
    (SELECT count(*) FROM kid_expert_sessions WHERE category_id = '5a9695c9-df49-45c8-9e82-29292107c472') +
    (SELECT count(*) FROM reports WHERE supervisor_category_id = '5a9695c9-df49-45c8-9e82-29292107c472') +
    (SELECT count(*) FROM score_events WHERE category_id = '5a9695c9-df49-45c8-9e82-29292107c472') +
    (SELECT count(*) FROM user_preferred_categories WHERE category_id = '5a9695c9-df49-45c8-9e82-29292107c472') +
    (SELECT count(*) FROM weekly_recap_quizzes WHERE category_id = '5a9695c9-df49-45c8-9e82-29292107c472') +
    (SELECT count(*) FROM categories WHERE parent_id = '5a9695c9-df49-45c8-9e82-29292107c472')
  INTO ref_count;

  IF ref_count > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop categories row 5a9695c9-…472 — % references found across category_id columns. Repoint first.',
      ref_count;
  END IF;
END
$$;

DELETE FROM categories
WHERE id   = '5a9695c9-df49-45c8-9e82-29292107c472'
  AND slug = 'kids-tech'
  AND name = 'Tech (Kids)';

COMMIT;
