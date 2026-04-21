# Pre-launch review — Reviewer 1

Compiled cold, no access to prior audits. Review scope: web app (site/src), iOS app (VerityPost/), live DB (Supabase fyiwulqphgmoqullmrfn), deploy config, env, dev server probe on :3000. Time-boxed ~2h.

## Critical — would block my approval

- **Fake hard-coded `/status` page ships uptime numbers, fabricated incidents, and a "Push Notifications: Degraded" label.** `site/src/app/status/page.tsx` lines 25-37 hard-code `services` and `incidents` arrays (e.g. "Apr 9, 2026 — Push notification delays … resolved", "Website 99.99%", "RSS Ingestion 99.91%"). There is no data source behind it. Publishing a fabricated status page — especially one linked from the site — is deceptive and a trust/compliance risk. Gate behind admin, wire to real signal, or remove from public nav before launch.

- **Core integrations not configured — production env keys are placeholders.** `site/.env.local`:
  - `RESEND_API_KEY=re___PLACEHOLDER__`
  - `OPENAI_API_KEY=sk___PLACEHOLDER__`
  - `APNS_KEY_ID / APNS_TEAM_ID / APNS_AUTH_KEY=__PLACEHOLDER__`
  - `APPSTORE_SHARED_SECRET=__PLACEHOLDER__`
  - `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
  - `NEXT_PUBLIC_SENTRY_DSN` commented out
  Code paths gracefully 503 when RESEND/OPENAI are missing (`lib/email.js`, `api/ai/generate`, `api/cron/send-emails`), but this means on cutover: password-reset / verification / weekly-recap / broadcast / billing-alert emails do not send; iOS push is dead; App Store receipt validation fails; no crash tracking. Assuming `.env.local` mirrors what's slated for Vercel prod, none of this is actually production-ready. Confirm the Vercel env variables cover these before flipping DNS.

- **Sitemap ships with localhost URLs.** `site/robots.txt` and `/sitemap.xml` derive from `NEXT_PUBLIC_SITE_URL` which is `http://localhost:3000`. On deploy, if `NEXT_PUBLIC_SITE_URL` is not overridden, Google will index `http://localhost:3000/...` as canonical. Cold-start a staging deploy and curl `/sitemap.xml` before cutover.

- **DB schema is drift-prone from cold start.** `01-Schema/` has 85 .sql files (reset_and_rebuild_v2.sql plus 005-091 patches); Supabase has 33 registered migrations (versions 20260418155756 through 20260419181412). Recent migrations include `start_conversation_rpc_..._reapply` and `fix_round8_permission_drift` — signals of hot-patching. If the live DB is nuked (Supabase project loss, rollback, new env), the `01-Schema/` directory is the disaster-recovery artifact and it is unclear whether replaying it in order cleanly produces the current state. Write and test a green-field rebuild script before launch.

## High — silent bugs / real user impact

- **Signup flow silently drops display_name / terms metadata for users who need email confirmation.** `api/auth/signup/route.js:51` upserts `public.users` with display_name + metadata using the **caller's** Supabase client. With Supabase default "confirm email" behavior, `signUp()` returns a user but no session, so `auth.uid()` is null at the subsequent `users.upsert` and `user_roles.insert`. RLS `with_check (id = auth.uid())` on `users` insert, and `is_admin_or_above()` on `user_roles` insert, both fail. The DB trigger `handle_new_auth_user` compensates by creating the row and role, but it does not persist `display_name`, `full_name` metadata, or terms acceptance. Either use the service client for the post-signup writes, or migrate those writes into the DB trigger.

- **`auth_providers` insert in `/api/auth/callback` (OAuth flow) uses the caller client.** `site/src/app/api/auth/callback/route.js:88`. Inspect `auth_providers` RLS before launch — if policy requires anything not reflected in the newly-exchanged session, this insert silently fails and provider linkage is lost.

- **`perms_global_version` table has RLS enabled with no policies** (Supabase security advisor flag). Grants are service-role only, so user traffic is blocked correctly, but the configuration is inconsistent with the rest of the schema. Either add a benign SELECT policy or disable RLS — pick one.

- **`rls_policy_always_true` warnings** on `access_requests_insert`, `ad_impressions_insert`, `analytics_events_insert`, `rate_limit_events_insert`, `user_sessions_insert`, `webhook_log_insert`. Intentional for anon-write collectors in most cases, but `access_requests_insert` open-insert deserves a second look — an attacker can flood the access-requests table with spam, and I could not confirm whether there's a rate-limit layer in front.

- **`public_bucket_allows_listing` on `banners` bucket.** Clients can enumerate every file in the banners bucket. Tighten the SELECT policy to path-scoped access before making the bucket generally writable.

- **Leaked-password protection is OFF in Supabase auth.** Supabase advisor flagged `auth_leaked_password_protection`. Turn on HIBP check — free and trivial, and the signup validator in `lib/password.js` otherwise accepts weak-but-long common passwords.

