# Pre-launch master issue list — deduped

Three reviewers (R1 deploy/config, R2 user-flow, R3 security/ops) filed blind pre-launch reviews. This file collapses overlapping findings into single entries, normalizes severity to the highest reported, and spot-checks whether prior-audit work already closed items.

Spot-checks performed against: `STATE.md`, `OWNER_TO_DO.md`, `ROTATE_SECRETS.md`, `01-Schema/` migrations 005–091, the live Supabase DB (`fyiwulqphgmoqullmrfn`), dev server on :3000, Supabase advisors snapshot pulled during this pass.

---

## Counts

### Raw (as filed by each reviewer)
- **R1** — 4 C · 6 H · 7 M · 4 L  → 21 items
- **R2** — 5 C · 10 H · 11 M · 7 L → 33 items
- **R3** — 5 C · 10 H · 10 M · ~8 L → 33 items
- **Raw total:** 87 items

### After dedup
- **Critical:** 6
- **High:** 22
- **Medium:** 20
- **Low:** 11
- **Deduped total:** 59 entries

### After striking owner-TODO / already-handled items
- **Critical (code-fix, not already handled):** 3
  - Struck from C: R1-C2 env placeholders (owner confirmed Vercel has them) · R2-C1 Test: headlines (owner TODO) · R2-C3 zero seeded content (owner TODO) · R3-C3 live secrets on workstation (already tracked in `ROTATE_SECRETS.md` — owner action).
- **Critical remaining as active code blockers:** C-01 (status page fabrication), C-02 (`/billing` 404 + broken upgrade CTAs), C-03 (RLS PII leak on `public.users`).

Note: C-04 (spoofable DEFINER RPCs) and C-05 (authorization-table CRUD grants) are severity-Critical per R3 but deserve separate callouts because they overlap with ongoing round 6/7/8 lockdown work; listed below with partial-handled evidence.

---

## Critical

### [C-01] Fake hard-coded `/status` page with fabricated uptime + incidents
- **Severity:** Critical
- **Reported by:** R1
- **Where:** `site/src/app/status/page.tsx:25-37`
- **What:** Page hard-codes services array (Website 99.99%, Push "Degraded", etc.) and two fake resolved incidents dated Apr 6 + Apr 9, 2026. Publicly accessible (dev probe returns 200). Publishing invented uptime is a trust/compliance risk.
- **Already handled?:** no — file confirmed on disk with literal hard-coded arrays.
- **Owner-side or code fix:** code (either gate behind admin, wire to real signal, or remove from public nav).

### [C-02] `/billing` is a 404 and multiple money-path CTAs point at it
- **Severity:** Critical
- **Reported by:** R2
- **Where:** `site/src/components/AccountStateBanner.tsx:81,93`; `site/src/app/kids/page.tsx:90-100`; `AskAGrownUp` component default href.
- **What:** `curl -I /billing` returns 404 (confirmed). The "Resubscribe", "Resume billing", and "Kid profile / add a kid" CTAs all link here. These are the most lucrative states (frozen users about to lose features, Family plan buyers trying to add a kid). Every other upgrade link points at `/profile/settings/billing` which works.
- **Already handled?:** no — live 404 confirmed.
- **Owner-side or code fix:** code (add redirect/page at `/billing` → `/profile/settings#billing`; fix `AskAGrownUp` default href; route Family-plan-no-kid users to `/profile/kids`).

### [C-03] All `public.users` PII readable by anon via RLS + column grants
- **Severity:** Critical
- **Reported by:** R3
- **Where:** `users_select` RLS policy; `01-Schema/reset_and_rebuild_v2.sql`.
- **What:** `users_select` USING: `((id = auth.uid()) OR (profile_visibility = 'public') OR is_admin_or_above())`. Live DB: 48/48 users have `profile_visibility = 'public'` (confirmed); anon holds SELECT on the full row including `email`, `phone`, `date_of_birth`, `stripe_customer_id`, `parent_pin_hash`, `kids_pin_hash`, `last_login_ip`, `failed_login_count`, `locked_until`. Route-level fix `PUBLIC_USER_FIELDS` (`/profile/[id]`) narrows app reads but does not stop a direct PostgREST call with the anon key.
- **Already handled?:** partially — `STATE.md` "Tier A audit follow-ups" closed the `/profile/[id]` `select('*')` leak in code. The underlying RLS gap + default-public still exists, confirmed today via live DB query.
- **Owner-side or code fix:** code (migration: add `public_user_profiles` view, REVOKE column SELECT on PII, flip default `profile_visibility`, backfill rows).

