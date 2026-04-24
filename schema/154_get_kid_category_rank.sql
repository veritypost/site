-- 154 — RPC: get_kid_category_rank(p_category_id)
--
-- Returns the calling kid's rank + score in a category, aggregated across
-- opt-in kids only. RLS on category_scores + kid_profiles already hides
-- opt-out kids from direct queries, so an unaided client-side `.order()`
-- returned just the caller's own row — rank was computed as i+1 = always 1.
--
-- SECURITY DEFINER because the aggregate requires counting all opt-in rows,
-- which the caller's RLS context can't see directly. We scope strictly to
-- the caller's kid_profile_id via `auth.uid()` (which, for a kid JWT, is the
-- kid_profile_id — see /api/kids/pair JWT claims).
--
-- Returns one row with columns (rank, score, total) — consistent shape for
-- both "kid has a score" and "kid doesn't have a score yet" cases. When the
-- kid has no category_scores row, rank is NULL and score is 0.

CREATE OR REPLACE FUNCTION public.get_kid_category_rank(
  p_category_id uuid
)
RETURNS TABLE (
  rank integer,
  score integer,
  total integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kid_id uuid;
  v_score integer;
  v_rank integer;
  v_total integer;
BEGIN
  -- Only callable from the kid JWT context — kids app is the only client
  -- that needs this. Defensive refusal for any other caller.
  IF NOT is_kid_delegated() THEN
    RAISE EXCEPTION 'get_kid_category_rank requires a kid JWT';
  END IF;

  v_kid_id := auth.uid();

  -- Caller's score (may not have one yet)
  SELECT cs.score
  INTO v_score
  FROM category_scores cs
  WHERE cs.kid_profile_id = v_kid_id
    AND cs.category_id = p_category_id;

  -- Total opt-in kids with any category score in this category (exclude
  -- opt-outs so the leaderboard population matches what the app displays).
  SELECT count(*)::int
  INTO v_total
  FROM category_scores cs
  JOIN kid_profiles kp ON kp.id = cs.kid_profile_id
  WHERE cs.category_id = p_category_id
    AND kp.is_active = true
    AND kp.global_leaderboard_opt_in = true;

  IF v_score IS NULL THEN
    RETURN QUERY SELECT NULL::int, 0, COALESCE(v_total, 0);
    RETURN;
  END IF;

  -- Rank among opt-in kids whose score exceeds the caller's. +1 to convert
  -- "kids above me" into "my rank" (best = 1).
  SELECT count(*)::int + 1
  INTO v_rank
  FROM category_scores cs
  JOIN kid_profiles kp ON kp.id = cs.kid_profile_id
  WHERE cs.category_id = p_category_id
    AND kp.is_active = true
    AND kp.global_leaderboard_opt_in = true
    AND cs.score > v_score;

  RETURN QUERY SELECT v_rank, v_score, COALESCE(v_total, 0);
END;
$$;

-- Kid JWT is signed with role='authenticated', so grant to that role only.
REVOKE ALL ON FUNCTION public.get_kid_category_rank(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_kid_category_rank(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_kid_category_rank(uuid) IS
  'Returns the calling kid''s (rank, score, total) in a category, aggregated across opt-in kids only. Security definer — refuses non-kid JWT. Used by VerityPostKids LeaderboardView category scope.';
