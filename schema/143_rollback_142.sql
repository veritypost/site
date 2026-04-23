-- 143_rollback_142.sql
--
-- Rollback of 142_profile_leaderboard_consensus_ship.sql.
--
-- Symmetry:
--   1. Restore `users.profile_visibility` DEFAULT to 'private' (but do NOT
--      mass-revert the row data — users may have explicitly opted in to
--      public between ship and rollback, and their choice is respected).
--   2. Drop the `chk_users_profile_visibility` CHECK constraint.
--   3. Re-activate the 4 deprecated permission keys and restore their grants
--      by copying back from the destination winners. Revert the winners'
--      `requires_verified` back to false (original pre-142 state).
--   4. Drop the `leaderboard_period_counts` RPC.
--   5. Bump the global perms cache.

BEGIN;

--------------------------------------------------------------------------------
-- 1. Restore default. Leave row data alone.
--------------------------------------------------------------------------------

ALTER TABLE public.users
  ALTER COLUMN profile_visibility SET DEFAULT 'private';

--------------------------------------------------------------------------------
-- 2. Drop the CHECK constraint added by 142.
--------------------------------------------------------------------------------

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS chk_users_profile_visibility;

--------------------------------------------------------------------------------
-- 3. Re-activate the 4 deprecated permission keys + restore their grants.
--    Copy grants from destination winners back onto sources so whatever sets
--    currently hold the winner also hold the source. This is the most faithful
--    reconstruction — the pre-142 grant set is a subset of today's winner set
--    because 142's copy step was ON CONFLICT DO NOTHING (no overwrites).
--    Revert winners' requires_verified back to false.
--------------------------------------------------------------------------------

DO $$
DECLARE
  pair record;
  src_id uuid;
  dst_id uuid;
BEGIN
  FOR pair IN
    SELECT *
      FROM (VALUES
        ('profile.activity',     'profile.activity.view.own'),
        ('profile.achievements', 'profile.achievements.view.own'),
        ('profile.categories',   'profile.score.view.own.categories'),
        ('profile.card_share',   'profile.card.share_link')
      ) AS t(src_key, dst_key)
  LOOP
    SELECT id INTO src_id FROM public.permissions WHERE key = pair.src_key;
    SELECT id INTO dst_id FROM public.permissions WHERE key = pair.dst_key;

    IF src_id IS NULL OR dst_id IS NULL THEN
      RAISE EXCEPTION
        'rollback 143: expected both perm keys to exist, got src=% dst=% for pair (%, %)',
        src_id, dst_id, pair.src_key, pair.dst_key;
    END IF;

    -- Restore grants on the source by mirroring destination's current set.
    INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
      SELECT psp.permission_set_id, src_id
        FROM public.permission_set_perms psp
       WHERE psp.permission_id = dst_id
      ON CONFLICT DO NOTHING;

    -- Re-activate the source key.
    UPDATE public.permissions
       SET is_active = true
     WHERE id = src_id;

    -- Revert the destination's verified gating.
    UPDATE public.permissions
       SET requires_verified = false
     WHERE id = dst_id;
  END LOOP;
END
$$;

--------------------------------------------------------------------------------
-- 4. Drop the RPC.
--------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.leaderboard_period_counts(timestamptz, int);

--------------------------------------------------------------------------------
-- 5. Bump perms cache.
--------------------------------------------------------------------------------

SELECT public.bump_perms_global_version();

COMMIT;
