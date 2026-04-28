# Session 4 — Billing / Stripe / Apple StoreKit

**Status legend:** 🟦 open · 🟧 owner-decision pending · 🟨 depends on peer session · 🟩 shipped · 🟥 blocked

This file is the **self-contained operating manual** for Session 4. Source docs (`*_READ_ONLY_HISTORICAL.md` in `Ongoing Projects/`) are frozen historical reference. This session file is canonical — every constraint, every locked decision, every billing-risk warning, every owner-paired-test gate is inlined below. Do not assume any context outside this file.

---

## Owned paths (strict)

This session edits ONLY these paths. Anything else is out of scope — defer + flag for the owning session.

- `web/src/app/api/stripe/**`
- `web/src/app/api/billing/**`
- `web/src/app/api/promo/**`
- `web/src/app/api/ios/appstore/**`
- `web/src/app/api/ios/subscriptions/**`
- `web/src/app/api/family/**`
- `web/src/lib/stripe.js`
- `web/src/lib/plans.js`

UI surfaces (profile settings billing card, pricing page Family card behavior, iOS `SubscriptionView.swift`, iOS `StoreManager.swift`) live in S7 / S8 / S9 — those sessions consume the API contracts S4 publishes. DB migrations + RPC bodies live in S1. Cron handler files live in S2.

---

## Hermetic guarantee

1. **NEVER** edit a file outside the owned-paths list. If a fix needs an off-domain edit, defer the item and flag it for the owning session.
2. Shared libs in `web/src/lib/` — only the session listed as owner edits the file. `lib/stripe.js` and `lib/plans.js` are S4-owned. Other sessions may import existing exports read-only. **Do not break public export shape.**
3. Final pre-ship grep against off-domain paths: `grep -rn "stripe\|appstore\|promo\|family/add-kid\|/api/billing" out-of-scope-paths` to verify no off-domain references slipped in.
4. Smoke-test in-scope only. Do not run cross-cutting tests that would invalidate other sessions' in-flight work.
5. Commit messages tagged `[S4-Tnnn]` where Tnnn = item id.

---

## Multi-agent process (mandatory for every item below)

Every item ships via the **6-agent ship pattern** (4 pre-impl + 2 post-impl). This is non-negotiable for billing surfaces.

1. **Investigator** — read current code at the cited file:line, quote what's actually there, verify the audit claim is still true (~5/35 audit items in past sweeps were stale or hallucinated).
2. **Planner** — design the change. Quote the new shape. Identify every caller, every imported symbol, every type that has to move.
3. **Big-picture reviewer** — cross-file impact pass. Does the change break any caller in a non-owned path? Does it change a public export shape on `lib/stripe.js` or `lib/plans.js`?
4. **Independent adversary** — actively look for ways the plan breaks. Race conditions, webhook re-delivery, idempotency-key collisions, concurrent same-user mutations, refund re-entry, partial-unique-index gotchas, kid-seat math under reconcile.
5. **Implementer(s)** — N parallel implementers with isolated file ownership. Plain-text execution against the locked plan. No silent scope creep. No TODOs / HACKs / force-unwraps left behind.
6. **Independent code reviewer** + **security/correctness reviewer** — two post-impl agents. The security reviewer specifically looks for billing-money-at-risk regressions (double-charge, double-credit, refund loops, seat over-grant).

**Divergence resolution:** When reviewers disagree on a finding, dispatch 4 fresh independent agents on the disputed point with no shared context. Their verdict decides. Do not bring technical disputes to the owner for a merits call.

**Genuine fixes, never patches.** Every item is a full integration: kill the thing being replaced, no parallel paths, no TODOs / HACKs / force-unwraps as crutches. Types, callers, data flow stay coherent. If a patch is the only option, surface the tradeoff explicitly.

---

## Live billing risk — read this before touching anything

**Stripe is LIVE in production. There is no sandbox.** Every test against Stripe in this session uses a known-recoverable real card on a real test account, and the refund flow stays ready in case a test triggers a charge that has to be reversed.

Apple StoreKit has Sandbox and Production. The whole point of S4-A4 below is that those two environments are currently confused — the production webhook accepts Sandbox payloads. Treat any change to `/api/ios/appstore/notifications` with the same care as a Stripe change.

**Items marked HIGH live billing risk** (T0.4, T2.1) ship CODE-HALF FIRST behind a feature flag, OFF by default. The flag-flip waits for an owner-paired test on a real test family account / real test card. The code half is allowed to land without the flag-flip; the flag-flip is a separate event the owner runs after watching the recovery flow succeed.

The pattern, written out so it cannot drift:

1. Implementer ships the fix behind `process.env.NEXT_PUBLIC_<flag>` or a `feature_flags` row, default OFF.
2. Code reviewer + security reviewer pass.
3. Commit lands. Item marked code-half-shipped, NOT closed.
4. Owner runs the prescribed paired test against a real test account (steps inlined per item below).
5. On test success, owner flips the flag ON and the item closes.
6. On test failure, the implementer reads the failure, fixes, reships, owner re-tests. Repeat until success.

T2.7 is the exception: the fix is a pure RPC-body change inside an owner-applied migration. There's no separate "code ships → flag flips" step — owner applies the migration AND runs the replay test in the same session. The route-side caller adjustment (S4-T2.7-route below) ships independently if the route shape changes; it doesn't, so this is mostly a verification pass.

---

## Items

Each item below has all 11 fields: ID · Title · Source · Severity · Status · File:line · Current state · Fix · Why · Deps · Verification · Multi-agent process notes.

---

### S4-A4 — Apple webhook accepts Sandbox notifications in production

