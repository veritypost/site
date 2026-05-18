-- Defense-in-depth RLS hygiene for home read paths.
--
-- 1. top_stories_select_public was qual=`true` (would expose every row
--    if anon ever got a GRANT). Today anon/authenticated have no
--    SELECT GRANT on the table, so the policy is moot at the privilege
--    layer — but a landmine if a future migration grants direct
--    PostgREST access. top_stories is admin-pin-only; readers see
--    top stories via the home layout join (service-role read), never
--    via direct PostgREST. So service-role-only is the correct posture
--    and dropping the permissive policy hardens that.
--
-- 2. stories was the last home-touched table without a kid-jwt block
--    while peer tables (articles, sources, timelines, users,
--    reading_log) all have RESTRICTIVE *_block_kid_jwt policies.
--    Now that stories.published_at is being set correctly (backfill
--    + trigger), the stories_admin_or_published policy would let kid
--    JWTs read adult story metadata via direct PostgREST. Matches the
--    pattern already in place on comments_block_kid_jwt.

DROP POLICY IF EXISTS top_stories_select_public ON public.top_stories;

CREATE POLICY stories_block_kid_jwt
  ON public.stories
  AS RESTRICTIVE
  FOR ALL
  TO public
  USING (NOT public.is_kid_delegated())
  WITH CHECK (NOT public.is_kid_delegated());
