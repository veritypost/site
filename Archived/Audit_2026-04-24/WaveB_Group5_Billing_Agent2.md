---
wave: B
group: 5 Billing
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Billing, Wave B, Agent 2

## CRITICAL

### F-B5-2-01 — `handlePaymentSucceeded` does not call `bump_user_perms_version`

**File:line:** `web/src/app/api/stripe/webhook/route.js:809-853`

**Evidence:**
```javascript
async function handlePaymentSucceeded(service, invoice) {
  // ... finds userRow, checks if clearing is needed ...
  await service
    .from('users')
    .update({
      plan_grace_period_ends_at: null,
      plan_status: 'active',
    })
    .eq('id', userRow.id);

  await service.from('audit_log').insert({
    // ... audit record ...
  });
}
```

`plan_status` changes from non-'active' to 'active', but no `bump_user_perms_version()` call. Schema 148 (lines 91-93) shows `billing_cancel_subscription` bumps on grace entry; `handlePaymentSucceeded` clears grace and restores 'active' without the corresponding cache invalidation.

**Impact:** After a payment succeeds and grace is cleared, the client keeps the stale perms_version and may miss paid-feature re-activation until the 60s TTL expires.

**Reproduction:** User cancels (grace entered, perms cache invalidated). Payment succeeds before grace expires. Webhook clears grace + restores 'active' but omits bump. Client never knows features are back.

**Suggested fix direction:** Call `PERFORM bump_user_perms_version(userRow.id);` before the audit_log insert.

**Confidence:** HIGH

---

### F-B5-2-02 — iOS `sync` endpoint calls `billing_resubscribe` / `billing_change_plan` but route does not re-check bearer token userId match on subscription write

**File:line:** `web/src/app/api/ios/subscriptions/sync/route.js:54-227`

**Evidence:**
```javascript
const userId = authData.user.id;
// ... JWS signature verified, appAccountToken cross-checked ...
await service.rpc('billing_resubscribe', {
  p_user_id: userId,
  p_new_plan_id: plan.id,
});
// ... later, subscription upsert WITHOUT user_id equality check ...
if (existingSub?.id) {
  await service.from('subscriptions').update(subRow).eq('id', existingSub.id);
} else {
  await service.from('subscriptions').insert(subRow);
}
```

Defense layer 2 (line 202-210) checks `existingSub.user_id !== userId` for UPDATE/INSERT safety. However, between the RPC call (which reads the user row) and the subscription upsert (which writes it), the user row could be modified by a concurrent request. If RLS is misconfigured or a service-role client is used without additional guards, the upsert could write to a different user's subscription row.

**Impact:** Under race conditions with concurrent syncs or RLS bypass, a receipt could be attached to a different user than the bearer token's userId.

**Reproduction:** Code-reading only; requires RLS misconfiguration or a second concurrent sync from a different device targeting the same originalTxId with a replayed/modified receipt.

**Suggested fix direction:** Re-verify `userId` matches the bearer token after the RPC, before the subscription upsert, or move the upsert into the RPC itself (atomic).

**Confidence:** MEDIUM

---

## HIGH

### F-B5-2-03 — `invoice.upcoming` notification best-effort but amounts unchecked for integer overflow or NaN

**File:line:** `web/src/app/api/stripe/webhook/route.js:861-891`

**Evidence:**
```javascript
const amountDollars = Number.isFinite(invoice.amount_due)
  ? (invoice.amount_due / 100).toFixed(2)
  : null;
```

`invoice.amount_due` comes from Stripe's JSON webhook payload. While `Number.isFinite()` guards against NaN/Infinity, a maliciously crafted Stripe-signed payload could include a very large integer (e.g., `Number.MAX_SAFE_INTEGER`). Division by 100 and `toFixed(2)` will produce a valid string, but the amount in the notification could be misleading (formatted as "9999999999999999.99 USD").

**Impact:** Misleading notification text if a Stripe API returns an out-of-range amount_due (low risk if Stripe's validation is strict, but the check here is incomplete).

**Reproduction:** Would require Stripe to send a malformed webhook with an unsafe integer, which is unlikely given Stripe's validation.

**Suggested fix direction:** Add a range check: `Number.isFinite(invoice.amount_due) && invoice.amount_due >= 0 && invoice.amount_due <= 10_000_000` (100k USD cap).

**Confidence:** MEDIUM

---

### F-B5-2-04 — `handleInvoiceUpcoming` is best-effort with no retry or durability; notifications can silently fail

**File:line:** `web/src/app/api/stripe/webhook/route.js:861-891`

**Evidence:**
```javascript
async function handleInvoiceUpcoming(service, invoice) {
  // ... no try-catch around the rpc call; errors bubble to the outer catch ...
  try {
    const { userRow } = await lookupUserAndPlan(service, customerId, null);
    if (!userRow) return;
    // ... build notification ...
    await service.rpc('create_notification', { /* ... */ });
  } catch {
    /* notification RPC best-effort — webhook ack takes precedence */
  }
}
```

Line 856 shows the entire handler is wrapped in a try-catch that swallows **all errors**. If the notification RPC fails or the user lookup fails, the handler returns silently without logging or surfacing the failure. B6 focus says "invoice.upcoming coverage" — the coverage exists but has no observability into silent failures.

**Impact:** User never sees the "upcoming renewal" notification, and there's no audit trail or alert that the notification creation failed.

**Reproduction:** Manually craft a Stripe webhook with `invoice.upcoming` to a user whose row is being deleted concurrently. The lookup fails, silently caught, no notification. Production: very low risk, but lack of logging makes operational debugging hard.

**Suggested fix direction:** Log the error before swallowing it: `console.warn('[stripe.webhook] invoice.upcoming notification failed:', err?.message)`.

**Confidence:** MEDIUM

---

## UNSURE

### U-B5-2-01 — Atomicity of `billing_change_plan` RPC: downgrade logic relies on price comparison without transactional guarantee

**File:line:** `schema/148_billing_rpcs_bump_perms_version.sql:304`

**Evidence:**
```sql
v_is_downgrade := COALESCE(v_old_plan.price_cents, 0) > v_new_plan.price_cents;
```

The price comparison determines whether `downgraded_at` and `downgraded_from_plan_id` are set. If the plans table is modified during the RPC (e.g., prices change between the plan lookups at lines 289-298 and the downgrade check), the classification could be wrong. However, this is inside a single RPC transaction with plan rows locked via the user row's FOR UPDATE, so the risk is low unless schema drift allows external plan updates mid-RPC.

**Reproduction:** Would require concurrent plan row mutation during the RPC, which is prevented by RLS and service_role exclusivity.

**Suggested fix direction:** None immediately needed; verify that plan rows cannot be mutated by concurrent requests (they should be immutable after seeding).

**Confidence:** LOW

