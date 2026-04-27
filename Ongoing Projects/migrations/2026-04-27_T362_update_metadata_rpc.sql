-- =====================================================================
-- 2026-04-27_T362_update_metadata_rpc.sql
-- T362: update_metadata RPC with `metadata || $1` JSONB-merge semantics
-- =====================================================================
-- Problem:
--   The third half of T307 (re-stamping `metadata.terms_accepted_at` on
--   email-change) was deferred because a plain
--   `.update({ metadata: {...} })` from the JS client clobbers the
--   other JSONB keys (age_confirmed_at, terms_version, etc). There's
--   currently no RPC that does PATCH-style key-merging into metadata.
--
-- Fix:
--   New SECURITY DEFINER function `update_metadata(p_user_id, p_keys)`
--   that does:
--     UPDATE users SET metadata = COALESCE(metadata, '{}') || $2
--      WHERE id = $1
--   Caller must be the user themselves (auth.uid() = p_user_id) OR an
--   admin. Service-role calls bypass the auth check (intended — server
--   routes use service-role).
--
-- Rollback:
--   BEGIN; DROP FUNCTION public.update_metadata(uuid, jsonb); COMMIT;
--
-- Verification:
--   SELECT proname FROM pg_proc WHERE proname = 'update_metadata';
--   -- expect 1 row
--   -- functional test:
--   SELECT public.update_metadata(
--     auth.uid(),
--     '{"terms_accepted_at":"2026-04-27T00:00:00Z"}'::jsonb
--   );
--   SELECT metadata FROM users WHERE id = auth.uid();
--   -- expect terms_accepted_at present + prior keys preserved
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.update_metadata(
  p_user_id uuid,
  p_keys jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  -- Authorization: caller must be the user themselves OR an admin.
  -- service-role calls have a NULL auth.uid() and bypass this check
  -- (intended — backend routes are trusted to scope correctly).
  IF v_caller IS NOT NULL
     AND v_caller <> p_user_id
     AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  -- Reject obviously-malformed inputs early.
  IF p_keys IS NULL OR jsonb_typeof(p_keys) <> 'object' THEN
    RAISE EXCEPTION 'p_keys must be a jsonb object' USING ERRCODE = '22023';
  END IF;

  UPDATE public.users
     SET metadata = COALESCE(metadata, '{}'::jsonb) || p_keys
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_metadata(uuid, jsonb) TO authenticated;

COMMIT;

-- =====================================================================
-- Code change required after this migration applies:
--   web/src/app/api/auth/email-change/route.js — restore the
--   `terms_accepted_at` re-stamp half of T307 by adding (after the
--   existing `.update({ email_verified, email, verify_locked_at })`
--   succeeds):
--
--     const { error: metaErr } = await service.rpc('update_metadata', {
--       p_user_id: user.id,
--       p_keys: { terms_accepted_at: new Date().toISOString() },
--     });
--     if (metaErr) {
--       console.error('[auth.email-change] update_metadata failed:', metaErr.message || metaErr);
--     }
-- =====================================================================
