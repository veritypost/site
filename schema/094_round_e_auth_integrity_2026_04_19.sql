-- 094_round_e_auth_integrity_2026_04_19.sql
-- Round E migration. Single ALTER FUNCTION pass covering H-22 + N-03.
--
-- H-22: handle_new_auth_user() body audited on 2026-04-19. The function
-- does NOT read NEW.raw_user_meta_data or NEW.raw_app_meta_data. The
-- only role assignments are the hard-coded 'owner' (bootstrap) and
-- 'user' (every other signup) names. A crafted raw_user_meta_data.role
-- claim at signup has no effect on the role this trigger writes.
-- Comment added below so future auditors do not have to reconfirm.
--
-- N-03: owner-bootstrap hijack guard. The original bootstrap condition
-- `user_count = 1` would fire again if public.users is ever emptied
-- (dev-DB reset, accidental TRUNCATE) leaving the next signup silently
-- promoted to owner. Guard: if an owner already exists in user_roles,
-- force user_count to a value that bypasses the bootstrap branch.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  user_count int;
  owner_role_id uuid;
  user_role_id uuid;
  free_plan_id uuid;
BEGIN
  -- Audited 2026-04-19: does not read raw_user_meta_data.role or raw_app_meta_data.role

  SELECT id INTO free_plan_id FROM public.plans WHERE name = 'free' LIMIT 1;

  INSERT INTO public.users (id, email, email_verified, email_verified_at, plan_id, plan_status, locale)
  VALUES (
    NEW.id,
    NEW.email,
    false,
    NULL,
    free_plan_id,
    'active',
    'en'
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO user_count FROM public.users;

  -- N-03 guard: if an owner is already seated, force the non-bootstrap
  -- branch regardless of user_count. Prevents a post-truncate signup
  -- from being auto-promoted to owner.
  IF EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE r.name = 'owner') THEN
    user_count := 2;
  END IF;

  IF user_count = 1 THEN
    SELECT id INTO owner_role_id FROM public.roles WHERE name = 'owner' LIMIT 1;
    IF owner_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES (NEW.id, owner_role_id)
      ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    SELECT id INTO user_role_id FROM public.roles WHERE name = 'user' LIMIT 1;
    IF user_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES (NEW.id, user_role_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;
