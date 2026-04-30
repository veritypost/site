# Slice 06: Billing & subscription

**Status:** shipped
**Session:** 10 (2026-04-30)
**Adversarial review:** completed — all 11 issues confirmed; 2 new issues added (06-12, 06-13); 3 fix-plan gaps absorbed below.

---

## Surface summary

- `web/src/app/billing/page.tsx` — redirect shim to `/profile/settings#billing`; no UI, no bugs.
- `web/src/app/pricing/page.tsx` — fully static server component; no fetches; clean.
- `web/src/app/profile/settings/_cards/BillingCard.tsx` — main billing UI (portal, cancel, resume).
- `web/src/app/appeal/page.tsx` — user penalty appeal page.
- `web/src/app/api/billing/cancel/route.js` — clean (try/catch present, error surfaced).
- `web/src/app/api/billing/change-plan/route.js` — unguarded `request.json()`.
- `web/src/app/api/billing/resubscribe/route.js` — unguarded `request.json()`.
- `web/src/app/api/stripe/checkout/route.js` — clean (try/catch, idempotency key, validation all present).
- `web/src/app/api/stripe/portal/route.js` — clean (customer_id check, try/catch, null URL guard).
- `web/src/app/api/stripe/webhook/route.js` — signature verification, idempotency, and event routing all correct; 7 DB write sites lack error checks.
- `web/src/app/profile/settings/billing/page.tsx` — redirect shim that preserves `?success=1`; param never consumed downstream.
- `web/src/app/profile/_components/ProfileApp.tsx` — `searchParams` touched but `success` param never read.
- No FK hints found in any billing file (no `.select()` with `!` syntax). FK check: clean.

---

## Issues

### 06-00 (P1) — `resume()` sends no body; resume is permanently broken
**Status:** shipped — `01b188a` (client) + `023b2e0` (backend)

**Files:**
- `web/src/app/profile/settings/_cards/BillingCard.tsx:135`
- `web/src/app/api/billing/resubscribe/route.js:32`

**Root cause (dual-layer):**
1. `BillingCard.tsx:135`: `fetch('/api/billing/resubscribe', { method: 'POST' })` — no body, no Content-Type.
2. `resubscribe/route.js:32`: `const { planName } = await request.json()` — no try/catch; empty body → SyntaxError → 500.
3. Even if the backend were fixed to swallow the parse error, it would return 400 "planName required". The frontend never sends the name.

**Fix:**
1. `BillingCard.tsx:135`: add `headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planName: plan?.name })`. `plan` is in scope (declared line 51, populated line 77).
2. `resubscribe/route.js:32`: change to `const { planName } = await request.json().catch(() => ({}))` — matches the pattern already used in `checkout/route.js:47`.

**Adversarial gap absorbed:** both layers required. Backend-only fix still returns 400.

---

### 06-01 (P1) — BillingCard load: no try/catch + Supabase errors discarded
**Status:** shipped — `01b188a`

**File:** `web/src/app/profile/settings/_cards/BillingCard.tsx:56-80`

**Root cause:** The async IIFE starting at line 58 has no try/catch. If the Supabase client throws (network, auth failure), `setLoading(false)` at line 79 is never called → spinner stuck forever. Additionally, `sRes.error` (query at lines 59-65) and `pRes.error` (lines 71-75) are never checked — Supabase failures return `{ data: null, error }` without throwing; these are silently coerced to `null` via `sRes.data ?? null`.

**Fix:**
- Add top-level try/catch around the IIFE body; in catch: `setLoading(false)`.
- After `sRes`, check `if (sRes.error) { setLoading(false); return; }` — surface no subscription state rather than falsely showing free tier.
- After `pRes`, check `if (pRes.error)` — leave plan as null (UI handles gracefully).

---

### 06-02 (P1) — Appeal `load()`: no try/catch + Supabase errors discarded
**Status:** shipped — `01b188a`

**File:** `web/src/app/appeal/page.tsx:38-66`

**Root cause:** `load()` has no try/catch. Two Supabase queries discard `.error`:
- Line 50-54: profile query (`is_banned`, `is_muted`, `muted_until`) — on failure `profile` is `undefined` → `hasPenalty` set false → user with active penalty sees "No active penalties" instead of their appeal list.
- Lines 59-63: warnings query — on failure `data` is `undefined` → `setWarnings([])` → empty list.
If an exception is thrown before line 65, `setLoading(false)` is never called → spinner stuck.

