# Session 4 — Billing + iOS Bridge

**You are the architect for this session.** Fresh conversation. Read this doc, then `/Users/veritypost/Desktop/verity-post/REVIEW_REPORT.md` (top synthesis + `## PM-5 — Billing-and-iOS-Bridge` + `## PM-10 — Cross-Platform-Parity` billing items + `## PM-11 — Adversary-Sweep` billing items), then start.

## Prerequisite

Sessions 1, 2, 3 marked complete.

## Why this session is elevated-care

Payments. Real money. Adversary pass mandatory.

## Mandatory reads

1. `REVIEW_REPORT.md` — PM-5 + PM-10 + PM-11 billing items.
2. `/Users/veritypost/Desktop/CLAUDE.md` — kill-switch row #5 (`manageSubscriptionsEnabled`).
3. Owner memory:
   - `feedback_genuine_fixes_not_patches.md`.
   - `feedback_cross_platform_consistency.md` — every change must cover web + iOS-adult; iOS-kids has no billing surface so state N/A.
   - `feedback_no_user_facing_timelines.md`.
   - `feedback_4pre_2post_ship_pattern.md` — adversary on payment slices.

## Locked decisions (from owner, 2026-05-03)

- **Q06 Apple/Stripe conflict UX:** Option A — hard-block 409 with `code` + `manage_url`. Build shared helper `getActiveCrossPlatformSub(service, userId, expectedPlatform)` in `web/src/lib/billingPlatformGuard.ts`. Call from all 4 web billing routes (stripe/checkout, billing/change-plan, billing/resubscribe, billing/cancel) and from `/api/ios/subscriptions/sync`. Default sub-decisions:
  - Include `pricing/page.tsx` server-side prefetch to swap CTAs pre-flight (gentler UX), in addition to the 409 backstop.
  - iOS conflict sheet primary CTA: **"Open Verity Post billing"** (web cancel); secondary: **"Request refund from Apple"** (`https://reportaproblem.apple.com`).
  - For `stripe_sub_active` 409: iOS calls `transaction.finish()` (not the existing C18 retry-on-launch path) and presents the conflict sheet.
  - `BillingCard.tsx` is unchanged (already platform-branches at line 415).
