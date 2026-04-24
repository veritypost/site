-- 164 — Add quiz-pass check to comments + comment_votes INSERT RLS
-- policies. Defense-in-depth.
--
-- H3 — the post_comment RPC already enforces the quiz-pass gate
-- (schema/013 line 103), but the underlying `comments_insert` RLS
-- policy only checks ownership + email-verified + not-banned. If a
-- future code path writes to comments via direct table INSERT instead
-- of the RPC (or the RPC is revoked), the RLS would silently accept
-- non-quiz-passed writes. Same gap on comment_votes (we want the
-- vote moat to hold even on a direct table write).
--
-- Fix: extend both policies' WITH CHECK to also require
-- user_passed_article_quiz(auth.uid(), article_id). The RPC remains
-- the primary enforcement layer; RLS is the defense layer under it.

BEGIN;

DROP POLICY IF EXISTS "comments_insert" ON public.comments;
CREATE POLICY "comments_insert" ON public.comments
FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND public.has_verified_email()
  AND NOT public.is_banned()
  -- H3: prove the gate. Readers who haven't passed the quiz cannot
  -- write, even via direct table INSERT. RPC enforces this too;
  -- this is belt + suspenders.
  AND public.user_passed_article_quiz(auth.uid(), article_id)
);

DROP POLICY IF EXISTS "comment_votes_insert" ON public.comment_votes;
CREATE POLICY "comment_votes_insert" ON public.comment_votes
FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND public.has_verified_email()
  AND NOT public.is_banned()
  -- H3: vote moat. A non-quiz-passed reader cannot inflate
  -- upvote/downvote counts via direct table insert.
  AND public.user_passed_article_quiz(
    auth.uid(),
    (SELECT article_id FROM public.comments WHERE id = comment_votes.comment_id)
  )
);

COMMIT;
