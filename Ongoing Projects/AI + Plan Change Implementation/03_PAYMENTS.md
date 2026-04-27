# Payments — Stripe + Apple StoreKit + reconciliation

The plan rewrite touches three payment surfaces. They have to align.

## The three surfaces

1. **Stripe (web)** — quantity-based subscriptions, native support for per-seat add-ons
2. **Apple StoreKit (iOS)** — tiered SKU subscription group, can't do per-seat metering
3. **Database (`plans`, `user_subscriptions`)** — source of truth for what each user is currently paying for

Stripe and Apple bill separately. The DB tracks what they're billed for.

---

## Plan SKU map

| Plan | Stripe product | Apple product ID | Notes |
|---|---|---|---|
| Free | (no SKU) | (no SKU) | DB row only |
| Verity monthly | `prod_verity_monthly` | `com.veritypost.verity.monthly` | $7.99/mo |
| Verity annual | `prod_verity_annual` | `com.veritypost.verity.annual` | $79.99/yr |
| Verity Family monthly — 1 kid | `prod_verity_family_monthly` (qty=1) | `com.veritypost.family.1kid.monthly` | $14.99/mo |
| Verity Family monthly — 2 kids | (qty=2) | `com.veritypost.family.2kids.monthly` | $19.98/mo (Apple); $14.99 + qty 2 add-on (Stripe) |
| Verity Family monthly — 3 kids | (qty=3) | `com.veritypost.family.3kids.monthly` | $24.97/mo |
| Verity Family monthly — 4 kids | (qty=4) | `com.veritypost.family.4kids.monthly` | $29.96/mo |
| Verity Family annual — 1 kid | `prod_verity_family_annual` (qty=1) | `com.veritypost.family.1kid.annual` | $149.99/yr |
| Verity Family annual — 2 kids | (qty=2) | `com.veritypost.family.2kids.annual` | $199.98/yr |
| Verity Family annual — 3 kids | (qty=3) | `com.veritypost.family.3kids.annual` | $249.97/yr |
| Verity Family annual — 4 kids | (qty=4) | `com.veritypost.family.4kids.annual` | $299.96/yr |
| ~~Verity Pro monthly~~ | retired | retired | Grandfathered subs only |
| ~~Verity Pro annual~~ | retired | retired | Grandfathered subs only |
| ~~Verity Family XL~~ | never shipped | never shipped | Replaced by per-kid model |

**Apple SKU count: 10 active products** (2 Verity solo + 8 Family tiers across kid counts and billing periods).
**Stripe product count: 4** (Verity monthly + annual, Family monthly + annual). Family qty handles seat scaling.

---

## Stripe setup (web)

### Products
Create 4 Stripe products:
- `Verity` (recurring, monthly + annual prices)
- `Verity Family` (recurring base, monthly + annual prices)
- `Verity Family Extra Kid` (recurring add-on, monthly + annual prices) — **separate price entries**, billed via the same Subscription as Family base

### Pricing structure
Stripe Subscription with multiple `subscription_items`:
- Item 1: Family base (qty 1, $14.99/mo or $149.99/yr)
- Item 2: Extra kid seats (qty 0-3, $4.99/mo or $49.99/yr each)

When parent adds a 2nd kid: update subscription_item 2 quantity from 0 → 1. Stripe prorates the next bill automatically.

### Webhooks to handle
- `customer.subscription.created` — initial Family signup
- `customer.subscription.updated` — seat count change OR plan change
- `customer.subscription.deleted` — cancellation
- `invoice.paid` — monthly/annual successful charge → renew access
- `invoice.payment_failed` — gate access after grace period (3 days), send email
- `customer.subscription.trial_will_end` — if you ever offer trials

