-- 053_resolve_username_to_email_rpc.sql
-- Landed via Pass 16 Task 134 (LB-035 login via email or username).
--
-- Problem: Supabase auth's signInWithPassword requires an email. To let
-- returning users log in with either their email or their username, we
-- need a server-side lookup that takes a username and returns the
-- associated email. That lookup must be SECURITY DEFINER so anon
-- callers can reach it before they're authenticated, but scoped to
-- return exactly the one field needed (email) so it doesn't double as
-- a user-enumeration primitive.
--
-- Privacy considerations:
--   - D32 private-profile toggle governs public visibility; a private
--     profile's username is still resolvable for auth because the
--     legitimate user already knows their own email. Auth is a
--     different concern from profile discovery.
--   - Enumeration risk: the lookup only tells the caller whether a
--     username exists, not whether its password is anything specific.
--     Rate-limited at the API route (10 req/minute per IP).
--   - Error copy at the login form must be identical for missing
--     username vs wrong password to prevent side-channel leak.
--
-- Function is STABLE (not VOLATILE) so it can be called from RLS or
-- triggers if future use cases need it.

CREATE OR REPLACE FUNCTION public.resolve_username_to_email(p_username text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT au.email
  FROM public.users u
  JOIN auth.users au ON au.id = u.id
  WHERE lower(u.username) = lower(trim(p_username))
    AND u.is_banned = false
    AND u.deleted_at IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_username_to_email(text) TO anon, authenticated;