### [C-04] Authenticated-executable SECURITY DEFINER RPCs accept spoofable actor args
- **Severity:** Critical
- **Reported by:** R3
- **Where:** `family_weekly_report(p_owner_id)`, `family_members(p_owner_id)`, `weekly_reading_report(p_user_id)`, `breaking_news_quota_check(p_user_id)`, `check_user_achievements(p_user_id)`, `create_support_ticket(p_user_id, p_email, …)`, `start_conversation(p_user_id, p_other_user_id)` — plus ~15 predicate helpers (`_user_freeze_allowance`, `can_user_see_discussion`, `user_article_attempts`, `user_has_dm_access`, etc.).
- **What:** All are DEFINER + EXECUTE-granted to `authenticated` (confirmed via `information_schema.routine_privileges`). Any attacker with the published anon key can pass any `p_user_id` and read/write state on behalf of another user.
- **Already handled?:** partially — migration `086_lock_down_admin_rpcs` closed the earlier round of admin actor-spoof RPCs (grant_role, revoke_role, apply_penalty, approve_expert_application, hide_comment, resolve_report, etc.), and `increment_field` was locked down by 056. The 7+ RPCs above are a NEW list R3 surfaced that is not yet covered. Verified live: `start_conversation`, `create_support_ticket`, `check_user_achievements`, `family_weekly_report`, `family_members`, `weekly_reading_report`, `breaking_news_quota_check` still hold `authenticated EXECUTE`.
- **Owner-side or code fix:** code (each RPC either drops the actor arg and uses `auth.uid()`, or adds `IF p_user_id <> auth.uid() AND NOT is_admin_or_above() THEN RAISE EXCEPTION…`, or REVOKE EXECUTE from authenticated).

### [C-05] `authenticated` role holds full CRUD on authorization tables
- **Severity:** Critical
- **Reported by:** R3
- **Where:** `user_roles`, `user_permission_sets`, `roles`, `permissions`, `permission_sets`, `plans` (confirmed via `information_schema.table_privileges`).
- **What:** RLS policies currently gate writes correctly, but table-level grants give `authenticated` INSERT/UPDATE/DELETE. One future migration that drops or loosens a write policy turns any signed-in user into an admin promotion vector.
- **Already handled?:** no — grants confirmed live. `STATE.md` Tier A follow-ups flagged this conceptually as "client-side role checks → migration pass" but no revoke migration has shipped.
- **Owner-side or code fix:** code (REVOKE INSERT/UPDATE/DELETE from `authenticated` on those tables; admin writes go through service-role API handlers which already exist).

### [C-06] `audit_log` insert policy lets any authenticated user forge records
- **Severity:** Critical
- **Reported by:** R3 (as part of C5 bundle)
- **Where:** `audit_log_insert` WITH CHECK = `(auth.role() = 'authenticated'::text)` (confirmed live).
- **What:** No check binds `actor_id` to `auth.uid()`. Any user can write arbitrary `actor_id` / `action` / `target_*` rows, poisoning the tamper-evident log and enabling frame-ups.
- **Already handled?:** no — policy body confirmed live today.
- **Owner-side or code fix:** code (WITH CHECK `actor_id = auth.uid()` or REVOKE INSERT from authenticated and funnel writes through service-role).

---

### Struck from Critical (not code fixes or already handled)

- **R1-C2 — `.env.local` placeholders.** Owner confirmed Vercel has real values for RESEND/OPENAI/APNs/APPSTORE_SHARED_SECRET/NEXT_PUBLIC_SITE_URL/Sentry DSN. Not a blocker. (Sitemap localhost concern covered separately as H-12.)
- **R2-C1 — "Test:" prefix on every headline.** Confirmed live DB: 5/5 published articles are `Test:` (confirmed). Owner-side TODO — editorial publishes real articles.
- **R2-C3 — 0 sources / 0 comments / 1 bookmark / 1 timeline.** Seed-content problem, owner-side editorial work.
- **R3-C3 — live `sk_live_` + Supabase service-role JWT in `site/.env.local`.** Already tracked in `ROTATE_SECRETS.md` with owner sign-off checkboxes. Owner-side.

