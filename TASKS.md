# Verity Post — Task List

**Generated**: 2026-04-20 (post-56-fix session + 3-agent review)
**Canonical**: this file. Older task lists in `05-Working/_archive/2026-04-20-task-synthesis/` are source material — do not edit those.

## Workflow — how tasks move through this file

1. **Active** — task lives here with its ID block.
2. **Shipping** — when you pick it up, run it to completion (commit + verify acceptance).
3. **Close** — when the fix ships:
   - **REMOVE** the task block from this file entirely.
   - **APPEND** a one-line entry to `/DONE.md` in the matching area section.
   - Commit message should reference the ID (e.g., `T-037: swap placeholder App Store URL`).
4. **Never leave a shipped task sitting checked-off in TASKS.md.** Either it's in DONE.md (closed), or it's still open here.

## Auditor contract

**Before flagging an issue as a new task, grep `/DONE.md` first by file:line.** If the fix is logged there, it shipped — do NOT re-raise unless you can demonstrate regression (show current code state + diff against the close commit). If the code genuinely reverted, file as a new task titled `REGRESSION of T-XXX`.

## How to use this file

A fresh agent picks the top unchecked task, reads file:line, does the work, closes per workflow above. All tasks have:
- Stable ID (`T-001`) — never renumber
- Priority (`P0`/`P1`/`P2`/`P3`/`P4`)
- Effort (`1L` / `S` / `M` / `L` / `OWNER`)
- Lens (`CODE` / `DB-DRIFT` / `SCHEMA` / `UX` / `SECURITY` / `IOS` / `MIGRATION-DRIFT` / `A11Y`)
- File:line, Why/What/Acceptance, Source (for traceability)

## Legend
- **Priority**: P0 ship-blocker · P1 high · P2 medium · P3 polish · P4 deferred
- **Effort**: 1L 1-liner · S single-file · M multi-file · L architectural · OWNER non-engineering
- `? UNCERTAIN` + tag `needs-live-check` = Agent 3 could not verify; re-verify before acting

## Task counts
- P0: 8 · P1: 25 · P2: 32 · P3: 26 · P4: 6 · **Total: 97**
- DB-DRIFT: 24 · SCHEMA: 6 · SECURITY: 11 · IOS: 11 · MIGRATION-DRIFT: 4 · A11Y: 3 · UX: 13 · CODE: 23
- Unverified (needs live-check): 22

---

## P0 — Ship-blockers / critical

### T-003 — Seed `rate_limits` + switch `lib/rateLimit.js` to DB-backed
**Priority**: P0  **Effort**: M  **Lens**: DB-DRIFT  **Source**: A1:T-001 + A2:G-025
**File**: `web/src/lib/rateLimit.js`, `web/src/app/admin/system/page.tsx:62-73`
**Why**: `rate_limits` table has 0 rows; `admin/system` UI edits ghost data; ~10 routes use inline `{max, windowSec}`.
**Do**: Seed 10 entries; add `getRateLimit(key)` w/ 60s cache; replace inline literals in `kids-verify-pin, follows, bookmarks, users-block, account-delete, stripe-checkout, appeals, resend-verify`, etc.
**Accept**: `admin/system` edits take effect within 60s; `rate_limits` has ≥10 rows.

### T-004 — Reconcile migration disk↔live drift (repo bootstrap broken)
**Priority**: P0  **Effort**: M  **Lens**: MIGRATION-DRIFT  **Source**: A1:T-014 + A2:G-033,G-036
**File**: `schema/*.sql` vs `supabase_migrations.schema_migrations`
**Why**: 7–11 applied migrations have no disk file (grant_anon_free_comments_view, create_banners_storage_bucket, deactivate_unused_ios_keys, drop_ticket_messages_body_html, add_require_outranks_rpc, 092_rls_lockdown, 092b_rls_lockdown_followup, 093_rpc_actor_lockdown, 095_banners_bucket_lockdown, 096_function_search_path_hygiene ×2). Clean bootstrap diverges from live. Duplicate `096_function_search_path_hygiene` at two timestamps (DR blocker).
**Do**: Pull SQL via `schema_migrations.statements`; commit to `schema/` w/ matching numbers; rename dup 096 → `_v2`.
**Accept**: Every `list_migrations` row has disk twin; unique names.

### T-007 — HIBP compromised-password toggle
**Priority**: P0  **Effort**: OWNER  **Lens**: SECURITY  **Source**: A1:T-067
**Do**: Flip HIBP toggle in Supabase Auth settings.
**Accept**: Known-leaked password rejected at signup.

### T-008 — Rotate live secrets (Supabase service-role, Stripe live, Stripe webhook)
**Priority**: P0  **Effort**: OWNER  **Lens**: SECURITY  **Source**: A1:T-068
**File**: `docs/runbooks/ROTATE_SECRETS.md`
**Accept**: Old keys revoked; new keys work in prod.

### T-009 — Set Vercel env `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN`
**Priority**: P0  **Effort**: OWNER  **Lens**: CODE  **Source**: A1:T-069
**File**: `web/next.config.js:61-68` (hard-fails build without)
**Accept**: Next build succeeds; test error reaches Sentry.