- **ID:** S4-A4
- **Title:** Apple webhook accepts Sandbox notifications in production
- **Source:** TODO_READ_ONLY_HISTORICAL.md A4 + PotentialCleanup §B4
- **Severity:** **CRITICAL — production billing corruptible from any developer with a Sandbox tester account.**
- **Status:** 🟩 SHIPPED 2026-04-28 (commit b84c29a)
- **File:line:** `web/src/app/api/ios/appstore/notifications/route.js` (no `notification.environment` check anywhere; the file's own comment at lines 17-18 acknowledges Sandbox + Production hit the same configured URL but the code never reads `data.environment`)
- **Current state:** The route accepts every signed Apple S2S payload regardless of which environment Apple is sending from. A Sandbox receipt redeemed in dev applies state to production users — unfreeze, extend, downgrade, refund processing, expired-but-renewed flips. Any developer with a Sandbox tester account can corrupt prod billing rows.
- **Fix:** In production deployments (`process.env.VERCEL_ENV === 'production'` — preferred; `NODE_ENV === 'production'` as fallback), reject every payload where `notification.environment !== 'Production'`. In dev / preview deployments, reject every payload where `notification.environment !== 'Sandbox'`. On reject: return 400, write an `audit_log` row tagged `action='ios_webhook_env_mismatch'` with the offending environment + apple-notification-uuid, do not mutate any user/subscription state. The body parsing already happens upstream; the env check goes immediately after parse + signature verify, before any DB mutation.
- **Why:** Production billing is currently corruptible from any developer with a Sandbox tester account. Apple separately told publishers in 2021 that Sandbox and Production share the configured webhook URL and the `data.environment` field is the distinguisher; this code never reads it.
- **Deps:** None. Pure route-handler edit. No DB schema change, no other session.
- **Verification:** (a) Send a forged Sandbox payload to a prod build via curl with a known-good Apple signature shape — assert 400 + `audit_log` row appears with `action='ios_webhook_env_mismatch'` and the right UUID. (b) Send a real Production payload — assert 200 + state mutation happens. (c) In a preview deployment, send a Sandbox payload — assert 200. Send a Production payload to preview — assert 400. (d) Grep route file post-fix for `environment` and `Sandbox`/`Production` to confirm both branches are handled.
- **Multi-agent notes:** Adversary should specifically probe: what happens if `notification.environment` is missing entirely? (Reject as malformed, not silently default.) What if an attacker sends a Production-claimed payload to dev? (Reject for symmetry — keeps test rigs honest.) What if `VERCEL_ENV` is unset (e.g., in a self-hosted deployment)? (Fall back to `NODE_ENV === 'production'`; if BOTH are unset, fail closed — reject everything until env is configured properly.) Security reviewer asserts the audit-log row writes BEFORE the early return so failed-payload investigation is possible. Code reviewer asserts the env check runs AFTER signature verification (the signature is the proof the payload is from Apple; rejecting on env without verifying signature first lets unsigned junk pollute the audit log).
- **Owner-side note:** No owner action required. The fix is route-handler-only. After ship, owner can confirm by checking Vercel logs for any incoming webhook attempts that get the env-mismatch rejection — should be zero in steady-state production.

---

### S4-A9 — Stripe `customer.deleted` doesn't unbind subscriptions

- **ID:** S4-A9
- **Title:** Stripe `customer.deleted` doesn't unbind subscriptions
- **Source:** TODO_READ_ONLY_HISTORICAL.md A9 + PotentialCleanup §B7 (B7 is the same item — they map together)
- **Severity:** HIGH — revenue + integrity. Free service forever for any user whose Stripe customer is deleted (admin cleanup, Stripe-side fraud action).
- **Status:** 🟩 SHIPPED 2026-04-28 (audit row writes to `audit_log` per existing `billing:customer_deleted` convention; S1 retains `subscription_events` per S1-A114)
- **File:line:** `web/src/app/api/stripe/webhook/route.js:1116-1154` (current handler clears `users.stripe_customer_id` only — the matching `subscriptions` row keeps `status='active'` with the old `stripe_subscription_id`)
- **Current state:** When Stripe fires `customer.deleted`, the webhook clears `users.stripe_customer_id` and stops there. The `subscriptions` row stays `active`. iOS reads it as live; reconciliation cron (`subscription-reconcile-stripe`) keys on `stripe_subscription_id`, never on customer, so the orphan never gets caught. End state: a user with no payment source backing their plan keeps premium access indefinitely.
- **Fix:** After clearing `users.stripe_customer_id`, run:
  ```sql
  UPDATE subscriptions
     SET status='cancelled',
         cancel_reason='stripe_customer_deleted',
         updated_at=now()
   WHERE user_id=$1
     AND platform='stripe'
     AND status IN ('active','trialing');
  ```
  Wrap the customer-id clear and the subscription cancel in a single transaction so they land or fail together. After the cancel, recompute the user's plan via the existing `apply_subscription_state` helper (or whatever the canonical plan-resync path is in the file) so `users.plan_id` flips to `free` in the same write.
- **Why:** Revenue leak (user keeps premium) + integrity drift (iOS, reconcile cron, leaderboard, paywalls all see stale state).
- **Deps:** Coordinate with S1 (DB session). If S1 is dropping the `subscription_events` table (per TODO_READ_ONLY_HISTORICAL.md §16 audit — the table has zero readers today), this handler is a candidate writer for an audit row at the same time. **Decision before ship:** if `subscription_events` is dropped, write the audit row to the canonical `audit_log` table instead with `action='stripe_customer_deleted_unbind'` + metadata `{subscription_id, user_id, prior_status}`. If S1 keeps `subscription_events`, write there.
- **Verification:** Trigger a `customer.deleted` event in Stripe test mode against a known-recoverable test card. Confirm:
  - `users.stripe_customer_id` is null
  - `subscriptions` row flips to `status='cancelled'`, `cancel_reason='stripe_customer_deleted'`, `updated_at=now()`
  - `users.plan_id='free'`
  - One audit row written with the right action + metadata
  - iOS app re-fetch shows the user on free tier
  - Replay the same `customer.deleted` event a second time — confirm idempotency (no duplicate audit rows, no error)
- **Multi-agent notes:** Adversary should probe: what if the user has multiple `subscriptions` rows (one cancelled, one trialing)? The WHERE clause's `status IN ('active','trialing')` is correct, but verify against the actual schema — there may be a `paused`, `past_due`, or `incomplete` status that should also flip. What if `customer.deleted` fires for a user who already has `stripe_customer_id IS NULL`? Return 200, no-op, do not throw. What if the customer was a Family-plan parent with active kid seats? The cancel must trigger downstream kid-pairing-lockout in the same transaction OR via a follow-up event handler — verify the existing seat-management code handles a parent's subscription cancellation correctly (it should, but assert during planner phase). Security reviewer asserts the transaction is real (single SQL transaction or RPC), not two sequential writes that can land partially. Code reviewer asserts the webhook_log idempotency check fires before the unbinding logic — replaying a `customer.deleted` event must be a no-op.
- **Edge case to surface:** Stripe occasionally fires `customer.deleted` AFTER `customer.subscription.deleted` for the same customer. Order isn't guaranteed. The handler must tolerate either order — if `customer.subscription.deleted` already flipped the row to `cancelled`, the new fix's UPDATE filter `status IN ('active','trialing')` correctly skips it (no rows match). If `customer.deleted` arrives first, it cancels the subscription, then `customer.subscription.deleted` arrives second and finds nothing to do. Both orders are fine.

---

### S4-A11 — Promo redeem non-atomic increment

- **ID:** S4-A11
- **Title:** Promo redeem rolls back `current_uses` non-atomically
- **Source:** TODO_READ_ONLY_HISTORICAL.md A11 + PotentialCleanup §B9 (same item)
- **Severity:** HIGH — revenue leak at scale. A capped promo (e.g., "first 100 subscribers get 50% off") can leak more than 100 redemptions under concurrent traffic.
- **Status:** 🟨 DEFERRED 2026-04-28 — blocked on S1-A11 `redeem_promo_full` RPC migration which is NOT in S1's queue (only S1-T2.7 + S1-A114/A115/A116 listed). Per session ownership rules S4 cannot create the migration in S1's owned path. Route-side rewrite ready when S1-A11 lands. Full plan documented below.
- **File:line:** `web/src/app/api/promo/redeem/route.js:175-237` (the route increments `current_uses` first, then if plan/price-resolve fails, decrements)
- **Current state:** Route increments `promo_codes.current_uses` via `UPDATE ... SET current_uses = current_uses + 1`, then attempts plan-set + audit row. If any sub-step fails, decrements `current_uses` to compensate. Two concurrent redeemers can both pass the cap check before either increment is durable; if rollback fails, counter overstates uses (or understates after compensating decrements that fire twice). The audit row at the bottom of the route claims it writes to `subscription_events` — that table has zero writers in the rest of the codebase, so the audit-row claim is itself fiction.
- **Fix:** Wrap claim + plan-set + audit row in a single SECURITY DEFINER RPC `redeem_promo_full(p_promo_id uuid, p_user_id uuid, p_plan_id uuid)` with `SELECT ... FOR UPDATE` on `promo_codes` at the top. Inside the RPC: cap check → increment → plan-set on user → audit row → return success/failure as a single transaction. Roll back transactionally on any sub-step failure (Postgres handles this for free inside the function body).
  - **RPC creation belongs in S1.** Add the migration at `Ongoing Projects/migrations/<date>_S4_A11_redeem_promo_full_rpc.sql` — S1 owns this file. If S1's queue doesn't already list it, add as **S1-A11**.
  - **S4's slice:** rewrite the route to call `service.rpc('redeem_promo_full', { p_promo_id, p_user_id, p_plan_id })` and return the structured result. Delete the increment-then-decrement compensation logic entirely. Keep input validation + auth + rate-limit at the route layer.
- **Why:** Revenue protection. A capped promo that's supposed to honor 100 redemptions is allowed to honor more. At scale (any meaningful promo campaign at launch) this is real money. Race window is small but real — Postgres `UPDATE ... RETURNING` is the only correct shape; SECURITY DEFINER + row lock is the canonical idiom.
- **Deps:** **Blocked on S1-A11 RPC migration.** Ship order: S1 ships RPC + migration → owner applies → S4 wires the route. If S1 hasn't shipped yet, S4 stages the route change and ships when S1 lands.
- **Verification:** (a) Apply the migration. (b) Concurrency test — fire two redeems for the last cap slot simultaneously via two parallel curl requests; only one should succeed; the other should return a clean "promo cap reached" error with 409. (c) Force a plan-set failure inside the RPC (temporarily mismatched plan_id) — confirm `current_uses` does NOT increment. (d) Replay a successful redemption a second time for the same `(promo_id, user_id)` pair — confirm idempotency (already-redeemed error, no double-increment).
- **Multi-agent notes:** Adversary probes: what if the user has multiple in-flight redemptions for different promos? The `FOR UPDATE` is per-promo-row, not per-user, so this is fine — but assert it. What if `promo_codes.max_uses` is NULL (unlimited)? The cap check should treat NULL as unlimited, not as 0. What if a user redeems the same promo twice (e.g., browser refresh after submit)? The RPC must check for an existing redemption row keyed on `(promo_id, user_id)` and return an idempotent "already-redeemed" response, not double-count. Security reviewer confirms the RPC is `SECURITY DEFINER` with a hard `auth.uid() IS NOT NULL` check inside (don't trust the `p_user_id` param alone — it must equal `auth.uid()` or be admin-callable explicitly). Code reviewer asserts the route-side error handling distinguishes "promo cap reached" (409) from "promo already redeemed by this user" (409 with a different reason code) from "promo expired or invalid" (404) so the UX can show the right message.
- **Audit-row destination:** Coordinate with S1 on `subscription_events` keep/drop decision (same as S4-A9). If kept, write the audit row there. If dropped, write to `audit_log` with `action='promo_redeemed'`.

---

### S4-A68 — Apple webhook reclaim only checks 'received'

- **ID:** S4-A68
- **Title:** Apple webhook reclaim only checks 'received'; Stripe reclaims 'received' + 'processing'
- **Source:** TODO_READ_ONLY_HISTORICAL.md A68
- **Severity:** MEDIUM — defensive symmetry. Today's Apple code paths suggest a row shouldn't land in `'processing'`, but it's not impossible; if it ever does, the row deadlocks forever.
- **Status:** 🟩 SHIPPED 2026-04-28 (route changes accidentally bundled into commit b855543 by parallel S7 session; functionally live)
- **File:line:** `web/src/app/api/ios/appstore/notifications/route.js:107-135` (Apple reclaim only matches `'received'`); `web/src/app/api/stripe/webhook/route.js:156-173` (Stripe reclaims both via `.in('processing_status', ['processing', 'received'])`)
- **Current state:** Apple webhook reclaim filter: `processing_status='received'`. Stripe's correct pattern: `processing_status IN ('received', 'processing')`. Mismatch.
- **Fix:** Mirror the Stripe logic. Change the Apple reclaim query to `.in('processing_status', ['processing', 'received'])`. Same age-threshold cutoff stays. Same row state machine — reclaim resets the row to `'received'` for re-processing.
- **Why:** Defensive symmetry. The Stripe pattern is correct; Apple's is one path that grows brittle the moment the state machine sees an unexpected stuck row (e.g., a future code path that leaves a row at `'processing'` if the handler crashes mid-flight).
- **Deps:** None. Single-line change in one file.
- **Verification:** Manually set a test row in `ios_appstore_notifications` to `processing_status='processing'` with `received_at` past the threshold. Trigger the reclaim path (cron or manual route hit). Confirm the row resets to `'received'` and gets reprocessed on the next tick.
- **Multi-agent notes:** Adversary asks: is there any path that legitimately leaves a row at `'processing'` indefinitely (e.g., a long-running async job)? Read the route file end-to-end to confirm `'processing'` is always a transient state by design. If yes, the reclaim threshold should be longer than the longest legitimate `'processing'` window.

---

### S4-A69 — `subscription-reconcile-stripe` under-counts kid seats

- **ID:** S4-A69
- **Title:** subscription-reconcile-stripe under-counts kid seats (missing `price.metadata` expand)
- **Source:** TODO_READ_ONLY_HISTORICAL.md A69
- **Severity:** HIGH — family billing math is wrong every reconcile tick. Parents on multi-kid plans see `kid_seats_paid=1` even when they paid for 3 seats.
- **Status:** 🟨 depends on peer session (S2 owns the file)
- **File:line:** `web/src/app/api/cron/subscription-reconcile-stripe/route.ts:55-58` (`stripeRetrieveSubscription` call with `expand[]=items.data.price.product`); `:110-122` (reads `item.price.metadata || {}` — metadata isn't included unless explicitly expanded)
- **Current state:** Cron calls Stripe with `expand[]=items.data.price.product` — that doesn't include `price.metadata` natively for the API version in use. The metadata read returns `{}`, `seat_role` falls through to empty, `kid_seats_paid` drives to 1 every run.
- **Fix:** Add `expand[]=items.data.price` to the retrieve call so `price.metadata` is populated. Verify against the Stripe API version pinned in the file (or in `lib/stripe.js`) — for some versions `price.metadata` is on the response shape natively when you expand `items.data.price.product`; in others you need the explicit price expand. Read the actual response shape in test mode to confirm before shipping.
- **Why:** Family billing math is wrong every reconcile tick. The fix is a one-line `expand` addition. No state migration; the next reconcile tick recomputes correctly.
- **Deps:** **The file lives in S2's owned path** (`web/src/app/api/cron/**`). S4 owns the billing logic; S2 owns the cron route file. Default split: **S2 owns the file edit. S4 publishes the fix logic in this entry, S2 applies the patch.** Coordinate via the index.
  - **Alternate ownership flip:** If S2 ships before S4 and the implementer is stalled waiting on this fix, S4 may take ownership of this single cron route as a one-off exception. Decide based on which session ships first. Do NOT split the edit across two PRs.
- **Verification:** A real Family-3-seat customer reconciles to `kid_seats_paid=3`. Run the cron manually post-fix in test mode against a known multi-seat test customer; assert the row in `subscriptions` has `kid_seats_paid=3` after the tick. Replay the cron — assert idempotency.
- **Multi-agent notes:** Adversary probes: what if a Family customer has 2 paid seats + 1 trial seat? The `seat_role` read should distinguish — verify against the actual metadata convention in use. What if a customer downgrades from Family to Pro mid-cycle? The reconcile should drop `kid_seats_paid` to 0 (or whatever Pro allows). Security reviewer ensures the `kid_seats_paid` write doesn't overwrite a legitimately higher in-app count from a non-Stripe path (e.g., admin-granted comp seats).
- **Why the fix is structurally one line but care is high:** Adding `expand[]=items.data.price` is trivial. The risk is that the metadata shape might differ slightly between API versions, or the convention for `seat_role` might have drifted (`'kid'` vs `'kid_seat'` vs `'family_kid'`). Investigator MUST quote the actual metadata key + value pair from a real Stripe response in test mode, not assume.

---

### S4-T0.4 — `add-kid-with-seat` rollback path

- **ID:** S4-T0.4
- **Title:** `add-kid-with-seat` rollback path doesn't clean up Stripe line item or idempotency row on terminal failure
- **Source:** TODO2_READ_ONLY_HISTORICAL.md T0.4
- **Severity:** **HIGH live billing risk.** Wrong rollback creates orphan Stripe line items the customer is billed for + idempotency rows that block clean retry.
- **Status:** 🟨 CODE-HALF SHIPPED 2026-04-28 (route + lib/stripe.js changes accidentally bundled into commit 73ae4a0 by parallel S8 session — code is live behind `NEXT_PUBLIC_ADD_KID_ROLLBACK_V2=true` flag, default OFF). Owner-paired test on a real test family account is the gate to flip the flag ON. Idempotency-row failure encoding already correct in current code (`finalizeIdempotency` writes the actual HTTP status + structured body) — no change needed there. New `removeSubscriptionItem` helper added to `lib/stripe.js` for the add-path branch.
- **File:line:** `web/src/app/api/family/add-kid-with-seat/route.ts:410-415, 466`
- **Current state:** Route adds a Stripe subscription line item OR patches quantity (depending on whether a seat item already exists), then inserts the kid_profiles row, then writes the idempotency row to **`public.add_kid_idempotency`** (verified 2026-04-27 via `information_schema.tables` — there is no `idempotency_keys` table; the real table is `add_kid_idempotency` with columns `user_id uuid`, `idempotency_key text`, `status integer` (HTTP status code, not a string-enum), `body jsonb`, `created_at timestamptz`, `completed_at timestamptz`). On `kid_profiles.insert` failure, the rollback path attempts to restore the subscription quantity — which is wrong if the original op was an `add` (creating a new line item), because the right rollback is to remove the just-added line item entirely. Restoring quantity on an add-path leaves the line item alive at `quantity=0`, which Stripe still bills as a $0 line on some plans and which messes up future patches. Additionally, on terminal failure of any kind, the idempotency row state can leave the request stuck — the same idempotency key returns a stale "in-flight" status forever, blocking clean retries.
- **Fix:**
  1. Track explicitly which Stripe op fired in this request: `add` (created a new line item) vs `patch` (incremented an existing quantity). Hold this in a local var inside the route handler.
  2. On `kid_profiles.insert` failure (or any other terminal failure after the Stripe op landed), branch the rollback:
     - If `add`: call `stripe.subscriptionItems.del(seatItem.id)` — remove the line item entirely. Use `lib/stripe.js` helper if present; otherwise direct SDK call wrapped in `try/catch` with audit-log on failure.
     - If `patch`: restore the previous quantity via `stripe.subscriptionItems.update(seatItem.id, { quantity: previousQuantity })`. This is the existing path — keep it for the patch branch only.
  3. On terminal failure of any kind, clear or mark the `add_kid_idempotency` row to allow clean retry. Note: the table's `status` column is **integer** (HTTP status code), not a string enum — encode failure as the actual HTTP status (e.g., `500`, `409`, etc.) and put the structured error envelope in `body jsonb`. Either: (a) DELETE the row, or (b) UPDATE `status` to the failed HTTP code + `completed_at = now()` + `body = jsonb_build_object('error', '<machine_code>', 'message', '<text>')` so the next request with the same key sees a settled failure response and proceeds as a fresh attempt with a new key. Pick (b) so audit history is preserved.
  4. Wrap the entire route body in a try/catch that on any unexpected throw runs the rollback branch + cleans the idempotency row + re-throws to caller. Ensure the rollback runs in a `finally` block if the kid insert is in a `try`.
  5. Behind a feature flag: gate the new rollback branch on `process.env.NEXT_PUBLIC_ADD_KID_ROLLBACK_V2 === 'true'` (or a `feature_flags` row, owner choice). Default: flag OFF — old buggy behavior continues until owner test passes. **Owner flips the flag to ON after the paired-test gate.**
- **Why:** A failed add-kid request currently leaves orphan billing state. Customer is billed for a seat that was never assigned, idempotency row blocks retry, support has to manually clean both. At scale this is a per-incident cost + a billing-trust hit.
- **Deps:** None on other sessions. The fix is fully contained in `add-kid-with-seat/route.ts` + `lib/stripe.js` (if a `removeSubscriptionItem` helper needs to be added).
- **Verification (owner-paired-test gate — explicit):**
  - **Pre-test setup:** A real test family account with an active Family subscription on a known-recoverable test card. Refund flow ready in case the test triggers an unrecoverable charge.
  - **Test 1 — add-path failure:** Force `kid_profiles.insert` to fail via a DB constraint violation (e.g., temporarily UPDATE the test family's `kid_seats_paid` to a number lower than the in-flight kid count, or insert a duplicate-username kid row out-of-band so the new kid's username collides). Trigger `/api/family/add-kid-with-seat`. Assert:
    - The Stripe line item that was just created is removed (verify via Stripe dashboard or `stripe.subscriptionItems.list` against the customer).
    - The `add_kid_idempotency` row's `status` is the failure HTTP code (e.g., `500` / `409`) and `body` is the structured error envelope (or the row is deleted, depending on chosen path).
    - A retry with a DIFFERENT idempotency key proceeds cleanly and the kid is added correctly.
    - A retry with the SAME idempotency key returns the cached failure response, not a stale "in-flight" stuck state.
  - **Test 2 — patch-path failure:** Same family, but force the failure when a seat line item already exists (so the route's branch is `patch`, not `add`). Force `kid_profiles.insert` to fail. Assert:
    - The Stripe line item quantity is restored to its previous value (NOT removed).
    - `add_kid_idempotency` row's `status` is the failure HTTP code with structured `body`.
    - Clean retry works.
  - **Test 3 — happy path regression:** Add a kid normally (no failure). Assert the kid lands, the seat is paid, no audit-log noise from the rollback path.
  - **Flag-flip:** On all three tests passing, owner flips `NEXT_PUBLIC_ADD_KID_ROLLBACK_V2=true` in Vercel env + redeploys. Item closes.
- **Multi-agent notes:** Adversary specifically probes: what if the Stripe `del` call itself fails after the kid-insert failure? (Need an audit-log + retry queue, not a silent swallow.) What if two concurrent add-kid requests for the same family race on the same seat slot? (The idempotency key + kid_seats_paid CHECK should prevent, but verify.) What if the Stripe op succeeded but our process crashes BEFORE writing the kid_profiles row OR clearing the idempotency row? (The next request with the same idempotency key should detect the orphan Stripe state and resume — either complete the kid insert or roll back the Stripe op.) Security reviewer asserts the Stripe SDK calls go through `lib/stripe.js` (or are added there as helpers) so no direct SDK calls leak into the route file. Code reviewer asserts the feature-flag gate is read once at the top of the handler, not per-branch (avoid mid-flight flag flip).
- **Code-shape sketch (planner reference, not a final spec):**
  ```js
  const flagOn = process.env.NEXT_PUBLIC_ADD_KID_ROLLBACK_V2 === 'true';
  let stripeOp = null; // 'add' | 'patch' | null
  let priorQuantity = null;
  let seatItemId = null;
  try {
    // ... existing seat-budget check ...
    const seatItem = await ensureSeatItem(subscription); // returns { id, quantity, wasCreated }
    seatItemId = seatItem.id;
    if (seatItem.wasCreated) {
      stripeOp = 'add';
    } else {
      stripeOp = 'patch';
      priorQuantity = seatItem.quantity - 1;
    }
    // ... insert kid_profiles row, write idempotency, etc. ...
    return NextResponse.json({ ok: true, kid });
  } catch (err) {
    if (flagOn && stripeOp === 'add' && seatItemId) {
      await stripeRemoveSubscriptionItem(seatItemId).catch(logRollbackFailure);
    } else if (flagOn && stripeOp === 'patch' && seatItemId && priorQuantity != null) {
      await stripeRestoreQuantity(seatItemId, priorQuantity).catch(logRollbackFailure);
    } else if (!flagOn && stripeOp) {
      // legacy buggy path — pre-flag-flip behavior
      await legacyRollback(stripeOp, seatItemId, priorQuantity).catch(logRollbackFailure);
    }
    if (flagOn) {
      await markIdempotencyFailed(idempotencyKey).catch(logRollbackFailure);
    }
    throw err;
  }
  ```
  This is illustrative, not prescriptive — implementer reads the actual route + adapts. Helper functions (`stripeRemoveSubscriptionItem`, `stripeRestoreQuantity`) live in `lib/stripe.js` per the no-direct-SDK rule.

---

### S4-T2.1 — Cross-platform double-subscription guard

- **ID:** S4-T2.1
- **Title:** Cross-platform double-subscription guard (Stripe vs Apple)
- **Source:** TODO2_READ_ONLY_HISTORICAL.md T2.1
- **Severity:** **HIGH live billing risk.** A user with an active Stripe subscription who then subscribes via Apple StoreKit (or vice versa) ends up billed twice for the same product with no automatic resolution.
- **Status:** 🟨 DEFERRED 2026-04-28 — blocked on S1-T2.1 `subscriptions_one_active_per_user` partial-unique index migration which is NOT in S1's queue. Per session ownership rules S4 cannot create the migration in S1's owned path. Without the index, the route-level SELECT-then-INSERT check is the only line of defense; with the index, the route check is the friendly UX layer and the index is the safety net. Plan + locked UX copy stay documented below.
- **Files:**
  - `web/src/app/api/ios/subscriptions/sync/route.js` — handles iOS StoreKit sync
  - `web/src/app/api/stripe/webhook/route.js` — handles Stripe subscription create/update events
- **Current state:** Both sync paths blindly trust their own platform. iOS syncs an Apple receipt and writes a `subscriptions` row with `platform='apple'`, even if a Stripe row already exists at `status='active'`. Stripe webhook does the same in reverse. End state: a user can hold two `status='active'` rows on different platforms, billed twice, with no UX to resolve.
- **Fix:**
  1. **DB migration in S1** — partial-unique index `CREATE UNIQUE INDEX subscriptions_one_active_per_user ON subscriptions (user_id) WHERE status='active';`. This is the structural enforcement. Even if a route forgets the check, the index throws 23505 and the row insert fails. **S1 owns this migration.** Add as **S1-T2.1** if not already there.
  2. **Both sync paths in S4** — refuse the new sub if an active one exists on the other platform. Read shape:
     ```js
     const { data: existing } = await service
       .from('subscriptions')
       .select('id, platform, status')
       .eq('user_id', userId)
       .eq('status', 'active')
       .maybeSingle();
     if (existing && existing.platform !== incomingPlatform) {
       return NextResponse.json({
         error: 'cross_platform_active',
         existing_platform: existing.platform,
         message: `You already have an active Verity Post subscription on ${existing.platform === 'stripe' ? 'Stripe' : 'Apple'}. Manage or cancel it there before subscribing here.`
       }, { status: 409 });
     }
     ```
  3. **UX copy is locked.** Owner-decided 2026-04-27, do not deviate:
     > "You already have an active Verity Post subscription on [Stripe/Apple]. Manage or cancel it there before subscribing here."
     iOS reads the structured 409 + `existing_platform` field and renders the locked copy. Web's pricing page does the same.
  4. **Behind a feature flag.** Gate both check sites on `process.env.NEXT_PUBLIC_CROSS_PLATFORM_GUARD_V1 === 'true'`. Default OFF. Flag-flip waits for paired test.
- **Why:** Live billing risk (double charge) + frustrating UX (user discovers double charge on the credit card statement, files a support ticket or chargeback). The locked copy gives the user a clear next step. The 409 + structured body lets iOS render a native dialog, web render a modal — both surface the same locked message.
- **Deps:** **Blocked on S1's partial-unique-index migration.** Without the index, the route check is the only line of defense; with the index, the route check is the friendly UX layer and the index is the safety net.
- **Verification (owner-paired-test gate — explicit):**
  - **Pre-test setup:** Two real test accounts. Account A has an active Stripe sub (real test card, recoverable). Account B has an active Apple Sandbox sub.
  - **Test 1 — Stripe-then-Apple block:** As Account A, attempt to subscribe via iOS StoreKit. Assert the iOS app shows the locked copy referencing Stripe. Assert no `subscriptions` row with `platform='apple'` is written. Assert no Apple receipt is consumed (or if consumed, refunded immediately — define behavior here clearly: the route should reject BEFORE consuming the Apple receipt where possible, or refund-immediately if the receipt is already consumed at point-of-check).
  - **Test 2 — Apple-then-Stripe block:** As Account B, attempt to subscribe via Stripe checkout. Assert the web flow shows the locked copy referencing Apple. Assert no `subscriptions` row with `platform='stripe'` is written.
  - **Test 3 — Same-platform replace:** As Account A on Stripe, switch from Pro-monthly to Family-monthly via the existing change-plan flow. Assert this works (it's not a cross-platform conflict — same platform). Confirm the partial-unique index doesn't false-positive on legitimate plan changes (the old row should flip to `cancelled` before the new row goes `active`, or the change happens via update-in-place — verify the actual flow).
  - **Test 4 — Cancel-then-resubscribe across platforms:** Account A cancels Stripe. Wait for the row to flip to `cancelled`. Subscribe via iOS. Assert it works (no active row to conflict with).
  - **Flag-flip:** On all four tests passing, owner flips the flag ON in Vercel env + redeploys. Item closes.
- **Multi-agent notes:** Adversary specifically probes:
  - Race: two parallel sync requests, one from iOS one from Stripe webhook, both for the same user, both arriving at the same instant. Without the partial-unique index, both could pass the SELECT check and both could INSERT. With the index, one succeeds and one 23505s — the route must catch the 23505 and return the same friendly 409.
  - Receipt-already-consumed: if the iOS app has already passed the receipt to Apple and we reject, the user is in a state where Apple thinks they're subscribed but our DB doesn't agree. Define the recovery: route should detect "receipt valid but cross-platform conflict exists", call the Apple refund endpoint (or surface a server-managed refund queue), THEN return the 409. This is the expensive case — surface to owner explicitly during planner phase.
  - Trial-state edge case: what if the existing row is `status='trialing'`? The partial index is `WHERE status='active'` — trialing is not blocked. Decide: should trialing also block cross-platform? Likely yes; extend the index to `WHERE status IN ('active','trialing')`. Confirm with owner during planner phase if not already locked.
  Code reviewer asserts the structured 409 body shape is consistent across both sync routes (same field names, same message format). Security reviewer asserts the existence-check SELECT runs as service-role with `user_id` from authenticated session, not from request body.

---

### S4-T2.7-route — Billing RPC idempotency caller adjustments

- **ID:** S4-T2.7-route
- **Title:** Route-side caller adjustments for `billing_change_plan` + `billing_resubscribe` idempotent RPCs
- **Source:** TODO2_READ_ONLY_HISTORICAL.md T2.7. **RPC body lives in S1.**
- **Severity:** HIGH (paired with S1-T2.7 — Stripe webhook re-runs hit these RPCs and today produce duplicate `subscription_events` rows + duplicate `subscriptions` rows on resubscribe)
- **Status:** 🟩 SHIPPED 2026-04-28 (verify-only — S1-T2.7 RPCs at commit cb9f85d return the same jsonb shape on both first-call and no-op branches; routes pass through unchanged. See investigator note below.)
- **Files:**
  - `web/src/app/api/billing/change-plan/route.js`
  - `web/src/app/api/billing/resubscribe/route.js`
- **Current state:** Routes call the existing RPCs directly. The RPCs themselves append duplicate rows on webhook re-delivery (Stripe's stuck-300s reclaim window). This item is the route-side companion to S1-T2.7 (the RPC body rewrite).
- **Fix:** Once S1-T2.7 lands the idempotent RPCs, the routes likely need NO changes — the RPCs return the same shape (success object with `{subscription_id, plan_id, ...}`) on both the first call AND the idempotent early-return. **Verify the response shape** in the planner phase: read both RPC bodies after S1 lands them, confirm the early-return shape matches the first-time shape exactly (no missing fields, no extra debug fields). If the shape diverges, normalize at the route layer (route always returns the same client-facing shape regardless of which RPC branch fired).
- **Why:** Webhook re-delivery is normal Stripe behavior. Without idempotency at the RPC layer + correct route handling of the no-op response, every replay creates billing-state drift.
- **Deps:** **Blocked on S1-T2.7.** S4 stages the verification + any normalizing wrapper, ships when S1 lands.
- **Verification:** After S1 lands the migration, replay a Stripe webhook event manually in test mode — same event, two deliveries. Assert:
  - First delivery: `subscriptions` row created/updated, audit row appended, response 200 with full shape.
  - Second delivery: NO duplicate `subscriptions` row, NO duplicate audit row, response 200 with the same shape (early-return path inside RPC).
  - User-visible state on the iOS app + web profile is unchanged between the two deliveries (no flapping, no re-render, no plan change toast).
- **Multi-agent notes:** Investigator's first job is to read the new S1-T2.7 RPC bodies and quote the response shapes. Adversary probes: what if the RPC's early-return is on a stale match (e.g., user changed plan via admin tool between webhook delivery 1 and 2 — RPC sees current state matches delivery 2's intent and no-ops, but delivery 2's intent is different from the RPC body the admin tool ran)? Define this edge case during planner phase. Code reviewer asserts no parallel paths are introduced — the route calls the RPC, returns the result, no side-channel state writes at the route layer.

---

### S4-G5 — `/api/billing/checkout` doc drift (verify endpoint name)

- **ID:** S4-G5
- **Title:** Bible §13.2 documents `POST /api/billing/checkout`; route does not exist
- **Source:** PotentialCleanup §G5
- **Severity:** P3 — bible/code mismatch. Not a runtime bug; a documentation drift.
- **Status:** 🟩 SHIPPED 2026-04-28 (verified — canonical endpoint is `POST /api/stripe/checkout` at `web/src/app/api/stripe/checkout/route.js`. Body `{plan_name}`, returns `{url, session_id}` from Stripe Checkout Session. Zero callers reference `/api/billing/checkout` in web/iOS/kids trees. S6 updates bible §13.2 to point at `/api/stripe/checkout`. No alias route added — parallel paths forbidden.)
- **File:line:**
  - `web/src/app/api/billing/` contains only `cancel/`, `resubscribe/`, `change-plan/`. No `checkout/route.*`.
  - `web/src/app/api/stripe/checkout/` is a candidate match — verify whether this is the actual endpoint.
- **Current state:** Bible §13.2 references `POST /api/billing/checkout`. The route doesn't exist under that path. Likely the actual endpoint is `/api/stripe/checkout` (S4-owned) — Stripe Checkout session creation lives there.
- **Fix (S4's slice):** **Verify only.** Read `web/src/app/api/stripe/checkout/route.js` (or `.ts`) and confirm it's the Checkout session creator. Quote the route shape (HTTP method, request body shape, response body shape) into the verification artifact. **Do NOT add an alias route at `/api/billing/checkout`** — parallel paths are forbidden by the genuine-fixes rule. The bible should be updated to match reality, not the other way around.
- **Why:** Future agents reading the bible will go looking for `/api/billing/checkout` and find nothing. The fix is a doc update — the bible documents the actual Stripe Checkout endpoint. Bible work ships in S6; S4's contribution is to publish the verified canonical endpoint name + shape so S6 can update §13.2 accurately.
- **Deps:** S6 owns the bible edit. S4 publishes the verified canonical endpoint name + shape into the S6 queue. If `/api/stripe/checkout` doesn't actually exist either (and the Checkout session creation lives somewhere else entirely or is missing from the codebase), surface this as a separate finding — that would promote from P3 doc-drift to a real product gap.
- **Verification:** Read the file. Quote the route. Confirm it creates a Stripe Checkout session via `stripe.checkout.sessions.create`. If yes: deliverable is the canonical name + shape passed to S6. If no: separate finding promoted to S4 queue as a real bug.
- **Multi-agent notes:** Investigator quotes the route file in the planner artifact. Adversary asks: are there any callers anywhere in the codebase that fetch `/api/billing/checkout`? `grep -rn "/api/billing/checkout"` should return zero. If it returns hits, those callers are broken in production today and the item promotes to a real bug.

---

### S4-A45-billing — Pricing/help price drift

- **ID:** S4-A45-billing
- **Title:** Pricing/help price drift across web pages (Q1 collapse)
- **Source:** TODO_READ_ONLY_HISTORICAL.md A45 + OWNER-ANSWERS Q1
- **Severity:** P1 (was) — already shipped 2026-04-27 per Q1 closeout
- **Status:** 🟩 SHIPPED. No work in S4. Listed for completeness so future audits don't re-flag.
- **File:line:** `web/src/app/pricing/page.tsx` (rebuilt as dynamic; reads from `plans` table); `web/src/app/help/page.tsx` (collapsed to 3 tiers — Free / Pro / Family)
- **Current state (post-Q1):** Both pages render Free / Pro / Family. Pricing page is dynamic (server-side `getPlans()`); help page is static copy collapsed to 3 tiers. iOS labels at `VerityPost/VerityPost/Models.swift:99-128` map `verity_pro → "Pro"` and `verity_family* → "Family"`.
- **Fix:** None needed. Reference only.
- **Why:** Closed via the Q1 tier-collapse 4-implementer + reviewer wave 2026-04-27.
- **Deps:** None.
- **Verification:** Confirmed during Q1 closeout. Reverify only if a future change touches `lib/plans.js` or the pricing/help pages.
- **Multi-agent notes:** Listed for the audit trail. If a regression appears (e.g., a future migration re-introduces a `verity_monthly` row), this entry promotes back to open and the 6-agent ship pattern fires fresh.

---

### S4-Q1-plans-coordination — `lib/plans.js` ongoing ownership

- **ID:** S4-Q1-plans-coordination
- **Title:** `lib/plans.js` is S4-owned going forward
- **Source:** OWNER-ANSWERS Q1 + Index
- **Severity:** Reference / coordination
- **Status:** 🟩 in effect
- **File:line:** `web/src/lib/plans.js`
- **Current state (post-Q1):** `TIER_ORDER = ['free', 'verity_pro', 'verity_family']`. T318 grandfather block deleted. Helpers `getPlans()`, `getWebVisibleTiers()`, etc., stable.
- **Fix:** None. Future tier or feature additions to plans logic ship via S4. Other sessions may import existing exports read-only — they MUST NOT edit the file.
- **Why:** Single owner, single canonical place for tier logic. Per Q1 cleanup, this is the source of truth for tier names, ordering, and web-visibility rules.
- **Deps:** Q5 (Verity Pro tier disposition) is a parked owner question in OWNER-ANSWERS — when answered, the resulting code change lives here. Tracked separately; not in this session's queue.
- **Verification:** Grep `from '@/lib/plans'` across all sessions' owned paths to confirm read-only consumption, no parallel implementations.
- **Multi-agent notes:** Any future S4 item that changes `TIER_ORDER` or the plan helpers MUST run a cross-session grep for callers in S6, S7, S8, S9, S10 and coordinate the upgrade as a single atomic PR. Do not break the public export shape.

---

## Out of scope

- Webhook authentication / cron scheduling (S2 owns).
- Pricing page or help page UI (S7 owns).
- Profile settings billing card UI (S8 owns).
- iOS subscription view UI — `SubscriptionView.swift` lives in S9 (S9 owns the SwiftUI view; S4 owns the API contract it calls).
- iOS `StoreManager.swift` — S9.
- DB migrations + RPC bodies (S1 owns — S4 writes the route caller, S1 writes the SQL).
- Cron route files (S2 owns — including the `subscription-reconcile-stripe/route.ts` file edit for S4-A69).
- `subscription_events` table drop / keep decision (S1 — coordinates with S4-A9).
- Bible §13.2 edit for S4-G5 (S6 owns the bible).

---

## Files this session creates or significantly rewrites

Inventory pre-ship so the reviewer can validate scope.

- `web/src/app/api/ios/appstore/notifications/route.js` — env-check addition (S4-A4) + reclaim filter expansion (S4-A68). Same file, both edits.
- `web/src/app/api/stripe/webhook/route.js` — `customer.deleted` unbinding (S4-A9). Possibly the only edit if S4-T2.7-route turns out to be a no-op.
- `web/src/app/api/promo/redeem/route.js` — full rewrite to call new RPC (S4-A11).
- `web/src/app/api/family/add-kid-with-seat/route.ts` — rollback path rewrite behind feature flag (S4-T0.4).
- `web/src/app/api/ios/subscriptions/sync/route.js` — cross-platform check addition behind feature flag (S4-T2.1).
- `web/src/app/api/billing/change-plan/route.js` — verify only (S4-T2.7-route); add normalizing wrapper if RPC shape diverges from caller expectations.
- `web/src/app/api/billing/resubscribe/route.js` — verify only (S4-T2.7-route); same.
- `web/src/lib/stripe.js` — add `removeSubscriptionItem(id)` + `restoreQuantity(id, qty)` helpers if not present (S4-T0.4 dependency).
- `web/src/lib/rateLimits.ts` — add S4-route-specific keys per the rate-limit reference section (this is S3-created; S4 may add keys without breaking S3's exports).

Files this session does NOT touch despite proximity:
- `web/src/app/api/cron/subscription-reconcile-stripe/route.ts` — S2's file. S4 publishes the fix logic for S4-A69; S2 applies the patch.
- `web/src/app/api/family/add-kid-with-seat/route.ts` — wait, this IS S4. (Listed for clarity — the S4 boundary inside `/api/family/**` includes this route.)
- Any `/admin/subscriptions/**` admin tooling — S6 owns. If a billing fix needs an admin-tool companion, defer the admin slice to S6.

---

## Cross-session coordination summary

| Item | S4 slice | Other-session slice |
|---|---|---|
| S4-A9 | Webhook handler edit | Coordinate with S1 on `subscription_events` keep/drop |
| S4-A11 | Route caller rewrite | S1 ships RPC + migration |
| S4-A69 | Logic published in this entry | S2 applies the patch to the cron file |
| S4-T2.1 | Two route check sites + locked UX copy | S1 ships partial-unique index |
| S4-T2.7-route | Verify response shape, add normalizer if needed | S1 ships idempotent RPC bodies |
| S4-G5 | Verify canonical endpoint name | S6 updates bible §13.2 |

---

## Completion checklist

Run before closing the session.

- [ ] **S4-A4 — Apple webhook environment check** shipped + verified in prod (forged Sandbox to prod returns 400, real Production to prod returns 200, Sandbox to preview returns 200). Audit-log row written on env mismatch. No state mutation on rejected payload.
- [ ] **S4-A9 — Stripe `customer.deleted` unbinding** shipped + verified in test mode (customer.deleted event flips subscriptions row to cancelled with right reason, plan_id flips to free, audit row written, idempotent on replay). Coordinated with S1 on subscription_events table decision.
- [ ] **S4-A11 — Promo redeem atomicity** S1 RPC migration applied + S4 route rewired. Concurrency test passes (two simultaneous redeems for last cap slot — only one succeeds). Idempotency verified.
- [ ] **S4-A68 — Apple webhook reclaim symmetry** shipped. Test row in `'processing'` past threshold gets reclaimed. Confirmed grep that no other Apple-side code path leaves rows at `'processing'` legitimately past the threshold.
- [ ] **S4-A69 — Reconcile cron seat math** logic published; S2 applied the patch (or S4 took the one-off ownership exception). Real Family-3-seat customer reconciles to `kid_seats_paid=3`. Idempotent on replay.
- [ ] **S4-T0.4 — Add-kid rollback path** code-half shipped behind flag. **Owner-paired test passed** on real test family account: add-path failure removes new line item; patch-path failure restores prior quantity; idempotency row state allows clean retry; happy-path regression clean. **Flag flipped ON** in Vercel env. Item closed.
- [ ] **S4-T2.1 — Cross-platform double-sub guard** code-half shipped behind flag. S1 partial-unique index applied. Both routes use the locked UX copy verbatim. **Owner-paired test passed** on real test accounts (Stripe-then-Apple block, Apple-then-Stripe block, same-platform replace, cancel-then-resubscribe). **Flag flipped ON.** Item closed.
- [ ] **S4-T2.7-route — Idempotency caller adjustments** verified post-S1-T2.7 ship. Webhook event replayed twice — no duplicate rows, no state flap.
- [ ] **S4-G5 — Doc drift verify** canonical endpoint name + shape published to S6 queue for bible §13.2 update. No alias route added.
- [ ] **S4-A45-billing** — confirmed shipped via Q1 closeout. No regression.
- [ ] **S4-Q1-plans-coordination** — confirmed `lib/plans.js` only edited by S4.
- [ ] **Hermetic verification** — `grep -rn` against off-domain paths returns no S4-introduced edits outside owned paths.
- [ ] **No `'verity_monthly'` / `'verity_annual'` SKU references** remain in any S4-owned file (Q1 cleanup verified).
- [ ] **No parallel paths** — no alias routes, no `/api/billing/checkout` shim, no second Stripe SDK invocation site outside `lib/stripe.js`.
- [ ] **No TODOs / HACKs / force-unwraps** remain in any S4-owned file from this session.
- [ ] **All Stripe webhook paths** handle re-delivered events idempotently (smoke: replay an event twice in test).
- [ ] **All commits tagged `[S4-Tnnn]`** per the index convention.
- [ ] **Both feature flags** (`NEXT_PUBLIC_ADD_KID_ROLLBACK_V2`, `NEXT_PUBLIC_CROSS_PLATFORM_GUARD_V1`) flipped ON in production env after their respective owner-paired tests passed.
- [ ] **Refund flow stayed ready** throughout the session. No live test left an unrecovered charge on the recoverable real card.

---

## Refund-flow runbook (Stripe LIVE — required before any paired test)

Owner-paired tests on T0.4 and T2.1 use a real test card. If a test triggers a charge that needs reversing, the path below is the recovery flow. Read this before running either test.

1. **Identify the charge** — Stripe Dashboard → Payments → filter by the test customer's email. Confirm `payment_intent` ID and amount.
2. **Refund full amount** — Stripe Dashboard → Payments → select the payment → Refund button → choose "Full refund" → reason "Test transaction." The refund webhook fires and lands in `/api/stripe/webhook`. Confirm via webhook log that the `charge.refunded` event landed and updated the `subscriptions` row appropriately.
3. **Verify the user state** — Web profile + iOS app re-fetch should show the user back on the pre-test tier. If not, run the existing admin manual-sync downgrade tool (`/admin/subscriptions/[id]/manual-sync`) to force-resync.
4. **Clean orphan rows** — If the test left an orphan Stripe line item (T0.4 add-path failure scenario), delete it directly via Stripe Dashboard → Customer → Subscription → Items. Confirm via `stripe.subscriptionItems.list` that the orphan is gone.
5. **Reset the idempotency row** — `DELETE FROM public.add_kid_idempotency WHERE idempotency_key = '<the test key>'` (table is `add_kid_idempotency`, key column is `idempotency_key`) so subsequent retries start fresh.
6. **Audit-log entry** — Manually write an `audit_log` row with `action='manual_billing_recovery'` and metadata describing what was reversed, so the recovery is visible in the audit trail.

If the recovery flow itself fails (refund won't process, orphan line item won't delete), STOP testing. Do not run the next test until the previous test's recovery is complete. State drift compounds.

---

## Stripe webhook idempotency reference

Every Stripe webhook event has a unique `event.id` (e.g., `evt_1Abc...`). The webhook handler at `web/src/app/api/stripe/webhook/route.js` MUST check this ID against `webhook_log` (or whatever the canonical webhook idempotency table is in this codebase) before processing. Today's pattern, in pseudocode:

```js
const event = stripe.webhooks.constructEvent(body, sig, secret);
const { data: existing } = await service
  .from('webhook_log')
  .select('id, processing_status')
  .eq('event_id', `stripe:${event.id}`)
  .maybeSingle();
if (existing && existing.processing_status === 'completed') {
  return NextResponse.json({ received: true, idempotent: true }, { status: 200 });
}
// claim the row, process, mark completed
```

Stripe's own delivery semantics: at-least-once. Re-delivery happens on (a) webhook handler returning non-2xx, (b) handler taking >300s (Stripe's stuck-reclaim window), (c) Stripe-side retries on transient network errors. Every fix in this session must survive a same-event replay without state drift. The S1-T2.7 idempotent RPC bodies are the structural answer for the change-plan / resubscribe paths; for `customer.deleted` and other one-shot events, the handler-level webhook_log check is the answer.

**Apple StoreKit equivalent:** Apple S2S notifications carry a `notificationUUID` field. Same pattern — claim by UUID, process, mark complete. The S4-A68 fix is the reclaim-side companion to this idempotency layer.

---

## Rate-limit reference (S4-owned routes)

Per the S4-owned paths, these routes need rate limits. Caps codified in `web/src/lib/rateLimits.ts` (S3 created the file; S4 may add new keys without breaking S3's exports).

- **`/api/promo/redeem`** — per-user 10/hour; per-IP 30/hour. Anti-abuse on capped promos.
- **`/api/ios/subscriptions/sync`** — per-user 60/hour. iOS legitimately re-syncs on app launch + state-change pushes; cap is loose to handle that.
- **`/api/ios/appstore/notifications`** — no per-IP cap (Apple's IPs vary). Signature verification is the gate. Rate-limit on `notificationUUID` deduplication via `webhook_log`.
- **`/api/stripe/webhook`** — same shape as Apple. Stripe signature is the gate; idempotency on `event.id`.
- **`/api/billing/change-plan`** — per-user 20/hour. Legitimate plan flips happen rarely; cap protects against runaway loops.
- **`/api/billing/resubscribe`** — per-user 5/hour. Resubscribe is rare per-user; tight cap.
- **`/api/billing/cancel`** — per-user 10/hour.
- **`/api/family/add-kid-with-seat`** — per-user 10/hour. Family seat counts are bounded; cap protects against scripted seat-add abuse.
- **`/api/family/*` other routes** — per-user 30/hour default, tune per-route as needed.

When adding a new route in this session, add the rate-limit key to `lib/rateLimits.ts` in the same PR. Don't ship a new billing route uncapped.

---

## Final reminders

- **Stripe is LIVE.** Treat every test as a real billing event until proven otherwise. Recoverable real card + refund flow ready, every time.
- **Apple StoreKit has Sandbox.** S4-A4 exists because that distinction was lost in the webhook path. Do not let it get lost again.
- **Genuine fixes, never patches.** Kill the thing being replaced. No parallel paths. No `/api/billing/checkout` alias. No second Stripe SDK call site. No silent compensation logic; structural enforcement (RPCs, partial-unique indexes, transactional rollbacks) is the goal.
- **Owner-paired-test gates are explicit and non-skippable.** T0.4 and T2.1 ship code half OFF, owner runs the test, owner flips the flag. The implementer does not flip the flag. The implementer does not run the test. Owner runs the test.
- **Multi-agent process is mandatory.** 4 pre-impl + 2 post-impl per item. Divergence resolution via 4 fresh independent agents on the disputed point. Do not bring technical disputes to the owner for a merits call.
- **`subscription_events` table** — coordinate with S1 before writing to it. If S1 drops it, route the audit row to `audit_log` with structured metadata. If S1 keeps it, write the canonical billing-event row. Decide BEFORE shipping S4-A9.
- **Feature flags** — Vercel env var changes require a redeploy on Vercel. Owner flips the flag in the Vercel dashboard, redeploys, then verifies in production. Do not assume an env-var change propagates without a redeploy.
- **Webhook log table** — every billing webhook handler must claim a `webhook_log` row before processing. The S1 audit may be tightening this contract; coordinate.
- **Stripe API version** — `lib/stripe.js` pins the version. Do not bump it as a side effect of any item in this session. Version bumps are their own change with their own multi-agent review pass.
- **iOS contract** — when a route's response shape changes (S4-T2.7-route may surface this), the iOS app needs a coordinated update in S9. S4 publishes the new shape; S9 consumes it. Don't ship a shape change without confirming S9 is updated in the same window or backwards-compatibly.
