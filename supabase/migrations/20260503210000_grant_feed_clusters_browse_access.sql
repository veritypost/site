-- Migration: grant anon + authenticated read access to feed_clusters and feed_cluster_articles
--
-- Context: /browse (web/src/app/browse/page.tsx) queries feed_clusters and
-- feed_cluster_articles via the public Supabase JS client. Before this migration:
--   - No GRANT SELECT existed on either table for anon or authenticated.
--   - RLS is enabled on both tables.
--   - The only SELECT policies gate on is_editor_or_above(), blocking all visitors.
-- Result: anon visitors and logged-in non-editor users saw an empty /browse page.
--
-- Fix:
--   1. Add GRANT SELECT so the roles can even reach the tables.
--   2. Add a permissive public-read policy. RLS evaluates as OR across applicable
--      policies, so the existing editor policy is unaffected.
--
-- Audience filtering (is_active + dismissed_at + date cutoff) is handled by the
-- query in page.tsx. A follow-up fix should add a server-side audience filter here.

-- Grants
GRANT SELECT ON public.feed_clusters TO anon, authenticated;
GRANT SELECT ON public.feed_cluster_articles TO anon, authenticated;

-- Permissive read policies (alongside existing editor policies)
CREATE POLICY feed_clusters_public_read
  ON public.feed_clusters
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY feed_cluster_articles_public_read
  ON public.feed_cluster_articles
  FOR SELECT
  TO anon, authenticated
  USING (true);