## Medium — polish / hardening

- **14 public functions have mutable search_path** (Supabase security advisor): `get_user_category_metrics`, `update_updated_at_column`, `enforce_max_kids`, `bump_perms_global_version`, `audit_perm_change`, `guard_system_permissions`, `reject_privileged_user_updates`, `_user_is_paid`, `bookmark_collection_count_sync`, `_setting_int`, `_user_tier_or_anon`, `_user_is_moderator`, plus two more. Low-probability injection vector but the fix is mechanical (`ALTER FUNCTION … SET search_path = public`). Address before inviting external auditors.

- **CSP `connect-src` does not include Sentry.** `site/next.config.js:10-16` restricts to self + Supabase + stripe + openai. The moment `NEXT_PUBLIC_SENTRY_DSN` is turned on in prod, ingest requests to `*.sentry.io` / `*.ingest.sentry.io` will be blocked in the browser and you'll get zero client-side error telemetry.

- **Unvalidated Stripe success_url / cancel_url.** `api/stripe/checkout/route.js:14` accepts `success_url` and `cancel_url` from the client unchanged. Stripe itself does HTTPS validation, but an attacker-controlled success_url points a victim's post-payment redirect to a phishing lookalike. Shape-check to `origin` or hard-code paths.

- **Health-check secret compare is non-constant-time.** `api/health/route.js:31`: `provided === secret`. Detailed-health leak is limited to env-presence booleans, but since `cronAuth.js` already bothers to use `timingSafeEqual`, mirror the pattern here.

- **Home page is fully client-rendered** (`'use client'`). Robots and first-paint performance both take a hit; the SSR HTML is literally the 404 fallback until React hydrates. Move the initial story fetch to a server component.

- **Dual-cache permission client** (`lib/permissions.js`): the old section-scoped cache and the new full-resolver cache coexist with comments documenting a "Wave 1 → Wave 2" migration. Live hazard: a cache miss in one path falls back to the other, so behavior depends on which code happened to load first. Collapse to one before launch or pick a target completion date.

- **Home feed uses hard-coded fallback categories and subcategories** (`app/page.tsx:79-121`) when the DB query returns less than expected. Live DB has 69 categories — fallbacks probably never fire — but a schema tweak that renames a slug will silently show stale category names to users.

## Low — nits

- `sitemap.xml` includes only `/` and `/browse` — missing every published article and category page. Either enumerate articles or accept the SEO cost.
- `CRON_SECRET` has a bearer prefix on the check but plain-string compare wouldn't have leaked much; current constant-time implementation is correct.
- Root layout embeds a `<script>` tag that sets `window.__next_f` — benign, but the CSP uses `'unsafe-inline'` for scripts which limits its value. Consider a nonce-based CSP once feasible.
- `site/jsconfig.json` and `site/tsconfig.json` both exist — harmless but ambiguous for future contributors.

## What I couldn't assess

- **Vercel production env.** `.env.local` is the only env file I can see. The real test is whether the Vercel project's env overrides those placeholders. Review directly in Vercel before the cutover.
- **Real behavior of the Stripe webhook in prod.** Signature verification is solid, idempotency via `webhook_log.event_id` UNIQUE is solid, but I did not replay real payloads.
- **iOS build.** I read project.yml, Info.plist, and the Swift entry points — I did not compile, run the app, or test any flow end-to-end. App Store receipt validation is dead without `APPSTORE_SHARED_SECRET`.
- **App Store Connect / TestFlight status.** No visibility.
- **Load characteristics, rate-limit tuning, and RLS performance under write contention** — inspection only, no perf testing.
- **Content moderation quality** (AI tagging, profanity lists) — visual inspection only.
- **Email-template content** — reviewed render path, not copy.
- **Backup / restore runbook** — no code artifact for this so I can't evaluate it.

## Verdict

**Ship today: NO. CONDITIONAL on:**

1. Verify Vercel prod env replaces every `__PLACEHOLDER__` for RESEND, OPENAI, APNS_*, APPSTORE_SHARED_SECRET, NEXT_PUBLIC_SITE_URL, and ideally SENTRY_DSN. Without Resend, email verification / password reset / all transactional email is silently dead.
2. Remove or gate the `/status` page. The fabricated uptime and incident data is a reputational and potentially legal problem if a real user relies on it.
3. Fix the signup display_name / metadata persistence regression (move post-signup user-row writes into the DB trigger, or switch to the service client in the signup route).
4. Decide and test the cold-start DB story. Either validate that replaying `01-Schema/*.sql` in order produces the current live schema, or document that disaster recovery relies on a Supabase PITR snapshot.
5. Turn on Supabase leaked-password protection and tighten the `banners` bucket SELECT policy.

The code surface itself is solid — permission model is comprehensive, Stripe webhook is careful, RLS is uniformly applied, rate-limiting fails closed in prod, cron auth is constant-time. The gaps are deploy/config, not architecture.
