# 02 — Pricing Reset

**Owner:** Lessin (primary — this was her attack), Dunford (positioning alignment), Sutherland (behavioral sanity check).
**Depends on:** `00_CHARTER.md`, `01_POSITIONING.md`.
**Affects:** `plans` table, `plan_features` table, `/profile/settings/billing`, `/api/stripe/checkout`, `SubscriptionView.swift`, `StoreManager.swift`, every paywall surface, every ad creative, App Store listings.

---

## Current state (verified 2026-04-21 against Supabase project `fyiwulqphgmoqullmrfn`)

The `plans` table has 9 rows across 4 tiers:

| plan | tier | monthly | annual | stripe_price_id | apple_product_id | is_active | is_visible |
|---|---|---|---|---|---|---|---|
| free | free | $0 | — | — | — | ✓ | ✓ |
| verity_monthly | verity | $3.99 | — | price_1TMQlVRwgw8g8rGMFGiHdjU4 | com.veritypost.verity.monthly | ✓ | ✓ |
| verity_annual | verity | — | $39.99 | price_1TMQlsRwgw8g8rGMhGakj5eu | com.veritypost.verity.annual | ✓ | ✓ |
| verity_pro_monthly | verity_pro | $9.99 | — | price_1TMQmERwgw8g8rGMaoKBJs2D | com.veritypost.verity_pro.monthly | ✓ | ✓ |
| verity_pro_annual | verity_pro | — | $99.99 | price_1TMQmdRwgw8g8rGMe57dRvr6 | com.veritypost.verity_pro.annual | ✓ | ✓ |
| verity_family_monthly | verity_family | $14.99 | — | price_1TMQnRRwgw8g8rGMyfDu0OkK | com.veritypost.verity_family.monthly | ✗ | ✗ |
| verity_family_annual | verity_family | — | $149.99 | price_1TMQnhRwgw8g8rGMOfIxs43t | com.veritypost.verity_family.annual | ✗ | ✗ |
| verity_family_xl_monthly | verity_family_xl | $19.99 | — | price_1TMQnwRwgw8g8rGMgaiA3mvp | com.veritypost.verity_family_xl.monthly | ✗ | ✗ |
| verity_family_xl_annual | verity_family_xl | — | $199.99 | price_1TMQoCRwgw8g8rGM9XApdm9B | com.veritypost.verity_family_xl.annual | ✗ | ✗ |

**Critical verified facts:**
- `trial_days = 0` on every row. Despite prior session ad copy that cited a 7-day free trial, no trial is configured anywhere.
- Verity tier: `ad_free = false, reduced_ads = true`. Ad-free starts at Verity Pro, not Verity. Prior marketing has said "Verity is ad-free" — that's wrong until Verity's `ad_free` flag is flipped.
- Family and Family XL rows are `is_active=false, is_visible=false` — launch-hidden per the project's standard pattern of keeping state alive so un-hiding is a one-line flip.
- `iap_transactions` table exists for Apple receipt sync; `subscriptions` table tracks active billing state; `subscription_events` logs lifecycle.

## What Lessin attacked

"Your pricing is built on vibes. $3.99 for the entry tier means you priced by looking at competitors and subtracting. The people who won't pay $3.99 weren't going to pay at all. The people who will pay $3.99 will also pay $6.99 or $9.99. You left 50% of your revenue on the table to feel generous. Churn curves are the same. Conversion is the same. Revenue isn't."

She is right. The current entry tier price is a fear-price, not a confidence-price.

## The reset (proposed pricing)

Two options, depending on how aggressive the team wants to be. The hardass panel voted for Option B 4–1 (Bell dissenting: she preferred to stay at $3.99 until we have data).

### Option A — confidence pricing (panel consensus)

| tier | monthly | annual | rationale |
|---|---|---|---|
| Free | $0 | — | unchanged. Free is the top of the funnel. |
| Verity | $6.99 | $59.99 | entry paid tier. Still below Apple News+. Above the $4.99 impulse threshold to filter serious readers. Annual 30% discount. |
| Verity Pro | $12.99 | $119.99 | ad-free starts here (unchanged from current). Adds expert Q&A, archives, advanced search. Annual ~23% discount. |
| Verity Family | $19.99 | $179.99 | 2 adult accounts + 2 kid profiles. Includes adult iOS + adult web + kids iOS. Ad-free across all profiles. Parent dashboard. |
| Verity Family XL | $29.99 | $279.99 | 2 adult + 4 kid profiles. Same features, more seats. |