---

## High

### [H-01] Signup drops display_name / terms metadata for users needing email confirm
- **Severity:** High
- **Reported by:** R1
- **Where:** `site/src/app/api/auth/signup/route.js:51`
- **What:** `users.upsert` runs on caller's Supabase client — after `signUp()` returns no session (confirm-email flow), `auth.uid()` is null and the RLS `with_check (id = auth.uid())` silently fails. DB trigger `handle_new_auth_user` compensates for row + role creation but doesn't persist display_name or terms acceptance.
- **Already handled?:** no — reviewer reports migration `067_add_post_signup_user_roles_trigger` exists but did not verify it also handles metadata. Spot-check warranted.
- **Owner-side or code fix:** code (switch post-signup writes to service client, or move into trigger).

### [H-02] OAuth callback `auth_providers` insert uses caller client
- **Severity:** High
- **Reported by:** R1
- **Where:** `site/src/app/api/auth/callback/route.js:88`
- **What:** Post-exchange session may not satisfy `auth_providers_insert` RLS; silently loses provider linkage.
- **Already handled?:** unknown — requires RLS inspection on `auth_providers`.
- **Owner-side or code fix:** code (verify RLS, switch to service client if needed).

### [H-03] `public.banners` storage bucket allows LIST
- **Severity:** High
- **Reported by:** R1 / R3 (M3)
- **Where:** Supabase advisor `public_bucket_allows_listing`, bucket `banners`.
- **What:** Broad SELECT policy on `storage.objects` for the `banners` bucket lets any caller enumerate every file. Object URL access does not need this.
- **Already handled?:** no — confirmed in current advisor snapshot.
- **Owner-side or code fix:** code (tighten SELECT policy to object-URL-only).

### [H-04] Leaked-password protection (HIBP) disabled in Supabase Auth
- **Severity:** High
- **Reported by:** R1 / R3 (M4)
- **Where:** Supabase Auth config.
- **What:** HaveIBeenPwned check is off. `lib/password.js` accepts long-but-common passwords.
- **Already handled?:** no — confirmed in current advisor snapshot.
- **Owner-side or code fix:** owner (single dashboard toggle; Authentication → Providers → Email settings).

### [H-05] CSP `connect-src` does not include Sentry; CSP also permits `unsafe-inline`/`unsafe-eval` on `script-src`
- **Severity:** High (severity raised by R3 on script-src; R1 Medium on connect-src)
- **Reported by:** R1 (M) / R3 (H2)
- **Where:** `site/next.config.js:10-16`.
- **What:** (a) Once Sentry DSN is enabled, ingest requests to `*.sentry.io` will be blocked — zero client-side telemetry. (b) `'unsafe-inline' 'unsafe-eval'` on `script-src` means any reflected-XSS on user-controlled fields (display_name, bio, comments, mentions) escalates straight to JS exec.
- **Already handled?:** no.
- **Owner-side or code fix:** code (switch to nonce-based CSP; add `https://*.ingest.sentry.io` to connect-src; drop `'unsafe-eval'`).

### [H-06] Unvalidated Stripe `success_url` / `cancel_url` from client
- **Severity:** High (R3 H3); R1 Medium
- **Reported by:** R1 (M) / R3 (H3)
- **Where:** `site/src/app/api/stripe/checkout/route.js:14,38-39` (confirmed live).
- **What:** Both URLs are pulled from the request body and passed straight to Stripe. An attacker can craft a checkout link that post-pays to `evil.com/looks-like-veritypost`, exiting Stripe with the victim's session referrer.
- **Already handled?:** no — `STATE.md` Tier S audit flagged REPORT-ONLY but no fix landed.
- **Owner-side or code fix:** code (drop the body-supplied params; derive from `request.nextUrl.origin`).

### [H-07] Auth-check helpers are EXECUTE-able by `anon`
- **Severity:** High
- **Reported by:** R3 (H5)
- **Where:** `is_admin_or_above`, `is_editor_or_above`, `is_mod_or_above`, `has_permission`, `my_permission_keys`, etc. (live privileges confirm anon EXECUTE).
- **What:** Individually harmless (they key off `auth.uid()`), but they feed RLS subqueries — any regression that returns true for anon is catastrophic. Lock to `authenticated` only.
- **Already handled?:** no — confirmed live.
- **Owner-side or code fix:** code (REVOKE EXECUTE from anon, GRANT to authenticated).

