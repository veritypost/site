---
wave: A
group: 5 Billing
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Billing, Wave A, Agent 2

## CRITICAL

### F-52-1 — Billing RPCs now call `bump_user_perms_version` (B1 FIXED)
**File:line:** `schema/148_billing_rpcs_bump_perms_version.sql:91-93, 157, 247, 352`
**Evidence:**
Migration 148 introduced `PERFORM bump_user_perms_version(p_user_id)` at the end of all four billing RPCs: `billing_cancel_subscription`, `billing_freeze_profile`, `billing_resubscribe`, and `billing_change_plan`. This fix ensures that every plan-state mutation invalidates the user's perms cache immediately, closing the window where clients retain stale cached permissions after webhook-driven plan changes.

Prior state (pre-148): webhooks called these RPCs but neither the routes nor the RPCs themselves bumped perms_version, leaving paid users unable to access paid features after upgrade and frozen users retaining paid feature access after freeze until the default 60s TTL expired.

**Impact:** NONE — this is a fix. B1 is now closed.
**Reproduction:** Verify `billing_change_plan`, `billing_resubscribe`, `billing_cancel_subscription`, and `billing_freeze_profile` all call `bump_user_perms_version` in their bodies.
**Suggested fix direction:** N/A (already fixed).
**Confidence:** HIGH — code review confirms fix is in place at anchor SHA.

---

## HIGH

### F-52-2 — B3 receipt hijack defense implemented on both iOS sync paths
**File:line:** `web/src/app/api/ios/subscriptions/sync/route.js:96-122, 195-210` and `web/src/app/api/ios/appstore/notifications/route.js:230-250`
**Evidence:**
Layer 1 (sync endpoint): `payload.appAccountToken` is compared against bearer-token `userId` (case-insensitive). A mismatch is rejected 403.
Layer 2 (notification endpoint): `transaction.appAccountToken` is compared against stored `subscriptions.user_id`. Mismatches reject the event without state change.
Both layers include backward-compat guards (`payload.appAccountToken &&`) for pre-token receipts, which still benefit from the Layer 2 check (existing subscription row lookup).

**Impact:** Prevents an attacker from using a captured iOS receipt (JWS-signed by Apple) to hijack a victim's subscription state if the attacker can send the sync request or the notification arrives out-of-order. The two-layer check ensures even pre-token receipts can't be silently reassigned.
**Reproduction:** Code-reading only.
**Suggested fix direction:** Already hardened; no changes needed.
**Confidence:** HIGH.

---

### F-52-3 — B14 anti-replay (signedDate freshness) implemented for iOS receipts
**File:line:** `web/src/lib/appleReceipt.js:48-49, 51-64, 196-200`
**Evidence:**
Transactions have a 24-hour freshness window (SIGNED_DATE_MAX_AGE_TRANSACTION_MS). Notifications have a 5-minute window (SIGNED_DATE_MAX_AGE_NOTIFICATION_MS). Both are enforced via `assertSignedDateFresh()`, which rejects receipts older than the window OR signed in the future (>5 min skew).
This prevents replay of captured receipts — an attacker can't re-mint a subscription using a stale transaction JWS because Apple re-signs receipts on each fetch; a 24h-old signedDate is treated as suspicious.

**Impact:** Closes a critical replay attack on iOS subscriptions where captured receipts could be re-submitted after cancellation or refund to restore paid state.
**Reproduction:** Code-reading only.
**Suggested fix direction:** No changes needed; hardening is in place.
**Confidence:** HIGH.

---

### F-52-4 — B6 `invoice.upcoming` coverage complete
**File:line:** `web/src/app/api/stripe/webhook/route.js:855-891`
**Evidence:**
The `handleInvoiceUpcoming` function:
- Resolves user via `lookupUserAndPlan(customerId)` (line 865)
- Formats amount_due in dollars + currency (line 867-871)
- Calls `create_notification` RPC to emit an in-app notification (line 872-887)
- Best-effort error handling — swallows DB errors so webhook ACK is fast (line 888-890)
The notification carries action_url='/profile/settings/billing' so users can update their card before renewal.

**Impact:** Users receive a heads-up 7 days before card charge, allowing them to fix expired cards before the charge fails.
**Reproduction:** Manually trigger an invoice.upcoming event in Stripe dashboard for a test customer; verify notification appears in app.
**Suggested fix direction:** None — implementation is complete.
**Confidence:** HIGH.

---

## MEDIUM

### F-52-5 — Billing RPC atomicity: exception guards are correct but fragile
**File:line:** `schema/148_billing_rpcs_bump_perms_version.sql:263-362`
**Evidence:**
The RPC body raises EXCEPTION on invalid inputs (frozen user, missing plan, etc.) at lines 285-296, 304-305. The `bump_user_perms_version` call at line 352 is only reached if all guards pass. If an exception is raised, no perms bump occurs — which is correct (no state changed) — but the design assumes callers handle the exception cleanly and don't retry with different parameters.

The web route `/api/billing/change-plan` (line 95-98) calls the RPC and returns its error directly via `safeErrorResponse()`, so exception info does surface. However, if the RPC times out or Postgres crashes mid-transaction, the user's perms_version is correctly unchanged (atomicity is preserved).

