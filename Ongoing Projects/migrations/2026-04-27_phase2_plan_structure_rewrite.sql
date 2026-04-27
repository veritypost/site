-- =====================================================================
-- 2026-04-27_phase2_plan_structure_rewrite.sql
-- Phase 2 of AI + Plan Change Implementation: plan structure rewrite
-- =====================================================================
-- Decisions locked 2026-04-26:
--   - Verity solo: $7.99/mo, $79.99/yr
--   - Verity Family: $14.99/mo with 1 kid included; +$4.99/mo per extra kid
--                    up to 4 kids; $149.99/yr base + $49.99/yr per extra kid
--   - Verity Pro retired: existing subs grandfather (auto-migrate at next
--                          renewal at $7.99 — Option B), new signups blocked
--   - Verity Family XL retired permanently (per-kid model replaces)
--
-- Subscriptions table already has zero rows so column adds are clean.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- A. Update Verity solo prices
-- ---------------------------------------------------------------------
UPDATE public.plans
SET price_cents = 799,
    updated_at = now()
WHERE name = 'verity_monthly';

UPDATE public.plans
SET price_cents = 7999,
    updated_at = now()
WHERE name = 'verity_annual';

-- ---------------------------------------------------------------------
-- B. Update Verity Family base + metadata; add Family annual
-- ---------------------------------------------------------------------
UPDATE public.plans
SET price_cents = 1499,
    metadata = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(coalesce(metadata, '{}'::jsonb), '{included_kids}', '1'),
          '{max_kids}', '4'),
        '{extra_kid_price_cents}', '499'),
      '{max_total_seats}', '6'),
    max_family_members = 6,
    updated_at = now()
WHERE name = 'verity_family_monthly';

INSERT INTO public.plans (
  id, name, display_name, description, tier, billing_period, price_cents, currency,
  max_family_members, is_active, is_visible, sort_order, metadata
)
SELECT
  gen_random_uuid(),
  'verity_family_annual',
  'Verity Family (annual)',
  'Family plan, billed yearly. Up to 4 kids; first kid included.',
  'verity_family',
  'year',
  14999,  -- $149.99/yr
  'usd',
  6,
  true,
  true,
  -- Place annual sort_order one notch after monthly (defensive)
  (SELECT coalesce(sort_order, 0) FROM public.plans WHERE name = 'verity_family_monthly' LIMIT 1),
  '{"included_kids": 1, "max_kids": 4, "extra_kid_price_cents": 4999, "max_total_seats": 6, "is_annual": true, "max_bookmarks": -1}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE name = 'verity_family_annual');

-- ---------------------------------------------------------------------
-- C. Retire Verity Pro (Option B grandfather: keep rows so existing subs
--    keep working until their renewal cron migrates them; hide from
--    new signups via is_active=false + is_visible=false)
-- ---------------------------------------------------------------------
UPDATE public.plans
SET is_active = false,
    is_visible = false,
    updated_at = now()
WHERE name IN ('verity_pro_monthly', 'verity_pro_annual');

-- ---------------------------------------------------------------------
-- D. Retire Family XL if it exists (per-kid model replaces).
--    Code references are being dropped in this same commit, so the row
--    going inactive prevents any stragglers from hitting it.
-- ---------------------------------------------------------------------
UPDATE public.plans
SET is_active = false,
    is_visible = false,
    updated_at = now()
WHERE tier = 'verity_family_xl' OR name LIKE 'verity_family_xl%';

-- ---------------------------------------------------------------------
-- E. Subscriptions: add kid_seats_paid + platform columns.
--    `source` column already exists (stripe | apple | google) — `platform`
--    is the cleaner name for the new code path. We add it as a generated/
--    derived column from `source` so existing webhooks don't have to
--    backfill, and so `source` stays as the historical/billing-source
--    indicator.
--
--    Note: subscriptions has zero rows at migration time, so DEFAULT 1
--    on kid_seats_paid is safe even though family-tier subs in the future
--    will need this set per the active SKU.
-- ---------------------------------------------------------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS kid_seats_paid integer NOT NULL DEFAULT 1
    CHECK (kid_seats_paid BETWEEN 0 AND 4);

-- platform: derived from source; we add it as a real column so RLS + UI
-- can rely on it without joining. Default to 'stripe' (most common at
-- launch); the webhook handlers set it explicitly on every write.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'stripe'
    CHECK (platform IN ('stripe', 'apple', 'google'));

-- next_renewal_at: alias for current_period_end semantically, but
-- explicitly named so support tooling reads cleanly. Indexed for the
-- Pro grandfather migration cron + reconciliation crons.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS next_renewal_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_subscriptions_next_renewal
  ON public.subscriptions (next_renewal_at)
  WHERE next_renewal_at IS NOT NULL AND status = 'active';

-- ---------------------------------------------------------------------
-- F. Permission seeds (Phase 2 + Phase 4 prep)
-- ---------------------------------------------------------------------
INSERT INTO public.permissions (key, display_name, category, ui_section, deny_mode)
VALUES
  ('family.seats.manage', 'Manage family seats (add/remove kid seats)', 'family', 'profile', 'allow_unless_blocked'),
  ('family.kids.manage', 'Manage kid profiles on family plan', 'family', 'profile', 'allow_unless_blocked')
ON CONFLICT (key) DO NOTHING;

COMMIT;
