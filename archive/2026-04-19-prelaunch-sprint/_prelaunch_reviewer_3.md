# Pre-launch review — Reviewer 3 (security + ops focus)

Compiled cold, no access to prior audits.

Scope: `site/src/**`, `01-Schema/**`, live DB at `fyiwulqphgmoqullmrfn`, config files, dev server on :3000.
Confirmed live behavior by running SQL as `anon` / `authenticated` via Supabase MCP. Findings ordered by blast radius.

## Critical — exploitable or data-loss risk

### C1. All user PII readable by anon / authenticated via RLS policy on `public.users`
RLS policy `users_select` is `((id = auth.uid()) OR (profile_visibility = 'public') OR is_admin_or_above())`. In the live DB `profile_visibility = 'public'` for 48 / 48 users (default). Column-level SELECT is granted to both `anon` and `authenticated` on the full row, including `email`, `phone`, `date_of_birth`, `stripe_customer_id`, `parent_pin_hash`, `kids_pin_hash`, `last_login_ip`, `failed_login_count`, `locked_until`, `deletion_reason`, `referred_by`, `last_login_device`, `metadata`.

Confirmed exploit — ran `SET ROLE anon; SELECT id, email, phone, stripe_customer_id, parent_pin_hash FROM public.users;` and received every row. Anyone with the shipped anon key (embedded in every HTML response) can dump the full user directory.

Evidence: live DB query; `01-Schema/reset_and_rebuild_v2.sql` RLS definition; `site/next.config.js` serves anon key in `NEXT_PUBLIC_SUPABASE_URL` envs.

Fix: (a) narrow the `users_select` policy so "public" profile visibility only exposes a whitelisted column subset via a dedicated view (e.g. `public_user_profiles`); (b) REVOKE column-level SELECT on the PII columns from `anon` / `authenticated`; (c) flip the default `profile_visibility` to `'private'` and migrate the existing 48 rows.

### C2. Authenticated users can spoof `p_user_id` / `p_owner_id` on SECURITY DEFINER RPCs
`authenticated` role holds EXECUTE on these DEFINER RPCs whose caller-supplied user id is not checked against `auth.uid()`:

- `family_weekly_report(p_owner_id)` — returns full kid activity (display names, counts) for any owner id.
- `family_members(p_owner_id)` — dumps every kid profile (id, display_name, verity_score, streak) for any owner.
- `weekly_reading_report(p_user_id)` — returns username, verity_score, streak, reading counts for any user.
- `breaking_news_quota_check(p_user_id)` — reveals whether a target is on a paid plan.
- `check_user_achievements(p_user_id)` — inserts rows into `user_achievements` for any target and writes to `achievements.total_earned_count`. Gamification + scoreboard corruption.
- `create_support_ticket(p_user_id, p_email, p_category, p_subject, p_body)` — mints a support ticket attributed to any `p_user_id` with any `p_email`. Phishing vector into the staff queue + identity-spoofing audit record.
- `start_conversation(p_user_id, p_other_user_id)` — opens a direct-message conversation with any paid user as the apparent owner, creating a `conversation_participants` row under the victim's id.
- `_subject_local_today`, `_user_freeze_allowance`, `_user_is_comment_blocked`, `_user_is_dm_blocked`, `can_user_see_discussion`, `user_article_attempts`, `user_passed_article_quiz`, `user_has_dm_access`, `user_supervisor_eligible_for`, `expert_can_see_back_channel`, `is_family_owner`, `is_user_expert`, `is_expert_in_probation`, `is_category_supervisor`, `user_is_supervisor_in` — all reveal privacy-sensitive or permission state for arbitrary target ids.

Server routes (`/api/conversations`, `/api/support`, etc.) always pass `user.id`, but the grant is on the RPC itself — any attacker hits PostgREST directly with the anon JS client and forges the arg.

