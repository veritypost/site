-- Close the anon timeline leak.
--
-- timelines had two PERMISSIVE SELECT policies OR-stacked:
--   timelines_admin_readable  -- gates on stories.published_at IS NOT NULL
--   timelines_select          -- USING true (overrides the narrower one)
--
-- Effect: anon could read all 71 timeline rows including those tied to
-- stories that haven't published yet. Home + article pages always read
-- timelines via service-role client, so SSR is unaffected. Defense-in-
-- depth fix verified safe pre-flight (no anon client-side caller of
-- timelines exists across web or iOS).
--
-- After this migration, timelines_admin_readable is the sole SELECT
-- policy: admin sees all rows; anon/authenticated only see rows whose
-- parent story has published_at IS NOT NULL.

DROP POLICY IF EXISTS timelines_select ON public.timelines;