### Option B — institutional pricing (aggressive)

| tier | monthly | annual | rationale |
|---|---|---|---|
| Free | $0 | — | unchanged. |
| Verity | $9.99 | $89.99 | matches The Information's entry tier. Signals seriousness. Expect lower conversion rate, higher LTV, lower churn. |
| Verity Pro | $14.99 | $139.99 | positioned alongside NYT Digital. Includes expert Q&A + archives. |
| Verity Family | $24.99 | $229.99 | family comp priced to feel like a value because the kids app is unique. |
| Verity Family XL | $34.99 | $329.99 | large-family / school-adjacent pricing. |

**Panel recommendation:** start at Option A values and move to Option B after 3 months if churn holds below 4% monthly and trial-to-paid conversion holds above 40%.

## Why raising price is safe here

1. **The product is harder to build than to sell.** The quiz gate, the editorial curation, the kids app, and the family subscription linkage are not commodity features. The comparable products (NYT Digital at $6+/week, The Athletic at $8/month, The Information at $400/year) price above $6.99. Verity has a comparable cost structure and a more defensible moat.
2. **Churn doesn't scale with price in the $5–$15 range.** Empirical evidence from SaaS and consumer subscription data: a $4.99-to-$9.99 bump drops free-trial-to-paid conversion by ~15% but raises LTV by ~50%, because the customers who convert at the higher price are materially less likely to churn.
3. **Family plans amortize the increase across kids.** At $19.99/mo family with 2 kid profiles, the per-seat cost is $5. Parents don't see that as expensive when the alternative is TikTok.
4. **Price signals quality.** Verity is positioned as the antidote to engagement-bait. A $3.99 price contradicts the positioning — it says "this is a discount product." Readers who want serious news expect to pay serious money for it.

## Why we don't price lower

The temptation to go to $2.99 or even free-with-ads will come. Refuse it. Here's why:

- **Free-with-ads erodes the Charter.** We can have ads on the free tier, but the paid tiers exist specifically because readers want to pay to escape engagement-bait. If we make free "good enough," we undercut the paid tiers.
- **Cheap pricing fails to fund the product.** Verity has to pay for: reporters, editors, kids content curation, infrastructure, legal, corrections workflow, and the expert network. $3.99/mo x 10,000 subscribers = $40K/mo gross. That's not a business. $9.99/mo x 10,000 subscribers = $100K/mo gross. That's a small but real business.
- **Cheap pricing anchors too low.** Raising from $3.99 to $9.99 later is a 150% price hike and reads like betrayal. Raising from $6.99 to $9.99 later is a 43% hike and reads like a maturation. Start high.

## Trial strategy

Currently every plan has `trial_days = 0`. The panel agreed trials are required for the new pricing to work, because the quiz gate needs to be experienced before the product sells itself.

**Trial configuration (to be implemented — see `db/01_trials_add_to_plans.md`):**

| plan | trial_days |
|---|---|
| verity_monthly | 7 |
| verity_annual | 14 |
| verity_pro_monthly | 7 |
| verity_pro_annual | 14 |
| verity_family_monthly | 7 |
| verity_family_annual | 14 |
| verity_family_xl_monthly | 7 |
| verity_family_xl_annual | 14 |

All trials require a credit card upfront. The panel debated free-trial-no-card. Lessin killed it: "Free trials without a card are a growth hack. They convert at 3% instead of 30%. Pay-or-not is the decision point the product needs to force." Sutherland agreed: the visible trial timeline (Today / Day 5 reminder / Day 7 charge) is what makes the trial feel honest, and it requires the card commitment to be real.

## Promo codes + educator pricing

The `promo_codes` and `promo_uses` tables exist. Use them.

- **30-day promo code** for Facebook mom groups and educator seeding. Code distributes via specific channels only. Code tracks attribution so we know which channel delivers.
- **Free educator tier** — not a promo code, a role flag. Educators get Verity Pro equivalent for free with the caveat that they're a distribution channel, not a revenue channel (see `07_KIDS_DECISION.md`).
- **No permanent discount codes.** Every code has an expiration. "Save 20% forever" erodes the price floor.

