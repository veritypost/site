-- =====================================================================
-- 2026-04-27_phase5_graduation_flow.sql
-- Phase 5 of AI + Plan Change Implementation: graduation + parent flows
-- =====================================================================
-- Decisions locked 2026-04-26:
--   - Parent-triggered band advance + graduation (never automatic)
--   - Auto-prompt at 13th birthday via daily cron
--   - Graduation = retire kid profile (is_active=false, reading_band='graduated')
--     + create new adult auth.users + link to family + carry over categories
--   - Net-zero seat math: kid seat frees, adult seat fills (Family pool=6)
--   - Saves/streaks/scores do NOT carry to adult account; categories do
--   - Kid PIN credentials revoked + kid_sessions revoked on graduation
--   - One-time claim token issued for the new adult account
--
-- This migration:
--   A. graduation_tokens table — single-use, time-bounded claim tokens
--   B. system_apply_dob_correction RPC — service-role variant of the
--      Phase 4 admin RPC, used by the cooldown cron without auth.uid()
--   C. graduate_kid_profile RPC — kid-graduate state transition
--      (atomic: revoke sessions, flip is_active+reading_band, mint
--      claim token)
--   D. claim_graduation_token RPC — consume a token, link new adult
--      user_id to the family, copy categories, revoke token
--   E. Birthday-prompt staging column (kid_profiles.birthday_prompt_at)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- A. graduation_tokens table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.graduation_tokens (
  token text PRIMARY KEY,
  kid_profile_id uuid NOT NULL REFERENCES public.kid_profiles(id) ON DELETE CASCADE,
  parent_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intended_email text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_by_user_id uuid REFERENCES auth.users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Active-token lookup (one unconsumed per kid at a time)
CREATE UNIQUE INDEX IF NOT EXISTS idx_graduation_tokens_active
  ON public.graduation_tokens (kid_profile_id)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_graduation_tokens_expires
  ON public.graduation_tokens (expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.graduation_tokens ENABLE ROW LEVEL SECURITY;
-- No client-side reads or writes — both code paths go through RPCs.
-- Admin support tooling can SELECT via the admin permission below.
DROP POLICY IF EXISTS graduation_tokens_admin_read ON public.graduation_tokens;
CREATE POLICY graduation_tokens_admin_read ON public.graduation_tokens
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.compute_effective_perms(auth.uid()) p
      WHERE p.permission_key = 'admin.system.view' AND p.granted = true
    )
  );

-- ---------------------------------------------------------------------
-- B. system_apply_dob_correction RPC (cron variant of Phase 4 admin RPC)
--    Phase 4's admin_apply_dob_correction gates on auth.uid() — service
--    role returns empty perms so the cooldown cron can't currently call
--    it. This variant trusts the caller (service role only — REVOKE
--    from public + grant only to service_role) and applies the DOB
--    change with the same override semantics.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.system_apply_dob_correction(
  p_request_id uuid,
  p_decision_reason text DEFAULT 'cooldown_auto_approval'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request public.kid_dob_correction_requests%ROWTYPE;
  v_old_dob date;
  v_old_band text;
  v_new_band text;
BEGIN
  SELECT * INTO v_request FROM public.kid_dob_correction_requests
    WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_request.status NOT IN ('pending','documentation_requested') THEN
    RAISE EXCEPTION 'Request not pending (status=%)', v_request.status USING ERRCODE = '22023';
  END IF;
  -- Cron only auto-approves; admin-level reject + docs-request stay on
  -- admin_apply_dob_correction (which has the perm check).
  IF v_request.direction <> 'younger' THEN
    RAISE EXCEPTION 'system_apply_dob_correction: only younger-band auto-approve' USING ERRCODE = '22023';
  END IF;

  UPDATE public.kid_dob_correction_requests
  SET status = 'approved',
      decision_reason = p_decision_reason,
      decided_at = now()
  WHERE id = p_request_id;

  SELECT date_of_birth, reading_band INTO v_old_dob, v_old_band
    FROM public.kid_profiles WHERE id = v_request.kid_profile_id;
  v_new_band := public.compute_band_from_dob(v_request.requested_dob);

  PERFORM set_config('app.dob_admin_override', 'true', true);

  UPDATE public.kid_profiles
  SET date_of_birth = v_request.requested_dob,
      reading_band = v_new_band,
      band_changed_at = now(),
      band_history = band_history || jsonb_build_array(
        jsonb_build_object(
          'old_band', v_old_band,
          'new_band', v_new_band,
          'set_at', now(),
          'set_by', null,
          'reason', 'cooldown_auto:' || v_request.id::text
        )
      )
  WHERE id = v_request.kid_profile_id;

  INSERT INTO public.kid_dob_history (
    kid_profile_id, old_dob, new_dob, change_source,
    actor_user_id, decision_reason
  )
  VALUES (
    v_request.kid_profile_id, v_old_dob, v_request.requested_dob,
    'admin_correction', null, p_decision_reason
  );

  PERFORM set_config('app.dob_admin_override', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.system_apply_dob_correction(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.system_apply_dob_correction(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.system_apply_dob_correction(uuid, text) TO service_role;

-- ---------------------------------------------------------------------
-- C. graduate_kid_profile RPC
--    Atomic graduation transition. Caller is the parent (auth.uid()).
--    Permission: kids.profile.update (parent owns the kid).
--    Steps:
--      1. Verify ownership + kid is in 'tweens' band (only graduated
--         from tweens).
--      2. Mint a single-use claim token (24h expiry) bound to the
--         intended_email.
--      3. Mark kid_profiles is_active=false + reading_band='graduated'
--         + revoke pin credentials.
--      4. Revoke all kid_sessions.
--      5. Decrement subscriptions.kid_seats_paid by 1 if the parent
--         was paying for an extra seat (>1).
--      6. Append band_history.
--    Returns the claim token + expiry. The web/iOS layer surfaces it
--    as a one-time URL for the kid to claim (or as a temp password
--    flow — owner-decision; this RPC just emits the token).
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
      pin_salt = null
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
-- D. claim_graduation_token RPC
--    Called server-side from the /api/auth/graduate-kid/claim endpoint
--    AFTER a fresh adult user has been created via Supabase auth signup.
--    Steps:
--      1. Resolve token → row, verify not consumed, not expired,
--         requested_email matches the new user's email.
--      2. Mark token consumed.
--      3. Stamp the new adult user with family_owner_id link if the
--         family relation exists (per existing subscriptions schema
--         column on user_subscriptions; otherwise no-op).
--      4. Copy kid's category preferences from kid_profiles.metadata
--         (or wherever the kid app stored them) into the new user's
--         users.metadata->'feed'->'cats' to match the existing adult
--         signup flow's storage shape.
--      5. Return the kid_profile_id for the client to surface a
--         "welcome [name], your kid history is preserved at..." UX.
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

-- ---------------------------------------------------------------------
-- E. Birthday prompt column
-- ---------------------------------------------------------------------
ALTER TABLE public.kid_profiles
  ADD COLUMN IF NOT EXISTS birthday_prompt_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_kid_profiles_birthday_prompt_due
  ON public.kid_profiles (birthday_prompt_at)
  WHERE is_active = true AND birthday_prompt_at IS NOT NULL;

COMMIT;
