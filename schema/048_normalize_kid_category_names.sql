-- 048_normalize_kid_category_names.sql
-- Bug 63: Seed data drift — kid-safe categories have four different naming
-- conventions ("Science (kids)", "World (kid)", "Kids Science", "Science kids").
-- Kid mode used a `stripKidsPrefix` client-side workaround; removing the
-- drift is strictly better because the same `categories.name` is surfaced in
-- /admin/kids-story-manager, the kid leaderboard, the kid home tile grid, and
-- downstream analytics.
--
-- The `is_kids_safe` boolean is the authoritative kid marker — the name no
-- longer needs to encode it. This migration normalises existing rows to their
-- non-suffixed form and relies on:
--   (a) application code to NOT re-add a "kids" suffix when new rows are
--       created via /admin/categories (the form already has a boolean toggle
--       for is_kids_safe);
--   (b) downstream use of `is_kids_safe` for all kid-surface filtering
--       (already in place per Bugs 3, 58, 69, 73).
--
-- Idempotent — re-running on already-normalised names is a no-op.

BEGIN;

-- Trim parenthesised "(kids)" / "(kid)" suffixes.
UPDATE public.categories
SET name = regexp_replace(name, '\s*\((kids?)\)\s*$', '', 'i')
WHERE name ~* '\s*\((kids?)\)\s*$';

-- Trim trailing " kids" / " kid" words (no parens).
UPDATE public.categories
SET name = regexp_replace(name, '\s+(kids?)\s*$', '', 'i')
WHERE name ~* '\s+(kids?)\s*$';

-- Trim leading "Kids " / "Kid " prefixes.
UPDATE public.categories
SET name = regexp_replace(name, '^(kids?)\s+', '', 'i')
WHERE name ~* '^(kids?)\s+';

-- Any accidental leading/trailing whitespace from the above.
UPDATE public.categories
SET name = btrim(name)
WHERE name <> btrim(name);

COMMIT;