### Webhook handler location
`web/src/app/api/webhooks/stripe/route.ts` (verify it exists, audit before this plan migration). On every `subscription.updated`:
1. Read the subscription's items
2. Compute `kid_seats_paid = item[Family Extra Kid].quantity`
3. Update `user_subscriptions` row with new `kid_seats_paid`
4. If new count is LOWER than current `kid_profiles WHERE is_active=true` count → flag for parent attention (don't auto-archive)

### Stripe Customer Portal
Stripe-hosted portal at `https://billing.stripe.com/...`. Surfaces:
- Cancel subscription
- Update payment method
- View invoices
- Change plan (only between plans you whitelist)

**For Family seats:** keep portal disabled for plan changes. Force seat changes through your in-app UI. Reason: portal can't enforce "you have 3 kids, can't drop to 1 seat" gating.

---

## Apple StoreKit setup (iOS)

### Subscription group
One subscription group: `Verity Subscriptions`

Products in the group (10 active SKUs from the table above), arranged in upgrade levels:
- Level 1: Verity solo monthly + annual
- Level 2: Family 1-kid monthly + annual
- Level 3: Family 2-kid
- Level 4: Family 3-kid
- Level 5: Family 4-kid

Apple handles upgrade/downgrade prorations automatically within a subscription group. Crossgrade (monthly ↔ annual) within the same level is also auto-prorated.

### Apple Small Business Program

**APPLY BEFORE LAUNCH.** 15% commission instead of 30%. Eligibility: <$1M annual proceeds in App Store earnings. You qualify. Application is via App Store Connect. Approval can take a few business days.

### iOS payment flow
1. User picks plan in `SubscriptionView.swift`
2. App calls `StoreManager.purchase(productID)`
3. Apple handles auth, payment, receipt
4. App receives transaction → posts receipt to `web/src/app/api/payments/apple/verify/route.ts`
5. Server validates receipt with Apple, updates `user_subscriptions`
6. Subscription auto-renews via Apple. Server receives `App Store Server Notifications V2` for renewals + cancellations

### Server-side notification handler
`web/src/app/api/webhooks/apple/route.ts`:
- `SUBSCRIBED` — initial purchase or upgrade
- `DID_RENEW` — auto-renewal
- `EXPIRED` — sub ended
- `DID_FAIL_TO_RENEW` — billing retry; don't gate immediately, give grace
- `REFUND` — Apple refunded; revoke access immediately
- `PRICE_INCREASE_CONSENT_RAISED` / `_AGREED` — parent must consent to price change

### iOS seat changes
**Add a kid:** call `StoreManager.upgrade(toFamilyTier: currentKids + 1)` — Apple shifts the subscription to a higher SKU mid-billing-cycle. Parent gets prorated charge.

**Remove a kid:** call `StoreManager.downgrade(toFamilyTier: currentKids - 1)` — Apple shifts to lower SKU at the END of the current billing cycle. Parent doesn't get refund mid-cycle (Apple policy); next cycle is at the lower price.

**Graduation:** kid seat frees up. If on Family-2kid SKU and kid graduates to leave Family-1kid: schedule a downgrade to Family-1kid SKU at next renewal. Show parent: "Your bill drops to $14.99/mo at next renewal."

---

## Cross-platform conflict policy

### Rule: one subscription per household, on the platform that started it

If user has Stripe sub and tries to subscribe via iOS:
- iOS app checks `user_subscriptions.platform` before showing paywall
- If platform = `'stripe'`: paywall shows "You have an active Verity subscription on web. Manage it at veritypost.com/profile/billing" (with deep link). No purchase button.
- If platform = `'apple'`: paywall shows the Apple subscription products as normal.

If user has Apple sub and tries to subscribe via web:
- Web paywall checks `user_subscriptions.platform`
- If platform = `'apple'`: paywall shows "You have an active Verity subscription on iOS. Manage it in App Store settings." No purchase button.

### Edge case: dual sub (already happened)
If somehow a user has both:
1. Server detects on next webhook
2. Both subscriptions allowed to remain active (no auto-cancel — that's destructive)
3. Banner shown to user: "We detected duplicate subscriptions. Choose which to keep."
4. User picks; we cancel the other via the appropriate API
5. Account gets the union of features (always upgrade-favoring during the resolution period)

---

## Plan transitions — every flow

### Free → Verity (web)
1. User clicks "Subscribe" on paywall
2. Stripe Checkout session created, `mode='subscription'`, line items: Verity monthly or annual
3. User completes checkout
4. Webhook `subscription.created` → write `user_subscriptions` row, `platform='stripe'`, `plan='verity'`
5. Access flips on next page load (or via session refresh)

### Free → Verity (iOS)
1. User taps "Subscribe" in `SubscriptionView`
2. `StoreManager.purchase('com.veritypost.verity.monthly')`
3. Apple sandbox/prod payment sheet
4. Receipt posted to server, validated, `user_subscriptions` written, `platform='apple'`
5. App refreshes subscription state

### Verity → Family (web)
1. User on Verity, clicks "Upgrade to Family"
2. Web shows "Add 1 kid: $14.99/mo. Add up to 4 kids."
3. Parent enters first kid info (display name, DOB)
4. Stripe creates **new** subscription (or updates existing one — depends on Stripe arch). Family base + 0 extra kid items initially. Cancel Verity sub at end of cycle.
5. Webhook flow as above

### Verity → Family (iOS)
1. User on Verity, taps "Upgrade to Family" in subscription view
2. `StoreManager.upgrade(toProduct: 'com.veritypost.family.1kid.monthly')`
3. Apple handles the within-group upgrade (cancels Verity, starts Family, prorates)
4. Server receives upgrade notification, updates `user_subscriptions`, deletes old row, creates new

### Family with N kids → Family with N+1 kids
**Web (Stripe):**
1. Parent adds kid in family settings
2. Server-side: increment `subscription_items[ExtraKid].quantity`
3. Stripe responds with prorated invoice immediately
4. Parent sees: "Bill increases by $4.99/mo. Prorated charge today: $X."

**iOS (Apple):**
1. Parent taps "Add another kid"
2. App shows confirmation: "Adds $4.99/mo to your subscription"
3. `StoreManager.upgrade(toProduct: 'com.veritypost.family.{N+1}kids.monthly')`
4. Apple handles upgrade within subscription group, prorates charge

### Family with N kids → Family with N-1 kids (kid removed by parent or graduated)
**Web (Stripe):**
1. Decrement `subscription_items[ExtraKid].quantity`
2. Stripe applies credit OR reduces next bill. (Configurable — best practice: reduce next bill, no immediate refund.)

**iOS (Apple):**
1. `StoreManager.downgrade(toProduct: 'com.veritypost.family.{N-1}kids.monthly')`
2. Apple schedules downgrade for next renewal (Apple policy — no mid-cycle downgrades)
3. Parent sees: "Your bill drops to $X at your next renewal on [date]"

### Family → Verity (downgrade — has kids)
**Gated.** Hard stop with messaging:
> "You have N kid profiles on your Family plan. Remove them before downgrading. Removing a kid permanently deletes their reading history and progress."

User must remove kids one at a time. Then Family → Verity is allowed.

### Family → Verity (no kids)
1. `StoreManager.downgrade(toProduct: 'com.veritypost.verity.monthly')` (iOS) or Stripe subscription update (web)
2. Effective at next renewal

### Verity → Free (cancel)
1. User clicks Cancel
2. **Web:** redirect to Stripe Customer Portal cancel flow
3. **iOS:** redirect to App Store subscription management
4. On webhook (`subscription.deleted` / `EXPIRED`): flip access to Free at end of paid period
5. Bookmarks etc. preserved (free tier still has them, just metered)

### Verity Pro grandfather → Verity (auto, optional)
**Owner decision pending.** Two paths:

**Option A: leave them on Pro forever, locked at original price.**
- `verity_pro_*` plans stay in DB with `is_visible=false, is_active=false` (so new signups can't pick), but existing `user_subscriptions` rows pointing at them keep working
- Stripe billing continues at original prices
- Grandfathered users see "You're on Verity Pro (legacy)" in their billing page
- They can upgrade to Family or downgrade to Free, but cannot re-subscribe to Pro if they cancel

**Option B: auto-migrate on next renewal.**
- Notify Pro subscribers 30 days before next renewal: "Verity Pro is now Verity (same features, $7.99/mo)"
- On next renewal, Stripe subscription updates to Verity SKU automatically
- Subscriber pays less ($7.99 vs $9.99). Strong customer-trust signal. Modest revenue hit.

**LOCKED 2026-04-26: Option B (auto-migrate).** Stripe Pro subs auto-shift to Verity SKU at next renewal. 30-day notification email pre-renewal. Apple Pro subs get in-app banner asking them to manually switch (Apple StoreKit doesn't support programmatic plan-switch the same way; manual conversion is the cleanest path). Loss is small, gain is one less SKU to maintain.

---

## DB tables touched

- `plans` — M3 updates prices, marks Pro inactive, adds Family annual
- `user_subscriptions` (or whatever the actual sub-tracking table is named — verify in schema):
  - Add `platform TEXT NOT NULL CHECK (platform IN ('stripe', 'apple'))`
  - Add `kid_seats_paid INTEGER NOT NULL DEFAULT 1`
  - Add `external_subscription_id TEXT` (Stripe subscription ID or Apple original_transaction_id)
  - Add `next_renewal_at TIMESTAMPTZ`
  - Add `payment_method_last4 TEXT` (for billing UI display)

## Permission gating by plan

Permission system already exists (`compute_effective_perms`). Add plan-tier gating:

| Permission | Free | Verity | Family |
|---|---|---|---|
| `articles.read.unlimited` | ❌ (metered) | ✓ | ✓ |
| `articles.bookmark.create` | ❌ | ✓ | ✓ |
| `comments.create` | ❌ (verified ✓ for read) | ✓ | ✓ |
| `family.kids.manage` | ❌ | ❌ | ✓ |
| `family.weekly_report.view` | ❌ | ❌ | ✓ |
| `kids.app.access` | ❌ | ❌ | ✓ (per kid seat owned) |

Plan tier check happens via `users.current_plan_tier` (denormalized from active subscription) feeding into `compute_effective_perms`. Single source of truth.

---

## Promotional considerations

### Trials
Both Stripe and Apple support free trials at the plan level.
- Verity solo: 7-day free trial reasonable
- Family: 7-day free trial reasonable
- Extra kid seats: no trial (already amortized into Family base trial)

Trials show as `trialing` status; convert to `active` after trial period. Cancel during trial → no charge.

### Promo codes
Stripe has native promo code support. Apple has Promotional Offers API (more complex). For launch, only support Stripe promo codes (web users); skip iOS promos until you have a real campaign.

### Family upgrade incentive
At the cap (4 kids on Family), no further upsell. Gracefully cap.
At the kid limit (1 kid included, parent tries to add 2nd): show "Add another kid: $4.99/mo more" — natural upsell, not a hard wall.

---

## Tax handling

Stripe Tax + Apple Tax both auto-handle US sales tax + EU VAT.
- Stripe: enable Stripe Tax, Stripe collects + remits
- Apple: Apple handles tax via App Store, no action required from you

For both: collect customer billing address at checkout (already standard). Tax is an extra line item on invoices, not a price change.

---

## Refund policy

- **Apple:** all refunds go through Apple Support. You can't refund directly. Server gets `REFUND` notification, revokes access.
- **Stripe:** support can issue full or partial refunds via Stripe Dashboard. Revoke access via webhook on `charge.refunded`.

**Recommended policy:**
- Cancel anytime, no refund (sub continues until end of paid period)
- Mid-cycle plan changes prorate automatically (Stripe + Apple both handle this)
- Accidental seat additions (within 7 days of add): support can issue partial refund on Stripe; Apple users redirected to Apple Support
- No refund for kid graduation / removal (sub bill drops at next renewal — that's the refund equivalent)

---

## Audit trail

Every payment event writes to a `billing_events` table:
- `event_type` (subscribed | renewed | upgraded | downgraded | refunded | cancelled | seat_changed)
- `user_id`
- `plan_before`, `plan_after`, `seats_before`, `seats_after`
- `amount_cents`, `currency`
- `platform` (stripe | apple)
- `external_event_id` (webhook event ID for idempotency)
- `created_at`

Lets you reconstruct any user's billing history. Required for support investigations + tax reporting + churn analysis.

---

## Open decisions

1. ~~**Verity Pro grandfather: Option A or Option B?**~~ **LOCKED 2026-04-26: Option B (auto-migrate).**
2. **Trial period at launch?** Recommendation: 7-day free trial on Verity + Family.
3. **Stripe Customer Portal:** enable plan changes (limited to whitelist) or disable entirely?
4. **AdMob (iOS) revenue split with Apple — confirm rates** for adult Free iOS users.
