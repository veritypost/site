# AuditV2 — Discrepancies & Contradictions

Companion to `v1 questions.md` (V1's doc-zone audit) and `OwnerQuestions.md` (owner-decision items). This file inventories every contradiction, doc-vs-code drift, schema bug, and questionable finding surfaced by AuditV2 (which extended into code, schema, iOS, and live DB — zones V1 had not reached).

For each: what each side says, what's actually true, and the resolution path.

Where V2 ran live verification (grep, MCP, file read), the answer is asserted with citation. Where V2 carried Wave 1 inventory secondhand, the item is marked **needs verification** and pinned for Wave 4 / mechanical close-out.

---

## A. CLAUDE.md says X; code/state says Y

V2's confirmations of V1's A-section, plus V2-specific catches.

### A-1. Apple Developer account
Same as V1 A-1 with V2's added evidence.
- **CLAUDE.md (lines 35-39):** "owner does not yet have an Apple Developer account"
- **Memory `project_apple_console_walkthrough_pending.md` (2026-04-25, today):** "Owner is enrolled. Account active. APNs / SIWA / signing keys all present. Apple block lifted. BBB.* items are now code-shippable."
- **ROTATIONS.md:** Team `FQCAS829U7`, APNs key, SIWA service ID, App IDs all listed.
- **Resolution:** rewrite CLAUDE.md Apple-block paragraph. Mark dev-account active.

### A-2. FALLBACK_CATEGORIES hardcode
Same as V1 A-2.
- **CLAUDE.md repo-tree comment:** "FALLBACK_CATEGORIES hardcode still there — tracked in MASTER_TRIAGE_2026-04-23.md"
- **Code (V2 verified):** `grep -c "FALLBACK_CATEGORIES" web/src/app/page.tsx` = 0. page.tsx reads from `articles.hero_pick_for_date` directly (lines 89, 202-203).
- **MASTER_TRIAGE search:** zero hits. No triage entry by that name either.
- **Resolution:** delete the CLAUDE.md comment.

### A-3. ParentalGate zero callers
Same as V1 A-3 — V2 re-verified.
- **CLAUDE.md tree:** "ParentalGateModal.swift — defined, zero callers (T-tbd)"
- **V2 verified via grep:** 4 callers in `VerityPostKids/VerityPostKids/`:
  - `ProfileView.swift:48` (unpair gate)
  - `ProfileView.swift:51` (legal links gate)
  - `ExpertSessionsView.swift:85` (parent gate)
  - `PairCodeView.swift:143` (help mailto gate)
- **Resolution:** delete CLAUDE.md claim.

### A-4. Rules-of-hooks disable count
Same as V1 A-4 — V2 re-verified.
- **CLAUDE.md:** "23 rules-of-hooks disables"
- **V2 verified via grep:** 25 disables in `app/recap/page.tsx`, `app/recap/[id]/page.tsx`, `app/u/[username]/page.tsx`, `app/welcome/page.tsx`. None in `lib/`.
- **Resolution:** update CLAUDE.md count + location.

### A-5. Settings page line count
- **CLAUDE.md:** "the 3800-line settings page"
- **Code (V2 verified):** `wc -l web/src/app/profile/settings/page.tsx` = **5247 lines**.
- **Resolution:** update CLAUDE.md.

### A-6. Migrations 092/093/100 missing on disk (V2-only catch)
V1 didn't reach schema/. V2 verified.
- **CLAUDE.md mentions** `100_backfill_admin_rank_rpcs_*.sql` as a "backfill of live RPCs, not a real migration"
- **Filesystem:** `ls schema/092*` `093*` `100*` returns no matches
- **`grep -rln "require_outranks\|caller_can_assign_role" schema/`:** zero hits
- **pg_proc:** both RPCs exist with full bodies in DB
- **Resolution:** dump pg_proc bodies into `schema/178_recreate_admin_rank_rpcs.sql`. Update CLAUDE.md to remove the `100_backfill_*` claim.

### A-7. CLAUDE.md "Web is TypeScript" rule vs reality
- **CLAUDE.md:** "Web is TypeScript. New files are always TS. No new `.js` or `.jsx` goes into `web/src/`."
- **V2 verified count:** 218 `.js` files + 27 `.jsx` files in `web/src/`. 26 `.jsx` in `components/admin/` alone. 28 `.js` files outside `api/`.
- **Resolution:** acknowledge mass-drift; either incrementally migrate (per CLAUDE.md "migrate when you touch") or schedule bulk pass. ESLint rule for "no new .js" recommended.

---

## B. STATUS.md says X; code/state says Y

### B-1. Vercel auto-deploy
- **STATUS.md line 22:** "Hosting: Vercel — Deploys on push to main (verified 2026-04-21)"
- **CUTOVER.md lines 80-82:** "Vercel's Ignored Build Step is ON by default. Manual `vercel --prod` is the only way to ship."
- **Verification needed:** owner-side Vercel dashboard check (assistant can't see).

### B-2. Latest schema migration
- **STATUS.md line 7:** references `schema/177`
- **CLAUDE.md tree:** references `schema/100_backfill_*.sql` (doesn't exist)
- **README.md line 17:** "migrations (005-094)"
- **PM_ROLE.md lines 348-358:** lists 105-111 as "recent"
- **V2 verified via filesystem:** 169 numbered migrations through `177_grant_ai_models_select.sql` exist on disk.
- **V2 verified via DB:** `supabase_migrations.schema_migrations` log only goes through `20260420020544` (subsequent migrations applied via SQL editor paste don't update log per CLAUDE.md rule).
- **Resolution:** STATUS.md right; everything else stale.

---

## C. Schema/RPC bugs the code shows now (V2-only — V1 didn't reach schema/)

### C-1. `cleanup_rate_limit_events` references nonexistent column
- **pg_proc body:** `DELETE FROM rate_limit_events WHERE occurred_at < now() - make_interval(days => p_retention_days)`
- **information_schema.columns:** `rate_limit_events` has columns `id, rule_id, user_id, ip_address, endpoint, action, request_count, window_start, user_agent, metadata, created_at, key`. **No `occurred_at`.**
- **Live row count:** 8,562 rows (cleanup never runs)
- **Severity:** runtime bug — RPC errors on every invocation
- **Resolution:** migration to replace `occurred_at` → `created_at`
- **Open question:** does pg_cron actually schedule this? Check `cron.job` table.

### C-2. Schema 127 rollback DELETE wrong perm-key
- **Forward 126** inserts: `admin.pipeline.{clusters,presets,categories}.manage`
- **Rollback 127** deletes legacy form: `pipeline.manage_{clusters,presets,categories}`
- **Effect:** rollback never matches forward inserts; rows would remain
- **Resolution:** edit 127 OR write replacement (181) with correct keys

### C-3. 8 RPC bodies still reference dropped `superadmin` role
- **Migration 105:** dropped `superadmin` from `roles` table
- **Live `roles` table:** 8 rows, no superadmin
- **pg_proc query for `prosrc LIKE '%superadmin%'`:** matches 8 routines:
  - `_user_is_moderator`
  - `approve_expert_answer`
  - `approve_expert_application`
  - `expert_can_see_back_channel`
  - `grant_role`
  - `mark_probation_complete`
  - `reject_expert_application`
  - `revoke_role`
- **Resolution:** migration with CREATE OR REPLACE for the 8 routines

### C-4. Migration 109/111 self-supersede left dead description in F6
- **109:** created `verity_score_events` ledger
- **111:** rolled back when discovered to double-credit existing `score_events` system
- **Live tables:** `score_events` exists (663 rows); `verity_score_events` does NOT (verified via list_tables)
- **F6 §5 (lines 507-605):** still describes the rolled-back ledger as the design
- **Resolution:** F6 doc rewrite OR section-level retirement pointing at `Reference/08-scoring-system-reference.md`

### C-5. Migration 177 partial GRANT
- **177:** granted SELECT on 4 tables to `authenticated`
- **F7-era tables that exist:** ~10 (articles, pipeline_runs, pipeline_costs, feeds, feed_clusters, feed_cluster_articles, discovery_items, ai_models, ai_prompt_overrides, ai_prompt_presets, ai_prompt_preset_versions)
- **Per-table audit needed:** `SELECT tablename, has_table_privilege('authenticated', 'public.'||tablename, 'SELECT') FROM pg_tables WHERE tablename IN (...)`

### C-6. `events` parent table RLS-on, no policies (Wave A overstated)
- **Wave A:** "35 tables missing RLS"
- **Wave B:** "1 table no RLS + 14 RLS-no-policies"
- **V2 verified via pg_policies + pg_tables:** only `events` parent qualifies. RLS enabled but no policies = matches nothing except service role. Partitions (`events_*`) have RLS disabled — correct PostgreSQL pattern.
- **Resolution:** mark Wave A and Wave B counts wrong in audit tracker. `events` posture is intentional (writes via `/api/events/batch` service-role).
- **Verification needed:** confirm `/api/events/batch` uses `createServiceClient`.

---

## D. API canonical-pattern violations (V2-only)

### D-1. `import-permissions.js` calls non-existent RPC
- **Script call:** `service.rpc('bump_global_perms_version', ...)`
- **pg_proc:** RPC does not exist
- **Effect:** `--apply` falls through to a "version: 999 signal" intermediate write; global version not bumped as advertised
- **Resolution:** create the RPC OR rewrite script to use existing `bump_user_perms_version` per-user

### D-2. `hasPermissionServer` name collision
- **`web/src/lib/auth.js:201`:** uses `compute_effective_perms` + `loadEffectivePerms` cache (server)
- **`web/src/lib/permissions.js:207`:** uses `has_permission(p_key)` RPC via browser-cookie `createClient()` (client)
- **5 server importers** correctly pull from `lib/auth`
- **`web/src/lib/rlsErrorHandler.js`** pulls from `permissions.js` — possibly wrong client given server invocation context
- **Verification needed:** trace `rlsErrorHandler` end-to-end

### D-3. `/api/comments/[id]/report` missing rate limit
- **Sister `/api/reports`:** has `checkRateLimit` 10/hr
- **`/api/comments/[id]/report`:** first 40 lines show no rate-limit call
- **Verification needed:** read full file end-to-end (might be added below body parsing)

### D-4. `adminMutation.ts:84-88` skips `p_ip` / `p_user_agent`
- **`record_admin_action` RPC signature:** accepts `p_ip inet, p_user_agent text` as final two params
- **Helper at adminMutation.ts** documents an explicit FOLLOW-UP gap per Z12
- **Verification needed:** read `adminMutation.ts` directly (Q5 from GAPS)

### D-5. Wave B "registerIfPermitted never called" finding
- **V2 verified via grep:** function does NOT exist anywhere in `web/src` (zero hits)
- **Resolution:** mark Wave B finding refuted; function never existed

### D-6. Wave B "/api/access-request no auth" finding
- **V2 verified:** route is a 410 stub since 2026-04-25 owner Ext-AA1 decision (no auth needed because no functional behavior)
- **Resolution:** mark refuted

### D-7. Wave B "handlePaymentSucceeded missing perms_version bump" finding
- **V2 verified:** bump IS wired at `web/src/app/api/stripe/webhook/route.js:846`
- **Resolution:** mark refuted

### D-8. Three competing client-side admin gating patterns
- **Hardcoded `'owner'||'admin'` literals:** 6 pages (access, analytics, feeds, notifications, subscriptions, system)
- **Role-set membership** via `ADMIN_ROLES`/`MOD_ROLES`/`EDITOR_ROLES`: ~30 pages
- **`hasPermission('key')` resolver:** 4 pages (categories, permissions, prompt-presets, users) + partial in cleanup
- **CLAUDE.md "permissions matrix is platform DNA":** implies `hasPermission` is canonical
- **Resolution:** migrate the 6 hardcoded-literal pages first (P0), then the ~30 role-set pages (P1)

---

## E. iOS findings (V2-only — V1 didn't reach)

### E-1. Adult `aps-environment` entitlement missing
- **VerityPost.entitlements:** missing the entitlement
- **Code:** `PushRegistration` calls `registerForRemoteNotifications`
- **Effect:** push registration broken
- **Resolution:** add entitlement (now code-shippable per memory 2026-04-25)

### E-2. AppIcon.appiconset has no PNG
- **Z17 reports** appiconset directory empty of PNG files
- **Effect:** App Store rejects builds
- **Resolution:** generate icon set (1024×1024 master + variants)
- **Verification needed:** `ls VerityPost/VerityPost/Assets.xcassets/AppIcon.appiconset/`

### E-3. `CFBundleVersion = 1` never bumped
- **Z17 reports** never incremented
- **Effect:** App Store Connect rejects identical CFBundleVersion across uploads
- **Resolution:** establish bump pattern (manual / agvtool / CI)

### E-4. KidsAppState `completeQuiz` mutates state pre-server-confirm
- **`KidsAppState.swift:187-200`:** local mutations `verityScore += scoreDelta`, `quizzesPassed += 1`, `streakDays += 1` BEFORE server call
- **`loadKidRow()`:** only re-reads `streak_current`. Score and quizzesPassed never re-fetched.
- **Effect:** server failure or app restart causes drift between in-memory and DB
- **Resolution:** make `completeQuiz` async; reconcile from server response

### E-5. `BadgeUnlockScene` unreachable
- **`KidsAppState.swift:202-206`:** badge constructed inside `if biasedSpotted`
- **`KidsAppRoot.swift:199`:** `completeQuiz(...biasedSpotted: false)` hardcoded
- **Effect:** dead branch — badge never assigned
- **Resolution:** decide bias-spotting product fate (wire it OR delete the dead branch)

### E-6. `QuizPassScene` orphan
- **grep:** only constructed in own `#Preview` (line 335)
- **`KidQuizEngineView.swift:7`** has comment referring to it but no constructor
- **Resolution:** wire it (per intent in KidQuizEngineView comment) OR delete

### E-7. Kids `aps-environment=development` (production needed for App Store builds)
- **VerityPostKids.entitlements:** `aps-environment=development`
- **Resolution:** switch to `production` for App Store builds

### E-8. KidsAppLauncher fallback URL parity
- **iOS adult `KidsAppLauncher.swift`:** `https://veritypost.com/kids-app` (verified per Z17)
- **Web side `kids/OpenKidsAppButton.tsx`:** App Store URL is a placeholder per Z16
- **Resolution:** replace placeholder with real App Store URL post-publish

### E-9. AASA file missing from `web/public/`
- **Z16 reports** `web/public/` only has `ads.txt`
- **Verification needed:** check for route handler at `web/src/app/.well-known/apple-app-site-association/route.ts`
- **Resolution:** create file or route handler

### E-10. iOS `HomeFeedSlots.swift` and `Keychain.swift` orphan claim
- **Z17 reports** no callers
- **Verification needed:** comprehensive grep across `VerityPost/`

### E-11. Round 9 expert-Q&A panel `#if false`'d
- **Z17 reports** the panel is gated off
- **Resolution:** decide — wire or remove

### E-12. AlertsView Manage tab gated off pending `subscription_topics` table
- **Z17 reports** the tab is hidden behind table-existence check
- **Resolution:** create table OR remove the gate

### E-13. 7 dev-only HTML/JSX mockups + REVIEW.md ship as Resources in `.app` bundle
- **Z17 reports** `VerityPost/possibleChanges/` files included in target
- **Resolution:** remove from target before App Store submission

---

## F. Hardcoded-vs-DB violations (V2-only)

### F-1. `lib/plans.js` hardcoded TIERS / PRICING / TIER_ORDER
- **`plans` table:** has `display_name`, `price_cents`, `sort_order` columns (verified)
- **Live `plans` rows:** 9 (4 tiers × monthly/annual + free)
- **Resolution:** replace lib/plans.js exports with cached DB-backed helper

### F-2. `CommentRow.tsx:31` `COMMENT_MAX_DEPTH = 2`
- **`settings.comment_max_depth = 2`** (verified)
- **post_comment RPC** uses `_setting_int('comment_max_depth', 3)` fallback
- **Match coincidental** — if DB changes, UI breaks
- **Resolution:** UI reads via `getSettings()` helper

### F-3. Adult quiz pass threshold hardcoded `>= 3` in RPC
- **`user_passed_article_quiz` body:** `WHERE t.correct_sum >= 3`
- **`settings` table:** has `kids.quiz.pass_threshold_pct = 60` (kids only); no adult equivalent
- **Resolution:** add `adult_quiz_unlock_threshold` setting + parameterize RPC

### F-4. `import-permissions.js` hardcoded role→set / plan→set mappings
- **Script lines 156-184** hardcode mappings
- **Live DB:** `role_permission_sets` (45 rows), `plan_permission_sets` (21 rows)
- **Effect:** third source-of-truth alongside xlsx + DB
- **Resolution:** rewrite script to derive mappings from xlsx only

### F-5. Admin pages hardcoded constants that should be DB-driven
Per Z14:
- `ALL_TIERS` (mirror `plans` table)
- `RATE_LIMIT_DEFAULTS` (mirror `rate_limits` table)
- `WEBHOOK_SOURCES`
- `EMAIL_SEQUENCES` (mirror `email_templates`)
- `RESOURCE_USAGE` (demo banner — acceptable)
- `STREAK / READER / THEME` config arrays
- `DEFAULT_ONBOARDING_STEPS`
- **Resolution:** P2 sweep — move each to DB or shared lib

### F-6. `FALLBACK_BOOKMARK_CAP=10` triplicated
- **3 files** per Z13
- **`plans.metadata` may have caps** (Z13 didn't verify)
- **Verification needed:** check plans.metadata for bookmark caps

### F-7. `TOPICS` duplicated across two contact forms
- **`app/contact/page.tsx`** + **`app/profile/contact/page.js`** (duplicate)
- **Resolution:** move to settings or shared util

---

## G. Component drift (V2-only)

### G-1. 5 confirmed orphan components
Per Z16 grep:
- `RecapCard.tsx`
- `admin/Sidebar.jsx`
- `admin/ToastProvider.jsx` (dead re-export shim)
- `FollowButton.tsx`
- `TTSButton.tsx`
**Caveat (Q7 from GAPS):** RecapCard + FollowButton match recap + follows feature names; both have launch-hide gates. Possibly orphan-by-kill-switch, not truly unused.
- **Verification needed:** confirm whether launch-hide is the only reason

### G-2. Duplicate-named pairs
- `Toast.tsx` ↔ `admin/Toast.jsx`
- `ConfirmDialog.tsx` ↔ `admin/ConfirmDialog.jsx`
- `Badge` × 2
**Intentional** (different audiences) but search-ambiguous

### G-3. `admin/PipelineRunPicker.tsx` "two call sites" comment stale
- **Z16:** only `/admin/newsroom/page.tsx` imports it now
- **Resolution:** fix comment
- **Verification needed:** check for dynamic imports

### G-4. `JsonLd.tsx` references `/icon.svg` which is missing from `web/public/`
- **Verification needed:** check route handler at `web/src/app/icon.svg/route.ts` or similar

### G-5. `web/public/` is bare (only `ads.txt`)
- **Tests assume** robots.txt + sitemap.xml respond
- **Likely served by route handlers** (`web/src/app/robots.js`, `sitemap.js` exist)
- **Verification needed:** confirm test assertions match route-handler responses

---

## H. Wave 2 / Wave 3 follow-ups V2 deferred

These are V2 questions GAPS.md flagged but didn't close.

### H-1. xlsx ↔ DB row-by-row diff
- **998 permissions** + **3,090 permission_set_perms** in DB vs `permissions.xlsx` rows
- **Tooling needed:** Python/Node xlsx reader

### H-2. `git log` SHA validation of MASTER_TRIAGE SHIPPED blocks
- **72 SHIPPED blocks** cite SHAs
- **None individually verified** via `git show <SHA>`

### H-3. ~60 of 72 MASTER_TRIAGE SHIPPED claims unverified
- V2 spot-checked ~12

### H-4. 47 NOTIFICATION_DIGEST findings unswept
- Per V2 W2-11: each needs status (shipped / stale / still-open)
- 8 lenses (L01, L02, L04, L08, L11, L12, L13, L15) wrote nothing to disk

### H-5. 15 O-DESIGN-* + Tiers A-D items unclassified
- Likely many superseded by `PRELAUNCH_UI_CHANGE_2026-04-25.md`

### H-6. F1-F4 vs PRELAUNCH side-by-side scope diff
- Section-level diff not done

### H-7. `tsc --noEmit` + `xcodebuild` never run
- Cannot claim green-build state

### H-8. Round 2 L03 TOCTOU specifics
- L03 lens flagged TOCTOU in comment edit/delete + quiz attempt-count
- **Verification needed:** read L03 verbatim + inspect specific routes

### H-9. Round 2 L06 cross-provider duplicate-row repro
- V2 verified live: 2 active stripe subs, no duplicates
- **Verification needed:** read L06 verbatim to know if it was a real repro or theoretical concern

### H-10. F2 reading-receipt UI gate
- `reading_log` table actively used (8 rows; `/api/stories/read` live; admin pages consume it)
- **Verification needed:** check `story/[slug]/page.tsx` for UI render gate

### H-11. F3 earned-chrome perm-vs-plan
- **Verification needed:** read `CommentRow.tsx` for chrome differentiation logic

### H-12. Story-page launch-hide enumeration
- Z13 mentioned multiple kill-switched UI blocks
- **Verification needed:** grep for env-flag conditional renders in story page

### H-13. ExpertWatchlistCard concurrency mitigation
- `profile/settings/page.tsx:2732` has comment about concurrent A11yCard / ExpertWatchlistCard saves
- **Verification needed:** read both 2732+ and 4892+ blocks

### H-14. permissions.js dual-cache stale-fallthrough trace
- Wave A 4 vs 1 said bug. Wave B Agent 2 reversed.
- **Verification needed:** read `permissions.js` cache logic; simulate stale section + missing full

### H-15. `lib/rlsErrorHandler.js` cross-client semantics
- Imports from `permissions.js#hasPermissionServer` (browser-cookie client) but invoked from server context
- **Verification needed:** read end-to-end

### H-16. `audit_log` (6,456 rows) vs `admin_audit_log` (90 rows)
- Two audit-log tables; canonical use of each not determined
- **Verification needed:** read schema migrations for both + RPC bodies that write to each

### H-17. `webhook_log` idempotency claim
- 22 rows. Locking mechanism not code-verified end-to-end
- **Verification needed:** read claim block in `api/stripe/webhook/route.js:88-115`

### H-18. iOS perms refresh on app foreground
- Multi-source flagged (R-10-AGR-04, external J.4, FINAL_PLAN D1)
- **Open per V1 + V2.** Not yet verified in iOS code

### H-19. Cost cap cache TTL
- Pipeline cost-cap settings exist in DB (verified)
- **Verification needed:** read `cost-tracker.ts` for cache TTL value

### H-20. Discovery items state race in pipeline finally vs cancel
- Multi-source flagged (H18, R-8-AGR-03, L10, YY.A4)
- **Open per V1.** Not yet verified

### H-21. `register_if_permitted` Wave B finding
- V2: zero hits in `web/src` — function never existed
- **Resolution:** mark refuted

### H-22. Q-CON-03 coming-soon wall scope
- Wave A says blocks /signup; reviewer disagrees
- **Owner-pending:** "visit /signup in incognito"

### H-23. Comment status enum drift (Wave A 6/6 consensus)
- V2 verified live system uses `'visible'/'hidden'`; no `'published'` writes; no enum exists
- **6/6 unusually strong** — possible they observed something specific not yet reproduced
- **Wave 4 deep-grep needed:** schema/, admin/moderation, all comment-touching code

### H-24. AppleSignIn wiring in `web/src/app/api/auth/*`
- Searched briefly; no definitive answer

### H-25. PROFILE_FULL_FLOW.md promotion
- Z08 candidate; file not opened

---

## I. Independent verification compromised (process gap)

### I-1. Wave 3 fresh-eyes verification was not actually independent
- **User spec:** "Verification agents that haven't seen any of the previous work"
- **What happened:** Wave 2 agents hit org token budget cap (zero output). Same instance (V2) did Wave 2 cross-reference AND Wave 3 verification.
- **Effect:** the 46 confirmed bugs in AuditV2.md have only one set of eyes on them
- **Resolution:** when budget refreshes, dispatch fresh-agent verification on all V2 findings before treating them as "verified"

### I-2. AuditV2 confidence-language drift
- **AuditV2.md** uses "Confirmed duplicates / Confirmed stale / Confirmed conflicts" framing
- **GAPS.md** Q1-Q20 admit specific confirmed-section items were NOT independently re-verified
- **Examples:**
  - C16-C20 listed under "Confirmed conflicts" but GAPS Q3 admits I never re-read those line ranges
  - C45 ("5 confirmed orphan components") but GAPS Q7 admits they may be kill-switched-by-feature-flag
  - C8 (`adminMutation.ts:84-88` p_ip gap) but GAPS Q5 admits I never read the file directly
  - D7 / C9 (no rate limit on /api/comments/[id]/report) but GAPS Q4 admits I only read the first 40 lines
- **Resolution:** tighten language in AuditV2.md — demote unverified items from "Confirmed" to "Reported by Wave 1, not re-verified"

### I-3. Path-reference imprecision
- AuditV2.md cites paths some of which I didn't re-grep
- Examples:
  - `web/src/lib/auth/adminMutation.ts` (might actually be `web/src/lib/adminMutation.ts`)
  - `kids/OpenKidsAppButton.tsx` (shortened — actual is `web/src/components/kids/OpenKidsAppButton.tsx`)
- **Resolution:** re-grep every cited path; correct mismatches before final

### I-4. AuditV2 errors directly contradicted by V1
- **MASTER_TRIAGE Tier 0 #1:** AuditV2.md C14 says "still in code"; V1 (via Q_SOLO_VERIFICATION) says shipped in `4a59752`. **V1 likely right.**
- **OWNER_ACTIONS_2026-04-24 ↔ OWNER_TODO_2026-04-24:** AuditV2 W2-11 says duplicate; V1 Session 3 says complementary (sub-confirmed by Q_SOLO cross-references). **V1 likely right.**
- **Resolution:** correct AuditV2.md.

---

## How to use this file

- **§A:** CLAUDE.md drift items (highest leverage — every new agent reads CLAUDE.md first)
- **§B:** STATUS.md drift items
- **§C:** schema/RPC bugs requiring migrations
- **§D:** API canonical-pattern violations
- **§E:** iOS findings (Apple Block items code-shippable now per memory)
- **§F:** Hardcoded vs DB-default-rule violations
- **§G:** Component drift
- **§H:** unswept Wave 4 work — mechanical close-out
- **§I:** process gaps — fresh-eyes verification still owed

When acting: cite §-letter + number from this file in commit / SHIPPED block. Cross-reference with `v1 questions.md` for items both audits flagged.
