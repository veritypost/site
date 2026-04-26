---
round: 2
layer: 1
lens: L06-billing-end-to-end
anchor_sha: 10b69cb99552fd22f7cebfcb19d1bbc32ae177fe
---

# Lens Audit — L06 Billing End-to-End

## Summary

Walked the complete billing state machine across Stripe webhooks, Apple Server-to-Server notifications, iOS client sync, web user actions, admin controls, and promo redemption. Found 3 CRITICAL production issues (duplicate subscriptions rows, audit trail gaps, orphaned state transitions) and 2 HIGH issues (missing admin audit, concurrent provider divergence). State transition pattern is sound via RPCs + FOR UPDATE, but integration between web + iOS creates collision points.

## Findings

### Severity: CRITICAL

#### L06-001 — iOS/Web routes create duplicate subscriptions rows on billing RPC + update pattern

**File:line:**
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/ios/subscriptions/sync/route.js:178-227`
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/ios/appstore/notifications/route.js:287-332`

**What's wrong:** Both routes call `billing_resubscribe` or `billing_change_plan` RPC, which inserts a new `subscriptions` row with `source='manual'` and computed period dates. After the RPC returns, the routes unconditionally re-query for an existing subscription (by `apple_original_transaction_id`) and update/insert. The RPC-created row has `source='manual'` and NO `apple_original_transaction_id` column set, so the re-query always fails to find it. This triggers an unconditional INSERT (line 226 in sync route, line 331 in appstore route), creating a duplicate `subscriptions` row for the same original transaction.

**Evidence:**

```
// iOS sync route — billing RPC inserts, then orphans
if (userRow.frozen_at) {
  await service.rpc('billing_resubscribe', {
    p_user_id: userId,
    p_new_plan_id: plan.id,  // RPC inserts subscriptions with source='manual'
  });
} else {
  await service.rpc('billing_change_plan', {
    p_user_id: userId,
    p_new_plan_id: plan.id,  // RPC inserts subscriptions with source='manual'
  });
}

// ...later, query for existing sub by apple_original_transaction_id
const { data: existingSub } = await service
  .from('subscriptions')
  .select('id, user_id')
  .eq('apple_original_transaction_id', originalTxId)  // RPC row has NO apple_original_transaction_id
  .maybeSingle();

// Always inserts because existingSub is null (RPC row is unreachable)
if (existingSub?.id) {
  await service.from('subscriptions').update(subRow).eq('id', existingSub.id);
} else {
  await service.from('subscriptions').insert(subRow);  // DUPLICATE row
}
```

**Lens applied:** End-to-end state machine correctness. Duplicate rows break billing counts, subscription history queries, and cascade analytics (e.g., proration calculations). Each sync creates orphaned rows.

**New vs Round 1:** NEW

**Suggested disposition:** AUTONOMOUS-FIXABLE. Option A: Set `apple_original_transaction_id` in the RPC body (if called from iOS path, pass it). Option B: Delete the RPC-created row before the re-insert and create a single atomic insert. Option C (safer): Restructure iOS routes to skip the RPC if the subscriptions row already exists by `apple_original_transaction_id`.

---

#### L06-002 — handlePaymentSucceeded missing subscription_events audit trail

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/stripe/webhook/route.js:809-853`

**What's wrong:** `handlePaymentSucceeded` directly UPDATEs `users.plan_status` and `users.plan_grace_period_ends_at` without calling any RPC and WITHOUT writing to `subscription_events` table. Every other billing state change (`billing_change_plan`, `billing_cancel_subscription`, `billing_freeze_profile`, `billing_resubscribe`, `billing_unfreeze`) writes to `subscription_events`. This handler is the exception, creating an audit trail gap.

**Evidence:**

```javascript
// handlePaymentSucceeded (line 830-852)
await service
  .from('users')
  .update({
    plan_grace_period_ends_at: null,
    plan_status: 'active',
  })
  .eq('id', userRow.id);

