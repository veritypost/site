# Product Roadmap — Verity Post

**Last refreshed:** 2026-04-19
**Purpose:** The authoritative multi-product plan. Come here when returning to the project after time away. Everything tactical (blockers, bugs, decisions this session) is in `/WORKING.md`; this is the strategic plan the tactical list answers to.

---

## 0. How to use this doc

1. **Starting a work session:** read §2 (current state) + §3 (products map) + skim §4 (sequence). Jump to whichever P-section matches what you're doing.
2. **Returning after time away:** read the whole thing. Check git log since last touched to see what shifted.
3. **Making a decision:** §10 is the decisions log — check it first so you don't re-decide something. §11 lists pending decisions that gate work.
4. **Updating this doc:** bump the date at top; add to §10 if you closed a decision; mark phases complete inline. Do NOT migrate STATUS.md content here — duplication kills this doc. Link instead.
5. **Files you'll touch most while executing:**
   - `/WORKING.md` — daily checklist
   - `/STATUS.md` — state-of-the-world
   - `docs/runbooks/CUTOVER.md` — prod deploy procedure
   - `docs/runbooks/ROTATE_SECRETS.md` — secrets rotation
   - `docs/planning/FUTURE_DEDICATED_KIDS_APP.md` — kids app deep-dive

---

## 1. Executive summary

Verity Post ships four surfaces powered by one Supabase backend:

- **Adult web** (desktop + mobile) — Next.js 14 at `/web/`. **Ship-ready; owner-side blockers only.**
- **Adult iOS app** — SwiftUI at `/VerityPost/` (unified today, adult-only after Phase 3 split). **Code-complete; DUNS-blocked.**
- **Kids iOS app** — doesn't exist yet. Kid mode currently lives inside unified iOS. Splits out in Phase 3.
- **Kids web** — routes at `/web/src/app/kids/` become 308 redirects to kids App Store when kids iOS ships. **Stays inside adult-web project.**

Shared: Supabase DB (one project, `fyiwulqphgmoqullmrfn`), admin console (lives inside adult web), the permission engine (928 active permissions + 10 sets), Stripe billing, Apple IAP pipeline.

Launch sequence: **adult web first → adult iOS (DUNS-gated) → kids iOS (requires adult iOS TestFlight first) → kids web redirect (piggybacks kids iOS launch)**.

End-to-end elapsed time from today to all four live: **~5 months optimistic, 7–9 months realistic** — dominated by DUNS turnaround + Kids Category review cycles.

---

## 2. Current state snapshot

See **`/STATUS.md`** for the authoritative snapshot. This section is the strategic framing.

### What's verified shipped

- **Capstone-verified ship-readiness of adult web** (2026-04-19). All 6 Criticals + 22 Highs from 9-round hardening sprint resolved. Owner-side blockers only.
- **Admin console locked** — 66 files (`@admin-verified 2026-04-18`). 39 pages + 27 DS components, mobile-responsive, schema-synced.
- **Wave 2 permission migration at 93%** — 332/356 source files carry `@migrated-to-permissions` or `@admin-verified` marker. Unmarked 24 are framework files.
- **Permission system phases 1+2 closed** — 928 permissions + 10 sets imported + user-centric admin console at `/admin/users/[id]/permissions`.
- **Phase 5 cleanup done** — `requireRole` helper removed, `role_permissions` table DROPped, 54 call-sites migrated.
- **Repo restructured** — flat top-level layout (`web/`, `VerityPost/`, `VerityPostKids/`, `schema/`, `docs/`, `archive/`).

### What's verified NOT shipped

- Adult web: 6 owner-side blockers (HIBP, secrets, Sentry DSN, SITE_URL, editorial content, CSP flip) + 3 code-hygiene items (migrations 092/093 commit, `web/public/` icons, `npm install`).
- Adult iOS: DUNS-blocked. Code ready.
- Kids iOS: doesn't exist.
- Kids web: routes exist as full site today, redirect pattern pending kids iOS.

### What's genuinely unknown

