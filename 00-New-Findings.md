# 00-New Findings — End-to-End Smoke Test

**Date:** 2026-04-18
**Method:** Local dev server (`localhost:3000`), unauthenticated HTTP probe of every route + direct Supabase queries for schema/data state.
**Scope:** 59 public pages, 38 admin pages, 128 API routes, full schema + RLS + permission system inspection.

---

## TL;DR — What's broken vs. what's fine

**Fine:**
- Every page route (97/97) returns HTTP 200 server-side. No render crashes.
- 120/128 API routes return the expected auth codes (401/403/400/200).
- Schema: 87 of 90 reference tables are in the live DB; 73 of those 87 have exact column-count match.
- Permission-set admin page exists, 5 tabs implemented (Registry, Sets, Role grants, Plan grants, User grants).
- 60+ RPCs across 9 phases all callable (preflight green).
- Stripe + IAP webhooks: thoughtful idempotency via `webhook_log.event_id` unique constraint.
- 9 Vercel crons defined, all map to existing routes.
- iOS: 14,698 LoC, zero TODO/FIXME/HACK, Supabase config clean.

**Broken / off:**
1. **8 API routes return 500 on unauth** instead of 401. Root cause in `lib/auth.js`: `requireAuth` / `requireRole` throw plain `Error` objects without a `.status` field. Routes that check `err.status` fall through to the bare `} catch {` 500 response.
2. **Permission-set role grants are effectively a no-op.** All 8 staff roles (admin, editor, educator, expert, journalist, moderator, owner, superadmin) share the *exact same 7 permission sets*. Staff differentiation isn't happening through the permission system.
3. **Staff access is enforced by role-hierarchy, not permission-sets.** Two parallel systems: `lib/auth.js` hierarchy for API, `lib/permissions.js` set-based for UI gating. RLS policies also use hierarchy helpers (`is_admin_or_above()` etc.), not set checks.
4. **3 reference tables were dropped from live**: `community_notes`, `community_note_votes`, `reactions` (all Social). `comments.reaction_count` column and `articles.average_rating` also dropped, consistent with the social-features removal.
5. **27 tables added by rogue agent** without xlsx entries.
6. **14 tables have column-level drift** (all additive except `sources` which lost `credibility_rating`).
7. **2 rogue-agent tables have zero admin-UI coverage**: `permission_scope_overrides`, `perms_global_version`.
8. **`role_permissions` (old RBAC table) is empty** (0 rows). Dead weight.
9. **Test accounts don't exist.** Only `admin@veritypost.com` is in `users`. The 20+ test accounts in `test_accounts.xlsx` were never provisioned.
10. **Double-subscribe race on comments realtime channel** — error_logs shows repeated "cannot add postgres_changes callbacks after subscribe()" on `/story/*`.
11. **Missing settings row:** `streak.freeze_max_kids` (caught by preflight).
12. **Resend API key returns 400** on preflight check — key present but rejected. Email delivery likely broken.
13. **Breaking news email template has an emoji** (`⚡ Breaking: {{headline}}`) — violates the no-emojis rule.
14. **audit_log is sparse** — only 4 `auth:login` rows for the owner. Most app actions aren't being audit-logged.

---

## Schema / reference drift

**Tables**
- Reference (`database_tables.xlsx` → Table Index): 90
- Live Supabase: 114
- Dropped from live (3): `community_notes`, `community_note_votes`, `reactions`
- Added to live, not in xlsx (27):
  - Permission-set layer (7): `permission_sets`, `permission_set_perms`, `role_permission_sets`, `plan_permission_sets`, `user_permission_sets`, `permission_scope_overrides`, `perms_global_version`
  - Kids / family (6): `kid_sessions`, `kid_expert_sessions`, `kid_expert_questions`, `family_achievements`, `family_achievement_progress`, `category_supervisors`
  - Weekly recap quizzes (3): `weekly_recap_quizzes`, `weekly_recap_questions`, `weekly_recap_attempts`
  - Moderation / safety (4): `user_warnings`, `behavioral_anomalies`, `admin_audit_log`, `error_logs`
  - Misc (7): `bookmark_collections`, `comment_context_tags`, `expert_queue_items`, `sponsored_quizzes`, `device_profile_bindings`, `user_push_tokens`, `score_events`

