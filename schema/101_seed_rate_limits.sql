-- 101_seed_rate_limits.sql
-- T-003 — seed `rate_limits` with one row per policyKey referenced by
-- API routes. The code in `web/src/lib/rateLimit.js` reads these rows
-- via `getRateLimit(policyKey, fallback)` with a 60s in-memory cache.
-- Routes pass their code default as the fallback; the DB row overrides
-- when present. `is_active = false` disables the limit for that policy.
--
-- Values below mirror the inline literals that were in each route
-- file before this migration landed. Tweak max_requests / window_seconds
-- via the admin/system UI (or straight SQL) and changes take effect
-- within 60 seconds.

INSERT INTO public.rate_limits
  (key, display_name, description, max_requests, window_seconds, scope, is_active)
VALUES
  -- Auth path
  ('login_ip',              'Sign-in attempts (IP)',          'POST /api/auth/login',                        10,   900,  'ip',   true),
  ('login_precheck_ip',     'Login precheck (IP)',            'POST /api/auth/login-precheck by IP',         30,  3600,  'ip',   true),
  ('login_precheck_email',  'Login precheck (email)',         'POST /api/auth/login-precheck by email',       3,  3600,  'user', true),
  ('login_failed_ip',       'Login-failed checks (IP)',       'POST /api/auth/login-failed by IP',           30,  3600,  'ip',   true),
  ('login_failed_email',    'Login-failed checks (email)',    'POST /api/auth/login-failed by email',         3,  3600,  'user', true),
  ('signup_ip',             'Signup attempts (IP)',           'POST /api/auth/signup',                        5,  3600,  'ip',   true),
  ('reset_password_ip',     'Password reset requests (IP)',   'POST /api/auth/reset-password by IP',          5,  3600,  'ip',   true),
  ('reset_password_email',  'Password reset requests (email)','POST /api/auth/reset-password by email',       3,  3600,  'user', true),
  ('check_email_ip',        'Email availability (IP)',        'POST /api/auth/check-email by IP',            30,  3600,  'ip',   true),
  ('check_email_addr',      'Email availability (address)',   'POST /api/auth/check-email by address',       10, 86400,  'user', true),
  ('resolve_username',      'Username lookups',               'POST /api/auth/resolve-username',             10,    60,  'ip',   true),
  ('resend_verify',         'Resend verification email',      'POST /api/auth/resend-verification',           3,  3600,  'user', true),
  ('email_change',          'Email-change attempts',          'POST /api/auth/email-change',                  3,  3600,  'user', true),

  -- Account / profile
  ('account_delete',        'Account delete requests',        'POST /api/account/delete',                     5,  3600,  'user', true),
  ('bookmarks',              'Bookmarks write',                'POST /api/bookmarks',                         60,    60,  'user', true),
  ('follows',                'Follows write',                  'POST /api/follows',                           60,    60,  'user', true),
  ('users_block',            'Block user',                     'POST /api/users/[id]/block',                  30,    60,  'user', true),

  -- Moderation / safety
  ('reports',                'Submit report',                  'POST /api/reports',                           10,  3600,  'user', true),
  ('appeals',                'Submit appeal',                  'POST /api/appeals',                           10,  3600,  'user', true),
  ('errors',                 'Error upload',                   'POST /api/errors',                            60,    60,  'ip',   true),

  -- Billing / experts / support
  ('stripe_checkout',        'Stripe checkout session',        'POST /api/stripe/checkout',                   20,  3600,  'user', true),
  ('expert_apply',           'Expert application submit',      'POST /api/expert/apply',                       5,  3600,  'user', true),
  ('support_public',         'Public support ticket',          'POST /api/support/public',                     5,  3600,  'ip',   true),
  ('access_request',         'Beta access request',            'POST /api/access-request',                     3,  3600,  'ip',   true),

  -- Admin
  ('admin_send_email',       'Admin manual email send',        'POST /api/admin/send-email',                   5,  3600,  'user', true),

  -- Kids iOS pair / verify
  ('kids_pair',              'Kid pair (pair-code exchange)',  'POST /api/kids/pair',                         10,    60,  'ip',   true),
  ('kids_generate_pair_code','Kid pair-code generate',         'POST /api/kids/generate-pair-code',           10,    60,  'user', true),
  ('kids_verify_pin',        'Kid PIN verify',                 'POST /api/kids/verify-pin',                   30,    60,  'user', true),
  ('kids_reset_pin',         'Kid PIN reset',                  'POST /api/kids/reset-pin',                     5,  3600,  'user', true),

  -- Ads (impression/click have the highest natural volume; set wider)
  ('ads_impression',         'Ad impression log',              'POST /api/ads/impression',                   300,    60,  'ip',   true),
  ('ads_click',              'Ad click log',                   'POST /api/ads/click',                        120,    60,  'ip',   true)
ON CONFLICT (key) DO UPDATE
  SET display_name   = EXCLUDED.display_name,
      description    = EXCLUDED.description,
      max_requests   = EXCLUDED.max_requests,
      window_seconds = EXCLUDED.window_seconds,
      scope          = EXCLUDED.scope,
      is_active      = EXCLUDED.is_active,
      updated_at     = now();
