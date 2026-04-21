# Pre-launch attack plan

Agent 2 output. Sequenced rounds to clear the deduped master list (`_prelaunch_master_issues.md`). Every round is an atomic migration + code batch with independent verification. No launch-blocking vs post-launch framing — each item carries severity + effort; owner decides cut lines.

## Dedupe verification summary

Agent 1's "already fixed" claims, re-verified against the live DB on 2026-04-19:

| Claim | Status | Evidence |
|---|---|---|
| `notifications_insert` binds to `auth.uid()` | holds | `with_check = (user_id = auth.uid()) OR is_admin_or_above()` |
| `quiz_attempts_insert` / `reading_log_insert` bind to `auth.uid()` | holds | both `with_check` reference `auth.uid()` |
| `increment_field` authenticated EXECUTE removed | holds | only postgres/service_role/supabase_auth_admin |
| Admin RPC actor-spoof list closed | holds | `grant_role`, `revoke_role`, `apply_penalty`, `hide_comment`, `resolve_report`, `approve_expert_application` show no authenticated EXECUTE |
| C-03 PII leak | confirmed live | anon holds SELECT on all 94 cols of `public.users`; 48/48 users `profile_visibility='public'` |
| C-04 RPC actor-spoof (11 named RPCs) | confirmed live | all still authenticated-EXECUTE |
| C-05 auth-table CRUD | confirmed live | DELETE/INSERT/UPDATE to authenticated on 6 tables |
| C-06 audit_log insert | confirmed live | `with_check = (auth.role() = 'authenticated')`, no actor binding |
| C-01 `/status` page | confirmed live | dev returns 200 with fabricated data |
| C-02 `/billing` 404 | confirmed live | dev returns 404 |
| H-11 `/profile/contact` 302 to login | confirmed live | anon gets 302 |
| H-19 `access_requests_insert` always-true | confirmed live | advisor + pg_policies |
| H-20 `perms_global_version` RLS disabled | confirmed live | `pg_class.relrowsecurity=false` |
| M-14 `create_support_ticket` stores `p_email` | confirmed live | function body still accepts + stores it |
| M-16 `webhook_log_insert` always-true | confirmed live | `with_check = true` |

No flips. Agent 1's struck items remain struck.

## New issues Agent 2 surfaced (not in master list)

- **N-01 — 12 tables with RLS enabled but ZERO policies** (`behavioral_anomalies`, `bookmark_collections`, `category_supervisors`, `comment_context_tags`, `expert_queue_items`, `family_achievement_progress`, `family_achievements`, `sponsored_quizzes`, `user_warnings`, `weekly_recap_attempts`, `weekly_recap_questions`, `weekly_recap_quizzes`). Anon/authenticated hold table-level grants but RLS default-denies. `/bookmarks/page.tsx` and `/recap/*` read these with the anon client and silently get empty results. Severity: High (broken feature + silent failure mode).
- **N-02 — `public.users` column grants leak write primitives to authenticated.** authenticated holds INSERT/UPDATE on `parent_pin_hash`, `kids_pin_hash`, `failed_login_count`, `locked_until`, `last_login_ip`. `reject_privileged_user_updates` trigger covers role/plan columns but has not been verified to cover these. A signed-in user may be able to self-unlock their account, clear failed-login counters, or reset kid/parent PINs via a direct PostgREST UPDATE. Severity: High.
- **N-03 — `handle_new_auth_user` owner-bootstrap race.** Body promotes the first signup (`user_count = 1`) to `owner`. Safe today because the owner row exists. A future dev-DB reset + accidental prod replay (or truncate) would promote the next signup. Severity: Low (operational). Worth a comment + guard clause.

---

## Rounds

Rounds ordered by security payoff per minute. Each round is atomic: migration lands, code ships, verified, committed before the next begins.

---

### Round A — RLS-layer lockdown (highest-leverage security round)

**Scope:** closes the three systemic anon/authenticated-privilege gaps in one migration pass. Single migration file, no code changes. Biggest payoff per minute: four Critical + two High + two New items resolved with one DB deploy.