### T-010 — Confirm `NEXT_PUBLIC_SITE_URL` (localhost:3333 fallback risk)
**Priority**: P0  **Effort**: OWNER+1L  **Lens**: SECURITY  **Source**: A1:T-070,T-013 + A2:G-055 + A3:NEW-007
**File**: Vercel env; `api/auth/{signup,reset-password,callback}/route.js`, `api/account/delete/route.js`
**Why**: Fallback `http://localhost:3333` in 4 routes; if env missing, email links point at user's machine.
**Do**: Set env; harden fallbacks to throw in prod.
**Accept**: Missing env throws 500, not localhost URL.

### T-011 — Replace 5 `Test:` articles; publish ≥10 real
**Priority**: P0  **Effort**: OWNER  **Lens**: UX  **Source**: A1:T-071
**Accept**: `articles WHERE title ILIKE 'test%'` = 0 published; ≥10 real published.

### T-012 — `data_export_ready` email template missing (silent cron drop)
**Priority**: P0  **Effort**: S  **Lens**: SCHEMA  **Source**: A2:G-029 (A3 escalated from P3)
**File**: `web/src/app/api/cron/send-emails/route.js:17-25`; `email_templates` table
**Why**: Cron maps 7 types; DB has 6 rows; `data_export_ready` key absent. Export emails silently dropped.
**Do**: Seed `data_export_ready` in `email_templates`.
**Accept**: Test data-export sends email.

---

## P1 — High

### T-013 — Error.message leak sweep (115 occurrences, 87 API files)
**Priority**: P1  **Effort**: M  **Lens**: SECURITY  **Source**: A1:T-002,T-097 + A2:G-037..G-041 (A3 corrected count; was 290)
**File**: `web/src/app/api/**`; helper at `web/src/lib/apiErrors.js`
**Why**: 115 routes return raw PostgREST/Stripe/Apple error strings; leaks columns, customer IDs, RLS reasons. Stripe/auth leaks most sensitive.
**Do**: Replace every `NextResponse.json({ error: error.message })` with `apiError(err, 'domain.action.failed', status)`; Sentry keeps detail.
**Accept**: `grep 'error: error.message' web/src/app/api` = 0.

### T-014 — Seed `reserved_usernames` (signup can claim admin/root today)
**Priority**: P1  **Effort**: 1L  **Lens**: DB-DRIFT  **Source**: A2:G-027
**File**: `reserved_usernames` table (0 rows)
**Why**: Signup accepts `admin`, `support`, `root`, `system`, `owner`, `verity`, `veritypost`.
**Do**: Seed ~50 reserved names.
**Accept**: Signup with `admin` rejected.

### T-015 — Seed `blocked_words` (profanity filter empty)
**Priority**: P1  **Effort**: 1L  **Lens**: DB-DRIFT  **Source**: A2:G-026
**File**: `blocked_words` table (0 rows); `admin/comments/page.tsx:92`
**Do**: Ship starter list; confirm comment path queries `blocked_words`.
**Accept**: Seeded word rejects test comment.

### T-016 — `lib/plans.js` PRICING/limits hardcoded — build `planLimit()`
**Priority**: P1  **Effort**: M  **Lens**: DB-DRIFT  **Source**: A1:T-022 + A2:G-003..G-010
**File**: `web/src/lib/plans.js:20-128`; `web/src/app/bookmarks/page.tsx:14`; `web/src/components/ArticleQuiz.tsx:316`; `web/src/app/api/cron/send-push/route.js:88,145,148`; `web/src/app/admin/users/page.tsx:90-100`
**Why**: Cents, `maxKids`, `FREE_BOOKMARK_CAP=10`, `streak_freeze=2/week`, `quiz_attempts=2/article`, `breaking_alerts=1/day`, feature bullets all duplicate `plans`(9) + `plan_features`(215). `/admin/plans` edits don't reflect.
**Do**: `planLimit(planKey, feature)` reading `plan_features` (cached); render price/bullets from `plans` + `plans.metadata`.
**Accept**: 0 `cents:` literals in `lib/plans.js`; grep `maxKids` = 0.

### T-017 — `FALLBACK_CATEGORIES` hardcoded with fake `fb-*` UUIDs
**Priority**: P1  **Effort**: S  **Lens**: DB-DRIFT  **Source**: A1:T-023,T-106 + A2:G-014
**File**: `web/src/app/page.tsx:83-125`
**Why**: 24 categories w/ made-up `fb-*` IDs; `categories` has 69 rows; footgun on any join.
**Do**: Drop fallback; SSR-fetch `categories`.
**Accept**: No `fb-*` ids in `web/src/`.

### T-018 — `CATEGORIES` hardcoded in admin story/pipeline/cohorts
**Priority**: P1  **Effort**: S  **Lens**: DB-DRIFT  **Source**: A2:G-015,G-016,G-017
**File**: `admin/story-manager/page.tsx:25-31,58,205`; `admin/pipeline/page.tsx:42`; `admin/cohorts/page.tsx:95`
**Why**: 3 separate handmade category lists; editors see a subset of the 69 DB rows; defaults fallback to `'Politics'` string.
**Do**: DB-sourced dropdown from `categories` where `is_kids=false`.
**Accept**: All active adult categories selectable in 3 pages.