### [H-08] Stripe webhook race on `stripe_customer_id` attachment
- **Severity:** High
- **Reported by:** R3 (H6)
- **Where:** `handleCheckoutCompleted` in the Stripe webhook handler.
- **What:** The final `update users set stripe_customer_id = customerId` is not gated by a `stripe_customer_id IS NULL` filter in SQL — it relies on the JS read. Concurrent webhooks (first-delivery + replay) can both write.
- **Already handled?:** no.
- **Owner-side or code fix:** code (`.is('stripe_customer_id', null)` on the update so the second writer no-ops).

### [H-09] `/messages` free-user silent redirect to billing (no explanation)
- **Severity:** High
- **Reported by:** R2
- **Where:** `site/src/app/messages/page.tsx:162`.
- **What:** Free users tapping Messages are bounced to `/profile/settings/billing` with no regwall copy. Contrast with the friendly overlay used on `/story/[slug]`.
- **Already handled?:** no.
- **Owner-side or code fix:** code (replace with upgrade-prompt overlay matching regwall pattern).

### [H-10] `/profile/settings/billing` is a client-side redirect stub — multi-hop flash
- **Severity:** High
- **Reported by:** R2
- **Where:** `/profile/settings/billing/page.*`; 15 upgrade CTAs across 12 files.
- **What:** Every upgrade click: login check → stub component mounts → `router.replace('/profile/settings#billing')`. Visible flash and extra hop.
- **Already handled?:** no.
- **Owner-side or code fix:** code (server redirect or direct-link all 15 callers).

### [H-11] Anon footer "Contact" link 302s to `/login` (not a public contact form)
- **Severity:** High
- **Reported by:** R2
- **Where:** Footer link to `/profile/contact` (confirmed 302).
- **What:** App-Store review liability — support contact should be publicly reachable without a login wall.
- **Already handled?:** no — confirmed live 302.
- **Owner-side or code fix:** code (public `/contact` page or route `/profile/contact` through middleware allowlist for logged-out users).

### [H-12] Sitemap / robots.txt risk leaking `localhost:3000` as canonical
- **Severity:** High
- **Reported by:** R1
- **Where:** `site/src/app/sitemap.*`, `robots.*` derived from `NEXT_PUBLIC_SITE_URL`.
- **What:** If Vercel env does not override `NEXT_PUBLIC_SITE_URL`, Google indexes `http://localhost:3000/...` on deploy. Also — sitemap enumerates only `/` and `/browse`, missing articles and categories.
- **Already handled?:** partially — owner confirmed Vercel env overrides placeholders (see struck C-02). Still worth curl-checking `/sitemap.xml` on the staging domain pre-cutover, and the missing-article-URLs gap is real regardless.
- **Owner-side or code fix:** code + owner-verify (ensure NEXT_PUBLIC_SITE_URL is set in Vercel prod; enumerate articles in sitemap).

### [H-13] Interstitial copy says "unlock quizzes" on signup (inaccurate)
- **Severity:** High (R2 High bucket; severity preserved)
- **Reported by:** R2
- **Where:** `site/src/components/Interstitial.tsx:80`.
- **What:** "Sign up to save your streak, unlock quizzes, and comment on articles." Quizzes don't unlock at signup — a free account's quiz unlocks comments. Confusing.
- **Already handled?:** no.
- **Owner-side or code fix:** code (copy fix).

### [H-14] Home "Verify your email to search" banner wired for a caller that no longer exists
- **Severity:** High
- **Reported by:** R2
- **Where:** `site/src/app/page.tsx:491-498`.
- **What:** Comment confirms the sticky home search moved to NavWrapper; banner + `searchVerifyPrompt` state remain. Dead UI. Separately, top-nav search icon is gated on `canSearch && path==='/'`, so a verified signed-in user on `/story/[slug]` can't reach search from the nav.
- **Already handled?:** no.
- **Owner-side or code fix:** code.