**Impact:** NONE if no bug — the RPC is atomic (exception = rollback). But if the guard logic is ever weakened (e.g., accepting frozen users), the perms bump would be skipped, re-opening the B1 window.
**Reproduction:** Code-reading only.
**Suggested fix direction:** Add a post-fix audit in 3-6 months to verify no guard-weakening PRs have landed.
**Confidence:** MEDIUM — the current code is correct, but guard maintenance is a future risk.

---

### F-52-6 — Audit_log not emitted by billing RPCs themselves; only by webhook handlers
**File:line:** `schema/148_billing_rpcs_bump_perms_version.sql` (no audit_log) vs. `web/src/app/api/stripe/webhook/route.js:523-556` (audit_log inserted)
**Evidence:**
The four billing RPCs (`billing_cancel_subscription`, `billing_freeze_profile`, `billing_resubscribe`, `billing_change_plan`) do NOT insert into `audit_log`. Only the Stripe webhook handler (and iOS notification handler) insert audit_log rows for billing events.

Direct callsites that bypass webhooks — e.g., user directly calling `/api/billing/change-plan` — will NOT emit audit_log because the RPC doesn't. The Stripe webhook mirrors failures to audit_log (line 238-250), but successful calls from the web routes do not.

**Impact:** Admin compliance view (audit_log table) is incomplete for billing mutations that don't flow through webhooks. User-facing changes via web UI (cancel, resubscribe, plan change) are missing the audit trail. Stripe-driven changes (webhook) and iOS-driven changes (notification) are logged.
**Reproduction:** User cancels subscription via `/api/billing/cancel`. Check audit_log for `billing:cancel*` entries — none will exist. The `subscriptions.cancelled_at` and `users.plan_grace_period_ends_at` state changes are visible, but the audit log is silent.
**Suggested fix direction:** Have billing RPCs emit audit_log directly (matching the Stripe webhook's best-effort pattern), or add route-level audit writes to `/api/billing/*` endpoints.
**Confidence:** HIGH — this is a coverage gap, not a safety bug.

---

### F-52-7 — `_resolveFreePlanId` in plans.js does not validate tier consistency
**File:line:** `web/src/lib/plans.js:189-193`
**Evidence:**
The helper searches `plans.find((p) => p.tier === 'free' || p.name === 'free')`. It returns the first match by creation order in the array, not by sort_order or any explicit ranking. If two rows have tier='free' or name='free' (corruption, bad migration), the wrong one may be returned.

The TIER_ORDER constant (line 12) defines the canonical tier order, but `_resolveFreePlanId` does not use it. If a future migration changes plan row UUIDs or a cleanup script is misconfigured, a mismatched free plan could be returned.

**Impact:** For most callsites (bookmarks cap, breaking-news alerts, feature limits), using the wrong free-plan row means the wrong feature limits apply. Low severity because the `free` tier should have identical limits across any rows (but there should only be one).
**Reproduction:** Corrupt the plans table to have two rows with tier='free'. Call `getPlanLimit(supabase, null, 'bookmarks')`. The first free-tier row's limits are used, which may not match the user's effective free plan.
**Suggested fix direction:** Change `_resolveFreePlanId` to return the plan with the lowest sort_order among tier='free' rows to enforce tier order consistency.
**Confidence:** MEDIUM — unlikely to occur in practice (only one free row expected), but the code is fragile.

---

## UNSURE

### F-52-8 — Grace-period expiry mechanism not explicitly verified in code
**File:line:** `schema/148_billing_rpcs_bump_perms_version.sql:34-101` (billing_cancel_subscription) and `web/src/app/api/admin/billing/sweep-grace/route.js:40` (calls billing_freeze_expired_grace RPC)
**Evidence:**
`billing_cancel_subscription` checks `plan_grace_period_ends_at IS NOT NULL` (line 57-60) and raises an exception if already set, blocking double-cancels. However, the nightly sweeper (`billing_freeze_expired_grace` RPC) is called only via `/api/admin/billing/sweep-grace` or a production cron; there's no explicit evidence in the code that the cron is configured.

If the cron never runs (misconfigured, disabled), users in grace periods will never auto-freeze when the 7 days elapse. The sweeper RPC body is referenced but not shown; need to verify it exists and is callable.

**Impact:** Users who cancel subscriptions could linger in a grace period (paid features still accessible) indefinitely if the nightly sweep doesn't run.
**Reproduction:** Cannot fully repro without cron audit; requires checking production cron config.
**Suggested fix direction:** (1) Verify the nightly cron is scheduled and active. (2) Add a log entry or monitor so missing sweeper runs are visible. (3) Consider a time-bounded check in the user permissions RPC that freezes directly if grace_period_ends_at is in the past, regardless of sweeper status (defense-in-depth).
**Confidence:** LOW — sweeper may be active in production, but the code doesn't prove it.

---

## Summary
**Total findings: 8 (1 CRITICAL as "fixed", 4 HIGH, 3 MEDIUM, 1 UNSURE).**

B1, B3, B6, B14 audit items are closed with strong implementations. F-52-6 (audit_log gap for web-routed billing mutations) is the only moderate gap; F-52-7 and F-52-8 are low-risk maintenance concerns.