## What changes in code

### DB (see `db/01_trials_add_to_plans.md`)
- Migration to set `trial_days` on every paid `plans` row.
- Migration to update `price_cents` on the 9 `plans` rows to the Option A values.
- Migration to flip `verity` tier `ad_free = true` (see `db/02_ad_free_reconciliation.md`).
- New Stripe prices must be created in Stripe dashboard; new `stripe_price_id` values must be written into `plans` rows. **Do not overwrite the current `stripe_price_id` without first verifying the new Stripe price was created successfully — existing subscribers remain on the old price.**
- New Apple product IDs in App Store Connect with the new monthly/annual values. Apple product IDs change — cannot edit price on an existing SKU-D10/D34/D42 tier rebinding. Create new products with `_v2` suffixes; retire old ones after migration window.

### Web
- `web/src/lib/plans.js` — update `TIER_ORDER` and per-tier price metadata. This lib is imported across every paywall surface.
- `web/src/app/profile/settings/billing/page.tsx` — the billing settings view reads from `plans`. Should update automatically once DB is correct.
- `web/src/app/api/stripe/checkout/route.js` — ensure new Stripe price IDs are used.
- `web/src/components/LockModal.tsx` — paywall modal copy references tier names and prices. Verify the displayed price comes from the DB, not hardcoded.

### iOS adult
- `VerityPost/VerityPost/StoreManager.swift` — `PLAN_PRODUCTS` map must match Apple product IDs. The current productID list (`com.veritypost.verity.monthly`, etc.) stays; prices change at the Apple level, not in code.
- `VerityPost/VerityPost/SubscriptionView.swift` — reads `products` from StoreManager, displays the tier cards. No hardcoded prices to change in Swift. Verify by loading the updated products and confirming the card copy pulls from `product.displayPrice`.

### Marketing
- Every ad creative using the old $3.99 / $4.99 prices must be replaced. See `views/web_welcome_marketing.md` for the specific surfaces.

## Acceptance criteria

- [ ] `plans` table reflects Option A pricing (or Option B if escalated) — verified via `mcp__supabase__execute_sql` on `plans`.
- [ ] Every plan row has correct `trial_days` value.
- [ ] Verity tier `ad_free = true` on the `plan_features` row (see `db/02_ad_free_reconciliation.md`).
- [ ] Stripe dashboard has matching price IDs live.
- [ ] App Store Connect has matching product IDs live.
- [ ] `StoreManager.swift` loads all products without error; `SubscriptionView` shows all four paid tiers with correct prices.
- [ ] `/profile/settings/billing` displays the correct prices, trial timeline, and tier features.
- [ ] Every paywall surface (`LockModal`, regwall on `/story/[slug]`, `views/web_paywall_surfaces.md` inventory) has been visually regression-tested against the new prices.
- [ ] No ad creative or marketing copy references the old $3.99 price.
- [ ] `TASKS.md` has a T-ID that tracks this work; `DONE.md` line appended on completion.

## What this does NOT change

- The permission matrix. Plans still map to permission sets via `plan_permission_sets`.
- The feature gates. Feature access per tier is unchanged except for the Verity→ad_free flip.
- The kid subscription model. Families still cover kids under one parent subscription.
- The Stripe webhook handling. `/api/stripe/webhook` doesn't care about price values.

## Risk register

- **Stripe price edits cause subscriber disruption.** Mitigation: create new price IDs, migrate *new* signups only, let existing subscribers stay on legacy prices. A clean re-price is better than a messy forced migration.
- **Apple product ID churn confuses restore flow.** Mitigation: keep old product IDs active in StoreManager for 90 days so existing subscribers' `restorePurchases()` works. Remove from the visible catalog but keep in the resolver.
- **Price increase drops trial-to-paid.** Expected and acceptable. Monitor for 30 days before deciding whether to revert or hold.
- **Ad creative referencing old prices ships after cutover.** Mitigation: audit every ad before running the migration, not after.

## Sequencing

Ship before: any paywall rewrite (`11_PAYWALL_REWRITE.md`), because the new paywall copy references the new prices.
Ship after: nothing — this is a prerequisite.
Parallel with: `03_TRIAL_STRATEGY.md` (same DB migration can carry both).
