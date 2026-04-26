-- T-017: seed rate_limits rows for quiz/start and comment PATCH edit routes.
-- policyKey values referenced by checkRateLimit in the two handlers.
-- Without these rows the routes fall back to the code defaults (same values),
-- but having explicit rows lets ops tune limits at runtime via admin/system
-- without a deploy.
INSERT INTO public.rate_limits (key, max_requests, window_seconds, scope, is_active)
VALUES
  ('quiz-start',   3,  600, 'user', true),
  ('comment-edit', 5,   60, 'user', true)
ON CONFLICT (key) DO NOTHING;