### T-019 — Role Sets duplicated; build `rolesAtLeast()` helper
**Priority**: P1  **Effort**: S  **Lens**: DB-DRIFT  **Source**: A1:T-024 + A2:G-011,G-012,G-013
**File**: `web/src/app/admin/users/page.tsx:75`; `web/src/lib/roles.js:18-22`; `admin/moderation/page.tsx:26`; `api/expert-sessions/questions/[id]/answer/route.js:17`; `admin/users/[id]/permissions/page.tsx:38`
**Why**: `ROLE_ORDER` + `OWNER_ROLES/ADMIN_ROLES/EDITOR_ROLES/MOD_ROLES/EXPERT_ROLES` re-enumerate 9 DB roles; custom role at hierarchy_level=65 breaks index math.
**Do**: `rolesAtLeast(level)` helper reading `roles.hierarchy_level`; remove duplicates.
**Accept**: Grep `MOD_ROLES|ADMIN_ROLES|EDITOR_ROLES|ROLE_ORDER` outside helper = 0.

### T-020 — Silent kid `quiz_attempts` insert failure (score drift) `needs-live-check`
**Priority**: P1  **Effort**: S  **Lens**: IOS  **Source**: A1:T-018
**File**: `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:228-232`
**Why**: `catch { // Non-fatal }` swallows insert errors; leaderboard drift.
**Do**: Log + retry; surface to parent telemetry.
**Accept**: Failed insert is observable.

### T-021 — Silent kid `reading_log` insert failure (streak never fires) `needs-live-check`
**Priority**: P1  **Effort**: S  **Lens**: IOS  **Source**: A1:T-019
**File**: `VerityPostKids/VerityPostKids/KidReaderView.swift:183-190`
**Do**: Same as T-020.

### T-024 — `kids/[id]` PATCH/DELETE unbounded + accepts DOB without 3–13y bounds
**Priority**: P1  **Effort**: S  **Lens**: SECURITY  **Source**: A1:T-006,T-009
**File**: `web/src/app/api/kids/[id]/route.js:30`
**Do**: 30/min rate-limit; validate DOB in [today-13y, today-3y].
**Accept**: Out-of-range DOB → 400; 31st call → 429.

### T-025 — Normalize `/api/auth/*` rate limits + Retry-After on 13 routes
**Priority**: P1  **Effort**: S  **Lens**: SECURITY  **Source**: A1:T-003,T-007
**File**: `api/auth/{login,signup,email-change,resolve-username,resend-verification,check-email}`, `api/kids/pair`, `api/ads/{click,impression}`, `api/access-request`, `api/support/public`, `api/admin/send-email`
**Why**: Inconsistent ceilings; 13 routes lack Retry-After header.
**Do**: Pick 5/hr default; emit Retry-After.
**Accept**: All 13 routes emit header; auth routes share vocabulary.

### T-028 — `admin/page.tsx` `restrictedRole` state never consumed
**Priority**: P1  **Effort**: S  **Lens**: UX  **Source**: A1:T-010
**File**: `web/src/app/admin/page.tsx:95-126`
**Why**: Editors/mods see full grid despite tracking state.
**Do**: Wire state to hide cells they can't access.
**Accept**: Editor login sees trimmed grid.

### T-029 — `admin/users/[id]/permissions` require reason+expires + audit tx
**Priority**: P1  **Effort**: S  **Lens**: SECURITY  **Source**: A1:T-049
**File**: `web/src/app/api/admin/users/[id]/permissions/route.js:169,183,261-263`
**Why**: `reason ?? null` + nullable expires → admin grants without audit.
**Do**: Require both; wrap insert + audit in transaction; only outranked targets.
**Accept**: Missing reason/expires → 400.

### T-031 — `page_access` table + `canAccess(key)` for 33 admin pages
**Priority**: P1  **Effort**: L  **Lens**: DB-DRIFT  **Source**: A1:T-021
**File**: 33 pages in `web/src/app/admin/*`
**Why**: `['owner','admin']` allowlists scattered; `permissions.category='ui'` for all 992 rows is useless.
**Do**: Create `page_access` table; `canAccess(key)` helper; remove inline allowlists; backfill `permissions.category` into (admin/reader/billing/moderation/expert/kids).
**Accept**: 0 role-name string arrays in admin pages; `SELECT DISTINCT category FROM permissions` > 1.

### T-032 — `reset_and_rebuild_v2.sql` settings keys mismatch live
**Priority**: P1  **Effort**: S  **Lens**: MIGRATION-DRIFT  **Source**: A2:G-054
**File**: `schema/reset_and_rebuild_v2.sql:3384-3385`
**Why**: Seeds `context_pin.min_tags` / `context_pin.threshold_pct`; live uses `context_pin_min_count` / `context_pin_percent`. Clean bootstrap produces settings table no code reads.
**Do**: Align seed keys to snake_case.

### T-033 — Stripe V2 Server URL (prod + sandbox)
**Priority**: P1  **Effort**: OWNER  **Lens**: IOS  **Source**: A1:T-073
**Accept**: Receipt endpoint receives V2 events.

### T-034 — APNs `.p8` + Vercel env (KEY_ID/TEAM_ID/AUTH_KEY/ENV/TOPIC)
**Priority**: P1  **Effort**: OWNER  **Lens**: IOS  **Source**: A1:T-074
**Accept**: Push reaches test device.

### T-035 — Upload `apple-app-site-association`
**Priority**: P1  **Effort**: OWNER  **Lens**: IOS  **Source**: A1:T-075

### T-036 — App Store 8 subscription products
**Priority**: P1  **Effort**: OWNER  **Lens**: IOS  **Source**: A1:T-072

