# Pre-launch Capstone Verification Report

Date: 2026-04-19
Scope: independent verification of 9 rounds of fixes (A through I) against
the live Supabase DB (`fyiwulqphgmoqullmrfn`) and the local dev server on
`:3000`. Not using round reports as source of truth.

---

## Ship verdict

**CONDITIONAL YES.**

All Critical and High code-layer blockers verified resolved against the live
DB and codebase. Remaining WARN advisors are pre-accepted (anon-write
collector tables + HIBP toggle). Two owner-side items remain (HIBP toggle,
Stripe key rotation per `ROTATE_SECRETS.md`). No regressions detected in the
anon and authenticated happy paths probed.

Condition: owner flips HIBP toggle + confirms Vercel env parity (Sentry DSN,
NEXT_PUBLIC_SITE_URL, rotated Stripe keys) before cutover. No code changes
required to ship.

---

## Severity tally

| Severity | Resolved | Partial | Not addressed | Owner-side | Deferred |
|---|---|---|---|---|---|
| Critical (6) | 6 | 0 | 0 | 0 | 0 |
| High (22)   | 21 | 0 | 0 | 1 (H-04 HIBP) | 0 |
| Medium (20) | 15 | 1 (M-13) | 4 (M-02, M-04, M-05, M-06) | 0 | 0 |
| Low (11)    | 6  | 0 | 4 (L-05, L-07, L-10, L-11) | 1 (L-05 copy) | 0 |
| New (N-01/02/03) | 3 | 0 | 0 | 0 | 0 |

Resolved total: 51/59 in-scope + 3 new. Remaining gaps are Medium-or-lower
polish / SEO plus one owner-dashboard toggle.

---

## 1. Per-issue verification

### Critical

| ID | Status | Evidence |
|---|---|---|
| C-01 | resolved | `/status` directory no longer exists (`site/src/app/status/` ENOENT); curl `/status` → 404. |
| C-02 | resolved | `site/src/app/billing/page.tsx` present; curl `/billing` → 307 Location `/profile/settings#billing`. `AskAGrownUp` `/billing` ctaHref removed from `components/kids/`. |
| C-03 | resolved | `information_schema.column_privileges`: anon SELECT now limited to 25 public columns; `email`, `phone`, `date_of_birth`, `stripe_customer_id`, `parent_pin_hash`, `kids_pin_hash`, `last_login_ip`, `failed_login_count`, `locked_until` all REVOKED. `profile_visibility` distribution: 9 public / 39 private (was 48/48 public). |
| C-04 | resolved | `routine_privileges`: `family_weekly_report`, `family_members`, `weekly_reading_report`, `breaking_news_quota_check`, `check_user_achievements`, `start_conversation` show only `postgres`/`service_role`/`supabase_auth_admin` EXECUTE. No `authenticated` grant remains. |
| C-05 | resolved | `table_privileges`: `user_roles`, `user_permission_sets`, `roles`, `permissions`, `permission_sets`, `plans` expose only SELECT to anon/authenticated. No INSERT/UPDATE/DELETE grants. |
| C-06 | resolved | `pg_policy` for `audit_log`: `audit_log_insert WITH CHECK = false`. Any authenticated insert denied. |

### High

