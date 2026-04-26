-- T-016: seed rate_limits rows for expert ask, claim, and back-channel POST routes.
-- These are the policyKey values referenced by checkRateLimit in the three
-- expert routes. Without these rows the routes fall back to the code defaults
-- (same values), but having explicit rows lets ops tune limits at runtime via
-- admin/system without a deploy.
INSERT INTO public.rate_limits (key, max_requests, window_seconds, scope, is_active)
VALUES
  ('expert-ask',   5,  60, 'user', true),
  ('expert-claim', 30, 60, 'user', true),
  ('expert-back',  20, 60, 'user', true)
ON CONFLICT (key) DO NOTHING;
