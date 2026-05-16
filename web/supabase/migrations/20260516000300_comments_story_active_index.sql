-- TODO-SEARCH Session A: partial index for "Discussion active" signal.
-- Supports: count of recent visible non-deleted comments per story, used to
-- mark Story result rows as having active discussion in the new search feed.

CREATE INDEX IF NOT EXISTS comments_story_active_idx
  ON public.comments (story_id, created_at DESC)
  WHERE deleted_at IS NULL
    AND status = 'visible'
    AND story_id IS NOT NULL;
