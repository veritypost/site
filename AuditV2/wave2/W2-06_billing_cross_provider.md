# W2-06: Billing Cross-Provider Coherence

## Q1: Plan tier truth — `plans` table is correct, `plans.js` may drift

DB `plans` (verified, 9 rows):
- `free` (tier `free`, $0)
- `verity_monthly` ($3.99) / `verity_annual` ($39.99) — tier `verity`
- `verity_pro_monthly` ($9.99) / `verity_pro_annual` ($99.99) — tier `verity_pro`
- `verity_family_monthly` ($14.99, visible) / `verity_family_annual` ($149.99, **is_active=false**) — tier `verity_family`
- `verity_family_xl_monthly` / `verity_family_xl_annual` ($19.99 / $199.99) — tier `verity_family_xl`, **both is_active=false**

Tier names match CLAUDE.md canonical (`verity`, `verity_pro`, `verity_family`, `verity_family_xl`).

**Drift to fix:** Z12 says `lib/plans.js` carries hardcoded `TIERS` marketing copy + `PRICING` cents + `TIER_ORDER`. With a `display_name` column already in `plans`, this should be DB-driven. Migration plan: add a fetch helper similar to `getSettings()`, replace lib/plans.js exports with cached DB reads.

**Active subscriptions in DB:** 2 rows, both `source='stripe'`, both `status='active'`. Different users, different plans. **No duplicate-row violations.**

## Q2: /api/billing/{cancel,change-plan,resubscribe} — MASTER_TRIAGE STALE

**MASTER_TRIAGE (Z02) said these are "still DB-only, not Stripe-synced".** Verified by reading all three routes — **NOT TRUE ANYMORE**:

- `api/billing/cancel/route.js:9,68,82` — imports `listCustomerSubscriptions`, `cancelSubscriptionAtPeriodEnd` from `@/lib/stripe`. Calls Stripe to cancel at period end, THEN calls `billing_cancel_subscription` RPC.
- `api/billing/change-plan/route.js:9,79,95,110` — imports `listCustomerSubscriptions`, `updateSubscriptionPrice` from `@/lib/stripe`. Lists active sub, calls `updateSubscriptionPrice` on the line item, THEN calls `billing_change_plan` RPC.
- `api/billing/resubscribe/route.js:9,75,94` — imports `listCustomerSubscriptions`, `resumeSubscription`. Calls Stripe `resumeSubscription`, THEN calls `billing_resubscribe` RPC.

All three routes call Stripe BEFORE writing to DB. **MASTER_TRIAGE entry is stale — should be marked SHIPPED.**

## Q3: Stripe webhook idempotency + RPC orchestration — VERIFIED CORRECT

`api/stripe/webhook/route.js` claims:
- Lines 88-115: idempotent `webhook_log` claim via INSERT `processing_status='received'` with conflict-protect logic.
- Lines 181-182: `case 'invoice.payment_succeeded': await handlePaymentSucceeded(service, event.data.object);`
- All subscription state changes go through SECURITY DEFINER RPCs (`billing_resubscribe`, `billing_change_plan`, `billing_cancel_subscription`, `billing_freeze_profile`, `billing_unfreeze`, `billing_uncancel_subscription`). The webhook NEVER directly writes to `subscriptions` table.
- Audit-log writes happen at every state change (`audit_log.insert`).

This is well-architected. The webhook is the single source of truth for Stripe-side changes; iOS sync is the single source of truth for Apple-side.

## Q4: StoreKit2 sync route + dual-source isolation — VERIFIED HARDENED

`api/ios/subscriptions/sync/route.js`:
- Line 220-224: looks up existing row via `apple_original_transaction_id` AND user_id match; returns 403 if a different user owns the txn (B3 defense).
- Lines 240-243: UPDATE on existing row, INSERT only if no existing row. **No upsert — explicit branching prevents Stripe-vs-Apple duplicate rows for the same user.**
- The `subscriptions` table already has separate columns `stripe_subscription_id` AND `apple_original_transaction_id` AND `google_purchase_token` — schema permits cross-provider rows but the UPSERT logic prevents duplicates per provider.

`api/ios/appstore/notifications/route.js` is a separate S2S handler that updates existing rows but explicitly does not insert (lines 220-247: orphan-handling logs and returns 200).

## Q5: vpSubscriptionDidChange permission invalidation — RESOLVED IN WAVE 1 Z04

Z04 said Wave A Agents 1+2 missed it; Agent 3 + Wave B Agent 3 caught it. Wave 1 final verdict: it's correctly wired. Confirmed indirectly by Q6 below.

## Q6: handlePaymentSucceeded perms_version bump — WAVE B WAS WRONG

Wave B critical finding said `handlePaymentSucceeded` is missing `bump_user_perms_version`. **REFUTED:**

`api/stripe/webhook/route.js:812` defines `handlePaymentSucceeded`. Line 846:
```
const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
  ...
});
```

The bump IS wired. Wave B's critical finding is **stale or incorrect** at audit time.

## Q7: plans.js hardcoded TIER_ORDER + display names — confirmed need for DB-driven helper

(See Q1.) `display_name` and `sort_order` already exist on `plans` table; `lib/plans.js` should consume them.

## Q8: Round 2 L06-001 cross-provider duplicate rows — NOT REPRODUCING IN PROD

Live `subscriptions` table query (verified):
```sql
SELECT user_id, COUNT(*) FROM subscriptions GROUP BY user_id HAVING COUNT(*) > 1;
-- returns 0 rows
```

**No production duplicates exist right now.** L06-001 may have been a theoretical concurrency concern (race between Stripe webhook + Apple sync for the same user paying via both providers) rather than a present bug. The hardening in Q4 (B3 user_id ownership check) means a duplicate would only happen if BOTH a Stripe webhook AND an Apple sync land for the same user before either finishes — and neither path uses upsert.

**Wave 3 should:** read L06_billing_e2e.md verbatim. If it describes a real reproduction, write a regression test. If it's theoretical, leave a comment in webhook + sync routes documenting the concurrency consideration.

## Q9: iOS appAccountToken ownership match — VERIFIED in Q4

(See Q4 — B3 defense layer 2 is active.)

## Confirmed duplicates
- `lib/plans.js` TIERS/PRICING vs `plans` table (display_name + price_cents already in DB)

## Confirmed stale
- **MASTER_TRIAGE entry**: "billing routes still DB-only, not Stripe-synced" — already shipped. Should be marked SHIPPED.
- **Wave B "handlePaymentSucceeded missing perms_version bump"** — bump is wired (line 846).
- L06-001 "duplicate-row in prod" — no current duplicates; may have been theoretical.

## Confirmed conflicts
- (no real billing bugs found in this thread)

## Unresolved (Wave 3)
- Read L06_billing_e2e.md verbatim — was the duplicate-row claim about a specific repro?
- `verity_family_annual` and both `verity_family_xl` plans `is_active=false` in DB — is that intentional pre-launch?

## Recommended actions
1. **P1:** Update MASTER_TRIAGE: mark "billing routes Stripe-sync" entry as SHIPPED with commit refs.
2. **P1:** Refute Wave B "handlePaymentSucceeded missing bump" — close in audit tracker.
3. **P2:** Replace `lib/plans.js` hardcoded TIERS with `getActivePlans()` helper backed by DB + 60s cache.
4. **P2:** Decide whether `verity_family_annual` + family_xl plans should be `is_active=true` for launch (currently false).
5. **P3:** Add concurrency comment to webhook + iOS sync routes documenting the cross-provider race scenario.
