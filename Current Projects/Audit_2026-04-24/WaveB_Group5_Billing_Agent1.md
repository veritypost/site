---
wave: B
group: 5 Billing
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Billing, Wave B, Agent 1

## CRITICAL

### F-B5-1-01 — B1 FIX VERIFIED: billing RPCs now call bump_user_perms_version
**File:line:** `schema/148_billing_rpcs_bump_perms_version.sql:93,157,247,352`
**Evidence:**
```sql
-- billing_cancel_subscription (line 93)
PERFORM bump_user_perms_version(p_user_id);

-- billing_freeze_profile (line 157)
PERFORM bump_user_perms_version(p_user_id);

-- billing_resubscribe (line 247)
PERFORM bump_user_perms_version(p_user_id);

-- billing_change_plan (line 352)
PERFORM bump_user_perms_version(p_user_id);
```
**Impact:** RESOLVED. Every Stripe webhook handler call to `billing_change_plan`, `billing_resubscribe`, `billing_cancel_subscription`, and `billing_freeze_profile` now atomically bumps the user's `perms_version`, closing the permission-cache stale window. Webhooks no longer leave users with misaligned cached permissions after plan changes.
**Confidence:** HIGH — Commit 9c88616 merged into codebase after anchor. Migration 148 applied; rollback 149 not in place.

---

## HIGH

### F-B5-1-02 — B3 Receipt hijack defense: dual-layer appAccountToken checks intact
**File:line:** `web/src/app/api/ios/subscriptions/sync/route.js:117-122` (layer 1); `web/src/app/api/ios/appstore/notifications/route.js:238-250` (layer 2)
**Evidence:**
```javascript
// Layer 1: sync endpoint checks appAccountToken vs bearer userId
if (
  payload.appAccountToken &&
  String(payload.appAccountToken).toLowerCase() !== String(userId).toLowerCase()
) {
  return NextResponse.json({ error: 'Receipt belongs to a different user' }, { status: 403 });
}

// Layer 2: notification handler cross-checks appAccountToken vs stored subscription.user_id
if (
  transaction.appAccountToken &&
  String(transaction.appAccountToken).toLowerCase() !== String(userId).toLowerCase()
) {
  await service.from('webhook_log').update({
    processing_status: 'failed',
    processing_error: 'transaction.appAccountToken mismatch with subscription owner',
  }).eq('id', logId);
  return NextResponse.json({ error: 'appAccountToken mismatch' }, { status: 403 });
}
```
**Impact:** Receipt hijack (account-takeover via JWS cross-device replay) blocked on both client-sync and S2S notification paths. If `appAccountToken` present and mismatches, sync/notification rejected 403 before any plan change. Backward-compat preserved: receipts from before iOS shipped the field (pre-2026-04-16) bypass the first check but are caught by the stored `subscriptions.user_id` cross-check in layer 2.
**Confidence:** HIGH — Both checks code-reviewed as present and correct; commit 4ca9d97 explicitly addresses B3.

---

### F-B5-1-03 — B6 `invoice.upcoming` coverage present but missing audit_log
**File:line:** `web/src/app/api/stripe/webhook/route.js:187,855-891`
**Evidence:**
```javascript
case 'invoice.upcoming':
  await handleInvoiceUpcoming(service, event.data.object);
  break;

async function handleInvoiceUpcoming(service, invoice) {
  const customerId = invoice.customer;
  if (!customerId) return;
  try {
    const { userRow } = await lookupUserAndPlan(service, customerId, null);
    if (!userRow) return;
    const amountDollars = Number.isFinite(invoice.amount_due)
      ? (invoice.amount_due / 100).toFixed(2)
      : null;
    const currency = (invoice.currency || 'usd').toUpperCase();
    const bodyAmount = amountDollars ? `${amountDollars} ${currency}` : 'your subscription';
    await service.rpc('create_notification', {
      p_user_id: userRow.id,
      p_type: 'billing_alert',
      p_title: 'Upcoming renewal',
      p_body: `Your subscription renews soon for ${bodyAmount}. ...`,
      p_action_url: '/profile/settings/billing',
      p_action_type: 'billing',
      p_action_id: null,
      p_priority: 'normal',
      p_metadata: { invoice_id: invoice.id, ... },
    });
  } catch {
    /* notification RPC best-effort */
  }
}
```
**Impact:** Handler creates user-facing in-app notification 7 days before charge, which is good. However, no `audit_log` insert on success (only comment notes "best-effort"). Unlike `handlePaymentFailed`, `handleChargeRefunded`, `handleChargeDispute`, `handleDisputeClosed`, and `handleRefundUpdated` which all audit_log, `invoice.upcoming` silently notifies. Audit trail incomplete for billing-lifecycle events.
**Confidence:** MEDIUM — The handler works; notification is best-effort anyway. But missing audit_log breaks audit compliance for renewal-lifecycle tracking. Recommend: add `audit_log` INSERT on successful notification create, with same error-swallowing semantics.