**Issues addressed:**
- C-03 PII leak on `public.users`
- C-05 authorization table CRUD grants
- C-06 `audit_log` forgery
- H-07 anon EXECUTE on auth-check helpers
- H-20 `perms_global_version` RLS + grants
- M-16 `webhook_log_insert` always-true
- N-01 RLS-enabled-no-policy tables (split: restore policies OR revoke user grants and route through service-role)
- N-02 `public.users` column-grant write primitives

**Migration steps (one file, e.g. `092_rls_lockdown.sql`):**

1. **C-03.** Create `public.public_user_profiles` view with `SECURITY INVOKER` exposing only `{id, display_name, avatar_url, bio, verity_score, created_at, profile_visibility}`. REVOKE SELECT on sensitive columns from anon. GRANT SELECT on the view to anon + authenticated. Flip default `profile_visibility` to `'private'`. Backfill `UPDATE public.users SET profile_visibility='private' WHERE profile_visibility='public' AND id NOT IN (SELECT user_id FROM user_roles WHERE role_id IN (SELECT id FROM roles WHERE name IN ('owner','admin','editor','expert','moderator')))` — keep staff public by default, flip civilians private.
2. **C-05.** `REVOKE INSERT, UPDATE, DELETE ON user_roles, user_permission_sets, roles, permissions, permission_sets, plans FROM authenticated;` — SELECT stays for client UI that reads role names.
3. **C-06.** Replace `audit_log_insert` WITH CHECK with `(actor_id = auth.uid())` OR revoke INSERT from authenticated entirely and funnel through service-role (preferred — the app already has service-role handlers).
4. **H-07.** `REVOKE EXECUTE FROM anon ON FUNCTION is_admin_or_above(), is_editor_or_above(), is_mod_or_above(), has_permission(text), my_permission_keys(), has_verified_email(), is_banned();` Keep authenticated grant.
5. **H-20.** `ALTER TABLE perms_global_version ENABLE ROW LEVEL SECURITY;` + REVOKE INSERT/UPDATE/DELETE from authenticated. No policy needed — writes go through DEFINER `bump_perms_global_version` which is already service_role-only.
6. **M-16.** Replace `webhook_log_insert` WITH CHECK with `false`, or revoke INSERT from authenticated (webhook routes run as service_role).
7. **N-01.** For each of the 12 no-policy tables, decide per-table: either ADD SELECT/INSERT policy bound to `user_id = auth.uid()` (bookmark_collections, family_achievement_progress, weekly_recap_attempts, user_warnings) OR REVOKE user grants and use service_role in API (admin tables: weekly_recap_questions/quizzes, expert_queue_items, behavioral_anomalies, category_supervisors, sponsored_quizzes, comment_context_tags, family_achievements). Map out per-table in the migration preamble.
8. **N-02.** `REVOKE INSERT, UPDATE ON COLUMN parent_pin_hash, kids_pin_hash, failed_login_count, locked_until, last_login_ip FROM authenticated ON public.users;` — writes happen through DEFINER RPCs and auth flow triggers. Also audit `reject_privileged_user_updates` to confirm these columns are in its NEW-vs-OLD blocklist; if not, extend it.

**Verification:**
- SQL: `SELECT 1 FROM information_schema.column_privileges WHERE table_name='users' AND grantee='anon' AND column_name='email';` — expect 0 rows.
- SQL: `SELECT has_table_privilege('authenticated','user_roles','INSERT');` — expect false.
- SQL: `SELECT COUNT(*) FROM public.users WHERE profile_visibility='public';` — should drop to staff count.
- SQL: re-insert audit_log row as authenticated with `actor_id != auth.uid()` — expect deny.
- SQL: `SELECT relrowsecurity FROM pg_class WHERE relname='perms_global_version';` — expect true.
- curl: hit `/bookmarks` as a signed-in test user, confirm collections render.
- Re-run `get_advisors security` — expect the permissive-policy + no-policy rows to shrink.

