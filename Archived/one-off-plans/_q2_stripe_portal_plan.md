# Q2 Plan — billing.stripe.portal widen

## TL;DR — decision is based on stale info

The brief says: "widen `billing.stripe.portal` from admin/owner/pro to every paid tier so family + expert users can reach their Stripe portal."

**Reality (DB + code as of 2026-04-18):**
- `billing.stripe.portal` is already **`is_active = false`** (deactivated in Round 8 migration 090 as a duplicate of the broader `billing.portal.open`).
- The `/api/stripe/portal` route and the Settings page `PERM.ACTION_BILLING_PORTAL` constant **both already read `billing.portal.open`** (Round 10 flipped the route; the settings page was already on the broader key).
- `billing.portal.open` is active and bound to **all 8 sets** — `free, pro, family, expert, moderator, editor, admin, owner`.

So the stated gap ("family + expert can't reach their Stripe portal") **does not exist**. family + expert can already open the portal.

**Recommend: do not ship a migration. Instead, fix the real bug the audit surfaced → the Settings "Manage subscription" UI does not branch by plan source, so an Apple IAP user on the web gets a generic "Could not open billing portal" toast when they tap it.**

See §5 below for the proposed fix. Agent B should confirm with the owner which of (no-op / UI branch / key rename) we actually want before doing anything.

---

## 1. Current DB state

Query executed on `fyiwulqphgmoqullmrfn`:

```sql
SELECT p.key, p.is_active, ARRAY_AGG(DISTINCT ps.key ORDER BY ps.key) AS sets
FROM permissions p
LEFT JOIN permission_set_perms pspp ON pspp.permission_id = p.id
LEFT JOIN permission_sets ps ON ps.id = pspp.permission_set_id
WHERE p.key IN ('billing.stripe.portal', 'billing.portal.open')
GROUP BY p.key, p.is_active
ORDER BY p.key;
```

Result:

| key | is_active | sets |
|---|---|---|
| `billing.portal.open` | **true** | `admin, editor, expert, family, free, moderator, owner, pro` |
| `billing.stripe.portal` | **false** | `admin, owner, pro` |

**Interpretation:**
- `billing.portal.open` is the canonical active key, already bound to every tier (including `free` — which is fine, the route returns 400 `No Stripe customer on file yet` for users without `stripe_customer_id`).
- `billing.stripe.portal` is inactive — the `is_active=false` flag means the permission lookup ignores it. Its residual `admin/owner/pro` bindings are dead data.
- The brief's Round 10 note is wrong about direction: Round 10 deactivated `.stripe.portal`, not the other way around. See `01-Schema/090_fix_round8_permission_drift_2026_04_19.sql:70-73` and `05-Working/PERMISSION_MIGRATION.md:931-936`.

## 2. Every code caller

Grep `billing.stripe.portal|billing.portal.open` in `site/src` and `VerityPost`:

| File:line | What it does | Current key | Action needed |
|---|---|---|---|
| `site/src/app/api/stripe/portal/route.js:10` | `requirePermission('billing.portal.open')` — server gate on Stripe portal session creation | `billing.portal.open` | **none** — already on the broad key |
| `site/src/app/profile/settings/page.tsx:99` | `PERM.ACTION_BILLING_PORTAL: 'billing.portal.open'` — client gate driving the two portal buttons (`Open Stripe portal` aside + `Update payment method`) | `billing.portal.open` | **none** — already on the broad key |
| `VerityPost/**/*.swift` | — | — | iOS does **not** call `/api/stripe/portal` at all (zero grep hits on `stripe/portal`, `billing.portal`, `portal.open`, or `stripe_customer_id` in the iOS tree) |

All other hits are documentation inside `00-Where-We-Stand/*.md`, `05-Working/*.md`, and `01-Schema/078_*.sql` — no gate logic.

## 3. The /api/stripe/portal route

`site/src/app/api/stripe/portal/route.js` (30 lines, fully reviewed):

- Line 10 — gates on `billing.portal.open`.
- Line 14-18 — reads `users.stripe_customer_id` and returns **HTTP 400** with body `"No Stripe customer on file yet — complete checkout first."` when absent.
- Line 20-29 — creates a Stripe portal session scoped to that customer and 302s to the returned URL.

