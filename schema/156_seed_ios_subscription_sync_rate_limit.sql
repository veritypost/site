-- 156 — seed rate_limits policy for /api/ios/subscriptions/sync.
--
-- B15 — a JWS-armed attacker could spam the route and flood webhook_log
-- with (valid-signature) churn. Rate limit by IP. 20/min is generous for
-- a legitimate StoreKit 2 restore (a handful of product ids per tap);
-- low enough to kneecap bot traffic.
--
-- Idempotent — ON CONFLICT DO NOTHING so re-applying after an operator
-- inserts the row via /admin/system is a no-op.

INSERT INTO rate_limits (key, display_name, description, max_requests, window_seconds, scope, is_active)
VALUES (
  'ios_subscription_sync',
  'iOS subscriptions sync',
  'POST /api/ios/subscriptions/sync — iOS StoreKit 2 purchase/restore sync. Rate-limited by client IP.',
  20,
  60,
  'ip',
  true
)
ON CONFLICT (key) DO NOTHING;