**Effort:** L (half-day including per-table policy design and staged deploy).
**Risk:** highest-blast-radius round. Guaranteed breakage for any caller still using the anon client against restricted surfaces. Mitigate by grep-listing `.from('<table>')` in `/site/src` for each touched table before migration lands; pre-ship any switches to service-role handlers.

---

### Round B — RPC actor-spoof sweep

**Scope:** retire the 11 named RPCs that take spoofable `p_user_id` / `p_owner_id` / `p_email` args. One migration + minor caller changes.

**Issues addressed:**
- C-04 (all 11 RPCs)
- M-14 `create_support_ticket.p_email` drop

**Migration steps (`093_rpc_actor_lockdown.sql`):**

For each RPC, one of three fixes:
- **Drop the arg, read `auth.uid()` inside body.** Preferred for: `family_weekly_report`, `family_members`, `weekly_reading_report`, `breaking_news_quota_check`, `check_user_achievements`, `_user_freeze_allowance`, `user_article_attempts`, `user_has_dm_access`, `can_user_see_discussion`.
- **Guard clause:** `IF p_user_id <> auth.uid() AND NOT is_admin_or_above() THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;` for RPCs that admins legitimately call with someone else's id (e.g. admin-facing `family_members` from admin console — decide per call site).
- **Drop the email arg** on `create_support_ticket`; look up from `users WHERE id = auth.uid()` inside the body.
- **`start_conversation(p_user_id, p_other_user_id)`:** replace `p_user_id` with `auth.uid()`; keep `p_other_user_id` as the intended partner.

**Caller updates:**
- `site/src/app/api/family/report/route.js` and kin — remove `p_owner_id` payload.
- `/api/support/ticket/create` — remove p_user_id, p_email.
- Any call sites for `check_user_achievements`, `breaking_news_quota_check`, `weekly_reading_report`.

**Verification:**
- SQL: authenticated session with user A calls `family_weekly_report(p_owner_id := user_B_id)` — expect exception or null set.
- curl: hit `/api/support/ticket/create` as user A with body `{email: 'attacker@x.com'}` — confirm stored email on `support_tickets` matches A's users.email, not body.
- Smoke: family dashboard still loads for a Family-plan user.

**Effort:** M (1-2h DB + caller edits).
**Risk:** caller fan-out. Use grep for each RPC name before shipping.

---

### Round C — Money-path + account-state UX

**Scope:** close `/billing` 404 and all CTAs that feed it. Pure code round, no migrations.

**Issues addressed:**
- C-02 `/billing` 404
- H-09 `/messages` silent redirect
- H-10 `/profile/settings/billing` stub flash
- H-17 fragile `#billing` anchor
- H-15 quiz "View plans" dead-end
- M-20 `AskAGrownUp` default href

**Order of operations:**
1. Create `site/src/app/billing/page.tsx` as a server component that `redirect('/profile/settings#billing')`. Covers the direct `/billing` URL + all existing CTAs in one shot.
2. Fix `AskAGrownUp` component default href from `/billing` → `/profile/settings#billing`.
3. Update `AccountStateBanner` frozen-state CTA to link direct to `/profile/settings#billing`.
4. Replace `/messages` silent redirect with the regwall-overlay pattern already used on `/story/[slug]`.
5. Convert `/profile/settings/billing` stub to a server-side `redirect()` (kills the mount-flash).
6. Decide H-17: either commit to the `#billing` anchor (document it, add scroll-into-view on mount) or split billing into its own `/profile/settings/billing` section-page. Stop-gap is fine; flag follow-up.
7. Quiz 2nd-failure CTA: add secondary "Try another article" link alongside "View plans".

**Verification:**
- curl `/billing` — expect 302/307 to `/profile/settings#billing`.
- Manual: frozen test user clicks resume → lands on billing without flash.
- Manual: free user taps Messages → sees overlay, not bounce.

**Effort:** M (1-2h).
**Risk:** routing edge case — double-check Next.js server `redirect()` behavior inside App Router doesn't 308-cache in a way that sticks.

---