**Does it trust the user has a Stripe customer?** No — it explicitly checks `stripe_customer_id` and short-circuits with a 400 if missing. So an Apple IAP user who somehow hit the route would get a structured 400 rather than a Stripe-side error. Safe on the server side. The UI-side handling of that 400 is the gap (see §4).

## 4. Settings "Manage subscription" UI branching today

`site/src/app/profile/settings/page.tsx:2988-2996`:

```ts
const handlePortal = async () => {
  setBusy('portal');
  try {
    const res = await fetch('/api/stripe/portal', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.url) { window.location.href = data.url; return; }
    pushToast({ message: 'Could not open billing portal.', variant: 'danger' });
  } finally { setBusy(''); }
};
```

Two buttons call `handlePortal`:

1. **Plan card aside** (line 3037-3039): `canPortal && <Button>Open Stripe portal</Button>` — shown to every user who has `billing.portal.open`, regardless of plan source or `stripe_customer_id` presence.
2. **Payment method card** (line 3196-3199): `<Button disabled={!canPortal}>Update payment method</Button>` — same story.

**Branching by plan source?** **No.** The page does not read `subscriptions.source`, `subscriptions.apple_original_transaction_id`, `subscriptions.google_purchase_token`, or `users.stripe_customer_id` before deciding whether to render the button. The `subscription` query at line 2851-2854 selects only `id, status, current_period_end, created_at, stripe_payment_method_id` — `source` is not even fetched.

**Resulting behavior for a paid family user whose subscription lives in Apple IAP and who signs in on the web:**
- `hasPermission('billing.portal.open')` returns `true` (family set is bound).
- Button renders.
- User taps it.
- `/api/stripe/portal` returns 400 `No Stripe customer on file yet — complete checkout first.`
- Toast shows the generic fallback `"Could not open billing portal."` (the server's helpful message is discarded because the UI doesn't forward `data.error`).

## 5. IAP user concern — resolution

The brief offered (a) / (b) / (c). My read:

- **(b)** error-gracefully is what exists today, but the error is mis-framed ("Could not open billing portal" instead of "Your subscription is managed by Apple — open Settings → Subscriptions on your iPhone"). Users will bounce to support thinking the site is broken.
- **(a)** hide the button when `!stripe_customer_id` — safe but leaves an IAP user with no affordance to manage their sub from the web at all. Acceptable as a holding pattern.
- **(c)** branch the button's label + behavior based on `subscriptions.source` (or presence of `apple_original_transaction_id`). Stripe source → open portal. Apple source → show a help card pointing them to `itms-apps://apps.apple.com/account/subscriptions` (only useful on an iOS device; on desktop, show an informational message + link to Apple's web subscriptions page `https://apps.apple.com/account/subscriptions`). Google source → equivalent Play Store deep link.

**Recommendation: (c), staged:**
1. **Minimum fix (ship now):** render the portal button only when `userBilling.stripe_customer_id` is present; for IAP-sourced subs, render an inline "Managed by App Store — manage from your iPhone's Settings → Subscriptions" card instead. This is one client-side read + one conditional. No server or DB changes needed.
2. **Polish (follow-up):** surface the server's error string when the portal call fails (swap the generic toast for `data?.error || 'Could not open billing portal.'`) — defensive coverage for edge cases like a Stripe user whose `stripe_customer_id` got nulled.

Neither step requires any permission change.

## 6. iOS

`VerityPost` has zero references to the Stripe portal, `billing.portal`, `portal.open`, or `stripe_customer_id`. iOS manages subscriptions through StoreKit natively (and the `ios.iap.manage_subscription` permission is already bound to all paid+free tiers per migration 090 lines 39-43). No iOS change in scope here.

## Migration

**None required.** The decision in the brief is a no-op against the live schema.

If the owner still wants a belt-and-braces migration "just in case `.stripe.portal` ever gets reactivated," we could write:

**Name:** `widen_billing_stripe_portal_family_expert_2026_04_19`

