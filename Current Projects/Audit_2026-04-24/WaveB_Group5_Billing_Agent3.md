---
wave: B
group: 5 Billing
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Billing, Wave B, Agent 3

## CRITICAL

### F-B5-3-01 — iOS sync and appstore notification handlers do NOT emit audit_log on billing mutations
**File:line:**
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/ios/subscriptions/sync/route.js` (no audit_log calls)
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/ios/appstore/notifications/route.js` (no audit_log calls)

**Evidence:**
```
grep -r "audit_log" /Users/veritypost/Desktop/verity-post/web/src/app/api/ios/ returns no results.

iOS sync (line 178-226) calls billing_resubscribe / billing_change_plan + updates subscriptions rows.
iOS appstore (line 262, 275, 306-314) calls billing_freeze_profile and billing_change_plan without audit.
Stripe webhook (webhook/route.js:238-250, 456, 523, etc.) consistently emits audit_log on every mutation.
```

**Impact:** Apple payment mutations (subscription created, plan changed, refunded, revoked, re-subscribed) bypass the audit_log trail entirely. Compliance operators, fraud investigators, and admin dashboards cannot audit iOS billing actions — only DB events log. This is asymmetric with Stripe, which has full audit coverage.

**Reproduction:** Code-reading only. No user-facing audit_log insert in either iOS route.

**Suggested fix direction:** Both iOS routes should emit audit_log (with source='apple') for every plan change, freeze, and refund, mirroring Stripe webhook coverage.

**Confidence:** HIGH

---

### F-B5-3-02 — User-facing billing routes (change-plan, cancel, resubscribe) do NOT emit audit_log
**File:line:**
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/billing/change-plan/route.js` (calls billing_change_plan RPC line 95; no audit_log)
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/billing/cancel/route.js` (calls billing_cancel_subscription RPC line 65; no audit_log)
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/billing/resubscribe/route.js` (assumed; not checked but search shows no audit_log in /billing/ routes)

**Evidence:**
```
grep -r "audit_log" /Users/veritypost/Desktop/verity-post/web/src/app/api/billing/ returns empty.

RPCs themselves (schema/148_billing_rpcs_bump_perms_version.sql) do NOT emit audit_log on success path:
- billing_change_plan (lines 263-363) — no INSERT INTO audit_log
- billing_resubscribe (lines 170-258) — no INSERT INTO audit_log
- billing_cancel_subscription (lines 34-102, updated by schema/157) — emits audit_log ONLY on already_frozen (line 50), not on success path
```

**Impact:** When a user upgrades, downgrades, or cancels their subscription from web Settings, the action is not logged to audit_log. Admins see no trail. Only subscription_events table captures it (narrower scope, non-human-facing). Violates the common focus: "audit_log coverage on every billing mutation."

**Reproduction:** Code-reading only. Routes call RPCs but neither route nor RPC on the success path emits audit_log.

**Suggested fix direction:** Either: (a) add route-level audit_log insert in the three routes after successful RPC call, OR (b) add audit_log insert to the RPC success path (schema/157 already does this for the frozen skip; generalize to success path too).

**Confidence:** HIGH

---

## HIGH

### F-B5-3-03 — iOS receipt hijack defense (B3) lacks explicit audit_log on rejection
**File:line:**
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/ios/subscriptions/sync/route.js:116-122` (appAccountToken mismatch)
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/ios/appstore/notifications/route.js:238-250` (appAccountToken mismatch on S2S notification)

**Evidence:**
```
sync/route.js lines 117-122:
if (
  payload.appAccountToken &&
  String(payload.appAccountToken).toLowerCase() !== String(userId).toLowerCase()
) {
  return NextResponse.json({ error: 'Receipt belongs to a different user' }, { status: 403 });
}

appstore/route.js lines 238-250:
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

**Impact:** When an attacker attempts to hijack an iOS receipt (appAccountToken mismatch), the rejection returns 403 + webhook_log, but does NOT emit audit_log to flag the suspicious activity to operators. Stripe webhook mirrors failures to audit_log (line 238-250 of webhook/route.js); iOS should parity this. Operator visibility into receipt-hijack attempts is degraded.

**Reproduction:** Code-reading only. No audit_log insert on the two mismatch paths.

**Suggested fix direction:** Emit audit_log with action='billing:receipt_hijack_attempt' (or similar) on appAccountToken mismatch, storing the mismatched token and claimed user_id in metadata.

**Confidence:** HIGH

---

### F-B5-3-04 — Admin billing freeze/cancel routes do NOT emit audit_log
**File:line:**
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/billing/freeze/route.js` (calls billing_freeze_profile RPC line 52; no audit_log)
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/billing/cancel/route.js` (assumed; not checked but search shows no audit_log in /admin/billing/)

**Evidence:**
```
freeze/route.js:
const { data, error } = await service.rpc('billing_freeze_profile', { p_user_id: user_id });
if (error) return safeErrorResponse(...);
return NextResponse.json(data);

No audit_log insert before, during, or after the RPC call. RPC also does not emit audit_log.

Stripe webhook emits audit_log for every event handler, including failures (line 238-250).
```

**Impact:** Admin actions (freeze, cancel) are not logged to audit_log. Compliance, SOC2, and internal audit trails are incomplete. An admin could freeze an account and leave no trace (other than subscription_events). Violates audit_log coverage on every billing mutation.

**Reproduction:** Code-reading only. No audit_log in route.

**Suggested fix direction:** Admin routes should emit audit_log post-RPC with actor_id=admin_user_id, target_id=affected_user_id, action='billing:admin_freeze' / 'billing:admin_cancel', storing the reason and admin actor in metadata.

