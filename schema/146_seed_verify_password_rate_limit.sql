-- 146_seed_verify_password_rate_limit.sql
-- Option A item 6 — adds rate-limit policy for the new /api/auth/verify-password
-- endpoint. The endpoint replaces a client-side supabase.auth.signInWithPassword
-- call from PasswordCard (settings) and api/kids/reset-pin, which had no per-user
-- rate limit and rotated the user's session cookie on every probe.
--
-- The endpoint is authed (requireAuth) and uses createEphemeralClient to verify
-- the password without rotating cookies. Per-user rate limit caps brute-force
-- attempts from a stolen session at 5/hour. Failed attempts also call
-- record_failed_login_by_email so they count toward the existing 5-strike
-- account lockout shared with the regular login flow (no separate counter).

INSERT INTO public.rate_limits
  (key, display_name, description, max_requests, window_seconds, scope, is_active)
VALUES
  ('verify_password',   'Password verification',   'POST /api/auth/verify-password',   5,  3600,  'user', true)
ON CONFLICT (key) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description = EXCLUDED.description,
      max_requests = EXCLUDED.max_requests,
      window_seconds = EXCLUDED.window_seconds,
      scope = EXCLUDED.scope,
      is_active = EXCLUDED.is_active;