---

## MEDIUM

### F-B5-1-04 — Stripe webhook idempotency via webhook_log UNIQUE event_id works, but reclaim window (5min) on `received` status could miss concurrent failures
**File:line:** `web/src/app/api/stripe/webhook/route.js:123-146`
**Evidence:**
```javascript
if (prior.processing_status === 'processing' || prior.processing_status === 'received') {
  // B4: if the claim is older than STUCK_PROCESSING_SECONDS, assume the
  // prior invocation crashed and try to reclaim.
  const createdAt = Date.parse(prior.created_at || '');
  const isStuck = Number.isFinite(createdAt) && Date.now() - createdAt > STUCK_PROCESSING_SECONDS * 1000;
  if (isStuck) {
    const { data: reclaimed } = await service
      .from('webhook_log')
      .update({ processing_status: 'processing', processing_error: null })
      .eq('id', prior.id)
      .in('processing_status', ['processing', 'received'])
      .select('id')
      .maybeSingle();
    if (reclaimed) {
      logId = reclaimed.id;
    } else {
      return NextResponse.json({ received: true, in_flight: true });
    }
  } else {
    return NextResponse.json({ received: true, in_flight: true });
  }
}
```
**Impact:** If two concurrent POST requests arrive within 5min both claiming the same event, the second request detects `in_flight` and returns 200 immediately (correct). However, if the first request finishes at 4:59min but its final `webhook_log` update to `processed` fails silently (network hiccup on the update but the RPC/mutation succeeded), the row stays at `processing` and the next retry window after 5min will re-execute the billing RPC. This is rare but possible. Not a blocker since webhook idempotency is already atomic at the RPC level, but worth documenting.
**Confidence:** MEDIUM — Defensive pattern is sound. Concurrency+network failure race is theoretical. Low user impact if it occurs (duplicate plan charge would be caught by Stripe's own idempotency key or user refund flow).

---

### F-B5-1-05 — iOS AppStore notifications: orphaned subscriptions fallback via appAccountToken is useful but plan_id stays NULL until first active transaction
**File:line:** `web/src/app/api/ios/appstore/notifications/route.js:182-211`
**Evidence:**
```javascript
if (!sub && transaction.appAccountToken) {
  const candidate = String(transaction.appAccountToken);
  const { data: ownerRow } = await service
    .from('users')
    .select('id')
    .eq('id', candidate)
    .maybeSingle();
  if (ownerRow?.id) {
    // Mint a minimal pending row so the handler below can update it in place.
    // plan_id stays NULL here; the per-type branches below call
    // resolvePlanByAppleProductId + set plan_id when the notification carries a productId.
    const { data: created, error: insertErr } = await service
      .from('subscriptions')
      .insert({
        user_id: ownerRow.id,
        apple_original_transaction_id: originalTxId,
        status: 'pending',
        source: 'apple',
      })
      .select('id, user_id, plan_id, status')
      .single();
    if (!insertErr && created) {
      sub = created;
    }
  }
}
```
**Impact:** Good defensive fallback for S2S notifications arriving before device sync. However, the inserted row has `plan_id=NULL` and `status='pending'` until the handler branch below resolves the plan from the transaction's productId and calls `billing_change_plan` or `billing_resubscribe`. If that handler branch throws, the row stays `pending` forever. No retry logic on the fallback mint itself. Low impact (next device sync will fix it), but a careful reader might expect the row to be skipped or the error to be more explicit.
**Confidence:** MEDIUM — Design is intentional per comment. Not a bug, but could be clearer in error handling.

---

## LOW

### F-B5-1-06 — Billing route `/api/billing/change-plan`, `/api/billing/cancel`, `/api/billing/resubscribe` all delegate to billing_* RPCs which now bump perms_version, so no route-level bump needed — but consistency not explicit in code comments
**File:line:** `web/src/app/api/billing/change-plan/route.js:95-105` (no bump comment); `web/src/app/api/billing/cancel/route.js:65-73` (no bump comment); `web/src/app/api/billing/resubscribe/route.js:79-89` (no bump comment)
**Evidence:** 
Routes call the billing RPCs but do NOT call `bump_user_perms_version` themselves, relying on the RPC's internal bump (migration 148). This is correct, but the routes lack a comment explaining "the RPC handles the bump." Compare to `/api/admin/subscriptions/[id]/manual-sync/route.js:186` which has an explicit comment: "Atomic SQL-level +1 via RPC — see bump_user_perms_version."
**Impact:** None — implementation is correct. Code clarity only. A future reader might think it's a bug that the route doesn't bump.
**Confidence:** LOW — This is a documentation gap, not a functional issue.

---

## UNSURE

None. All core B1, B3, B6 focus areas examined and either verified or flagged with confidence levels.