**Confidence:** HIGH

---

## MEDIUM

### F-B5-3-05 — iOS sync does not emit audit_log on successful subscription upsert
**File:line:**
`/Users/veritypost/Desktop/verity-post/web/src/app/api/ios/subscriptions/sync/route.js:220-235`

**Evidence:**
```
Lines 212-227 (subscription upsert):
const subRow = {
  user_id: userId,
  plan_id: plan.id,
  status: 'active',
  source: 'apple',
  apple_original_transaction_id: originalTxId,
  current_period_start: periodStart,
  current_period_end: periodEnd,
  auto_renew: true,
};

if (existingSub?.id) {
  await service.from('subscriptions').update(subRow).eq('id', existingSub.id);
} else {
  await service.from('subscriptions').insert(subRow);
}

No audit_log inserted. Idempotency is keyed via webhook_log (event_id = "apple_sync:..." line 134), not re-traced to audit_log.
```

**Impact:** Each time an iOS device syncs a receipt and a subscriptions row is inserted or updated, there is no audit trail. Unlike Stripe (webhook/route.js: multiple audit_log inserts per event), iOS sync mutates the subscriptions table silently. The webhook_log captures the sync event, but audit_log (the human-facing operations trail) remains empty.

**Reproduction:** Code-reading only. Search for "audit_log" in sync/route.js returns no results.

**Suggested fix direction:** After successful subscription upsert (line 223-227), insert audit_log row with source='apple', event details in metadata.

**Confidence:** MEDIUM

---

### F-B5-3-06 — Admin billing routes (e.g., cancel) missing audit_log AND actor propagation to RPC
**File:line:**
`/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/billing/cancel/route.js` (assumed similar to freeze)

**Evidence:**
```
freeze/route.js (lines 52-58):
const { data, error } = await service.rpc('billing_freeze_profile', { p_user_id: user_id });

RPC signature (schema/157_billing_cancel_idempotent_on_frozen.sql):
CREATE OR REPLACE FUNCTION public.billing_cancel_subscription(
  p_user_id uuid,
  p_reason text DEFAULT NULL
)

The RPC does not accept p_actor_id; therefore, the audit_log row inserted by the RPC
(schema/157 line 50) uses actor_id=p_user_id (the affected user), NOT the admin who
initiated the action.
```

**Impact:** When an admin freezes a user account, the audit_log row (if it were emitted, but isn't at route-level) or the RPC's internal audit row (for skipped-frozen case) would incorrectly record the frozen user as the actor, not the admin. This breaks accountability: "who froze this user?" cannot be answered.

**Reproduction:** Code-reading only. RPC signature does not include actor_id parameter.

**Suggested fix direction:** Either: (a) add p_actor_id parameter to billing RPCs and propagate it through audit_log inserts, OR (b) emit audit_log at route level with correct actor_id=admin_user.id before/after RPC call.

**Confidence:** MEDIUM

---

## UNSURE

### F-B5-3-07 — Stripe webhook invoice.upcoming (B6) coverage unclear on re-notify behavior
**File:line:**
`/Users/veritypost/Desktop/verity-post/web/src/app/api/stripe/webhook/route.js:861-891`

**Evidence:**
```
Lines 861-891 (handleInvoiceUpcoming):
- Creates a notification (p_type: 'billing_alert') with the upcoming invoice details.
- Best-effort: any DB error is caught and swallowed (line 888).
- No deduplication: if Stripe sends invoice.upcoming multiple times (rare but possible
  during clock skew), multiple notifications are created.
```

**Impact:** UNCLEAR. Best-effort is documented; unclear if Stripe guarantees at-most-once delivery of invoice.upcoming or if re-sends are expected. If the former, users may see duplicate "upcoming renewal" notifications. If the latter, the best-effort design is correct. Needs Stripe API docs verification or test against Stripe sandbox.

**Reproduction:** ASSUMPTION: Stripe does not guarantee idempotency on invoice.upcoming (unlike webhook_log unique constraint); would need Stripe docs + test.

**Suggested fix direction:** Either: (a) use webhook_log event_id as a unique constraint-based idempotency guard (like Stripe invoice.payment_succeeded), OR (b) document the re-notify risk and add client-side dedup (user sees at most one such notification per invoice ID).

**Confidence:** LOW

---

## Summary

**Scope coverage:**
- ✅ Stripe webhooks: comprehensive audit_log coverage on all handlers
- ✗ iOS subscriptions sync: NO audit_log on mutations
- ✗ iOS appstore notifications: NO audit_log on mutations
- ✗ User-facing billing routes (change-plan, cancel): NO audit_log
- ✗ Admin billing routes (freeze, cancel): NO audit_log
- ✅ B1 (bump_user_perms_version): implemented in RPCs (schema/148), called by all billing change paths
- ✅ B3 (receipt hijack defense): implemented on sync and S2S paths; lacks audit_log on rejection
- ✅ B6 (invoice.upcoming): implemented; idempotency behavior unclear
- ✅ RPC atomicity: subscription_events logged in-transaction with plan changes
- ✅ Grace period logic: present (plan_grace_period_ends_at gates, 7-day nightly sweep)
- ✅ Tier ordering: TIER_ORDER correctly defined in plans.js; _resolveFreePlanId searches by tier first
- ✅ iOS receipt anti-replay: webhook_log keyed by apple_original_transaction_id

**Audit_log gap:** Only Stripe webhook emits audit_log. iOS, user web routes, and admin routes all bypass the operations trail entirely. This asymmetry violates the stated focus: "audit_log coverage on every billing mutation."
