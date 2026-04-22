# 03 — Trial Strategy

**Owner:** Sutherland (behavioral lead — this is a trust-and-pricing psychology problem), Lessin (business model sanity), Wroblewski (UX on the timeline).
**Depends on:** `00_CHARTER.md`, `02_PRICING_RESET.md`.
**Affects:** `plans` table, `/api/stripe/checkout`, Stripe checkout session config, `SubscriptionView.swift` + `StoreManager.swift`, every paywall surface copy, `/profile/settings/billing`.

---

## Current state (verified 2026-04-21)

**There are no trials.** `plans.trial_days = 0` on every row in Supabase. Prior session marketing materials and mockups reference a "7-day free trial" that doesn't exist in production.

`StoreManager.swift` does not implement Apple-side trial introductory offers. `/api/stripe/checkout` does not pass `subscription_data.trial_period_days`. The onboarding flow has no trial state. This is not a half-finished implementation — it is absent entirely.

## Why this matters

Sutherland: "A reader who hasn't hit the paywall doesn't understand what they're paying for. The quiz gate, the dated front page, the kids wing — these are all experienced products. A pre-experience paywall converts at maybe 1–3%. A post-experience paywall converts at 25–40%. The trial is the cheapest conversion lift available."

Lessin: "Also — a paywall in the wild without a trial is a trust signal in the wrong direction. The reader thinks: 'why are they so scared of me sampling this?' A confident product gives you a week."

## The trial spec

### Duration and defaults

| plan | monthly trial_days | annual trial_days |
|---|---|---|
| verity | 7 | 14 |
| verity_pro | 7 | 14 |
| verity_family | 7 | 14 |
| verity_family_xl | 7 | 14 |

Annual trials are longer because the decision is more significant and the visible "charge on day X" timeline must give the reader room to cancel without feeling trapped.

### Card upfront, no exceptions

Every trial requires a credit card at the time of signup. No free-trial-without-card. Sutherland and Lessin were unanimous here — free trials without card requirements convert at 3–5%, with cards at 25–40%, and the readers who won't commit a card weren't going to convert anyway.

### The visible timeline

Every paywall surface that offers the trial must show the three-point timeline next to the CTA:

- **Today** — Full access starts immediately.
- **Day 5** — Reminder email arrives. You can cancel in one tap.
- **Day 7** — $X.XX/mo begins unless cancelled.

This is Headspace's model and it is the single highest-leverage conversion lift in modern consumer subscription UX. The transparency is the product. It converts *higher* than a hidden trial, not lower, because readers who are worried about being surprise-charged are the ones most likely to abandon at the CTA.

Annual trial timeline uses the same shape:

- **Today** — Full access starts immediately.
- **Day 10** — Reminder email arrives.
- **Day 14** — $X.XX/yr begins unless cancelled.

### The Day 5 / Day 10 email

Not a generic "trial ending" email. Three beats:

1. **What you read.** "You read [X] articles this week, passed [Y] quizzes, commented on [Z] threads." Concrete, honest, personal.
2. **What's next.** "Your trial ends in 2 days. If you do nothing, you'll be charged $6.99 on [date]."
3. **One-tap cancel.** A single prominent link that cancels in one click. No login wall, no "are you sure" flow. The one-click cancel is what makes the reader trust the trial enough to start it.

The email is warm, honest, and short. Not a sales pitch. The sales pitch was the previous week of actually using the product.

### Reader-initiated cancel during trial

Every trial state exposes a prominent "Cancel trial" button in `/profile/settings/billing` and in the iOS SubscriptionView. Canceling before day 5 reminder gets a different copy than canceling after:

