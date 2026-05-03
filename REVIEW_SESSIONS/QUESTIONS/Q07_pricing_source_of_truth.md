# Q07 — Pricing source of truth

**Date:** 2026-05-03
**Status:** Recommendation, owner-decision pending
**Scope:** Web pricing page, web messages paywall, web help page, web BillingCard, iOS `SubscriptionView` + `StoreManager`. Kids iOS: N/A (no paywall surface; family plan upsell goes through adult iOS app).

---

## TL;DR

**Pick Option B (build-time fetch from DB) for the web marketing surface, plus a single shared formatter; keep the iOS Swift fallback as-is.** It matches Vercel-deploy cadence (price changes happen rarely and are owner-initiated, so a deploy-bound revalidation is acceptable), it costs zero extra DB queries per pageview, it lets the `/help` page's existing pattern stay (it already runs server-side per request — fine), and it eliminates the three-way drift the current code has *without* introducing a new `/api/plans` runtime dependency on the highest-traffic marketing route.

But Option B is the second-most important change. **The first thing to fix is that the pricing page is selling a plan row that does not exist in the DB.** That is not an architectural question; it is a broken checkout button. Fix that before/independent of the source-of-truth decision.

---

## Findings against current code (verified 2026-05-03)

### 1. The pricing page is broken in production today

`web/src/app/pricing/page.tsx:180`:
```
planName="verity_monthly"
```

`plans` table on production Supabase (queried via MCP):

| name | tier | price_cents | is_active | is_visible | stripe_price_id |
|---|---|---|---|---|---|
| free | free | 0 | true | true | — |
| verity_pro_monthly | verity_pro | 999 | **false** | **false** | price_1TMQmE… |
| verity_pro_annual | verity_pro | 9999 | **false** | **false** | price_1TMQmd… |
| verity_family_monthly | verity_family | 1499 | true | true | price_1TMQnR… |
| verity_family_annual | verity_family | 14999 | true | true | price_1TMQnh… |

There is **no row named `verity_monthly`**. Clicking "Start Verity" on `/pricing` POSTs `plan_name: "verity_monthly"` to `/api/stripe/checkout`, which queries `plans` with that name (`route.js:55-62`) and returns 404 "Unknown plan". The web pricing page's primary CTA is dead. The Family card on the same page links to `/kids-app` (informational, not a checkout button), so the *only* working purchase path on the web is currently no path at all — every paid web checkout 404s.

This is an order-of-magnitude bigger bug than the source-of-truth question. It is implied by the SESSION_04 P1 ("plans.js header claims verity_monthly is $3.99 but page sells it at $7.99") but the underlying issue is worse: it isn't a price drift, the plan row is missing entirely.

### 2. The same surface advertises three different prices for "Verity"

| Surface | Price for Verity solo monthly |
|---|---|
| `web/src/app/pricing/page.tsx:166` (TSX literal) | $7.99 |
| `web/src/app/pricing/page.tsx:17` (page metadata) | $7.99 |
| `web/src/app/messages/page.tsx:1006` (paywall) | $3.99 |
| `web/src/app/help/page.tsx:33` (fallback when DB fails) | $3.99 |
| `web/src/lib/plans.js:15-18` (header comment claim) | $3.99 (legacy promise) |
| `VerityPost/SubscriptionView.swift:99,476` | $7.99 |
| `VerityPost/StoreManager.swift:477` (offline fallback) | $7.99 |
| Stripe / DB `plans` table | n/a — row doesn't exist |

The `lib/plans.js` header refers to a "T318 grandfathering" story where `verity_monthly` is $3.99 forever and new subs go to `verity_pro_monthly` at $9.99. The pricing page bypasses both — it offers a non-existent SKU at a third price ($7.99). The iOS app and StoreManager comments tell a fourth story: Pro is retired entirely and `verity` is the only solo tier at $7.99/79.99. The DB tells a fifth story: `verity_pro_*` exists but is_active=false; nothing solo is sellable.