### T-037 — Real App Store URL in 3 Kids-launcher sites
**Priority**: P1  **Effort**: OWNER  **Lens**: IOS  **Source**: A1:T-078 + A2:G-046,G-050
**File**: `VerityPost/VerityPost/KidsAppLauncher.swift:11-12`; `web/src/components/kids/OpenKidsAppButton.tsx:3`; `web/src/app/kids-app/page.tsx:1`

### T-038 — Google OAuth wire-up (GCP + Supabase)
**Priority**: P1  **Effort**: OWNER  **Lens**: SECURITY  **Source**: A1:T-076 (LB-036)

### T-039 — PWA icons in `web/public/` (192/512/512-maskable/apple-touch)
**Priority**: P1  **Effort**: OWNER  **Lens**: UX  **Source**: A1:T-077

### T-040 — Confirm admin owner seat before opening signups
**Priority**: P1  **Effort**: OWNER  **Lens**: SECURITY  **Source**: A1:T-094

### T-041 — Commit archive migrations → `schema/092_/093_/…` `needs-live-check`
**Priority**: P1  **Effort**: OWNER  **Lens**: SCHEMA  **Source**: A1:T-014
**File**: `archive/2026-04-19-prelaunch-sprint/round_{a,b}_migration.sql`
**Do**: Copy to `schema/`; regen `reset_and_rebuild_v2.sql`.

### T-042 — `schema/100_backfill_admin_rank_rpcs` not in live migrations `needs-live-check`
**Priority**: P1  **Effort**: S  **Lens**: MIGRATION-DRIFT  **Source**: A3:NEW-008
**File**: `schema/100_backfill_admin_rank_rpcs_2026_04_19.sql`
**Do**: Verify applied under different name or apply/remove.

---

## P2 — Medium

### T-043 — Kids iOS Dynamic Type: 86 `.font(.system(size:))` in 11 files `needs-live-check`
**Priority**: P2  **Effort**: M  **Lens**: A11Y+IOS  **Source**: A1:T-017 + A2:G-042
**File**: `VerityPostKids/VerityPostKids/{TabBar(2), ProfileView(6), KidQuizEngineView(13), ExpertSessionsView(11), ParentalGateModal(11), LeaderboardView(5), BadgeUnlockScene(6), StreakScene(6), QuizPassScene(10), GreetingScene(9), KidPrimitives(7)}.swift`
**Why**: Ignoring Dynamic Type — App Store accessibility risk.
**Do**: Swap to `.font(.title)/.headline` or `@ScaledMetric var size`.
**Accept**: 0 raw `.system(size:` in VerityPostKids/.

### T-044 — `KidsAppState.completeQuiz` in-memory mutator competes w/ DB writes
**Priority**: P2  **Effort**: M  **Lens**: IOS  **Source**: A1:T-020
**File**: `VerityPostKids/VerityPostKids/KidsAppState.swift:162,169,189`; `KidsAppRoot.swift:144`
**Do**: Rely on DB only; remove in-memory mutator.

### T-045 — Kid PIN 3-fail lock crackable (10k space ~5.5h)
**Priority**: P2  **Effort**: S  **Lens**: SECURITY  **Source**: A1:T-048
**File**: `web/src/app/api/kids/verify-pin/route.js:9-10`
**Do**: Escalate backoff or force PIN reset after N total fails.

### T-046 — Kid-pair JWT trusts RPC `parent_user_id` w/o re-verify `needs-live-check`
**Priority**: P2  **Effort**: S  **Lens**: SECURITY  **Source**: A1:T-098
**File**: `web/src/app/api/kids/pair/route.js:69-88`
**Do**: Re-verify parent_user_id via DB before minting JWT.

### T-047 — Permissions cache fallthrough returns stale-true + E2E tests
**Priority**: P2  **Effort**: M  **Lens**: SECURITY  **Source**: A1:T-041,T-108,T-110
**File**: `web/src/lib/permissions.js:34-39,152-163`
**Do**: Drop legacy section cache on user-level change; RLS multi-user E2E; upgrade/cancel/mute cache-staleness tests.
**Accept**: Cache purges on role change; tests pass in CI.

### T-048 — `getSettings` consumer consolidation (comment composer, guidelines)
**Priority**: P2  **Effort**: S  **Lens**: DB-DRIFT  **Source**: A1:T-025 + A2:G-020..G-023
**File**: comment composer; guidelines page; cron/send-push:88
**Why**: `comment_max_length=4000`, `context_pin_min_count=5`, `context_pin_percent=10`, `supervisor_eligibility_score=500`, `breaking_alert_cap_free=1` unread by web.
**Do**: Wire composer to live limit; surface thresholds; read `breaking_alert_cap_free` in cron.
**Accept**: Comment composer shows live char limit.

### T-049 — `score_rules` points duplicated by quiz literals (col is `action`)
**Priority**: P2  **Effort**: S  **Lens**: DB-DRIFT  **Source**: A2:G-024 + A3:NEW-002
**File**: `admin/story-manager/page.tsx:560`; `admin/kids-story-manager/page.tsx:439`
**Do**: `getScoreRule('quiz_correct').points` reading `score_rules WHERE action='quiz_correct'` (column is `action`, NOT `key`).

### T-050 — Stripe Embedded Checkout (LB-013) `needs-live-check`
**Priority**: P2  **Effort**: L  **Lens**: UX  **Source**: A1:T-057
**Do**: `ui_mode:'embedded'` in checkout session.

### T-051 — Auth-drop Sentry instrumentation (LB-034) `needs-live-check`
**Priority**: P2  **Effort**: S  **Lens**: CODE  **Source**: A1:T-058

