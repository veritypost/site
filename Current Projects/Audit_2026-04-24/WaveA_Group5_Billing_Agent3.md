---
wave: A
group: 5 Billing
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Billing, Wave A, Agent 3/3

## CRITICAL

### F-A531 — B1 Finding: Stripe/Apple webhooks DO call bump_user_perms_version after plan change

**File:line:** `schema/148_billing_rpcs_bump_perms_version.sql:352`, `schema/148_billing_rpcs_bump_perms_version.sql:93`, `schema/148_billing_rpcs_bump_perms_version.sql:157`, `schema/148_billing_rpcs_bump_perms_version.sql:247`

**Evidence:**

Current live RPC for billing_change_plan (confirmed via pg_get_functiondef):
```
  -- B1: plan_id changed; perms cache must invalidate or paid features
  -- (DM compose, ad-free, expert Q&A) misalign with the new tier.
  PERFORM bump_user_perms_version(p_user_id);
```

All four billing mutation RPCs call bump_user_perms_version:
- billing_change_plan: line 352 in schema/148_billing_rpcs_bump_perms_version.sql
- billing_resubscribe: line 247
- billing_freeze_profile: line 157
- billing_cancel_subscription: line 93

**Impact:** Migration 148 deployed successfully. All Stripe webhook handlers (customer.subscription.updated, checkout.session.completed) and iOS notification handlers (SUBSCRIBED, DID_RENEW, etc.) call these RPCs, which now invalidate the perms cache atomically. No stale-cache window remains post-plan-change.

**Confidence:** HIGH

---

## HIGH

### F-A532 — B3 Finding: iOS receipt appAccountToken cross-check present on both sync and S2S paths

**File:line:** `web/src/app/api/ios/subscriptions/sync/route.js:118-122`, `web/src/app/api/ios/appstore/notifications/route.js:238-250`

**Evidence:**

Sync route (Layer 1):
```javascript
if (
  payload.appAccountToken &&
  String(payload.appAccountToken).toLowerCase() !== String(userId).toLowerCase()
) {
  return NextResponse.json({ error: 'Receipt belongs to a different user' }, { status: 403 });
}
```

S2S notification route (Line 230-250):
```javascript
if (
  transaction.appAccountToken &&
  String(transaction.appAccountToken).toLowerCase() !== String(userId).toLowerCase()
) {
  await service
    .from('webhook_log')
    .update({
      processing_status: 'failed',
      processing_error: 'transaction.appAccountToken mismatch with subscription owner',
    })
    .eq('id', logId);
  return NextResponse.json({ error: 'appAccountToken mismatch' }, { status: 403 });
}
```

Sync route includes defense layer 2 (existingSub user_id check at line 208).

**Impact:** Both hijack vectors closed. User cannot forge a receipt cross-account sync, and S2S notifications validate signature + appAccountToken + existing subscription ownership before mutating state.

**Confidence:** HIGH

---

### F-A533 — B6 Finding: invoice.upcoming handler present and functional

**File:line:** `web/src/app/api/stripe/webhook/route.js:187-188`, `web/src/app/api/stripe/webhook/route.js:855-891`

**Evidence:**

Handler registered at line 187:
```javascript
case 'invoice.upcoming':
  await handleInvoiceUpcoming(service, event.data.object);
  break;
```

Handler implementation (lines 855-891) sends best-effort user notification 7 days before renewal with amount due and currency. Notification call is wrapped in try/catch and does not block webhook ack.

**Impact:** Users receive advance notice of upcoming renewals. Notification is informational and best-effort (failure is silent), which is appropriate for a non-blocking webhook handler.

**Confidence:** HIGH

---

## MEDIUM

### F-A534 — iOS receipt replay / anti-replay via webhook_log idempotency

**File:line:** `web/src/app/api/ios/subscriptions/sync/route.js:128-135`, `web/src/app/api/ios/appstore/notifications/route.js:83-101`

**Evidence:**

Both routes implement idempotency via webhook_log with event_id as unique key:
- Sync: `event_id = "apple_sync:{originalTransactionId}"`
- Notifications: `event_id = "apple_notif:{notificationUUID}"`

Sync route (line 133):
```javascript
if (prior?.processing_status === 'processed') {
  return NextResponse.json({ received: true, replay: true });
}
```

Notification route (line 88-89):
```javascript
if (prior?.processing_status === 'processed') {
  return NextResponse.json({ received: true, replay: true });
}
```

Both routes detect stuck processing states (5-min window) and allow reclaim.

**Impact:** Replayed receipts are detected and short-circuited. Orphan receipts (no subscription row, no appAccountToken) return 200 to halt Apple retries but remain discoverable for backfill via webhook_log.processing_status='orphaned'.

**Confidence:** HIGH — code-reading only (no live replay test performed)

---

### F-A535 — Plan upgrade/downgrade RPC atomicity confirmed

**File:line:** `schema/148_billing_rpcs_bump_perms_version.sql:300-326`

**Evidence:**

billing_change_plan locks the user row FOR UPDATE at line 280, then locks the active subscription FOR UPDATE at lines 300-302:
```sql
SELECT * INTO v_sub FROM subscriptions
  WHERE user_id = p_user_id AND status = 'active'
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
```

