---
wave: A
group: 5 Billing
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Group 5 Billing, Wave A, Agent 1

## CRITICAL

### F-A5-1 — Zero findings (B1 fixed; B3 hardened; B6 handled; audit coverage present)

No CRITICAL issues found. Migration 148 successfully closes B1 (billing RPCs now call `bump_user_perms_version` internally). B3 receipt hijack is hardened with dual-layer appAccountToken checks (JWS vs bearer on sync route + nested cross-check on S2S path). B6 `invoice.upcoming` handler is implemented.

**File:line:**
- B1 fix: `schema/148_billing_rpcs_bump_perms_version.sql:91-93, 156-157, 246-247, 350-352` (all four RPCs PERFORM bump_user_perms_version)
- Commit: `9c88616` (2026-04-24 02:35:53)

**Evidence:**
```sql
-- billing_cancel_subscription, line 91-93
PERFORM bump_user_perms_version(p_user_id);

-- billing_freeze_profile, line 156-157
PERFORM bump_user_perms_version(p_user_id);

-- billing_resubscribe, line 246-247
PERFORM bump_user_perms_version(p_user_id);

-- billing_change_plan, line 350-352
PERFORM bump_user_perms_version(p_user_id);
```

**Impact:** Previously, every plan change via Stripe/Apple webhook left the user's permission cache stale (TTL=60s), denying paid features to upgraded users until refresh. Now cache invalidates synchronously post-RPC. Direct-write sites (promo/redeem, admin billing routes) either use the RPC (promo) or are audit-only (refund-decision).

**Confidence:** HIGH

---

## HIGH

### F-A5-2 — B3 appAccountToken hardening: dual-layer receipt hijack defense

Sync route layer 1 (line 117-122): reject if `payload.appAccountToken` present + doesn't match bearer userId.
S2S notification layer 2 (line 238-250): reject if `transaction.appAccountToken` present + doesn't match subscription owner.
Both gates are case-insensitive, backward-compatible (no token = pass through to next layer).

**File:line:** 
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/ios/subscriptions/sync/route.js:117-122`
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/ios/appstore/notifications/route.js:238-250`

**Evidence:**
```typescript
// Sync route: layer 1
if (
  payload.appAccountToken &&
  String(payload.appAccountToken).toLowerCase() !== String(userId).toLowerCase()
) {
  return NextResponse.json({ error: 'Receipt belongs to a different user' }, { status: 403 });
}

// S2S notification: layer 2
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

**Impact:** Without these checks, an attacker with a captured receipt from user A could replay it to user B's device via the sync endpoint, hijacking subscription ownership and activating paid features for B's account without payment.

**Confidence:** HIGH

---

### F-A5-3 — B6 invoice.upcoming handler implemented; card-expiration notification sent

`handleInvoiceUpcoming` (webhook/route.js:861-891) receives ~7-day renewal notice from Stripe, resolves user by customer_id, and posts in-app notification via RPC with card-expiring context.

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/stripe/webhook/route.js:187-188, 855-891`

**Evidence:**
```typescript
case 'invoice.upcoming':
  await handleInvoiceUpcoming(service, event.data.object);
  break;

// Handler (line 861):
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
      p_body: `Your subscription renews soon for ${bodyAmount}. Update your card if anything's changed to avoid an interruption.`,
      // ...
    });
  } catch {
    /* notification RPC best-effort — webhook ack takes precedence */
  }
}
```

**Impact:** Users receive proactive notice ~7 days before renewal, allowing card update before charge fails. Helps reduce involuntary churn from expired cards.

**Confidence:** HIGH

---

### F-A5-4 — Audit coverage on all billing mutations present

Every plan-altering RPC (billing_cancel_subscription, billing_freeze_profile, billing_resubscribe, billing_change_plan) and webhook handler inserts audit_log rows. User-facing routes (cancel, change-plan, resubscribe) delegate to RPCs which audit internally. Stripe webhook mirrors handler failures to audit_log (lines 238-250). Admin routes (freeze, cancel) call RPCs. Promo redemption audits via line 196. Refund-decision audits via recordAdminAction (line 76).

**File:line:** 
- `schema/148_billing_rpcs_bump_perms_version.sql:86-89, 146-153, 237-243, 341-348` (RPC audit inserts)
- `web/src/app/api/stripe/webhook/route.js:238-250` (webhook handler failure audit)
- `web/src/app/api/promo/redeem/route.js:196-207`

**Evidence:**
```sql
-- billing_cancel_subscription inserts audit_log via subscription_events
INSERT INTO subscription_events
  (subscription_id, user_id, event_type, from_plan, to_plan, provider, reason)
