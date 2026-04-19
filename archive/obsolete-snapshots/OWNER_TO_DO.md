# OWNER TO DO

Everything that requires you personally — credentials, portals, editorial decisions, or physical hands on Supabase / Apple / Stripe / Vercel / code decisions. The coding AI cannot do any of these.

**Last refreshed:** 2026-04-19 (from `xx-updatedstatus/2026-04-19-audit.md`, which reconciled this file against the 9-round hardening sprint + capstone).

**Status legend:** `[ ]` not done · `[~]` in progress · `[x]` done · `[-]` skipped / not applicable.

---

## LAUNCH-BLOCKING — POST-CAPSTONE (2026-04-19)

Capstone verdict was **CONDITIONAL YES** — code ship-ready. These are the remaining blockers before cutover.

### Security + credentials
- [ ] **HIBP toggle** in Supabase Auth dashboard. Exact clickpath in `99-Archive/2026-04-19-prelaunch-sprint/round_g_owner_action.md`. Without it, users can sign up with breached passwords (H-04 advisor warning).
- [ ] **Rotate secrets per `ROTATE_SECRETS.md`.** Live Supabase service-role + Stripe live secret + Stripe webhook secret are in plaintext `site/.env.local`. Agent cannot rotate dashboard keys.

### Env vars (Vercel)
- [ ] **`SENTRY_DSN`** (server) + **`NEXT_PUBLIC_SENTRY_DSN`** (client) — production build fails without these (`next.config.js:61-68` throws if `@sentry/nextjs` can't load in prod).
- [ ] **Confirm `NEXT_PUBLIC_SITE_URL`** is set in Vercel (sitemap + robots.txt derive from it).

### Content
- [ ] **Publish 10+ real articles** via `/admin/story-manager`. 5 articles are still `Test:` headlines in the live DB. Each needs minimum 10 quiz questions (D1 requirement).

### CSP hardening (scheduled flip)
- [ ] **Flip CSP from Report-Only to enforce.** Round F shipped CSP in Report-Only to soak reports for 48h. After the soak, change `site/src/middleware.js:139` and `:160` from `Content-Security-Policy-Report-Only` → `Content-Security-Policy`.

### Schema commit backlog (on-disk vs live-DB drift)

Round A/B SQL was applied to live DB via MCP but never committed as numbered files in `01-Schema/`. If `reset_and_rebuild_v2.sql` is ever replayed for disaster recovery, it will skip the RLS lockdown + RPC actor-spoof fixes.

- [ ] **Copy** `99-Archive/2026-04-19-prelaunch-sprint/round_a_migration.sql` → `01-Schema/092_round_a_rls_lockdown.sql`
- [ ] **Copy** `99-Archive/2026-04-19-prelaunch-sprint/round_b_migration.sql` → `01-Schema/093_round_b_rpc_actor_lockdown.sql`
- [ ] **Regenerate** `01-Schema/reset_and_rebuild_v2.sql` to include 092–094

### Build hygiene
- [ ] **`npm install`** in `site/` if not already done (Round F added `@sentry/nextjs` to `package.json`).
- [ ] **Create `site/public/` directory** and add PWA icons. `site/src/app/manifest.js` + `layout.js` reference `/icon-192.png`, `/icon-512.png`, `/icon-512-maskable.png`, `/apple-touch-icon.png`. All 404 at runtime because `site/public/` doesn't exist.

---

## LAUNCH-BLOCKING — PRE-CAPSTONE (still open)

### Apple ecosystem (DUNS-gated)

- [ ] **App Store Connect — 8 subscription products** matching the IDs in `StoreManager.swift` (4 tiers × monthly/annual at D42 prices: $3.99/$39.99, $9.99/$99.99, $14.99/$149.99, $19.99/$199.99).
- [ ] **App Store Connect — configure V2 Server URL** to `https://veritypost.com/api/ios/appstore/notifications` for both Production AND Sandbox.
- [ ] **Apple Developer portal — generate APNs auth key (.p8)**. Save Key ID + Team ID.
- [ ] **Universal links** — publish `apple-app-site-association` on `veritypost.com` so article URLs deep-link into the iOS app.

### Google OAuth (LB-036)

Supabase Auth currently throws `"Unsupported provider: provider is not enabled"` when users try Google sign-in.

- [ ] **Create Google Cloud Console project** (or pick an existing one) and enable the OAuth consent screen. Configure it as External user type. Add scopes: `openid`, `email`, `profile`.
- [ ] **Create an OAuth 2.0 Client ID** under Credentials. Type: Web application. Authorized redirect URIs must include:
  - `https://fyiwulqphgmoqullmrfn.supabase.co/auth/v1/callback`
  - Your prod callback if different.
- [ ] **Paste client ID + client secret** into Supabase Dashboard → Authentication → Providers → Google → enable.
- [ ] **Add your site URL** to Supabase → Authentication → URL Configuration → Site URL + Additional Redirect URLs.
- [ ] **Test the flow** end-to-end on `/login`.

### Vercel env vars (APNs — iOS-dependent)

- [ ] `APNS_KEY_ID`
- [ ] `APNS_TEAM_ID`
- [ ] `APNS_AUTH_KEY` — .p8 PEM contents
- [ ] `APNS_ENV` — `production` or `sandbox`
- [ ] `APNS_TOPIC` — optional, defaults to `com.veritypost.app`
- [ ] **Redeploy Vercel** after all env vars set.

---

## OPEN — LIVE TEST BUGS (5, not addressed by capstone)

From `LIVE_TEST_BUGS.md`. Capstone didn't re-evaluate these. Decide: ship with them, or pass to close before cutover.

- [ ] **LB-006 (P1)**: Notifications page loads empty — suspected RLS scoping bug
- [ ] **LB-010 (P2)**: Expert-apply form post-submit strands user (missing header / back link)
- [ ] **LB-013 (P1)**: Stripe checkout redirects off-site (owner wants Embedded Checkout swap — product decision)
- [ ] **LB-016 (P2)**: Feed card renders without headline — title-less article in DB
- [ ] **LB-034 (P1)**: Sessions dropping unexpectedly — needs telemetry to diagnose

---

## OPEN — CODE TECH DEBT (capstone-deferred, non-blocking)

| Item | Evidence |
|---|---|
| - [ ] M-02: home `'use client'` (SSR trade-off) | `site/src/app/page.tsx:3` |
| - [ ] M-04: Wave 1 / Wave 2 dual permissions cache | `site/src/lib/permissions.js:7,16,160` |
| - [ ] M-05: `FALLBACK_CATEGORIES` hardcoded | `site/src/app/page.tsx:83–108` |
| - [ ] M-06: `kids-%` slug prefix filter in home feed query | `site/src/app/page.tsx:278` |
| - [ ] L-07: `navigator.share` not wired | `site/src/app/story/[slug]/page.tsx` |
| - [ ] L-10: `next=` param plumbing on Interstitial | `site/src/components/Interstitial.tsx` |
| - [ ] L-11: `EXPECTED_BUNDLE_ID` hardcoded | `site/src/lib/appleReceipt.js:23` |
| - [ ] `QuizPoolEditor.tsx` orphan (zero external callers, duplicated inline) | `site/src/components/QuizPoolEditor.tsx` |
| - [ ] `VerifiedBadge` renders null (call-sites omit required columns in Pick types) | `site/src/components/VerifiedBadge.tsx` + callers |

---

## OPEN — POST-CAPSTONE DECISIONS

These need an owner call before related work can proceed.

- [ ] **Holding-page blueprint** (`PRELAUNCH_HOME_SCREEN.md`) — implement it, keep as reference, or delete? `middleware.ts` + `/preview` route don't exist.
- [ ] **Admin API LOCK asymmetry** — 15/50 admin API routes have `@admin-verified`, 35 don't. Extend lock to all 50, or accept (UI frozen, API allowed to evolve)?
- [ ] **Billing gate key** — `billing.stripe.portal` (narrower) vs `billing.portal.open` (broader, includes family/expert)? Product decision affects who can open the Stripe customer portal.
- [ ] **Post-deployment validation checklist** — pre-launch scope or post-launch acceptance tests?
- [ ] **Behavioral anomaly detection (Blueprint 10.3)** — impossible reading speed, rapid-fire quiz, etc. No table/RPC today. Decide pre-launch vs post-launch.
- [ ] **Access code / promo code launch strategy** — real promo codes at launch, or hold until post-launch?
- [ ] **Admin owner seat** — confirm your account is seeded with the `owner` role before opening signups.

---

## ADMIN SURFACE FOLLOW-UPS (2026-04-17 audit sweep, not launch-blocking)

Admin is staff-only — none of these block public launch.

### Owner-paired session needed (Stripe sync)
- [ ] **Stripe-sync pass** — pair with a coding agent to wire Stripe API calls into `/admin/subscriptions` (manualDowngrade / resumeAccount / processRefund / handleAdminFreeze), `/admin/plans` (price edits → `stripe_price_id`), `/admin/promo` (promo create → `stripe_coupon_id`). Each integration needs a decision: when to cancel, grace-period mapping, refund reconciliation, promo-to-coupon mapping. Owner sign-off per path.

### Can run autonomously (pass prompts ready)
- [ ] **`/admin/features` rebuild** — whole-file mismatch against v2 `feature_flags` schema.
- [ ] **`/admin/breaking` rebuild or redesign** — breaking news has no valid article insert path. Product decision needed: own `breaking_news_alerts` table or use real article fields?
- [ ] **Audit-log slug micro-pass** — extend the action-slug table with 6–7 new slugs then retrofit 6 destructive admin paths.

### Needs owner decision before next pass
- [ ] **`/admin/webhooks` retry** — currently marks failed webhooks as success without actually retrying. Confirm retry should be real (not cosmetic).
- [ ] **`/admin/pipeline` display columns** — `pipeline_runs` missing fields the admin expects. Widen schema or denormalize?
- [ ] **`/admin/support` ChatWidgetConfig** — ~120 lines of pure dead UI. Wire to `settings` / `feature_flags`, or rip out?
- [ ] **`/admin/email-templates` category tabs** — filter on non-existent column. Delete tabs or move category into `metadata`?
- [ ] **RLS hierarchy hardening** — admin pages gate via client `requireRole('admin')`; RLS on sensitive tables needs hierarchy-aware policies. Not urgent until external admin accounts issued.

---

## POST-DEPLOYMENT VALIDATION

Runtime/operational concerns the audit flagged as `UNVERIFIABLE` from code alone. None block launch, but launch confidence is incomplete until they're done.

- [ ] **RLS multi-user E2E test** — create 2+ real user accounts at each tier, verify RLS policies block cross-user reads/writes on bookmarks, DMs, kid profiles, expert back-channels, subscriptions.
- [ ] **Scale / load test** — smoke test the realtime channels (conversations, messages, message_receipts) and the API routes with concurrent sessions.
- [ ] **Realtime disruption recovery** — disconnect a client mid-session, reconnect, verify state re-syncs cleanly on both web and iOS.
- [x] **Storage bucket configuration audit** — done 2026-04-17. Only `data-exports` bucket needed (verified private).
- [ ] **Client-cache staleness test** — verify that after a user upgrades/cancels/is-muted, both clients (web + iOS) reflect within one navigation cycle.
- [ ] **Cross-session state handling** — log in on web, open iOS, verify reads/writes don't conflict.

---

## DONE — chronological record

Preserved so you can see what shipped when.

### Migrations 036–063 (applied 2026-04-17 via `APPLY_ALL_MIGRATIONS.sql`)

- [x] `036_ios_subscription_plans.sql` — seeds `plans.apple_product_id` for the 8 paid SKUs
- [x] `037_user_push_tokens.sql` — creates push-token table + 2 RPCs the APNs pipeline needs
- [x] `038_messages_unread.sql` — `get_unread_counts()` RPC + covering index
- [x] `039_message_receipts_rls.sql` — loosens receipts RLS to owner-OR-sender
- [x] `040_data_export_email_template.sql` — overwrites placeholder export-ready email template
- [x] `041_expert_reverification.sql` — adds `expert_applications.reverification_notified_at` + weekly cron RPC
- [x] `042_family_achievements_coadult.sql` — rewrites `recompute_family_achievements()` for co-adult families
- [x] `043_conversations_realtime_publication.sql` — adds `conversations` to `supabase_realtime` publication
- [x] `044_dm_read_receipts_enabled.sql` — adds `users.dm_read_receipts_enabled` per-user opt-out
- [x] `045_fix_bookmarks_rls.sql` — drops paid-plan gate on `bookmarks_insert` per D13
- [x] `046_articles_search_fts.sql` — generated `articles.search_tsv` + GIN index
- [x] `047_follows_paid_only.sql` — recreates `follows_insert` with `is_premium()` guard
- [x] `048_normalize_kid_category_names.sql` — kid category data migration
- [x] `049_post_message_rpc.sql` — `post_message` RPC
- [x] `050_check_user_achievements.sql` — `check_user_achievements` RPC
- [x] `051_user_category_metrics_rpc.sql` — self-healed two schema drifts during apply
- [x] `053_resolve_username_to_email_rpc.sql`
- [x] `054_user_account_lockout.sql`
- [x] `055_admin_audit_log.sql`
- [x] `056_verity_score_rpcs.sql`
- [x] `057_rpc_lockdown.sql`
- [x] `058_kid_pin_salt.sql`
- [x] `059_billing_hardening.sql`
- [x] `060_resolve_username_anon_revoke.sql`
- [x] `061_kid_paused_at.sql`
- [x] `062_kid_global_leaderboard_opt_in.sql`
- [x] `063_kid_expert_session_rls.sql`
- [x] `articles.subcategory_id` schema drift resolved (2026-04-17)

### Migrations 065–094 (applied 2026-04-18 / 2026-04-19 during hardening)

- [x] 065–091 — permission-system Phase 1+2 + Phases 3–4 security rounds (RPCs, RLS tightening, permission cleanup, Round A/B applied via MCP)
- [x] 086 / 087 / 088 — Round 6 SECURITY (admin RPC lockdown, PSO RLS tighten, anonymize_user guard)
- [x] 094 — Round E auth integrity
- [ ] 092 / 093 — **applied to live DB but not yet committed to `01-Schema/`** (see "Schema commit backlog" above)

### Apple (2026-04-17)

- [x] Apple Root CA G3 — SHA-256 fingerprint verified against Apple's published value
- [x] iOS build verification — fixed compile error at `ExpertQueueView.swift:254`; `xcodebuild` succeeded

### Stripe (2026-04-17)

- [x] 8 live prices created (sandbox + live)
- [x] `check-stripe-prices.js` validated — 8/8 matched each time
- [x] `plans.stripe_price_id` updated with live IDs. Sandbox restore block at `05-Working/stripe-sandbox-restore.sql`.

### Vercel env vars (2026-04-17)

- [x] `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — all set. Redeploy deferred until launch cut.

### Marketing (2026-04-17)

- [x] Twitter `@site` and `@creator` handles — set both to `@VerityPostApp` in `site/src/app/layout.js`.

### Code decisions

- [x] **16 structural CQ refactors** — all 16 stay deferred, no pull-forward (2026-04-17 Q&A).

---

## HOW TO UPDATE THIS FILE

- Flip `[ ]` to `[~]` when you start, `[x]` when done.
- Add a dated note after the item if there's context worth remembering.
- When an open decision closes, move it to the DONE section with the date.
- Keep one section per status — don't leave `[ ]` and `[x]` items interleaved in the top blocker sections.
