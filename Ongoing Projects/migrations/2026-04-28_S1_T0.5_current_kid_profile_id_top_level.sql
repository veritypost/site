-- =====================================================================
-- 2026-04-28_S1_T0.5_current_kid_profile_id_top_level.sql
-- S1-T0.5 — current_kid_profile_id() reads top-level JWT claim
-- Source: Ongoing Projects/Sessions/Session_01_DB_Migrations.md (S1-T0.5)
-- Severity: P0 production-broken (fail-CLOSED — kids see fewer articles)
-- =====================================================================
-- Verified state (2026-04-28 via pg_get_functiondef):
--   CREATE OR REPLACE FUNCTION public.current_kid_profile_id()
--    RETURNS uuid
--    LANGUAGE sql STABLE
--   AS $$
--     SELECT NULLIF(auth.jwt() -> 'app_metadata' ->> 'kid_profile_id', '')::uuid
--   $$;
--
--   Kid JWTs minted at:
--     web/src/app/api/kids/pair/route.js:153
--     web/src/app/api/kids/refresh/route.js:114
--   write `kid_profile_id` to the TOP LEVEL of the JWT, not inside
--   `app_metadata`. The function returns NULL for every kid JWT,
--   `kid_visible_bands(NULL)` returns '{}'::age_band_t[], and article RLS
--   degrades to `age_band IS NULL`. Phase-1 backfill stamped every
--   kid-safe article to age_band='tweens', so kids see fewer articles
--   than the platform intends.
--
-- Fix: read the top-level claim. Sibling helpers (is_kid_delegated /
-- parent_user_id) already read top-level — this aligns the missing one.
--
-- Rollback:
--   Replace the body with `auth.jwt() -> 'app_metadata' ->> 'kid_profile_id'`.
-- =====================================================================

BEGIN;

-- Pre-flight: confirm function exists with the broken body. Refuse if it
-- already reads top-level (so the migration is a clean no-op on re-apply).
DO $$
DECLARE
  v_body text;
BEGIN
  SELECT prosrc INTO v_body
    FROM pg_proc
   WHERE proname = 'current_kid_profile_id'
     AND pronamespace = 'public'::regnamespace;
  IF v_body IS NULL THEN
    RAISE EXCEPTION 'current_kid_profile_id missing — abort';
  END IF;
  IF v_body !~ 'app_metadata' THEN
    RAISE NOTICE 'current_kid_profile_id already reads top-level kid_profile_id; this migration is a no-op';
  END IF;
END $$;

-- STABLE preserved (matches the existing function), search_path pinned for
-- safety even though LANGUAGE sql doesn't strictly require it. SECURITY
-- DEFINER not added — sibling helpers (is_kid_delegated, parent_user_id)
-- run as INVOKER too; the JWT claim read is per-request and doesn't need
-- elevated privilege.
CREATE OR REPLACE FUNCTION public.current_kid_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = 'public'
AS $$
  SELECT NULLIF(auth.jwt() ->> 'kid_profile_id', '')::uuid
$$;

-- Post-verification.
DO $$
DECLARE v_body text;
BEGIN
  SELECT prosrc INTO v_body
    FROM pg_proc WHERE proname='current_kid_profile_id'
                   AND pronamespace='public'::regnamespace;
  IF v_body ~ 'app_metadata' THEN
    RAISE EXCEPTION 'current_kid_profile_id still reads app_metadata — abort';
  END IF;
  RAISE NOTICE 'S1-T0.5 applied: current_kid_profile_id reads top-level kid_profile_id';
END $$;

COMMIT;
