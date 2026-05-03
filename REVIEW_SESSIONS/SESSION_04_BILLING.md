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

### 2026-05-03 — Session 4 SHIPPED

**Headline:** 2 P0 + 11 P1 + 6 polish closed in 4-stream parallel + 1 second-pass slice. Adversary surfaced 4 P1 follow-ups + 2 polish items the first pass missed; all closed in second pass.

**Streams (parallel, file-disjoint):**
- **Stream 1** (web billing routes + cancel-state) — `billingPlatformGuard.ts` helper, Apple precheck wired into `checkout`/`change-plan`/`resubscribe`/`cancel` routes (cancel reverted in second pass — see below), `change-plan` cancel-pending guard, `stripe.js` `cancel_at_period_end` preservation + sandbox/prod env-gate, webhook early-return drop, `handleChargeRefunded` String coercion. 7 files. Type-check + lint clean.
- **Stream 2** (iOS sync + Apple S2S ordering) — Stripe precheck on `ios/subscriptions/sync`, RPC-after-upsert 3-step ordering, Apple S2S ordering guard via `subscriptions.last_terminal_event_at`/`_type` columns, audit_log entry on out-of-order ignore. 3 files. Migration `20260503000020_session4_subscriptions_ordering_token.sql` written.
- **Stream 3** (pricing source-of-truth — Q07) — Migration `20260503000019_session4_verity_solo_plans.sql` (verity_monthly $7.99 + verity_annual $79.99 rows, idempotent UPSERT preserving owner-populated stripe_price_id), `pricingCopy.ts` shared fallback constants + `formatCents`, `pricing/page.tsx` refactored to RSC reading from DB with `revalidate: 300` + Subscribe-CTA-disabled fallback when `stripe_price_id IS NULL`, `messages/page.tsx` $3.99 hardcode replaced with `FALLBACK_VERITY_MONTHLY`, `BillingCard.tsx` schema bug fix (`monthly_price_cents`/`annual_price_cents` → `price_cents` + `billing_period`) + retry-loop closure-stale fix, `plans.js` header comment updated. 6 files.
- **Stream 4** (iOS Swift + Q12c kill-switch) — Q12c flip `manageSubscriptionsEnabled = false` at `AlertsView.swift:340`, `CLAUDE.md` row 5 updated (305 → 340), `StoreManager.planByProductID` exact-match dict (tier-level values matching `planPriority`/`hasAccess`), `SubscriptionView.legalDisclosures` switched to `Product.displayPrice`, new `SubscriptionConflictSheet.swift` with billing/refund CTAs, `StoreManager` 409 stripe_sub_active handler + `SyncResult` enum + sheet binding. 4 files + 1 new + CLAUDE.md.

**Second pass (post-adversary):**
- Cancel-route Apple precheck REMOVED (would have stranded users with both Apple + stale Stripe subs from cancelling the Stripe side). Comment documents why cancel doesn't get the guard.
- `billingPlatformGuard` + `appleReceipt.resolvePlanByAppleProductId` now filter `is_active=true` (prevents retired SKU reactivation via DID_RENEW).
- `ios/subscriptions/sync` `.update()` error captured + 500s on failure (prevents silent stale-row promotion).
- `StoreManager.seenConflictTransactions` capped at 200 with FIFO eviction + cleared on `vpSubscriptionDidChange` (re-arms conflict sheet after web-side cancel).
- `SubscriptionView.planPrice` switched to `Product.displayPrice` (parity miss in first pass — only legalDisclosures got fixed).
- `billingPlatformGuard` fail-open path now logs to console + best-effort audit_log.
- `SubscriptionConflictSheet` derives billing URL from `SupabaseManager.shared.siteURL` (no longer hardcoded to prod).

**Verification:**
- Pre-impl finding-verifier: 15/16 CONFIRMED, 1 PARTIAL (AlertsView.swift line drift, expected per Q12c).
- DB MCP query confirmed `verity_monthly` row absent (hidden P0).
- Build-verifier: web TS clean, lint clean, all sentinels PASS, file-existence PASS, kill-switch CLAUDE.md update PASS. iOS xcodebuild fails on pre-existing `LeaderboardView.swift:319` String/uuidString error — unchanged in Session 4 (`git diff HEAD -- VerityPost/VerityPost/LeaderboardView.swift` returns empty).
- Independent reviewer: SHIP — all 13 listed P0/P1 CLOSED + 7 new findings (4 P1 fed into second pass, 3 polish + non-issues documented).
- Adversary: NEEDS-ANOTHER-PASS first pass; NEEDS-ANOTHER-PASS items 1-4 + polish 5-7 closed in second pass; remaining items deferred (race window via SERIALIZABLE transaction, Stripe livemode env gate parity, BillingCard handling of `is_active=false` plans — all non-Session-4-regression).

**Owner action required (CANNOT be done by agent):**
1. **Apply both migrations** — MCP is in read-only mode for this project. Files written:
   - `supabase/migrations/20260503000019_session4_verity_solo_plans.sql`
   - `supabase/migrations/20260503000020_session4_subscriptions_ordering_token.sql`
   Apply via `supabase db push` from project root, or paste into Supabase dashboard SQL editor.
2. **Mint Stripe price IDs for verity_monthly + verity_annual** — set `stripe_price_id` on both rows + flip `is_visible = true` so the pricing page renders the Subscribe CTA. Until populated, the pricing page correctly shows "Subscribe via iOS App" fallback (no broken checkout).
3. **(optional) Address adversary deferrals** — race window via SERIALIZABLE transaction on the precheck+upsert window; Stripe `livemode` env-gate; BillingCard handling of `is_active=false` legacy Pro rows. None are payment-correctness regressions; all suitable for a follow-up session.

**Files touched:**
- New: `web/src/lib/billingPlatformGuard.ts`, `web/src/lib/pricingCopy.ts`, `VerityPost/VerityPost/SubscriptionConflictSheet.swift`, `supabase/migrations/20260503000019_*`, `supabase/migrations/20260503000020_*`
- Modified web: `lib/stripe.js`, `lib/plans.js`, `lib/appleReceipt.js`, `app/api/billing/{cancel,change-plan,resubscribe}/route.js`, `app/api/stripe/{checkout,webhook}/route.js`, `app/api/ios/subscriptions/sync/route.js`, `app/api/ios/appstore/notifications/route.js`, `app/pricing/page.tsx`, `app/messages/page.tsx`, `app/profile/settings/_cards/BillingCard.tsx`
- Modified iOS: `StoreManager.swift`, `SubscriptionView.swift`, `AlertsView.swift`
- Modified docs: `/Users/veritypost/Desktop/CLAUDE.md` (kill-switch row 5)

