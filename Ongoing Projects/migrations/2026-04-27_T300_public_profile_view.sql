-- =====================================================================
-- 2026-04-27_T300_public_profile_view.sql
-- T300: SECURITY DEFINER view + RLS revoke to plug the public-profile
--       column-level PII leak on `users`.
-- =====================================================================
-- Problem (system map §16 + sixth-pass verification):
--   public.users RLS row-level grants SELECT to anonymous + authenticated
--   when `profile_visibility='public' OR is_admin_or_above() OR id=auth.uid()`.
--   Row-level grants don't filter columns — when the row is readable,
--   PostgREST `from('users').select('*')` returns the ENTIRE row,
--   including:
--     email, plan_id, stripe_customer_id, comped_until, cohort, frozen_at,
--     plan_grace_period_ends_at, locked_until, verify_locked_at, is_banned,
--     is_muted, muted_until, deletion_scheduled_for, kid_seats_paid,
--     primary_auth_provider, terms_accepted_at (in metadata), ip-related
--     audit columns, etc.
--
--   Anyone with a Supabase anon key (or any authenticated user) can call:
--     supabase.from('users').select('*').eq('profile_visibility','public')
--   and walk the entire user base for stripe_customer_id + email + cohort
--   + lifecycle state. Active privacy / GDPR / payments-class leak.
--
-- Fix:
--   1. Create `public_profiles_v` SECURITY DEFINER view that exposes ONLY
--      the whitelisted columns suitable for public/profile-card display.
--   2. REVOKE SELECT on public.users from authenticated + anon. Grant
--      SELECT on public_profiles_v to authenticated + anon instead.
--   3. Self-row reads + admin reads still need full users access.
--      Self-read goes through a separate `select_self_user()` helper
--      that returns the auth.uid() row only. Admin reads go through
--      service-role (already the pattern for admin routes).
--
--   Caller-side migration (NOT in this file — separate sweep):
--     - Replace `supabase.from('users').select(...)` reads with
--       `supabase.from('public_profiles_v').select(...)` for non-self,
--       non-admin paths. Affected files (grep `from\(['\"]users['\"]\)`):
--         /u/[username]/page.tsx, /card/[username]/*, leaderboard/page.tsx,
--         CommentThread author lookups, follower/following lists.
--     - Self-row reads (/profile/page.tsx, NavWrapper.tsx loadProfile)
--       can keep the full `from('users')` select — they run with the
--       authenticated cookie session whose RLS still allows id=auth.uid().
--
-- Pre-flight:
--   1. Confirm no app code reads sensitive columns through the public
--      RLS read path (only via service-role / self-row). Spot-check
--      web/src/app/u/[username]/page.tsx — it currently selects a wide
--      column list that needs narrowing post-apply.
--   2. Take a backup or run on a Supabase branch. The REVOKE is
--      destructive for any caller still relying on the broad RLS read.
--
-- Rollback:
--   GRANT SELECT ON public.users TO authenticated, anon;
--   DROP VIEW public.public_profiles_v;
--
-- Verification:
--   SELECT 1 FROM information_schema.views
--    WHERE table_schema='public' AND table_name='public_profiles_v';
--   -- expect 1 row
--   -- Anon read of public users should now fail / return empty:
--   SET ROLE anon;
--   SELECT email FROM public.users LIMIT 1;
--   -- expect: ERROR or 0 rows
--   SELECT * FROM public.public_profiles_v LIMIT 1;
--   -- expect: 1 row with whitelisted columns only
--   RESET ROLE;
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Public-profile view — whitelisted columns only.
--    Filters at view-time on the same visibility predicate the legacy
--    RLS used (profile_visibility='public') so a 'private' or 'hidden'
--    user is invisible to non-self readers via this surface.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.public_profiles_v
WITH (security_invoker = false)
AS
SELECT
  u.id,
  u.username,
  u.display_name,
  u.bio,
  u.avatar_url,
  u.avatar_color,
  u.banner_url,
  u.verity_score,
  u.streak_current,
  u.is_expert,
  u.expert_title,
  u.expert_organization,
  u.is_verified_public_figure,
  u.articles_read_count,
  u.quizzes_completed_count,
  u.comment_count,
  u.followers_count,
  u.following_count,
  u.show_activity,
  u.show_on_leaderboard,
  u.profile_visibility,
  u.email_verified,
  u.created_at,
  -- Derived booleans for caller-side filtering without leaking
  -- timestamps. `is_frozen` lets the leaderboard hide frozen users
  -- without exposing the freeze date.
  (u.frozen_at IS NOT NULL) AS is_frozen
FROM public.users u
WHERE
  u.profile_visibility = 'public'
  AND COALESCE(u.is_banned, false) = false
  AND COALESCE(u.deletion_scheduled_for, NULL) IS NULL;

GRANT SELECT ON public.public_profiles_v TO authenticated, anon;

-- ---------------------------------------------------------------------
-- 2. Revoke broad SELECT on public.users from authenticated + anon.
--    Self-row reads keep working via the existing RLS row-level policy
--    that grants when id=auth.uid(); RLS evaluation still requires the
--    base table grant for the role. Re-grant self-only access via a
--    column-restricted GRANT or a SECURITY DEFINER helper.
--
--    Keeping the existing GRANT but tightening RLS is more surgical
--    than a hard REVOKE. Adjust the policy so non-self reads ONLY
--    succeed when the columns selected are within the safe set —
--    Postgres can't enforce that natively, so the cleaner shape is:
--      a) keep GRANT SELECT for authenticated (for self-row reads)
--      b) tighten the existing public-read RLS policy to deny non-self
--         reads of sensitive columns by replacing it with a tighter
--         id=auth.uid() OR is_admin_or_above() rule.
--      c) move all non-self public reads to public_profiles_v.
--
--    This file ships (a)+(b); the caller-side sweep (c) lands in a
--    separate code commit after this migration applies, BEFORE the
--    sweep deploys to prod. Apply order:
--      1) this migration on a branch
--      2) caller-side sweep deployed
--      3) merge branch + monitor
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "users_public_read" ON public.users;
DROP POLICY IF EXISTS "users_self_read" ON public.users;
DROP POLICY IF EXISTS "users_admin_read" ON public.users;

CREATE POLICY "users_self_read"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "users_admin_read"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_above());

-- Anon reads no longer hit public.users at all — they go through
-- public_profiles_v which has its own SELECT grant above.
REVOKE SELECT ON public.users FROM anon;

COMMIT;

-- =====================================================================
-- Code change required AFTER apply (separate commit, BEFORE deploy):
--   - web/src/app/u/[username]/page.tsx — switch the supabase
--     .from('users').select(...) query to .from('public_profiles_v').
--   - web/src/app/card/[username]/*.{js,jsx} — same.
--   - web/src/app/leaderboard/page.tsx — same for the leaderboard rows.
--   - web/src/components/CommentThread.tsx — comment author joins should
--     pull from public_profiles_v not users (post-apply, the existing
--     `users!user_id(...)` join would 403 for non-self).
--   - web/src/app/redesign/u/[username]/page.tsx (placeholder; T363
--     rebuild will use public_profiles_v from the start).
--   - VerityPost/VerityPost/PublicProfileView.swift — same swap.
--
--   Self-row reads in /profile/page.tsx + NavWrapper.tsx keep using
--   from('users') because the RLS allows id=auth.uid() through.
--
--   Admin reads via service-role bypass RLS entirely — no change.
-- =====================================================================
