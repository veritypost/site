-- =====================================================================
-- 2026-04-26_mint_owner_link_explicit_actor.sql
-- mint_owner_referral_link — accept p_actor_user_id explicitly
-- =====================================================================
-- Original implementation read auth.uid() inside the function. That
-- fails when called via the service-role client (no JWT identity →
-- auth.uid()=NULL → "no authenticated actor"). And calling via the
-- user-scoped client from a Next.js route hits cookie-session edge
-- cases.
--
-- Fix: function takes p_actor_user_id as an optional first param. When
-- passed, used directly. When omitted, falls back to auth.uid() for
-- legacy direct-DB callers (psql, dashboard SQL editor with admin login).
-- =====================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.mint_owner_referral_link(text, int, timestamptz);

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
  v_role text := current_setting('request.jwt.claim.role', true);
  v_actor uuid := COALESCE(p_actor_user_id, auth.uid());
  v_slug text;
  v_attempt int;
  v_id uuid;
  v_caller_is_admin boolean := false;
BEGIN
  -- Role check: callers must be service_role OR an admin user. When
  -- service_role explicitly passes p_actor_user_id, we additionally
  -- verify the named actor is themselves admin (so a service-role
  -- caller can't mint on behalf of a non-admin).
  IF v_role = 'service_role' THEN
    IF p_actor_user_id IS NULL THEN
      RAISE EXCEPTION 'mint_owner_referral_link: service_role caller must pass p_actor_user_id'
        USING ERRCODE = '22023';
    END IF;
    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = p_actor_user_id
        AND r.name IN ('admin', 'owner', 'superadmin')
        AND (ur.expires_at IS NULL OR ur.expires_at > now())
    ) INTO v_caller_is_admin;
    IF NOT v_caller_is_admin THEN
      RAISE EXCEPTION 'mint_owner_referral_link: actor is not admin'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.is_admin_or_above() THEN
      RAISE EXCEPTION 'mint_owner_referral_link: admin role required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'mint_owner_referral_link: no actor';
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

REVOKE EXECUTE ON FUNCTION public.mint_owner_referral_link(uuid, text, int, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.mint_owner_referral_link(uuid, text, int, timestamptz) TO service_role, authenticated;

COMMIT;