### [H-15] Quiz "View plans" CTA after 2nd failure has no alternate path
- **Severity:** High
- **Reported by:** R2
- **Where:** `site/src/components/ArticleQuiz.tsx:318`.
- **What:** User who fails both attempts gets a paywall with no hint that quizzes are per-article and trying another works. Dead-end.
- **Already handled?:** no.
- **Owner-side or code fix:** code (copy + secondary CTA).

### [H-16] Story-page tabs (Article/Timeline/Discussion) show empty/locked states confusingly on mobile
- **Severity:** High (demoted from R2 Medium for mobile-first risk)
- **Reported by:** R2
- **Where:** `site/src/app/story/[slug]/page.*`.
- **What:** Discussion tab renders `null` for unverified-no-quiz users. Tap does nothing visible. Either hide the tab or show a "Take the quiz first" state.
- **Already handled?:** no.
- **Owner-side or code fix:** code.

### [H-17] `/profile/settings#billing` fragile anchor target
- **Severity:** High (flow-impact)
- **Reported by:** R2
- **Where:** `/profile/settings/page.*` (~3000 lines, 4 TODOs).
- **What:** Every upgrade CTA lands on a scroll-anchor inside a large single-page settings view. Fragile as the page evolves.
- **Already handled?:** no.
- **Owner-side or code fix:** code (split the page or harden the anchor).

### [H-18] `<title>` never updates past root on `/story/[slug]`
- **Severity:** High
- **Reported by:** R2 (M; promoted — SEO-core)
- **Where:** Story page metadata.
- **What:** Tab + OG share both show "Verity Post — Read. Prove it. Discuss." forever.
- **Already handled?:** no.
- **Owner-side or code fix:** code (`generateMetadata` in story route).

### [H-19] `rls_policy_always_true` on `access_requests_insert` (spam vector)
- **Severity:** High (R1 High; R3 M implicit)
- **Reported by:** R1
- **Where:** Supabase advisor `rls_policy_always_true`, `access_requests`.
- **What:** Anon can flood access-requests table; no rate-limit layer confirmed.
- **Already handled?:** no — advisor still flags it. (The five other `_always_true` hits — ad_impressions, analytics_events, rate_limit_events, user_sessions, webhook_log — are intentional collector tables; access_requests is different.)
- **Owner-side or code fix:** code (bind insert to rate-limiter on the API route, or add a `captcha_token` check, or gate by IP rate-limit).

### [H-20] `perms_global_version` table has RLS disabled and is UPDATE-granted to authenticated
- **Severity:** High (R3 M5; R1 H — upgraded on live confirmation)
- **Reported by:** R1 / R3
- **Where:** live DB: `pg_class.relrowsecurity=false` on `perms_global_version`; table-level UPDATE grant to `authenticated`.
- **What:** Table stores the perm-cache version counter. Any authenticated user can spam version bumps, forcing global permission-cache invalidation = DoS-shaped load on the auth substrate.
- **Already handled?:** no — confirmed live.
- **Owner-side or code fix:** code (REVOKE UPDATE from authenticated; funnel bumps through the service-role `bump_perms_global_version` RPC which already exists).

### [H-21] Cron endpoints return useful data and rely on shared secret; verify Vercel-only access
- **Severity:** High
- **Reported by:** R3 (H7)
- **Where:** `site/src/app/api/cron/*`.
- **What:** Routes accept GET/POST, gated only by `Authorization: Bearer <CRON_SECRET>`. Returns `frozen_count` etc. If the secret leaks or is grepped from a dev dump, endpoints are callable from anywhere.
- **Already handled?:** partially — CRON_SECRET rotation is in `ROTATE_SECRETS.md`. No IP/path-binding on the routes themselves.
- **Owner-side or code fix:** code + owner (keep secret rotation cadence; optionally bind route to Vercel-cron-only header `x-vercel-cron` check).

### [H-22] `handle_new_auth_user` trigger trusts auth.user metadata (role-escalation vector if raw_user_meta_data.role is honored)
- **Severity:** High (R3 H8 — flagged as unread; worth verifying)
- **Reported by:** R3
- **Where:** `handle_new_auth_user` DEFINER function.
- **What:** R3 didn't read the body; wants verification that a user crafting `raw_user_meta_data.role = 'admin'` at signup can't be trusted by the trigger.
- **Already handled?:** unknown — migration 067 + `065_restrict_users_table_privileged_updates` may cover this. Needs spot-check of function body.
- **Owner-side or code fix:** code (read + spot-fix if needed).

