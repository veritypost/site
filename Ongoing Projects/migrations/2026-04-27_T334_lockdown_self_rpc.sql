-- =====================================================================
-- 2026-04-27_T334_lockdown_self_rpc.sql
-- T334: server-side `lockdown_self()` RPC that atomically flips
--       profile_visibility='hidden' AND deletes follows rows
-- =====================================================================
-- Problem:
--   web/src/app/redesign/profile/settings/_cards/PrivacyCard.tsx:175-178
--   currently does:
--     await supabase.from('follows').delete().eq('following_id', authUser.id);
--   AND a separate update of users.profile_visibility='hidden'.
--
--   Issues:
--     1. Two-statement client-side flow → not atomic. If the delete
--        succeeds and the visibility update fails (network drop, RLS
--        change), the user has lost all followers but their profile is
--        still public-readable. The reverse is also possible.
--     2. Trusts RLS to enforce caller-identity on the delete. If the
--        follows-table RLS ever drifts to allow a broader DELETE (e.g.,
--        a future moderation feature), this becomes a write-to-other-
--        users primitive — anyone with a session could nuke another
--        user's followers.
--
-- Fix:
--   New SECURITY DEFINER `lockdown_self(uuid)` that runs both mutations
--   in one transaction, with explicit auth.uid() == p_user_id check
--   inside the function so RLS drift on `follows` can't compromise it.
--
-- Rollback:
--   BEGIN; DROP FUNCTION public.lockdown_self(uuid); COMMIT;
--
-- Verification:
--   SELECT proname FROM pg_proc WHERE proname = 'lockdown_self';
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.lockdown_self(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_followers_removed integer := 0;
BEGIN
  -- Caller must be the user themselves. Service-role bypasses
  -- (auth.uid() returns NULL — intended for backend support tooling).
  IF v_caller IS NOT NULL AND v_caller <> p_user_id THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  -- Atomic: visibility flip + follows wipe in one transaction.
  UPDATE public.users
     SET profile_visibility = 'hidden',
         updated_at = now()
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;

  WITH deleted AS (
    DELETE FROM public.follows
     WHERE following_id = p_user_id
     RETURNING 1
  )
  SELECT count(*) INTO v_followers_removed FROM deleted;

  -- Audit trail: who locked down, how many followers cleared.
  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (
    p_user_id,
    'self:lockdown',
    'user',
    p_user_id,
    jsonb_build_object('followers_removed', v_followers_removed)
  );

  -- Bump perms_version so the client cache picks up the visibility flip
  -- without waiting for the 60s poll.
  PERFORM bump_user_perms_version(p_user_id);

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'profile_visibility', 'hidden',
    'followers_removed', v_followers_removed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lockdown_self(uuid) TO authenticated;

COMMIT;

-- =====================================================================
-- Code change required after this migration applies:
--   web/src/app/redesign/profile/settings/_cards/PrivacyCard.tsx — replace
--   the two-statement client flow at ~lines 168-178 with:
--
--     const { error } = await supabase.rpc('lockdown_self', {
--       p_user_id: authUser.id,
--     });
--     if (error) { toast.error(...); return; }
--
--   Drop the direct .from('follows').delete() and the separate
--   .update({ profile_visibility: 'hidden' }) calls. The RPC handles
--   both atomically + writes the audit row + bumps perms_version.
-- =====================================================================