### Round D — Public-surface hardening (App Store + SEO + Stripe)

**Scope:** everything a reviewer or crawler can hit without login. Mixed code changes, no migrations.

**Issues addressed:**
- C-01 `/status` page fabrication
- H-06 Stripe `success_url` / `cancel_url` unvalidated
- H-11 `/profile/contact` login wall
- H-12 sitemap canonical + missing articles
- H-14 home search banner dead UI + top-nav search gating
- H-18 `<title>` never updates on story page
- H-19 `access_requests_insert` always-true (rate-limit on route)
- L-01 sitemap enumerates only `/`, `/browse`

**Changes:**
1. **C-01:** either delete `/status` from nav + mark page admin-only, or wire to real signal (out of scope for launch — delete is cheapest).
2. **H-06:** drop `success_url` / `cancel_url` from checkout route body; derive from `request.nextUrl.origin` + hard-coded path.
3. **H-11:** add middleware allowlist for `/profile/contact` OR create public `/contact` and point footer there.
4. **H-12 + L-01:** enumerate published articles + category pages in sitemap. Owner-side confirm `NEXT_PUBLIC_SITE_URL` on Vercel.
5. **H-14:** delete dead `searchVerifyPrompt` state + banner in `site/src/app/page.tsx:491-498`. Ungate top-nav search for verified signed-in users on non-home routes.
6. **H-18:** add `generateMetadata` export to `/story/[slug]/page.tsx`.
7. **H-19:** wrap `/api/access-request/create` handler with the existing rate-limit helper, keyed on IP. Leave RLS policy alone (intentionally permissive — writes need anon).

**Verification:**
- curl `/status` — expect 404 or 302 to nothing.
- curl `/contact` (logged out) — expect 200.
- curl `/sitemap.xml` — expect > 2 entries, canonical host matches prod.
- Manual: POST `/api/stripe/checkout` with `success_url=https://evil.com` — confirm ignored.
- Manual: open story page, verify tab title changes.

**Effort:** M (2h).
**Risk:** sitemap regeneration may need a rebuild trigger on article publish — document.

---

### Round E — Auth + signup data integrity

**Scope:** fixes silent data-loss on signup + webhook race + OAuth provider linkage.

**Issues addressed:**
- H-01 signup drops display_name / terms for confirm-email users
- H-02 OAuth callback `auth_providers` insert on caller client
- H-08 Stripe webhook `stripe_customer_id` race
- H-22 verify `handle_new_auth_user` doesn't trust metadata.role (Agent 2 already verified it does not; the migration 067 trigger body is safe — remaining work: add a defensive comment + enforce non-owner on user_count=1 branch after bootstrap)
- N-03 owner-bootstrap race comment/guard

**Steps:**
1. **H-01:** switch `api/auth/signup/route.js:51` `users.upsert` to the service-role client. Persist display_name + terms_accepted_at in the same call. Or — move the upsert into the `handle_new_auth_user` trigger and read metadata there.
2. **H-02:** switch `api/auth/callback/route.js:88` insert to service-role. (RLS policy `(user_id = auth.uid())` confirmed — would succeed if session is present, but defensive switch avoids the race.)
3. **H-08:** add `.is('stripe_customer_id', null)` filter to the final UPDATE in `handleCheckoutCompleted` so the second writer no-ops.
4. **H-22 / N-03:** `handle_new_auth_user` is verified safe (does not read `raw_user_meta_data.role`). Add a one-line comment noting this was audited. Optionally guard the owner-bootstrap branch with `IF EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE r.name = 'owner') THEN user_count := 2; END IF;` — prevents post-truncate owner hijack.

**Verification:**
- Sign up with email confirm, leave tab, click confirmation link — confirm display_name + terms_accepted populated.
- Replay a stored Stripe webhook — confirm second write no-ops (log line or row unchanged).
- SQL spot-check: `SELECT prosrc FROM pg_proc WHERE proname='handle_new_auth_user';` — confirm no `raw_user_meta_data` read.

