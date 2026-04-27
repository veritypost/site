-- =====================================================================
-- 2026-04-27_phase4_dob_correction_system.sql
-- Phase 4 of AI + Plan Change Implementation: DOB correction request system
-- =====================================================================
-- Decisions locked 2026-04-26:
--   - DOB locked after profile creation (DB-level trigger)
--   - One correction per kid lifetime
--   - Younger-band corrections: 7-day cooldown, auto-approve unless fraud
--     signals fire (escalate to manual)
--   - Older-band corrections: require birth-certificate documentation,
--     always manual review, never auto-approved
--   - Maximum 3-year DOB shift per correction
--   - Corrections cannot trigger graduation (cap requested DOB at age 12)
--   - Audit trail on every change
--   - Documentation encrypted at rest, auto-purge 90 days post-decision
--   - Kids are not notified
--
-- Phase 3 already added kid_profiles.reading_band + band_changed_at +
-- band_history. Phase 4 adds:
--   A. DOB immutability trigger (with session-var override for admin RPC)
--   B. Band ratchet trigger (rejects regression except via override)
--   C. kid_dob_correction_requests table + indexes
--   D. kid_dob_history append-only audit table
--   E. admin_apply_dob_correction(request_id, decision, reason) RPC
--   F. compute_band_from_dob helper
--   G. admin.kids.dob_corrections.review permission seed
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- F. Helper: compute band from DOB. Used by triggers + admin RPC.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_band_from_dob(p_dob date)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_age int;
BEGIN
  IF p_dob IS NULL THEN
    RETURN 'kids';
  END IF;
  v_age := extract(year FROM age(p_dob))::int;
  IF v_age >= 13 THEN RETURN 'graduated'; END IF;
  IF v_age >= 10 THEN RETURN 'tweens'; END IF;
  RETURN 'kids';
END;
$$;

-- ---------------------------------------------------------------------
-- A. DOB immutability trigger
--    The admin RPC sets `app.dob_admin_override = 'true'` for its
--    transaction; trigger lets the change through. Every other path
--    is rejected (PostgREST PATCH from /api/kids/[id], direct service-
--    role writes, etc.).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_kid_dob_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.dob_admin_override', true) = 'true' THEN
    RETURN NEW;
  END IF;
  IF OLD.date_of_birth IS DISTINCT FROM NEW.date_of_birth THEN
    RAISE EXCEPTION
      'date_of_birth is immutable after profile creation. Use the DOB-correction request flow.'
      USING ERRCODE = '22023', HINT = 'Submit POST /api/kids/[id]/dob-correction';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kid_profiles_dob_immutable ON public.kid_profiles;
CREATE TRIGGER kid_profiles_dob_immutable
  BEFORE UPDATE OF date_of_birth ON public.kid_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_kid_dob_immutable();

-- ---------------------------------------------------------------------
-- B. Band ratchet trigger
--    Reading band only progresses forward (kids → tweens → graduated).
--    The admin DOB-correction RPC sets the same session var to permit
--    legitimate band-recompute when DOB shifts younger.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_band_ratchet()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_rank int;
  v_new_rank int;
BEGIN
  IF current_setting('app.dob_admin_override', true) = 'true' THEN
    RETURN NEW;
  END IF;
  v_old_rank := CASE OLD.reading_band
    WHEN 'kids' THEN 1
    WHEN 'tweens' THEN 2
    WHEN 'graduated' THEN 3
    ELSE 0
  END;
  v_new_rank := CASE NEW.reading_band
    WHEN 'kids' THEN 1
    WHEN 'tweens' THEN 2
    WHEN 'graduated' THEN 3
    ELSE 0
  END;
  IF v_new_rank < v_old_rank THEN
    RAISE EXCEPTION
      'reading_band cannot regress (% -> %)', OLD.reading_band, NEW.reading_band
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kid_profiles_band_ratchet ON public.kid_profiles;
CREATE TRIGGER kid_profiles_band_ratchet
  BEFORE UPDATE OF reading_band ON public.kid_profiles
  FOR EACH ROW
  WHEN (OLD.reading_band IS DISTINCT FROM NEW.reading_band)
  EXECUTE FUNCTION public.enforce_band_ratchet();

-- ---------------------------------------------------------------------
-- C. kid_dob_correction_requests table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kid_dob_correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_profile_id uuid NOT NULL REFERENCES public.kid_profiles(id) ON DELETE CASCADE,
  parent_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_dob date NOT NULL,
  requested_dob date NOT NULL,
  current_band text NOT NULL CHECK (current_band IN ('kids','tweens','graduated')),
  resulting_band text NOT NULL CHECK (resulting_band IN ('kids','tweens','graduated')),
  direction text NOT NULL CHECK (direction IN ('younger','older','same')),
  reason text NOT NULL CHECK (length(reason) BETWEEN 10 AND 280),
  documentation_url text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','documentation_requested','rejected_no_response')),
  decision_reason text,
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  cooldown_ends_at timestamptz,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One pending request per kid at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_dob_corrections_one_pending
  ON public.kid_dob_correction_requests (kid_profile_id)
  WHERE status IN ('pending','documentation_requested');

-- Lifetime correction limit (one approved per kid, ever)
CREATE UNIQUE INDEX IF NOT EXISTS idx_dob_corrections_lifetime
  ON public.kid_dob_correction_requests (kid_profile_id)
  WHERE status = 'approved';

-- Admin queue scan
CREATE INDEX IF NOT EXISTS idx_dob_corrections_queue
  ON public.kid_dob_correction_requests (status, created_at DESC);