- **Before Day 5:** "Trial cancelled. You have [X] days of access remaining." No guilt. No win-back modal. Respect the decision.
- **After Day 5 (they've used the reminder):** Same copy. Still no guilt.
- **After conversion charged:** standard "Your subscription is active until [next billing date]" with a one-tap cancel that honors the already-paid period.

### What "cancel" means on each platform

- **Web / Stripe:** calling `/api/billing/cancel` sets `cancel_at_period_end = true` in Stripe. Access continues until period end. After period end, the subscription is canceled in Stripe and our `subscriptions.status` flips to `canceled`.
- **iOS / StoreKit:** "Cancel" deep-links to `https://apps.apple.com/account/subscriptions` because only Apple can cancel Apple subscriptions. Our UI must not pretend otherwise. A clear inline message: "iOS subscriptions are managed by Apple. We'll open your Apple subscription settings now." Then deep-link.

This platform split is a known source of confusion. Address it in copy, don't hide it.

## Abuse prevention

Free trials are attractive to abusers. The panel flagged three specific risks:

1. **Multi-account trial chaining.** Same credit card, different accounts, reset trial each time. Mitigation: `stripe_customer_id` keyed by payment method fingerprint — Stripe tracks this natively with `radar`. Also check `users.email` domain + IP signals for chain detection.
2. **Family plan trial abuse.** Buy family trial, pair all kid profiles, cancel before Day 7, keep going with free articles. Mitigation: kid profiles created during trial get flagged — if trial cancels, kid access goes with it. `kid_profiles` already tracks `parent_user_id` so this is a WHERE clause, not a new table.
3. **Apple-side trial abuse.** Introductory offers in App Store Connect — Apple only lets a user trial each product once per Apple ID. Use the `isEligibleForIntroOffer` API to check before showing the "Start free trial" CTA on iOS. Readers who've trialed before see "$6.99/mo" instead of "7-day free trial."

## What this looks like in code

### DB (see `db/01_trials_add_to_plans.md`)

```sql
UPDATE plans SET trial_days = 7 WHERE tier IN ('verity','verity_pro','verity_family','verity_family_xl') AND period = 'month';
UPDATE plans SET trial_days = 14 WHERE tier IN ('verity','verity_pro','verity_family','verity_family_xl') AND period = 'year';
```

### Web — `/api/stripe/checkout/route.js`

Pass `subscription_data.trial_period_days` when creating the checkout session:

```javascript
const session = await stripe.checkout.sessions.create({
  // ...
  subscription_data: {
    trial_period_days: plan.trial_days,
    trial_settings: {
      end_behavior: { missing_payment_method: 'cancel' },
    },
  },
  payment_method_collection: 'always', // card upfront
});
```

### Web — `/profile/settings/billing/page.tsx`

Reads `subscriptions.trial_end` from Supabase. Displays:

- If `trial_end > now()`: trial timeline with days remaining.
- Otherwise: standard "Active subscription" state.

### iOS — `StoreManager.swift`

Apple handles intro offers via App Store Connect config, not code. Add an `isEligibleForIntroOffer(product:)` helper that reads `product.subscription.introductoryOffer?.paymentMode == .freeTrial` and the eligibility check from `Product.SubscriptionInfo.Status`. If eligible, CTA says "Start 7-day free trial." If not, CTA says "$6.99/mo — start now."

### iOS — `SubscriptionView.swift`

New copy block above each plan card when trial is available:

```
[ Today ]      Full access starts immediately
[ Day 5 ]      Reminder email — cancel anytime
[ Day 7 ]      $6.99/mo begins unless cancelled
```

Style matches the web implementation. Same three dots, same two-line format per row. See `views/ios_adult_subscription.md`.

### Email — `email_templates` table

Two new templates: `trial_reminder_monthly` (fires Day 5) and `trial_reminder_annual` (fires Day 10). Template variables: `article_count`, `quiz_count`, `comment_count`, `days_remaining`, `cancel_url`, `charge_date`, `charge_amount_formatted`.

### Cron — `/api/cron/send-emails/route.js`

Add a selector that finds subscriptions with `trial_end BETWEEN now() + interval '1 day' AND now() + interval '3 days'` that haven't yet been emailed. Send the reminder. Mark as sent in a `trial_reminder_sent_at` column on `subscriptions` (new column — small migration).

## Edge cases

### Trial conversion fails

Day 7 arrives, Stripe tries to charge, card declines. Stripe auto-retries 4 times over 3 weeks. During that window:

- `subscriptions.status = 'past_due'`. Access continues (Stripe's grace default).
- Day 3 of grace: email "we couldn't charge your card — update payment method" with a one-tap link.
- Day 21 of grace: if still failing, `subscriptions.status = 'unpaid'`, access downgrades to Free tier, user notified.

Current `subscriptions` table supports these states. Cron job at `/api/cron/subscription-dunning` (does not exist yet — flag as follow-up task) handles the lifecycle.

### Trial canceled before Day 7

Stripe subscription enters `canceled` state. Access continues through `current_period_end` (the original day-7 cutoff). After that, user is Free tier. No punitive dark pattern.

### Re-trial attempts

A user who trialed once cannot trial again. Enforce via:

- Stripe's `trial_end` history per customer (Stripe enforces this natively if you set `subscription_data.trial_from_plan = false` and track intent manually — check Stripe docs for exact param).
- Our own `users.has_used_trial = true` flag (new column — small migration).
- Apple's native `isEligibleForIntroOffer` on iOS.

The checkout route must enforce all three and refuse to create a trial subscription for an ineligible user. Show them the "Start for $6.99/mo" CTA instead.

## What this does NOT include

- Paywall copy rewrite — that's in `11_PAYWALL_REWRITE.md`.
- Pricing change — that's in `02_PRICING_RESET.md`.
- Per-article metering (free article count) — already exists, untouched by this change.
- In-app cancellation for iOS — platform-limited, must deep-link to Apple.
- Winback offers ("come back for 50% off") — explicitly excluded. We don't discount-beg. Readers who leave leave.

## Acceptance criteria

- [ ] Every paid plan row has non-zero `trial_days`.
- [ ] Stripe Checkout sessions pass `trial_period_days` from the plan.
- [ ] iOS `Product.subscription.introductoryOffer` configured in App Store Connect per product; app reads it correctly.
- [ ] Trial timeline component renders on every paywall surface (LockModal, `/profile/settings/billing`, iOS SubscriptionView) with real plan-derived text.
- [ ] Day 5 / Day 10 reminder email template exists, cron selects correctly, mail sends on a test subscription.
- [ ] Cancel flow tested on web (Stripe billing portal or custom cancel endpoint) and iOS (deep-link to Apple).
- [ ] Re-trial prevention works: a user who trialed once and let it convert/cancel sees the "no trial" CTA on their next attempt.
- [ ] Trial abuse tested against the three vectors in the abuse prevention section.
- [ ] Day 7 charge on a real test subscription produces the expected DB state and email.

## Risk register

- **Day 5 reminder email feels spammy.** Mitigation: write it with warmth (see spec above). A/B not needed — just ship the right copy the first time.
- **Users trial on web, then try to trial again on iOS.** Mitigation: `has_used_trial` column on `users`, not just Stripe / Apple checks. Cross-platform trial eligibility is our problem, not Apple's.
- **Card decline during trial convert creates a support ticket flood.** Mitigation: dunning cron with staged emails. See follow-up task for `/api/cron/subscription-dunning`.
- **Apple review flags the trial flow.** Unlikely — this is a standard model. But have the reviewer notes ready in App Store Connect submission.

## Sequencing

Ship after: `02_PRICING_RESET.md` (prices must be correct before trials are offered on them).
Ship before: `11_PAYWALL_REWRITE.md` (paywall copy references the trial timeline).
Pairs with: `19_MEASUREMENT.md` (trial-to-paid conversion is a primary metric).
