-- 166_articles_needs_manual_review.sql
-- M4 (Q9 owner decision: soft-degrade with manual review flag).
-- Adds needs_manual_review + plagiarism_status on articles + kid_articles so
-- the F7 generate route can persist a soft-degraded article (rewrite failed
-- or didn't lower overlap) WITHOUT silently shipping near-duplicate body
-- text. Editors filter on needs_manual_review=true in the admin pipeline
-- queue and resolve before publish.
--
-- plagiarism_status values:
--   'ok'             — first-pass overlap below rewrite threshold
--   'rewritten'      — overlap >= rewrite_pct, second pass strictly lower,
--                      rewrite kept
--   'rewrite_kept_original' — second pass not lower; original body kept
--   'rewrite_failed' — rewriteForPlagiarism threw or returned <100 chars

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS needs_manual_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plagiarism_status text;

ALTER TABLE public.kid_articles
  ADD COLUMN IF NOT EXISTS needs_manual_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plagiarism_status text;

CREATE INDEX IF NOT EXISTS idx_articles_needs_manual_review
  ON public.articles(needs_manual_review)
  WHERE needs_manual_review = true;

CREATE INDEX IF NOT EXISTS idx_kid_articles_needs_manual_review
  ON public.kid_articles(needs_manual_review)
  WHERE needs_manual_review = true;

COMMENT ON COLUMN public.articles.needs_manual_review IS
  'Set by F7 pipeline when plagiarism rewrite soft-degraded (failed or did not improve). Editors must clear before publish.';
COMMENT ON COLUMN public.articles.plagiarism_status IS
  'F7 plagiarism step outcome: ok | rewritten | rewrite_kept_original | rewrite_failed';
COMMENT ON COLUMN public.kid_articles.needs_manual_review IS
  'Set by F7 pipeline when plagiarism rewrite soft-degraded (failed or did not improve). Editors must clear before publish.';
COMMENT ON COLUMN public.kid_articles.plagiarism_status IS
  'F7 plagiarism step outcome: ok | rewritten | rewrite_kept_original | rewrite_failed';
