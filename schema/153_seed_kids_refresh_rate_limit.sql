-- 153 — seed a rate_limits policy row for /api/kids/refresh.
--
-- Kids iOS calls POST /api/kids/refresh once per 24-hour window when the
-- local JWT has under a day of life left. A malicious client spamming
-- refresh is the only realistic abuse vector, so 30/min/ip matches kids_pair
-- proportion but is slightly wider because refresh is a silent background
-- call (no user action) and transient network retries can cluster.
--
-- Idempotent: ON CONFLICT DO NOTHING so re-application after a manual row
-- insert (via the /admin/system rate_limits editor) is safe.

INSERT INTO rate_limits (key, display_name, description, max_requests, window_seconds, scope, is_active)
VALUES (
  'kids_refresh',
  'Kids JWT refresh',
  'POST /api/kids/refresh — kids iOS rotates its pair JWT when under 24h of TTL remains. Rate-limited by client IP.',
  30,
  60,
  'ip',
  true
)
ON CONFLICT (key) DO NOTHING;