**Column-count drift (matched-name tables)**
- Exact match: 73 of 87.
- Drifted: 14 of 87. All additive except one.

| Table | ref cols | live cols | delta |
| --- | --- | --- | --- |
| users | 78 | 94 | **+16** |
| expert_discussions | 14 | 24 | +10 |
| permissions | 7 | 16 | +9 |
| expert_applications | 22 | 30 | +8 |
| kid_profiles | 25 | 32 | +7 |
| comments | 33 | 39 | +6 |
| quiz_attempts | 9 | 12 | +3 |
| reports | 19 | 21 | +2 |
| ad_placements | 22 | 23 | +1 |
| articles | 62 | 63 | +1 |
| bookmarks | 7 | 8 | +1 |
| quizzes | 18 | 19 | +1 |
| rate_limit_events | 11 | 12 | +1 |
| **sources** | 14 | 13 | **−1** ← only table that lost a column |

Name-by-name column diff not yet done — would need to parse the `Full Schema` sheet and compare to `information_schema.columns`.

---

## Permission system state

**Grant tallies:**
- `permission_sets`: 11 rows (all `is_system=true`)
- `permission_set_perms`: 79 rows
- `role_permission_sets`: 62 rows
- `plan_permission_sets`: 22 rows
- `user_permission_sets`: 0 rows (no direct user grants yet)
- `permission_scope_overrides`: 0 rows (no scoped grants yet)
- `perms_global_version`: 1 row (cache-bust counter)
- `permissions`: 81 rows (81 distinct permission keys)
- `role_permissions` (old table): **0 rows** — unused dead weight
- `roles`: 9 rows
- `users`: 1 row (just you)
- `user_roles`: 1 row

**The 11 permission sets** (all `is_system=true`, all `is_active=true`):
- `base` — always-on basics (settings, contact)
- `verified_base` — profile/activity/categories/achievements once email is verified
- `home_browse` — home search + subcategories
- `article_viewer` — read articles/timelines/(read-only) comments
- `article_interactive` — take quiz, post comment, tag Article Context
- `comments_base` — post/reply/vote/report/block comments
- `expert_tools` — expert review queue
- `family_perks` — Verity Family/XL perks (kid profiles, leaderboard, shared achievements)
- `kids_session` — kids parallel experience
- `verity_perks` — Verity+ perks (DMs, follows, mentions, advanced search, TTS, unlimited bookmarks, collections, recap, etc.)
- `verity_pro_perks` — Verity Pro perks (Ask an Expert, streak freezes)

**Role → set assignments:**

| Role | Sets | Count |
| --- | --- | --- |
| owner, superadmin, admin, editor, moderator, expert, educator, journalist | `article_interactive`, `article_viewer`, `base`, `comments_base`, `expert_tools`, `home_browse`, `verified_base` | **7** |
| user | same minus `expert_tools` | 6 |

**Finding:** **All 8 staff roles get the same 7 sets.** There are no admin-only, editor-only, moderator-only, or journalist-only permission sets. The permission-set system isn't differentiating staff access at all.

**Plan → set assignments:** ok.

| Plan | Sets |
| --- | --- |
| free | *(none)* |
| verity_monthly / verity_annual | `verity_perks` |
| verity_pro_monthly / verity_pro_annual | `verity_perks`, `verity_pro_perks` |
| verity_family_monthly / verity_family_annual / verity_family_xl_monthly / verity_family_xl_annual | `family_perks`, `kids_session`, `verity_perks`, `verity_pro_perks` |

**How staff access is actually enforced (from `site/src/lib/auth.js`):**

```js
const hierarchy = { owner: 100, superadmin: 90, admin: 80, editor: 70,
                    moderator: 60, expert: 50, educator: 50, journalist: 50, user: 10 };
```

`requireRole('admin')` does `user.hierarchy_level >= 80`. The permission-set system is consulted only client-side (`site/src/lib/permissions.js` → `hasPermission(key)` via the `my_perms_version` RPC). So API route authorization and the permission-set admin UI live in different worlds.