Fix: every RPC of this shape either (a) drops the `p_user_id` arg and uses `auth.uid()`, or (b) opens with `IF p_user_id <> auth.uid() AND NOT is_admin_or_above() THEN RAISE EXCEPTION…`. REVOKE EXECUTE from `authenticated` and route exclusively through the service_role API handlers.

### C3. Live Stripe key + Supabase service-role JWT in `site/.env.local`
`site/.env.local` contains:
- `STRIPE_SECRET_KEY=sk_live_51TJuan…` — live-mode, full charge/refund authority.
- `SUPABASE_SERVICE_ROLE_KEY=eyJ…` — bypasses all RLS, full DB write.
- `STRIPE_WEBHOOK_SECRET=whsec_…`, `CRON_SECRET=bd14a4…`.

The file is gitignored (`.gitignore` covers `site/.env*`) so it has not been committed in this tree, but it exists on a developer workstation. A live sk_live in a dev environment is one `npm script` mistake away from charging real cards; and any dev leaking the workstation dump leaks prod. Verify via git reflog / any forks that this has not been published, then rotate both secrets immediately and use Vercel env vars for prod-only secrets. Local dev should use Stripe test keys only.

### C4. `authenticated` role has INSERT / UPDATE / DELETE on authorization-substrate tables
From `information_schema.table_privileges`: `authenticated` holds full CRUD on `user_roles`, `user_permission_sets`, `roles`, `permissions`, `permission_sets`, `plans`. RLS is the only gate. The current policies look correct (`with_check = is_admin_or_above()` on the write policies), but privilege grants like this are a footgun: one future migration that drops a policy — or adds a `FOR SELECT USING (true)` that accidentally shadows write gates — and an ordinary signed-in user promotes themselves to admin.

Fix: REVOKE INSERT/UPDATE/DELETE from `authenticated` on `roles`, `permissions`, `permission_sets`, `role_permission_sets`, `plan_permission_sets`, `permission_set_perms`, `plans`. All writes there happen via admin API handlers on service_role anyway.

### C5. `audit_log` is writable by any authenticated user, no policy check
Table `audit_log` grants INSERT to `authenticated` and RLS policy `audit_log_insert` has no WITH CHECK. Any user can write arbitrary `actor_id` / `action` / `metadata` / `target_*` into the tamper-evident log. Poisons forensic investigation and frame-up potential.

Same pattern for `webhook_log` (already caller-controllable from webhooks; fine for service_role but should not allow random authenticated writes), `notifications` (users can mint notifications for any `user_id`), `reading_log`, `quiz_attempts`.

Fix: add WITH CHECK `actor_id = auth.uid()` (or REVOKE INSERT) on `audit_log`. Tighten `notifications_insert`, `reading_log_insert`, `quiz_attempts_insert` similarly.

## High — hardening or ops gaps

### H1. `create_support_ticket(p_user_id, p_email, …)` accepts caller-supplied email
Even once C2 is fixed by enforcing `p_user_id = auth.uid()`, the RPC stores the attacker-chosen `p_email` on the ticket. If staff reply via the email address on the ticket row, the reply goes to the attacker. Drop `p_email` from the signature and look it up from `users` / `auth.users` inside the function.

### H2. CSP permits `'unsafe-inline' 'unsafe-eval'` on `script-src`
`site/next.config.js` ships `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com`. Any reflected-XSS gap (including user-controlled `display_name`, `bio`, comment bodies, mentions) immediately escalates to JS execution because inline and eval are allowed. Next 14 supports nonce-based CSP via `headers()`. Replace `'unsafe-inline'` with a rotating nonce and drop `'unsafe-eval'`.

### H3. Stripe `success_url` / `cancel_url` accepted raw from request body
`/api/stripe/checkout/route.js` forwards user-supplied `success_url` and `cancel_url` straight to Stripe. Stripe checkout accepts any URL, so an attacker can craft a checkout link that bounces to `https://evil.com/looks-like-veritypost` after a successful payment. Constrain both to same-origin (`URL(x).origin === new URL(request.url).origin`) or ignore them and derive from `origin` server-side.