There are at least three competing pricing narratives in the repo and none of them fully agree with what the DB says is sellable. Whatever option we pick, the *narrative reconciliation* has to come first — the architecture decision is downstream.

### 3. BillingCard selects columns that don't exist

`web/src/app/profile/settings/_cards/BillingCard.tsx:95`:
```js
.select('id, tier, name, display_name, monthly_price_cents, annual_price_cents')
```

Schema (verified via MCP): `plans` has `price_cents` (a single column) and `billing_period` ('month' | 'year'), not `monthly_price_cents`/`annual_price_cents`. Supabase will return the rows with those two fields as `null` (PostgREST silently strips unknown columns from select if no error mode is set, or returns 400 — the route catches and falls into `fetchError`). This is a separate bug discovered while investigating but should be folded into the same sweep.

### 4. The `/help` page already does the right thing

`web/src/app/help/page.tsx:30-72` reads the three monthly prices from `plans` server-side, formats with `formatCents`, falls back to constants if the DB call fails, and emits a Sentry warning when the fallback fires. This is Option A in miniature, working today. The pattern is clean: ~30 lines, server component, no client cache, no extra API endpoint.

### 5. iOS already has the right pattern

`StoreManager.priceCentsForProduct(_:)` (lines 475-494) is a Swift-side fallback used **only** when `Product.price` (the live App Store Connect price) is nil. Comment line 473 says exactly this: "Approximate fallback — the real price always comes from `Product.price` at purchase/restore time." App Store Connect is the authoritative source for iOS pricing. The Swift fallback is sync-noise insurance, not a source of truth. **It does not need to change** as part of this work.

The legal disclosure block (`SubscriptionView.swift:88-149`) does hardcode strings like "$7.99 per month" — these are required by Apple Review 3.1.2 and must match the App Store Connect SKU price exactly when displayed. They could be fed from `Product.displayPrice` (live App Store value) instead of literals — minor, but worth doing in the same pass because today they will lie if the App Store price ever changes server-side without an iOS rebuild.

### 6. Stripe price IDs already live in the DB

`plans.stripe_price_id` is the only place the codebase reads Stripe price IDs from (`web/src/app/api/stripe/checkout/route.js:57`, `webhook/route.js:357,491`). `.env.example:28-33` confirms env-var fields for Stripe price IDs were *intentionally retired* in favor of DB lookup ("currently unused by code"). Stripe is already DB-backed — the question is only about the **display copy**, not the billing wiring.

---

## The four options — decisive evaluation

### Option A: Server-render pricing on every page load from DB

- **Cost:** 1 extra DB query per `/pricing` and `/messages` paywall render.
- **Drift window:** zero. Instant on next page load.
- **Implementation:** copy the `/help` page pattern. ~20 lines on `/pricing` and ~20 lines on `/messages`.
- **Risk:** introduces a Supabase dependency on the marketing-page render path. If Supabase has a brownout, `/pricing` renders the fallback instead of failing — fine, but the fallback strings need to be kept in a single constant file (see Option D), not re-hardcoded inline.
- **Vercel cadence fit:** good — pricing page becomes dynamic but Next 14 will cache it via `unstable_cache` or `revalidate` directives if we want.

### Option B: Build-time fetch from DB (Next.js ISR with revalidate)

- **Cost:** zero per-pageview DB queries; one query per revalidate window.
- **Drift window:** the revalidate interval. With `revalidate: 300` (5 minutes), an owner price change appears within 5 minutes of next page traffic.
- **Implementation:** same `/help` pattern + `export const revalidate = 300` on the page module.
- **Risk:** if revalidate is misconfigured (e.g., `revalidate: false` or huge value), drift can be silent. Mitigation: add a /api/health check that compares the cached pricing string to live DB and warns if stale > 1 hour.
- **Vercel cadence fit:** **best**. Pricing changes are rare (~a few times a year); waiting 5 minutes is fine; the page renders from edge cache; no DB hit on the hottest marketing surface.

