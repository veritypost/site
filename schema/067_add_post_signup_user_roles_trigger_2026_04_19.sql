-- 067_add_post_signup_user_roles_trigger_2026_04_19.sql
-- Round 4 Track V.3 migration.
--
-- Extend handle_new_auth_user() to:
--   1. Resolve the free plan UUID and set users.plan_id on signup. Previous
--      behaviour left plan_id NULL when the path ran through the trigger.
--   2. Seed a default user_roles row with role='user' for every non-first
--      signup. First-ever user still seeds 'owner'. Previous behaviour only
--      seeded owner for user_count=1 and left every other new user without
--      any role, causing downstream permission lookups to return empty.
--
-- The existing on_auth_user_created AFTER INSERT trigger on auth.users is
-- unchanged; only the function body is replaced (CREATE OR REPLACE).

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