### H4. `profile_visibility = 'public'` by default + no column scoping
Even independent of C1, the users table has no `public_profile` view. The right shape is a `VIEW` owned by postgres with only display_name, username, avatar_url, bio, verity_score (if `show_on_leaderboard`), that anon can read. Everything sensitive stays in the base table. This reduces future drift risk.

### H5. `is_admin_or_above()` granted to `anon`
The admin-check functions `is_admin_or_above`, `is_editor_or_above`, `is_mod_or_above`, `is_paid_user`, `is_premium`, `user_has_role`, `has_permission`, `has_permission_for`, `my_permission_keys`, `get_my_capabilities` are EXECUTE-able by `anon`. Individually harmless (they key off `auth.uid()`), but they feed RLS policies — a bug where a subquery under RLS returns true for `anon` is catastrophic. Lock these to `authenticated`.

### H6. Stripe webhook does not reject duplicate customer attachment on race
`handleCheckoutCompleted` loads `users` row by `stripe_customer_id` first, then falls back to `claimed_user_id`. Good defense. But the final `update users set stripe_customer_id = customerId` is not gated by a `WHERE stripe_customer_id IS NULL` in SQL — it relies on the JS read. Two concurrent webhooks (replay + first delivery) racing past the JS check can both reach the update. Add a `.is('stripe_customer_id', null)` filter on the update so the second writer no-ops.

### H7. Cron route accepts GET and POST without CSRF binding
`/api/cron/freeze-grace/route.js` exports both GET and POST, gated only by `Authorization: Bearer <CRON_SECRET>`. That's fine for Vercel cron but means a page with an `<img src>` trick cannot trigger work (browsers don't send that header) — still, the endpoints also return useful data (`frozen_count`, etc.). Confirm Vercel deployment pins these behind the platform scheduler only, not a public cron path accessible with leaked secret. The file permissions look good; watch that `CRON_SECRET` is stored only in Vercel env, not shared with devs.

### H8. `handle_new_auth_user` trigger vs `post_signup_user_roles_trigger`
Migration `067_add_post_signup_user_roles_trigger_2026_04_19.sql` introduces a trigger; migration `066_add_award_reading_points_rpc_2026_04_19.sql` and `074_bump_user_perms_version_atomic_security.sql` both touch perms. I didn't dig into the trigger source for the `handle_new_auth_user` DEFINER function. Verify it can't be exploited by a user crafting auth.users metadata (e.g. `raw_user_meta_data.role`) that the trigger then trusts.

### H9. `DM read receipts`, `notifications`, `reading_log`, `quiz_attempts` — `insert` policies missing
All have `polwithcheck = null`. `quiz_attempts` being freely insertable means any authenticated user can forge completed quiz attempts for their user_id, which feeds verity_score. Points pump. Lock to `user_id = auth.uid()`.

### H10. `revoke_role` / `grant_role` trust `p_admin_id`
Migration 086 "lock_down_admin_rpcs" exists and these functions are not EXECUTE-able to `authenticated` (locked to service_role + postgres + supabase_auth_admin), so exploit requires service_role. Good. Note these RPCs still accept `p_admin_id` as arg — a future regression that opens them up would allow anyone to write `p_admin_id` = superadmin's id into audit. Same argument structure in `apply_penalty`, `approve_expert_answer`, `approve_expert_application`, `hide_comment`, `mark_probation_complete`, `resolve_appeal`, `resolve_report`. Long-term: switch these to `auth.uid()`-derived actor.

## Medium — defense-in-depth / best practice

### M1. Rate limit RPC fails open in dev
`site/src/lib/rateLimit.js` explicitly falls open when `NODE_ENV !== 'production'`. Vercel always sets `production` on deploys, so prod is safe, but staging or preview envs that don't carry the var run unlimited. Make the gate `VERCEL_ENV === 'production'` instead of `NODE_ENV`, or include a secondary env check.