**Fix:**
- Wrap `load()` body in try/catch; in catch: `setLoading(false)`.
- Add `const { data: profile, error: profileErr } = ...` at line 50; on `profileErr`, set a user-visible error state and return early.
- Add `const { data, error: warnErr } = ...` at line 59; on `warnErr`, set error state and return early.

---

### 06-03 (P1) — Appeal submit button: no disabled state → double-fire
**Status:** shipped — `01b188a`

**File:** `web/src/app/appeal/page.tsx:212`

**Root cause:** `submitAppeal(w.id)` is async (fetch to `/api/appeals`), but the "File appeal" button at line 212 has no `disabled` prop and no loading state. A user can click it multiple times while the request is in-flight, submitting duplicate appeals.

**Fix:**
- Add `const [submitting, setSubmitting] = useState<string | null>(null)` (tracks which warning ID is in flight).
- In `submitAppeal`: `setSubmitting(id)` before fetch, clear in a `finally` block.
- Button: `disabled={submitting === w.id}`, cursor/opacity conditional matching the pattern used in other pages.

---

### 06-04 (P1) — Webhook `handleCustomerDeleted`: cancel UPDATE error silently discarded → freeze skipped
**Status:** shipped — `2bccb70`

**File:** `web/src/app/api/stripe/webhook/route.js:1175-1186`

**Root cause:**
```js
const { data: cancelledRows } = await service
  .from('subscriptions')
  .update({ status: 'cancelled', ... })
  ...
  .select('id, stripe_subscription_id');
const cancelledIds = (cancelledRows || []).map((r) => r.id);
```
Only `data` is destructured; `error` is discarded. If the UPDATE fails, `cancelledRows` is `null` → `cancelledIds = []`. Line 1193: `if (!userRow.frozen_at && cancelledIds.length > 0)` → `false` → **freeze is silently skipped**. Account remains active despite Stripe customer deletion.

**Fix:**
- Destructure `{ data: cancelledRows, error: cancelErr }`.
- `if (cancelErr) throw new Error(\`customer.deleted: subscriptions cancel failed: ${cancelErr.message}\`)` — webhook returns 500, Stripe retries; retry is safe because no active rows will match.

---

### 06-05 (P1) — `resubscribe` and `change-plan` routes: unguarded `request.json()`
**Status:** shipped — `023b2e0`

**Files:**
- `web/src/app/api/billing/resubscribe/route.js:32`
- `web/src/app/api/billing/change-plan/route.js:29`

**Root cause:** Both routes call `await request.json()` without try/catch. Missing or malformed body → SyntaxError → unhandled exception → 500. `resubscribe/route.js` is also the backend half of 06-00.

**Fix:** Change both to `await request.json().catch(() => ({}))` — matches `checkout/route.js:47` pattern. Validation at the next line (`if (!planName)`) then returns the correct 400.

---

### 06-06 (P2) — Webhook `handleCheckoutCompleted`: `stripe_customer_id` UPDATE error discarded
**Status:** shipped — `28f76cd`

**File:** `web/src/app/api/stripe/webhook/route.js:456-460`

**Root cause:** `await service.from('users').update({ stripe_customer_id: customerId })...` — no error check. If UPDATE fails (constraint, network), user's customer ID is unbound but billing state proceeds → orphan subscription without customer binding.

**Fix:** `const { error: bindErr } = await service...`; `if (bindErr) throw new Error(...)`.

---

### 06-07 (P2) — Webhook `handlePaymentSucceeded`: grace period UPDATE error discarded
**Status:** shipped — `28f76cd`

**File:** `web/src/app/api/stripe/webhook/route.js:1053-1059`

**Root cause:** `await service.from('users').update({ plan_grace_period_ends_at: null, plan_status: 'active' })...` — no error check. If UPDATE fails, grace period is not cleared but `bump_user_perms_version` at line 1066 is called → user's perms are bumped to "active" while DB still shows grace period → inconsistent state.

**Fix:** Destructure and check error; throw on failure so webhook returns 500 and Stripe retries.

---

### 06-08 (P2) — Webhook `handleCustomerDeleted`: customer ID clear error discarded
**Status:** shipped — `28f76cd`

**File:** `web/src/app/api/stripe/webhook/route.js:1210-1214`