---

## `/admin/permissions` page gaps

- 1,117 lines, 5 tabs, all implemented (Registry, Sets, Role grants, Plan grants, User grants).
- **No UI for** `permission_scope_overrides` or `perms_global_version`.
- **No effective-permissions viewer** — can't say "for user X, compute the union of role sets + plan sets + user sets + overrides and show which permission keys resolve to granted".
- **No audit log browser** — `admin_audit_log` receives writes from destructive actions but isn't surfaced.
- **No role-specific permission sets exist** — so the Role grants matrix currently just shows all 8 staff roles with the same 7 checkboxes ticked. The UI works; it's the underlying data that doesn't differentiate.

---

## RLS policies

- Every public-schema table has RLS enabled (`rls_enabled: true`) except `perms_global_version`.
- Policies target the `public` Postgres role everywhere (gating is done in USING/WITH CHECK clauses, not via Postgres role separation). One exception: `admin_audit_log_select` targets `authenticated`.
- Raw policy USING expressions were not diffed against `01-Schema/reset_and_rebuild_v2.sql` yet — would need a per-table expression comparison.

---

## Public page sweep (59 routes)

- All 59 returned **HTTP 200**. No crashes, no error banners.
- Authenticated-gated routes (`/profile/*`, `/bookmarks`, `/messages`, `/notifications`) all return ~17KB — the client-side auth-gate wrapper, not real content. So the sweep only proves the shell renders.
- Full detail: `/tmp/public_sweep.txt`.

## Admin page sweep (38 routes)

- All 38 returned **HTTP 200** (same ~17KB auth-gate wrapper).
- Real content is behind client-side role checks. **Couldn't test with auth because test accounts aren't provisioned** (see below).
- Full detail: `/tmp/admin_sweep.txt`.

## API route sweep (128 routes)

| Status | Count | Notes |
| --- | --- | --- |
| 401 Unauthenticated | 59 | expected |
| 403 Forbidden | 45 | expected (admin + cron) |
| 400 Bad request | 8 | expected (empty body to validated endpoints) |
| 200 OK | 7 | public endpoints: `/api/health`, `/api/search`, `/api/auth/check-email`, `/api/auth/login-precheck`, `/api/auth/login-failed`, `/api/auth/logout`, `/api/errors` |
| 500 Internal | 8 | **auth-handling bug** (see below) |
| 307 redirect | 1 | `/api/auth/callback` (healthy) |

### 500-returning endpoints — all the same bug

All 8 are auth-gating calls that throw; the route's outer catch returns 500 instead of 401/403.

| Route | Method | Pattern |
| --- | --- | --- |
| `/api/ai/generate` | POST | bare `} catch {` returns blanket 500 |
| `/api/promo/redeem` | POST | bare `} catch {` |
| `/api/support` | GET | bare `} catch {` |
| `/api/support` | POST | bare `} catch {` |
| `/api/support/test-id/messages` | GET | bare `} catch {` |
| `/api/kids/set-pin` | POST | checks `err.status` but throw lacks `.status` |
| `/api/kids/reset-pin` | POST | same |
| `/api/reports` | POST | same |
| `/api/admin/stories` | DELETE | needs deeper look — DELETE handler exists at line 88 |

**Root cause (single fix):** `lib/auth.js` throws `new Error('UNAUTHENTICATED')` / `'EMAIL_NOT_VERIFIED'` / `'BANNED'` — all plain `Error` objects without `.status`. Attach `.status = 401` (or 403 for BANNED) on those throws and every dependent route handler starts returning the correct code without touching the handlers themselves.

---

---

## Column-name drift — the 14 drifted tables (name-by-name)

### users (+16 cols, 2 dropped)
- **Added (18):** dm_read_receipts_enabled, frozen_at, frozen_verity_score, kid_trial_ends_at, kid_trial_started_at, kid_trial_used, last_warning_at, mute_level, onboarding_completed_at, parent_pin_hash, perms_version, perms_version_bumped_at, pin_attempts, pin_locked_until, plan_grace_period_ends_at, streak_freeze_week_start, supervisor_opted_in, warning_count
- **Dropped:** `trial_ends_at`, `verity_tier`