**Effort:** M (1-2h).
**Risk:** trigger function edits need careful migration ordering; ship as a single `ALTER FUNCTION` replacement.

---

### Round F — CSP, CORS, observability

**Scope:** the deploy-config cluster. Code-only, all in `next.config.js` + one API route.

**Issues addressed:**
- H-05 CSP connect-src missing Sentry + script-src unsafe-inline/eval
- H-21 cron routes Vercel-only binding
- M-03 health-check non-constant-time compare
- M-15 rate-limit fails open when NODE_ENV != production
- M-17 CORS policy undocumented
- M-18 Sentry wrap silent no-op in prod
- M-19 /metrics / Sentry DSN in Vercel env (owner-side; flag)
- L-02 root-layout script + unsafe-inline

**Steps:**
1. CSP nonce rewrite: add nonce middleware, remove `'unsafe-inline'` + `'unsafe-eval'` from `script-src`, add `https://*.ingest.sentry.io` to `connect-src`. Test all inline scripts (Next.js, Plausible, etc.).
2. Cron routes: add `if (req.headers.get('x-vercel-cron') !== '1' && !isBearerValid(...)) return 401;` — require EITHER header or bearer, not just bearer.
3. Swap `provided === secret` in health route for `crypto.timingSafeEqual`.
4. Rate-limit gate: `const prod = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';`
5. Add `Access-Control-Allow-Origin` handling middleware with allow-list (prod origin + localhost in dev).
6. Sentry wrap: `if (process.env.VERCEL_ENV === 'production' && !sentryLoaded) throw new Error(...)`.

**Verification:**
- Browser devtools: verify `Content-Security-Policy` header has no `unsafe-*`; Sentry ingest requests succeed post-DSN-enable.
- curl `/api/cron/hourly` without header or bearer → 401. With `x-vercel-cron: 1` → 200.
- Staging deploy with `NODE_ENV != production` → rate limit still enforces.

**Effort:** M-L (2-3h for CSP nonce conversion; nonce work is the long pole).
**Risk:** CSP nonces break inline scripts if any are unaccounted for. Ship with CSP-Report-Only first, review reports, then flip enforce.

---

### Round G — Storage + password config

**Scope:** Supabase dashboard toggles + one storage policy. No migration file.

**Issues addressed:**
- H-03 `banners` bucket LIST policy
- H-04 HIBP leaked-password protection disabled

**Steps:**
1. Tighten banners bucket SELECT policy: replace broad `true` with `bucket_id = 'banners' AND name = ANY(ARRAY[…])` OR scope by path prefix. Alternative: revoke LIST, keep object-URL-GET.
2. Supabase dashboard: Auth → Providers → Email → toggle leaked-password protection on.

**Verification:**
- Anon attempts `supabase.storage.from('banners').list()` → expect empty or deny.
- Sign up with known-leaked password (`password123`) → expect rejection.

**Effort:** S (under 30min, mostly dashboard clicks).
**Risk:** if an admin UI depends on listing banners, verify service-role path still works.

---

### Round H — Function search_path hygiene

**Scope:** `ALTER FUNCTION … SET search_path = public, pg_temp` for the 13 flagged functions.

**Issues addressed:**
- M-01 function_search_path_mutable (13 functions)

**Steps:**
1. One migration, 13 `ALTER FUNCTION` statements. Priority function is `reject_privileged_user_updates` (last-resort privileged-column write guard).

**Verification:**
- Re-run `get_advisors security` — expect zero `function_search_path_mutable` warnings.

**Effort:** S.
**Risk:** none — no semantic change.

---

### Round I — Flow + copy polish

**Scope:** UX cleanup across the app. Pure code.

