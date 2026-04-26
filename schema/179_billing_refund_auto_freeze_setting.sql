-- 179 — T-011: add billing.refund_auto_freeze setting.
--
-- Controls whether a full Stripe refund auto-freezes the user immediately
-- (value='true' = legacy behavior) or routes to admin review queue
-- (value='false' = new default).
--
-- After applying: handleChargeRefunded in the Stripe webhook skips
-- billing_freeze_profile and instead logs a billing:refund_full_pending_review
-- audit entry. Admin uses /api/admin/billing/freeze to manually freeze
-- after reviewing the charge.
--
-- To restore immediate-freeze behavior (e.g., for abuse patterns):
--   UPDATE settings SET value = 'true' WHERE key = 'billing.refund_auto_freeze';

INSERT INTO settings (key, value, value_type, category, description, is_public)
VALUES (
  'billing.refund_auto_freeze',
  'false',
  'boolean',
  'billing',
  'When true, freeze user immediately on full Stripe refund. When false, log for admin review and skip auto-freeze.',
  false
)
ON CONFLICT (key) DO NOTHING;