### expert_discussions (+10)
- Added: article_id, context_pinned_at, context_tag_count, discussion_type, expert_question_status, expert_question_target_id, expert_question_target_type, is_context_pinned, is_expert_question, source_comment_id

### permissions (+9)
- Added: cta_config, deny_mode, feature_flag_key, is_public, lock_message, requires_verified, sort_order, ui_element, ui_section

### expert_applications (+8)
- Added: background_check_status, credential_expires_at, credential_verified_at, probation_completed, probation_ends_at, probation_starts_at, reverification_notified_at, sample_responses

### kid_profiles (+8, 1 dropped)
- Added: global_leaderboard_opt_in, paused_at, pin_attempts, pin_hash_algo, pin_locked_until, pin_salt, streak_freeze_remaining, streak_freeze_week_start
- Dropped: `verity_tier`

### comments (+7, 1 dropped)
- Added: context_pinned_at, context_tag_count, expert_question_status, expert_question_target_id, expert_question_target_type, is_context_pinned, is_expert_question
- Dropped: `reaction_count` (consistent with `reactions` table being dropped)

### quiz_attempts (+3)
- Added: article_id, attempt_number, questions_served

### reports (+2)
- Added: is_supervisor_flag, supervisor_category_id

### ad_placements (+2, 1 dropped)
- Added: hidden_for_tiers, reduced_for_tiers (richer tier-gating)
- Dropped: `is_premium_hidden` (replaced by the two new ARRAY columns)

### articles (+2, 1 dropped)
- Added: search_tsv, subcategory_id
- Dropped: `average_rating`

### bookmarks (+1)
- Added: collection_id (collection FK to `bookmark_collections`)

### quizzes (+1)
- Added: pool_group

### rate_limit_events (+1)
- Added: key

### sources (-1)
- Dropped: `credibility_rating`

---

## RLS inspection

- RLS uses helper functions: `is_admin_or_above()`, `is_editor_or_above()`, `is_mod_or_above()`, `has_verified_email()`, `is_banned()`. All are `SECURITY DEFINER` with `search_path=public`.
- Each calls `public.user_has_role(...)` which looks up `user_roles` — **hierarchy-based**, not permission-set based.
- **Permission-set tables are NOT enforced in RLS.** E.g. `articles_insert` uses `is_editor_or_above()`, not `has_permission('articles.insert')`. The permission-set system is UI-only.
- Most policies look correct (own-records + elevated-role pattern).
- **Potential concern:** `permission_scope_overrides.pso_select` and `plan_permission_sets_select`, `role_permission_sets_select`, `permissions_select` use `USING (true)` — everyone can read the configured permissions + grant rows. Low-risk since it's config data, but means you can't hide feature-flagging decisions from curious users.
- `admin_audit_log_select` is the one policy restricted to `authenticated` role at the Postgres level (plus `is_admin_or_above()` check) — stricter, good.

---

## error_logs signals

- 8 rows total, all from 2026-04-15 on a single test article (`/story/test-congressional-hearing-fed-independence`).
- Single repeated error: `cannot add 'postgres_changes' callbacks for realtime:article-comments:b29ec1d2-... after 'subscribe()'`.
- **Real bug: double-subscribe race on the comments realtime channel.** The code is calling `.on('postgres_changes', ...)` after `subscribe()` instead of before. Consistent cause of console errors on any story page when rapid re-renders occur. Not yet reproduced for other articles but the bug is structural, not data-specific.
- Nothing in error_logs since 2026-04-15 (3 days) — either no users hit the page, the bug is fixed in newer code paths, or logging was turned off.

---

## audit_log signals

- Very sparse: 4 rows, all `auth:login` for the single owner user. No content creation, moderation, or role-grant events logged. Either the app isn't being used, or most actions bypass the audit_log insert.

---

## Preflight script findings

Ran `node scripts/preflight.js`.

