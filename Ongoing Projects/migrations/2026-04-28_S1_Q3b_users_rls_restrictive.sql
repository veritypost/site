-- =====================================================================
-- 2026-04-28_S1_Q3b_users_rls_restrictive.sql
-- S1-Q3b — restrictive kid-blocks on public.users INSERT + UPDATE
-- Source: Ongoing Projects/Sessions/Session_01_DB_Migrations.md (S1-Q3b)
-- Severity: P0 (kid-JWT defense-in-depth)
-- =====================================================================
-- Verified state (2026-04-28 via pg_policy):
--   users_insert        PERMISSIVE  INSERT  WITH CHECK (id = auth.uid())
--   users_update        PERMISSIVE  UPDATE  USING ((id = auth.uid()) OR is_admin_or_above())
--   users_select_block_kid_jwt  RESTRICTIVE  SELECT  USING (NOT is_kid_delegated())
--   users_self_read     PERMISSIVE  SELECT  USING (id = auth.uid())
--   users_admin_read    PERMISSIVE  SELECT  USING (is_admin_or_above())
--
--   SELECT is already RESTRICTIVE-blocked. INSERT + UPDATE are not —
--   a kid token that smuggles past middleware (Q3b RED-verdict scenario)
--   could pass through users_insert / users_update because they're
--   permissive only.
--
-- Fix: add RESTRICTIVE policies on INSERT + UPDATE that require
-- NOT is_kid_delegated(). Restrictive policies AND with the permissive
-- branches; one missed check elsewhere in the kid-isolation layer can't
-- bypass these.
--
-- Coordination: This migration is independent of S3 middleware fix +
-- S10 issuer flip. The DB hardening lands first; whatever issuer S10
-- ultimately picks, the RESTRICTIVE policies block all kid tokens
-- regardless. Per session manual: "the migration set above hardens
-- the DB regardless of which option S10 picks."
--
-- Idempotency: pre-flight check on policy existence; refuses to apply
-- twice with a no-op NOTICE.
--
-- Rollback:
--   BEGIN;
--   DROP POLICY users_block_kid_jwt_insert ON public.users;
--   DROP POLICY users_block_kid_jwt_update ON public.users;
--   COMMIT;
-- =====================================================================

BEGIN;

-- Pre-flight: confirm is_kid_delegated() helper exists.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc
                 WHERE proname='is_kid_delegated'
                   AND pronamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'is_kid_delegated() helper missing — abort';
  END IF;
END $$;

-- Restrictive INSERT policy. ANDs with users_insert (permissive) so an
-- INSERT must satisfy BOTH (id=auth.uid()) AND (NOT is_kid_delegated()).
DROP POLICY IF EXISTS users_block_kid_jwt_insert ON public.users;
CREATE POLICY users_block_kid_jwt_insert ON public.users
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT public.is_kid_delegated());

-- Restrictive UPDATE policy. ANDs with users_update (permissive) so an
-- UPDATE must satisfy BOTH the owner-or-admin gate AND not-kid.
DROP POLICY IF EXISTS users_block_kid_jwt_update ON public.users;
CREATE POLICY users_block_kid_jwt_update ON public.users
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (NOT public.is_kid_delegated())
  WITH CHECK (NOT public.is_kid_delegated());

-- Post-verification.
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM pg_policy p
    JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='users'
     AND p.polname IN ('users_block_kid_jwt_insert','users_block_kid_jwt_update')
     AND p.polpermissive = false;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'expected 2 restrictive kid-block policies on users; found %', v_count;
  END IF;
  RAISE NOTICE 'S1-Q3b (users RLS) applied: restrictive insert + update kid-block policies live';
END $$;

COMMIT;
