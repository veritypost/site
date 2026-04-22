# db/01 — Trials: Add to Plans

**Owner:** Lessin (business rationale), Sutherland (trial design).
**Purpose:** `03_TRIAL_STRATEGY.md` — trials don't exist in the `plans` table. Turn them on.
**Migration filename:** `schema/<next>_add_trial_days_2026_XX_XX.sql`

---

## Current state (verified 2026-04-21)

Query: `SELECT name, tier, period, trial_days FROM plans ORDER BY tier, period;`

Every paid `plans` row has `trial_days = 0`. No trial is configured anywhere in DB, Stripe, or App Store Connect.

## The change

Set trial days per plan:

```sql
UPDATE plans SET trial_days = 7
  WHERE period = 'month' AND tier IN ('verity', 'verity_pro', 'verity_family', 'verity_family_xl');

UPDATE plans SET trial_days = 14
  WHERE period = 'year' AND tier IN ('verity', 'verity_pro', 'verity_family', 'verity_family_xl');

UPDATE plans SET trial_days = 0
  WHERE tier = 'free';
```

Monthly trials: 7 days. Annual trials: 14 days.

## Update prices at the same time (per `02_PRICING_RESET.md` Option A)

Combine with price updates:

```sql
-- Verity: $6.99 / $59.99
UPDATE plans SET price_cents = 699 WHERE name = 'verity_monthly';
UPDATE plans SET price_cents = 5999 WHERE name = 'verity_annual';

-- Verity Pro: $12.99 / $119.99
UPDATE plans SET price_cents = 1299 WHERE name = 'verity_pro_monthly';
UPDATE plans SET price_cents = 11999 WHERE name = 'verity_pro_annual';

-- Verity Family: $19.99 / $179.99
UPDATE plans SET price_cents = 1999 WHERE name = 'verity_family_monthly';
UPDATE plans SET price_cents = 17999 WHERE name = 'verity_family_annual';

-- Verity Family XL: $29.99 / $279.99
UPDATE plans SET price_cents = 2999 WHERE name = 'verity_family_xl_monthly';
UPDATE plans SET price_cents = 27999 WHERE name = 'verity_family_xl_annual';
```

## Stripe price ID updates

Stripe price IDs must be created in the Stripe dashboard first (new price objects — you can't edit price on an existing price object, only create new ones and retire old). After creation:

```sql
UPDATE plans SET stripe_price_id = '<new_stripe_price_id>' WHERE name = 'verity_monthly';
-- ... repeat per plan
```

**Do not run this part without verifying the new price exists in Stripe.** Existing subscribers are on the old price IDs and should stay there until their subscription renews — don't force-migrate them.

Leave `stripe_price_id` as current until new Stripe prices are verified live; update the column then.

## Apple product IDs

Apple product IDs in App Store Connect: prices are bound to the product ID. Best practice:
- Create new product IDs with `_v2` suffix: `com.veritypost.verity.monthly.v2`.
- Set new prices on v2 products.
- Keep v1 products listed (but hidden from store) for existing subscribers.
- Update `apple_product_id` in `plans` to point to v2.

Apple review is required for new products — plan lead time (Apple reviews can take days).

## RLS policies

No changes. `plans` is a public-read table; writes via service role.

## Callers that use trial_days

- `/api/stripe/checkout/route.js` — new: pass `subscription_data.trial_period_days: plan.trial_days` when creating checkout session.
- `web/src/app/profile/settings/billing/page.tsx` — read trial_days for display.
- `VerityPost/VerityPost/SubscriptionView.swift` — reads trial_days via product metadata (Apple stores trial as "intro offer" — App Store Connect is the source of truth for iOS; `trial_days` in DB is for web).

## Acceptance criteria

- [ ] `plans.trial_days = 7` on monthly paid plans.
- [ ] `plans.trial_days = 14` on annual paid plans.
- [ ] `plans.trial_days = 0` on free tier (no change from current).
- [ ] `plans.price_cents` updated to Option A values.
- [ ] New Stripe prices created in Stripe dashboard with matching IDs.
- [ ] Stripe checkout route passes `trial_period_days`.
- [ ] Apple product IDs `_v2` created in App Store Connect with new prices (blocked on Apple Dev account; spec ready).
- [ ] Verify via `SELECT name, tier, period, price_cents, trial_days, stripe_price_id, apple_product_id FROM plans ORDER BY tier, period;`

## Dependencies

Ship coordinated with Stripe dashboard + App Store Connect changes. DB migration alone is incomplete — the Stripe/Apple updates are part of the same unit of work.