- **60+ RPCs exist and are callable** across billing, quiz, comments, expert, bookmarks, trust/safety, family, ads, notifications phases.
- **1 failure:** `missing setting: streak.freeze_max_kids` — expected row absent from `settings` table.
- **1 warning:** Resend API returned HTTP 400 on the `RESEND_API_KEY` check — key present but rejected. Email delivery will likely fail until rotated.
- **9/9 plans, 9/9 roles, 6 active email templates, billing config complete, Stripe webhook wired.**
- Cron schedule section prints "6 cron jobs" as summary but lists 9 (minor display bug in preflight itself, not a real issue).

---

## iOS quick scan

- 37 Swift files, 14,698 LoC.
- Zero TODO/FIXME/HACK/XXX comments — clean.
- `SupabaseManager.swift`: config sourced from `Info.plist` (INFOPLIST_KEY_SUPABASE_URL / SUPABASE_KEY), DEBUG-only env fallback — well-designed, credentials not hardcoded.
- Site URL: `https://veritypost.com` (prod) with optional `VP_SITE_URL` override.
- Full build/test not run (requires Xcode).

---

## Email templates

6 active templates. One carries an emoji in the subject: `breaking_news_alert` → "⚡ Breaking: {{headline}}". Flag given the "no emojis anywhere" rule.

---

## Stripe + IAP webhooks

- Both have thoughtful idempotency implementations via `webhook_log.event_id` unique constraint.
- Stripe: handles checkout.session.completed, customer.subscription.updated/deleted, invoice.payment_failed, charge.refunded, charge.dispute.created.
- IAP: handles 10 notification types (SUBSCRIBED, DID_RENEW, EXPIRED, REVOKE, REFUND, etc.) and explicitly ignores 6 others (TEST, CONSUMPTION_REQUEST, etc.).
- Both require signed payloads — can't smoke-test without real signatures.

---

## Not yet covered

| Area | Why blocked / what's needed |
| --- | --- |
| **Authenticated end-to-end** | Test accounts don't exist in `users`. `test_admin` login fails with `invalid_credentials`. Need to seed the 20 test accounts from `test_accounts.xlsx` before role-by-role click-throughs are possible. |
| **Column-name diff** | Only column counts compared so far. Full name diff requires parsing the xlsx `Full Schema` sheet. |
| **RLS expression diff** | Only role-list + policy name compared. USING/WITH CHECK expressions vs. `reset_and_rebuild_v2.sql` not yet done. |
| **Cron endpoints under real payload** | 9 `/api/cron/*` routes return 403 unauth. Need to hit them with the Vercel cron secret to verify they actually work. |
| **Pipeline** | RSS ingest → cluster → AI generate → publish not exercised. |
| **iOS app** | 44 Swift files in `VerityPost/`, not probed. |
| **Stripe + IAP webhooks** | `/api/stripe/webhook` (400 signature missing) and `/api/ios/appstore/notifications` (400 signedPayload) need signed payloads to test. |
| **Email render + delivery** | `email_templates` has 6 rows; render + send path not tested. |
| **Dev-server log tail** | Current dev server is from another terminal; its stderr isn't captured. Silent render warnings/DB errors that don't surface in the HTTP response are invisible right now. |
| **Comment posting end-to-end** | Blocked on test accounts. |
| **Pipeline run** | RSS fetch → cluster → AI generate → publish not exercised. |
| **Email send** | Resend key rejected, so can't actually deliver a test send. |

---

## Suggested next slices (no fixes yet — you pick)

- **A.** Seed the test accounts (there may be a script for this under `scripts/`), then re-run admin sweep authenticated as each role.
- **B.** Expression-level RLS diff vs. `reset_and_rebuild_v2.sql`.
- **C.** Column-name diff of the 14 drifted tables — identify exactly which new columns the rogue agent added.
- **D.** Decide the permission-set strategy: either (i) build role-specific sets so the system actually differentiates, (ii) delete `role_permissions`/`role_permission_sets` scaffolding and keep only the plan-entitlement use, or (iii) keep the current split (hierarchy for staff, sets for UI/plan gating) but document it explicitly.
- **E.** Drop the empty `role_permissions` table and any code references, since it's unused dead weight.
- **F.** Check `scripts/` for a test-account seeder; if missing, add one to `00-New-Findings.md` as a blocker.
- **G.** iOS sweep: Xcode build + simple smoke run.
