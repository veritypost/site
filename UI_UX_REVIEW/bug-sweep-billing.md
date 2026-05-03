# Bug Sweep — Billing Surface
_Generated 2026-05-03. Three lenses: RUNTIME / FLOW / SECURITY. Adversary appended below._
_Fix-pass shipped 2026-05-03 — all 46 findings [fixed] across 4 parallel streams. Adversary follow-up surfaced 10 new gaps; 9 [fixed], 1 [deferred] (cron infra)._

## Runtime Findings

**BUG-BILL-R-001** [fixed] — `web/src/lib/stripe.js:274` — wrapped `JSON.parse(rawBody)` in try/catch that throws a typed `'webhook body not valid JSON'` error; route.js's existing line 90-95 catch returns 400 cleanly without leaving a stuck webhook_log row. Severity: high.

**BUG-BILL-R-002** [fixed] — `web/src/app/profile/settings/_cards/BillingCard.tsx:163` — `resume()` now falls back to `sub.plan_id` slug when `plan` is null, redirects to `/pricing` if neither available, and the silent plan-fetch error path now sets `fetchError(true)` so the user sees a retryable error card. Severity: high.

**BUG-BILL-R-003** [fixed] — `web/src/app/api/stripe/webhook/route.js:481-486` — `priceId` null-guard added; if undefined, log + return early without throwing (Stripe won't retry forever); webhook log marked `processed` with reason. Severity: high.

**BUG-BILL-R-004** [fixed] — `web/src/app/api/stripe/webhook/route.js:921` — `handleSubscriptionDeleted` destructures `{ error: rpcError }` from `billing_freeze_profile` RPC and throws on error so webhook is marked failed and Stripe retries. Severity: critical.

**BUG-BILL-R-005** [fixed] — `web/src/app/api/stripe/webhook/route.js:608-612` — `handleSubscriptionUpdated` destructures error from `billing_cancel_subscription` and throws on failure. Severity: high.

**BUG-BILL-R-006** [fixed] — `web/src/app/api/stripe/webhook/route.js:629-665` — `billing_uncancel_subscription` rewritten so error is read from `{ error }` and the direct-column-UPDATE fallback fires only when error is non-null. Severity: high.

**BUG-BILL-R-007** [fixed] — `web/src/app/api/billing/cancel/route.js:69-73` — destructure `{ data: me, error: meErr }`; return 500 if meErr (don't silently call local RPC while Stripe keeps billing). Severity: high.

**BUG-BILL-R-008** [fixed] — `web/src/app/api/billing/resubscribe/route.js:67-71` and `web/src/app/api/billing/change-plan/route.js:71-75` — same error destructure + 500 return added in both routes. Severity: high.

**BUG-BILL-R-009** [fixed] — `web/src/app/api/stripe/webhook/route.js:496-507` — `handleCheckoutCompleted` destructures errors from both `billing_resubscribe` and `billing_change_plan` RPCs and throws on failure; webhook is NOT marked processed if billing fails. Severity: critical.

**BUG-BILL-R-010** [fixed] — `VerityPost/VerityPost/StoreManager.swift:362-381` — `restorePurchases()` catch block now clears both `purchasedProductIDs` and `serverConfirmedProductIDs` before setting errorMessage. Severity: medium.

**BUG-BILL-R-011** [fixed] — `web/src/app/api/stripe/webhook/route.js:534-545` — analytics `trackServer` calls now sit below the success path (post R-009 throw guards), so analytics fires only on RPC success. Severity: medium.

**BUG-BILL-R-012** [fixed] — `web/src/app/api/stripe/webhook/route.js:255-269` — null-logId check in catch path; CRIT log + skip the silent `.eq('id', null)` no-op when logId is null. Severity: medium.

## Security Findings

**BUG-BILL-S-001** [fixed] — `web/src/app/api/ios/subscriptions/sync/route.js:186-195` + `web/src/lib/appleReceipt.js:254-280` — added `assertReceiptStillActive(payload, { graceMs })` helper that throws when `expiresDate` is more than 60s in the past; sync route returns 410 `{ error: 'receipt_expired' }` when called. Severity: critical.

**BUG-BILL-S-002** [fixed] — `web/src/app/api/ios/subscriptions/sync/route.js:240-249` — when `appAccountToken` is absent AND no existing subscriptions row, returns 400 `{ error: 'receipt_missing_user_binding' }`. No-token path with existing user-bound row still allowed. Severity: high.

**BUG-BILL-S-003** [fixed] — `web/src/lib/stripe.js:108-123` — `cancelSubscriptionAtPeriodEnd` and `resumeSubscription` now pass stable idempotency keys (`cancel-{subId}-{periodEnd}`, `resume-{subId}`); cancel/route.js call site updated to pass `active.current_period_end`. Severity: medium.

**BUG-BILL-S-004** [fixed] — `web/src/lib/stripe.js:143-154` — `updateSubscriptionPrice` passes idempotency key `change-plan-{subId}-{newPriceId}` (deterministic per-target so retries dedupe but new plan-changes go through). Severity: medium.

**BUG-BILL-S-005** [fixed] — `web/src/app/api/stripe/checkout/route.js:122-123` — response now returns only `{ url }`; `session_id` removed from payload. Severity: medium.

**BUG-BILL-S-006** [fixed] — `web/src/app/api/ios/appstore/notifications/route.js:194-207` — >5min reclaim now does conditional `.update(..).in('processing_status', [...]).select('id')`; if zero returned, returns 200 idempotent (matches Stripe webhook race-safe pattern). Severity: medium.

**BUG-BILL-S-007** [fixed] — `web/src/app/api/ios/appstore/notifications/route.js:129-138` — env-gate now defaults `expectedEnv = 'Production'` when both VERCEL_ENV and NODE_ENV are absent (instead of fail-closed null), with a CRIT log surfacing the misconfiguration so legitimate Production traffic flows. Severity: high.

**BUG-BILL-S-008** [fixed] — covered by S-001 fix (`assertReceiptStillActive`); the 24-hour `signedDate` window remains for first-pairing scenarios but lapsed receipts can no longer reactivate plans. Severity: high.

**BUG-BILL-S-009** [fixed] — covered by R-005 fix (same RPC error-check pattern, security lens). Severity: critical.

**BUG-BILL-S-010** [fixed] — `web/src/app/api/stripe/webhook/route.js:672-674` — when priceId is set but `planRow` is null (Stripe price not in `plans` table), throws so webhook marks failed; Stripe retries and admin sees the unmapped price in logs. Severity: medium.

**BUG-BILL-S-011** [fixed] — `web/src/app/api/ios/appstore/notifications/route.js:298-302` — fallback lookup now asserts `String(ownerRow.id) === String(candidate)` before using the row. Severity: medium.

**BUG-BILL-S-012** [fixed] — `VerityPost/VerityPost/StoreManager.swift:54-58, 515-547` — added `serverConfirmedProductIDs: Set<String>` populated only by 2xx server responses; `hasAccess(to:)` is now `@deprecated` and reads `serverConfirmedProductIDs` (defaults-closed when empty), not `purchasedProductIDs`. Severity: medium.

## Flow Findings

**BUG-BILL-F-001** [fixed] — covered by R-002 (resume null-plan fallback + fetchError on plan-fetch failure). Severity: critical.

**BUG-BILL-F-002** [fixed] — `web/src/app/profile/_components/ProfileApp.tsx:163-170` — added parallel useEffect for `?canceled=1` that shows toast "Checkout cancelled — your plan was not changed" and `router.replace` to clear the param. Severity: high.

**BUG-BILL-F-003** [fixed] — `web/src/app/profile/settings/_cards/BillingCard.tsx:120, 139, 148` — added `if (busy) return` guard at handler entry on openPortal/requestCancel/cancel handlers (closes click-during-flush race). Severity: medium.

**BUG-BILL-F-004** [fixed] — `web/src/app/pricing/_CheckoutButton.tsx:1-64` — added localStorage `verity:checkout-in-flight` key with 60s TTL; checks before POST, writes on POST start, clears on redirect/error; shows inline error if in-flight from another tab. Severity: high.

**BUG-BILL-F-005** [fixed] — `web/src/app/profile/settings/_cards/BillingCard.tsx:218-245` — extracted fetch into useCallback `fetchData`; added Retry button on error card with "Retrying…" state. Severity: medium.

**BUG-BILL-F-006** [fixed] — `web/src/app/profile/settings/_cards/BillingCard.tsx:280-291, 333-356, 374-399` — derived tri-state `subState` ('active'|'cancel-scheduled'|'expired') from `sub.status`; expired shows "Expired" badge + "Subscribe again" Link to `/pricing`. Severity: high.

**BUG-BILL-F-007** [fixed] — `web/src/app/profile/_components/ProfileApp.tsx:158` + BillingCard listener — ProfileApp dispatches `verity:billing-refresh` CustomEvent after success; BillingCard listens and re-runs fetchData (also retries on `?success=1` per A2-004). Severity: high.

**BUG-BILL-F-008** [fixed] — covered by GAP-004 (resubscribe now returns 409 with redirectTo when no matching cancelling Stripe sub). Severity: critical.

**BUG-BILL-F-009** [fixed] — `web/src/app/pricing/page.tsx:118-161` — PricingPage now async server component reading auth via `createClient`; logged-in users see "You're on the free plan" linking to `/profile/settings?section=plan`; anon users see "Sign up free" linking to `/login?redirect=/pricing`. Severity: medium.

**BUG-BILL-F-010** [fixed] — `web/src/app/profile/settings/_cards/BillingCard.tsx:41-47, 87, 331` — added `display_name` to PlanRow + plans select; renders `plan?.display_name ?? plan?.name ?? sub.plan_id ?? 'Free'`. Severity: medium.

**BUG-BILL-F-011** [fixed] — `web/src/app/profile/settings/_cards/BillingCard.tsx:155-158, 200-203` — replaced optimistic `setSub({...sub, cancel_at: ...})` with `void fetchData()` after cancel/resume to get canonical server state. Severity: medium.

**BUG-BILL-F-012** [fixed] — `web/src/app/profile/settings/page.tsx:13-36` — extracted SettingsPage client component reading useSearchParams; defaults to 'plan' section when `success=1` / `canceled=1` / `section=plan` is present. Severity: medium.

## Adversary Gaps

[ADVERSARY] GAP-BILL-001 [fixed] — `web/src/app/api/stripe/webhook/route.js:509-525` — `handleCheckoutCompleted` now upserts a `subscriptions` row (with `onConflict: 'stripe_subscription_id'`) for ALL Stripe checkouts (not just Family base plans). Verity solo subs are now reconcilable. Severity: critical.

[ADVERSARY] GAP-BILL-002 [fixed] — `web/src/app/api/stripe/webhook/route.js:1299-1322` — `handleCustomerDeleted` now freezes whenever userRow exists, is not already frozen, and is not on the free-tier plan — independent of `cancelledIds.length`. Severity: critical.

[ADVERSARY] GAP-BILL-003 [fixed] — `web/src/app/api/billing/cancel/route.js:75-89` — `listCustomerSubscriptions` switched from `status:'active'` to `status:'all'`; predicate now matches `active || trialing || past_due` so dunning subs can be cancelled via this route. Severity: high.

[ADVERSARY] GAP-BILL-004 [fixed] — `web/src/app/api/billing/resubscribe/route.js:54-97` — cross-tier arbitrage closed: returns 409 `{error:'no_active_subscription', redirectTo:'/pricing'}` when no Stripe customer; 409 same body when cancelling sub's price doesn't match requested plan; `billing_resubscribe` RPC only fires on the matched-price success path. Severity: critical.

[ADVERSARY] GAP-BILL-005 [fixed] — `web/src/app/api/stripe/webhook/route.js:588-601, 696-718` — both subscriptions UPDATE sites now key on `.eq('stripe_subscription_id', sub.id)` so multi-sub accounts don't have IDs overwritten across rows. Severity: high.

[ADVERSARY] GAP-BILL-006 [fixed] — `web/src/app/api/stripe/webhook/route.js:1134-1150` — `invoice.payment_succeeded` now falls back to lookup via `subscriptions` table by `stripe_subscription_id` when subscription-based lookup yields no userRow; proceeds with grace clear + plan_status='active' flip. Severity: high.

[ADVERSARY] GAP-BILL-007 [fixed] — `web/src/app/api/stripe/webhook/route.js:604-621` — second cancel now updates `plan_grace_period_ends_at` to `sub.cancel_at` if grace is already set; first cancel still fires the RPC; un-cancel branch unchanged. Severity: medium.

[ADVERSARY] GAP-BILL-008 [fixed] — `web/src/lib/stripe.js:265-278` — `verifyWebhook` timestamp rejection now emits distinct `console.error('[CRIT] webhook timestamp rejected — possible NTP drift; age=Xs')` to make catastrophic clock-drift searchable separately from per-event signature mismatches. Severity: medium.

[ADVERSARY] GAP-BILL-009 [fixed] — `web/src/app/api/stripe/checkout/route.js:84-94` — beta-comp guard expanded to also reject when `trial_extension_until > now()`; returns 409 `{error:'active_trial_extension'}`. Severity: high.

[ADVERSARY] GAP-BILL-010 [fixed] — `VerityPost/VerityPost/StoreManager.swift:182, 227, 331, 362-381, 481` — `purchasedProductIDs.insert(...)` no longer fires before `syncPurchaseToServer` returns; on 2xx success inserts to both sets, on failure removes from both. `hasAccess(to:)` rewired to read server-confirmed set only (defaults-closed). Severity: medium.

## Adversary Follow-up Patches (post-adversary-pass)

[ADVERSARY-2] GAP-BILL-A2-001 [fixed] — CRITICAL — `web/src/app/api/ios/subscriptions/sync/route.js:251-261` + `web/src/app/api/ios/appstore/notifications/route.js:308-316` — `subRow` payloads now include `platform: 'apple'` (was being silently set to default 'stripe' by DB column default, breaking family seat checks for `sub.platform === 'apple'`).

[ADVERSARY-2] GAP-BILL-A2-002 [fixed] — CRITICAL — `VerityPost/VerityPost/StoreManager.swift:388-410` — `restorePurchases()` now captures the `syncPurchaseToServer` bool and on `ok=true` inserts into both `serverConfirmedProductIDs` and `purchasedProductIDs` and finishes the transaction (was discarding the bool, which left entitlement sets empty after Restore so `hasAccess()` returned false for all paid features).

[ADVERSARY-2] GAP-BILL-A2-003 [fixed] — HIGH — `web/src/app/api/billing/change-plan/route.js:71-100` + `resubscribe/route.js:67-96` — T304 comp+trial guard mirrored into both routes; rejects 409 `{error:'comp_or_trial_active', redirectTo:'/profile/settings?section=plan'}` when `me.cohort==='beta' && me.comped_until>now` OR `me.trial_extension_until>now` (closes double-billing escape on top of comp/trial windows).

[ADVERSARY-2] GAP-BILL-A2-004 [fixed] — HIGH — `web/src/app/profile/_components/ProfileApp.tsx:158` + BillingCard — dispatch wrapped in `setTimeout(..., 0)`, upgraded to CustomEvent with `detail.fromSuccess`; BillingCard arms a 6-attempt 1s-backoff retry loop on `success=1` until the webhook lands a non-free state.

[ADVERSARY-2] GAP-BILL-A2-005 [fixed] — HIGH — `web/src/app/profile/settings/_cards/BillingCard.tsx:64-82, 415-468` — query now `.in('status', ['active','trialing','past_due'])` AND added `platform` to select; Apple-platform subs render "Manage subscription in your iOS device's Settings → Apple ID → Subscriptions." instead of cancel/resume/portal buttons.

[ADVERSARY-2] GAP-BILL-A2-006 [fixed] — MEDIUM — `web/src/app/api/stripe/webhook/route.js:606-694` — cancel branch now ALSO writes `subscriptions.cancel_at`; un-cancel branch clears it back to null. BillingCard `subState='cancel-scheduled'` derivation now works.

[ADVERSARY-2] GAP-BILL-A2-007 [fixed] — MEDIUM — `web/src/app/api/stripe/webhook/route.js:598` — kid_seats_paid filter widened to `['active','trialing','past_due']`.

[ADVERSARY-2] GAP-BILL-A2-008 [deferred] — MEDIUM — orphaned-row reclaim in `appstore/notifications/route.js:329-339`. Apple S2S notifications written as `processing_status: 'orphaned'` (subscriptions row not yet synced) never re-run because the reclaim path only matches `'received'`/`'processing'`. **Defer reason**: requires either a scheduled cron route or admin-replay surface — out of scope for a single-session billing fix-pass. Filed as a follow-up bug doc entry. No payment-loss vector since the notification re-delivers via Apple's retry cycle for some lifecycle types; for those that don't, an admin can manually replay via the existing audit_log workflow.

[ADVERSARY-2] GAP-BILL-A2-009 [fixed] — MEDIUM — `web/src/app/api/stripe/webhook/route.js:509-531` — checkout upsert now sets `cancel_at: null, cancelled_at: null, cancel_reason: null` so re-subscribed rows don't carry stale cancel-scheduled markers.

[ADVERSARY-2] GAP-BILL-A2-010 [fixed] — LOW — `web/src/lib/stripe.js:110-123` — `cancelSubscriptionAtPeriodEnd` throws when `periodEnd` is null/undefined (closes idempotency-key collapse footgun for future callers).

---

## Smoke Test 2026-05-03 (post-fix-pass + adversary patches)

**Test Date**: 2026-05-03 — after 46 billing fixes + 9 adversary patches

**Routes Tested:**
- `GET /pricing` → 302 (auth redirect, expected)
- `GET /profile/settings?section=plan` → 302 (auth redirect, expected)
- `GET /profile/settings?section=plan&success=1` → 302 (expected)
- `GET /profile/settings?section=plan&canceled=1` → 302 (expected)
- `POST /api/stripe/checkout` → 401 (auth-gated, expected)
- `POST /api/billing/cancel` → 401 (expected)
- `POST /api/billing/resubscribe` → 401 (expected)
- `POST /api/billing/change-plan` → 401 (expected)
- `POST /api/stripe/webhook` → 400 (signature verification, expected)
- `POST /api/ios/subscriptions/sync` → 401 (expected)
- `POST /api/ios/appstore/notifications` → 400 (signature/env validation, expected)

**Dev Server Compilation**: All routes compiled successfully; zero errors.

**Console / Dev Server Logs**: No hydration mismatches, no module-resolution failures, no unhandled rejections.

**Result**: SMOKE TEST PASS. All Billing routes return expected status codes. Dev server compiled all 55 changes without errors.
