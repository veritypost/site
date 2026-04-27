-- =====================================================================
-- 2026-04-27_phase6_birthday_prompt_clearing.sql
-- Phase 6: clear kid_profiles.birthday_prompt_at on parent action
-- =====================================================================
-- Problem:
--   The birthday-band-check cron (Phase 5) stamps
--   kid_profiles.birthday_prompt_at when a kid crosses an age boundary
--   without the parent advancing the band. Web + iOS surfaces read this
--   column to render the "Time to advance [name]" banner. The column
--   was never being cleared once the parent acted, so the banner stuck
--   around forever after the band flip / graduation / claim.
--
-- Fix scope:
--   This migration replaces the two existing band-mutating RPCs with
--   identical bodies plus a NULL-out of birthday_prompt_at at the same
--   scope as the band / is_active update.
--
--     1. graduate_kid_profile  (Phase 5) — kid -> graduated transition.
--        Clear after the band flip, before sessions revoke.
--
--     2. claim_graduation_token (Phase 5) — token consumption + new
--        adult-user wiring. Defensive belt-and-braces clear: kid was
--        already graduated by graduate_kid_profile, but if any path
--        re-stamps the column between mint and claim, this guarantees
--        a clean slate on claim.
--
--   The kids -> tweens band advance is handled in the TypeScript route
--   web/src/app/api/kids/[id]/advance-band/route.ts (no SECURITY DEFINER
--   RPC exists for that path) and already clears birthday_prompt_at in
--   the same UPDATE statement that flips reading_band -> 'tweens'. No
--   admin_advance_kid_band RPC exists in the schema; the band-advance
--   surface area is the TS route only. Confirmed via pg_proc query
--   2026-04-27 — only claim_graduation_token + graduate_kid_profile
--   exist among graduation-flow functions. No DB change required for
--   the kids -> tweens path.
--
-- Signatures, return types, security flags, search_path, GRANTs, and
-- existing bodies are preserved exactly. Only the clearing UPDATE is
-- added.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. graduate_kid_profile — add birthday_prompt_at = NULL clearing
--    inside the same UPDATE that flips reading_band -> 'graduated' and
--    is_active -> false. Single atomic statement, no extra round trip.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.graduate_kid_profile(
  p_kid_profile_id uuid,
  p_intended_email text
)
RETURNS TABLE(token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_kid public.kid_profiles%ROWTYPE;
  v_token text;
  v_expires timestamptz;
  v_email text := lower(trim(p_intended_email));
  v_email_re text := '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  v_existing_user uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = '42501';
  END IF;

  -- Email format
  IF v_email IS NULL OR v_email = '' OR v_email !~ v_email_re THEN
    RAISE EXCEPTION 'p_intended_email must be a valid email' USING ERRCODE = '22023';
  END IF;
  -- Email must not already belong to an existing auth.users row
  SELECT id INTO v_existing_user FROM auth.users WHERE lower(email) = v_email LIMIT 1;
  IF v_existing_user IS NOT NULL THEN
    RAISE EXCEPTION 'Email already in use' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_kid FROM public.kid_profiles WHERE id = p_kid_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kid not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_kid.parent_user_id <> v_actor THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_kid.is_active = false THEN
    RAISE EXCEPTION 'Kid profile already inactive' USING ERRCODE = '22023';
  END IF;
  IF v_kid.reading_band = 'graduated' THEN
    RAISE EXCEPTION 'Kid already graduated' USING ERRCODE = '22023';
  END IF;
  IF v_kid.reading_band <> 'tweens' THEN
    RAISE EXCEPTION 'Only tweens-band kids can graduate (current=%)', v_kid.reading_band USING ERRCODE = '22023';
  END IF;

  -- Mint token (32 hex chars; cryptographically random via gen_random_bytes)
  v_token := encode(gen_random_bytes(24), 'hex');
  v_expires := now() + interval '24 hours';

  INSERT INTO public.graduation_tokens (
    token, kid_profile_id, parent_user_id, intended_email, expires_at, metadata
  )
  VALUES (
    v_token, p_kid_profile_id, v_actor, v_email, v_expires,
    jsonb_build_object('display_name', v_kid.display_name)
  );

  -- Override session vars permit the band-ratchet trigger to flip to graduated
  PERFORM set_config('app.dob_admin_override', 'true', true);

  UPDATE public.kid_profiles
  SET is_active = false,
      reading_band = 'graduated',
      band_changed_at = now(),
      band_history = band_history || jsonb_build_array(
        jsonb_build_object(
          'old_band', v_kid.reading_band,
          'new_band', 'graduated',
          'set_at', now(),
          'set_by', v_actor,
          'reason', 'graduation:' || v_token
        )
      ),
      pin_hash = null,
      pin_salt = null,
      birthday_prompt_at = null
  WHERE id = p_kid_profile_id;

  PERFORM set_config('app.dob_admin_override', '', true);

  -- Revoke kid sessions
  UPDATE public.kid_sessions
  SET revoked_at = now()
  WHERE kid_profile_id = p_kid_profile_id AND revoked_at IS NULL;

  -- Subscription seat decrement (only if extra seat was paid — base
  -- Family includes 1 kid, so kid_seats_paid > 1 means extras exist).
  -- The webhook reconciliation will re-sync against Stripe/Apple but
  -- we want the local count to drop immediately.
  UPDATE public.subscriptions
  SET kid_seats_paid = greatest(1, kid_seats_paid - 1),
      updated_at = now()
  WHERE user_id = v_actor
    AND status IN ('active','trialing')
    AND kid_seats_paid > 1;

  token := v_token;
  expires_at := v_expires;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.graduate_kid_profile(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.graduate_kid_profile(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 2. claim_graduation_token — defensive clearing on the kid profile
--    that the consumed token points at. graduate_kid_profile already
--    nulled the column when the token was minted; this is belt-and-
--    braces so any window where the cron re-stamped between mint and
--    claim still resolves clean. v_row.kid_profile_id is the target.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_graduation_token(
  p_token text,
  p_new_user_id uuid
)
RETURNS TABLE(kid_profile_id uuid, parent_user_id uuid, display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.graduation_tokens%ROWTYPE;
  v_kid_meta jsonb;
  v_categories jsonb;
  v_user_email text;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = p_new_user_id;
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'New user not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_row FROM public.graduation_tokens WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Token already consumed' USING ERRCODE = '22023';
  END IF;
  IF v_row.expires_at < now() THEN
    RAISE EXCEPTION 'Token expired' USING ERRCODE = '22023';
  END IF;
  IF lower(v_user_email) <> lower(v_row.intended_email) THEN
    RAISE EXCEPTION 'Email mismatch' USING ERRCODE = '22023';
  END IF;

  UPDATE public.graduation_tokens
  SET consumed_at = now(),
      consumed_by_user_id = p_new_user_id
  WHERE token = p_token;

  -- Defensive clear of the birthday-prompt staging column on the kid
  -- profile this token resolves to. graduate_kid_profile already cleared
  -- this when the kid was retired, but if the cron re-stamped between
  -- mint and claim, the parent banner would otherwise persist forever.
  UPDATE public.kid_profiles
  SET birthday_prompt_at = null
  WHERE id = v_row.kid_profile_id;

  -- Carry over kid's category preferences. kid_profiles.metadata may
  -- contain a 'feed_cats' array; if present, write into the new
  -- user's users.metadata->'feed'->'cats'. Falls back gracefully if
  -- either side is missing the key.
  SELECT metadata INTO v_kid_meta FROM public.kid_profiles WHERE id = v_row.kid_profile_id;
  v_categories := COALESCE(v_kid_meta->'feed_cats', '[]'::jsonb);

  UPDATE public.users
  SET metadata = jsonb_set(
        jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{feed}',
          COALESCE(metadata->'feed', '{}'::jsonb),
          true
        ),
        '{feed,cats}',
        v_categories,
        true
      ),
      updated_at = now()
  WHERE id = p_new_user_id;

  kid_profile_id := v_row.kid_profile_id;
  parent_user_id := v_row.parent_user_id;
  display_name := v_row.metadata->>'display_name';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_graduation_token(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_graduation_token(text, uuid) TO service_role;

COMMIT;