**Root cause:** `await service.from('users').update({ stripe_customer_id: null })...` — no error check. If UPDATE fails, stale `stripe_customer_id` stays on user row; future checkout may reuse deleted Stripe customer.

**Fix:** Destructure and check error; `console.error` + throw on failure.

---

### 06-09 (P2) — Webhook `handleSubscriptionUpdated` fallback UPDATE: error discarded
**Status:** shipped — `28f76cd`

**File:** `web/src/app/api/stripe/webhook/route.js:590-596`

**Root cause:** Inside a catch block for `billing_uncancel_subscription`, a fallback direct UPDATE clears `plan_grace_period_ends_at`. No error check — if this UPDATE also fails, the state is not cleared, but the bump RPC at line 600 continues → inconsistent state.

**Fix:** `const { error: fallbackErr } = await service...`; if error: `console.error` and rethrow (webhook returns 500, Stripe retries; retry will hit the RPC again which may succeed, or skip if the data already changed).

---

### 06-10 (P2) — Post-checkout: `?success=1` param consumed by no one; no toast, no perms refresh
**Status:** shipped — `df4620a`

**Files:**
- `web/src/app/profile/settings/billing/page.tsx:7` (comment states intent, redirect chain preserves param)
- `web/src/app/profile/_components/ProfileApp.tsx:469-470` (searchParams touched but `success` never read)

**Root cause:** After Stripe checkout the user lands at `/profile/settings?section=plan&success=1`. `ProfileApp.tsx` reads `searchParams` but only uses `void searchParams` at line 470 — it never checks `searchParams.get('success')`. No toast fires, no perms refresh is triggered. User has no visual confirmation that checkout succeeded, and plan gates stay stale until the 60-second permission poll fires.

**Fix:** In `ProfileApp.tsx`, add a `useEffect` that depends on `[resolved, searchParams]`:
- When `resolved && searchParams.get('success') === '1'`: call `toast.success('Subscription updated.')`, call `refreshAllPermissions()`, then `setPermsTick((t) => t + 1)` to force the section list to re-render with new plan state, then `router.replace('/profile/settings?section=plan')` to strip the param.
- Import `refreshAllPermissions` from `@/lib/permissions`.

---

### 06-11 (P3) — Webhook default case: comment says "logged" but no log call
**Status:** shipped — `45cdd99`

**File:** `web/src/app/api/stripe/webhook/route.js:239-241`

**Root cause:** `default: // Unknown event types are logged but not treated as errors. break;` — comment claims logging but `console.log` is absent. Unknown event types return 200 silently.

**Fix:** Add `console.log('[stripe.webhook] unhandled event type:', event.type)` before the `break`.

---

### 06-12 (P2) — Webhook `handleChargeRefunded`: auto-freeze RPC error discarded
**Status:** shipped — `28f76cd`

**File:** `web/src/app/api/stripe/webhook/route.js:717`

**Root cause:**
```js
if (autoFreeze) {
  await service.rpc('billing_freeze_profile', { p_user_id: userRow.id });
  // ... best-effort notification ...
}
```
The `billing_freeze_profile` RPC result is not destructured. If the RPC fails (Supabase error), the error is discarded and the handler continues — the user is not frozen despite a full refund.

**Fix:** `const { error: freezeErr } = await service.rpc(...)` ; `if (freezeErr) throw new Error(...)` — webhook returns 500, Stripe retries.

---

### 06-13 (wont-fix) — Webhook `handleSubscriptionUpdated` fallback: bump error logged, not rethrown
**File:** `web/src/app/api/stripe/webhook/route.js:603-605`

**Decision:** `bumpErr` is already logged (`console.error`). Not rethrowing is a design choice — the uncancel itself succeeded; a failed perms bump means the cache will catch up within 60 seconds via PermissionsProvider polling. Rethrowing would cause unnecessary Stripe retries for a completed state change. **Wont-fix.**

---

## Implementation order

1. **Commit 1 (P1 client):** 06-00 frontend + 06-01 + 06-02 + 06-03
2. **Commit 2 (P1 API routes):** 06-05 + 06-00 backend
3. **Commit 3 (P1 webhook):** 06-04
4. **Commit 4 (P2 webhook batch):** 06-06 + 06-07 + 06-08 + 06-09 + 06-12
5. **Commit 5 (P2 post-checkout):** 06-10
6. **Commit 6 (P3 logging):** 06-11