### T-052 — home feed null-title guard + articles.title audit (LB-016) `needs-live-check`
**Priority**: P2  **Effort**: S  **Lens**: UX  **Source**: A1:T-054
**File**: `web/src/app/page.tsx`

### T-053 — `notifications` empty-list bug (LB-006) `needs-live-check`
**Priority**: P2  **Effort**: M  **Lens**: UX  **Source**: A1:T-055
**File**: `web/src/app/notifications/*`

### T-054 — `permission_sets` dead `is_active=false` bundles
**Priority**: P2  **Effort**: M  **Lens**: DB-DRIFT  **Source**: A2:G-031
**Why**: 11 inactive bundle rows (`base`, `verified_base`, `home_browse`…) + 10 active role-ish sets; half-finished migration.
**Do**: Delete or flag historical.
**Accept**: 0 `is_active=false` rows or explicit `historical` column.

### T-055 — Expert-signup expertise fields → `categories` FK
**Priority**: P2  **Effort**: S  **Lens**: DB-DRIFT  **Source**: A2:G-018
**File**: `web/src/app/signup/expert/page.tsx:27-40`
**Why**: 12 invented strings don't match `categories` slugs; `expert_application_categories` rows un-joinable.
**Do**: Map to `categories.id`.

### T-056 — `how-it-works` + `help` hardcoded price strings
**Priority**: P2  **Effort**: S  **Lens**: DB-DRIFT  **Source**: A2:G-058
**File**: `web/src/app/help/page.tsx:57`
**Do**: Template from `plans.price_cents`.

### T-057 — `achievements` threshold + kind columns
**Priority**: P2  **Effort**: M  **Lens**: SCHEMA  **Source**: A2:G-057 + A3:NEW-001
**File**: `achievements` table; `web/src/lib/scoring.js`
**Why**: Key encodes threshold (`bookworm_10`, `streak_7`); no admin-editable path. `reset_and_rebuild_v2.sql:3339` seed has cosmetic `criteria` that scoring.js ignores.
**Do**: Add `threshold` + `kind` cols; drive detection from DB.
**Accept**: Owner can tune thresholds without code push.

### T-058 — LoginView accept username-or-email `needs-live-check`
**Priority**: P2  **Effort**: S  **Lens**: IOS  **Source**: A1:T-047
**File**: `VerityPost/VerityPost/LoginView.swift`

### T-059 — Rebuild adult iOS after middleware + kids API changes
**Priority**: P2  **Effort**: S  **Lens**: IOS  **Source**: A1:T-095

### T-060 — Stripe-sync pass (admin/subscriptions/plans/promo) `needs-live-check`
**Priority**: P2  **Effort**: L  **Lens**: CODE  **Source**: A1:T-079

### T-061 — `/admin/features` rebuild vs `feature_flags` schema
**Priority**: P2  **Effort**: M  **Lens**: CODE  **Source**: A1:T-080 (feature_flags has 1 row; rich cols unused — A2:G-051)

### T-062 — `/admin/breaking` rebuild
**Priority**: P2  **Effort**: M  **Lens**: UX  **Source**: A1:T-081

### T-063 — Product decisions: journalist/educator, Pro vs Verity, co-parent
**Priority**: P2  **Effort**: OWNER  **Lens**: UX  **Source**: A1:T-088

### T-064 — Post-deployment validation checklist (6 runtime tests)
**Priority**: P2  **Effort**: OWNER  **Lens**: CODE  **Source**: A1:T-091

### T-065 — Clean git tree (`site/`→`web/` deletion noise)
**Priority**: P2  **Effort**: S  **Lens**: CODE  **Source**: A1:T-105

### T-066 — Verify `record_admin_action`+`require_outranks` arg names
**Priority**: P2  **Effort**: 1L  **Lens**: DB-DRIFT  **Source**: A1:T-104
**Why**: A3 confirmed `record_admin_action(p_action, p_target_table, p_target_id, p_reason, p_old_value, p_new_value, p_ip, p_user_agent)` + `require_outranks(target_user_id uuid)`.
**Do**: Confirm call sites pass matching args.

### T-067 — admin TS hygiene (22 `as any` + @admin-verified drift)
**Priority**: P2  **Effort**: M  **Lens**: CODE  **Source**: A1:T-039,T-053 (A3 merged)
**File**: `web/src/app/admin/subscriptions/page.tsx:48,49,51,109,194,298,374,607` + others

### T-068 — `auth/callback` + `pick-username` drop rawNext on first-login `needs-live-check`
**Priority**: P2  **Effort**: S  **Lens**: UX  **Source**: A1:T-016
**File**: `web/src/app/api/auth/callback/route.js:152`; `signup/pick-username/page.tsx:137,147`

### T-069 — New a11y: empty alt on non-decorative image
**Priority**: P2  **Effort**: 1L  **Lens**: A11Y  **Source**: A3:NEW-005
**File**: `web/src/app/card/[username]/page.js`

### T-070 — `admin/stories` + `admin/recap` + scoring.js silent errors `needs-live-check`
**Priority**: P2  **Effort**: S  **Lens**: CODE  **Source**: A1:T-031,T-032,T-033
**File**: `api/admin/stories/route.js:38-40` (add console.error); `admin/recap/page.tsx:80,118` (missing .ok/.catch); `lib/scoring.js:57` (RPC returns [])