### M2. Supabase advisors surfaced 13 `function_search_path_mutable` warnings
Functions without `SET search_path` can be hijacked by search-path shadowing if the caller can inject a `public`-clashing temp schema. Affected: `get_user_category_metrics`, `update_updated_at_column`, `enforce_max_kids`, `bump_perms_global_version`, `audit_perm_change`, `guard_system_permissions`, `reject_privileged_user_updates`, `_user_is_paid`, `bookmark_collection_count_sync`, `_setting_int`, `_user_tier_or_anon`, `_user_is_moderator`. Add `SET search_path = public, pg_temp` to each. `reject_privileged_user_updates` is particularly important — it's the last-resort trigger that blocks privileged column writes.

### M3. Public storage bucket `banners` allows listing
Advisor flagged: `public.banners` bucket has a broad SELECT policy. Clients can enumerate every banner URL. Likely fine, but tighten to object-URL-only access.

### M4. `leaked_password_protection` disabled in Supabase Auth
HaveIBeenPwned check is off. Trivial enable; prevents users registering with already-compromised passwords.

### M5. `perms_global_version` is the only public table without RLS
Minor — the table only stores a version counter used to invalidate permission caches — but flip `ALTER TABLE ... ENABLE RLS` and add `SELECT USING (true)` for consistency with the rest of the schema. Today any authenticated user can also UPDATE it (full table-level grant), which means version-bump spam.

### M6. `webhook_log` INSERT policy allows unrestricted insert (`WITH CHECK true`)
Advisor flagged. Webhook routes run as service_role, so this should never be hit by anon; either REVOKE INSERT from authenticated or add a policy that only service_role can insert.

### M7. `increment_field(table_name text, row_id uuid, field_name text, amount int)` — classic SQL-injection-via-arg shape
It's DEFINER, and signatures suggest it uses dynamic SQL on `table_name` and `field_name`. I didn't pull the body, but any text-arg-into-format call here is a P1. Confirm it uses `format('UPDATE %I.%I SET %I = …', …)` with `%I`, not `%s`, and REVOKE from authenticated. Migration 056 apparently revoked `authenticated` EXECUTE per the login route comment — verify.

### M8. CORS strategy unclear
No `Access-Control-Allow-Origin` headers surfaced from the Next config or middleware. Next 14 defaults to same-origin; route handlers that accept Bearer tokens (support, delete account) specifically document this. Document the expected iOS-to-site origin behaviour and add an explicit CORS policy for `/api/*` so preview branches / subdomains don't accidentally become cross-origin to the app.

### M9. Sentry config files present but `@sentry/nextjs` handling is guarded
`next.config.js` wraps with Sentry only if the module loads. Good for green builds, but the prod config silently drops error reporting if the install is flaky. Explicitly fail the build when `process.env.VERCEL_ENV === 'production'` and Sentry fails to load.

### M10. Observability / alerting
`cronLog.js` and `observability.js` exist but I didn't verify that any of: Sentry DSN is set, PostHog is wired, or PagerDuty / Slack alerts fire on the error_logs table hitting thresholds. `/api/health` is DB-ping only (good). No `/metrics` endpoint, no uptime probe documented. For launch: confirm Sentry DSN is set in Vercel prod env and that a Sentry alert routes to a human inbox.

## Low — polish

- `X-Powered-By: Next.js` is suppressed via `poweredByHeader: false` — confirmed absent.
- `HSTS` / `X-Frame-Options` / `nosniff` / `Referrer-Policy` all present on every response. Good.
- `frame-ancestors 'none'` in CSP is redundant with `X-Frame-Options DENY` but that's fine.
- `robots.js` and `sitemap.js` exist; didn't verify contents.
- Large number of SQL migrations (91 files, numbered chronologically, dated). Good.
- `next-env.d.ts` committed — fine, it's autogenerated.
- `EXPECTED_BUNDLE_ID = 'com.veritypost.app'` hardcoded in `appleReceipt.js`. Acceptable for single-app deploy; move to env if you ever ship a second bundle.
- App Store Server Notifications v2 handler verifies the vendored Apple Root CA G3 cert, checks bundleId, accepts small clock skew, writes idempotency via webhook_log. Solid.
- Stripe webhook replays correctly guarded via `webhook_log.event_id` unique + advisory-lock-style state machine. Solid.

