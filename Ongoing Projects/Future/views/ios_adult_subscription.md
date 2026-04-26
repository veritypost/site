# iOS Adult — Subscription / Pricing

**Files:** `VerityPost/VerityPost/SubscriptionView.swift`, `VerityPost/VerityPost/StoreManager.swift`.
**Owner:** Wroblewski (UX), Lessin (conversion discipline), Sutherland (trial timeline).
**Depends on:** `02_PRICING_RESET.md`, `03_TRIAL_STRATEGY.md`, `11_PAYWALL_REWRITE.md`, `16_ACCESSIBILITY.md`.

---

## Current state

Per recon:
- 5 plan cards (free + 4 paid tiers), monthly/annual toggle, promo code field, Restore Purchases, Manage Subscription link.
- StoreKit 2 products load from App Store Connect.
- `appAccountToken` stamped with Supabase UUID on purchase for attribution.
- Subscription sync to `/api/ios/subscriptions/sync`.
- `vpSubscriptionDidChange` notification posted on success.

**Critical issue flagged:** silent "Loading..." state if products fail to load — infinite spinner, no fallback. This is regulatory-adjacent per earlier FTC-dark-patterns concern.

## What changes

### 1. Explicit failure UI (week 1, ship standalone)

Replace infinite "Loading..." with:

```
We can't load plans right now.

[ Try again ]
[ Contact support ]
```

Tapping Try again triggers `StoreManager.loadProducts()` again with a backoff limiter (3 attempts, 2s/5s/10s). Contact support opens a mailto or in-app support sheet.

Ship this first. Highest priority in `18_ROADMAP.md` Phase 1.

### 2. Updated prices (per `02_PRICING_RESET.md`)

Product IDs in App Store Connect are updated to new prices. `StoreManager` reads product prices from the store — no hardcoded values in code.

Verify:
- Verity: $6.99/mo, $59.99/yr
- Verity Pro: $12.99/mo, $119.99/yr
- Family: $19.99/mo, $179.99/yr
- Family XL: $29.99/mo, $279.99/yr

(Option A per `02_PRICING_RESET.md`; adjust if owner committed Option B.)

### 3. Trial timeline (per `03_TRIAL_STRATEGY.md`)

Each plan card shows:

```
Today      Full access starts immediately
Day 5      Reminder email — cancel anytime
Day 7      $6.99/mo begins unless cancelled
```

Rendered from `product.subscription.introductoryOffer?.paymentMode == .freeTrial`. If no intro offer (user already trialed), show "Start now — $6.99/mo".

### 4. Invitation voice (per `11_PAYWALL_REWRITE.md`)

Plan card headers + body use the invitation template:

```
Verity

Ad-free reading, unlimited bookmarks, the investigations desk.

[ Timeline ]

[ Start 7-day free trial ]
```

No "upgrade to unlock" language anywhere.

### 5. Manage subscription

Apple's limitation: iOS subs can only be canceled via App Store. The "Manage Subscription" link deep-links to `https://apps.apple.com/account/subscriptions`. Clear copy:

```
To cancel or change your plan, open Apple Subscription Settings.

[ Open Apple Subscriptions ]
```

### 6. Restore Purchases

Keep. Ensure it works after product ID changes (keep old product IDs active in `StoreManager.PLAN_PRODUCTS` for 90 days post-cutover).

### 7. Promo codes

Existing flow. Validate code → apply → purchase. Error handling for expired/limit-hit codes.

## Files

- `VerityPost/VerityPost/SubscriptionView.swift` — failure UI, timeline, invitation copy.
- `VerityPost/VerityPost/StoreManager.swift` — retry limiter, price-display read from Product.
- `VerityPost/VerityPost/Views/TrialTimeline.swift` — new shared component (mirrors web).
- `VerityPost/VerityPost/Paywalls.swift` — copy strings.

## Acceptance criteria

- [ ] Infinite loading state eliminated; explicit failure UI with Try again + Contact support.
- [ ] Plan cards display prices matching `plans` table.
- [ ] Trial timeline rendered on cards where intro offer is eligible.
- [ ] "Already trialed" users see direct-start price, not trial copy.
- [ ] Invitation voice across all copy.
- [ ] Manage subscription deep-links correctly.
- [ ] Restore purchases works after product ID migration.
- [ ] Promo codes work.
- [ ] `.success` haptic on successful purchase.
- [ ] Accessibility: VoiceOver announces plan details.

## Dependencies

Ship first: the failure UI (Phase 1 week 1 priority).
Ship after `02_PRICING_RESET.md`, `03_TRIAL_STRATEGY.md` for the full rewrite.
