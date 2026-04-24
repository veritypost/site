-- 161 — Fix comments_select RLS policy to accept status='visible'.
--
-- Root cause of the UI-COMMENTS bug: the `post_comment` RPC inserts
-- new comments with status='visible' (industry-standard vocabulary for
-- comment moderation lifecycle: visible / hidden / pending / removed),
-- but the RLS SELECT policy required status='published' (which is
-- article lifecycle vocabulary, copy-pasted from the articles RLS).
--
-- Users saw their own comments briefly (author branch of RLS hit), then
-- on refresh the thread went empty because the status='visible' row
-- failed the 'published' check for every non-mod reader.
--
-- Fix: align the RLS policy to accept 'visible' as the canonical
-- publicly-viewable state for comments. Also migrate any legacy rows
-- that were inserted with status='published' (test seed data, earlier
-- migrations) so the column ends up in a single consistent state.

BEGIN;

-- Migrate any legacy rows. Idempotent — no-op if no 'published' comments.
UPDATE public.comments
SET status = 'visible'
WHERE status = 'published';

-- Replace the SELECT policy to accept the canonical 'visible' state.
DROP POLICY IF EXISTS "comments_select" ON public.comments;
CREATE POLICY "comments_select" ON public.comments
FOR SELECT USING (
  (status = 'visible' AND deleted_at IS NULL)
  OR user_id = auth.uid()
  OR public.is_mod_or_above()
);

COMMIT;
