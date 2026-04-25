-- 172_ext_audit_kid_family_leaderboard.sql
-- Ext-W.16 — kid family leaderboard returns only the kid's own row.
--
-- Under a kid JWT, the standard kid_profiles SELECT policy (own-only)
-- hides siblings. The LeaderboardView fallback that fetched
-- kid_profiles by shared parent_user_id therefore returns just one
-- row, which makes "family leaderboard" misleading.
--
-- Add a SECURITY DEFINER RPC the kid JWT can call. It pulls the
-- parent_user_id from the kid's own row (avoids trusting the JWT
-- claim directly — only honour what the row itself says) and returns
-- all kid_profiles owned by that parent, sorted by verity_score.
--
-- Auth surface: any authenticated session can call it, but the RPC
-- only returns rows under the same parent_user_id as the caller's
-- kid_profile_id. Adult parents resolve via the existing
-- /api/family/leaderboard route (uses family_members RPC).

CREATE OR REPLACE FUNCTION public.kid_family_leaderboard(
  p_kid_profile_id uuid
) RETURNS TABLE (
  id uuid,
  display_name text,
  verity_score int,
  is_self boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id uuid;
BEGIN
  -- Look up parent from the kid's own row. If the row doesn't exist or
  -- has no parent (shouldn't happen for paired kids), return empty.
  SELECT parent_user_id INTO v_parent_id
    FROM kid_profiles
   WHERE id = p_kid_profile_id;

  IF v_parent_id IS NULL THEN
    RETURN;
  END IF;

  -- Caller must be either the kid (kid JWT) or the parent (adult JWT)
  -- — guard via auth.uid() check matching one of the two identities.
  IF auth.uid() <> p_kid_profile_id AND auth.uid() <> v_parent_id THEN
    RAISE EXCEPTION 'not authorised'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    kp.id,
    kp.display_name,
    COALESCE(kp.verity_score, 0)::int AS verity_score,
    (kp.id = p_kid_profile_id) AS is_self
  FROM kid_profiles kp
  WHERE kp.parent_user_id = v_parent_id
    AND kp.is_active = true
  ORDER BY COALESCE(kp.verity_score, 0) DESC, kp.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kid_family_leaderboard(uuid) TO authenticated, service_role;