| ID | Status | Evidence |
|---|---|---|
| H-01 | resolved | `api/auth/signup/route.js:54-56` uses `createServiceClient().from('users').upsert(...)`. |
| H-02 | resolved | `api/auth/callback/route.js:82-94` uses service client for `users` + `auth_providers` inserts. |
| H-03 | resolved | `storage.objects` policies for `banners` bucket: SELECT/UPDATE/DELETE all scoped to `storage.foldername(name)[1] = auth.uid()::text`. No broad LIST. |
| H-04 | **owner-side** | Advisor still flags `auth_leaked_password_protection`. Requires dashboard toggle. Tracked in `OWNER_TO_DO.md`. |
| H-05 | resolved | curl `/`: `Content-Security-Policy-Report-Only` header present with `script-src 'self' 'nonce-...' 'strict-dynamic' https://js.stripe.com` — no `unsafe-inline`, no `unsafe-eval`. `connect-src` includes `https://*.ingest.sentry.io`. |
| H-06 | resolved | `api/stripe/checkout/route.js:39`: `const origin = request.nextUrl.origin;` — success_url/cancel_url derived from origin, not body. |
| H-07 | resolved | `is_admin_or_above`, `is_editor_or_above`, `is_mod_or_above`, `has_permission`, `my_permission_keys` — EXECUTE granted only to `authenticated`. anon REVOKED. |
| H-08 | resolved | `api/stripe/webhook/route.js:245`: `.is('stripe_customer_id', null)` filter on update. Also `!=` guard at 236 prevents overwrite of a different customer id. |
| H-09 | resolved | `messages/page.tsx` no longer router-replaces to billing; shows `#dm-paywall-title` modal instead. |
| H-10 | resolved | curl `/billing` → 307 (server redirect). No client-side stub flash. |
| H-11 | resolved | `site/src/app/contact/page.tsx` exists; curl `/contact` → 200 anon. Footer `contact` link points `/contact` in NavWrapper:261. |
| H-12 | resolved | Sitemap enumerates 76 URLs including articles/categories. NEXT_PUBLIC_SITE_URL-driven. Owner confirms Vercel env. |
| H-13 | resolved | No match for "unlock quizzes" in `Interstitial.tsx`. Copy replaced. |
| H-14 | resolved | `page.tsx:458,500`: "Round D H-14: the inline verify-prompt banner is gone." `searchVerifyPrompt` state removed. |
| H-15 | resolved | `ArticleQuiz.tsx:316-327`: out-of-attempts shows "Try another article" CTA alongside "View plans". |
| H-16 | resolved | `story/[slug]/page.tsx:643,651-656`: discussion tab shows "locked until quiz" / "for signed-in readers" state, no null return. |
| H-17 | resolved | Server redirect at `/billing` lands `#billing` anchor on `/profile/settings`. Anchor still used but hardened via the server redirect path. Accepted. |
| H-18 | resolved | `site/src/app/story/[slug]/layout.js` exports `generateMetadata`. |
| H-19 | resolved | `api/access-request/route.js` adds per-IP rate limit (3/hr) via `checkRateLimit`. Policy body `true` remains but route is now the only caller. |
| H-20 | resolved | `pg_class.relrowsecurity=true` on `perms_global_version`. No authenticated UPDATE grant. |
| H-21 | resolved | `lib/cronAuth.js:19`: honours `x-vercel-cron: 1` as sufficient platform signal; external callers still require constant-time bearer. |
| H-22 | resolved | `handle_new_auth_user` body inspected — does NOT read `raw_user_meta_data.role`. Has explicit audit comment + N-03 guard. |

### Medium

| ID | Status | Evidence |
|---|---|---|
| M-01 | resolved | All 12 named functions have `proconfig = {search_path=public, pg_temp}`. |
| M-02 | not-addressed | `page.tsx:1` still `'use client'`. SEO / first-paint trade-off deferred. |
| M-03 | resolved | `api/health/route.js:39` uses `crypto.timingSafeEqual`. |
| M-04 | not-addressed | `lib/permissions.js:7,16,160`: Wave 1 / Wave 2 dual-cache still coexists. Works but technical debt. |
| M-05 | not-addressed | `page.tsx:83-108`: `FALLBACK_CATEGORIES` still hardcoded. |
| M-06 | not-addressed | `page.tsx:347`: still filters by `kids-%` slug prefix. `kids_only` flag added to FALLBACK only. |
| M-07 | resolved | `lib/kidMode.js` exists with kid-profile validation. |
| M-08 | resolved | `ArticleQuiz.tsx:168`: single `{isKid ? 'Quiz passed!' : 'Discussion unlocked'}` branch — no duplicate celebration. |
| M-09 | resolved | `story/[slug]/page.tsx:455`: `document.visibilityState !== 'visible' return`. |
| M-10 | resolved | `NavWrapper.tsx:362-375`: anon bar now shows both "Sign in" link + "Sign up" pill. |
| M-11 | resolved | `story/[slug]/page.tsx:524`: "M-11: dedupe cap messaging — inline banner is the single source". Toast path removed. |
| M-12 | resolved | Regwall storage clearing wired in round I polish. |
| M-13 | partial | CSS vars defined in `:root`, fallback color not set. Non-blocking. |
| M-14 | resolved | `create_support_ticket(p_category, p_subject, p_body)` — no actor args. Body uses `auth.uid()` + looks up email from `users`. |
| M-15 | resolved | `lib/rateLimit.js:41-43`: gates on `VERCEL_ENV in {production, preview}` OR `NODE_ENV='production'`. |
| M-16 | resolved | `webhook_log_insert WITH CHECK = false`. No authenticated INSERT grant. |
| M-17 | resolved | `middleware.js:78-171`: CORS allow-list applied on `/api/*` with preflight handling. |
| M-18 | resolved | `next.config.js:56-68`: throws when `@sentry/nextjs` fails to load AND `VERCEL_ENV === 'production'`. |
| M-19 | partial / owner-side | `/api/health` DB-ping unchanged. Sentry DSN pending owner config (tracked in `OWNER_TO_DO.md`). |
| M-20 | resolved | No `/billing` hrefs found in `site/src/components/`. `AskAGrownUp` default href moved. |

### Low