---

## Medium

### [M-01] 13 public functions have mutable `search_path`
- **Severity:** Medium
- **Reported by:** R1 / R3 (M2)
- **Where:** Supabase advisor `function_search_path_mutable` (13 entries confirmed): `get_user_category_metrics`, `update_updated_at_column`, `enforce_max_kids`, `bump_perms_global_version`, `audit_perm_change`, `guard_system_permissions`, `reject_privileged_user_updates`, `_user_is_paid`, `bookmark_collection_count_sync`, `_setting_int`, `_user_tier_or_anon`, `_user_is_moderator`, plus one more.
- **What:** `reject_privileged_user_updates` is the last-resort trigger that blocks privileged column writes; search-path shadowing here is the highest-impact.
- **Already handled?:** no — confirmed in live advisor snapshot.
- **Owner-side or code fix:** code (`ALTER FUNCTION ... SET search_path = public, pg_temp`).

### [M-02] Home page fully client-rendered (`'use client'`); SEO + first-paint hit
- **Severity:** Medium
- **Reported by:** R1
- **Where:** `site/src/app/page.tsx`.
- **What:** SSR HTML is the 404 fallback until hydrate. Robots see empty page.
- **Already handled?:** no.
- **Owner-side or code fix:** code (move initial story fetch to server component).

### [M-03] Health-check secret compare is non-constant-time
- **Severity:** Medium
- **Reported by:** R1
- **Where:** `site/src/app/api/health/route.js:31`.
- **What:** `provided === secret` leaks only env-presence booleans but the rest of the codebase already uses `timingSafeEqual` (cronAuth.js). Mirror for consistency.
- **Already handled?:** no.
- **Owner-side or code fix:** code.

### [M-04] Dual-cache permission client (Wave 1 / Wave 2 coexist)
- **Severity:** Medium
- **Reported by:** R1
- **Where:** `site/src/lib/permissions.js`.
- **What:** Old section-scoped cache and new full-resolver cache coexist — behavior depends on which loads first.
- **Already handled?:** no.
- **Owner-side or code fix:** code (collapse to one).

### [M-05] Home `FALLBACK_CATEGORIES` merges hardcoded list with DB results
- **Severity:** Medium
- **Reported by:** R1 / R2
- **Where:** `site/src/app/page.tsx:79-121`.
- **What:** DB has 69 categories; fallback probably never fires, but removing/renaming a category still surfaces stale pill text.
- **Already handled?:** no.
- **Owner-side or code fix:** code (remove or flag-gate).

### [M-06] Kid / adult category slug-prefix leak risk
- **Severity:** Medium
- **Reported by:** R2
- **Where:** `site/src/app/page.tsx:273-276`.
- **What:** Adult feed strips `kids-%` slugs, but "Science (Kids)" etc. may be authored without the prefix, leaking into adult surfaces.
- **Already handled?:** no.
- **Owner-side or code fix:** code (add a `kids_only boolean` column or a safer filter).

### [M-07] Kid story page dead-ends on paused profile (stale localStorage)
- **Severity:** Medium
- **Reported by:** R2
- **Where:** `/kids/page.tsx`, kid story route.
- **What:** `vp_active_kid_id` survives after profile is paused/removed; user sees a flicker of kid-branded UI before bounce.
- **Already handled?:** no.
- **Owner-side or code fix:** code (validate kid profile on mount of every kid-mode surface).

### [M-08] Duplicate "Quiz passed!" celebration on kid story
- **Severity:** Medium
- **Reported by:** R2
- **Where:** `site/src/components/ArticleQuiz.tsx:161-177` + `QuizPassCelebration`.
- **What:** Two green celebration boxes render stacked for kid passes.
- **Already handled?:** no.
- **Owner-side or code fix:** code.

### [M-09] "Reading complete" beacon can fire on tab-away for long articles
- **Severity:** Medium
- **Reported by:** R2
- **Where:** Story page reading-beacon.
- **What:** 30s-or-80%-scroll beacon fires even if the user tabs away for 30s. Inflates verity_score. Low-stakes gaming vector.
- **Already handled?:** no.
- **Owner-side or code fix:** code (require `document.visibilityState === 'visible'` in the elapsed-time branch).