### Option C: Runtime fetch with client cache (`/api/plans` + hook)

- **Cost:** 1 client fetch per session per page that uses pricing.
- **Drift window:** the client cache TTL.
- **Implementation:** new `/api/plans` route + a `usePlans()` hook. The route already partially exists in spirit (`getPlans()` in `lib/plans.js`) but isn't HTTP-exposed.
- **Risk:** *worst* of the four for this codebase — pricing page is currently a server component (good for SEO, fast), this option flips it to client-fetched (FOUC on price, slower paint, SEO loses the price string). The win — runtime freshness — is wasted because price changes are rare.
- **Vercel cadence fit:** **bad** for marketing pages, fine for internal admin surfaces (which already use it via `getPlans()`).

### Option D: Hardcode in TSX, single shared constant file

- **Cost:** zero.
- **Drift window:** until next deploy after owner edits the constants file (Vercel deploy on push: ~2 minutes).
- **Implementation:** create `web/src/lib/pricingDisplay.ts` with the canonical tier→price strings; import from `/pricing`, `/messages`, `/help`, BillingCard, and *also* mirror to a small Swift `PricingDisplay.swift` constant file the iOS legal disclosures read from.
- **Risk:** still requires manual sync between the constants file and the DB `plans.price_cents`. Owner has to remember "edit the file too." This is the failure mode that produced the current three-way drift. Putting it in one file reduces it to two-way drift (file ↔ DB) but doesn't eliminate the drift class.
- **Vercel cadence fit:** fine, but architecturally weakest because the DB stays not-authoritative for display.

---

## Recommendation: **Option B (build-time fetch with `revalidate: 300`)**

Reasoning:

1. **DB becomes the canonical source for price display.** Owner edits `plans.price_cents` in admin → 5 minutes later the marketing copy updates → DB stays consistent with Stripe price IDs (which are already in DB) → checkout flow uses the same row → narrative reconciliation across all surfaces.

2. **Zero per-pageview DB cost on hot marketing pages.** ISR keeps the page edge-cacheable.

3. **Mirrors the existing `/help` page pattern almost exactly** — the team already proved this works server-side with a fallback. We just add `revalidate` and replicate it on `/pricing`, `/messages`, BillingCard.

4. **iOS unchanged.** App Store Connect remains authoritative for iOS pricing. The Swift `priceCentsForProduct` fallback stays where it is. Apple Review 3.1.2 disclosure block should switch from string literals to `Product.displayPrice` reads in the same pass — different fix but bundle it.

5. **Acceptable iOS staleness.** The Swift fallback is only used when `Product.price` is nil (StoreKit transient failure). When it fires, it gets corrected on the next successful restore/purchase. App Store Connect price changes propagate through `Product.products()` on next launch — there's no "stale fallback" risk because the fallback is never the user-visible price during a normal purchase.

### Secondary: shared constants file is **also** worth doing

Even with Option B as the architecture, do the Option D step too: extract one `web/src/lib/pricingCopy.ts` with the *fallback* values (the strings `/help` and `/pricing` show when DB is unreachable). Right now those fallbacks are duplicated across `/help` (`$3.99`/`$9.99`/`$14.99`) and the prospective new `/pricing` server fetch. Co-locating the fallbacks in one file means a price change requires editing exactly two places: the DB (canonical) and the fallback constants (insurance). Not three places, not four.

---

## What "if done right the first time" looks like

A single authoritative source — `plans` table — drives:

1. **Web pricing page** (`/pricing`) — server component reads plans, renders with `revalidate: 300`. Falls back to `lib/pricingCopy.ts` constants on DB error and reports to Sentry.
2. **Web messages paywall** — same server-side fetch (or shared component reading the same data). Falls back to the same constants.
3. **Web help page** — already does this. Just align its fallbacks with `lib/pricingCopy.ts`.
4. **Web BillingCard** — fix the column-name bug (`monthly_price_cents` → `price_cents` + `billing_period='month'` filter). Reads `plans` directly already, just the wrong query.
5. **Stripe** — `plans.stripe_price_id` stays canonical; checkout route already reads from there. No change.
6. **iOS in-app price display** — switch from Swift literals to `Product.displayPrice` (live App Store Connect value). This is one targeted patch on `SubscriptionView.swift` lines 88-149 and 472-481.
7. **iOS Swift fallback** — unchanged; only used when `Product.price` is nil. It already serves its purpose (last-resort defaults for sync payload), and Apple is the owner of iOS prices anyway.

After this, an owner price change requires:
- **DB price change**: edits `plans.price_cents` in admin → web auto-updates within 5 min, Stripe price ID stays the same so existing subs unchanged. (For a *real* Stripe price change owner mints a new Stripe price via `/api/admin/plans/[id]/mint-stripe-price` and updates `stripe_price_id` — same row.)
- **iOS price change**: edited in App Store Connect → propagates via `Product.products()` on next iOS app launch → no code change.

Two surfaces, two owners, no copy drift in TSX/Swift literals.

---

## Action items (ordered)

These are not intended to all run in this session — they are the work this question implies once owner accepts the recommendation.

### P0 — pricing page is broken, do this first regardless of the architecture choice
1. **Decide what solo Verity tier should exist.** Three candidates in the repo: `verity_monthly` ($3.99 grandfather, doesn't exist in DB), `verity_pro_monthly` ($9.99, exists but is_active=false), or a new `verity_monthly` at $7.99 matching the pricing page. Owner picks; investigation can't.
2. Reconcile the DB row to match the decision. If the pricing page is correct ($7.99 Verity), insert/activate a `verity_monthly` plan row with that price and a fresh `stripe_price_id`. If the legacy story is correct ($3.99), update the pricing page to show $3.99 and stop selling at $7.99.
3. Until 1+2 are done, the pricing page CTA is hard-broken. This may be why nobody has a real Stripe sub yet.

### P1 — implement Option B
4. Create `web/src/lib/pricingCopy.ts` with fallback strings.
5. Refactor `/pricing` server component to read `plans` (filtered to is_active + is_visible + the tier set we sell on web) and fall back to step-4 constants.
6. Add `export const revalidate = 300` to `/pricing` (and `/help` for consistency).
7. Refactor the `/messages` paywall block (lines ~990-1020) to read from the same data — ideally via a shared `<PricingSnippet tier="verity">` component.
8. Fix `BillingCard.tsx:95` to query `price_cents` + `billing_period` instead of the non-existent `monthly_price_cents`/`annual_price_cents`.
9. Switch `SubscriptionView.swift` legal disclosures and price labels to `Product.displayPrice` reads. Keep the Swift literal arrays in `priceCentsForProduct` as the offline-fallback.

### P2 — observability
10. Add a daily admin check (cron or `/api/health` privileged branch) that compares `plans.price_cents` for the four sellable rows against the value the `/pricing` page is currently rendering (via a fetch to `/pricing` and a regex). Page if drift > 1 hour or > 0 cents. Cheap insurance, catches a misconfigured `revalidate`.

---

## What this does NOT cover

- Trial duration source of truth (PM-10 P1) — `plans.trial_days` exists but isn't read consistently. Out of scope here, separate question.
- Sandbox vs production Stripe key gate (PM-10 P1) — orthogonal.
- Cross-platform double-billing precheck (PM-5 P0) — separate question.

---

## Decision request

Owner: confirm Option B + the P0 reconciliation order, OR push back. Specifically need:

1. Which Verity solo SKU is the launch product? (`verity_monthly` $3.99 / `verity_pro_monthly` $9.99 / fresh `verity_monthly` at $7.99)
2. OK to proceed with Option B + shared constants file?
3. iOS legal-disclosure-from-`Product.displayPrice` change OK? (Apple-friendly; required if we ever change a price in App Store Connect without rebuilding the app.)