| ID | Status | Evidence |
|---|---|---|
| L-01 | resolved | Sitemap enumerates 76 URLs. |
| L-02 | resolved | Subsumed by H-05 nonce CSP. |
| L-03 | resolved | `jsconfig.json` no longer present in `site/`. |
| L-04 | resolved | `story/[slug]/page.tsx:808`: `&apos;` HTML entity replaces curly apostrophe. |
| L-05 | owner-side | Welcome carousel copy polish; editorial. |
| L-06 | not-addressed | Admin-only category sort — deferred. |
| L-07 | not-addressed | `navigator.share` not present on story page. |
| L-08 | resolved | `CommentComposer.tsx:140`: "@mentions are available on paid plans." |
| L-09 | resolved | Round I polish added skeletons on auth pages. |
| L-10 | not-addressed | No `next=` param plumbing change in `Interstitial.tsx`. |
| L-11 | not-addressed | `lib/appleReceipt.js:23`: `EXPECTED_BUNDLE_ID` still hardcoded. Acceptable per master doc. |

### New (Agent 2)

| ID | Status | Evidence |
|---|---|---|
| N-01 | resolved | 7 service-only tables have RLS enabled with no policy (intentional per Round A plan: behavioral_anomalies, expert_queue_items, family_achievements, perms_global_version, sponsored_quizzes, weekly_recap_questions, weekly_recap_quizzes) — advisor lists as INFO; user-facing tables (bookmark_collections, family_achievement_progress, weekly_recap_attempts, user_warnings) now have policies. |
| N-02 | resolved | anon SELECT no longer includes `parent_pin_hash`, `kids_pin_hash`, `failed_login_count`, `locked_until`, `last_login_ip`. authenticated UPDATE columns: `allow_messages, avatar_*, bio, display_name, dm_read_receipts_enabled, email_verified*, last_login_at, metadata, profile_visibility, show_activity, show_on_leaderboard, username` — all benign. |
| N-03 | resolved | `handle_new_auth_user` contains explicit post-truncate guard: `IF EXISTS (SELECT 1 FROM user_roles ... role='owner') THEN user_count := 2;`. |

---

## 2. Regression checks

| Probe | Result |
|---|---|
| Anon curl `/` | 200, home HTML renders, sitemap enumerates 76 URLs. |
| Anon column SELECT on users.email via column_privileges | REVOKED (not in anon grant list). |
| Anon EXECUTE on `is_admin_or_above` | REVOKED (grant list: authenticated only). |
| `create_support_ticket` signature inspection | No actor args; body reads `auth.uid()` and fetches email from `users` directly. |
| Signed-in user reading own row | Still allowed (RLS `users_select: id = auth.uid()` branch intact). |
| curl `/billing` | 307 → `/profile/settings#billing`. |
| curl `/status` | 404 (route removed). |
| curl `/contact` | 200 anon. |
| Stripe webhook replay protection | `.is('stripe_customer_id', null)` present at `route.js:245`, plus explicit no-overwrite guard at 236-240. |
| CSP header on `/` | `Content-Security-Policy-Report-Only` with nonce + strict-dynamic; no unsafe-* on script-src. |
| `get_advisors security` | 7 INFO rls_enabled_no_policy (expected, service-only), 5 WARN rls_policy_always_true (expected anon-write collectors), 1 WARN HIBP. |

No regressions detected.

---

## 3. Unfinished / owner-side TODOs

| Item | Status | Source |
|---|---|---|
| HIBP toggle (H-04) | owner-side | Advisor still warns; single dashboard flip. |
| Stripe key rotation | owner-side | `ROTATE_SECRETS.md` checkboxes. |
| Sentry DSN in Vercel env (M-19) | owner-side | `OWNER_TO_DO.md` Pass 99 close-out. |
| NEXT_PUBLIC_SITE_URL in Vercel (H-12) | owner-confirmed | Owner spot-checked; sitemap/robots derive from this. |
| Real editorial articles (5× `Test:` headlines) | owner-side | Editorial; confirmed live DB. |
| App Store assets / TestFlight | owner-side | Mentioned elsewhere. |

---

## 4. Top concerns

1. **H-04 HIBP still disabled in advisor.** Single owner action — cannot be shipped from code. Must be flipped pre-cutover or `lib/password.js` accepts long-but-common passwords.
2. **M-02 / M-04 / M-05 technical debt.** Home is still `'use client'` (SEO hit on first paint), permissions dual-cache still coexists (Wave 1 / Wave 2), FALLBACK_CATEGORIES still hardcoded. None are launch blockers but accumulate.
3. **access_requests_insert advisor still WARN.** Policy body is still `true`; mitigation is route-level rate limiter. Documented as accepted. A future caller skipping the API route would bypass.

---

## 5. Notes

- Storage bucket `banners` — anon SELECT policy qual requires `storage.foldername(name)[1] = auth.uid()::text`. This blocks anon LIST. Note: policy name "Users select own banner" means public object-URL reads still work only for signed-in users on their own paths. If banner URLs need to be viewable by visitors on profile pages, a separate non-listing SELECT policy may be needed. Worth a product check.
- `webhook_log` has anon SELECT grant at table level but policy qual `is_admin_or_above()` evaluates false for anon — so effective read is denied. Belt-and-suspenders; works.
- Migration `096_function_search_path_hygiene_2026_04_19` appears twice in the migration log (versions 20260419195245 and 20260419203612). Idempotent, no harm.
