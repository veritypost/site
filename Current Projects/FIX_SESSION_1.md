# Fix Session 1

Single source of truth for every fix under consideration in this session. Each item lists the exact files / lines / functions to touch so work can start without re-investigating. Owner decides which to execute.

**Process note:** Verification trails preserved in `Archived/_retired-2026-04-21/UI_AUDIT_REVIEW.md`. Do not reference these items from any other live doc — this file is canonical.

---

## Verdict summary — every item (35 total)

### Owner immediate actions (00-)

| # | Title | Verdict | Effort |
|---|---|---|---|
| 00-A | Enable pg_cron | REAL, WORTH DOING | 2 min Supabase / 15 min Vercel-cron alt |
| 00-B | AdSense publisher ID + ads.txt | REAL, WORTH DOING (gated on Google approval) | 15 min |
| 00-C | **URGENT** Supabase URL typo | STILL OPEN, owner-verify | 2 min + redeploy |
| 00-D | Sentry activation | REAL, WORTH DOING (post-launch OK) | 10 min |
| 00-E | Other env vars (PREVIEW/HEALTH/APPLE CA) | REAL-OPTIONAL all three | 5 min each if needed |
| 00-F | CSP Report-Only → enforce flip | REAL, WORTH DOING (post-launch; perf tradeoff) | 1-2 hrs |
| 00-G | Stripe live-mode audit | REAL, WORTH DOING (code safe; operational check) | 30-60 min |
| 00-H | Vercel full audit | REAL, WORTH DOING (repo clean; owner-side hygiene) | 30 min |
| 00-I | Apple Dev enrollment | REAL, WORTH DOING (iOS blocker) | 15 min start + wait |
| 00-J | Remove ex-dev from Vercel | REAL, SECURITY-CRITICAL | 30 sec |
| 00-K | Stripe 3-check | REAL, REDUCED SCOPE (team check only) | 30 sec |
| 00-L | Publish ≥10 articles + quiz content | Count DONE (15-16). Quizzes OPEN (0/16 have ≥10 qs). Launch-blocking. | editorial |
| 00-M | Apply schema/106 kid-trial notification | REAL, OPEN, funnel-impacting | 2 min |
| 00-N | DR migration list reconciliation | REAL, OPEN — 13 live migrations missing from repo | ~1 hr dev |
| 00-O | Enable HIBP | REAL, OPEN (owner-external) | 30 sec |

### Discrete dev fixes (#1-#20, UI audit — already reviewed in prior pass)

See §"UI — Discrete targeted fixes" and §"UI — Design-system bundle" sections below for full detail.

### Feature-scope proposals (F1-F7)

| # | Title | Verdict | Scope |
|---|---|---|---|
| F1 | Sources above headline | LEGIT & READY TO SHIP | ~1 hr |
| F2 | Reading receipt | LEGIT, needs data-piping prep | 3-8 hrs |
| F3 | Earned chrome comments | LEGIT but sequenced (flip kill-switch first) | 2-3 hrs after prereq |
| F4 | Quiet home feed | MOSTLY DONE | 2-3 hrs remaining |
| F5 | Ads gameplan | MOSTLY DONE, CMP is critical gap | 2-3 days |
| F6 | Measurement masterplan | FOUNDATION DONE, dashboards open | ~1 week pragmatic / 4-5 full |
| F7 | Pipeline restructure | LEGIT XL, 8 owner decisions pending | ~17 hrs focused |

### Top launch-critical items (do these first)

1. **00-C** Supabase URL typo (URGENT — unblocks all auth/DB on prod)
2. **00-J** Remove ex-dev from Vercel (security, 30 sec)
3. **00-L** Quiz content (need ≥10 q per published article; currently 0/16)
4. **00-M** Apply schema/106 (kid-trial → Family conversion funnel)

Everything else is post-launch polish or parked per owner.

### Cross-item overlaps worth noting

- **Reader-UX cluster:** F1 + F2 + F3 + F4 all touch `web/src/app/story/[slug]/page.tsx` or home feed. If shipping >1, plan together.
- **Monetization cluster:** 00-B + F5 + F6 share AdSense/events infra. F5's CMP gap blocks safe EU AdSense launch.
- **Quiz-gate cluster:** F3 needs kill-switch flip. 00-L needs ≥10 questions. Both feed the "earned comments" product spine.
- **Design-system cluster:** UI audit items #4, #12, #13, #14, #20 are one underlying problem; Track A (responsive only) vs. Track B (full cleanup) — see UI sections below.

---

**Prefix legend:**
- `00-` = IMMEDIATE OWNER action (owner reviews later; skipped in agent execution)
- (no prefix) = dev/agent work, ready to execute on approval

---

## 00- Owner immediate actions (from `07-owner-next-actions.md`)

### 00-A — Enable `pg_cron` extension
**What:** Without pg_cron, `schema/108_events_pipeline.sql`'s partition auto-maintenance doesn't run (next-day partition creation + old-partition drops).
**Target:**
1. Supabase → Database → **Extensions** → search `pg_cron` → **Enable**
2. Re-run `schema/108_events_pipeline.sql` in SQL Editor (idempotent — the DO block detects pg_cron on re-run and registers 2 jobs)
3. Verify: `SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'events-%'` — expect 2 rows

**Fallback if not enabled:** weekly manual run of `SELECT public.create_events_partition_for(current_date + 1); SELECT public.drop_old_events_partitions(90);`

**Alternative (no Supabase dashboard action needed):** add a Vercel cron route (`web/src/app/api/cron/events-maintenance/route.ts`) calling the two functions daily. Vercel cron is already wired for other tasks.

**Verified 2026-04-21:** pg_cron NOT installed (MCP). Without auto-maintenance: tomorrow's events fall into DEFAULT partition, old partitions persist (no 90-day retention), storage bloats.

**Verdict: REAL and WORTH DOING** (2 agents converged). Either 2-min Supabase enable OR 15-min Vercel-cron alternative.

**Effort:** 2 min Supabase dashboard / 15 min Vercel cron alternative

---

### 00-B — AdSense publisher ID + ads.txt
**What:** AdSense integration awaiting domain approval.
**Target (once AdSense approves):**
1. Copy pub ID `ca-pub-xxxxxxxxxxxxxxxx` from AdSense console
2. Vercel → Settings → Environment Variables → add `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID=ca-pub-xxxxxxxxxxxxxxxx`
3. Edit `web/public/ads.txt:12` — currently reads `# google.com, ca-pub-REPLACE_WITH_REAL_ID, DIRECT, f08c47fec0942fa0`. Uncomment + replace placeholder with real pub ID. Commit + push.
4. In `/admin/ad-placements`, create `ad_unit` rows with `ad_network='google_adsense'`, `ad_network_unit_id=<AdSense slot ID>`, `approval_status='approved'`
5. Verify: DevTools Network tab shows `pagead2.googlesyndication.com/.../adsbygoogle.js` on every page; `curl https://veritypost.com/ads.txt` returns the pub line

**Verified 2026-04-21:** All infrastructure staged — `AdSenseSlot.tsx`, `Ad.jsx` dispatch (line 93 gates on `ad_network='google_adsense' && ad_network_unit_id && ADSENSE_PUBLISHER_ID`), `layout.js` lines 153-160 loads `adsbygoogle.js` only when env var is set, schema/110 adapter applied. `ads.txt` placeholder at line 12. Fallback works: without pub ID, direct/house ads still serve via Ad.jsx lines 110-139.

**Verdict: REAL and WORTH DOING** (2 agents converged) — gated on AdSense approval (external).

**Effort:** 15 min (gated on external AdSense approval)

---

### 00-C — URGENT: `NEXT_PUBLIC_SUPABASE_URL` truncated in Vercel
**What:** Vercel env value is `https://fyiwulqphgmoqullmrfn.supabase.c` (missing trailing `o`). Every browser-bundle supabase-js call fails DNS lookup after ~8s stall, surfaces as "Invalid credentials" on login. Nothing works until fixed.