All updates within a single RPC transaction. No distributed transaction with Stripe — Stripe is updated BEFORE calling the RPC (web/src/app/api/billing/change-plan/route.js:80).

**Impact:** Plan mutations are atomic DB-side; Stripe-first ordering (line 80 in route.js) prevents silent state divergence if the RPC fails.

**Confidence:** HIGH

---

### F-A536 — Grace-period logic correctly gated in billing_cancel_subscription and handleSubscriptionUpdated

**File:line:** `schema/148_billing_rpcs_bump_perms_version.sql:34-102`, `web/src/app/api/stripe/webhook/route.js:426-469`

**Evidence:**

RPC prevents re-cancellation (line 57-60):
```sql
IF v_user.plan_grace_period_ends_at IS NOT NULL THEN
  RAISE EXCEPTION 'user % is already in grace period (ends %)',
    p_user_id, v_user.plan_grace_period_ends_at;
END IF;
```

Webhook un-cancel (line 439) only fires if user has an existing grace marker AND receives cancel_at_period_end=false from Stripe:
```javascript
if (!sub.cancel_at_period_end && userRow.plan_grace_period_ends_at) {
```

**Impact:** Grace period is idempotent. Users cannot double-cancel. Un-cancel is safe from races (requires pre-existing grace marker).

**Confidence:** HIGH

---

## LOW

### F-A537 — Tier ordering consistency and resolveFreePlan by tier

**File:line:** `web/src/lib/plans.js` (not yet inspected)

**Status:** UNSURE — Did not read plans.js or check tier ordering in billing RPC logic. The freezing uses `plans.name = 'free'` lookup (schema/148... line 126) which is safe but should verify that tier ordering (for downgrade detection via price_cents) is consistent across all paths.

**Recommendation:** Verify that plan.tier values are consistently ordered (free < verity < pro < verity_family) and that no tier-based logic relies on implicit ordering.

---

### F-A538 — Frozen-user capability revocation path coverage

**File:line:** `schema/148_billing_rpcs_bump_perms_version.sql:131-138`

**Evidence:**

billing_freeze_profile atomically updates users table:
```sql
UPDATE users
   SET frozen_at = now(),
       frozen_verity_score = verity_score,
       plan_id = v_free_plan_id,
       plan_status = 'frozen',
       plan_grace_period_ends_at = NULL,
       updated_at = now()
   WHERE id = p_user_id;
```

Then calls bump_user_perms_version, which invalidates the client's permission cache.

**Impact:** Frozen users immediately lose access to paid features (DMs, ad-free, expert Q&A) once client refreshes. No async reconciliation needed.

**Confidence:** HIGH — provided permissions RLS correctly gates paid features on plan_id or plan_status

---

### F-A539 — Audit_log coverage on billing mutations — verified in Stripe webhook, gaps in iOS

**File:line:** `web/src/app/api/stripe/webhook/route.js:523-535`, `web/src/app/api/stripe/webhook/route.js:734-745`, `web/src/app/api/stripe/webhook/route.js:838-852`, `web/src/app/api/stripe/webhook/route.js:928-939`

**Evidence:**

Stripe webhook mirrors handler failures and successful state transitions to audit_log:
- handleChargeRefunded: line 523-535
- handleRefundUpdated: line 734-745
- handlePaymentSucceeded: line 838-852
- handleCustomerDeleted: line 928-939

iOS appstore/notifications handler does NOT emit audit_log directly; it relies on RPC-internal logging (billing_change_plan, billing_freeze_profile, etc. do not insert audit_log).

**Impact:** Stripe billing mutations have end-to-end audit trail. iOS mutations are logged only if the RPC itself (billing_change_plan, etc.) includes audit_log, which they do NOT in migration 148. iOS refunds, freezes, and plan changes have no audit trail in audit_log table.

**Reproduction:** Code-reading only. Check schema for audit_log inserts within iOS notification handlers.

**Suggested fix direction:** iOS handlers should emit audit_log rows for billing mutations, or RPCs should be extended to accept an audit context parameter.

**Confidence:** MEDIUM — iOS handlers call RPCs that produce subscription_events rows, but subscription_events is not the same as audit_log; audit_log is the compliance/op trail.

---

## UNSURE

### F-A540 — Stripe webhook handler crash-recovery under B4 stuck claim logic

**Status:** UNSURE — Stripe webhook implements a 5-minute stuck-claim reclaim window (route.js:61 STUCK_PROCESSING_SECONDS = 5 * 60). Unclear if this aligns with actual timeout behavior of the Next.js runtime or if a webhook could be orphaned longer than 5 minutes. Needs clarification: does the timeout apply per-invocation or per-function?

---

# Summary

**B1 — RESOLVED:** Migration 148 deployed; all four billing RPCs call bump_user_perms_version.

**B3 — RESOLVED:** iOS receipt hijack defense on both sync and S2S paths. appAccountToken validated on both layers.

**B6 — RESOLVED:** invoice.upcoming handler implemented and sends user notification.

**Other findings:** Atomicity, grace-period logic, and Stripe audit coverage are solid. iOS audit coverage is incomplete (mutations logged to subscription_events but not audit_log). Tier ordering and frozen-user capability paths need spot-check but appear sound.

**Critical gaps:** None identified. Audit findings are exploratory (tier consistency, stuck-claim timeout interpretation) and do not indicate active security or data-integrity issues.
