-- 081_deactivate_duplicate_billing_keys_2026_04_18.sql
-- Migration: 20260419003159 deactivate_duplicate_billing_keys_2026_04_18
--
-- Phase 5 / Track P — deactivate 2 duplicate billing permission keys.
-- `billing.cancel` is a semantic duplicate of `billing.cancel.own` (what
-- the `/api/billing/cancel` route actually uses). `billing.invoices.view`
-- is a semantic duplicate of `billing.invoices.view_own` (what the
-- `/profile/settings#billing` view actually uses). Zero code references
-- to the deprecated keys — verified via grep immediately before the
-- migration. Setting is_active=false hides them from capability
-- resolution and the admin UI without removing the rows (keeps FK
-- references from bindings/audit intact).
--
-- Idempotent: WHERE is_active = true means a re-run is a no-op once rows
-- are already deactivated.

UPDATE permissions
SET is_active = false
WHERE key IN ('billing.cancel', 'billing.invoices.view')
  AND is_active = true;

SELECT bump_perms_global_version();
