# Gap + DB-Drift Tasks — Agent 2

Mode: no prior-context, DB-first drift detection. Supabase project `fyiwulqphgmoqullmrfn`.

Tables sampled: `roles`, `categories`, `plans`, `plan_features`, `permissions` (992 rows), `permission_sets` (21 rows), `achievements`, `settings`, `score_rules`, `score_tiers`, `rate_limits` (empty), `feature_flags`, `email_templates`, `app_config` (empty), `blocked_words` (empty), `reserved_usernames` (empty).

---

## Part A — Hardcoded data that already lives in Supabase

### G-001 — `score_tiers` vs hardcoded tier map in `profile/page.tsx`
- **Priority**: P0
- **Effort**: M
- **Lens**: DB-DRIFT
- **Live DB source**: `score_tiers` has 6 rows — `newcomer (0-99)`, `reader (100-299)`, `informed (300-599)`, `analyst (600-999)`, `scholar (1000-1499)`, `luminary (1500+)`.
- **Hardcoded copy**: `web/src/app/profile/page.tsx:60-79` defines `TIER_META` with tier keys `newcomer / reader / contributor / trusted / distinguished / luminary` and thresholds `0 / 100 / 500 / 2000 / 5000 / 10000`. Both the keys (`contributor/trusted/distinguished`) and the numeric thresholds are **completely different** from the live DB.
- **What to do**: Fetch `score_tiers` (cached), render from DB. Either rename DB rows to match copy or rename code tiers to DB. Currently a user with score=300 is labelled `contributor` in UI but maps to `informed` in DB logic.
- **Acceptance**: `tierFor()` reads from cached `getScoreTiers()`; no hardcoded threshold literals.

### G-002 — Same tier mismatch in `admin/users/page.tsx`
- **Priority**: P0
- **Effort**: S
- **Lens**: DB-DRIFT
- **Live DB source**: `score_tiers` (see G-001).
- **Hardcoded copy**: `web/src/app/admin/users/page.tsx:53-70` — duplicate `TIERS` object with same wrong 6 keys and thresholds as G-001.
- **What to do**: Share helper with G-001.
- **Acceptance**: Single `lib/scoreTiers.js` helper consumed by both pages.

### G-003 — `plans` duplicated by `PLAN_OPTIONS` constant
- **Priority**: P1
- **Effort**: S
- **Lens**: DB-DRIFT
- **Live DB source**: `plans` has 9 rows, name+display_name+tier+price_cents+billing_period.
- **Hardcoded copy**: `web/src/app/admin/users/page.tsx:90-100` — `PLAN_OPTIONS` hard-lists all 9 plan names and labels. If owner activates a tenth plan (or renames `verity_monthly`), admin UI silently misses it.
- **What to do**: Fetch `plans` where `is_active=true` ordered by `sort_order`; map to the dropdown.
- **Acceptance**: No plan names appear as string literals in page.tsx.

### G-004 — `plans` prices duplicated in `lib/plans.js:PRICING`
- **Priority**: P1
- **Effort**: M
- **Lens**: DB-DRIFT
- **Live DB source**: `plans.price_cents` — 399/3999, 999/9999, 1499/14999, 1999/19999.
- **Hardcoded copy**: `web/src/lib/plans.js:111-128` — cents values duplicated verbatim in `PRICING`. File comment even says "Matches plans seed block exactly." If the owner updates price in `/admin/plans`, UI keeps showing old price.
- **What to do**: `PRICING` → derived from `getPlans()` at call sites; keep `planName` mapping only as an id→tier+cycle helper.
- **Acceptance**: Zero `cents:` literals inside `lib/plans.js`.

### G-005 — `plans.description` bullet lists duplicated in `TIERS[*].features`
- **Priority**: P2
- **Effort**: M
- **Lens**: DB-DRIFT
- **Live DB source**: `plans.description` + `plan_features.feature_key/is_enabled/limit_value` — full join yields each tier's feature set.
- **Hardcoded copy**: `web/src/lib/plans.js:20-108` — `TIERS.free.features`, `TIERS.verity.features`, etc. Every plan gets a hand-typed bullet list (e.g. "10 bookmarks", "1 breaking-news alert per day", "Streak freezes — 2 per week") that duplicates `plan_features` rows.
- **What to do**: Render feature bullets from a `plan_features` query (with a mapping table for human copy, or use `feature_name` column already present).
- **Acceptance**: Pricing/help UI shows what the DB says.

