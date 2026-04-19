-- 078_fix_billing_bindings_2026_04_18.sql
-- Migration: 20260419000235 fix_billing_bindings_2026_04_18
--
-- Backfill paid-tier bindings for active billing keys where the key is
-- referenced by the user-facing subscription / checkout surface. Without
-- these, a paying pro/family/expert user is silently denied their own
-- upgrade/change-plan/invoices/payment-method UI. Matches the pattern
-- the settings hygiene sweep handled for non-billing keys.
--
-- Conservative: only backfilling keys that are actively referenced in
-- /api/stripe/** or /api/billing/** or /profile/settings page. Duplicates
-- (billing.cancel vs billing.cancel.own, billing.portal.open vs
-- billing.stripe.portal, billing.invoices.view vs .view_own) are left
-- alone — flagged for review.

INSERT INTO permission_set_perms (permission_set_id, permission_id)
SELECT ps.id, p.id
FROM permissions p
CROSS JOIN permission_sets ps
WHERE p.is_active = true
  AND p.key IN (
    'billing.upgrade.checkout',   -- users upgrading to a higher tier
    'billing.stripe.checkout',    -- users initiating stripe checkout
    'billing.payment.change_method',
    'billing.plans.view',
    'billing.period.annual',
    'billing.period.monthly',
    'billing.grace.request_extension',
    'billing.switch_cycle'
  )
  AND ps.key IN ('pro','family','expert','moderator','editor')
ON CONFLICT (permission_set_id, permission_id) DO NOTHING;

-- Also fill in 'free' for the generic read/upgrade surface keys so that
-- a free user signed in can reach the plans/checkout path cleanly.
INSERT INTO permission_set_perms (permission_set_id, permission_id)
SELECT ps.id, p.id
FROM permissions p
CROSS JOIN permission_sets ps
WHERE p.is_active = true
  AND p.key IN (
    'billing.payment.change_method',
    'billing.period.annual',
    'billing.period.monthly'
  )
  AND ps.key = 'free'
ON CONFLICT (permission_set_id, permission_id) DO NOTHING;

-- Bump global perms version so all clients refetch capabilities.
UPDATE perms_global_version SET version = version + 1;
