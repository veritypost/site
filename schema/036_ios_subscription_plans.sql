-- 036_ios_subscription_plans.sql
-- Seed plans.apple_product_id for the 8 paid SKUs so the iOS sync route
-- (app/api/ios/subscriptions/sync) can resolve a StoreKit product id back
-- to a plans row.
--
-- Idempotent: WHERE clause matches the canonical plan names from
-- reset_and_rebuild_v2.sql.

BEGIN;

UPDATE plans SET apple_product_id = 'com.veritypost.verity.monthly'
  WHERE name = 'verity_monthly';

UPDATE plans SET apple_product_id = 'com.veritypost.verity.annual'
  WHERE name = 'verity_annual';

UPDATE plans SET apple_product_id = 'com.veritypost.verity_pro.monthly'
  WHERE name = 'verity_pro_monthly';

UPDATE plans SET apple_product_id = 'com.veritypost.verity_pro.annual'
  WHERE name = 'verity_pro_annual';

UPDATE plans SET apple_product_id = 'com.veritypost.verity_family.monthly'
  WHERE name = 'verity_family_monthly';

UPDATE plans SET apple_product_id = 'com.veritypost.verity_family.annual'
  WHERE name = 'verity_family_annual';

UPDATE plans SET apple_product_id = 'com.veritypost.verity_family_xl.monthly'
  WHERE name = 'verity_family_xl_monthly';

UPDATE plans SET apple_product_id = 'com.veritypost.verity_family_xl.annual'
  WHERE name = 'verity_family_xl_annual';

COMMIT;

-- Verify (no-op, for sanity at run time):
-- SELECT name, apple_product_id FROM plans WHERE apple_product_id IS NOT NULL ORDER BY sort_order;
