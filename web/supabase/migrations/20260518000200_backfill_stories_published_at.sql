-- Backfill stories.published_at for the 10 stories that predate the
-- articles_sync_story_published_at_(ins|upd) triggers.
--
-- The triggers call _sync_story_published_at_on_article_publish() and
-- set stories.published_at = now() whenever an article transitions to
-- status='published' AND deleted_at IS NULL AND story_id IS NOT NULL.
-- All 10 production stories were created with articles already in
-- status='published' BEFORE the trigger existed, so the sync never
-- fired and stories.published_at stayed NULL.
--
-- Effect of leaving this unfixed: the timelines_admin_readable RLS
-- policy gates anon/authenticated SELECT on stories.published_at IS
-- NOT NULL, so iOS (anon-keyed Supabase Swift client) sees zero
-- timelines on every story page and the home most_active_timelines
-- rail. Web SSR is unaffected (always reads via service-role).
--
-- Idempotency: WHERE s.published_at IS NULL means a re-run after any
-- partial application is a no-op. Picks MIN(article.published_at) so
-- the story's publish moment matches its first published article,
-- not now() (more truthful for archival displays + sitemap lastmod).

UPDATE public.stories s
SET published_at = sub.first_pub
FROM (
  SELECT story_id, MIN(published_at) AS first_pub
  FROM public.articles
  WHERE status = 'published'
    AND deleted_at IS NULL
    AND story_id IS NOT NULL
    AND published_at IS NOT NULL
  GROUP BY story_id
) sub
WHERE s.id = sub.story_id
  AND s.published_at IS NULL;
