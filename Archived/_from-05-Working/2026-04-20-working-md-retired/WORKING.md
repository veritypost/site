# WORKING

**Last refreshed:** 2026-04-19

Single source of truth for **what we're actively resolving right now**. Launch blockers, open bugs, pending decisions.

Current state of the product → see **`STATUS.md`** at repo root.

---

## LAUNCH BLOCKERS — owner-side

Code is ship-ready per capstone. These are the remaining cutover items.

### Security + credentials
- [ ] **HIBP toggle** in Supabase Auth dashboard. Clickpath: `archive/2026-04-19-prelaunch-sprint/round_g_owner_action.md`. Without it, users can sign up with breached passwords.
- [ ] **Rotate live secrets** per `docs/runbooks/ROTATE_SECRETS.md` — Supabase service-role key, Stripe live secret, Stripe webhook secret. Currently in plaintext `web/.env.local`.

### Env vars (Vercel)
- [ ] **`SENTRY_DSN`** (server) + **`NEXT_PUBLIC_SENTRY_DSN`** (client). Prod build fails without these (`web/next.config.js:61–68` throws if `@sentry/nextjs` can't load).
- [ ] **Confirm `NEXT_PUBLIC_SITE_URL`** is set (sitemap + robots depend on it).

### Content
- [ ] **Publish 10+ real articles** via `/admin/story-manager`. 5 articles are still `Test:` headlines in live DB. Each needs minimum 10 quiz questions (D1).

### CSP hardening (scheduled flip)
- [ ] **Flip CSP to enforce.** Round F shipped CSP in Report-Only. After 48h soak, change `web/src/middleware.js:139,160` from `Content-Security-Policy-Report-Only` → `Content-Security-Policy`.

### Schema commit backlog (on-disk vs live-DB drift)

Round A/B SQL was applied to live DB via MCP but never committed as numbered files in `schema/`. If `reset_and_rebuild_v2.sql` is ever replayed for disaster recovery, it will skip the RLS lockdown + RPC actor-spoof fixes.

- [ ] **Copy** `archive/2026-04-19-prelaunch-sprint/round_a_migration.sql` → `schema/092_round_a_rls_lockdown.sql`
- [ ] **Copy** `archive/2026-04-19-prelaunch-sprint/round_b_migration.sql` → `schema/093_round_b_rpc_actor_lockdown.sql`
- [ ] **Regenerate** `schema/reset_and_rebuild_v2.sql` to include 092–094

### Build hygiene
- [ ] **`npm install`** in `web/` if not already done (Round F added `@sentry/nextjs` to `package.json`).
- [ ] **Create `web/public/` directory** and add PWA icons. `web/src/app/manifest.js` + `layout.js` reference `/icon-192.png`, `/icon-512.png`, `/icon-512-maskable.png`, `/apple-touch-icon.png`. All currently 404.

---

## LAUNCH BLOCKERS — pre-capstone (still open)

### Apple ecosystem (DUNS-gated)
- [ ] **App Store Connect — 8 subscription products** matching `StoreManager.swift` IDs (4 tiers × monthly/annual at D42 prices: $3.99/$39.99, $9.99/$99.99, $14.99/$149.99, $19.99/$199.99).
- [ ] **App Store Connect — V2 Server URL** `https://veritypost.com/api/ios/appstore/notifications` for Production AND Sandbox.
- [ ] **Apple Developer portal — generate APNs auth key (.p8)**. Save Key ID + Team ID.
- [ ] **Universal links** — publish `apple-app-site-association` on `veritypost.com`.

### Google OAuth (LB-036)
Supabase Auth currently throws `"Unsupported provider"` on Google sign-in.
- [ ] **Create GCP project** + enable OAuth consent screen (External, scopes: `openid`, `email`, `profile`).
- [ ] **Create OAuth 2.0 Client ID** (Web application). Redirect URI: `https://fyiwulqphgmoqullmrfn.supabase.co/auth/v1/callback`.
- [ ] **Paste credentials into Supabase** Dashboard → Authentication → Providers → Google.
- [ ] **Add site URL** to Supabase → Authentication → URL Configuration.
- [ ] **Test flow** end-to-end on `/login`.

### Vercel APNs env vars (iOS-dependent)
- [ ] `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_AUTH_KEY` (.p8 PEM contents), `APNS_ENV`, `APNS_TOPIC`.
- [ ] **Redeploy Vercel** after all env vars set.

---

## OPEN BUGS — 5 LBs, not addressed by capstone

From archived `LIVE_TEST_BUGS.md`. Decide: ship with these, or close before cutover.

### LB-006 — Notifications page loads empty (P1, web)
`/notifications` loads but shows empty list even when unread notifications exist in DB. Suspected RLS scoping bug, wrong `user_id` filter, or missing `kid_profile_id IS NULL` filter. **Fix:** audit query against Supabase logs, patch. Verification: seed a notification, load, confirm renders.

### LB-010 — Expert-apply form strands user post-submit (P2, web)
After submitting `/apply-to-expert`, no header (avatar dropdown gone) and no back link. **Fix:** preserve global header on confirmation state; add explicit "Back to profile" / "Back to settings" link.

### LB-013 — Stripe checkout redirects off-site (P1, web — owner product decision)
Current flow redirects to `checkout.stripe.com`. Owner wants users to stay on-site. **Fix:** swap to **Embedded Checkout** (`ui_mode: 'embedded'` on session create, mount with `@stripe/react-stripe-js` `EmbeddedCheckoutProvider`). Retains 3DS / SCA / Apple Pay / Google Pay / Link automatically. PCI scope stays SAQ A. Verification: click upgrade → embedded form renders on-domain → complete test payment → land on `return_url`.

### LB-016 — Feed card renders without headline (P2, web)
Feed shows a card with no title — blank clickable rectangle. **Fix (two parts):** (1) data audit — query `articles` for NULL/empty `title`, fill or soft-delete; (2) render guard — feed card drops the card if `title` is falsy. Verification: seed a title-less article, load feed, confirm it doesn't render.

### LB-034 — Sessions dropping unexpectedly (P1, web)
Owner kept getting logged out; no reproducible trigger. **Fix:** instrument before diagnosing — log every `supabase.auth.onAuthStateChange` event, every middleware cookie clear / redirect to login, every token refresh attempt. Surface in Sentry. Once it reproduces in the wild with telemetry on, root cause surfaces (token refresh failure, cookie domain mismatch, middleware clearing on a route, etc.).

### Retest pending (not OPEN, awaiting owner confirmation)
- **LB-001** — "Start Reading" onboarding stuck (Pass 16 + 17 fixes; passive retest checklist to be drafted)
- **LB-023** — Mobile home feed oscillates between error/loaded (Pass 16 defensive memoization; retest when convenient)

---

## CODE TECH DEBT (capstone-deferred, non-blocking)

Medium/Low severity items the capstone explicitly deferred. Evidence at `site:line`.

| Item | Evidence |
|---|---|
| - [ ] M-02: home `'use client'` (SSR/SEO trade-off) | `web/src/app/page.tsx:3` |
| - [ ] M-04: Wave 1 / Wave 2 dual permissions cache | `web/src/lib/permissions.js:7,16,160` |
| - [ ] M-05: `FALLBACK_CATEGORIES` hardcoded | `web/src/app/page.tsx:83–108` |
| - [ ] M-06: `kids-%` slug-prefix filter | `web/src/app/page.tsx:278` |
| - [ ] L-07: `navigator.share` not wired | `web/src/app/story/[slug]/page.tsx` |
| - [ ] L-10: `next=` param plumbing on Interstitial | `web/src/components/Interstitial.tsx` |
| - [ ] L-11: `EXPECTED_BUNDLE_ID` hardcoded | `web/src/lib/appleReceipt.js:23` |
| - [ ] `QuizPoolEditor.tsx` orphan (zero external callers, duplicated inline) | `web/src/components/QuizPoolEditor.tsx` |
| - [ ] `VerifiedBadge` renders null (call-sites omit required Pick columns) | `web/src/components/VerifiedBadge.tsx` + callers |

---

## OPEN DECISIONS

These gate related work.

- [ ] **Holding-page blueprint** (`docs/planning/PRELAUNCH_HOME_SCREEN.md`) — implement, keep as reference, or delete? `middleware.ts` + `/preview` route don't exist.
- [ ] **Admin API LOCK asymmetry** — 15/50 admin API routes have `@admin-verified`; 35 don't. Extend lock to all 50, or accept asymmetry (UI frozen, API allowed to evolve)?
- [ ] **Billing gate key** — `billing.stripe.portal` (narrower) vs `billing.portal.open` (broader, includes family/expert). Product decision.
- [ ] **Post-deployment validation checklist** (6 runtime tests) — pre-launch scope, or post-launch acceptance?
- [ ] **Behavioral anomaly detection** (Blueprint 10.3) — impossible reading speed, rapid-fire quiz, etc. No table/RPC today. Pre- or post-launch?
- [ ] **Access code / promo code launch strategy** — real promo codes at launch, or post-launch?
- [ ] **Admin owner seat** — confirm your account is seeded with `owner` role before opening signups.

---

## POST-DEPLOYMENT VALIDATION

Runtime-only tests. None block launch, but launch confidence is incomplete until done.

- [ ] **RLS multi-user E2E** — 2+ accounts per tier, verify RLS blocks cross-user reads/writes.
- [ ] **Scale / load test** — realtime channels + API routes under concurrent sessions.
- [ ] **Realtime disruption recovery** — disconnect mid-session, reconnect, verify state re-syncs (web + iOS).
- [ ] **Client-cache staleness** — upgrade/cancel/mute a user, verify both clients reflect within one nav cycle.
- [ ] **Cross-session state** — web + iOS logged in simultaneously, verify no conflicts.

---

## ADMIN SURFACE FOLLOW-UPS (2026-04-17, not launch-blocking)

### Owner-paired (Stripe sync)
- [ ] **Stripe-sync pass** — wire API calls into `/admin/subscriptions` (manualDowngrade / resumeAccount / processRefund / handleAdminFreeze), `/admin/plans` (price edits → `stripe_price_id`), `/admin/promo` (promo create → `stripe_coupon_id`). Per-path owner sign-off.

### Autonomous
- [ ] `/admin/features` rebuild (whole-file mismatch vs v2 `feature_flags` schema)
- [ ] `/admin/breaking` rebuild or redesign (no valid article insert path; product decision needed)
- [ ] Audit-log slug micro-pass (6–7 new slugs + 6 destructive admin paths)

### Needs decision
- [ ] `/admin/webhooks` retry — cosmetic today, should be real?
- [ ] `/admin/pipeline` display columns — widen schema or denormalize?
- [ ] `/admin/support` ChatWidgetConfig — wire or rip out?
- [ ] `/admin/email-templates` category tabs — filter on non-existent column; delete or move to `metadata`?
- [ ] RLS hierarchy hardening — not urgent until external admin accounts issued

---

## How to keep this file current

- **Flip `[ ]` → `[~]` → `[x]`** as items start and land. Add a dated inline note if there's context worth remembering.
- **When an item ships**, move it out of here entirely. The fact of its existence goes to `STATUS.md`; the implementation detail goes to the relevant archive pass.
- **Don't let this grow stale** — if an item hasn't been touched in 30 days, ask whether it still matters. If not, move to archive or delete.
- **Don't duplicate facts from `STATUS.md`** — this doc is forward-looking (what needs doing); STATUS is current state (what is).
- **New bugs** — dish in plain language; I'll structure them with LB-NNN format and fix spec.