await service.from('audit_log').insert({
  // ... audit logged
  // BUT NO subscription_events entry
});
```

**Lens applied:** State machine audit completeness. If a user's billing history is reconstructed from `subscription_events` (the business-logic table), a payment-succeeded state change is invisible. Forensic queries over subscription_events will show cancel → freeze but miss the intermediate payment-succeeded clearing of grace period.

**New vs Round 1:** NEW

**Suggested disposition:** AUTONOMOUS-FIXABLE. Add a `subscription_events` insert after the users UPDATE, recording the grace-period clearance as an event.

---

#### L06-003 — iOS+Web concurrent state divergence (no cross-provider synchronization)

**File:line:** Multiple: Stripe webhook (`/api/stripe/webhook/route.js`), Apple S2S (`/api/ios/appstore/notifications/route.js`), iOS sync (`/api/ios/subscriptions/sync/route.js`), web cancel (`/api/billing/cancel/route.js`), promo (`/api/promo/redeem/route.js`)

**What's wrong:** Four independent mutation paths can execute concurrently on the same user's billing state:
1. **Stripe webhooks** mutate `users.plan_id` via RPCs (e.g., `billing_freeze_profile` on subscription delete).
2. **Apple S2S notifications** mutate `users.plan_id` via RPCs (e.g., `billing_change_plan` on SUBSCRIBED).
3. **iOS client sync** mutate `users.plan_id` via RPCs on receipt validation.
4. **Web actions** mutate via RPCs (cancel, change-plan, promo redeem).

Each path writes independent `subscriptions` rows (different `source` values: 'stripe', 'apple', 'manual'). If Stripe and Apple events arrive concurrently for the same user, the RPC FOR UPDATE on the `users` row provides ordering, but the `subscriptions` table diverges: which provider's row is the canonical subscription?

Example: User on iOS with active Apple subscription. Stripe fires `customer.subscription.deleted` (legacy web checkout) → calls `billing_freeze_profile`. Simultaneously, Apple fires `SUBSCRIBED` (renewal) → calls `billing_change_plan`. Final state depends on execution order; both write separate `subscriptions` rows.

**Lens applied:** End-to-end consistency across billing providers. Users with both Stripe + Apple subscriptions can see conflicting payment status (frozen on web, active on iOS or vice versa).

**New vs Round 1:** NEW

**Suggested disposition:** OWNER-INPUT. Requires architectural decision on multi-provider subscriptions.

---

### Severity: HIGH

#### L06-004 — Admin billing freeze/cancel routes missing recordAdminAction (EXTENDS Round 1 C20)

**File:line:**
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/billing/freeze/route.js:52`
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/billing/cancel/route.js:54`

**What's wrong:** Both admin routes call destructive RPC methods (`billing_freeze_profile`, `billing_cancel_subscription`) without calling `recordAdminAction()`. Sibling routes that perform admin billing mutations (`/admin/billing/refund-decision`, `/admin/billing/audit`) correctly audit. This creates an audit trail blind spot: admins can freeze or cancel user accounts with zero recorded action.

**Lens applied:** Audit and compliance trail. Billing freeze/cancel are compliance-sensitive, destructive operations. Admin action log should capture who did what when.

**New vs Round 1:** EXTENDS_MASTER_ITEM_C20. Round 1 correctly flagged C20 ("Admin billing freeze/cancel missing audit_log"). This confirms presence.

**Suggested disposition:** AUTONOMOUS-FIXABLE. Import `recordAdminAction` and call after RPC succeeds.

---

#### L06-005 — subscription_events table has audit gaps for payment failure and refund paths

**File:line:**
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/stripe/webhook/route.js:770-796` (handlePaymentFailed)
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/stripe/webhook/route.js:705-768` (handleRefundUpdated)
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/stripe/webhook/route.js:564-611` (handleChargeDispute)

**What's wrong:** Three billing event handlers write to `audit_log` only; they do not write to `subscription_events`. When a refund is reversed, the audit trail shows unfrozen but not the original refund-triggered freeze. This makes the subscription timeline incomplete.

**Lens applied:** State machine auditability. If a user ends up frozen, the root cause (refund, dispute, chargeback) should be traceable.

**New vs Round 1:** NEW

**Suggested disposition:** AUTONOMOUS-FIXABLE. `handleRefundUpdated` (status='reversed') and `handleChargeDispute` (status='won') should write subscription_events to document the reason for unfreezing. `handlePaymentFailed` should not (payment failure is NOT a state change).

---

## OUTSIDE MY LENS

- **Promo+web concurrent mutation (H20):** `/api/promo/redeem` calls `billing_change_plan` RPC which bumps perms_version (via migration 148), so the H20 finding about missing bump may be resolved on live code.
- **Kids trial conversion** (Phase 15.2): `convert_kid_trial` RPC called inside billing RPCs. Correctness depends on that RPC.

