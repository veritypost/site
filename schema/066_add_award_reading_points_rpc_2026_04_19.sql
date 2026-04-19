-- 066_add_award_reading_points_rpc_2026_04_19.sql
-- Round 4 Track U migration 2.
--
-- Server-authoritative replacement for StoryDetailView.appAwardPoints.
-- Creates a thin wrapper that ensures a completed reading_log row exists
-- for (user, article) and then delegates to score_on_reading_complete for
-- all scoring / streak / achievement side-effects. verity_score writes are
-- no longer done client-side.

CREATE OR REPLACE FUNCTION public.award_reading_points(p_article_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_log_id uuid;
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_article_id IS NULL THEN
    RAISE EXCEPTION 'article_id required' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_log_id
    FROM reading_log
   WHERE user_id = v_user AND article_id = p_article_id AND completed = true
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_log_id IS NULL THEN
    INSERT INTO reading_log (user_id, article_id, read_percentage, completed, source)
    VALUES (v_user, p_article_id, 100, true, 'ios')
    RETURNING id INTO v_log_id;
  END IF;

  v_result := public.score_on_reading_complete(v_user, NULL, p_article_id, v_log_id);
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.award_reading_points(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.award_reading_points(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.award_reading_points(uuid) TO authenticated;

ALTER FUNCTION public.award_reading_points(uuid) OWNER TO postgres;
