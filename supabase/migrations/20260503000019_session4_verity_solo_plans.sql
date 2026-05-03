-- Session 4 / Q07: Insert verity_monthly + verity_annual plan rows.
-- Pricing page hardcoded a SKU that didn't exist; every paid web checkout 404'd.
-- Owner-decided 2026-05-03: $7.99/mo, $79.99/yr.
-- stripe_price_id is NULL — owner mints the Stripe price separately and populates.
-- is_visible=false until stripe_price_id is populated; pricing page logic respects this.

INSERT INTO public.plans (
  name, display_name, description, tier, billing_period, price_cents, currency,
  stripe_price_id, apple_product_id, google_product_id,
  max_family_members, trial_days, is_active, is_visible, sort_order, metadata
) VALUES
  ('verity_monthly', 'Verity', 'Verity solo plan, billed monthly.',
   'verity', 'month', 799, 'usd',
   NULL, 'com.veritypost.verity.monthly', NULL,
   1, 0, true, false, 2, '{}'::jsonb),
  ('verity_annual', 'Verity (annual)', 'Verity solo plan, billed annually.',
   'verity', 'year', 7999, 'usd',
   NULL, 'com.veritypost.verity.annual', NULL,
   1, 0, true, false, 3, '{}'::jsonb)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  tier = EXCLUDED.tier,
  billing_period = EXCLUDED.billing_period,
  price_cents = EXCLUDED.price_cents,
  currency = EXCLUDED.currency,
  apple_product_id = EXCLUDED.apple_product_id,
  max_family_members = EXCLUDED.max_family_members,
  trial_days = EXCLUDED.trial_days,
  is_active = EXCLUDED.is_active,
  -- preserve stripe_price_id if owner has populated it; only set NULL on first insert
  stripe_price_id = COALESCE(public.plans.stripe_price_id, EXCLUDED.stripe_price_id),
  -- preserve is_visible if owner has flipped it (e.g. after minting Stripe price)
  is_visible = CASE WHEN public.plans.stripe_price_id IS NOT NULL THEN public.plans.is_visible ELSE EXCLUDED.is_visible END,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();