### G-006 — `plans.max_family_members` duplicated by `maxKids`
- **Priority**: P1
- **Effort**: 1L
- **Lens**: DB-DRIFT
- **Live DB source**: `plans.max_family_members` + `plans.metadata.max_kids` — `verity_family=2`, `verity_family_xl=4`.
- **Hardcoded copy**: `web/src/lib/plans.js:25,45,69,82,97` — `maxKids: 0 / 0 / 0 / 2 / 4`.
- **What to do**: Delete the field; use `planRow.max_family_members`.
- **Acceptance**: grep `maxKids` → 0 hits.

### G-007 — `plan_features.bookmarks.limit_value=10` vs `FREE_BOOKMARK_CAP`
- **Priority**: P0
- **Effort**: 1L
- **Lens**: DB-DRIFT
- **Live DB source**: `plan_features` free plan `bookmarks.limit_value=10, limit_type=max`.
- **Hardcoded copy**: `web/src/app/bookmarks/page.tsx:14` — `const FREE_BOOKMARK_CAP = 10;` used on :77 and :200 for CTA copy.
- **What to do**: `planLimit(planKey,'bookmarks')` helper from `plan_features` cache.
- **Acceptance**: UI shows whatever the admin updates the DB cap to.

### G-008 — `plan_features.streak_freeze.limit_value=2` hard-coded in plan copy
- **Priority**: P2
- **Effort**: 1L
- **Lens**: DB-DRIFT
- **Live DB source**: `plan_features` pro plans: `streak_freeze.limit_value=2, limit_type=per_week`.
- **Hardcoded copy**: `web/src/lib/plans.js:73` — `'Streak freezes — 2 per week'` string literal.
- **What to do**: template from `plan_features`.
- **Acceptance**: owner can change cap without code push.

### G-009 — `plan_features.quiz_attempts` free=2 hard-coded in ArticleQuiz copy
- **Priority**: P2
- **Effort**: 1L
- **Lens**: DB-DRIFT
- **Live DB source**: `plan_features` free `quiz_attempts.limit_value=2, limit_type=per_article`.
- **Hardcoded copy**: `web/src/components/ArticleQuiz.tsx:316` — "You've used both free attempts on this article."
- **What to do**: parameterise copy with actual limit.
- **Acceptance**: copy matches DB value.

### G-010 — `plan_features.breaking_alerts` free=1/day duplicated in cron + copy
- **Priority**: P2
- **Effort**: S
- **Lens**: DB-DRIFT
- **Live DB source**: `plan_features` free `breaking_alerts.limit_value=1, limit_type=per_day`.
- **Hardcoded copy**: `web/src/lib/plans.js:32` '1 breaking-news alert per day'; `web/src/app/api/cron/send-push/route.js:88,145,148` cap logic with inline comment "D14 cap: free users get 1 breaking-news push per day" but uses a hardcoded count rather than reading DB limit.
- **What to do**: Read `plan_features.breaking_alerts.limit_value` at cron-run; template copy.
- **Acceptance**: one DB-sourced cap.

### G-011 — `roles.hierarchy_level` duplicated by `ROLE_ORDER`
- **Priority**: P1
- **Effort**: S
- **Lens**: DB-DRIFT
- **Live DB source**: `roles` table has 9 rows with `hierarchy_level` 10/50/50/50/60/70/80/90/100 for user/educator/expert/journalist/moderator/editor/admin/superadmin/owner.
- **Hardcoded copy**: `web/src/app/admin/users/page.tsx:75` — `const ROLE_ORDER = ['user','expert','educator','journalist','moderator','editor','admin','superadmin','owner']`. `rolesUpTo(highest)` uses index — will silently break if a custom role with hierarchy_level=65 is added to DB.
- **What to do**: Fetch active roles ordered by `hierarchy_level`; slice by current user's max level.
- **Acceptance**: new DB role auto-appears in dropdown.

### G-012 — Roles array duplicated in `admin/moderation/page.tsx`
- **Priority**: P2
- **Effort**: 1L
- **Lens**: DB-DRIFT
- **Live DB source**: `roles` (same as G-011).
- **Hardcoded copy**: `web/src/app/admin/moderation/page.tsx:26` — `const ROLES = ['moderator','editor','admin','expert','educator','journalist']`.
- **What to do**: query `roles` filtering to non-owner tiers.
- **Acceptance**: 1 source of truth.