- **Q07 Pricing source of truth:** Option B (build-time fetch from DB with `revalidate: 300`) + shared `web/src/lib/pricingCopy.ts` fallback constants. **Solo Verity SKU = $7.99/mo** — owner picked. Reconcile DB: insert/activate a `verity_monthly` plan row at `price_cents = 799`, mint a fresh Stripe price (price ID into `stripe_price_id`), set `is_active = true` and `is_visible = true`. Annual variant: pick a number and add a `verity_annual` row consistent with the family-tier ratio (defer if owner doesn't want both today; flag to owner). Surfaces to refactor: `/pricing`, `/messages` paywall, `/help` (already does this — align fallbacks), `BillingCard.tsx` (fix the `monthly_price_cents`/`annual_price_cents` bug → query `price_cents` + `billing_period`). iOS: switch `SubscriptionView.swift:88-149,472-481` legal disclosures to read `Product.displayPrice`; keep `priceCentsForProduct` fallback unchanged.

## Scope

### P0 (must close)
1. **PM-5 / Q06** — Cross-platform double-billing path. Fix per Q06 above.
2. **PM-5** — `change-plan` silently un-cancels a scheduled cancellation. `web/src/lib/stripe.js:150` hardcodes `cancel_at_period_end: 'false'`; route doesn't check existing state. Fix: change-plan must preserve cancel-at-period-end; if user explicitly opts to un-cancel, that's a separate flow.

### P1 (close all)
- **PM-5** — iOS sync grants plan via RPC before writing the subscriptions row, no transaction.
- **PM-5** — BillingCard retry loop is closure-stale + sets state from cleanup.
- **PM-5** — Webhook `handleSubscriptionUpdated` early-returns at line 638 when cancel + grace coincide, skipping a same-event price change.
- **PM-5** — `handleChargeRefunded` parses `settings.value === 'true'` as string (silent fail-open if column type changes).
- **PM-5 / Q07 — HIDDEN P0** — Pricing page sells `verity_monthly` which doesn't exist in DB (every paid web checkout 404s). Reconcile DB to $7.99 per Q07; ship Option B (DB-backed ISR). Also fixes the `BillingCard.tsx` `monthly_price_cents` schema bug (column is `price_cents`).
- **PM-10 / Q07** — `/messages` paywall hardcoded `$3.99/mo` while pricing page uses different number. Bundle with Q07 pricing source-of-truth fix.
- **PM-10** — iOS `planName(for:)` uses substring contains-match (matches future `verity_lite` SKU incorrectly).
- **PM-10** — Trial duration has no canonical source.
- **PM-10** — Sandbox vs Production env-gate exists iOS-side but not on Stripe (`sk_test_` vs `sk_live_`).
- **PM-11** — Apple Server-to-Server out-of-order delivery can reactivate refunded subs. Add an event-ordering guard (compare `signedDate` / `originalTransactionId` + status).

### Out of scope
- Pricing UI redesign — fix the source-of-truth, not the layout.
- Pro grandfather card (P2 — defer to Session 5 or owner decision).
- iOS plan-name brittleness fix can land here OR Session 5; pick wherever it bundles cleanest with what else is touching Swift.

## Kill-switch coordination

**Q12c locked:** `manageSubscriptionsEnabled` flips to `false` at `AlertsView.swift:340`. Handlers stay as stubs. Update CLAUDE.md kill-switch row 5 line number `305 → 340`. Real implementation (category Add at minimum) is post-launch. Owned by Session 5 (iOS bundling); listed here for coordination.

## Orchestration

| PM | Owns |
|---|---|
| **PM-A: Cross-platform precheck shared helper (Q06)** | P0 #1. Build `billingPlatformGuard.ts` helper, call from 5 sites, integration-test web + iOS sync paths. Add iOS conflict sheet + notification in StoreManager + SubscriptionView per Q06 sub-decisions. |
| **PM-B: Cancel-state correctness** | P0 #2 + webhook early-return P1 + handleChargeRefunded type fix. The "what is the truth about cancel/grace state" cluster. |
| **PM-C: Pricing source-of-truth (Q07)** | Reconcile DB to $7.99 verity_monthly; build `pricingCopy.ts` fallback constants; refactor `/pricing`, `/messages`, `BillingCard` to read from DB; add `revalidate: 300`. iOS: switch legal disclosures to `Product.displayPrice`. |
| **PM-D: iOS sync transaction + Apple S2S ordering** | iOS RPC-before-row-write fix + Apple ordering guard (PM-11 finding). |

Each PM dispatches Explore + bug-hunter-security + bug-hunter-flow + adversary subagents.

## Verification gates

1. **Pre-impl** — verify each finding against current code (Stripe webhook handlers, iOS `StoreManager.swift`, all 5 cited routes).
2. **Implementation** — DB migration for any plans-table reshape; route changes; iOS Swift updates if applicable.
3. **Build-verifier** — type-check, lint, sentinel grep, iOS Xcode build (`cd VerityPost && xcodebuild` or whatever the project uses; check `project.yml`).
4. **Smoke-tester** — Stripe test mode: checkout → cancel → resubscribe → change-plan; Apple StoreKit sandbox: purchase → refund → renewal. Confirm no double-billing path.
5. **Independent reviewer** — fresh agent reads diff + confirms each finding closed.
6. **Adversary** (mandatory) — webhook idempotency, event ordering, signature verification, refund-reactivation, sandbox/prod cross-contamination.

## Done definition

- 2 P0s + ~10 P1s closed or refuted.
- All 6 gates pass; adversary returns no new payment-path holes.
- `## Status` block appended.
- REVIEW_REPORT.md: each closed finding gets `> CLOSED in Session 4 — commit <hash>`.

## Status

(append final status block here)