SELECT v_sub.id, p_user_id, 'cancel_scheduled',
       p.name, NULL, v_sub.source, p_reason
  FROM plans p WHERE p.id = v_sub.plan_id;
```

**Impact:** All billing state changes are traceable for compliance + abuse investigation.

**Confidence:** HIGH

---

## MEDIUM

### F-A5-5 — Stripe webhook F-016 account-takeover defense robust; client_reference_id untrusted

Lines 318-374 (handleCheckoutCompleted): validate client_reference_id as UUID, prefer existing stripe_customer_id→user mapping, refuse overwrite of existing customer_id on a user row.

**File:line:** `web/src/app/api/stripe/webhook/route.js:318-417`

**Evidence:**
```typescript
// Step 1: resolve by existing customer → user mapping if one exists.
let userRow = null;
if (customerId) {
  const { data } = await service
    .from('users')
    .select('id, stripe_customer_id, plan_id, plan_status, frozen_at, plan_grace_period_ends_at')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (data) userRow = data;
}

// Step 3: the resolved row must match the claimed id.
if (userRow.id !== claimedUserId) {
  throw new Error(
    `checkout.session.completed: customer/user mismatch (claimed=${claimedUserId}, resolved=${userRow.id}).`
  );
}

// Step 4: only write the customer mapping on a first-seen row. Never overwrite.
if (customerId) {
  if (userRow.stripe_customer_id && userRow.stripe_customer_id !== customerId) {
    throw new Error(
      `checkout.session.completed: user ${userRow.id} already bound to a different stripe_customer_id; refusing overwrite.`
    );
  }
  if (!userRow.stripe_customer_id) {
    await service
      .from('users')
      .update({ stripe_customer_id: customerId })
      .eq('id', userRow.id)
      .is('stripe_customer_id', null);
  }
}
```

**Impact:** Prevents attacker with compromised Stripe key from using checkout webhook to reassign a victim's Stripe customer to their own account, stealing ongoing subscriptions.

**Confidence:** HIGH (code-reading only; requires Stripe key compromise to exploit)

---

### F-A5-6 — Stripe webhook idempotency via webhook_log event_id UNIQUE constraint solid

Lines 86-168 claim processing_status='processing' atomically via UNIQUE event_id constraint. Stuck rows >5min are reclaimed. Replays return 200 immediately. Failed rows can be retried.

**File:line:** `web/src/app/api/stripe/webhook/route.js:86-168`

**Evidence:**
```typescript
// B4: stuck-processing reclaim window
const STUCK_PROCESSING_SECONDS = 5 * 60;

// Step A: atomic claim
const { data: inserted, error: insertError } = await service
  .from('webhook_log')
  .insert({
    source: 'stripe',
    event_type: event.type,
    event_id: event.id,
    payload: event,
    processing_status: 'processing',
    signature_valid: true,
  })
  .select('id')
  .maybeSingle();

// Reclaim if stuck
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
}
```

**Impact:** Prevents double-execution of billing RPCs (which would cause state corruption) while recovering from transient timeouts.

**Confidence:** HIGH

---

## LOW

### F-A5-7 — Apple receipt replay / anti-replay (B14) uses signedDate windows; tight for S2S, loose for sync

Transaction JWS sync: 24h window (line 49: SIGNED_DATE_MAX_AGE_TRANSACTION_MS).
Notification JWS: 5m window (line 48: SIGNED_DATE_MAX_AGE_NOTIFICATION_MS).
Both validate future-skew (FUTURE_SKEW_MS = 5m).

**File:line:** `web/src/lib/appleReceipt.js:48-49, 51-64, 196-200, 223-227`

**Evidence:**
```typescript
const SIGNED_DATE_MAX_AGE_NOTIFICATION_MS = 5 * 60 * 1000;
const SIGNED_DATE_MAX_AGE_TRANSACTION_MS = 24 * 60 * 60 * 1000;