**Idempotent SQL (NOT recommended to ship — only include if owner confirms after seeing this plan):**
```sql
-- Widen billing.stripe.portal to family + expert on top of admin/owner/pro,
-- so if the key is ever reactivated the binding set is correct.
-- NOTE: currently is_active=false; this migration does not reactivate it.
WITH perm AS (SELECT id FROM permissions WHERE key = 'billing.stripe.portal'),
sets AS (SELECT id FROM permission_sets WHERE key IN ('family','expert'))
INSERT INTO permission_set_perms (permission_set_id, permission_id)
SELECT sets.id, perm.id FROM sets CROSS JOIN perm
ON CONFLICT (permission_set_id, permission_id) DO NOTHING;

UPDATE perms_global_version SET version = version + 1, bumped_at = now() WHERE id = 1;
```

Dry-run expectation: 2 rows inserted into `permission_set_perms` (one for family, one for expert). No effect on runtime gates until someone flips `is_active=true` on the key.

## Code changes (if owner accepts §5 recommendation)

All optional; **zero are required to deliver the brief's stated outcome** ("family + expert can reach their Stripe portal") because that already works for Stripe-sourced subs.

| File:line | Old | New |
|---|---|---|
| `site/src/app/profile/settings/page.tsx:2849` | `.select('plan_id, plan_status, frozen_at, frozen_verity_score, plan_grace_period_ends_at')` | add `, stripe_customer_id` |
| `site/src/app/profile/settings/page.tsx:2852` | `.select('id, status, current_period_end, created_at, stripe_payment_method_id')` | add `, source, apple_original_transaction_id, google_purchase_token` |
| `site/src/app/profile/settings/page.tsx:~3037` (Plan card aside) | `canPortal && <Button>Open Stripe portal</Button>` | `canPortal && hasStripeCustomer && <Button>Open Stripe portal</Button>` |
| `site/src/app/profile/settings/page.tsx:~3177` (Payment method card) | Always renders the row | Branch: Stripe source → current card; Apple source → informational "Managed by App Store" card with `https://apps.apple.com/account/subscriptions` link; Google source → Play Store equivalent |
| `site/src/app/profile/settings/page.tsx:2994` | `pushToast({ message: 'Could not open billing portal.', variant: 'danger' })` | `pushToast({ message: data?.error \|\| 'Could not open billing portal.', variant: 'danger' })` |

Adds a couple of TypeScript fields to the existing `SubscriptionRow` / `userBilling` interfaces. No new components.

## Verification plan

### If we do the no-op path (just close the ticket):
- Confirm live bindings on `billing.portal.open` still cover family + expert.
- Flip-test on `family@test` web sign-in, tap `Open Stripe portal` → (a) if they have `stripe_customer_id` → Stripe hosted portal loads; (b) if they came via IAP → 400 + generic toast. Document (b) as known limitation.

### If we ship §5 recommendation:
- `tsc` (touches one file).
- Flip-test matrix:
  - `pro@test` (Stripe) → button shows, portal opens. **No regression.**
  - `family@test` (Stripe) → button shows, portal opens. **No regression.**
  - `expert@test` (Stripe) → button shows, portal opens. **No regression.**
  - `family@test` (Apple IAP — simulate by nulling `stripe_customer_id` and inserting a `subscriptions` row with `source='apple'` + `apple_original_transaction_id='test_123'`) → button hides, Apple card shows with link.
  - `free@test` → Plan/Payment cards hidden (no paid sub); nothing to click. **No regression.**
- Confirm `perms_global_version` untouched (no DB change in this path).

## Open questions for owner before Agent B acts

1. The brief's premise is moot — do we still want a DB migration for defensive symmetry (widen bindings on a deactivated key), ship nothing, or use this ticket to fix the real IAP UX gap (§5)?
2. If §5: do we want the minimum fix (hide button for IAP users) or the fuller branch (render Apple/Google help cards)?
3. Should we also drop the dead `billing.stripe.portal` bindings (`admin, owner, pro`) since the key is inactive? (Housekeeping — skips a future archaeologist's confusion.)
