-- 105_remove_superadmin_role.sql
-- Migration: remove the vestigial `superadmin` role.
--
-- Context: `superadmin` was defined at rank 90 in `roles` but never had
-- its own permission_set in the xlsx matrix. scripts/import-permissions.js
-- mapped it to the identical 8 sets as `admin`, making it a functional
-- duplicate tier. Only one user ever held the role (test_superadmin).
-- Removing closes the xlsx↔DB drift and simplifies role Sets across code.
--
-- Idempotent: safe to re-run; all deletes are keyed on role.name='superadmin'.

BEGIN;

-- 1. If any non-test user ever holds the role, reassign to admin as a
--    safety net. In the live DB as of writing this is only test_superadmin,
--    which will be deleted below, so this is a guard for edge cases.
UPDATE public.user_roles
SET role_id = (SELECT id FROM public.roles WHERE name = 'admin')
WHERE role_id = (SELECT id FROM public.roles WHERE name = 'superadmin')
  AND user_id NOT IN (
    SELECT id FROM public.users WHERE email = 'superadmin@test.veritypost.com'
  );

-- 2. Delete the test_superadmin account. public.users does NOT cascade
--    from auth.users in this schema, so both must be deleted explicitly.
--    Delete user_roles first, then public.users, then auth.users.
DELETE FROM public.user_roles
WHERE user_id IN (
  SELECT id FROM public.users WHERE email = 'superadmin@test.veritypost.com'
);

DELETE FROM public.users
WHERE email = 'superadmin@test.veritypost.com';

DELETE FROM auth.users
WHERE email = 'superadmin@test.veritypost.com';

-- 3. Drop role → permission_set links for superadmin.
DELETE FROM public.role_permission_sets
WHERE role_id = (SELECT id FROM public.roles WHERE name = 'superadmin');

-- 4. Drop any residual user_roles rows for superadmin (defensive; step 1
--    should already have cleared these for the test user, but this covers
--    any other user_roles mapping we didn't reassign in step 1).
DELETE FROM public.user_roles
WHERE role_id = (SELECT id FROM public.roles WHERE name = 'superadmin');

-- 5. Drop the role itself.
DELETE FROM public.roles
WHERE name = 'superadmin';

-- 6. Bump perms_global_version so every client refetches capabilities on
--    next navigation. Any user with cached role arrays that included
--    'superadmin' won't be affected because the role Sets in code were
--    coarse allowlists, not user-facing capabilities; the bump is defense
--    in depth in case any cached effective_perms had superadmin-sourced
--    grants.
UPDATE public.perms_global_version SET version = version + 1, bumped_at = now();

COMMIT;
