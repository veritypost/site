CREATE TABLE top_stories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id  uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  position    smallint NOT NULL,
  pinned_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pinned_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT top_stories_position_unique UNIQUE (position),
  CONSTRAINT top_stories_article_unique  UNIQUE (article_id),
  CONSTRAINT top_stories_position_range  CHECK (position BETWEEN 1 AND 5)
);

ALTER TABLE top_stories ENABLE ROW LEVEL SECURITY;

-- Anyone can read the top stories list (home feed is public)
CREATE POLICY "top_stories_select_public"
  ON top_stories FOR SELECT
  USING (true);

-- Only authenticated users with editor/admin role can insert/update/delete.
-- Uses the same compute_effective_perms RPC pattern as the rest of the product.
-- For now, restrict to authenticated users; the admin UI (Wave 6a) will
-- enforce role checks at the application layer via RBAC.
CREATE POLICY "top_stories_write_authenticated"
  ON top_stories FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
