-- T-015: seed rate_limits rows for comment vote, flag, and report routes.
-- These are the policyKey values referenced by checkRateLimit in the three
-- comment action routes. Without these rows the routes fall back to the
-- code defaults (same values), but having explicit rows lets ops tune limits
-- at runtime via admin/system without a deploy.
INSERT INTO public.rate_limits (key, max_requests, window_seconds, scope, is_active)
VALUES
  ('comment_vote',   30,   60, 'user', true),
  ('comment_flag',   20, 3600, 'user', true),
  ('comment_report', 10, 3600, 'user', true)
ON CONFLICT (key) DO NOTHING;
