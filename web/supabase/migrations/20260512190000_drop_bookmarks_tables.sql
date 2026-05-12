-- Drop bookmarks + bookmark_collections entirely. Story-follow is the
-- only reading-list primitive going forward.
--
-- See Outstanding.md item 13. Adversary review caught two things:
-- (1) The prior draft would have CASCADE-dropped update_updated_at_column(),
--     a shared helper used by 56+ tables. This migration drops only
--     bookmark-specific triggers/functions and leaves the shared helper.
-- (2) guard_system_permissions() prevents hard DELETE of permission rows;
--     they must be soft-retired with is_active=false.
--
-- The 2 live bookmark rows belong to free@veritypost.com (test) and
-- admin@veritypost.com (admin). Neither is real user data; no
-- preservation needed.

-- 1. Delete permission_set_perms associations for bookmark-scoped
--    permission rows. The permission rows themselves are soft-retired
--    in step 2 (the guard_system_permissions trigger blocks hard delete).
DELETE FROM public.permission_set_perms
WHERE permission_id IN (
  SELECT id FROM public.permissions
  WHERE key LIKE 'bookmark%'
     OR key LIKE 'bookmarks.%'
     OR key LIKE 'article.bookmark%'
     OR key LIKE 'ios.bookmark%'
     OR key = 'ios.gesture.swipe_bookmark'
     OR key LIKE 'kids.bookmark%'
     OR key = 'search.bookmarks'
);

-- 2. Soft-retire bookmark-scoped permission rows.
UPDATE public.permissions
SET is_active = false
WHERE (key LIKE 'bookmark%'
       OR key LIKE 'bookmarks.%'
       OR key LIKE 'article.bookmark%'
       OR key LIKE 'ios.bookmark%'
       OR key = 'ios.gesture.swipe_bookmark'
       OR key LIKE 'kids.bookmark%'
       OR key = 'search.bookmarks')
  AND is_active = true;

-- 3. Delete plan_features rows that gated bookmark behavior across tiers.
DELETE FROM public.plan_features
WHERE feature_key IN ('bookmarks', 'bookmark_collections');

-- 4. Drop bookmark-specific triggers explicitly (the shared
--    update_updated_at_column() function stays — it serves 56+ tables).
DROP TRIGGER IF EXISTS bookmark_cap_trg ON public.bookmarks;
DROP TRIGGER IF EXISTS bookmark_collection_count_trg ON public.bookmarks;
DROP TRIGGER IF EXISTS trg_bookmark_collections_updated_at ON public.bookmark_collections;

-- 5. Drop bookmark-specific functions.
DROP FUNCTION IF EXISTS public.enforce_bookmark_cap();
DROP FUNCTION IF EXISTS public.bookmark_collection_count_sync();
DROP FUNCTION IF EXISTS public.admin_force_bookmark(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.create_bookmark_collection(uuid, text, text);
DROP FUNCTION IF EXISTS public.delete_bookmark_collection(uuid, uuid);
DROP FUNCTION IF EXISTS public.rename_bookmark_collection(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.increment_bookmark_count(uuid, integer);

-- 6. Drop the two tables. CASCADE handles any straggler FK/index/policy.
DROP TABLE IF EXISTS public.bookmarks CASCADE;
DROP TABLE IF EXISTS public.bookmark_collections CASCADE;

-- 7. Drop the denormalized counter column on articles. Nothing reads it.
ALTER TABLE public.articles DROP COLUMN IF EXISTS bookmark_count;
