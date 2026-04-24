-- 151_seed_check_username_rate_limit.sql
-- Tier 2 #18 — seed the rate-limit policy for the new
-- /api/auth/check-username endpoint that replaces iOS signup's direct
-- PostgREST probes against reserved_usernames + users. Route falls back
-- to an inline max:20, windowSec:60 if this row is missing, so the
-- endpoint works before the migration is applied; the DB seed just
-- lets the admin UI tune the policy without a redeploy.

INSERT INTO public.rate_limits
  (key, display_name, description, max_requests, window_seconds, scope, is_active)
VALUES
  ('check_username',
   'Username availability check',
   'POST /api/auth/check-username — throttles signup handle enumeration.',
   20,
   60,
   'ip',
   true)
ON CONFLICT (key) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description = EXCLUDED.description,
      max_requests = EXCLUDED.max_requests,
      window_seconds = EXCLUDED.window_seconds,
      scope = EXCLUDED.scope,
      is_active = EXCLUDED.is_active;