## Deployment readiness

- **Secret management**: Live `sk_live_` Stripe key on dev workstation (C3). Rotate immediately, switch dev to test keys. Prod secrets go through Vercel env dashboard (the `/api/health` gated detailed probe suggests this is already the model). `.env.local` is gitignored but has not been scrubbed from the local fs. Document a `.env.example` for onboarding, which already exists.
- **Environment parity**: dev `NODE_ENV` gates in `rateLimit.js` fail-open in dev, which is fine, but there is no staging env signalled. `NEXT_PUBLIC_SITE_URL` points at localhost in `.env.local`. Unknown whether a preview branch on Vercel has its own ANON_KEY / SITE_URL or whether it shares prod. Confirm preview envs do not touch prod Supabase project.
- **Migration reproducibility**: 91 numbered migrations in `01-Schema/` plus a `reset_and_rebuild_v2.sql` snapshot. Live DB has 112 / 113 public tables with RLS enabled (the 1 without RLS is `perms_global_version`). Advisors clean except for the mostly-info lints. Schema-in-repo appears to match live. Did not run a cold-apply test; recommend that in CI.
- **Observability / alerting**: Sentry wired but guarded; no confirmed DSN in env. `error_logs` table captures client-side errors via `/api/errors`. No cron alerting surfaced. `/api/health` has an authed detailed mode. Launch-day blocker: confirm Sentry receives at least one test exception in prod env and that a human inbox gets the alert.

## What I couldn't assess

- Stripe billing end-to-end on real cards; I only read the code paths.
- Apple IAP verified transactions against sandbox — the crypto looks right, but I did not run a staging transaction.
- Supabase Auth email deliverability, OAuth provider configuration, and MFA posture.
- Vercel project config (`vercel.json` shows crons only; rest of deployment settings not visible from the repo).
- iOS app code in `VerityPost/` — did not spelunk the native bundle.
- Actual prod `profile_visibility` values on real users (dev DB shows 48/48 public, which is itself the bug).
- Backup / PITR configuration on the Supabase project.
- DMCA / legal pages content (`/dmca`, `/privacy`, `/terms`, `/cookies` exist as routes but I did not read the body copy for compliance-accurate claims).

## Verdict

**Ship today: NO.**

C1 alone is a GDPR-grade personal-data breach. C2 is a wholesale spoof surface. C4 + C5 leave the authorization substrate on a knife edge. C3 is a rotate-now operational posture, not a ship-blocker by itself, but amplifies the others.

To turn this into a conditional YES (week, not month):

1. C1: add a `public_user_profiles` view with whitelisted columns; REVOKE SELECT on PII columns from `anon` / `authenticated` on `public.users`; flip default `profile_visibility` to `'private'`; migrate existing rows.
2. C2: add `p_user_id = auth.uid()` guard inside every authenticated-executable DEFINER RPC (or drop the arg); REVOKE EXECUTE from `authenticated` on the arg-spoofable list.
3. C4: REVOKE CRUD on `user_roles`, `user_permission_sets`, `roles`, `permissions`, `permission_sets`, `plans` from `authenticated`.
4. C5: lock `audit_log` / `notifications` / `reading_log` / `quiz_attempts` / `webhook_log` inserts to the row owner or service_role.
5. C3: rotate Stripe live key + Supabase service_role JWT; swap dev `.env.local` to `sk_test_`.
6. H1, H2, H3: strip `'unsafe-eval'`; nonce-CSP; clean `p_email` from `create_support_ticket`; enforce same-origin on Stripe URLs.
7. Enable HaveIBeenPwned leaked-password check.
8. Confirm Sentry receives a live test exception in Vercel prod env.

Everything else can ship as follow-ups.