### T-102 — `admin/users` PLAN_OPTIONS hardcoded (9 plans in JS)
**Priority**: P2  **Effort**: S  **Lens**: DB-DRIFT  **Source**: T-005 post-audit
**File**: `web/src/app/admin/users/page.tsx:73-83`
**Why**: Plan dropdown in the change-plan modal is a hardcoded 9-entry array of `{name, label}`. `plans` table is authoritative (already used everywhere else). New plan seeded in DB never appears in the UI until code ships.
**Do**: Load `plans.name, display_name` in the same `init()` effect; cache via a helper mirroring `lib/scoreTiers.ts` (60s TTL). Delete `PLAN_OPTIONS`.
**Accept**: Grep `PLAN_OPTIONS` = 0; new DB plan row shows up on next page load.

### T-103 — `admin/users` ROLE_ORDER hardcoded hierarchy array
**Priority**: P2  **Effort**: S  **Lens**: DB-DRIFT  **Source**: T-005 post-audit
**File**: `web/src/app/admin/users/page.tsx:63` (`ROLE_ORDER`, `rolesUpTo`)
**Why**: 9-entry role-order array duplicates `roles.hierarchy_level` (the DB source of truth used by `require_outranks`, `caller_can_assign_role`). If DB hierarchy changes, the admin "grant at or below your own role" UI drifts.
**Do**: Load `roles.name, hierarchy_level` ordered by hierarchy; derive `rolesUpTo` from DB. 60s cache.
**Accept**: Grep `ROLE_ORDER` = 0; changing `roles.hierarchy_level` in DB reorders the UI on next nav.

---

## P3 — Low / polish

### T-071 — Runtime cleanup sweep (interval/debounce/timeout) `needs-live-check`
**Priority**: P3  **Effort**: S  **Lens**: CODE  **Source**: A1:T-034..T-037
**File**: `verify-email/page.js:87-93,62-65`; `signup/pick-username/page.tsx:48,87`; `admin/comments/page.tsx:120-173`; `profile/settings/page.tsx:554-557`
**Do**: Fix unmount setState, debounce cleanup, saveTimeout cleanup, tick timer capture.

### T-072 — profile/settings hash-scroll 1500ms retry fragile
**Priority**: P3  **Effort**: S  **Lens**: UX  **Source**: A1:T-038

### T-073 — featureFlags 30s TTL no invalidation + errors/route fail-open `needs-live-check`
**Priority**: P3  **Effort**: S  **Lens**: CODE+SECURITY  **Source**: A1:T-040,T-042
**File**: `web/src/lib/featureFlags.js:5-22`; `api/errors/route.js:36-41`

### T-074 — iOS dead/silent-catch cleanup
**Priority**: P3  **Effort**: S  **Lens**: IOS  **Source**: A1:T-043..T-046 + A2:G-050
**File**: `ProfileView.swift:1169-1176` (`#if false`); `StoryDetailView.swift:1278-1305,1261` (expert Q&A `#if false`, vote silent catch); `LeaderboardView.swift:358` (silent catch)
**Why**: `expert_discussions` has `title/body/parent_id` not `question/answer` — schema shape TODO.
**Do**: Resolve schema shape; wire or delete.

### T-075 — Stripe UTC-day idempotency edge `needs-live-check`
**Priority**: P3  **Effort**: S  **Lens**: CODE  **Source**: A1:T-051
**File**: `web/src/lib/stripe.js:73-75`

### T-076 — `requireVerifiedEmail` throws without `.status` `needs-live-check`
**Priority**: P3  **Effort**: 1L  **Lens**: CODE  **Source**: A1:T-052
**File**: `web/src/lib/auth.js:72-73`

### T-077 — `apply-to-expert` confirmation strands user (LB-010) `needs-live-check`
**Priority**: P3  **Effort**: S  **Lens**: UX  **Source**: A1:T-056

### T-078 — QuizPoolEditor orphan + VerifiedBadge null renders `needs-live-check`
**Priority**: P3  **Effort**: S  **Lens**: CODE+UX  **Source**: A1:T-059,T-060

### T-079 — middleware public-path skip expires long-idle sessions `needs-live-check`
**Priority**: P3  **Effort**: S  **Lens**: CODE  **Source**: A1:T-096
**File**: `web/src/middleware.js:178`

### T-080 — `sanitizeIlikeTerm` strips `%` instead of escaping
**Priority**: P3  **Effort**: 1L  **Lens**: UX  **Source**: A1:T-099
**File**: `web/src/app/page.tsx:27,396-397`

### T-081 — Parental gate only 132 unique sums `needs-live-check`
**Priority**: P3  **Effort**: S  **Lens**: IOS  **Source**: A1:T-100
**File**: `VerityPostKids/VerityPostKids/ParentalGateModal.swift:26-27`

### T-082 — New schema tables (`report_reasons`, `support_categories`, `appeal_reasons`, `notification_templates`, `consent_versions`, `source_publishers`)
**Priority**: P3  **Effort**: M  **Lens**: SCHEMA  **Source**: A1:T-027..T-030
**File**: `web/src/lib/coppaConsent.js` (consent const)

### T-083 — Theme.swift 2 `.font(.system(size:))` adult app
**Priority**: P3  **Effort**: 1L  **Lens**: A11Y+IOS  **Source**: A2:G-043
**File**: `VerityPost/VerityPost/Theme.swift:2`