**Issues addressed:**
- H-13 Interstitial "unlock quizzes" copy
- H-16 story-page tabs empty/locked state on mobile
- M-02 home SSR
- M-04 dual-cache permission client collapse
- M-05 `FALLBACK_CATEGORIES` removal
- M-06 kid / adult slug-prefix leak
- M-07 kid story dead-end on paused profile
- M-08 duplicate "Quiz passed!" celebration
- M-09 reading-complete beacon visibility guard
- M-10 anon home no Sign up CTA
- M-11 bookmark cap toast + banner dedup
- M-12 regwall sessionStorage clear on signup
- M-13 CSS var fallbacks
- L-03 jsconfig vs tsconfig pick one
- L-04 curly apostrophe
- L-05 welcome carousel copy (owner-side)
- L-06 admin category order
- L-07 navigator.share
- L-08 CommentComposer mentions hint
- L-09 auth pages loading skeleton
- L-10 Interstitial next= param
- L-11 EXPECTED_BUNDLE_ID env

**Effort:** L (half-day+, can be sliced).
**Risk:** Low per item; breadth makes regression testing the real cost. Best split into 2-3 commits by surface area (story page, home, auth, settings).

---

### Deferred (listed, not hidden)

Mark as deferred — real issues, doesn't block ship:

- **L-03** jsconfig vs tsconfig cleanup (no runtime impact).
- **L-05** welcome carousel copy (owner editorial).
- **L-06** admin-only category order quirk.
- **L-07** `navigator.share` progressive enhancement.
- **L-09** loading skeletons on auth pages.
- **L-10** Interstitial `next=` param (edge case).
- **L-11** `EXPECTED_BUNDLE_ID` env extraction (single-bundle reality).
- **M-02** home SSR conversion (SEO nice-to-have; home currently ranks for brand only).
- **M-04** dual-cache permission client collapse (behavioral drift risk is low; can ship post-launch).
- **M-05** `FALLBACK_CATEGORIES` removal (only fires if DB unreachable).
- **M-13** CSS var fallback audit (no confirmed regression).

These stay in the queue; the point is not to block shipping on them.

---

## User-side TODOs (not code fixes)

Owner owns these; separate track.

- Editorial: replace all `Test:` articles with real content (master list R2-C1).
- Editorial: seed sources / comments / timelines / bookmarks (R2-C3).
- Secrets: complete `ROTATE_SECRETS.md` rotation pass (sk_live, service_role JWT on dev workstation).
- Vercel env: confirm `NEXT_PUBLIC_SITE_URL`, `SENTRY_DSN`, `RESEND_API_KEY`, `OPENAI_API_KEY`, `APNS_*`, `APPSTORE_SHARED_SECRET`, `CRON_SECRET` set in prod.
- Supabase dashboard: toggle HIBP (covered in Round G as owner step).
- Sentry: configure DSN + fire a test exception; confirm email delivery (M-19).
- App Store Connect / TestFlight: build approval, screenshots, review notes.
- Apple Developer: bundle id + push cert state (E2E_VERIFICATION.md).
- Backup/PITR: confirm Supabase backup policy active.
- Email template compliance review.
- Load + RLS-under-contention test (not attempted in code review).

---

## Totals

- Rounds: 9 (A through I) + deferred bucket + owner-side track.
- Estimated effort (rounds A-I only): ~2 engineer-days.
  - A: half-day (L)
  - B: 1-2h (M)
  - C: 1-2h (M)
  - D: 2h (M)
  - E: 1-2h (M)
  - F: 2-3h (M-L)
  - G: 30m (S)
  - H: 30m (S)
  - I: half-day+ (L, sliceable)

Highest-leverage: **Round A.** Clears four Criticals (C-03, C-05, C-06) + two Highs + two newly-surfaced issues in one migration. Every subsequent round's surface area shrinks once Round A lands.

## Atomic commit sequencing recommendation

1. Round A (single migration + verification) — commit + deploy in isolation, watch advisors for 30 min.
2. Round B (RPCs + callers) — single commit pair.
3. Round C (billing + CTAs).
4. Round D (public surface).
5. Round E (auth + webhook).
6. Round F (CSP + observability) — ship CSP in Report-Only first, verify 24h, then enforce.
7. Round G (dashboard toggles).
8. Round H (search_path).
9. Round I (UX polish, can be sliced across multiple commits).

Each round is independently revertable. No hidden cross-round coupling.