### [M-10] Anon homepage has no above-the-fold "Sign up" CTA
- **Severity:** Medium
- **Reported by:** R2
- **Where:** Top nav + home hero.
- **What:** Only "Sign in" (subtle grey) in the top bar. Competitors expose both.
- **Already handled?:** no.
- **Owner-side or code fix:** code (add Sign up CTA).

### [M-11] Bookmark cap copy doubles (inline banner + toast)
- **Severity:** Medium
- **Reported by:** R2
- **Where:** story page line ~735, bookmark-toggle toast.
- **What:** Inline "You've used 10 of 10" AND toast fire together. Mobile wraps awkwardly.
- **Already handled?:** no.
- **Owner-side or code fix:** code (pick one channel).

### [M-12] Regwall dismissal sessionStorage doesn't clear after signup in other tab
- **Severity:** Medium
- **Reported by:** R2
- **Where:** Regwall overlay.
- **What:** User signs up in tab B, returns to tab A, still sees dismissed-once state.
- **Already handled?:** no.
- **Owner-side or code fix:** code (clear on storage event / on mount if auth).

### [M-13] Story page uses CSS vars outside `.vp-dark` — theme/a11y fallback risk
- **Severity:** Medium
- **Reported by:** R2
- **Where:** Story page `var(--wrong)`, `var(--accent)`, `var(--amber)`.
- **What:** If var chain breaks, "Breaking" / "Developing" badges fall back to transparent/inherited. Needs DOM spot-check.
- **Already handled?:** unknown.
- **Owner-side or code fix:** code (confirm vars resolve; add fallback in the `color` property).

### [M-14] Create-support-ticket RPC stores caller-supplied email
- **Severity:** Medium (dependent on C-04 fix)
- **Reported by:** R3 (H1)
- **Where:** `create_support_ticket(p_user_id, p_email, ...)`.
- **What:** Even with C-04's `p_user_id = auth.uid()` guard, `p_email` is stored on the ticket row. If staff reply via that email, it goes to the attacker. Drop `p_email` from the signature; look it up from `users`.
- **Already handled?:** no — function body confirmed today.
- **Owner-side or code fix:** code.

### [M-15] Rate-limit RPC fails open when `NODE_ENV !== 'production'`
- **Severity:** Medium
- **Reported by:** R3 (M1)
- **Where:** `site/src/lib/rateLimit.js`.
- **What:** Vercel prod deployments are fine, but a preview/staging env that doesn't carry `NODE_ENV=production` runs unlimited.
- **Already handled?:** no.
- **Owner-side or code fix:** code (gate on `VERCEL_ENV === 'production' || NODE_ENV === 'production'`).

### [M-16] `webhook_log_insert` policy `WITH CHECK true`
- **Severity:** Medium
- **Reported by:** R3 (M6)
- **Where:** `webhook_log_insert` (confirmed live).
- **What:** Webhook routes run as service_role; authenticated should not be able to insert. Either REVOKE or tighten.
- **Already handled?:** no.
- **Owner-side or code fix:** code.

### [M-17] CORS strategy undocumented on `/api/*`
- **Severity:** Medium
- **Reported by:** R3 (M8)
- **Where:** `site/next.config.js`, middleware.
- **What:** No explicit `Access-Control-Allow-Origin` — Next defaults to same-origin but preview branches / iOS cross-origin behavior needs a declared policy.
- **Already handled?:** no.
- **Owner-side or code fix:** code.

### [M-18] Sentry wrap silently no-ops when the module fails to load
- **Severity:** Medium
- **Reported by:** R3 (M9)
- **Where:** `site/next.config.js` Sentry wrap.
- **What:** `next.config.js` wraps with Sentry only if module loads; prod with a flaky install drops error reporting silently.
- **Already handled?:** no.
- **Owner-side or code fix:** code (fail the build when `VERCEL_ENV === 'production'` and Sentry fails to load).

