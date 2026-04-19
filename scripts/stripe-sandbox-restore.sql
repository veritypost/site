-- Stripe sandbox (TEST mode) price-ID restore block.
-- Paste into Supabase SQL Editor to flip plans.stripe_price_id back to the
-- sandbox Stripe prices. Requires STRIPE_SECRET_KEY in site/.env.local to be
-- swapped back to the sk_test_... sandbox key for checkout to actually work.
-- Captured 2026-04-17.

UPDATE plans SET stripe_price_id = 'price_1TN9Z1Rps0P6wB4FCs50guVo' WHERE name = 'verity_monthly';
UPDATE plans SET stripe_price_id = 'price_1TN9YoRps0P6wB4F72GLov68' WHERE name = 'verity_annual';
UPDATE plans SET stripe_price_id = 'price_1TN9YYRps0P6wB4FDx4ezngA' WHERE name = 'verity_pro_monthly';
UPDATE plans SET stripe_price_id = 'price_1TN9YIRps0P6wB4FP9EUTydo' WHERE name = 'verity_pro_annual';
UPDATE plans SET stripe_price_id = 'price_1TN9XARps0P6wB4FN5o5a7No' WHERE name = 'verity_family_monthly';
UPDATE plans SET stripe_price_id = 'price_1TN9WwRps0P6wB4FXnVkNtul' WHERE name = 'verity_family_annual';
UPDATE plans SET stripe_price_id = 'price_1TN9WfRps0P6wB4F7PyePUAI' WHERE name = 'verity_family_xl_monthly';
UPDATE plans SET stripe_price_id = 'price_1TN9WMRps0P6wB4FUAydDA5W' WHERE name = 'verity_family_xl_annual';
