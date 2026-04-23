-- 142_profile_leaderboard_consensus_ship.sql
--
-- Profile + Leaderboard audit consensus ship (C1 of 5-commit Wave 1).
--
-- Purpose:
--   1. Flip `users.profile_visibility` DEFAULT to 'public' and backfill the
--      30/31 rows currently stuck on the old 'private' default so every
--      `/u/<username>` route stops 404'ing for every user on day one.
--   2. Deprecate four duplicate permission keys by copying grants onto the
--      canonical winners, zeroing the old rows, de-activating the old keys,
--      and tightening the winners to `requires_verified=true` to match the
--      gating the retired keys carried.
--   3. Add a SECURITY DEFINER RPC `leaderboard_period_counts(since, limit)`
--      so the web + iOS leaderboard weekly/monthly tabs can read cross-user
--      aggregates without tripping reading_log RLS.
--   4. Keep the profile_visibility enum-like set to `public|private` only.
--      No `'followers'` rows exist today (verified) and no CHECK constraint
--      names the column (verified), so this step is data-only + a new CHECK
--      constraint to lock the set going forward.
--   5. Bump perms_global_version so every session picks up the tightened
--      verified gating on next resolve.
--
-- Verified via MCP (2026-04-22):
--   - 30 users on 'private', 1 on 'public' (default-era rows).
--   - 0 rows on 'followers'; no CHECK on profile_visibility.
--   - `users` has: deleted_at, frozen_at, email_verified, is_banned,
--     show_on_leaderboard, profile_visibility.
--   - `reading_log` has: user_id, kid_profile_id, created_at.
--   - `permission_set_perms` keys on `permission_id` (uuid FK), not key text.
--   - `bump_perms_global_version()` exists with no args.
--   - Source keys (activity, achievements, card_share, categories) all
--     `is_active=true, requires_verified=true`.
--   - Winner keys (activity.view.own, achievements.view.own,
--     score.view.own.categories, card.share_link) all
--     `is_active=true, requires_verified=false` today.

BEGIN;

--------------------------------------------------------------------------------
-- 1. profile_visibility: flip default + backfill existing 'private' rows.
--------------------------------------------------------------------------------

ALTER TABLE public.users
  ALTER COLUMN profile_visibility SET DEFAULT 'public';

UPDATE public.users
   SET profile_visibility = 'public'
 WHERE profile_visibility = 'private';

--------------------------------------------------------------------------------
-- 4. Lock profile_visibility to ('public','private') going forward.
--    Data-wise we already moved all rows to 'public' in step 1. Any stray
--    'followers' value (none exist today) would have been caught there;
--    safeguard with an explicit UPDATE before the constraint lands.
--------------------------------------------------------------------------------

UPDATE public.users
   SET profile_visibility = 'public'
 WHERE profile_visibility NOT IN ('public', 'private');

ALTER TABLE public.users
  ADD CONSTRAINT chk_users_profile_visibility
  CHECK (profile_visibility IN ('public', 'private'));

--------------------------------------------------------------------------------
-- 2. Deprecate the four duplicate permission keys onto their canonical winners.
--    For each (source -> destination) pair:
--      (a) copy permission_set_perms grants from source onto destination
--          (ON CONFLICT DO NOTHING so we never double-insert),
--      (b) delete source's permission_set_perms rows,
--      (c) set source is_active=false,
--      (d) set destination requires_verified=true (matches retired gating).
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
        'migration 142: expected both perm keys to exist, got src=% dst=% for pair (%, %)',
        src_id, dst_id, pair.src_key, pair.dst_key;
    END IF;

    -- (a) copy grants source -> destination
    INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
      SELECT psp.permission_set_id, dst_id
        FROM public.permission_set_perms psp
       WHERE psp.permission_id = src_id
      ON CONFLICT DO NOTHING;

    -- (b) delete source grants
    DELETE FROM public.permission_set_perms
      WHERE permission_id = src_id;

    -- (c) deactivate source key
    UPDATE public.permissions
       SET is_active = false
     WHERE id = src_id;

    -- (d) tighten destination gating
    UPDATE public.permissions
       SET requires_verified = true
     WHERE id = dst_id;
  END LOOP;
END
$$;

--------------------------------------------------------------------------------
-- 3. leaderboard_period_counts RPC (SECURITY DEFINER).
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.leaderboard_period_counts(
  p_since timestamptz,
  p_limit int DEFAULT 50
) RETURNS TABLE(user_id uuid, reads_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rl.user_id, COUNT(*) AS reads_count
    FROM public.reading_log rl
    JOIN public.users u ON u.id = rl.user_id
   WHERE rl.created_at >= p_since
     AND rl.kid_profile_id IS NULL
     AND u.email_verified = true
     AND u.is_banned = false
     AND u.show_on_leaderboard = true
     AND u.frozen_at IS NULL
     AND u.deleted_at IS NULL
   GROUP BY rl.user_id
   ORDER BY COUNT(*) DESC, rl.user_id
   LIMIT GREATEST(1, LEAST(p_limit, 200));
$$;

REVOKE ALL ON FUNCTION public.leaderboard_period_counts(timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leaderboard_period_counts(timestamptz, int)
  TO authenticated, anon, service_role;

--------------------------------------------------------------------------------
-- 5. Bump the global perms cache so the verified-gate tightening lands fast.
--------------------------------------------------------------------------------

SELECT public.bump_perms_global_version();

COMMIT;
