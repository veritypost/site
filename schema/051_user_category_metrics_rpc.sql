-- 051_user_category_metrics_rpc.sql
-- Landed via Pass 16 Task 126 (LB-027 profile category 4-metric display).
--
-- RPC returns, per category or per subcategory of a given parent, the
-- viewer's activity: reads, quizzes passed, comments posted, upvotes
-- received on own comments. Used by the Profile Categories tab and the
-- /profile/category/[id] subcategory drill-in.
--
-- Four source tables joined via articles.category_id / subcategory_id:
--   reading_log          — reads (COUNT)
--   quiz_attempts        — quizzes passed (COUNT WHERE passed=true)
--   comments             — comments posted (COUNT WHERE user_id=viewer)
--   comments.upvote_count — upvotes received (SUM over viewer's own
--                           comments)
--
-- Also returns `score` sourced from category_scores for continuity with
-- the existing profile header.
--
-- Shape: when p_category_id is NULL, returns per-top-level-category rows
-- (category_id, subcategory_id=NULL, display_name). When p_category_id is
-- a uuid, returns per-subcategory rows under that parent. Caller decides
-- the level.
--
-- SECURITY INVOKER — uses caller's JWT so RLS on source tables still
-- applies. No secrets, no cross-user leakage.
--
-- 2026-04-17 — added preamble ensuring articles.subcategory_id exists.
-- Canonical schema (reset_and_rebuild_v2.sql) never added this column
-- even though this RPC + ~8 code sites reference it. ALTER IF NOT EXISTS
-- self-heals without breaking idempotent re-apply. Column is a nullable
-- uuid foreign-keyed to categories (subcategories live in the same
-- categories table with parent_id set).

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS subcategory_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_articles_subcategory_id
  ON public.articles(subcategory_id)
  WHERE subcategory_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_user_category_metrics(
  p_user_id uuid,
  p_category_id uuid DEFAULT NULL
)
RETURNS TABLE (
  category_id uuid,
  subcategory_id uuid,
  name text,
  reads bigint,
  quizzes_passed bigint,
  comments bigint,
  upvotes_received bigint,
  score bigint
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  -- Per-category when no parent specified: group by articles.category_id.
  WITH target_cats AS (
    SELECT c.id, c.name
    FROM public.categories c
    WHERE c.is_active = true
      AND c.deleted_at IS NULL
      AND (
        (p_category_id IS NULL AND c.parent_id IS NULL)
        OR (p_category_id IS NOT NULL AND c.parent_id = p_category_id)
      )
  ),
  viewer_reads AS (
    SELECT a.category_id AS cat, a.subcategory_id AS sub, COUNT(*) AS n
    FROM public.reading_log rl
    JOIN public.articles a ON a.id = rl.article_id
    WHERE rl.user_id = p_user_id
      AND rl.kid_profile_id IS NULL
    GROUP BY a.category_id, a.subcategory_id
  ),
  -- 2026-04-17 — rewritten for v2 quiz_attempts shape. In v2 each row is
  -- one answered question (boolean is_correct) keyed by (user_id,
  -- article_id, attempt_number). "Pass" is derived: group per attempt,
  -- count correct answers, >= 3 per D1. The inner aggregation groups per
  -- attempt and filters to those where the count of correct answers
  -- clears the threshold; the outer aggregation counts one passed quiz
  -- per article/category.
  viewer_quizzes AS (
    SELECT a.category_id AS cat, a.subcategory_id AS sub, COUNT(*) AS n
    FROM (
      SELECT qa.article_id, qa.attempt_number
      FROM public.quiz_attempts qa
      WHERE qa.user_id = p_user_id
        AND qa.kid_profile_id IS NULL
      GROUP BY qa.article_id, qa.attempt_number
      HAVING COUNT(*) FILTER (WHERE qa.is_correct = true) >= 3
    ) passed_attempts
    JOIN public.articles a ON a.id = passed_attempts.article_id
    GROUP BY a.category_id, a.subcategory_id
  ),
  viewer_comments AS (
    SELECT a.category_id AS cat, a.subcategory_id AS sub,
           COUNT(*) AS n,
           COALESCE(SUM(cm.upvote_count), 0) AS upvotes
    FROM public.comments cm
    JOIN public.articles a ON a.id = cm.article_id
    WHERE cm.user_id = p_user_id
      AND cm.deleted_at IS NULL
    GROUP BY a.category_id, a.subcategory_id
  ),
  viewer_scores AS (
    SELECT cs.category_id, cs.score
    FROM public.category_scores cs
    WHERE cs.user_id = p_user_id
      AND cs.kid_profile_id IS NULL
  )
  SELECT
    CASE WHEN p_category_id IS NULL THEN tc.id ELSE p_category_id END AS category_id,
    CASE WHEN p_category_id IS NULL THEN NULL ELSE tc.id END AS subcategory_id,
    tc.name::text AS name,
    COALESCE(CASE
      WHEN p_category_id IS NULL THEN (SELECT SUM(n) FROM viewer_reads r WHERE r.cat = tc.id)
      ELSE (SELECT SUM(n) FROM viewer_reads r WHERE r.sub = tc.id)
    END, 0)::bigint AS reads,
    COALESCE(CASE
      WHEN p_category_id IS NULL THEN (SELECT SUM(n) FROM viewer_quizzes q WHERE q.cat = tc.id)
      ELSE (SELECT SUM(n) FROM viewer_quizzes q WHERE q.sub = tc.id)
    END, 0)::bigint AS quizzes_passed,
    COALESCE(CASE
      WHEN p_category_id IS NULL THEN (SELECT SUM(n) FROM viewer_comments vc WHERE vc.cat = tc.id)
      ELSE (SELECT SUM(n) FROM viewer_comments vc WHERE vc.sub = tc.id)
    END, 0)::bigint AS comments,
    COALESCE(CASE
      WHEN p_category_id IS NULL THEN (SELECT SUM(upvotes) FROM viewer_comments vc WHERE vc.cat = tc.id)
      ELSE (SELECT SUM(upvotes) FROM viewer_comments vc WHERE vc.sub = tc.id)
    END, 0)::bigint AS upvotes_received,
    COALESCE(
      CASE WHEN p_category_id IS NULL
        THEN (SELECT vs.score FROM viewer_scores vs WHERE vs.category_id = tc.id)
        ELSE 0
      END, 0
    )::bigint AS score
  FROM target_cats tc
  ORDER BY tc.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_category_metrics(uuid, uuid) TO authenticated;