**Target:**
1. Vercel → Project → Settings → Environment Variables → `NEXT_PUBLIC_SUPABASE_URL`
2. Correct value: `https://fyiwulqphgmoqullmrfn.supabase.co`
3. Deployments → latest → ⋯ → **Redeploy** → **uncheck "Use existing Build Cache"** (critical — `NEXT_PUBLIC_*` baked into bundle at build time; editing value alone won't propagate without fresh build)

**Verify post-redeploy:** login page signs in without stalling; DevTools Network shows requests to `fyiwulqphgmoqullmrfn.supabase.co` (not `.supabase.c`).

**Status:** agents could not verify from repo — OWNER-VERIFY. The `.env.example` line 10 documents the correct URL; repo code uses `process.env.NEXT_PUBLIC_SUPABASE_URL`; the issue is Vercel-side only.

**Verified 2026-04-21 (2 agents):** Cannot resolve from repo. Prod HTML curl doesn't reveal client-side env var; Supabase auth logs show 200s (ambiguous — either fixed or no recent login attempts). `.env.example` + code both correct. **Owner must check Vercel directly.**

**Quick owner-verify:** Vercel → Project → Settings → Environment Variables → `NEXT_PUBLIC_SUPABASE_URL`. If value reads `...supabase.co` (ends with `o`), mark DONE. If `...supabase.c`, fix + redeploy without build cache.

**Verdict: STILL OPEN** until owner manually verifies.

**Effort:** 2 min + redeploy time

---

### 00-D — Sentry activation
**What:** 5 Sentry env vars documented in `.env.example` (lines ~35-39) but not yet set in Vercel. `next.config.js` builds fine without them; real errors currently only go to `console.error` + the local `/api/errors` endpoint (which has `.catch(() => {})` swallow — see dev fix #11).
**Target (when ready):**
1. Create Sentry project (sentry.io)
2. Vercel → Env Vars:
   - `SENTRY_DSN=<value>`
   - `NEXT_PUBLIC_SENTRY_DSN=<value>`
   - `SENTRY_ORG=<org-slug>`
   - `SENTRY_PROJECT=<project-slug>`
   - `SENTRY_AUTH_TOKEN=<upload-token>`
3. Redeploy to pick up at build time.

**Verified 2026-04-21:** Full wiring present — `@sentry/nextjs@8.40.0`, `web/src/instrumentation.ts`, `web/sentry.client.config.js`, `web/sentry.shared.js` (PII scrubber via `beforeSend`), `web/next.config.js:56-81` `withSentryConfig` + M-18 fail-loud on prod build if dep fails to load. Fallback `/api/errors` endpoint rate-limited 60/min, PII-truncated, writes to `error_logs` table.

**Caveat:** `error.js:9-19` + `global-error.js:10-20` POST to `/api/errors` with `.catch(() => {})` — if endpoint down, crashes never logged. Activating Sentry provides redundant coverage (resolves part of item #11).

**Verdict: REAL and WORTH DOING** (2 agents). Post-launch acceptable per owner; fallback covers basic case pre-launch.

**Effort:** 10 min. Parked per owner "post-launch."

---

### 00-E — Other env vars to confirm or set in Vercel
Based on `.env.example` rewrite from 2026-04-20. Each is optional; document-by-document verified 2026-04-21:

- **`PREVIEW_BYPASS_TOKEN`** — consumed at `web/src/app/preview/route.ts:18`. Only matters when `NEXT_PUBLIC_SITE_MODE=coming_soon` (ties to item #19). Without it + coming_soon mode: bypass always fails. Without it + normal mode: never consulted.
- **`HEALTH_CHECK_SECRET`** — consumed at `web/src/app/api/health/route.js:32-43`. If unset, endpoint returns shallow `{ ok, checks: { db }, latency_ms, ts }` — no error. With it, authenticated `x-health-token` header gets detailed env-var presence checks.
- **`APPLE_ROOT_CA_DER_BASE64`** — consumed at `web/src/lib/appleReceipt.js:31`. If unset, falls back to `web/src/lib/certs/apple-root-ca-g3.der` (file shipped in repo and confirmed present). StoreKit 2 receipt validation works without the env var.

**Verdict: REAL-OPTIONAL** (all 3). Only `PREVIEW_BYPASS_TOKEN` is conditionally required (when using holding page).

**Effort:** 5 min per var if/when needed.

---

### 00-F — Flip CSP from Report-Only to enforce mode
**What:** `web/src/middleware.js:159, 213, 223, 250` sets `Content-Security-Policy-Report-Only` header. `buildCsp()` at lines 65-78 constructs enforce-capable CSP but not used; reason per middleware comment (lines 151-158) is static prerendering breaking nonce on Next.js bootstrap.
**Target (post-launch):** resolve nonce via `headers().get('x-nonce')` in `web/src/app/layout.js` or add `export const dynamic = 'force-dynamic'`; swap `Content-Security-Policy-Report-Only` → `Content-Security-Policy` in middleware.
**Violations currently reported to:** `/api/csp-report`.

**Verified 2026-04-21:** Enforce flip was attempted 2026-04-20 (commit `c7af18a`), reverted same day (`434aba5`). Blocker confirmed architectural — layout.js does NOT currently read `headers().get('x-nonce')` nor declare `dynamic = 'force-dynamic'`. Both fix paths sacrifice static prerendering (latency + infra cost tradeoff).

**Verdict: REAL and WORTH DOING** (post-launch correct per owner; performance tradeoff needs evaluation before flip).

**Effort:** 1-2 hrs. Post-launch.

---

### 00-G — Stripe live-mode audit + webhook smoke test
**What:** Confirm live-mode keys set, webhook signing secret rotated, test checkout → webhook → plan flip end-to-end in prod. Parked per owner "post-launch."

**Verified 2026-04-21:** Stripe code is production-grade. `web/src/lib/stripe.js` webhook uses HMAC timing-safe sig check + 5-min timestamp window + raw-body read before JSON parse; checkout has no test-mode fallback; `webhook_logs` enforces idempotency via unique event_id. `.env.example` documents 2026-04-20 key rotation to `sk_live_*`. `scripts/check-stripe-prices.js` auto-detects mode via `STRIPE_SECRET_KEY` prefix. `scripts/stripe-sandbox-restore.sql` is a captured rollback-to-test-mode block.

**Remaining owner tasks:** (1) verify `STRIPE_SECRET_KEY` starts with `sk_live_` in Vercel; (2) verify `STRIPE_WEBHOOK_SECRET` matches current live webhook endpoint; (3) run end-to-end smoke checkout → webhook → plan flip; (4) Stripe dashboard review (keys / Connect / team) — overlaps with 00-K.

**Verdict: REAL and WORTH DOING** (post-launch OK; code is safe).

**Effort:** 30-60 min.

---

### 00-H — Full Vercel config audit (+ env var history check)
**What:** Cron settings, regions, build step, deployment protection. PLUS: Settings → Environment Variables → "View History" on each row; look for unexpected edits in the last few months by the ex-dev. Settings → Git / Deployment Protection should be on for production.

**Verified 2026-04-21:** Code side clean. `web/vercel.json` declares 9 crons, all matching routes under `web/src/app/api/cron/`. `.env.example` documents 27-28 required env vars with rotation dates (2026-04-20). CHANGELOG line 149 shows minor cron-parity drift already resolved. No repo-side rot.

**Real audit value is owner-external:** env var history for ex-dev edits; deployment protection on prod; team members (ex-dev removed? → 00-J); region/build settings.

**Verdict: REAL and WORTH DOING** (operational hygiene; repo is clean).

**Effort:** 30 min.

---

### 00-I — START Apple Developer account enrollment
**What:** `developer.apple.com → Enroll → $99/year`. Individual is fastest; Organization needs DUNS and takes 2+ weeks. Blocks everything iOS (App Store products, APNs, Universal Links, TestFlight, `.p8` auth key).
**Importance:** HIGH — multi-day approval lead time. Start now even though web launches first.

**Verified 2026-04-21:** ~38-63 Swift files waiting. IAP product IDs hardcoded in `VerityPost/VerityPost/StoreManager.swift:50-57` (8 products: `com.veritypost.{verity,verity_pro,verity_family,verity_family_xl}.{monthly,annual}`). APNs credentials (`APNS_AUTH_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`) documented in `.env.example` but unset. `apple-app-site-association` file absent. `CLAUDE.md` tasks T-033..T-038 all gated on enrollment. Web launch unaffected.

**Verdict: REAL and WORTH DOING** (iOS launch-blocking; web unaffected).

**Effort:** 15 min to start; multi-day wait for approval.

---

### 00-J — Remove ex-dev from Vercel team
**What:** Vercel dashboard → Settings → Team → remove the ex-dev account. Key rotation doesn't kick someone out of the team; while on the team they could deploy a branch that overwrites env vars (bypasses rotation).
**Importance:** CRITICAL security hygiene. Do before anything else above.

**Verified 2026-04-21:** `Reference/CHANGELOG.md` documents "lead developer was let go mid-project"; session logs reference "post-fired-dev audit." Git history shows only `admin@veritypost.com` commits (ex-dev didn't commit directly via this account). Vercel team membership not checkable from repo — owner must verify + remove.

**Verdict: REAL and WORTH DOING** (security-critical).

**Effort:** 30 sec.

---

### 00-K — Stripe 3-check
**What:** Quick safety check (not full audit — that's 00-G):
1. Developers → Webhooks — only one endpoint, pointing at `veritypost.com/api/stripe/webhook`?
2. Connect → Accounts — none you didn't create?
3. Settings → Team — ex-dev removed?
**If all 3 clean:** deeper audit (00-G) can wait.

**Verified 2026-04-21:** Repo has only 1 webhook endpoint (`web/src/app/api/stripe/webhook/route.js`) — check #1 trivially clean. Zero Stripe Connect code anywhere (no `stripe.accounts` or connect usage) — check #2 pre-verified at code level; only unauthorized Connect-account creation would surface here. Owner action effectively reduces to check #3: Stripe dashboard team review, ex-dev removal.

**Verdict: REAL but REDUCED SCOPE** — 30 sec action (just team check), not 2 min.

**Effort:** 30 sec.

---

### 00-L — Publish ≥10 real articles; remove test placeholders
**Updated status 2026-04-21 (2 agents):**
- **Article count: DONE.** 15-16 published non-test articles now live (target was ≥10). 0 test placeholders remain. ~10 articles published on 2026-04-21.
- **Quiz content: STILL OPEN and LAUNCH-BLOCKING.** Zero articles currently have the ≥10 questions required to unlock comments per product spine (CLAUDE.md, decision D1). 5 articles have 3 questions each; other 10+ have zero. Discussion feature is functionally unavailable on every published article.

**New scope:** author ~50+ quiz questions across the 15-16 published articles so each has ≥10. Without this, the platform's core "earn-the-comments" mechanic never triggers.

**Target:**
1. For each published article, bring quiz pool to ≥10 questions via `/admin/story-manager` quiz editor.
2. Verify: `SELECT article_id, count(*) FROM quiz_questions GROUP BY article_id HAVING count(*) >= 10` returns all 15-16 articles.

**Verdict: REAL, OPEN, LAUNCH-BLOCKING** (the question count, not the article count).

**Effort:** depends on how quizzes are authored (manual vs. AI-assisted pipeline).

---

### 00-M — Apply `schema/106_kid_trial_freeze_notification.sql`
**Status (verified 2026-04-21, 2 agents):** migration NOT in applied list; function `freeze_kid_trial` either absent or exists in pre-notification stub form. Either way, notification logic is not live.
**What:** `CREATE OR REPLACE FUNCTION freeze_kid_trial` that extends the kid-trial cron to notify parent when trial freezes (D44). PostgREST doesn't accept DDL so owner must apply manually.
**What breaks without it:** kid trials freeze silently → parents never receive `kid_trial_expired` notification → upgrade-to-Family conversion flow (D44) degrades. `kid_trial_expired` email template sits unused.
**Target:**
1. Supabase → SQL Editor → paste contents of `schema/106_kid_trial_freeze_notification.sql`
2. Run
3. Verify: `SELECT prosrc FROM pg_proc WHERE proname = 'freeze_kid_trial'` returns the new body containing `create_notification` call

**Verdict: REAL and OPEN** (launch-blocking for kid-product conversion funnel).

**Effort:** 2 min.

---

### 00-N — DR migration list reconciliation
**Status shift 2026-04-21:** No owner action needed — MCP fetches migration list directly. But agent verification revealed **13 live-DB migrations don't exist as files in `schema/`** (recent RLS lockdowns, auth-integrity fixes, ticket system changes, banners storage, etc.). `schema/reset_and_rebuild_v2.sql` (last edit 2026-04-20) cannot fully reproduce live DB state — disaster-recovery replay is genuinely broken.

**Converted to dev reconciliation work:**
1. Via MCP, get each missing migration name + applied-at from `supabase_migrations.schema_migrations`
2. Reconstruct the DDL for each (extract from live state or search git history if previously committed under different numbering)
3. Commit missing files to `schema/` with correct sequential numbers
4. Patch `schema/reset_and_rebuild_v2.sql` to include all new tables/functions/indexes/RLS/triggers

**Verdict: REAL and OPEN** (higher priority than "optional" — DR is broken until reconciled). Launch-blocking only if you care about DR; most pre-launch teams defer this.

**Effort:** ~1 hr dev work.

---

### 00-O — Enable HIBP leaked-password protection
**What:** Authentication → Policies → toggle "Leaked password protection" ON in Supabase. Blocks signup with known-breached passwords (HaveIBeenPwned integration).
**When:** before opening signups to real users (pre-launch test cohort doesn't warrant it; real users do).

**Verified 2026-04-21:** HIBP setting is dashboard-only; no MCP / SQL path to check current state or toggle. Pure owner action.

**Verdict: REAL and OPEN** (fully owner-external).

**Effort:** 30 sec.

---

### 00- Summary — critical vs. nice

**Launch-critical (block-or-risk):**
- **00-C** Supabase URL typo — URGENT, nothing works until fixed
- **00-J** Remove ex-dev from Vercel — security hygiene
- **00-L** ≥10 published articles — content launch-blocker
- **00-M** Apply schema/106 — parent notifications for kid trials

**Important but not blocking:**
- **00-I** Apple Dev enrollment (multi-day wait)
- **00-K** Stripe 3-check (2 min sanity)
- **00-O** HIBP (before real-user signups)
- **00-A** Enable pg_cron (partition maintenance)

**Parked / post-launch:**
- **00-B** AdSense (gated on external approval)
- **00-D** Sentry activation
- **00-E** Other env vars
- **00-F** CSP enforce flip
- **00-G** Stripe full audit
- **00-H** Vercel full audit
- **00-N** DR migration list

---

## UI — Discrete targeted fixes (~4-8 hrs total)

### 1. Per-page `<title>` metadata — merged with SEO polish **[PARTIAL SHIP 2026-04-21 — server components done]**
**Problem:** ~100 static/list routes inherit the root title from `web/src/app/layout.js`. Dynamic routes already have per-page metadata (see `web/src/app/story/[slug]/layout.js`, `u/[username]/layout.js`, `card/[username]/layout.js`). Home + category pages ALSO lack per-page metadata (see SEO sub-items below).

**Three fix patterns depending on component type:**

**(a) Server components — just add `export const metadata = {...}` to the existing page file:**

**Canonical pattern example:** `web/src/app/about/page.tsx` (added 2026-04-21 in commit `cbdea50`) — server component with `export const metadata: Metadata = { title: '...', description: '...' }` at top. Copy this shape for each.

- ~~`web/src/app/about/page.tsx`~~ — DONE ("About — Verity Post") in commit `cbdea50`
- `web/src/app/privacy/page.tsx` — "Privacy policy — Verity Post" (still missing metadata even after `cbdea50` content edits)
- `web/src/app/terms/page.tsx` — "Terms of service — Verity Post" (still missing)
- `web/src/app/cookies/page.tsx` — "Cookie policy — Verity Post"
- `web/src/app/dmca/page.tsx` — "DMCA — Verity Post"
- `web/src/app/accessibility/page.tsx` — "Accessibility — Verity Post"
- `web/src/app/help/page.tsx` (server) — "Help — Verity Post"
- `web/src/app/how-it-works/page.tsx` (verify whether `'use client'`) — "How it works — Verity Post"

**(b) Client components — create `layout.js` (server) in each route folder with `export const metadata`:**
- `web/src/app/login/layout.js` — "Sign in — Verity Post"
- `web/src/app/signup/layout.js` — "Create account — Verity Post"
- `web/src/app/bookmarks/layout.js` — "Bookmarks — Verity Post"
- `web/src/app/leaderboard/layout.js` — "Leaderboard — Verity Post"
- `web/src/app/profile/layout.js` — "Profile — Verity Post"
- `web/src/app/admin/layout.js` — "Admin — Verity Post"
- `web/src/app/page.tsx` uses `'use client'` — create `web/src/app/layout-home.js` OR restructure so home can have its own metadata (tricky because `/` shares root layout)
- `web/src/app/category/[id]/page.js` uses `'use client'` — create `web/src/app/category/[id]/layout.js`

**(c) Pattern to copy:** `web/src/app/story/[slug]/layout.js` (has `generateMetadata`) for dynamic; static routes get `export const metadata = { title: 'X — Verity Post' }`.

**Options:** skip / top 10 routes (~30-45 min) / full sweep all ~100 routes (few hrs)

**Overlap note:** This fold supersedes PRE_LAUNCH_AUDIT's "SEO polish — legal pages / home / category" sub-items. Together, item #1 + sub-items here are the complete "per-page metadata" fix.

**SHIPPED 2026-04-21 (server-component group)** — 6-agent verification all GREEN:
- `privacy/page.tsx` — "Privacy Policy — Verity Post"
- `terms/page.tsx` — "Terms of Service — Verity Post"
- `cookies/page.tsx` — "Cookie Policy — Verity Post"
- `dmca/page.tsx` — "DMCA — Verity Post"
- `accessibility/page.tsx` — "Accessibility — Verity Post"
- `help/page.tsx` — "Help — Verity Post" (App Store Support URL)
- `/about` already had metadata (commit `cbdea50` — canonical pattern used)
- Each file imports `Metadata` type from `next` and exports `const metadata: Metadata = { title, description }`. Em-dash formatting consistent across files. No root `title.template` so no double-decoration. GA4 will now get distinct `page_title` values. OG/Twitter inherit root metadata fallback (still works).

**Remaining (client components — separate layout.js work deferred):**
- `web/src/app/page.tsx` (home), `category/[id]/page.js`, `login/page.tsx`, `signup/page.tsx`, `bookmarks/page.tsx`, `leaderboard/page.tsx`, `profile/page.tsx`, admin routes — these need sibling `layout.js` files since `'use client'` blocks direct metadata export. ~30-45 min if tackled.

**SHIPPED 2026-04-21 (client group, partial)** — 6-agent verification all GREEN. Created 6 new sibling `layout.js` files:
- `web/src/app/login/layout.js` — "Sign in — Verity Post"
- `web/src/app/signup/layout.js` — "Sign up — Verity Post"
- `web/src/app/bookmarks/layout.js` — "Bookmarks — Verity Post"
- `web/src/app/leaderboard/layout.js` — "Leaderboard — Verity Post"
- `web/src/app/profile/layout.js` — "Profile — Verity Post"
- `web/src/app/category/[id]/layout.js` — "Category — Verity Post" (static; dynamic `generateMetadata` deferred as future sprint if SEO data shows landing-page value)

Skipped: home (`/` — root layout owns brand title, distinct metadata would require route-group restructure), admin (`@admin-verified` locked + zero SEO ROI per agent D).

Pattern used: plain `.js` layouts matching repo convention (root layout.js + all dynamic layout.js files are .js), minimal shape — `export const metadata = { title, description }` + default `Layout({ children })` pass-through. Server components by default (no `'use client'`), so metadata export works directly. All page.tsx siblings untouched.

---

### 2. Regwall modal — Escape handler + body scroll lock + unify copy **[SHIPPED 2026-04-21]**
**Problem:** Focus-trap + close button work; Escape is explicit no-op; no body scroll lock; copy mixed across 3 strings in same modal.

**Targets (all in `web/src/app/story/[slug]/page.tsx`):**
- **Line 308:** comment reads *"Escape remains a no-op"* → change the `useFocusTrap` call at line 311 to pass `{ onEscape: () => setShowRegWall(false) }` (pattern matches report modal at lines 314-316)
- **Lines 724-768:** modal block — add `useEffect` on `showRegWall` to set `document.body.style.overflow = 'hidden'` on mount, restore on unmount
- **Lines 757-765:** unify copy:
  - Current: headline "Sign up to keep reading" + body "Create an account to continue" + button "Create free account"
  - Suggest: headline stays ("Sign up to keep reading"), body "Free and takes 30 seconds.", button stays ("Create free account")

**Options:** skip / Escape only (~10 min) / full fix (~30 min, recommended)

**SHIPPED 2026-04-21** (6-agent verification: 4 pre-impl + 2 post-impl, both GREEN):
- Extracted close logic into shared `dismissRegWall` handler that writes `sessionStorage` + sets state (line 316). Fixes prior PM's "Escape no-op" concern — now Escape and Close button both persist dismissal consistently.
- `useFocusTrap(showRegWall, regWallRef, { onEscape: dismissRegWall })` wires keyboard dismissal.
- Scroll-lock `useEffect` on `showRegWall` mirrors `Interstitial.tsx:28-33` pattern (sets `body.overflow = 'hidden'` on open, restores prev on close/unmount).
- Body copy unified: "You've reached the free article limit. Create an account to continue." → "Free, and takes 30 seconds." Headline + button unchanged.
- Verified: `role="dialog"` / `aria-modal` / `aria-labelledby="regwall-title"` all preserved; report modal's `onEscape` unaffected; `useFocusTrap` hook's internal `onEscapeRef` handles closure stability (no `useCallback` needed); no analytics coupling to button text; no e2e test refs.

---

### 3. Auth pages a11y — port login pattern to signup/forgot/reset **[SHIPPED 2026-04-21]**
**Problem:** `login/page.tsx` has full a11y; 3 other auth pages miss `htmlFor`/id, `role="alert"`, `aria-describedby`.

**Reference (the working pattern):** `web/src/app/login/page.tsx:241, 246, 253, 255, 271, 274`.

**Targets:**
- `web/src/app/signup/page.tsx:179, 188, 212` — labels need `htmlFor="..."` matching input `id="..."`. Error div at lines 171-174 needs `id="signup-form-error" role="alert"`. Form needs `aria-describedby={error ? 'signup-form-error' : undefined}`.
- `web/src/app/forgot-password/page.tsx:77-80, 92-93` — same treatment.
- `web/src/app/reset-password/page.tsx:141-144, 149-151, 184-185` — same treatment.

**Copy voice:** do NOT rewrite. Current copy is technical/neutral (not accusatory as audit claimed).

**Options:** skip / port pattern only (~20-30 min, recommended) / + copy rewrite (+30-45 min, subjective)

**SHIPPED 2026-04-21** (6-agent verification: 4 pre-impl + 2 post-impl, both GREEN):
- `signup/page.tsx` — `id="signup-form-error"` + `role="alert"` on error div; `aria-describedby` on form; 3 `htmlFor`/`id` pairs (signup-email, signup-password, signup-confirm-password); `aria-label` + `aria-pressed` on show/hide password toggle
- `forgot-password/page.tsx` — `forgot-password-form-error` + `forgot-password-email` pair
- `reset-password/page.tsx` — `reset-password-form-error` + 2 pairs (reset-password-new, reset-password-confirm) + `aria-label`/`aria-pressed` on show/hide
- 9 unique ids across files, zero collisions, TypeScript clean
- No copy changes (audit's "accusatory" framing was overstated)
- Side benefits: better password manager / iOS AutoFill semantic detection; label click now forwards focus to input

---

### 4. Touch targets 44×44
**Problem:** Inconsistent — primary CTAs have `minHeight: 44`; many secondary elements don't.

**Web targets (add `minHeight: 44` or increase padding):**
- `web/src/components/LockModal.tsx:100` (secondary button) and `:106` (primary button) — both currently `padding: '9px 18px'` + 13px text = 36px
- `web/src/app/page.tsx:422` (subcategory chipStyle) — currently `padding: '5px 12px'` + 12px = 22px
- `web/src/app/page.tsx:590` (subcategory "All" pill) — `padding: '7px 16px'` + 13px = 27px
- `web/src/app/story/[slug]/page.tsx:111` (source pills) — `padding: '4px 10px'` + 11px = 19px

**iOS targets (increase frame/padding):**
- `VerityPost/VerityPost/Theme.swift:206-207` (PillButton — shared) — currently `.padding(.horizontal, 16).padding(.vertical, 6)` + 13pt = 25pt. Bump vertical to ≥10pt.
- `VerityPost/VerityPost/StoryDetailView.swift:579` (source pills) — `.padding(.vertical, 5)` + 11pt = 21pt
- `VerityPost/VerityPost/StoryDetailView.swift:336-337` (TTS controls) — same pattern as source pills
- `VerityPost/VerityPost/ContentView.swift:217` (TextTabBar) — currently 14pt v-pad + 13pt = 41pt. Bump to `.padding(.vertical, 16)` or add explicit `.frame(minHeight: 44)`.

**Options:** skip / top violators (~45 min, recommended for launch) / full sweep + lint rule (2-4 hrs, post-launch)

---

### 5. iOS bare text buttons — add visual styling **[SHIPPED 2026-04-21]**
**Problem:** Plain `Button { Text(...) }` with only color styling; not visually distinguishable as tappable.

**Targets:**
- `VerityPost/VerityPost/HomeView.swift:138` — "Try again"
- `VerityPost/VerityPost/HomeView.swift:186` — "Load More"
- `VerityPost/VerityPost/HomeView.swift:237` — "Maybe Later"
- `VerityPost/VerityPost/HomeView.swift:475` — "Clear all"
- `VerityPost/VerityPost/StoryDetailView.swift:163` — "Save"/"Saved"
- `VerityPost/VerityPost/ContentView.swift:47` — "Continue without signing in"

**Pattern:** wrap in `.buttonStyle(.bordered)` or add `.padding(.horizontal, 12).padding(.vertical, 8).background(VP.card).clipShape(Capsule())`.

**Options:** skip / fix all 6 (~20 min, recommended)

**SHIPPED 2026-04-21** (6-agent verification: 4 pre-impl + 2 post-impl, both GREEN). **Scope reduced from 6 to 3 sites** based on agent D adversarial review:

- `HomeView.swift:135-143` "Try again" (data reload recovery) — added `.buttonStyle(.bordered)` ✅
- `HomeView.swift:475` "Clear all" (filter reset) — added `.buttonStyle(.bordered)` + `.controlSize(.small)` (keeps footprint compact in card layout) ✅
- `StoryDetailView.swift:160-167` "Save"/"Saved" (toolbar) — added `.buttonStyle(.bordered)`. Existing text-color state variance (VP.accent when saved, VP.text when not) preserved. ✅

**Intentionally excluded:**
- `HomeView.swift:186` "Load More" — already has `.buttonStyle(.plain)` + explicit padding; audit was stale
- `HomeView.swift:237` "Maybe Later" — regwall soft-skip; intentional minimalism preserves primary "Create free account" emphasis
- `ContentView.swift:47` "Continue without signing in" — auth splash secondary action; bordering would compete with primary "Try again" recovery CTA above it

**Verified:** dark-mode locked to `.light` so no regression risk; iOS 17+ deployment target supports `.bordered` (iOS 15+); no Kids-app analogous sites needing same treatment; VoiceOver reads Text content directly; no SwiftLint config.

---

### 6. Bottom nav reorder — OWNER DESIGN CALL
**Problem:** Current 4-item nav (`Home / Notifications / Leaderboard / Profile`) may or may not cover the right destinations. Not a defect; a product/IA decision.

**Targets (if changing):**
- Web: `web/src/app/NavWrapper.tsx:187-194` (bottom nav item list) and `:311-335` (top-bar search)
- Adult iOS: `VerityPost/VerityPost/ContentView.swift:198-203`
- Kids iOS: `VerityPostKids/VerityPostKids/TabBar.swift`

**Options:** keep as-is / add Bookmarks as 5th tab / 5-tab redesign (Home / Search-Browse / Bookmarks / Notifications / Profile) / full audit-requested (8 tabs, not recommended)

**Recommended:** keep as-is or add Bookmarks only.

---

### 7. Story action row — move cap banner to own row **[SHIPPED 2026-04-21]**
**Problem:** Right-button group overflow at 320px viewport when bookmark cap banner renders inline.

**Target:** `web/src/app/story/[slug]/page.tsx:826-862`:
- Outer flex container at line 826 has `flexWrap: 'wrap'` ✅
- Inner right-group at line 831 has no `flexWrap` — missing
- Cap banner at lines 852-856 (`"You've used 10 of 10 free bookmarks. Upgrade for unlimited"`) renders inline in the non-wrapping inner group

**Fix:** Either (a) add `flexWrap: 'wrap'` to inner container at line 831 (~5 min), or (b) move cap banner to its own row above/below the buttons (~15 min, cleaner).

**Options:** skip / flex-wrap only / move cap banner to own row (recommended)

**SHIPPED 2026-04-21** (6-agent verification: 4 pre-impl + 2 post-impl, both GREEN):
- Removed inline cap banner from inside inner right-button group
- Added standalone banner block after action row's closing `</div>` with `role="status"` + `aria-live="polite"` for screen readers
- Removed obsolete `marginLeft: 8` (inline-positioning artifact)
- Preserved `/profile/settings/billing` Upgrade link, text content, render condition
- Verified: no duplicate render, TypeScript clean, single `#b45309` block remains
- Overflow at 320/375/390px now fits via outer row's `flexWrap: 'wrap'` (inner right-group no longer carries the wide banner)

**Pre-existing bugs surfaced during verification, filed as follow-ups:**
- `bookmarkTotal` never updates live after bookmark add/remove — user must reload page to see banner clear. Fix: update state in `toggleBookmark`.
- `bookmarkTotal` can be null indefinitely if Supabase count query fails silently. Fix: add error handling to the count query.

---

### 8. Home breaking banner — make linkable (+ optional unify) **[SHIPPED 2026-04-21]**
### 17. Breaking treatment unification **[SHIPPED 2026-04-21 — web sites unified; iOS StoryDetailView follow-up]**
**Problem:** Home banner not clickable; 3 visual variants across surfaces.

**Targets:**
- `web/src/app/page.tsx:697-722` — current is a plain `<div>`. Wrap in `<Link href={`/story/${breaking.slug}`}>` or equivalent.
- (Optional visual unify) compare to `web/src/app/page.tsx:829-837` (card label) and `web/src/app/story/[slug]/page.tsx:807-809` (story badge) + `VerityPost/VerityPost/HomeView.swift:701-709`. Pick one treatment (solid red #ef4444 + white text + "BREAKING" pill seems right) and apply to all.

**Options:** skip / link only (~5 min, recommended min) / link + unify (~45 min)

**SHIPPED 2026-04-21** (6-agent verification: 4 pre-impl investigators + 2 post-impl verifiers, both GREEN):
- Added `import Link from 'next/link';` at `web/src/app/page.tsx:5`
- Wrapped breaking banner block in `<Link href={`/story/${breakingStory.slug}`}>` with `aria-label="Breaking news: <title>"`, `display: 'block'`, `textDecoration: 'none'`, `color: 'inherit'` to preserve styling
- Verified: no nested `<a>`, breakingStory.slug guaranteed non-null, matches iOS card-tap convention, no other banner render paths
- Optional unify (home banner vs. card label vs. story-page badge) deferred; only the non-clickable defect was the audit's real complaint

---

### 9. Empty-state sweep — 3-4 edge cases **[SHIPPED 2026-04-21]**
**Problem:** Main flows fine; edge cases lack explanation/CTA.

**Targets:**
- `web/src/app/search/page.tsx` — "No matches. Try a different keyword." → add suggestion ("Try broader terms, or browse categories" + link to /browse)
- `web/src/app/leaderboard/page.tsx` — "No results." (filter no-match) → explain which filters are active + "Clear filters" button
- Browse category page (if visible at `web/src/app/browse/[category]/page.tsx` or similar) — "No categories found." → CTA to pick categories; "No articles yet." → "We're working on it — try a different topic."

**Options:** skip / targeted 3-4 (~30 min, recommended) / full sweep ~30 states (2-3 hrs)

---

### 10. Error-message security sweep
**Problem:** `CLAUDE.md:179` convention: generic client errors, real errors to server logs. One confirmed violation.

**Confirmed violation:** `web/src/app/api/stripe/checkout/route.js:65` — returns raw `err.message` to client.

**Sweep pattern:** grep all 149-174 routes under `web/src/app/api/**/route.{js,ts}` for `err.message`, `error.message`, `e.message` in `NextResponse.json` / `Response.json` bodies. Replace with generic `{ error: 'Could not complete request' }` + `console.error('[route-tag]', err)` pattern (already used by most routes).

**Pattern to reference:** `safeErrorResponse()` helper is used by ~214 call sites — verify it's being used on mutation routes. Routes NOT using it are higher-risk.

**Do NOT:** rewrite error copy for "user voice" — that's what the audit suggested and would regress security.

**Options:** skip / stripe/checkout only (~5 min) / broader sweep (~1 hr, recommended)

**SHIPPED 2026-04-21** (7-agent verification: 3 investigators + 2 planners + 1 adversary + 2 post-verifiers):
- Hardened `web/src/lib/adminMutation.ts` `permissionError()` with `AUTH_ERROR_MAP` (7 sentinels covered; strips `PERMISSION_DENIED:<key>` suffix)
- 13 route fixes: stripe/checkout:21,65; stripe/portal:11,28; stripe/webhook:67,167; auth/signup:47; auth/email-change:37; kids/pair:101 (with iOS keyword-preservation comment); promo/redeem:160; cron/send-emails:44; cron/send-push:42; cron/process-data-exports:28,89
- Server-side `console.error` preserved for debugging; DB audit rows retain raw messages (internal, acceptable)
- iOS `PairingClient.swift` keyword deps on "used"/"expired" preserved (kids/pair lines 62-67 untouched)
- Post-fix grep: 0 `.message` leaks in client response bodies across modified paths
- **~160 Pattern A inline permission sites deferred** — structurally safe (sentinel codes), migration to helper is follow-up work

---

## UI — Design-system bundle

5 audit items map to the same underlying debt: inline-styles sprawl with no shared tokens outside `web/src/lib/adminPalette.js`. Admin uses the tokens; public bypasses.

**Bundled items + evidence counts:**

| # | Item | Scale of sprawl |
|---|---|---|
| 4 | Responsive 1024–1920px | 0 `@media` rules ≥1024px; 7 pages with hardcoded `maxWidth` (680, 900, 960, 820, 720) |
| 12 | `const C` palette | 14-29 public files with near-identical inline palette; `adminPalette.js` used by 38-64 admin files |
| 13 | Font-size scale | 36-45 distinct values / 1,477 occurrences; `F` scale in `adminPalette.js` unused by public |
| 14 | Container maxWidth | 23-28 distinct values / 98-100+ declarations |
| 20 | Radius/avatar/shadow | 21-33 radius / 5-17 avatar / 13-19 shadow variants; zero shared scales |

**New files this bundle creates:**
- `web/src/lib/tokens.ts` (or extend `adminPalette.js`) — exports `BREAKPOINTS`, `SPACING`, `FONT` (= current `F`), `COLOR` (= current `ADMIN_C`), `RADIUS`, `SHADOW`, `AVATAR`
- `web/src/components/Container.tsx` — sized variant (`narrow | medium | wide`) with viewport-responsive maxWidth
- `web/src/components/Grid.tsx` — multi-column breakpoint-aware grid

**Files affected by sweep (Track B):**
- All 14-29 public pages with inline `const C` — swap for token imports
- All pages with raw `fontSize: N` — swap for `FONT.xs/sm/base/md/lg/xl/xxl`
- All pages with inline `maxWidth: N` — swap for `<Container size="...">`
- High-traffic pages get `@media (min-width: 1024px)` via Container + Grid

**iOS note:** iPad safe as-is (verified). `TARGETED_DEVICE_FAMILY="1,2"` confirmed in both Xcode projects; no hardcoded page widths; SwiftUI VStack/ScrollView/ZStack scale. 15-min iPad QA pass.

**Two execution paths:**

### Track A — Responsive only (~8-12 hrs)
1. Define breakpoint spec + Container + Grid primitives (2-3 hrs)
2. Refactor 15-20 high-traffic pages — `web/src/app/page.tsx` (home), `web/src/app/story/[slug]/page.tsx` (article), `web/src/app/bookmarks/page.tsx`, `web/src/app/leaderboard/page.tsx`, `web/src/app/profile/page.tsx`, admin pages (4-6 hrs)
3. iPad QA (15 min), cross-browser QA (1-2 hrs)

Fixes #4 only. Defers #12/#13/#14/#20 polish.

### Track B — Full design-system cleanup (~18-28 hrs)
Track A + token sweep across all public pages:
- Replace ~888 hardcoded hex with `COLOR.*` imports
- Replace ~1,477 raw font-size literals with `FONT.*`
- Replace ~139 padding / 49 margin values with `SPACING.*`
- Consolidate radius/avatar/shadow scales

Fixes #4 + #12 + #13 + #14 + #20 in one pass.

**Recommended:** Track A for launch, Track B post-launch.

---

## Other fixes (from `PRE_LAUNCH_AUDIT_LOG_2026-04-20.md` verification)

### 11. Error-state polish — reader hot path
**Problem:** 9 sites silently swallow Supabase errors; empty feed/search/detail looks identical to "no data" with no retry banner or error signal. All 9 verified still-accurate against current code.

**Target sites (all confirmed match audit file:line refs):**
- `web/src/app/page.tsx:225-226` (`storiesRes.error`, `allCatsRes.error` logged but feed renders silently)
- `web/src/app/page.tsx:345, 350-353, 363-366` (`runSearch()` + sub-queries destructure `{data}` only — network error = silent zero-results)
- `web/src/app/story/[slug]/page.tsx:326` (`storyErr` logged; only `!storyData` checked)
- `web/src/app/story/[slug]/page.tsx:396` (`user_passed_article_quiz` RPC failure silently locks discussion — currently safe behind `{false && …}` gate)
- `web/src/app/story/[slug]/page.tsx:409-411, 417-429` (timeline/sources/bookmark/plan queries drop error field; silent fallback to defaults)
- `web/src/app/signup/page.tsx:104-106` (missing 409 / email-already-exists detection; retry creates duplicate auth user)
- `web/src/app/welcome/page.tsx:95` (transient network error on `getUser()` → redirect to `/verify-email`, possible loop)
- `web/src/components/PermissionsProvider.tsx:47-49, 58-60` (`refreshAllPermissions` failures swallowed via `.catch()`; `hasPermission` then resolves `false` = "feature not granted" instead of "resolver down")
- `web/src/app/error.js:9-19` and `web/src/app/global-error.js:10-20` (error-boundary POST to `/api/errors` with `.catch(() => {})`; if endpoint is down, crash never logged — mitigated when Sentry activates, see 00-D)

**Fix pattern:** for each, destructure `{ data, error }`, check `if (error) { setErrorMessage('...'); return; }`, render retry banner or empty-state-with-retry. Signup: add `res.status === 409` check.

**Options:** skip / fix top 3 most-impactful (page.tsx:225 feed error, signup:104 duplicate, welcome:95 loop) — ~30 min / full sweep all 9 — ~2 hrs (recommended post-launch, not blocking)

---

### 12. SEO assets — favicon + apple-touch-icon + PWA icons
**Problem:** `web/public/` has zero icon assets. `web/src/app/manifest.js:19` has `icons: []` (empty array). `web/src/app/layout.js` used to reference icons but was cleaned in commit `434aba5` when the PNGs weren't yet available.

**Target:**
1. Drop icon PNGs in `web/public/` at these standard paths:
   - `web/public/favicon.ico` (32×32 or multi-res)
   - `web/public/apple-touch-icon.png` (180×180)
   - `web/public/icon-192.png` (192×192 for PWA)
   - `web/public/icon-512.png` (512×512 for PWA)
2. Restore `icons` metadata block in `web/src/app/layout.js` (referencing the filenames above)
3. Populate `icons: []` array in `web/src/app/manifest.js:19` (see MDN/Next docs shape)
4. Verify: `curl https://veritypost.com/favicon.ico` returns the file; iOS "Add to Home Screen" uses the apple-touch-icon; Chrome PWA install uses the 192/512.

**Options:** skip until icons are designed / drop PNGs + wire both files — ~15 min once PNGs exist

---

### 13. `.env.example` — delete commented-out Stripe price IDs
**Problem:** `web/.env.example` lines 34-41 hold 8 commented-out Stripe price ID entries. Source of truth is DB via `plans.stripe_price_id`. Audit left them commented "in case the source-of-truth migrates back to env later" — but that migration seems unlikely.

**Target:** `web/.env.example:34-41` — delete the 8 commented lines outright. Keep `APNS_BUNDLE_ID` (hardcoded `com.veritypost.app` default is correct).

**Options:** skip (cosmetic) / delete (~2 min)

---

### 14. Reserved-username claim flow (design approved, not built)
**Problem:** Reserved username system needs claim flow so verified users can request a blocked-but-available reserved handle. Design is approved per TODO.md #10. No code written.

**Owner inputs still needed before build:**
- Scale of first-name seed list (top 1k / 2k / 5k / 10k from SSA baby-names dataset). Default recommendation: **top 2-3k + diminutives**.
- Match policy: exact vs. bounded-substring. Default: **bounded** (block `john`, `john_`, `real_john`; allow `johnny`, `john_smith`).
- Keep "anything to add?" note field in review modal, or silent (admin decides from signals).

**Build scope when greenlit:**
1. Migration: add `claim_mode` column to `reserved_usernames` (`blocked` | `instant` | `review`); new `username_claim_requests` table with RLS.
2. `claim_reserved_username(user_id, name)` Postgres RPC — atomic `SELECT FOR UPDATE` + commit + delete + audit.
3. API routes: `web/src/app/api/auth/check-username/`, `.../claim-username/`, `.../request-username/`.
4. Admin page: `web/src/app/admin/username-requests/page.tsx` — queue + approve/deny/more-info actions + email hooks.
5. 3 email templates (request received, approved, denied) + 1 admin-notify template.
6. Data load script `scripts/load-first-names.js` (SSA txt → diminutive expander → upsert with `claim_mode='instant'`).
7. Hand-curated public-figure list (~500 rows) with `claim_mode='review'`.

**Verified state (agents):** `reserved_usernames.claim_mode` column does NOT exist; `username_claim_requests` table does NOT exist; `/admin/username-requests/` does NOT exist. All as expected for "design approved, not built."

**Ties into:** "random handles for unverified, choose freely when verified" flow — both should land together; they share claim plumbing.

**Effort:** multi-file feature; ~6-10 hrs total.

---

### 15. Admin audit backfill — 23 of 24 admin routes missing `record_admin_action`
**Problem:** Per 2-agent verification, only 1 of 24 sampled admin mutation routes calls `record_admin_action`. Rest have no audit trail for admin actions.

**Known missing (sample):**
- `web/src/app/api/admin/categories/route.ts`
- `web/src/app/api/admin/features/route.ts`
- `web/src/app/api/admin/feeds/route.ts`
- `web/src/app/api/admin/promo/route.ts`
- `web/src/app/api/admin/rate-limits/route.ts`
- `web/src/app/api/admin/ad-campaigns/route.ts`
- `web/src/app/api/admin/ad-placements/route.ts`
- `web/src/app/api/admin/ad-units/route.ts`
- `web/src/app/api/admin/recap/route.ts`
- `web/src/app/api/admin/sponsors/route.ts`
- …plus more

**Pattern to copy:** any already-audited admin mutation route. Call `record_admin_action(p_action, p_target_table, p_target_id, p_reason, p_old_value, p_new_value, p_ip, p_user_agent)` after every mutation (pattern documented in `CLAUDE.md`).

**Effort:** ~30 min sweep across 12-24 routes (mechanical once pattern is understood).

---

### 16. Admin `as any` cleanup (19 sites)
**Problem:** 19 `as any` type assertions in `web/src/app/admin/`, concentrated in `admin/subscriptions/page.tsx`. Loose typing hides bugs.

**Target:** grep for `as any` in `web/src/app/admin/`, replace each with proper type from `web/src/types/database.ts` (which has 8,900 lines of generated Supabase types).

**Unblocks:** item #17 (TypeScript strict mode).

**Effort:** ~1-2 hrs (real type work, not mechanical).

---

### 17. TypeScript strict mode
**Problem:** `web/tsconfig.json` has `strict: false`; `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` all undefined (disabled).

**Target:** `web/tsconfig.json` — set:
- `"strict": true`
- `"noUnusedLocals": true`
- `"noUnusedParameters": true`
- `"noFallthroughCasesInSwitch": true`

**Expect:** many type errors surface. Fix as they come.

**Order:** after #16 (cleanup `as any` first so flipping strict doesn't cascade).

**Effort:** 2-4 hrs depending on error count.

---

### 18. ParentalGate lockout → Keychain (iOS)
**Problem:** `VerityPostKids/VerityPostKids/ParentalGateModal.swift` persists lockout state via `UserDefaults` (bypassable via uninstall+reinstall — bad COPPA compliance).

**Target:** migrate storage to Keychain.
- Store the lockout `until: Date` in Keychain (encoded as Data or timestamp string)
- Enable iCloud Keychain flag so state survives device migration
- Update read/write call sites in `ParentalGateModal.swift`

**Effort:** ~1-2 hrs. Worth doing before App Store submission; not gating web launch.

---

### 19. Pre-launch holding page — optional toggle, already wired
**Status (verified):** the middleware logic is ALREADY PRESENT. `web/src/middleware.js:166-197` checks `NEXT_PUBLIC_SITE_MODE === 'coming_soon'` and redirects public routes to `/welcome` unless `vp_preview=ok` cookie is set. Bypass route at `/preview?token=...` exists.

**Target:** only if you want a public "coming soon" during final QA:
1. Set Vercel env: `NEXT_PUBLIC_SITE_MODE=coming_soon`
2. Set Vercel env: `PREVIEW_BYPASS_TOKEN=<some-value>` (mentioned in 00-E)
3. Redeploy. Visit `/preview?token=<PREVIEW_BYPASS_TOKEN>` to bypass for internal testing.
4. When ready to launch: delete / set `NEXT_PUBLIC_SITE_MODE=live` and redeploy.

**Effort:** 2 min config. No code needed.

---

### 20. ESLint + Prettier + pre-commit hook
**Problem:** Zero lint/format tooling — no `.eslintrc*`, `.prettierrc*`, `eslint.config.*`, `prettier.config.*` anywhere. Several classes of issues found in this audit would've been caught automatically (unused imports, inconsistent formatting, etc.).

**Target:**
1. Add `web/eslint.config.js` with Next.js preset + `@typescript-eslint` strict rules
2. Add `web/prettier.config.js` (simple — standard defaults)
3. Add `.husky/pre-commit` hook running `npx lint-staged` (or equivalent)
4. Add `package.json` scripts: `lint`, `format`, `lint:fix`

**Effort:** ~1-2 hrs setup + fix whatever first-run surfaces.

---

---

## Feature-scope proposals (Future Projects rollup)

These are **feature-level work**, not fixes. Rolled up here for full-scope visibility. Each has its own full design doc in `Current Projects/` sibling files (same folder); summary below. Verified against current code state by 2 independent agents 2026-04-21.

### F1. Sources above headline (`F1-sources-above-headline.md`) **[SHIPPED 2026-04-21]**
**What:** Small-caps outlet list above article headline as trust signal.
**Status:** partial — sources data fetched at `story/[slug]/page.tsx:408-412`; rendered as pills via SourcePills (line 894). Above-headline zone (lines 801-829) currently shows category badge + breaking/developing flags + source COUNT only. No outlet-name line.
**Prerequisites:** none (data live).
**Scope:** small (~1 hr pure render; 1-3 hrs with styling polish).
**Owner decisions:** show line only if `sources.length >= 2`; optional dot badge if `sources.length >= 3`; truncate to 3 outlets on mobile with "+N more."

**Verified 2026-04-21 (2 agents): LEGIT & READY TO SHIP** — proposal premise still valid, data ready, no competing UI, spec unchanged.

**SHIPPED 2026-04-21** (6-agent verification: 4 pre-impl + 2 post-impl, both GREEN):
- `web/src/app/story/[slug]/page.tsx:429` — sources query now ORDER BY sort_order (adversary blocker: arbitrary Postgres row order made truncation non-deterministic)
- New small-caps "REPORTED FROM · NYT · REUTERS · BBC" block inserted in tab-article div BEFORE the category/badges row
- Gated on `sources.length >= 2`; rendered outlets sliced to 3 + "+N more" fallback
- aria-label joins FULL source list (screen readers get complete info even when truncated visually)
- Style: 11px uppercase 0.06em letter-spacing var(--dim) color — distinct from category chip (accent color) and Breaking/Developing badges (solid fill)
- SourcePills below body unchanged — complementary quick-glance vs. expandable-detail signals

---

### F2. Reading receipt (`F2-reading-receipt.md`)
**What:** Monospaced receipt stub at article end — read duration, quiz score, points earned, timestamp.
**Status:** absent — component doesn't exist.

**Verified 2026-04-21 (2 agents): LEGIT but needs prep work on data piping.**
- **Ready:** `userPassedQuiz` state (`page.tsx:252`); `categoryName` derived (`page.tsx:617`); `completedAt` derivable.
- **Missing plumbing:**
  - `scoreDelta` — computed server-side by `score_on_quiz_submit` RPC and returned by `/api/stories/read` (`route.js:99, 132`) but NOT captured into client state; `ArticleQuiz.onPass` callback (`page.tsx:634`) doesn't surface the score amount.
  - `readSeconds` — tracked in `reading_log.time_spent_seconds` + posted to `/api/stories/read` but response ignored.

**Deliverables:**
1. Extend `ArticleQuiz.onPass` signature to include `scoreDelta`, `correct`, `total`
2. Capture `/api/stories/read` response scoring into page state
3. Build `web/src/components/ReadingReceipt.tsx`
4. Mount in `web/src/app/story/[slug]/page.tsx` around line 939 (currently-hidden "Where to next" zone)

**Scope:** 3-8 hrs (3-4 pure build; 6-8 with quiz API refactor).
**Owner decisions:** render partial receipt if quiz skipped, or nothing.

---

### F3. Earned chrome comments (`F3-earned-chrome-comments.md`)
**What:** Comments completely hidden from anon/unverified; materialize only after quiz pass with entrance animation. Add "N readers passed" section header.
**Status:** partial — quiz + discussion 3-branch logic already matches proposal shape (`page.tsx:677-712`).

**Big finding 2026-04-21 (both agents): ENTIRE quiz + discussion section is currently kill-switched** at `web/src/app/story/[slug]/page.tsx:939` via `{false && (isDesktop || showMobileDiscussion)}` — launch-phase feature flag. Nothing renders at all until that flag flips. Per owner's "launch-hide" memory, intentional.

**Prerequisite: flip kill switch at line 939.** Without that, F3's refinements are moot.

**What's already in place:**
- Anon: `null` (line 696-712)
- Verified non-pass: lock panel "Discussion is locked until you pass the quiz"
- Passed: `<CommentThread />`
- Quiz gate working for verified users

**What's missing vs. F3 spec:**
1. Quiz NOT hidden from anon (shows signup CTA panel at lines 638-663 — contradicts spec's "completely invisible" for anon)
2. "N readers passed" section header
3. `passed_readers_count` RPC (none in schema; needs new lightweight function over `quiz_attempts`)
4. Comment entrance animation (opacity + translateY, 400ms)

**Scope:** ~2-3 hrs for additions AFTER kill-switch flip.
**Owner decisions:** animation style (fade/slide/pulse); include reader count or skip; full-hide quiz from verified non-pass or keep locked panel.

**Verdict: LEGIT but sequenced** (flip kill switch first, then layer F3 refinements).

---

### F4. Quiet home feed (`F4-quiet-home-feed.md`)
**What:** Strip home to serif headlines + small-caps meta. Remove cover images, category pills, ads, recap, breaking banner.

**Verified 2026-04-21 (2 agents): MOSTLY DONE** — ~2-3 hrs remaining.

**Already shipped** via launch kill switches:
- Category pills hidden (`page.tsx:729`)
- Subcategory pills hidden (`page.tsx:756`)
- Recap card hidden (`page.tsx:820`)
- Cover images: never in current card design (lines 821-857 render title + excerpt + badge + date only)

**Left to do:**
1. Force-hide breaking banner regardless of `canBreakingBanner` permission — wrap `page.tsx:697-722` in `{false && ...}` or remove outright
2. Remove ad slots from feed loop — delete `page.tsx:858-862` (`{(idx + 1) % 6 === 0 && <Ad />}`)
3. Card restyle per F4 spec:
   - Source Serif 4 headlines (~28pt)
   - Small-caps meta line (11pt, 0.06em letter-spacing, muted) with category · read time · source count
   - Horizontal rules between articles
   - 40/28px vertical spacing
4. Optional: date line above feed ("Wednesday, April 20"); "Editor's Pick" glyph variant

**Scope:** 2-3 hrs (mostly card redesign).
**Owner decisions:** breaking banner force-hidden or permission-gated; ads removed from feed or kept; approve typography + spacing.

**Note:** overlaps with UI audit `Track A` (#4 responsive) — both touch `web/src/app/page.tsx`. If shipping Track A and F4, plan them together.

---

### F5. Ads gameplan (`F5-ads-gameplan.md`)
**What:** Decision tree + implementation roadmap for ad strategy — placement inventory, networks, admin UX, CMP, targeting matrix.

**Verified 2026-04-21 (2 agents): MOSTLY DONE, 2-3 days to finish.**

**Shipped:**
- Full schema (`ad_placements`, `ad_units` with targeting_* columns, `ad_campaigns`, `ad_impressions` with viewability columns, `ad_daily_stats`)
- `serve_ad` RPC with tier + frequency-cap logic
- `Ad.jsx` dispatch to `AdSenseSlot` on `ad_network='google_adsense'`
- `/api/ads/{serve,impression,click}` routes
- `layout.js` conditional AdSense script (gated on `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID`)
- `ads.txt` placeholder
- `/admin/ad-placements` + `/admin/ad-campaigns` basic CRUD

**Critical gaps:**
1. **CMP (Google Funding Choices or similar) — ABSENT.** AdSense loads unconditionally → EU GDPR / ePrivacy compliance risk. Largest blocker.
2. Targeting logic in `serve_ad`: `targeting_categories` column exists but may not be consulted by the RPC (needs verify; agent flagged `schema/025_phase17_fixes.sql` as pending).
3. **Slot editor UI (Page B)** — AdSense snippet paste → parse `<ins class="adsbygoogle">` → create `ad_unit` row. Missing.
4. **Targeting preview tool (Page C)** — simulate-as-user, show which ad renders. Missing.
5. IntersectionObserver viewability logging — schema columns ready, collection code absent.
6. "Subscribe to remove ads" CTA inside creative — missing.
7. Revenue dashboard — manual AdSense CSV import step missing.

**8 owner decisions** in §1 of F5 doc — mostly unfilled (D1 pub ID, D2 other networks, D3 CMP choice, D4 launch countries, D8 iOS ads at launch).

**Ties to:** 00-B (AdSense approval); item #19 / 00-F (consent + CSP flows).

**Verdict: LEGIT LARGE** (~2-3 days; CMP is the urgent sub-piece for EU launch).

---

### F6. Measurement + ads masterplan (`F6-measurement-and-ads-masterplan.md`)
**What:** Unified event pipeline — one endpoint feeding Postgres (truth), GA4 (reach), ClickHouse (analytics), AdSense (revenue). Own-built analytics dashboards. Ad reconciliation. Scoring ledger enforcement.

**Verified 2026-04-21 (2 agents): FOUNDATION DONE, MASTERPLAN LEGIT-OPEN** — 4-5 weeks full scope; ~1 week with ClickHouse deferred.

**Shipped:**
- `events` partitioned table (schema/108) with 90-day retention
- `/api/events/batch` endpoint (`web/src/app/api/events/batch/route.ts`)
- `web/src/lib/track.ts` + `trackServer.ts` + `useTrack.ts`
- GA4 client script in `layout.js` with hardcoded fallback `G-NE37VG1FP6`
- `GAListener` component (route-change page_views)
- `reconcile_verity_scores` function (schema/111)
- `verity_score_events` confirmed rolled back via schema/111 (no parallel ledger)

**Missing:**
1. **6 of 7 admin analytics pages** (only `/admin/analytics/page.tsx` stub exists; missing: traffic-sources, categories, articles, funnels, retention, ads/monetization)
2. **Measurement Protocol server-side forwarding** in `/api/events/batch` — endpoint ready, MP sender not wired; needs GA4 API secret env var + custom dimensions config
3. **ClickHouse / BigQuery export pipeline** — zero code
4. Nightly reconciliation cron jobs
5. Materialized views for leaderboards / streaks

**Pragmatic shortcut:** defer ClickHouse entirely. Query Postgres `events` directly via Metabase/Grafana interim until volume justifies columnar (~$50/mo at 10M events/month). Shrinks Phase C from 2-3 weeks → ~1 week.

**Scope:** XL full (4-5 weeks); L pragmatic (~1-2 weeks).
**Owner decisions:** ClickHouse vs BigQuery vs deferred; own-built + GA4 or own-built only; reconciliation alert threshold.

---

### F7. Pipeline restructure (`F7-pipeline-restructure.md`)
**What:** Refactor AI article pipeline — rename `/admin/pipeline` → `/admin/newsroom` and `/admin/ingest` → `/admin/discover`; port JS snapshot prompts to TS; implement user-initiated Discover UI; add historical-context feature; kids content on same row with `is_kid` flags.

**Verified 2026-04-21 (2 agents): LEGIT XL.**

**Current state:**
- `/admin/pipeline` + `/admin/ingest` exist as shells; `/admin/newsroom` + `/admin/discover` do NOT exist
- `web/src/lib/pipeline/` directory does NOT exist
- Zero `/api/newsroom/*` or `/api/discover/*` routes
- All proposed schema columns missing: `discovery_items`, `discovery_groups`, `articles.historical_context`, `articles.kids_{headline,body,excerpt,slug,historical_context,reading_time_minutes}`, `quizzes.is_kid`, `timelines.is_kid / is_current`
- Supporting infra already present in types.ts: `pipeline_runs`, `pipeline_costs`, `feed_clusters` tables; `settings` key-value table ready for `ai.enabled` + cost-cap

**JS snapshot** (ready for TS port): `/Users/veritypost/Desktop/verity-post-pipeline-snapshot/existingstorystructure/lib/editorial-guide.js` (53 KB, 1094 lines, contains 11 snapshot prompts). Plus `pipeline.js` utility algorithms.

**Deliverables:**
1. New migration `schema/NNN_pipeline_restructure.sql` (discovery tables + columns + flags)
2. `web/src/lib/editorial/` prompt library + helpers (`call-model.ts`, `cost.ts`, `kill-switch.ts`, `plagiarism.ts`, `scrape.ts`)
3. `/api/newsroom/*` endpoints (pipeline steps) + `/api/discover/*` (scan/group/dismiss) + cron endpoints
4. `/admin/newsroom` + `/admin/discover` pages with Workbench panel
5. Story Manager + Kids Story Manager form extensions
6. Reader: historical-context disclosure in `web/src/app/story/[slug]/page.tsx`

**Scope:** ~17 hrs focused (§11's 20-task build order).

**Owner decisions (§12, all pending):**
1. Confirm page renames
2. Kids data model: single-row + `kids_*` columns + `is_kid` flags (recommended) vs. separate rows
3. `/admin/stories` fate: delete or redirect
4. Model provider v1: Anthropic-only (recommended) vs. multi-provider
5. `feed_clusters`: stay (recommended) vs. retire
6. Cron schedules: 15min ingest / 10min pipeline / 60min discovery-sweep
7. Cost cap: $75/day default
8. Workbench web-research tab: phase 2, not v1 (recommended)

**Kids-iOS connection:** Kids iOS is live and validates the kids_* columns pattern — authors need one editorial flow that surfaces kid-appropriate content on the same row.

---

### Future Projects summary

| # | Proposal | Status | Scope | Launch-blocking? |
|---|---|---|---|---|
| F1 | Sources above headline | partial | small (1-3h) | no — UI polish |
| F2 | Reading receipt | absent | medium (3-8h) | no — engagement feature |
| F3 | Earned chrome comments | partial | medium (3-8h) | no — product thesis |
| F4 | Quiet home feed | partial | medium (3-8h) | no — aesthetic |
| F5 | Ads gameplan | partial | large (8-20h) | no — monetization (post-launch) |
| F6 | Measurement masterplan | partial | XL (20+h) | no — analytics (post-launch) |
| F7 | Pipeline restructure | absent | XL (20+h) | no — editorial workflow |

**None of the Future Projects are launch-blocking.** Reader + comments + scoring already work with current code. All 7 are feature enhancements / design upgrades post-launch.

**Clustering:**
- **Reader-UX cluster (F1 + F2 + F3 + F4):** all touch `web/src/app/story/[slug]/page.tsx` and `web/src/app/page.tsx`. Plan together if executing. ~10-25 hrs combined.
- **Monetization cluster (F5 + F6):** share the events/ads infrastructure. F6 is foundational to F5's measurement. Plan together. ~30-40 hrs combined.
- **Editorial workflow (F7):** standalone, no infra overlap with others.

---

## Not in this file (verified non-issues, no action)

5 UI audit items were NOT REAL or ALREADY SHIPPED. Documented in session log; full evidence in archived review. Do not re-raise unless regression proven.

- #1 iOS Dynamic Type — shipped 2026-04-20 commit `d076a09`
- #2 Sign in/up casing — codebase already consistent (~40+ CTA sites verified)
- #5 Double header on home — fixed Round D H-14 (`page.tsx:432-437` comment)
- #10 `/messages` paywall — fixed Round H H-09 (`messages/page.tsx:149` comment; modal lines 565-601)
- #11 Marketing/legal triple header — 7 pages verified have no in-page wordmark

Also from `07-owner-next-actions.md`:
- schema/111 rollback — DONE (verified: `verity_score_events` table absent; `reconcile_verity_scores` keyed on `score_events`)
- schema/110 adsense adapter — DONE (verified: `serve_ad` RPC body includes `ad_network`)