### G-013 — Role-name Sets duplicated across layers
- **Priority**: P2
- **Effort**: M
- **Lens**: DB-DRIFT
- **Live DB source**: `roles.name` + `roles.hierarchy_level`.
- **Hardcoded copy**: `web/src/lib/roles.js:18-22` — `OWNER_ROLES`, `ADMIN_ROLES`, `EDITOR_ROLES`, `MOD_ROLES`, `EXPERT_ROLES`. Each re-enumerates the 9 role names in hierarchy order. `api/expert-sessions/questions/[id]/answer/route.js:17` also has a separate `MOD_ROLES` Set. `admin/users/[id]/permissions/page.tsx:38` has its own `MOD_ROLES = ['owner','superadmin','admin']`.
- **What to do**: Server helper `rolesAtLeast(level)` using `roles.hierarchy_level`; remove all three copies.
- **Acceptance**: grep `MOD_ROLES|ADMIN_ROLES|EDITOR_ROLES` → 0 hits outside a single helper.

### G-014 — `categories` table duplicated by `FALLBACK_CATEGORIES`
- **Priority**: P1
- **Effort**: S
- **Lens**: DB-DRIFT
- **Live DB source**: `categories` has 67 rows with slug/name.
- **Hardcoded copy**: `web/src/app/page.tsx:83-109` — `FALLBACK_CATEGORIES` hand-lists 24 category rows (with wrong `parent_user_id` naming convention that looks copied from elsewhere). Also `FALLBACK_SUBCATEGORIES` at :111+ duplicates slug/name pairs that already exist in `categories` (e.g. `congress`, `supreme-court`, `white-house`, `elections` are all first-class categories in DB, not subs).
- **What to do**: Drop the fallback; accept that page needs to hit Supabase to render (or SSR-fetch with cache). If retained as a true fallback, source from a build-time pull of `categories`.
- **Acceptance**: no `fb-*` ids in app code.

### G-015 — `categories` duplicated by `ALL_CATEGORIES` in `admin/pipeline/page.tsx`
- **Priority**: P2
- **Effort**: 1L
- **Lens**: DB-DRIFT
- **Live DB source**: `categories` (67 rows).
- **Hardcoded copy**: `web/src/app/admin/pipeline/page.tsx:42` — `['Technology','Business','Science','Health','Climate','World','Politics','Sports','Entertainment']`. Admin pipeline page hides the other 58 categories.
- **What to do**: query `categories` where `is_kids=false`.
- **Acceptance**: all active adult categories selectable.

### G-016 — `categories` duplicated by `CATEGORIES` in `admin/story-manager/page.tsx`
- **Priority**: P1
- **Effort**: 1L
- **Lens**: DB-DRIFT
- **Live DB source**: `categories`.
- **Hardcoded copy**: `web/src/app/admin/story-manager/page.tsx:25-31` — `CATEGORIES = ['Politics','Technology','Business','Science','Health','World','Environment']` and a handmade `SUBCATEGORIES` map at :29+. Also defaults `category: 'Politics'` on :58 and falls back to `'Politics'` on :205.
- **What to do**: DB-sourced dropdown.
- **Acceptance**: editor sees every active category.

### G-017 — Categories duplicated in cohorts filter options
- **Priority**: P3
- **Effort**: 1L
- **Lens**: DB-DRIFT
- **Live DB source**: `categories`.
- **Hardcoded copy**: `web/src/app/admin/cohorts/page.tsx:95` — favoriteCategory options list identical 10-category shortlist.
- **What to do**: DB source.
- **Acceptance**: admin can cohort by any category.

### G-018 — Expert-signup expertise fields invented, not DB-linked
- **Priority**: P2
- **Effort**: S
- **Lens**: DB-DRIFT
- **Live DB source**: `categories` (adult) + `expert_application_categories` table.
- **Hardcoded copy**: `web/src/app/signup/expert/page.tsx:27-40` — `EXPERTISE_FIELDS` = 12 hand-named strings ("Politics & Government", "Science & Research", …). These don't match any slug or name in `categories`, so `expert_application_categories` inserts may store freetext that never joins back to a real category.
- **What to do**: map selections to `categories.id`.
- **Acceptance**: expert app FK-joinable to categories.

### G-019 — `achievements` table duplicated by `ACHIEVEMENTS` labels
- **Priority**: P1
- **Effort**: 1L
- **Lens**: DB-DRIFT
- **Live DB source**: `achievements` has 26 keys (streak_7, bookworm_10, first_read, score_100…).
- **Hardcoded copy**: `web/src/app/admin/users/page.tsx:83-86` — `ACHIEVEMENTS = ['Early Adopter','Streak Master','Quiz Champion','Top Contributor','Fact Checker','Community Pillar','News Hound','Deep Diver']`. **None of these 8 labels exist in the DB achievements table** — the admin "award achievement" dropdown would insert names that don't match any `achievements.key`.
- **What to do**: Query `achievements` ordered by name, show `display_name` labels with `key` values.
- **Acceptance**: admin award actually grants a real achievement.