-- Cooldown cron scan
CREATE INDEX IF NOT EXISTS idx_dob_corrections_cooldown_due
  ON public.kid_dob_correction_requests (cooldown_ends_at)
  WHERE status = 'pending' AND direction = 'younger';

-- RLS: parents see only their own kids' requests; admins see all.
ALTER TABLE public.kid_dob_correction_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dob_corrections_parent_read ON public.kid_dob_correction_requests;
CREATE POLICY dob_corrections_parent_read ON public.kid_dob_correction_requests
  FOR SELECT
  USING (parent_user_id = auth.uid());

DROP POLICY IF EXISTS dob_corrections_parent_insert ON public.kid_dob_correction_requests;
CREATE POLICY dob_corrections_parent_insert ON public.kid_dob_correction_requests
  FOR INSERT
  WITH CHECK (parent_user_id = auth.uid());

DROP POLICY IF EXISTS dob_corrections_admin_all ON public.kid_dob_correction_requests;
CREATE POLICY dob_corrections_admin_all ON public.kid_dob_correction_requests
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.compute_effective_perms(auth.uid()) p
      WHERE p.permission_key = 'admin.kids.dob_corrections.review' AND p.granted = true
    )
  );

-- ---------------------------------------------------------------------
-- D. kid_dob_history append-only audit table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kid_dob_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_profile_id uuid NOT NULL REFERENCES public.kid_profiles(id) ON DELETE CASCADE,
  old_dob date,
  new_dob date NOT NULL,
  change_source text NOT NULL CHECK (change_source IN ('initial_creation','admin_correction','admin_manual_override')),
  actor_user_id uuid REFERENCES auth.users(id),
  decision_reason text,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kid_dob_history_kid
  ON public.kid_dob_history (kid_profile_id, created_at DESC);

ALTER TABLE public.kid_dob_history ENABLE ROW LEVEL SECURITY;

-- Admin-only read; INSERT only via the SECURITY DEFINER RPC (no policy
-- needed for direct INSERT since the RPC runs as definer).
DROP POLICY IF EXISTS kid_dob_history_admin_read ON public.kid_dob_history;
CREATE POLICY kid_dob_history_admin_read ON public.kid_dob_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.compute_effective_perms(auth.uid()) p
      WHERE p.permission_key = 'admin.kids.dob_corrections.review' AND p.granted = true
    )
  );

-- ---------------------------------------------------------------------
-- E. admin_apply_dob_correction RPC
--    Approves or rejects a pending request. On approve: sets the
--    session var, applies the DOB change (which recomputes band via
--    compute_band_from_dob), appends band_history, writes audit row.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_apply_dob_correction(
  p_request_id uuid,
  p_decision text,
  p_decision_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request public.kid_dob_correction_requests%ROWTYPE;
  v_actor uuid := auth.uid();
  v_old_dob date;
  v_old_band text;
  v_new_band text;
  v_has_perm boolean;
BEGIN
  -- Permission gate
  SELECT EXISTS (
    SELECT 1 FROM public.compute_effective_perms(v_actor) p
    WHERE p.permission_key = 'admin.kids.dob_corrections.review' AND p.granted = true
  ) INTO v_has_perm;
  IF NOT v_has_perm THEN
    RAISE EXCEPTION 'Permission denied: admin.kids.dob_corrections.review' USING ERRCODE = '42501';
  END IF;

  IF p_decision NOT IN ('approved','rejected','documentation_requested') THEN
    RAISE EXCEPTION 'p_decision must be approved|rejected|documentation_requested' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_request FROM public.kid_dob_correction_requests
    WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_request.status NOT IN ('pending','documentation_requested') THEN
    RAISE EXCEPTION 'Request not pending (status=%)', v_request.status USING ERRCODE = '22023';
  END IF;

  UPDATE public.kid_dob_correction_requests
  SET status = p_decision,
      decision_reason = p_decision_reason,
      decided_by = v_actor,
      decided_at = now()
  WHERE id = p_request_id;

  IF p_decision = 'approved' THEN
    SELECT date_of_birth, reading_band INTO v_old_dob, v_old_band
      FROM public.kid_profiles WHERE id = v_request.kid_profile_id;
    v_new_band := public.compute_band_from_dob(v_request.requested_dob);

    -- Set override session var so triggers permit the DOB+band change
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
            'set_by', v_actor,
            'reason', 'dob_correction:' || v_request.id::text
          )
        )
    WHERE id = v_request.kid_profile_id;

    INSERT INTO public.kid_dob_history (
      kid_profile_id, old_dob, new_dob, change_source,
      actor_user_id, decision_reason
    )
    VALUES (
      v_request.kid_profile_id, v_old_dob, v_request.requested_dob,
      'admin_correction', v_actor, p_decision_reason
    );

    -- Reset override (defensive; transaction-scoped anyway)
    PERFORM set_config('app.dob_admin_override', '', true);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_apply_dob_correction(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_apply_dob_correction(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- G. Permission seed: admin.kids.dob_corrections.review
-- ---------------------------------------------------------------------
-- deny_mode is varchar(10): valid values are 'hidden' or 'locked'.
-- Admin permissions hide rather than lock — unauthorized users shouldn't
-- see the queue surface at all.
INSERT INTO public.permissions (key, display_name, category, ui_section, deny_mode)
VALUES (
  'admin.kids.dob_corrections.review',
  'Review kid DOB correction requests',
  'admin',
  'admin',
  'hidden'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