### [M-19] No `/metrics` endpoint or documented uptime probe; Sentry DSN not confirmed in Vercel env
- **Severity:** Medium
- **Reported by:** R3 (M10)
- **Where:** ops / Vercel env.
- **What:** `/api/health` is DB-ping only. No verification Sentry alerts land in a human inbox.
- **Already handled?:** partially — `OWNER_TO_DO.md` "Pass 99 close-out" has `Sentry DSN configuration in Vercel env` as unchecked owner task.
- **Owner-side or code fix:** owner (configure DSN + test-exception fire).

### [M-20] `/profile/contact` gated behind login (covered by H-11) — also affects adult `/kids/page.tsx` route-mismatch and `AskAGrownUp` default href
- **Severity:** Medium (bundle)
- **Reported by:** R2
- **Where:** multiple callers.
- **What:** Related to C-02. `AskAGrownUp` hardcodes `/billing` as the default upsell; fixing one caller isn't enough — fix the default.
- **Already handled?:** no.
- **Owner-side or code fix:** code (component default href).

---

## Low

### [L-01] `sitemap.xml` enumerates only `/` and `/browse`
- **Severity:** Low
- **Reported by:** R1
- **Where:** `site/src/app/sitemap.*`.
- **Already handled?:** no.
- **Owner-side or code fix:** code.

### [L-02] Root layout `<script>` + `'unsafe-inline'` CSP — consider nonce CSP
- **Severity:** Low (R1) — subsumed by H-05 for `unsafe-eval`.
- **Reported by:** R1
- **Where:** Root layout + `next.config.js`.
- **Already handled?:** no.
- **Owner-side or code fix:** code.

### [L-03] `site/jsconfig.json` and `site/tsconfig.json` both exist
- **Severity:** Low
- **Reported by:** R1
- **Where:** `site/`.
- **Already handled?:** no.
- **Owner-side or code fix:** code (pick one).

### [L-04] Bookmark cap copy uses curly apostrophe unique in the codebase
- **Severity:** Low
- **Reported by:** R2
- **Where:** Story page.
- **Owner-side or code fix:** code (polish).

### [L-05] Welcome carousel copy slightly lecture-y
- **Severity:** Low
- **Reported by:** R2
- **Owner-side or code fix:** copy (owner or editor).

### [L-06] Home "All" pill + kid-category order quirk in admin view
- **Severity:** Low
- **Reported by:** R2
- **Owner-side or code fix:** code (admin-only sort).

### [L-07] Story Share button doesn't use `navigator.share`
- **Severity:** Low
- **Reported by:** R2
- **Where:** Story page share button.
- **Owner-side or code fix:** code.

### [L-08] `CommentComposer` silently drops mentions if permission denied
- **Severity:** Low
- **Reported by:** R2
- **Where:** `site/src/components/CommentComposer.tsx`.
- **Owner-side or code fix:** code (surface a "mentions unavailable on your plan" hint).

### [L-09] Forgot password / reset / verify email pages render bare "loading" with no skeleton
- **Severity:** Low
- **Reported by:** R2
- **Owner-side or code fix:** code.

### [L-10] `Interstitial` signup variant CTA drops `next=` param
- **Severity:** Low
- **Reported by:** R2
- **Where:** `site/src/components/Interstitial.tsx`.
- **Owner-side or code fix:** code.

### [L-11] `EXPECTED_BUNDLE_ID` hardcoded in `appleReceipt.js`
- **Severity:** Low
- **Reported by:** R3
- **Where:** `site/src/lib/appleReceipt.js`.
- **Owner-side or code fix:** code (move to env if ever shipping a second bundle).

---

## What couldn't be assessed

- Vercel production env parity (confirmed by owner).
- Stripe webhook / Apple IAP end-to-end with real payloads.
- App Store Connect / TestFlight state.
- Load characteristics and RLS performance under contention.
- Backup/PITR configuration on Supabase.
- Email template copy compliance.
- iOS app runtime (code inspection only).

## Verdict across reviewers

All three said "ship: NO". Top shared themes:
- Code-layer critical blockers live in the RLS layer (C-03, C-04, C-05, C-06) and in `/billing` 404s (C-02), plus the fabricated `/status` page (C-01).
- User-flow blockers are concentrated on the money path (C-02, H-09, H-10, H-17) and the content shell (editorial owner-side).
- Config / deploy gaps (Sentry, CSP, sitemap canonical, Stripe url guards, leaked-pw) are straightforward and clustered in two files.