- Whether DUNS application is in flight (ask owner).
- Whether Kids Category review will approve on first submission (never does; plan for 1–2 rejection cycles).
- Whether parental pairing UX is intuitive (needs real-family testing).
- Current engagement data for kid mode (no data yet — adult app isn't live).

---

## 3. The products map

### 3.1 Surfaces

| Surface | Code | Deploy | State | Users served |
|---|---|---|---|---|
| **Adult web** | `web/` | Vercel (single project) | Ship-ready | Adult users, desktop + mobile responsive |
| **Adult iOS app** | `VerityPost/` | App Store | Code-complete, DUNS-blocked | Adult users on iOS |
| **Kids iOS app** | `VerityPostKids/` (placeholder) | App Store Made for Kids | Not built | Kids (paired to parent account) |
| **Kids web redirect** | `web/src/app/kids/*` + middleware | Part of adult web deploy | Currently full site, becomes redirect in P3 | Search engines, kid URL visitors |
| **Admin console** | `web/src/app/admin/*` + `web/src/app/api/admin/*` | Part of adult web deploy | Locked + shipped | Staff (moderator+ roles) |

### 3.2 Shared backend

One Supabase project (`fyiwulqphgmoqullmrfn`) powers all four. Always.

| Capability | Implementation |
|---|---|
| Auth | Supabase Auth (email/password). Google OAuth pending config. Apple OAuth DUNS-gated. |
| Identity | `auth.users` + `public.users` + `kid_profiles`. One user row per signup. Kids get their own profile rows, adults may "own" one or more kid profiles. |
| Permissions | `permissions` (928 rows) + `permission_sets` (10) + resolver RPC `compute_effective_perms(user_id)`. |
| Billing (web) | Stripe. `users.stripe_customer_id`, `subscriptions` table. Webhook at `/api/stripe/webhook`. |
| Billing (iOS) | StoreKit + App Store Server Notifications → `/api/ios/appstore/notifications`. Same `subscriptions` table. |
| Push | APNs. Token storage in `user_push_tokens`. Cron-driven dispatch. |
| Realtime | Supabase Realtime on `conversations`, `messages`, `message_receipts`. |
| Cron | Vercel cron → 9 scheduled endpoints in `web/src/app/api/cron/*`. |

### 3.3 Shared libraries (future-state, via restructure synthesis)

**Today:** no shared code between adult iOS and kids iOS (kids iOS doesn't exist). No shared code between iOS and web (Swift vs TS naturally separates).

**Future-state (Phase 3 prereq):**
- `packages/ios-core/` — Swift Package consumed by both iOS apps. Contains: `Models.swift`, `SupabaseManager.swift`, `PermissionService.swift`, `Keychain.swift`, `Log.swift`, `Theme.swift`, `AuthViewModel.swift`, `TTSPlayer.swift`, `Password.swift`, `PushRegistration.swift`.

**Sharing model for web ↔ iOS:** always via backend + REST API. Never direct code sharing.

---

## 4. Launch sequence + rationale

### 4.1 The order

```
NOW  ──► P1: Adult web launch        (1–2 weeks, owner-pace)
         │
         ├─► DUNS application in parallel if not started
         │
         ▼
WEEKS ──► P2: Adult iOS launch       (4–8 weeks from DUNS approval)
4-8     │
        │   (Adult iOS in TestFlight = gate to P3 start)
        ▼
WEEKS ──► P3 prep: Swift Package     (1–2 weeks; server pairing flow built in parallel)
9-10    │  extraction + server
        │  pairing endpoint
        ▼
WEEKS ──► P3: Kids iOS build          (2–3 weeks focused iOS work)
11-13   │
        ▼
WEEKS ──► P3: Kids App Store review   (2–4 weeks calendar, 1–2 rejection cycles)
14-17   │
        ▼
WEEK ───► P3: Kids web redirect       (1 session)
18      │
        ▼
LIVE    All four surfaces shipping
```

### 4.2 Why this order

- **Adult web first** because it's closest to ready (owner-side blockers, not engineering) and validates the whole backend + billing + auth stack before anything riskier ships.
- **Adult iOS second** because DUNS is calendar-time the owner can't control; start it now regardless of which other phase you're working. Cannot ship before DUNS approves.
- **Kids iOS third** because:
  - (a) Needs adult iOS TestFlight to exist so we validate shared Swift code in production-like conditions before splitting
  - (b) Real kid-mode engagement data from unified-app users informs what the kids-only experience should emphasize
  - (c) Made for Kids review is the slowest calendar item — start it late enough to know what we actually want, early enough to not bottleneck everything else
- **Kids web redirect last** because it depends on the kids app having a published App Store link to redirect to

### 4.3 Reordering considerations

- **Can we launch adult iOS before adult web?** No. Web launch validates billing (Stripe live mode) + auth + push pipeline end-to-end. Launching iOS without web would mean debugging billing in production under Apple review pressure.
- **Can we launch kids iOS first?** No. Kids Category requires parent-pairing, which requires an adult surface to pair from.
- **Can we skip kids iOS entirely?** Yes. Kids web stays as full site under adult web. But per §11, that's a product decision the owner hasn't made.

---

## 5. P1 — Adult Web Launch

**Goal:** `https://veritypost.com` serves real users on live Stripe, real editorial content, production-grade security.

**Starting state:** capstone verdict CONDITIONAL YES. Code ship-ready. Owner-side blockers tracked in `/WORKING.md`.

**Exit criteria:**
1. Vercel auto-deploy ON
2. `https://veritypost.com` returns 200 on `/`, `/api/health`
3. Real user can sign up, verify email, pass a quiz, post a comment, subscribe via Stripe Checkout
4. First 10 real articles published (no `Test:` headlines remain live)
5. `scripts/preflight.js` exits 0 against prod
6. Monitoring live: Sentry DSN wired, Vercel analytics on, Supabase advisors clean

### 5.1 Prereqs

None beyond current capstone state.

### 5.2 Section A — Security + credentials (owner-side)

#### A1. HIBP (Have I Been Pwned) toggle

- **Where:** Supabase Dashboard for project `fyiwulqphgmoqullmrfn` → Auth → Providers → Email → Password Security
- **Toggle:** "Prevent use of leaked passwords" ON
- **Exact clickpath:** `archive/2026-04-19-prelaunch-sprint/round_g_owner_action.md`
- **Effect:** signups and password changes using breached passwords rejected with error
- **Verification:** incognito → signup with `password123` → expect rejection with leaked-password error
- **Why it matters:** H-04 advisor warning from capstone; without it, users can sign up with known-breached passwords
- **Rollback:** same toggle off
- **Effort:** 1 minute

#### A2. Secret rotation (per `docs/runbooks/ROTATE_SECRETS.md`)

Rotate in this order to minimize blast radius:

1. **Supabase service-role key** — generate new key in Supabase Dashboard → Settings → API → rotate
   - Update `web/.env.local` and Vercel env `SUPABASE_SERVICE_ROLE_KEY`
   - Redeploy Vercel to pick up new key
   - **Cost of getting this wrong:** admin writes break; read-only code unaffected because that uses anon key
2. **Stripe live secret key** — Stripe Dashboard → Developers → API keys → roll secret key
   - Update Vercel env `STRIPE_SECRET_KEY`
   - Redeploy
   - **Cost:** checkout + webhook signing breaks temporarily until redeploy
3. **Stripe webhook signing secret** — Stripe Dashboard → Webhooks → endpoint → reveal/roll signing secret
   - Update Vercel env `STRIPE_WEBHOOK_SECRET`
   - Redeploy
   - **Cost:** webhooks fail signature verification until redeploy; they retry, so minimal data loss
4. **Optional (lower risk):** `RESEND_API_KEY`, `OPENAI_API_KEY`, `CRON_SECRET`

**Verification per key:** after rotation + redeploy, hit `/api/health` — should return `{"ok":true,"checks":{"db":"ok","stripe_secret":"present",...}}`.

**Why it matters:** live keys are currently in plaintext `web/.env.local`. Assume they've been exposed in dev environments or screenshots. Rotating is mandatory hygiene.

**Effort:** 30–60 minutes end-to-end.

#### A3. Sentry DSN in Vercel

- **Create Sentry project** (if not already) → copy DSN
- **Set Vercel env vars:**
  - `SENTRY_DSN` (server-side) — keeps server errors landing in Sentry
  - `NEXT_PUBLIC_SENTRY_DSN` (client-side) — keeps browser errors landing in Sentry
  - Optional: `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` for sourcemap uploads
- **Hard dependency:** `web/next.config.js:61-68` throws in prod if `@sentry/nextjs` can't initialize. **Without DSN, prod build fails.**
- **Verification:** after Vercel redeploy, trigger an error (e.g., throw in a debug route, or use a test button) — should appear in Sentry within ~30s
- **Rollback:** unset the env vars and redeploy; the throw-in-prod check will kick back in and block future deploys
- **Effort:** 30 minutes including Sentry project creation

#### A4. `NEXT_PUBLIC_SITE_URL`

- **Set in Vercel env** = `https://veritypost.com` (no trailing slash)
- **Why:** sitemap.xml, robots.txt, email links, OG metadata all derive from this
- **Verification:** visit `/sitemap.xml` — 76 URLs should enumerate with the configured domain
- **Effort:** 2 minutes

#### A5. `EMAIL_FROM` + Resend domain verification

- **Verify sending domain** in Resend dashboard (add DNS records, wait for propagation, click "Verify")
- **Set `EMAIL_FROM`** in Vercel env = `no-reply@veritypost.com` (or whatever sender you configured)
- **Verification:** trigger a transactional email (signup confirmation works) — check inbox + Resend dashboard logs
- **Effort:** 15 minutes (minus DNS propagation wait)

#### A6. Stripe webhook endpoint registration

- **Stripe Dashboard** → Developers → Webhooks → Add endpoint
- **URL:** `https://veritypost.com/api/stripe/webhook`
- **Events to subscribe:** `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- **Copy signing secret** → update `STRIPE_WEBHOOK_SECRET` in Vercel (already done in A2 if fresh rotate)
- **Verification:** complete a test Stripe checkout → check `webhook_log` table for row with `processing_status='processed'`
- **Note:** if webhook was already registered pre-launch with sandbox URL, update it — don't create duplicate
- **Effort:** 10 minutes

### 5.3 Section B — Code hygiene

#### B1. Commit migrations 092/093 to `schema/`

Round A/B SQL was applied to live DB via MCP `execute_sql` but never committed as numbered files. `schema/reset_and_rebuild_v2.sql` replay path is broken without them.

```bash
# From repo root
cp archive/2026-04-19-prelaunch-sprint/round_a_migration.sql schema/092_round_a_rls_lockdown.sql
cp archive/2026-04-19-prelaunch-sprint/round_b_migration.sql schema/093_round_b_rpc_actor_lockdown.sql

# Update reset_and_rebuild_v2.sql to concat them in via CREATE OR REPLACE statements
# (Manual edit — see existing rebuild file for pattern)
```

**Verification:** against a fresh staging DB, apply `reset_and_rebuild_v2.sql` + all numbered migrations in order → result matches `fyiwulqphgmoqullmrfn` prod schema (compare via `pg_dump --schema-only`).

**Why it matters:** disaster recovery replay currently skips the Round A RLS lockdown + Round B RPC actor-spoof sweep — the two biggest security deltas from the capstone sprint.

**Effort:** 30 minutes (copy is trivial, rebuild file update is careful).

#### B2. Create `web/public/` with PWA icons

Today `web/public/` doesn't exist → PWA manifest references `/icon-192.png` etc. that 404.

Need:
- `web/public/icon-192.png` — 192×192 PNG
- `web/public/icon-512.png` — 512×512 PNG
- `web/public/icon-512-maskable.png` — 512×512 with safe-zone padding for Android maskable
- `web/public/apple-touch-icon.png` — 180×180 PNG
- `web/public/favicon.ico` — 32×32 (optional but nice)

**Source:** owner-provided or generated from SVG logo. Use a tool like realfavicongenerator.net for a full set.

**Verification:** after deploy, curl `https://veritypost.com/icon-192.png` → 200, serves the image.

**Effort:** 15 minutes if you have a source logo.

#### B3. `npm install` in `web/`

Round F added `@sentry/nextjs` to `package.json` but may not have been installed locally. Required before any Sentry-dependent build step runs.

```bash
cd web && npm install
# Expect @sentry/nextjs in node_modules
```

**Verification:** `ls web/node_modules/@sentry/nextjs/package.json` exists.

**Effort:** 2 minutes.

#### B4. CSP Report-Only → Enforce

Round F shipped CSP in Report-Only so we'd see violations without breaking the site. After 48h of real traffic with clean reports, flip to enforce.

- **File:** `web/src/middleware.js`
- **Lines:** 139 and 160 both set `Content-Security-Policy-Report-Only` header. Change both to `Content-Security-Policy`.
- **Prereq:** 48 hours of live traffic on Report-Only with no high-volume CSP violations in Sentry / `/api/csp-report` logs
- **Verification:** curl `/` with `-I` → expect `Content-Security-Policy:` header (no `-Report-Only`)
- **Rollback:** flip back to `-Report-Only`, redeploy. Revert is safe.
- **Effort:** 5-minute code change, 48h soak time

**Do this step LAST of Section B.** If any script on the site violates CSP, enforcing will break it. Need the Report-Only soak to catch surprises.

### 5.4 Section C — Bug triage

Five OPEN bugs from `LIVE_TEST_BUGS.md` (now archived, content folded into `/WORKING.md`). Decide per-bug: ship with, or close first.

#### C1. LB-006 — Notifications page empty (P1, web)

- **Symptom:** `/notifications` loads blank even when unread notifications exist in DB
- **Suspected:** RLS scoping, wrong `user_id` filter, or missing `kid_profile_id IS NULL` filter
- **Fix approach:** audit the `/notifications` page query in `web/src/app/notifications/page.tsx` against Supabase query logs; patch filter; render non-empty state
- **Effort:** 1–2 hours
- **Decision:** almost certainly close before launch — users hitting notifications and seeing empty is a credibility hit
- **Verification:** seed a notification via SQL → load `/notifications` → confirm it renders

#### C2. LB-010 — Expert-apply strands user (P2, web)

- **Symptom:** after submitting `/apply-to-expert`, confirmation page has no header + no back link. Avatar dropdown gone.
- **Fix:** preserve global header (keep `NavWrapper` wrapping confirmation state); add explicit "Back to profile" / "Back to settings" button
- **File:** `web/src/app/apply-to-expert/` (or wherever the form confirmation renders)
- **Effort:** 30 minutes
- **Decision:** P2, ship-able with — but cheap to fix, so include
- **Verification:** submit form → header visible → click back → land on `/profile`

#### C3. LB-013 — Stripe checkout off-site (P1, web — product decision)

- **Symptom:** upgrade flow redirects to `checkout.stripe.com`. User leaves Verity Post domain.
- **Owner preference:** swap to **Embedded Checkout** so user never leaves the site
- **Implementation:**
  - Server: in `/api/stripe/checkout`, pass `ui_mode: 'embedded'` on session create + `return_url` for post-payment
  - Client: install `@stripe/react-stripe-js`, mount with `EmbeddedCheckoutProvider` + `EmbeddedCheckout` components
  - **PCI:** stays SAQ A (no card data hits your server)
  - **Features retained:** 3DS, SCA, Apple Pay, Google Pay, Link — all automatic
- **Prereq:** verify Stripe account eligible for Embedded Checkout (most are; check Stripe Dashboard)
- **Effort:** 4–8 hours including testing
- **Decision:** owner wants this — blocking. Do before launch.
- **Verification:** click upgrade → embedded form on `veritypost.com` → test card `4242 4242 4242 4242` in sandbox mode → land on `return_url` → `webhook_log` shows `checkout.session.completed` processed

#### C4. LB-016 — Feed card without headline (P2, web)

- **Symptom:** article feed shows a clickable card with no title (blank rectangle)
- **Two-part fix:**
  - **Data:** `SELECT id, slug, title FROM articles WHERE title IS NULL OR title = ''` — either backfill from source or soft-delete
  - **Render guard:** in feed card component (`web/src/app/page.tsx` or `web/src/components/ArticleCard.tsx`), drop cards with falsy `title` from the list
- **Effort:** 1 hour including data audit
- **Decision:** P2, but trivial fix — include
- **Verification:** seed title-less article via SQL → load feed → confirm it doesn't render

#### C5. LB-034 — Sessions dropping unexpectedly (P1, web)

- **Symptom:** owner gets logged out repeatedly, no reproducible trigger
- **Root cause unknown.** Cannot be fixed until reproduced.
- **Fix (instrumentation first):**
  - Log every `supabase.auth.onAuthStateChange` event → Sentry breadcrumb
  - Log every middleware cookie clear / redirect-to-login → Sentry
  - Log every token refresh attempt (success + failure with reason) → Sentry
  - Surface in a dedicated Sentry breadcrumb category `auth.session`
- **Prereq:** Sentry DSN wired (A3 done first)
- **Effort:** 2–3 hours instrumentation; diagnosis time varies
- **Decision:** **ship-with, fix post-launch.** Can't fix without reproduction. Instrumentation is the pre-launch ask so we can diagnose when it happens live.
- **Post-launch:** wait for a real drop with telemetry captured → diagnose → fix → close

### 5.5 Section D — Content

#### D1. Publish 10+ real articles

- **Where:** `/admin/story-manager`
- **Each article needs:**
  - Real headline (no `Test:` prefix — today 5 live articles still have that)
  - Real source URL
  - Real body (edited, cite sources, no placeholder)
  - **Minimum 10 quiz questions** (D1 design decision) — 12–15 recommended
  - Correct category assignment (adult categories; kids articles need `kids-` slug prefix)
- **Quality bar:** if a reader took the quiz on a freshly-published piece, could they answer all 10 from the article body? If no, not shippable.
- **Owner-side:** editorial work. AI cannot do this.
- **Effort:** 1–3 hours per article depending on research depth. First 10 = 2–4 days of editorial work if done well.
- **Verification:** load `/` as anon → expect 10 articles in the feed, no `Test:` prefixes visible

### 5.6 Section E — Cutover

#### E1. Update Vercel Root Directory

- **Where:** Vercel Dashboard → project → Settings → General → Root Directory
- **Change:** from `site` to `web`
- **When:** before any deploy after the 2026-04-19 restructure commit
- **Effect:** Vercel builds from `web/` instead of `site/` (which no longer exists)
- **Effort:** 1 minute. **Miss this and every deploy fails.**

#### E2. Unhide Vercel auto-deploy

- Vercel currently has "Ignored Build Step" set to skip all. To unhide:
  - Settings → Git → Ignored Build Step → either clear the command or set it to `exit 1` for the skip-deploys scenario, or remove it entirely
- **Effect:** GitHub pushes to `main` will auto-deploy again

#### E3. Pre-cutover backup

```bash
# Supabase Dashboard → Database → Backups → "Create snapshot"
# Or via CLI:
pg_dump "$DATABASE_URL" | gzip > verity-prod-backup-$(date +%Y%m%d-%H%M).sql.gz
```

Store the backup outside the prod environment.

**Why:** if anything goes sideways in the first 24h of prod, you want to be able to restore without begging Supabase support.

#### E4. Run preflight

```bash
node scripts/preflight.js
# Must exit 0
```

60+ green assertions per REFERENCE.md. Checks schema shape, RPC presence, env vars, seed rows.

#### E5. Deploy

```bash
cd web && vercel --prod
```

Watch the build logs. If Sentry init fails, build fails (by design per M-18).

#### E6. Post-deploy smoke test

Per `docs/runbooks/CUTOVER.md` §7:

1. **Auth:** signup → verify email → confirm
2. **Quiz:** open article with quiz pool → take → pass → confirm discussion unlocks
3. **Comment:** post top-level → reply → upvote → tag as context
4. **Billing:** click upgrade in `/profile/settings/billing` → complete Embedded Checkout with real card → verify `users.stripe_customer_id` set, `users.plan_id` set, `webhook_log` row with `processing_status='processed'`
5. **Cron manual trigger:**
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://veritypost.com/api/cron/freeze-grace
   # Expect {"frozen_count":0,...}
   ```
6. **Email cron:** seed a notification → `curl /api/cron/send-emails` → verify email delivered + `email_sent=true`

#### E7. Monitor 24h

Watch:
- `webhook_log` for `processing_status='failed'` rows (investigate any)
- `notifications` rows with `email_sent=false AND metadata ? 'email_error'`
- `auth.users` signup rate (sanity check)
- Vercel function logs — `/api/stripe/webhook` 500s, `/api/cron/*` non-200s, `/api/auth/**` error rate
- Sentry — any error spike

### 5.7 Rollback path

If something's on fire:

1. **Kill switch (no redeploy needed):**
   ```sql
   UPDATE feature_flags SET is_enabled = false WHERE key = 'v2_live';
   ```
   Surfaces that check `isV2Live()` fall back to maintenance mode.

2. **Full revert:**
   ```bash
   psql "$DATABASE_URL" < verity-prod-backup-YYYYMMDD-HHMM.sql
   vercel rollback  # reverts to previous Vercel deployment
   ```

### 5.8 Acceptance criteria

- [ ] HIBP enabled (verified via incognito signup rejection)
- [ ] Secrets rotated + verified green
- [ ] Sentry DSN set + error reaches Sentry
- [ ] `NEXT_PUBLIC_SITE_URL` + `EMAIL_FROM` + Resend domain verified
- [ ] Stripe webhook registered + signing secret fresh + processing live events
- [ ] Migrations 092/093 committed to `schema/` + rebuild file updated
- [ ] `web/public/` has 4 icons
- [ ] `npm install` complete
- [ ] CSP enforcing (after 48h soak)
- [ ] LB-006, LB-010, LB-013 (Embedded Checkout), LB-016 closed (LB-034 instrumented for post-launch)
- [ ] 10+ real articles published
- [ ] Vercel root dir = `web`
- [ ] Vercel auto-deploy ON
- [ ] Preflight exits 0 against prod
- [ ] Post-deploy smoke test passes all 6 steps

### 5.9 Effort estimate

| Task block | Engineering | Owner-action | Calendar |
|---|---|---|---|
| Section A (secrets + credentials) | 1 hr | 2–3 hrs | 0.5 day |
| Section B (code hygiene) | 4 hrs | — | 1 day + 48h CSP soak |
| Section C (5 bugs — excluding LB-034) | 8 hrs | — | 1–2 days |
| Section D (10 articles) | — | 2–4 days editorial | 2–4 days |
| Section E (cutover) | 2 hrs | 2 hrs | 1 day including smoke |
| **Total** | **~15 hrs engineering** | **3–5 days owner** | **~2 weeks calendar** |

### 5.10 P1 risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Embedded Checkout ineligibility | Low | Medium | Check Stripe account before starting LB-013; fall back to redirect Checkout if blocked |
| Sentry DSN not set → deploy fails | High if forgotten | High | Hard-gate: do A3 before any E5 deploy |
| CSP enforce breaks a script | Medium | Medium | 48h Report-Only soak → review violations before flipping |
| Stripe webhook misfires on first live event | Low | High | Dry-run with test card in E6.4 before trusting production |
| Resend domain DNS still propagating | Medium | Low | Start DNS config during A1–A4, finish by E1 |
| Vercel build fails after root-dir change | High if E1 skipped | High | E1 is first of Section E, checklist-enforced |

---

## 6. P2 — Adult iOS Launch

**Goal:** adult iOS app live on the App Store, adults can download, sign in with their web account, and use the full feature set parity-locked to adult web.

**Starting state:** code-complete. `VerityPost/` Xcode project builds. Blocked on Apple Developer Program DUNS approval.

**Exit criteria:**
1. Adult iOS live in App Store (not just TestFlight)
2. Real user can download from App Store, sign in with credentials created on web, and complete a core session (read article → pass quiz → post comment → upgrade via in-app purchase)
3. Push notifications deliver (breaking news, reply notifications)
4. Universal links: adult article URL → opens in app
5. App Store Server Notifications wired → subscription state syncs to Supabase

### 6.1 Prereqs

- **Apple Developer Program enrollment complete** (DUNS approved) — owner-side, 2–4 weeks Apple turnaround
- **Adult web launched** (for live billing to test against) — P1 complete
- `Xcodebuild` clean compile against current code (last verified 2026-04-17; re-verify before starting)

### 6.2 Section A — Apple Developer setup

#### A1. DUNS application (if not already in flight)

- **Where:** Apple Developer Program enrollment portal
- **Type:** Organization (DUNS-gated) — not Individual
- **Required:**
  - Business legal name matching DUNS record
  - Registered business address
  - Person authorized to bind the organization
  - D-U-N-S Number (look up / apply at Dun & Bradstreet if not already registered)
- **Turnaround:** 2–4 weeks typical, can stretch longer for business verification issues (address mismatch, name mismatch)
- **Effort:** 30 minutes to apply, then calendar wait
- **Mitigation:** start this regardless of which other phase you're in — it doesn't block until you need to submit

#### A2. Apple Root CA G3

- **Already done 2026-04-17** ✓ (SHA-256 fingerprint verified against Apple's published value)
- File at `web/src/lib/certs/apple-root-ca-g3.der` OR env `APPLE_ROOT_CA_DER_BASE64`
- Needed for StoreKit JWS + App Store Server Notifications signature verification

### 6.3 Section B — App Store Connect setup

#### B1. Create app record

- App Store Connect → My Apps → New App
- **Bundle ID:** `com.veritypost.app` (or whatever matches `VerityPost/project.yml`)
- **Primary Language, Name, SKU** — owner decisions
- **Account holder:** owner (not a teammate, until DUNS is solid)

#### B2. 8 subscription products

Match exact IDs from `VerityPost/VerityPost/StoreManager.swift`. D42 prices:

| Product ID | Tier | Cycle | Price |
|---|---|---|---|
| `verity_monthly` | Verity | monthly | $3.99 |
| `verity_annual` | Verity | yearly | $39.99 |
| `verity_pro_monthly` | Pro | monthly | $9.99 |
| `verity_pro_annual` | Pro | yearly | $99.99 |
| `verity_family_monthly` | Family | monthly | $14.99 |
| `verity_family_annual` | Family | yearly | $149.99 |
| `verity_family_xl_monthly` | Family XL | monthly | $19.99 |
| `verity_family_xl_annual` | Family XL | yearly | $199.99 |

**All in one subscription group** ("Verity Subscriptions") so users can upgrade/downgrade between them.

**Localizations:** start English only; add locales later.

**Review info per product:** screenshot of upgrade flow in the app.

#### B3. V2 Server URL

- App Store Connect → App → App Information → App Store Server Notifications V2
- **Production URL:** `https://veritypost.com/api/ios/appstore/notifications`
- **Sandbox URL:** same or different sandbox deploy — owner decides. Safest: same URL, handle sandbox vs production distinguishing via the notification payload's environment field.

#### B4. ATT (App Tracking Transparency)

- Today the app doesn't track users across apps → `NSUserTrackingUsageDescription` may not be required
- If Sentry or any analytics does cross-app identification → ATT prompt required with a user-visible string
- **Decision needed:** do we use any cross-app analytics? Per Round 6 security, Sentry is code-wired but no IDFA collection. Safer to include the ATT prompt with a minimal justification even if we don't use it today, so future additions don't require App Store approval round-trip.

#### B5. Privacy Nutrition Labels

Declare per iOS 14.5+ requirements:
- **Data collected:**
  - Contact Info (Email Address) → linked to user, not tracked
  - User Content (Other) → linked to user, not tracked
  - Identifiers (User ID) → linked to user, not tracked
  - Usage Data (Product Interaction) → linked to user, not tracked (if analytics active) or omit
- **Data NOT collected (explicitly declare none):** Contacts, Health & Fitness, Financial Info, Sensitive Info, Browsing History outside app, Purchases (Stripe customer ID is stored but not for tracking — clarify in review notes)
- **Third-party SDKs:** Sentry (if included), supabase-swift
- **Review notes:** explain data use — auth, user-generated content storage, analytics for product improvement

#### B6. App Store listing

- **App name:** "Verity Post"
- **Subtitle:** short, descriptive (30 chars)
- **Keywords:** comma-separated, 100-char budget
- **Description:** 4000-char budget, lead with value prop
- **Promotional text:** 170 chars, update-able without review
- **Screenshots:** 6.7", 6.5", 5.5" required. Each at different flows (feed, reader, quiz, comments, subscription)
- **Preview video:** optional, 30s, shows real flow
- **Age rating:** questionnaire — expect 12+ or 17+ depending on comment moderation maturity (per `docs/product/APP_STORE_METADATA.md` we're targeting 12+)
- **Content Rights:** confirm we own / license all user-facing content

**Effort:** 1–2 sessions with owner for copy, screenshots, video.

### 6.4 Section C — Apple Developer portal

#### C1. APNs auth key (.p8)

- Apple Developer → Certificates, Identifiers & Profiles → Keys → new key
- **Name:** "Verity Post APNs Production" (and another for Sandbox if desired)
- **Scope:** APNs enabled
- **Download .p8** immediately — Apple only lets you download once
- **Capture:** Key ID (10 chars) + Team ID (10 chars) + the .p8 PEM contents

#### C2. Universal Links (AASA file)

- **File location:** `https://veritypost.com/.well-known/apple-app-site-association`
- **Served by:** adult web Next.js app (add public file or API route)
- **Content (JSON):**
  ```json
  {
    "applinks": {
      "apps": [],
      "details": [
        {
          "appID": "<TEAM_ID>.com.veritypost.app",
          "paths": ["/story/*", "/u/*", "/recap/*", "/kids/*", "NOT /admin/*"]
        }
      ]
    }
  }
  ```
- **Note:** if `kids/*` is here, and later the kids app claims `kids/*` too, iOS prompts user. Plan: when kids app ships, remove `kids/*` from adult app's AASA and add it to kids app AASA (or use a different subdomain — see §7.4).
- **Content-Type header:** must be `application/json`, not `application/pkcs7-mime` (legacy). `web/next.config.js` headers rule handles this.
- **Verification:**
  ```bash
  curl -I https://veritypost.com/.well-known/apple-app-site-association
  # Expect 200, Content-Type: application/json
  ```

### 6.5 Section D — Vercel env vars

Add:
- `APNS_KEY_ID` (Key ID from C1)
- `APNS_TEAM_ID` (Team ID, same as in AASA)
- `APNS_AUTH_KEY` (full .p8 PEM contents including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`)
- `APNS_ENV` = `sandbox` for TestFlight beta testing, `production` for App Store release
- `APNS_TOPIC` (optional; defaults to `com.veritypost.app`)

Redeploy Vercel to pick up env.

**Verification:** trigger a push (via admin console or SQL seed + cron manual trigger) to a device registered via TestFlight — notification should arrive.

### 6.6 Section E — Build + TestFlight + Submit

#### E1. Final `xcodebuild` verification

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcodebuild -project VerityPost/VerityPost.xcodeproj -scheme VerityPost -sdk iphonesimulator build
```

Any error → stop and diagnose. Last verified 2026-04-17 after fixing `ExpertQueueView.swift:254` compile error.

#### E2. Archive + upload to TestFlight

- Open `VerityPost/VerityPost.xcodeproj` in Xcode
- Select scheme `VerityPost`, destination "Any iOS Device"
- Product → Archive
- Organizer opens → "Distribute App" → "App Store Connect" → "Upload"
- Wait for processing (5–15 minutes)

#### E3. TestFlight Internal Testing

- App Store Connect → TestFlight → Internal Testing
- Add yourself + any internal testers
- Install via TestFlight app on device
- **Smoke test on real device:**
  1. Sign in with web account
  2. Feed loads with real articles
  3. Quiz completes
  4. Comments post
  5. In-app purchase: tap upgrade → StoreKit sandbox prompt → complete → verify `users.plan_id` updates via webhook
  6. Push: trigger a notification → arrives on device
  7. Universal link: tap an article URL in Messages → opens in app, not Safari

#### E4. TestFlight External Testing

- Add external testers (up to 10,000, pre-review)
- Apple reviews the first external build (1–3 days)
- Run for **at least a week** — collect crash reports, real-world bugs
- Iterate on rejected/found issues

#### E5. Submit for App Store review

- App Store Connect → App → "Submit for Review"
- Include review notes explaining the quiz-gated discussion model, subscription tiers, and any feature a reviewer might not immediately understand
- **Review turnaround:** 1–3 days typical, can be more for first submission
- **If rejected:** read the resolution carefully, fix, resubmit. Most first rejections are for privacy labels or metadata issues, not code.

#### E6. Release

- **Manual release** (recommended first time) → flip the switch after approval
- OR automatic release on approval (riskier if surprises)
- **Phased rollout:** optional, releases to 1% / 2% / 5% / 10% / 20% / 50% / 100% over 7 days. Use this first time.

### 6.7 Post-launch iOS work

Deferred iOS items from prior passes:
- **LB-028** — Mobile nav parity (admin surfaces hidden on mobile) — iOS UI issue
- **LB-031** — Content cut off on scroll
- **LB-032** — Excess top whitespace
- **LB-033** — Grey strip below nav
- **LB-037** — Mobile signup UX
- **VPUser D40 fields** — add missing profile fields (queued for dedicated iOS pass)
- **ATT prompt polish** (if added)
- **`PrivacyInfo.xcprivacy`** manifest (iOS 17+ requirement for some SDKs)

### 6.8 Acceptance criteria

- [ ] DUNS approved
- [ ] App Store Connect app record created
- [ ] 8 subscription products live
- [ ] V2 Server URL configured for prod + sandbox
- [ ] Privacy Nutrition Labels complete
- [ ] APNs key generated + Vercel env set
- [ ] Universal Links AASA served + verified with curl
- [ ] `xcodebuild` green
- [ ] TestFlight internal smoke test: all 7 steps pass
- [ ] TestFlight external ≥1 week with no P0/P1 open
- [ ] App Store review approved
- [ ] Released (phased or full)

### 6.9 Effort estimate

| Task block | Engineering | Owner | Calendar |
|---|---|---|---|
| DUNS approval | — | 30 min apply | 2–4 weeks Apple |
| App Store Connect + Dev portal | — | 1 day | 1 day |
| Vercel env + AASA | 2 hrs | 30 min | same day |
| TestFlight internal | 2 hrs setup + smoke | 2 hrs testing | 1 day |
| TestFlight external | 4 hrs iteration | watchdog | 1–2 weeks |
| Submit + review | — | — | 1–5 days |
| **Total from DUNS approval** | **~2 days engineering** | **~2 days owner** | **4–8 weeks calendar** |

### 6.10 P2 risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| DUNS application surfaces business-data mismatch | Medium | High (+ weeks delay) | Start now regardless; verify D-U-N-S record against business name/address upfront |
| First App Store submission rejected for privacy labels | High | Low (1–3 days delay per cycle) | Over-declare rather than under; follow iOS 14.5 guide precisely |
| APNs push fails silently | Medium | Medium | Test on real device via TestFlight before external; review `APNS_TOPIC` config |
| Universal links prompt user to choose app | Low (only if AASA paths collide) | Medium | Plan AASA path strategy during §7.4 subdomain decision |
| StoreKit sandbox vs production price mismatch | Low | High if prod | Match sandbox prices exactly to live prices; test with `scripts/check-stripe-prices.js` equivalent for Apple |
| Subscription group config wrong (can't upgrade/downgrade) | Medium | High | Put all 8 products in one group "Verity Subscriptions" |
| 17+ age rating forces new screenshots | Low | Medium | Age-rating questionnaire at B6; rehearse answers |

---

## 7. P3 — Kids iOS App + Kids Web Redirect

**Goal:** kids iOS app live on the App Store's **Made for Kids** track. Kids web URLs redirect to kids App Store link. Parents pair their kid's device from adult web or adult iOS via short code / QR.

**Starting state:** does not exist. Kid mode lives inside unified `VerityPost/`. `VerityPostKids/` is an empty placeholder.

**Exit criteria:**
1. `com.veritypost.kids` live on App Store Made for Kids
2. Parent can generate a pairing code in adult app/web → kid taps into kids iOS → pairs → kid account active
3. Kid sees kid-mode content only (no DMs, comments, follows, external links without parental gate)
4. Parent's Family plan entitlement flows to kid via `/api/kids/pair` response
5. `kids.veritypost.com` (or `/kids/*` path, per §7.4) redirects to kids App Store listing
6. Made for Kids review approved

### 7.1 Prereqs

Hard blockers:
- **Adult iOS in TestFlight** (minimum; released to App Store preferable)
- **Shared Swift code extracted into `packages/ios-core/` Swift Package** (see §7.5) — proves the boundary before splitting
- **`POST /api/kids/pair` server endpoint** built on adult web — independent of iOS work, can be built in parallel with adult iOS

Owner decisions needed (§11):
- **Architecture: Option A (one project + `#if KIDS_APP` flag) or Option B (two projects + Swift Package)** — my recommendation: **B** (hard separation beats easy fixes for COPPA review safety)
- **Deep link strategy:** dedicated `kids.veritypost.com` subdomain vs `/kids/*` path prefix
- **Kids app IAP: no IAP (parent-paid), or "Kids Plus" IAP in kids app**
- **Kids app push: skip entirely first cut, or build parent-approved categories**

### 7.2 Why this phase is special

- **Apple's Kids Category is the strictest review on the App Store.** First-submission rejection rate is high. Budget 1–2 rejection cycles.
- **COPPA compliance is a hard legal constraint,** not an Apple preference. Getting this wrong risks federal enforcement, not just rejection.
- **Child users cannot self-sign-up.** This changes the auth model materially vs adult app.
- **Third-party analytics forbidden.** Sentry cannot ship in the kids binary.
- **User-to-user comms forbidden.** DMs, comments, follows all stripped or disabled per-profile.

Full details in **`docs/planning/FUTURE_DEDICATED_KIDS_APP.md`** — re-read before starting.

### 7.3 Phases

Broken into sub-phases because of the complexity.

- **P3a** — Server-side pairing flow (can start NOW, independent of iOS work)
- **P3b** — Shared Swift Package extraction (requires adult iOS in TestFlight)
- **P3c** — Kids iOS app build
- **P3d** — Made for Kids App Store submission
- **P3e** — Kids web redirect

### 7.4 Deep-link strategy decision

**Option X — dedicated subdomain `kids.veritypost.com`**
- Clean URL space separation
- Adult app's AASA claims `veritypost.com/*`, kids app claims `kids.veritypost.com/*` — no iOS prompt
- Needs DNS setup (CNAME or A record to Vercel)
- Needs Vercel domain config to route `kids.veritypost.com` to adult-web project
- AASA files per subdomain
- Web middleware redirect for `kids.veritypost.com/*` → App Store link when kids app ships

**Option Y — path prefix `/kids/*`**
- No new DNS
- Messier associated-domains config: adult app excludes `/kids/*`, kids app includes only `/kids/*`
- iOS may still prompt in some cases; needs careful AASA `NOT /kids/*` exclusion on adult side
- Existing `web/src/app/kids/*` routes stay (they'll become redirects)

**Recommendation:** **Option X (subdomain).** Cleaner for SEO (kids content not interleaved with adult domain), cleaner for Apple review (obvious separation), same web-deploy effort. DNS is a one-time 5-minute task.

### 7.5 P3a — Server-side pairing flow (build NOW)

Independent of iOS work. Can be built while waiting for DUNS / during P2.

#### Schema addition

```sql
-- Short-lived pairing codes for kid device onboarding
CREATE TABLE kid_pair_codes (
  code TEXT PRIMARY KEY,  -- e.g., "7K2-9QM" (8-char, alphanum, no ambiguous chars)
  parent_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kid_profile_id UUID NOT NULL REFERENCES kid_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,  -- e.g., now() + interval '15 minutes'
  used_at TIMESTAMPTZ  -- NULL until consumed; codes are single-use
);

CREATE INDEX ON kid_pair_codes (parent_user_id);
CREATE INDEX ON kid_pair_codes (expires_at) WHERE used_at IS NULL;

-- RLS: parent can see their own codes; no other user can see any
ALTER TABLE kid_pair_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY kpc_select ON kid_pair_codes FOR SELECT
  USING (parent_user_id = auth.uid());

CREATE POLICY kpc_insert ON kid_pair_codes FOR INSERT
  WITH CHECK (parent_user_id = auth.uid());

-- Only service role can UPDATE (to mark used_at)
```

#### API endpoints

**`POST /api/kids/generate-pair-code`** (adult-auth-gated)
- Input: `{ kid_profile_id: UUID }`
- Validates: `kid_profile_id` belongs to `auth.uid()`'s family
- Generates random 8-char code
- Inserts `kid_pair_codes` row with 15-min expiry
- Returns: `{ code: "7K2-9QM", expires_at: "..." }`

**`POST /api/kids/pair`** (public, no auth)
- Input: `{ code: "7K2-9QM" }`
- Validates code unused + unexpired
- Marks `used_at = now()`
- Returns a JWT scoped to `kid_profile_id`, with claim `is_kid_delegated: true`
- JWT is signed by a new secret (separate from Supabase Auth JWTs so it can be validated by adult web's API routes)
- Kid profile token has narrow scope: can read article content, post kid-only comments (if feature), update reading progress — cannot access parent surfaces, cannot DM, cannot see adult-only categories

#### Parent UI

Add to `/profile/kids/[id]` page — new button "Pair new device":
- Click → POST `/api/kids/generate-pair-code` → show code + QR
- Show expiration countdown
- Parent reads/shows code/QR to child on kid device

#### Kid-token JWT validation

- Update `web/src/lib/auth.js` `resolveAuthedClient` to accept kid tokens as an alternate auth path
- Kid token identifies the `kid_profile_id`, not a `users.id`
- API routes that kids can hit (article read, bookmark, etc.) accept both adult and kid tokens; check the token type
- Admin / DM / adult-only routes reject kid tokens

#### `handle_new_auth_user` bypass

- Kid pairing does NOT create a new `auth.users` row
- Kid profile already exists in `kid_profiles` (created by parent)
- The pairing just issues a device-scoped token — no new identity in Supabase Auth

### 7.6 P3b — Shared Swift Package extraction

Run this while adult iOS is in TestFlight to validate the refactor in real conditions.

#### Target package structure

```
packages/ios-core/
├── Package.swift
└── Sources/
    └── VerityCore/
        ├── Models.swift           ← from VerityPost/VerityPost/Models.swift
        ├── SupabaseManager.swift  ← from VerityPost/VerityPost/SupabaseManager.swift
        ├── PermissionService.swift
        ├── Keychain.swift
        ├── Log.swift
        ├── Theme.swift
        ├── AuthViewModel.swift
        ├── TTSPlayer.swift
        ├── Password.swift
        └── PushRegistration.swift
```

#### Steps

1. Create `packages/ios-core/` with a `Package.swift` declaring library `VerityCore`, dependency on `supabase-swift`
2. Move the above Swift files from `VerityPost/VerityPost/` to `packages/ios-core/Sources/VerityCore/`
3. Update `VerityPost/project.yml` to add `packages/ios-core` as a local Swift Package dependency
4. Update imports in remaining `VerityPost/VerityPost/*.swift` files — replace direct references with `import VerityCore`
5. `xcodegen generate` to regenerate Xcode project
6. `xcodebuild` clean compile
7. Run TestFlight build — verify adult app behaves identically (regression test)

**Critical:** this must NOT change runtime behavior. Pure refactor. If adult iOS is already live, this is a point release with no user-facing changes.

**Rollback:** revert the commit that did the split; re-run `xcodegen generate` against old `project.yml`.

### 7.7 P3c — Kids iOS app build

#### Create the project

```bash
mkdir -p VerityPostKids
cd VerityPostKids
# Create project.yml for XcodeGen
```

`VerityPostKids/project.yml`:

```yaml
name: VerityPostKids
options:
  bundleIdPrefix: com.veritypost
  deploymentTarget:
    iOS: "17.0"

packages:
  VerityCore:
    path: ../packages/ios-core

targets:
  VerityPostKids:
    type: application
    platform: iOS
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.veritypost.kids
        INFOPLIST_FILE: VerityPostKids/Info.plist
    dependencies:
      - package: VerityCore
    sources:
      - path: VerityPostKids
```

Run `xcodegen generate` inside `VerityPostKids/`.

#### What to include

**From `VerityPost/VerityPost/`:**
- `KidViews.swift` → `VerityPostKids/KidViews.swift`
- `FamilyViews.swift` — actually, family is the parent-side — probably NOT in kids app. Review and split: is `FamilyViews` parent-dashboard (stays in adult) or kid-side family features (goes to kids)?
- Kid-specific bits of `ContentView.swift` → new minimal `VerityPostKidsApp.swift` that starts in kid mode, no adult mode switch

**New files in `VerityPostKids/`:**
- `VerityPostKidsApp.swift` — `@main` struct, initializes `VerityCore.SupabaseManager`, shows pairing view if no paired token in keychain, else shows kid home
- `PairingView.swift` — enter 8-char code OR scan QR → calls `POST /api/kids/pair` → stores kid token in keychain → transitions to kid home
- `KidHomeView.swift` — kid-mode home feed, kid articles, kid leaderboard — uses `VerityCore` for networking, `KidViews` for UI
- `ParentalGateView.swift` — reusable modal for any external link, settings change, IAP — requires math challenge per COPPA spec

**Dependencies via `VerityCore`:**
- `Models.swift`, `SupabaseManager.swift`, `PermissionService.swift`, `Keychain.swift`, `Log.swift`, `Theme.swift`, `TTSPlayer.swift`

**Explicitly NOT included:**
- Sentry SDK — kids binary has zero third-party analytics
- Any analytics framework
- `CommentComposer.swift` / comment UI / DM UI / follow UI
- Outbound source link opener (without parental gate wrap)
- Ad slot component
- Signup / email-password auth UI
- Admin UI

#### `Info.plist` for kids

```xml
<key>CFBundleDisplayName</key>
<string>Verity Post Kids</string>

<key>UIApplicationSupportsIndirectInputEvents</key>
<true/>

<!-- NO NSUserTrackingUsageDescription — we don't track -->

<!-- Associated domains for universal links -->
<key>com.apple.developer.associated-domains</key>
<array>
  <string>applinks:kids.veritypost.com</string>
</array>
```

#### Parental gates

Every:
- External link → show `ParentalGateView` modal → math challenge ("What is 4 + 7?") → pass → open Safari View Controller
- Settings change → same modal first
- IAP (if any) → same modal first (Apple requirement)

Implement as a reusable SwiftUI modifier: `.parentalGate { action() }` on any tap target.

### 7.8 P3d — Made for Kids App Store submission

#### New App Store Connect record

- Bundle ID: `com.veritypost.kids`
- Subscription group: **separate** from adult or **shared** — owner decision (affects family-plan inheritance)
- **Category:** Education (primary) + Kids (secondary, if Apple Kids-specific is avail)
- **Age band:** 4+ / 6–8 / 9–11 — pick based on target (recommended: 6–8 or 9–11)
- **Made for Kids toggle:** ON
- **Data collection declaration:** minimal — child data handling strictly per COPPA
- **Privacy policy:** separate kids-specific policy (mandatory) — link must be live
- **Contact for COPPA questions:** real email address monitored

#### Screenshots

Kids app gets its own set:
- 6.7" iPhone screenshots
- Show ONLY kid UI — no adult-mode screens leaking in
- 3–5 screenshots: kid home, kid article reader, kid quiz passing, achievements, leaderboard

#### Review notes

Critical. Apple reviewers look for:
1. **How does a child sign in?** — pairing code from parent; show screenshot
2. **Where is the parental gate?** — math challenge before any external link, IAP, settings change
3. **What data is collected from children?** — minimal: reading progress, quiz answers; stored in parent's account
4. **Third-party SDKs?** — supabase-swift only; no analytics
5. **User-to-user communication?** — none
6. **Contact for COPPA concerns?** — email + response SLA

#### Privacy Nutrition Labels (kids-specific)

Stricter than adult app:
- **Data collected:** linked to user (reading progress, quiz answers, kid_profile_id)
- **Data NOT tracked:** explicit declaration
- **Third-party SDKs:** supabase-swift (cite purpose: backend API calls)
- Contacts collected: none. Health: none. Financial: none. Precise location: none.

#### Submit for review

- Separate review queue (Made for Kids) — slower than regular queue
- **First-submission rejection is normal.** Typical reasons:
  - Privacy label mismatch with data collected
  - Parental gate wording unclear
  - Screenshots show adult UI bleed
  - Review notes incomplete
- Budget 2 rejection cycles. Respond to each resolution quickly.

### 7.9 P3e — Kids web redirect

Once kids iOS is approved + has an App Store link:

#### Middleware update in adult-web

`web/src/middleware.js` — add rule:
```javascript
// Kids subdomain → App Store link
if (request.nextUrl.hostname === 'kids.veritypost.com') {
  return NextResponse.redirect(
    new URL('https://apps.apple.com/app/<kids-app-id>'),
    308
  );
}
```

OR if using path prefix strategy (Option Y from §7.4):
```javascript
if (request.nextUrl.pathname.startsWith('/kids/')) {
  return NextResponse.redirect(
    new URL('https://apps.apple.com/app/<kids-app-id>'),
    308
  );
}
```

#### Handle SEO transition

- Existing `/kids/*` routes in `web/src/app/kids/` can either:
  - Stay alive as web pages (if kids app isn't universally adopted yet) + include Smart App Banner pointing at kids app
  - OR 308 to app store via middleware (cleaner but loses SEO surface)
- **Recommendation:** 308 after 30 days of kids app in store (Google re-indexes)

#### DNS setup (if subdomain)

- Add CNAME `kids.veritypost.com` → `cname.vercel-dns.com`
- Add domain in Vercel project (same project as adult web)
- Update AASA file per §6.4 C2 adjustments

### 7.10 Acceptance criteria

- [ ] **P3a:** `/api/kids/generate-pair-code` + `/api/kids/pair` endpoints live + tested on web
- [ ] **P3a:** `kid_pair_codes` table + RLS in prod
- [ ] **P3a:** Parent UI "Pair new device" in `/profile/kids/[id]`
- [ ] **P3b:** `packages/ios-core/` extracted, adult iOS builds + TestFlight green
- [ ] **P3c:** `VerityPostKids/` Xcode project compiles + runs in simulator
- [ ] **P3c:** Pairing flow works end-to-end in simulator (parent on web generates code → kid simulator enters code → kid home loads)
- [ ] **P3c:** No Sentry / analytics / tracking in kids binary (verified via `otool -L` or Xcode build phase inspection)
- [ ] **P3c:** Parental gate on every external link, IAP, settings change
- [ ] **P3d:** App Store Connect kids record created with Made for Kids on
- [ ] **P3d:** Privacy Nutrition Labels reviewed against actual data flows
- [ ] **P3d:** First-submission response received (expect rejection; respond within 48h)
- [ ] **P3d:** Approved + released
- [ ] **P3e:** `kids.veritypost.com` (or `/kids/*`) redirects to kids App Store link
- [ ] **P3e:** AASA files updated so adult app and kids app don't conflict

### 7.11 P3 effort estimate

| Sub-phase | Engineering | Calendar |
|---|---|---|
| P3a (server pairing) | 2–3 days | same, can parallel |
| P3b (Swift Package) | 3–5 days | 1 week including adult TestFlight regression |
| P3c (kids iOS build) | 1–2 weeks focused | 2 weeks |
| P3d (App Store review) | 2–4 days iteration per cycle | 3–5 weeks with 1–2 rejection cycles |
| P3e (web redirect) | 2 hours | same day |
| **Total from P3a start** | **~3–4 weeks engineering** | **~8–10 weeks calendar** |

### 7.12 P3 risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| COPPA compliance gap in review | High | High (rejection + rework) | Follow FUTURE_DEDICATED_KIDS_APP §COPPA checklist exactly; external COPPA review before submit |
| Parental gate UX too strict (kids give up) | Medium | Medium | Test with 3+ real families pre-submission |
| Shared Swift Package breaks adult app | Medium | High | P3b done during adult TestFlight to catch regression; rollback plan in §7.6 |
| Made for Kids review takes >8 weeks | Low | High (+ schedule slip) | Budget the time; don't promise dates to stakeholders |
| AASA path conflict prompts user to choose app | Medium | Medium | Use subdomain (Option X) to avoid entirely |
| Kid profile data accidentally leaks to adult surface | Low | High (COPPA + user trust) | Token scoping (P3a); kids binary architecturally can't reference adult views (Option B) |
| Sentry or analytics accidentally ships in kid binary | Medium | High (COPPA violation) | Build phase inspection pre-submit; rejected if found |
| Family plan IAP inheritance logic breaks | Medium | Medium | Test simple path first (no kids IAP, parent subscribes via adult) |

---

## 8. P4 — Ongoing evolution

These surfaces are always-on. Not phased.

### 8.1 Admin console

**Today:** 39 pages + 27 DS components locked at `@admin-verified 2026-04-18`. Lives inside adult web.

**Evolution queue:**
- **4 page rebuilds (WORKING.md):**
  - `/admin/features` — v2 `feature_flags` schema mismatch; rebuild with correct columns
  - `/admin/breaking` — no valid article insert path; owner product decision needed (dedicated `breaking_news_alerts` table or extend articles?)
  - `/admin/webhooks` retry — currently marks failed webhooks as success without retrying; either make real or rip
  - `/admin/support` ChatWidgetConfig — 120 lines of dead UI; wire or remove

- **Stripe-sync pass (owner-paired):**
  - `/admin/subscriptions` — wire `manualDowngrade`, `resumeAccount`, `processRefund`, `handleAdminFreeze` to Stripe API (today they only write DB state)
  - `/admin/plans` — price edits sync to Stripe price IDs
  - `/admin/promo` — promo creation syncs to Stripe coupons

- **Admin API LOCK asymmetry (decision):** 15/50 admin API routes have `@admin-verified`, 35 don't. Extend to all 50, or accept the asymmetry (UI frozen, API allowed to evolve)?

**When to extract admin to its own app:**
- Only when ONE of:
  - A bad admin deploy takes down public site too often (>2 incidents)
  - Admin needs independent scaling (unlikely for staff-only)
  - Separate auth boundary required (e.g., SSO for admins)
- Default: stays bundled. Document decision as first ADR.

### 8.2 Permission system

- **928 active permissions today** + 10 sets. Stable for launch.
- **Matrix source of truth:** `/Users/veritypost/Desktop/verity post/permissions.xlsx` — outside repo. **Planned move:** into `docs/reference/permissions-matrix.xlsx` (Phase 2 of restructure synthesis, deferred).
- **When permissions need adding:** edit xlsx → `node scripts/import-permissions.js` → commit generated JSON + migration → both clients pick up on `perms_global_version` bump.

### 8.3 Schema evolution

- **Numbering:** continue from 094. Next migration is 095. Never renumber existing.
- **Workflow:**
  1. Write `schema/NNN_description.sql` idempotent (CREATE OR REPLACE, IF NOT EXISTS, ON CONFLICT)
  2. Apply via Supabase Dashboard SQL Editor OR MCP `execute_sql`
  3. Run `cd web && npm run types:gen` to regenerate `web/src/types/database.ts`
  4. Regenerate Swift `Models.swift` by hand (no codegen today — future-state: shared types package)
  5. Update `schema/reset_and_rebuild_v2.sql` if the migration introduces a new table or reworks a policy — keeps DR replay path honest
- **Disaster recovery gap:** 092/093 currently missing on disk — P1 B1 closes this.

### 8.4 Wave 2 migration (the last 7%)

Already at 93% per marker grep. Remaining 24 unmarked files are framework conventions (`robots.js`, `sitemap.js`, `loading.js`, `manifest.js`, `Log.swift`, `Models.swift`, etc.) — they don't need the marker. Effectively complete.

**Consider:** mark them with `@framework-file` or similar so future audits don't re-flag. Non-blocking.

---

## 9. Cross-cutting / shared infrastructure

### 9.1 Environment variables inventory

Kept canonical here because it's one fact that crosses all phases.

**Vercel env (web + cron + iOS backend endpoints):**

| Var | Purpose | Set when |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | set ✓ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | set ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | set ✓ but **rotate P1 A2** |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL | **P1 A4** |
| `STRIPE_SECRET_KEY` | Stripe secret | set ✓ but **rotate P1 A2** |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing | set ✓ but **rotate P1 A2** |
| `RESEND_API_KEY` | Resend transactional email | set ✓ |
| `EMAIL_FROM` | Resend sender address | **P1 A5** |
| `OPENAI_API_KEY` | OpenAI (used somewhere?) | set ✓ |
| `CRON_SECRET` | Vercel cron bearer | set ✓ |
| `SENTRY_DSN` | Server-side Sentry | **P1 A3** |
| `NEXT_PUBLIC_SENTRY_DSN` | Client-side Sentry | **P1 A3** |
| `APNS_KEY_ID` | APNs auth key ID | **P2 D** |
| `APNS_TEAM_ID` | Apple team ID | **P2 D** |
| `APNS_AUTH_KEY` | APNs .p8 PEM contents | **P2 D** |
| `APNS_ENV` | `sandbox` or `production` | **P2 D** |
| `APNS_TOPIC` | APNs topic (bundle ID) | **P2 D** |
| `KIDS_PAIR_JWT_SECRET` | Secret for signing kid pairing JWTs | **P3a** |

**`web/.env.local`** mirrors the above for local dev. Keep synced.

### 9.2 Credentials rotation cadence

- **Every 90 days:** Supabase service role, Stripe secret, Stripe webhook signing
- **Every 180 days:** APNs key (replace with new one, keep old valid during rotation)
- **On team change:** always
- **On suspected compromise:** immediately

Track last-rotated date in `docs/runbooks/ROTATE_SECRETS.md`.

### 9.3 Content pipeline

- **Editorial source:** stories input to `/admin/story-manager` by editor/owner role
- **D1 rule:** 10+ quiz questions minimum per article
- **D12 rule:** kid articles need `kids-` slug prefix + appropriate category
- **Verification:** `check_user_category_metrics` RPC validates per-user reading distribution
- **Feed composition:** see `web/src/app/page.tsx` `FALLBACK_CATEGORIES` + DB categories. M-05 flagged as hardcoded but working.

### 9.4 Analytics / observability

- **Sentry:** error capture, breadcrumbs. DSN must be set before prod deploy per M-18.
- **Vercel Analytics:** automatic from Vercel dashboard, no code required.
- **Supabase advisors:** security + performance warnings. Run periodically via Supabase Dashboard.
- **Custom metrics:** `scripts/preflight.js` 60+ assertions. Run pre-deploy.
- **No third-party analytics** in kids binary (COPPA).

### 9.5 Backup + DR

- **Supabase automated backups:** daily, retained 7 days on free tier, 30 days on paid (verify tier).
- **Manual snapshot before prod deploys:** `pg_dump` per CUTOVER.md.
- **Schema replay:** `schema/reset_and_rebuild_v2.sql` + all numbered migrations in order, against fresh DB. Must match prod shape. **Currently broken — P1 B1 fixes.**
- **Test data restore:** `test-data/backup-2026-04-18/` has pre-permission-import snapshot.

---

## 10. Decisions log

### 10.1 Already decided (don't re-open)

| # | Decision | Date | Rationale |
|---|---|---|---|
| 1 | Admin stays bundled in adult web | 2026-04-19 | Solo owner, pre-launch; separate deploy not justified |
| 2 | Kids iOS architecture: **Option B** (two projects + shared Swift Package) | 2026-04-19 | Hard separation safer for COPPA; per restructure synthesis. Overrides FUTURE_DEDICATED_KIDS_APP's Option A preference |
| 3 | Bundle IDs: `com.veritypost.app` (adult) + `com.veritypost.kids` (kids) | 2026-04-19 | Preserves adult TestFlight; clean separation |
| 4 | Don't renumber migrations 005–094 | 2026-04-19 | Already applied to prod under those names |
| 5 | Kids pairing model: short code + QR, parent-generated | 2026-04-19 | Per FUTURE_DEDICATED_KIDS_APP §Auth flow rework; COPPA requires no child self-signup |
| 6 | Kids iOS deep-link: dedicated `kids.veritypost.com` subdomain | 2026-04-19 | Cleaner than `/kids/*` path prefix; avoids AASA conflicts |
| 7 | Repo restructure: flat top-level (`web/`, `VerityPost/`, `schema/`, `docs/`, `archive/`) | 2026-04-19 | Build visibility > taxonomic nesting |
| 8 | Swift Package extraction before iOS kids split | 2026-04-19 | Proves boundary while adult app still builds |
| 9 | `VerityPost/` stays named as-is (not renamed to `ios/`) | 2026-04-19 | Avoid Xcode/provisioning risk pre-launch |
| 10 | Hierarchy map `getMaxRoleLevel` retained | 2026-04-18 | 5 call-sites for actor-vs-target rank guards (F-034/035/036) |
| 11 | 16 structural CQ refactors deferred | 2026-04-17 | Owner direction: no pull-forward pre-launch |

### 10.2 Architectural patterns (implicit decisions worth re-surfacing)

- **Shared backend-only sharing** between web and iOS. No shared code.
- **Permission engine is the control plane.** Role hierarchy retained only for actor-vs-target guards.
- **Admin writes bump `users.perms_version`** → client refetch.
- **Bearer tokens + cookie sessions both accepted** server-side (Round 6 iOS-GATES).
- **Migrations are idempotent** (CREATE OR REPLACE, IF NOT EXISTS, ON CONFLICT).

---

## 11. Pending decisions (gate work)

These need owner call. Ordered by urgency.

### 11.1 Before P1 launch

- [ ] **Ship adult web with the 5 OPEN bugs, or close first?** — per §5.4, LB-013 Embedded Checkout is a product decision, LB-034 is ship-with-instrumentation. Others cheap to fix.
- [ ] **Holding-page blueprint** (`docs/planning/PRELAUNCH_HOME_SCREEN.md`) — implement, keep as reference, or drop? Affects whether there's maintenance-mode infra before P1 cutover.
- [ ] **Editorial — who writes the first 10 articles?** — owner solo, or hire freelance? Calendar impact on P1 Section D.
- [ ] **Permissions matrix format**: keep xlsx (CI generates JSON) or migrate to YAML/CSV (diffable PRs)?

### 11.2 Before P2 launch

- [ ] **DUNS application in flight?** — if not, start now regardless of whether P1 is done. 2–4 weeks turnaround.
- [ ] **App Store category primary + secondary** — Education? News? Lifestyle?
- [ ] **Age rating target** — 12+ or 17+? Affects copy in comments.
- [ ] **Phased rollout vs full release on P2 E6?** — phased safer, slower to ramp.

### 11.3 Before P3 start

- [ ] **When to start P3a (server pairing)?** — can start during P1 wait time, P2 calendar.
- [ ] **Kids app subscription group: shared with adult or separate?** — affects family plan inheritance.
- [ ] **Kids app IAP: none vs "Kids Plus"?** — recommendation: **none** (parent pays), add later if product reason emerges.
- [ ] **Kids app push: skip entirely first cut?** — recommendation: **yes, skip**.
- [ ] **COPPA contact email** — real monitored inbox required.
- [ ] **Parental privacy policy URL** — separate doc from adult privacy policy.

### 11.4 Cross-cutting

- [ ] **Admin API LOCK: extend to all 50 or accept asymmetry?** — not launch-blocking.
- [ ] **Behavioral anomaly detection (Blueprint 10.3)** — pre- or post-launch? (Impossible reading speed, rapid-fire quiz, etc.)
- [ ] **Access code / promo code launch strategy** — real codes at launch, or post-launch only?
- [ ] **Admin owner seat** — confirm owner account seeded with `owner` role before opening signups.
- [ ] **M-04 / M-05 / M-06 tech debt** — schedule to address in a "tech debt" sprint post-launch, or leave?

---

## 12. Risk register (consolidated)

### 12.1 P1 risks
See §5.10.

### 12.2 P2 risks
See §6.10.

### 12.3 P3 risks
See §7.12.

### 12.4 Cross-cutting risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Permission matrix drift (xlsx vs DB) | Medium | High | `scripts/import-permissions.js` is the only write path; xlsx moves into repo (Phase 2 restructure) |
| Schema migration applied to prod but not committed | Medium | High | Pre-deploy check: `git diff schema/` before applying; 092/093 drift is the canonical example |
| Supabase project compromised | Low | Critical | Rotate service role every 90d; 2FA on Supabase account; restrict dashboard access |
| Stripe account locked (fraud flag) | Low | Critical | Don't re-create merchant of record; keep transaction patterns boring early |
| Apple developer account locked | Low | Critical | Don't violate review guidelines egregiously; keep owner as account holder (not teammate) |
| DNS provider compromised | Very low | Critical | Registrar 2FA; registrar lock on domain |
| Sentry subscription lapses | Low | Medium | Billing on owner card; auto-pay |
| Someone (AI, human) modifies `@admin-verified` files | Low | Medium | Lock convention; PR review catches; grep-based CI check feasible |

---

## 13. Timeline

Rough estimates. Assume solo owner working part-time.

```
Month 1:   P1 owner blockers + editorial content + bug triage
           DUNS applied if not already
Month 2:   P1 cutover + 24h monitor + stabilize
           P3a server pairing flow built in parallel
Month 3:   DUNS approved (if applied month 1)
           P2 App Store Connect setup + TestFlight internal
Month 4:   P2 TestFlight external + submit + release
           P3b Swift Package extraction starts
Month 5:   P3c kids iOS build
           First submit to Made for Kids review
Month 6:   P3d iteration through rejections + approval
           P3e kids web redirect + launch
Month 7+:  Admin evolution (4 page rebuilds, Stripe-sync)
           Wave 2 marker cleanup
           Behavioral anomaly detection (if elected)
```

**Optimistic:** 5 months to all four live.
**Realistic:** 7–9 months.
**Pessimistic:** 12+ months if DUNS stalls or COPPA review requires 3+ cycles.

---

## 14. Supporting docs map

| Need | Doc |
|---|---|
| Current state snapshot | `/STATUS.md` |
| Today's active work list | `/WORKING.md` |
| Kids app deep dive | `docs/planning/FUTURE_DEDICATED_KIDS_APP.md` |
| Holding-page blueprint | `docs/planning/PRELAUNCH_HOME_SCREEN.md` |
| iOS UI audit agent briefing | `docs/planning/IOS_UI_AGENT_BRIEF.md` |
| Prod cutover runbook | `docs/runbooks/CUTOVER.md` |
| E2E manual test walkthrough | `docs/runbooks/TEST_WALKTHROUGH.md` |
| Secrets rotation checklist | `docs/runbooks/ROTATE_SECRETS.md` |
| Design decisions D1–D44 | `docs/reference/Verity_Post_Design_Decisions.md` |
| Feature ledger | `docs/product/FEATURE_LEDGER.md` |
| App Store metadata | `docs/product/APP_STORE_METADATA.md` |
| Permission migration tracker | `docs/product/PERMISSION_MIGRATION.md` |
| Parity matrix (web vs iOS) | `docs/product/parity/` |
| Schema + migrations | `schema/` |
| Historical build logs | `docs/history/` |
| Closed sprint archives | `archive/<pass>/_README.md` |
| HIBP toggle clickpath | `archive/2026-04-19-prelaunch-sprint/round_g_owner_action.md` |
| Round A SQL (for migration 092 commit) | `archive/2026-04-19-prelaunch-sprint/round_a_migration.sql` |
| Round B SQL (for migration 093 commit) | `archive/2026-04-19-prelaunch-sprint/round_b_migration.sql` |
| Capstone verification report | `archive/2026-04-19-prelaunch-sprint/_prelaunch_capstone_report.md` |
| Structure synthesis (future repo shape) | `archive/restructure-2026-04-19/structure-synthesis.md` |

---

## 15. How to update this doc

- Bump "Last refreshed" at top on any change
- When a decision closes in §11, move it to §10 with date + rationale
- When a P-phase completes, mark it `DONE ✓` at the phase header; don't delete content — history is reference
- **Do NOT migrate STATUS.md or WORKING.md content here.** This is strategic; those are state + tactical. Link instead.
- If a risk in §12 materializes, add a dated incident note and update mitigation from "planned" to "active"
- When timeline (§13) slips, update the estimate; don't hide slippage
- If you find yourself writing the same paragraph into two P-sections, refactor into §9 (cross-cutting)
