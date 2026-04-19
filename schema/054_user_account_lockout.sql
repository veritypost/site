-- 054_user_account_lockout.sql
-- Pass 17 / Task 140a — enforce a 15-minute lockout after 5 failed login
-- attempts against the same account. The `users.locked_until` column and
-- `failed_login_count` counter already live in the base schema
-- (reset_and_rebuild_v2.sql:328-329); this migration is idempotent in case
-- an environment predates that state, and ships the
-- `public.record_failed_login(uuid)` RPC that the login route calls on each
-- failed attempt. Grant is to `service_role` only — the login API uses the
-- service client to invoke it so RLS does not need to consider it.

ALTER TABLE users ADD COLUMN IF NOT EXISTS "locked_until" timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "failed_login_count" integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.record_failed_login(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE users
    SET failed_login_count = COALESCE(failed_login_count, 0) + 1
    WHERE id = p_user_id
    RETURNING failed_login_count INTO v_count;

  IF v_count >= 5 THEN
    UPDATE users SET locked_until = now() + interval '15 minutes' WHERE id = p_user_id;
  END IF;
END;
$$;

-- A successful login clears the counter + lockout. Idempotent — callable
-- once per authenticated session without side effects on an already-clean
-- account.
CREATE OR REPLACE FUNCTION public.clear_failed_login(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE users
    SET failed_login_count = 0, locked_until = NULL
    WHERE id = p_user_id
      AND (failed_login_count > 0 OR locked_until IS NOT NULL);
END;
$$;

-- Email-keyed lockout peek used by the login-precheck endpoint so the
-- client can skip the Supabase auth call for an account that is already
-- in the 15-minute window. Returns NULL (not locked) for unknown emails
-- so the shape doesn't leak account existence.
CREATE OR REPLACE FUNCTION public.get_user_lockout_by_email(p_email text)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.locked_until
    FROM public.users u
    JOIN auth.users a ON a.id = u.id
    WHERE lower(a.email) = lower(p_email)
      AND u.locked_until IS NOT NULL
      AND u.locked_until > now()
    LIMIT 1;
$$;

-- Email-keyed failure recorder for the login-failed endpoint. No-op for
-- unknown emails — same shape, no enumeration side channel.
CREATE OR REPLACE FUNCTION public.record_failed_login_by_email(p_email text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_locked_until timestamptz;
BEGIN
  SELECT u.id INTO v_user_id
    FROM public.users u
    JOIN auth.users a ON a.id = u.id
    WHERE lower(a.email) = lower(p_email)
    LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM public.record_failed_login(v_user_id);

  SELECT locked_until INTO v_locked_until FROM public.users WHERE id = v_user_id;
  RETURN v_locked_until;
END;
$$;

-- Pass 17 / UJ-708 — constant-shape "is this email registered?" probe
-- for the signup form. Returns TRUE only when an auth.users row exists
-- for the supplied email. Rate-limited at the route layer.
CREATE OR REPLACE FUNCTION public.is_email_registered(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email)
  );
$$;

GRANT EXECUTE ON FUNCTION public.record_failed_login(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_failed_login(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_lockout_by_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_failed_login_by_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_email_registered(text) TO service_role;