### T-084 — Adult streak-freeze help copy (ghost feature)
**Priority**: P3  **Effort**: 1L  **Lens**: UX  **Source**: A1:T-087

### T-085 — Admin UX decisions (webhooks retry, pipeline cols, support ChatWidgetConfig, email-templates tabs)
**Priority**: P3  **Effort**: OWNER  **Source**: A1:T-082..T-085

### T-086 — Audit-log slug micro-pass (6–7 new)
**Priority**: P3  **Effort**: S  **Lens**: CODE  **Source**: A1:T-086

### T-087 — Owner decisions (holding-page, billing gate key, promo strategy)
**Priority**: P3  **Effort**: OWNER  **Source**: A1:T-089,T-090,T-093

### T-088 — Realtime disruption recovery test
**Priority**: P3  **Effort**: S  **Lens**: CODE  **Source**: A1:T-109

### T-089 — `app_config` empty — drop or seed
**Priority**: P3  **Effort**: S  **Lens**: DB-DRIFT  **Source**: A2:G-028

### T-090 — profile/[id] quizAttempts reducer duplicates table + lib/plans.js runtime-assert count=9
**Priority**: P3  **Effort**: S  **Lens**: CODE+DB-DRIFT  **Source**: A2:G-052,G-053

### T-091 — profile/settings 5 TODO(owner) comments → issues
**Priority**: P3  **Effort**: OWNER  **Source**: A2:G-048
**File**: `web/src/app/profile/settings/page.tsx:136,143,215,3531,3604`

### T-092 — admin/analytics 30d/90d + quiz-edit gaps
**Priority**: P3  **Effort**: S  **Lens**: UX  **Source**: A2:G-047
**File**: `web/src/app/admin/analytics/page.tsx:172,341`

### T-093 — Migration numbering cleanup (007/008/052 gaps, 094 ts vs prefix, Verity+ copy drift)
**Priority**: P3  **Effort**: S  **Lens**: MIGRATION-DRIFT  **Source**: A2:G-034,G-035,G-060
**Do**: Document numbering scheme; place RESERVED stubs for gaps; fix `permission_sets` "Verity+" description.

### T-104 — `admin/system` config metadata hardcoded (TRANSPARENCY + MONITORING)
**Priority**: P3  **Effort**: M  **Lens**: DB-DRIFT  **Source**: T-005 post-audit
**File**: `web/src/app/admin/system/page.tsx:42-60`
**Why**: `TRANSPARENCY_SETTINGS` (8 entries) + `MONITORING_SETTINGS` (6 entries) hardcode `{key, label, desc}` for each toggle. Values persist to `settings`; labels/descriptions only exist in JS. Adding a new setting in DB never shows a UI row.
**Do**: Extend `settings` (or add `settings_metadata`) with `display_name`, `description`, `category` columns; load in page init; render from DB. Same pattern for `admin/notifications` (T-105). Likely share a `getSettingGroup(category)` helper.
**Accept**: Grep `TRANSPARENCY_SETTINGS|MONITORING_SETTINGS` = 0; new row in settings_metadata appears on next load.

### T-105 — `admin/notifications` config metadata + defaults hardcoded
**Priority**: P3  **Effort**: M  **Lens**: DB-DRIFT  **Source**: T-005 post-audit
**File**: `web/src/app/admin/notifications/page.tsx:28-80` (`PUSH_CONFIG`, `COALESCING_CONFIG`, `EMAIL_CONFIG`, `DEFAULT_TOGGLE_STATE`, `DEFAULT_NUMS`)
**Why**: 16 toggle `{key, label, desc}` entries + 8 numeric defaults hardcoded. Same drift class as T-104. Defaults should live as `settings.default_value`, not as a JS `DEFAULT_TOGGLE_STATE` map.
**Do**: Migrate with T-104 as one pass; share helper. Ensure defaults read from `settings.default_value` (or equivalent column).
**Accept**: Grep `PUSH_CONFIG|COALESCING_CONFIG|EMAIL_CONFIG|DEFAULT_TOGGLE_STATE|DEFAULT_NUMS` = 0.

### T-106 — `admin/notifications` EMAIL_SEQUENCES hardcoded in JS
**Priority**: P3  **Effort**: M  **Lens**: DB-DRIFT  **Source**: T-005 post-audit
**File**: `web/src/app/admin/notifications/page.tsx:51-63`
**Why**: Onboarding + re-engagement email sequences (day offsets, subjects, descriptions, status) are hardcoded. `email_templates` already holds individual emails; no schema for sequences-of-emails. Editing the sequence requires a code change.
**Do**: Add `email_sequences` table (`id, name, status, created_at`) + `email_sequence_steps` (`sequence_id, day_offset, email_template_id, sort_order`). Migrate the two hardcoded sequences. Load from DB; admin UI becomes editable over time.
**Accept**: Grep `EMAIL_SEQUENCES` = 0; sequences editable via DB.

---

## P4 — Deferred / owner-side

### T-094 — Behavioral anomaly detection (Blueprint 10.3)
**Priority**: P4  **Effort**: L  **Lens**: SCHEMA  **Source**: A1:T-092
**Do**: New table + RPC; post-MVP.

### T-095 — `EXPECTED_BUNDLE_ID` → `app_config`
**Priority**: P4  **Effort**: S  **Lens**: DB-DRIFT  **Source**: A1:T-107 + A2:G-028
**File**: `web/src/lib/appleReceipt.js:23`

