-- =====================================================================
-- 2026-04-26_mint_owner_link_v2.sql
-- mint_owner_referral_link — drop role-detection brittleness
-- =====================================================================
-- Prior version branched on current_setting('request.jwt.claim.role')
-- which doesn't reliably reflect 'service_role' under our PostgREST
-- version (returns null in some contexts). Result: the !=service_role
-- branch ran, called is_admin_or_above() which read auth.uid()=null,
-- and raised "admin role required" even for service-role callers.
--
-- New approach: no role detection. Resolve actor as
--   COALESCE(p_actor_user_id, auth.uid())
-- and verify that resolved actor holds an admin/owner/superadmin
-- role via a direct user_roles lookup. Single code path; works for:
--   - service-role caller passing p_actor_user_id explicitly
--   - authenticated admin caller (user JWT) — passes own id or omits
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.mint_owner_referral_link(
  p_actor_user_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_max_uses int DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS TABLE (id uuid, code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := COALESCE(p_actor_user_id, auth.uid());
  v_slug text;
  v_attempt int;
  v_id uuid;
  v_actor_is_admin boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'mint_owner_referral_link: no actor (pass p_actor_user_id or call as authenticated user)'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_actor
      AND r.name IN ('admin', 'owner', 'superadmin')
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
  ) INTO v_actor_is_admin;

  IF NOT v_actor_is_admin THEN
    RAISE EXCEPTION 'mint_owner_referral_link: actor % is not admin/owner/superadmin', v_actor
      USING ERRCODE = '42501';
  END IF;

  FOR v_attempt IN 1..5 LOOP
    v_slug := public.generate_referral_slug();
    BEGIN
      INSERT INTO public.access_codes
        (code, type, tier, owner_user_id, slot, is_active, created_by,
         description, max_uses, expires_at)
      VALUES
        (v_slug, 'referral', 'owner', v_actor, NULL, true, v_actor,
         COALESCE(p_description, 'Owner-minted seed referral'),
         p_max_uses, p_expires_at)
      RETURNING access_codes.id INTO v_id;
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF v_attempt = 5 THEN
          RAISE EXCEPTION 'mint_owner_referral_link: slug retries exhausted';
        END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT v_id, v_slug;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mint_owner_referral_link(uuid, text, int, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mint_owner_referral_link(uuid, text, int, timestamptz) TO service_role, authenticated;

COMMIT;