### G-020 — `settings.comment_max_length=4000` not read by web client
- **Priority**: P2
- **Effort**: S
- **Lens**: DB-DRIFT
- **Live DB source**: `settings.comment_max_length='4000'`.
- **Hardcoded copy**: enforced in SQL (`schema/013_phase5_comments_helpers.sql:88,366`) but web composer has no corresponding char counter. User can type past 4000 and get a server rejection rather than inline feedback.
- **What to do**: Fetch `comment_max_length` from settings on comment composer mount.
- **Acceptance**: char counter in comment composer matches DB.

### G-021 — `settings.context_pin_min_count / context_pin_percent` only enforced server-side
- **Priority**: P3
- **Effort**: S
- **Lens**: DB-DRIFT
- **Live DB source**: `settings` (5 and 10).
- **Hardcoded copy**: no web UI surfaces these thresholds to users; but the admin settings page should display current values. Grep found zero client uses.
- **What to do**: show current thresholds in comment guidelines page.
- **Acceptance**: DB values rendered in UI.

### G-022 — `settings.supervisor_eligibility_score=500` — only read in one place
- **Priority**: P3
- **Effort**: 1L
- **Lens**: DB-DRIFT
- **Live DB source**: `settings.supervisor_eligibility_score='500'`.
- **Hardcoded copy**: Correctly read in `profile/settings/page.tsx:2742`; but also mentioned in `schema/reset_and_rebuild_v2.sql:3384` as `context_pin.min_tags` (dotted key) not matching live key `context_pin_min_count`. Settings key drift on disk.
- **What to do**: align schema seed with live key names.
- **Acceptance**: reset_and_rebuild_v2 keys == live keys.