### T-096 — Reset-password "check spam" UI hint + Google Play subs URL cosmetic
**Priority**: P4  **Effort**: 1L  **Lens**: UX+CODE  **Source**: A1:T-101 + A2:G-056
**File**: `profile/settings/page.tsx:3135,3328`

### T-097 — messages realtime `as unknown as 'system'` coercions
**Priority**: P4  **Effort**: S  **Lens**: CODE  **Source**: A1:T-102
**File**: `web/src/app/messages/page.tsx:267-350`

### T-098 — `lib/appleReceipt` cachedRootCert no rotation
**Priority**: P4  **Effort**: S  **Lens**: CODE  **Source**: A1:T-103
**File**: `web/src/lib/appleReceipt.js:26`

### T-099 — Misc deferred (home 'use client', perms dual cache, kids-% slug, navigator.share, Interstitial next=, admin/subscriptions+features plan-key reads)
**Priority**: P4  **Effort**: varies  **Lens**: CODE+DB-DRIFT  **Source**: A1:T-061..066 + A2:G-059
**File**: `web/src/app/page.tsx:3,278`; `web/src/lib/permissions.js:7,16,160`; `web/src/app/story/[slug]/page.tsx`; `web/src/components/Interstitial.tsx`; `admin/subscriptions/page.tsx`; `admin/features/page.tsx`

---

## Retest-pending (carried over from legacy WORKING.md)

### T-100 — LB-001 retest: "Start Reading" onboarding stuck
**Priority**: P2  **Effort**: S  **Lens**: UX  **Source**: WORKING.md (Pass 16+17 fixes applied)
**What to do**: Draft passive retest checklist; owner runs it; close if clean.
**Accept**: New user signs up, clicks "Start Reading", lands on home feed without stall.

### T-101 — LB-023 retest: Mobile home feed oscillates error/loaded
**Priority**: P2  **Effort**: S  **Lens**: UX  **Source**: WORKING.md (Pass 16 defensive memoization applied)
**What to do**: Retest on mobile viewport; confirm no flicker between error state and loaded feed.
**Accept**: Home feed renders stably on 375px viewport across 10+ reloads.

---

## Needs live-check

Agent 3 tagged these `? UNCERTAIN`; re-verify file:line before acting:
T-020, T-021, T-041, T-042, T-043, T-046, T-050, T-051, T-052, T-053, T-058, T-060, T-068, T-070, T-071, T-073, T-075, T-076, T-077, T-078, T-079, T-081

---

## Closed during this session (historical reference only)

The 56 fixes landed in the 2026-04-20 batch session — do NOT redo. See `BATCH_FIXES_2026_04_20.md`.

- role-grant atomicity via `grant_role_atomic` RPC
- permission-set Phase 2 user-centric console
- `lib/permissions.js` role-allow fast-path
- `rolesAtLeast()` server helper (partial — see T-019)
- Phase B `permission_sets` seed (21 sets, 3075 mappings)
- admin-verified stamp on 14 routes
- Round 9 expert Q&A shape TODO (residual in T-074)
- CSP Report-Only wiring (enforce flip shipped 2026-04-20)
- Access-request & appeals rate-limit seed
- `record_admin_action` audit-log adoption on 12 routes
- `require_outranks` RPC addition
- Kids session JWT hardening for pair path (residual T-046)
- `api/account/{delete, onboarding, login-cancel-deletion}` consolidation
- Stripe portal route
- verify-email page (partial — T-071)
- pick-username debounce (partial — T-071)
- admin/comments saveTimeout (partial — T-071)
- Rate-limit Retry-After on 9 of 22 routes (13 remain — T-025)
- `/api/reports` profanity_filter wiring
- `/api/kids/verify-pin` 3-fail 60s lock (still not enough — T-045)
- Middleware ALLOWED_ORIGINS skeleton (www gap — T-027)
- `getSettings` helper adoption in reports/route.js (broader in T-048)
- 7 kid Swift files Dynamic-Type (11 remain — T-043)
- 34 other BATCH_FIXES entries

---

## Synthesis decisions

1. Merged T-001/G-025 → T-003 (rate_limits).
2. Collapsed T-022/G-004..G-010 → T-016 (plan features).
3. Collapsed T-023/G-014..G-017 → T-017 (home) + T-018 (admin categories).
4. Collapsed T-024/G-011..G-013 → T-019 (rolesAtLeast).
5. Collapsed T-002/T-097/G-037..G-041 → T-013 (error.message sweep); count corrected 290→115.
6. Escalated G-019 → P0 (T-002: active admin harm).
7. Escalated G-029 → P0 (T-012: silent cron drop).
8. Escalated T-015 → P0 (T-005: bypasses `require_outranks`).
9. Dropped T-053 (@admin-verified drift); folded into T-067 admin TS hygiene.
10. Corrected T-030 line 108→127; noted `achievements.name` not `display_name`; `score_rules.action` not `key`; categories=69 not 67; 86 Kids font gaps exact.
11. Added A3 net-new: NEW-001→T-057; NEW-005→T-069; NEW-006→T-005 (escalate); NEW-007→T-010 (merge); NEW-008→T-042.
12. Collapsed P3 interval/debounce cleanup (T-034..T-037) into rollup T-071.
13. Collapsed P3 iOS dead-code (T-043..T-046) into T-074.
14. Collapsed P3 new-table batch (T-027..T-030) into T-082.
15. Collapsed P4 misc deferred (T-061..T-066) + G-059 into T-099.