function assertSignedDateFresh(signedDate, maxAgeMs, context) {
  if (typeof signedDate !== 'number') {
    throw new Error(`${context}: signedDate missing`);
  }
  const now = Date.now();
  if (signedDate > now + FUTURE_SKEW_MS) {
    throw new Error(`${context}: signedDate is in the future`);
  }
  if (now - signedDate > maxAgeMs) {
    throw new Error(`${context}: signedDate older than allowed window`);
  }
}
```

**Rationale:** Sync can arrive stale if user pairs device a day after purchase elsewhere (24h tolerance). S2S is near-realtime so 5m is appropriate.

**Confidence:** MEDIUM (assumptions on typical clock skew + Apple retry schedule; no hardening against device clocks set to past dates)

---

### F-A5-8 — Grace-period logic in webhook (uncancel) + RPC + nightly sweeper present; interdependencies not audited for timing gaps

Uncancel path (line 439-469 / handleSubscriptionUpdated): clears plan_grace_period_ends_at when cancel_at_period_end flips false.
Nightly sweeper RPC (billing_freeze_expired_grace) triggered by /api/admin/billing/sweep-grace.
Plan-change / resubscribe paths (billing_change_plan / billing_resubscribe) both clear plan_grace_period_ends_at.

**File:line:** `web/src/app/api/stripe/webhook/route.js:439-469`

**Evidence:**
```typescript
// DA-159 — un-cancel. User had scheduled cancellation, then clicked
// "Keep subscription" in Stripe Portal.
if (!sub.cancel_at_period_end && userRow.plan_grace_period_ends_at) {
  try {
    await service.rpc('billing_uncancel_subscription', {
      p_user_id: userRow.id,
    });
  } catch (rpcErr) {
    // RPC may not exist in older DBs yet. Fall back to direct column clear.
    if (/billing_uncancel_subscription/i.test(rpcErr?.message || '')) {
      await service
        .from('users')
        .update({
          plan_grace_period_ends_at: null,
          plan_status: 'active',
        })
        .eq('id', userRow.id);
      await service.from('audit_log').insert({
        actor_id: userRow.id,
        action: 'billing:uncancel_fallback',
        target_type: 'user',
        target_id: userRow.id,
        metadata: { source: 'stripe_webhook', customer_id: customerId },
      });
    } else {
      throw rpcErr;
    }
  }
}
```

**Impact:** Users can cancel + un-cancel subscriptions via Stripe Portal. State is correct IF uncancel event arrives before the 7-day grace expires. If nightly sweeper runs before un-cancel webhook, user is frozen despite paying. Conversely, if webhooks arrive out-of-order (cancel after uncancel), user may keep grace-period state after paying.

**Repro:** Manual test required (Stripe Portal cancel → un-cancel → time-dependent interleaving with sweeper cron).

**Confidence:** LOW (timing-dependent; hard to hit in practice but theoretically possible)

---

## UNSURE

### F-A5-9 — Tier ordering consistency (TIER_ORDER vs schema sort_order)

Code hardcodes TIER_ORDER = ['free', 'verity', 'verity_pro', 'verity_family', 'verity_family_xl'] in `web/src/lib/plans.js:12`.
getPlans() sorts by `plans.sort_order` from the database (line 152).
No explicit verification that sort_order values match TIER_ORDER's intended rank.

**File:line:** `web/src/lib/plans.js:12, 145-156`

**Evidence:**
```typescript
export const TIER_ORDER = ['free', 'verity', 'verity_pro', 'verity_family', 'verity_family_xl'];

export async function getPlans(supabase) {
  const { data } = await supabase
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  _cache = data || [];
  _cacheTime = Date.now();
  return _cache;
}
```

**Question:** Does the database seed (schema/reset_and_rebuild_v2.sql) assign sort_order values that match TIER_ORDER's rank? Downgrades / upgrades logic depends on price_cents comparison (billing_change_plan line 304), not tier rank, so a sort_order mismatch doesn't break state machine, but it could confuse admin UI sort order if they're inconsistent.

**To resolve:** Inspect reset_and_rebuild_v2.sql INSERT INTO plans and verify sort_order = index in TIER_ORDER.

**Confidence:** LOW (need DB verification; no evidence of user-visible malfunction)

---