### G-023 — `settings.breaking_alert_cap_free=1` not read by cron
- **Priority**: P2
- **Effort**: S
- **Lens**: DB-DRIFT
- **Live DB source**: `settings.breaking_alert_cap_free='1'`.
- **Hardcoded copy**: `web/src/app/api/cron/send-push/route.js` caps with inline constant `1`. Also see G-010 — both `settings` and `plan_features` encode this twice, and neither is read by cron.
- **What to do**: single source of truth (recommend `plan_features` since it's plan-scoped).
- **Acceptance**: cron reads from DB, not a hardcoded 1.

### G-024 — `score_rules.points` duplicated by quiz scoring literals
- **Priority**: P2
- **Effort**: S
- **Lens**: DB-DRIFT
- **Live DB source**: `score_rules` — quiz_correct=10, quiz_perfect=25, read_article=5, streak_day=5, streak_7=25, streak_30=100, streak_90=250, streak_365=1000, post_comment=3, receive_upvote=2, community_note=15, daily_login=1, first_quiz_of_day=5.
- **Hardcoded copy**: `web/src/app/admin/story-manager/page.tsx:560` — `points: 10` (quiz scoring); `web/src/app/admin/kids-story-manager/page.tsx:439` — `points: 10`. Likely others inside `lib/scoring.js` (only comments grep; worth a read).
- **What to do**: `getScoreRule('quiz_correct').points`.
- **Acceptance**: changing DB rule re-prices quiz.

### G-025 — `rate_limits` table is EMPTY but `/admin/system` has 10 hardcoded defaults
- **Priority**: P0
- **Effort**: M
- **Lens**: DB-DRIFT
- **Live DB source**: `rate_limits` — **0 rows**.
- **Hardcoded copy**: `web/src/app/admin/system/page.tsx:62-73` — `RATE_LIMIT_DEFAULTS` with 10 endpoints (comment_posting, quiz_attempts, access_code_requests, username_lookups, login_attempts, api_general, search_queries, upvotes, report_submission, profile_updates). Admin page appears to let you edit them, but there's nothing in DB — so either: (a) edits don't persist (changes UI-only), or (b) upsert-on-save creates first rows. In both cases grep `rateLimit` shows actual enforcement uses `lib/rateLimit.js` which is in-memory, not DB-backed.
- **What to do**: Seed `rate_limits` with the 10 entries; have `lib/rateLimit.js` read from DB (cached).
- **Acceptance**: admin/system page reads/writes rate_limits rows; enforcement honours DB changes.

### G-026 — `blocked_words` table is EMPTY but admin UI exists
- **Priority**: P2
- **Effort**: 1L
- **Lens**: DB-DRIFT
- **Live DB source**: `blocked_words` — **0 rows**.
- **Hardcoded copy**: `web/src/app/admin/words/page.tsx` exposes add/edit but nothing is seeded; `admin/comments/page.tsx:92` toggles `profanity_filter` with hardcoded `profanity_cooldown=30`.
- **What to do**: ship a starter list + ensure `blocked_words` is queried by the comment-post path.
- **Acceptance**: profanity filter actually rejects a seeded word.

### G-027 — `reserved_usernames` table is EMPTY
- **Priority**: P1
- **Effort**: 1L
- **Lens**: DB-DRIFT
- **Live DB source**: `reserved_usernames` — **0 rows**. Means signup can claim `admin`, `support`, `root`, `null`, `undefined`, `system`, `owner`, `verity`, `veritypost`, etc.
- **Hardcoded copy**: none on client; `admin/words/page.tsx` exposes management. But no ship-time seed.
- **What to do**: Seed ~50 reserved names (org roles, system, brand, common reserved).
- **Acceptance**: signup rejects a reserved handle.

### G-028 — `app_config` is EMPTY — unused table?
- **Priority**: P3
- **Effort**: S
- **Lens**: DB-DRIFT
- **Live DB source**: `app_config` — 0 rows. Columns suggest iOS/Android remote config (`platform`, `min_app_version`, `country_codes`).
- **Hardcoded copy**: no code grep matches; looks like a planned feature that never shipped.
- **What to do**: Either seed (e.g. `min_supported_ios_version`) or drop the table. It's a live empty table that's just noise.
- **Acceptance**: table has rows or is removed.

### G-029 — `email_templates.kid_trial_day6 / kid_trial_expired` only 6 rows, no seed drift check
- **Priority**: P3
- **Effort**: S
- **Lens**: DB-DRIFT
- **Live DB source**: `email_templates` has 6 active templates.
- **Hardcoded copy**: `web/src/app/api/cron/send-emails/route.js:19-25` — `TYPE_TO_TEMPLATE` maps 7 notification types to template keys (weekly_reading_report, weekly_family_report, breaking_news_alert, kid_trial_day6, kid_trial_expired, data_export_ready, expert_reverification_due). But DB only has 6 active templates — the `data_export_ready` template key is mapped on client but **does not exist** in `email_templates`; a data_export notification would be silently dropped as "ineligible".
- **What to do**: Seed `data_export_ready` template row.
- **Acceptance**: cron finds all 7 templates.

### G-030 — Verity-Score tier breakpoints in profile UI use wrong tier scheme
- **Priority**: P0
- **Effort**: 1L
- **Lens**: DB-DRIFT
- **Live DB source**: See G-001 — `score_tiers` max breakpoint is 1500 (luminary from 1500+).
- **Hardcoded copy**: `web/src/app/admin/users/page.tsx:64` — `if (n >= 10000) return 'luminary'`. User with score 1600 is `scholar` in DB but `contributor` in UI. User with 10001 is ??? in DB (null max_score row for `luminary`) but only then `luminary` in UI.
- **What to do**: See G-001 — same fix.
- **Acceptance**: unified tiering.

### G-031 — `permission_sets` has two overlapping schemes (role-set vs tier-set)
- **Priority**: P2
- **Effort**: M
- **Lens**: DB-DRIFT
- **Live DB source**: `permission_sets` has 21 rows split between: 10 active "role-ish" sets (`anon`, `unverified`, `free`, `pro`, `expert`, `admin`, `moderator`, `editor`, `owner`, `family`) all `is_active=true, is_system=true`, AND 11 inactive "bundle" sets (`base`, `verified_base`, `home_browse`, `article_viewer`, `article_interactive`, `comments_base`, `verity_perks`, `verity_pro_perks`, `family_perks`, `kids_session`, `expert_tools`) all `is_active=false`.
- **Hardcoded copy**: `lib/permissionKeys.js` and various route handlers refer by key. But the `is_active=false` bundle sets are never deleted and still referenced in docs/comments. Smells like a half-finished migration.
- **What to do**: Decide — either reactivate bundle model or delete the dead rows.
- **Acceptance**: 0 `is_active=false` rows or a clear "historical" flag column.

### G-032 — `permissions.category='ui'` for all 992 rows — no segmentation
- **Priority**: P3
- **Effort**: M
- **Lens**: DB-DRIFT
- **Live DB source**: `permissions.category` is literally `'ui'` for every one of the 992 permissions sampled. The column is useless as written.
- **Hardcoded copy**: `admin/permissions/page.tsx` UI groups by key-prefix (`admin.*`, `article.*`, `billing.*`) in code rather than using `category`.
- **What to do**: Either backfill `category` values (admin, reader, billing, moderation, expert, kids) or drop the column.
- **Acceptance**: `SELECT DISTINCT category FROM permissions` returns >1.

---

## Part B — Migration drift (disk ↔ live)

### G-033 — Applied migrations with no disk file
- **Priority**: P0
- **Lens**: MIGRATION-DRIFT
- **Details**: Comparing live migrations (44 applied) to `schema/*.sql` disk files, these applied migrations have NO matching numbered disk file:
  - `20260419151950 grant_anon_free_comments_view_2026_04_19`
  - `20260419160457 create_banners_storage_bucket_2026_04_19`
  - `20260419181333 deactivate_unused_ios_keys_2026_04_19`
  - `20260419181336 drop_ticket_messages_body_html_2026_04_19`
  - `20260419181412 add_require_outranks_rpc_2026_04_19`
  - `20260419194732 092_rls_lockdown_2026_04_19`
  - `20260419195236 095_banners_bucket_lockdown_2026_04_19`
  - `20260419195245 096_function_search_path_hygiene_2026_04_19`
  - `20260419203150 092b_rls_lockdown_followup_2026_04_19`
  - `20260419203612 096_function_search_path_hygiene_2026_04_19` (DUPLICATE — same name, different ts)
  - `20260419203646 093_rpc_actor_lockdown_2026_04_19`
- **What to do**: Pull SQL for each via `pg_catalog` or `supabase_migrations.schema_migrations.statements`, commit to `schema/` with matching numbers. Repo cannot rebuild prod without these.
- **Acceptance**: every applied migration has a disk twin.

### G-034 — Disk file `094_round_e_auth_integrity_2026_04_19.sql` lives prefixed 094 but applied as `094_round_e_auth_integrity_2026_04_19`
- **Priority**: P2
- **Lens**: MIGRATION-DRIFT
- **Details**: File is on disk; migration `20260419203717 094_round_e_auth_integrity_2026_04_19` IS on live. So 094 matches. But the prefix-number/date-ordering is inconsistent (094 is older than 092 by number but newer by timestamp). Numbering no longer monotonic with time.
- **What to do**: Stop mixing numeric prefix ordering with timestamp ordering; adopt one scheme.
- **Acceptance**: documented numbering convention.

### G-035 — Disk migration-number gaps (007, 008, 052, 092, 093)
- **Priority**: P3
- **Lens**: MIGRATION-DRIFT
- **Details**: `ls schema/` prefixes go 005, 006, 009, 010, 011, …, 051, 053, 054, …, 091, 094. Files 007/008/052/092/093 missing from disk. Probably explained by rename/merge; harmless but noisy.
- **What to do**: drop the gaps in a renumber PR or leave a `RESERVED` placeholder.
- **Acceptance**: either contiguous or documented.

### G-036 — Duplicate applied migration `096_function_search_path_hygiene_2026_04_19`
- **Priority**: P2
- **Lens**: MIGRATION-DRIFT
- **Details**: Live list shows two rows with name `096_function_search_path_hygiene_2026_04_19` at timestamps `20260419195245` and `20260419203612` — second one clobbers the first. Only one disk file, number unknown.
- **What to do**: investigate; if intentional (re-apply) rename the second to `_v2`.
- **Acceptance**: unique migration names.

---

## Part C — Error.message still leaking

Full grep: **290 occurrences across 130 files** in `web/src/app/api/`. Every one of these returns the raw PostgREST / Stripe / OpenAI / Apple error string to the client, which can leak SQL column names, constraint identifiers, Stripe customer IDs, etc. Each file is a separate task (P1) — sample high-traffic ones below, but fix sweep should cover all 130:

### G-037 — Stripe leakage
- `api/stripe/checkout/route.js:21,64`, `api/stripe/portal/route.js:11,28`, `api/stripe/webhook/route.js:167`, `api/billing/change-plan/route.js` (×2), `api/billing/resubscribe/route.js` (×2), `api/billing/cancel/route.js` (×2). **Priority: P0** — Stripe errors may include customer/price IDs.

### G-038 — Auth / account leakage
- `api/auth/callback/route.js:1`, `api/account/onboarding/route.js:21`, `api/account/delete/route.js` (×2), `api/account/login-cancel-deletion/route.js:39`, `api/auth/resend-verification/route.js:1`. **Priority: P0** — auth errors include user existence hints.

### G-039 — Admin routes leaking DB errors
- 40+ files under `api/admin/**` return `error.message`. E.g. `api/admin/users/[id]/roles/route.js` (×5), `api/admin/permission-sets/[id]/route.js` (×4), `api/admin/stories/route.js` (×3), `api/admin/recap/[id]/route.js` (×5). **Priority: P2** — admin-gated but still leaks schema.

### G-040 — User-facing features leaking PostgREST
- `api/comments/[id]/route.js` (×4), `api/bookmarks/[id]/route.js` (×4), `api/kids/route.js` (×4), `api/expert-sessions/route.js` (×4), `api/messages/route.js` (×2), `api/search/route.js:93`, `api/reports/route.js:1`. **Priority: P1** — reveals RLS reasons.

### G-041 — Cron jobs leaking internals
- `api/cron/send-emails/route.js:44`, `api/cron/process-deletions/route.js:21`, `api/cron/freeze-grace/route.js:20`, `api/cron/sweep-kid-trials/route.js:1`, `api/cron/flag-expert-reverifications/route.js:1`, `api/cron/recompute-family-achievements/route.js:1`. **Priority: P2** — cron endpoints are authed but log via plain `NextResponse.json({error})`.

**Recommended pattern (single fix lands all 130)**:
```js
import { apiError } from '@/lib/apiErrors';
if (error) return apiError(error, 'bookmark.create.failed', 400);
```
`apiError()` already exists in `src/lib/apiErrors.js` — just needs to replace every site where a raw `error.message` is returned. Sentry keeps the detail, client gets a stable code.

---

## Part D — Swift Dynamic Type gaps

### G-042 — VerityPostKids: 86 `.font(.system(size: N))` across 11 files
- **Priority**: P2
- **Lens**: A11Y
- **Files**: BadgeUnlockScene.swift (6), GreetingScene.swift (9), KidPrimitives.swift (7), ParentalGateModal.swift (11), QuizPassScene.swift (10), StreakScene.swift (6), ProfileView.swift (6), LeaderboardView.swift (5), ExpertSessionsView.swift (11), KidQuizEngineView.swift (13), TabBar.swift (2).
- **What to do**: Swap to `.font(.title)`, `.font(.headline)`, etc., or use `@ScaledMetric var size: CGFloat = 14`. Kids app ignoring Dynamic Type means text stays fixed for users with large-text accessibility setting — App Store accessibility review risk.
- **Acceptance**: 0 raw `size:` literals in the Kids app.

### G-043 — Main VerityPost app has 2 leftover `.font(.system(size:…))` in `Theme.swift`
- **Priority**: P3
- **Lens**: A11Y
- **File**: `VerityPost/VerityPost/Theme.swift:2` (two occurrences).
- **What to do**: Replace with `.scaledFont` helper.
- **Acceptance**: 0 hits.

---

## Part E — Stale TODOs / FIXMEs

Small, manageable set:

### G-044 — `middleware.js:136` `TODO(flip-2026-04-21)` — due in 2 days
- File references `api/csp-report`. Action: flip CSP from report-only to enforce on or after 2026-04-21 once telemetry is clean.

### G-045 — `api/csp-report/route.js:4` — same deadline sibling TODO
- File will be deletable once CSP flips to enforce.

### G-046 — `components/kids/OpenKidsAppButton.tsx:3` and `app/kids-app/page.tsx:1` — "swap to real App Store URL once app is published"
- Owner-facing: get App Store URL when Kids app ships.

### G-047 — `admin/analytics/page.tsx:172,341` — 30d/90d filter hidden; quiz edit not wired
- Functional gaps left deliberately; either wire them or document why hidden.

### G-048 — `profile/settings/page.tsx:136,143,215,3531,3604` — 5 `TODO(owner)` comments about future first-class columns / web push
- Tracked but no ticket; needs conversion to GH issues.

### G-049 — `admin/users/page.tsx:280` — "move to a server route"
- Inline client mutation should be server-side; moderate security concern (depends on RLS).

### G-050 — Swift: `VerityPost/KidsAppLauncher.swift:11` + `StoryDetailView.swift:1280`
- Kids App Store URL TODO (same as G-046); `round9-expert-qa-shape` TODO flags a schema redesign (expert_discussions title/body/parent_id vs expected question/answer cols).

---

## Part F — Other misc findings

### G-051 — `feature_flags` only has ONE row (`v2_live=true`) — UI-level targeting columns unused
- **Priority**: P3
- **Lens**: DB-DRIFT
- Columns `rollout_percentage`, `target_platforms`, `target_cohort_ids`, `variant`, `is_killswitch`, `expires_at` all designed for rich rollouts; real feature gates live in code (`src/lib/featureFlags.js`). Either consolidate or drop the columns.

### G-052 — `profile/[id]/page.tsx` has its own `quizAttempts` reducer
- **Priority**: P3
- In-code reimplementation of what `quiz_attempts` table already stores aggregated. Duplicates logic.

### G-053 — `lib/plans.js` comment header claims "9 DB plan rows" — verify on every PR
- **Priority**: P3
- Today matches. But the comment should be replaced by a runtime assertion that reads `count(plans)` and warns in dev if diverges.

### G-054 — `schema/reset_and_rebuild_v2.sql:3384-3385` uses dotted keys (`context_pin.min_tags`) while live uses snake_case (`context_pin_min_count`)
- **Priority**: P1
- **Lens**: MIGRATION-DRIFT
- Any fresh bootstrap from reset_and_rebuild_v2 would produce a DB whose settings keys don't match the code readers (which look up `context_pin_min_count`). Repo's bootstrap is broken for a clean env.

### G-055 — Localhost port `3333` hardcoded alongside env-var fallback
- **Priority**: P3
- **Files**: `api/auth/callback/route.js:46`, `api/auth/signup/route.js:33`, `api/auth/reset-password/route.js:31`, `api/account/delete/route.js:27`. All use `process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3333'`. OK pattern — but port 3333 is nonstandard; most Next.js installs default to 3000. Could confuse new contributors. Align with `middleware.js:93-94` which lists BOTH 3000 and 3333.

### G-056 — Google Play subscription URL hardcoded in settings
- **Priority**: P3
- `profile/settings/page.tsx:3135,3328` — hardcodes `https://play.google.com/store/account/subscriptions`. Fine — this IS a public URL, just noting for completeness.

### G-057 — `ACHIEVEMENTS` table has no `earning_criteria` coupling to code
- **Priority**: P2
- **Lens**: DB-DRIFT
- `achievements.key` (e.g. `bookworm_10`, `streak_7`) encodes the threshold in the key itself; `lib/scoring.js` re-derives thresholds from comments ("checks read_count, quiz_pass_count, comment_count, streak_days"). There's no explicit rule column. If owner changes "bookworm_10" to require 20, they'd need to rename the key + update code — no admin-editable path.
- **What to do**: Add `threshold` + `kind` columns to `achievements`; drive detection from DB.
- **Acceptance**: owner can tune thresholds.

### G-058 — `how-it-works/page.tsx` + `help/page.tsx` price strings hardcoded
- **Priority**: P2
- `help/page.tsx:57` — `"Verity ($3.99/mo) adds reduced ads…"`, `"Pro ($9.99/mo)"`, `"Family ($14.99/mo)"`. Duplicates `plan_features` + `plans.price_cents`. If price changes in DB, marketing copy won't.

### G-059 — `admin/subscriptions/page.tsx`, `admin/features/page.tsx` duplicate plan key lists
- **Priority**: P3
- **Lens**: DB-DRIFT
- Grep showed these files reference specific plan names. Verify they query `plans` instead of hard-coding.

### G-060 — `permission_sets` descriptions mention "Verity+" (plus-sign) which never appears in plan marketing
- **Priority**: P3
- **Lens**: COPY-DRIFT
- DB has `"Verity+: DMs, follows, mentions..."` in `verity_perks.description` but marketed tier is `Verity` (no plus). Cosmetic but a copy-audit miss.

---

## Closing stats

- **Total tasks**: 60 (G-001 through G-060)
- **Part A (DB-drift)**: 32 tasks across 14 tables (`score_tiers`, `plans`, `plan_features`, `roles`, `categories`, `achievements`, `settings`, `score_rules`, `rate_limits`, `blocked_words`, `reserved_usernames`, `app_config`, `email_templates`, `permission_sets`)
- **Part B (migration drift)**: 4 tasks — **11 applied migrations missing from disk**, 1 duplicate applied name, 5-number prefix gaps
- **Part C (error.message leak)**: 290 occurrences across 130 API route files — 1 pattern fix lands all
- **Part D (Swift Dynamic Type)**: 88 occurrences (86 kids + 2 adult)
- **Part E (stale TODOs)**: 7 groups, 2 with imminent deadline (2026-04-21)
- **Part F (other)**: 10 tasks

P0 tasks: G-001, G-002, G-007, G-025, G-030, G-033, G-037, G-038.
