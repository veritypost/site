# Where We Stand — Verity Post Reference

**Last updated:** 2026-04-19
**Meant to be read top-to-bottom in under 3 minutes.** This is the living "at-a-glance" for the project.

> **Note (2026-04-19):** `05-Working/` was reorganized — completed work moved to the top-level `99-Archive/<pass>/`, each with a `_README.md`. Live docs stay in `05-Working/` root. See `05-Working/_README.md` for the map. Older status docs (`STATE.md`, `INDEX.md`, `PM_HANDOFF.md`) were moved to `99-Archive/obsolete-snapshots/`; this file is now the single live status doc.

---

## 1. One-line summary

Permission-driven news platform (web + iOS) mid-migration from hardcoded role/plan checks to a `hasPermission('key')` system so admin toggles affect every feature end-to-end.

## 2. Architecture at a glance

- **Web:** Next.js 14 App Router, TypeScript (mid-migration from JS)
- **iOS:** SwiftUI, supabase-swift
- **Data:** Supabase Postgres (project `fyiwulqphgmoqullmrfn` = "VP Project")
- **Auth:** Supabase Auth, email/password
- **Billing:** Stripe (web) + Apple IAP (iOS)
- **Hosting:** Vercel (site), Supabase (DB)
- **Repo:** `github.com/veritypost/site.git` (monorepo, Vercel builds from `site/`)
- **iOS repo:** planned to live at `github.com/veritypost/ios-app.git` (not yet pushed)

## 3. The permission model

- **928 active permissions** in the `permissions` table, named `surface.action[.scope]` (e.g. `comments.post`, `article.bookmark.add`, `admin.pipeline.run_ingest`).
- **10 permission sets:** `anon`, `unverified`, `free`, `pro`, `family`, `expert`, `moderator`, `editor`, `admin`, `owner`.
- **Grants flow:** Role → set, Plan → set, Direct user set grant, Per-permission scope override.
- **Resolver:** `compute_effective_perms(user_id)` RPC. Returns every permission with `granted boolean` + `granted_via text` + source detail.
- **Client helper:** `hasPermission('key')` from `@/lib/permissions` (web) or `PermissionStore.shared.has("key")` (iOS).
- **Server helper:** `requirePermission('key')` from `@/lib/auth` (API routes).
- **Version bump:** `users.perms_version` bumps on every admin write → client refetches capabilities on next navigation → feature shows/hides.

## 4. Admin — LOCKED, DONE

**66 files** marked `// @admin-verified 2026-04-18` (LOCK extended in Round 4 Track X from the original 39 admin pages to include the 27 DS primitives). Every file in:
- `site/src/app/admin/**/*.tsx`
- `site/src/components/admin/*`

...has been:
- Converted to TypeScript
- Wired against `site/src/types/database.ts` (generated Supabase schema types, 8,921 lines)
- Built on the new admin design system (27 components: Page, DataTable, Form, Modal, Drawer, ConfirmDialog, Toast, EmptyState, Badge, StatCard, etc.)
- Mobile-responsive (375px phone, 768px tablet)
- Schema-synced (23 data bugs fixed)
- Write-path verified (18 sync fixes applied, 10 mutations tested end-to-end)

**Don't let any future refactor touch these files without explicit owner approval.**

Full list: `05-Working/ADMIN_STATUS.md`.

## 5. Wave 2 — IN PROGRESS

Migrating all non-admin code from role/plan/hardcoded gates to `hasPermission` / `requirePermission`.

| Area | Done | Total | % |
|---|---|---|---|
| Web public pages | 50 | ~57 | ~88% |
| Web API routes | 55 | ~128 | ~43% |
| Shared components | 6 | ~50 | ~12% |
| iOS feature views | 28 | ~37 | ~76% |

**Feature-verified tracks (sealed):** admin, article_reading, home_feed, notifications, profile_settings, search, recap, kids, family_admin, comments, quiz, tts, shared_components, system_auth, follow, profile_card, **subscription** (2026-04-18).

**Tracker (live):** `05-Working/PERMISSION_MIGRATION.md` — every migrated file listed with one-line summary.

**Marker on every migrated file:** `// @migrated-to-permissions 2026-04-18`.
**Grep:** `grep -rL "@migrated-to-permissions" site/src/app site/src/components VerityPost/VerityPost`

## 6. Open issues (documented, not blocking)

1. ~~**`perms_version` TOCTOU** — concurrent admin writes on one user could lose a bump. Fix: SQL increment.~~ **FIXED 2026-04-18** (see §12).
2. ~~**`/api/admin/users/:id/roles`** doesn't bump `perms_version` — moderation console grants/revokes don't refresh the target.~~ **FIXED 2026-04-18** (see §12).
3. ~~**`/admin/subscriptions`** manual downgrade/resume doesn't sync `users.plan_id`.~~ **FIXED 2026-04-18** (see §12).
4. **Cascade bumps** when toggling role/plan set — would need server RPC.
5. **Xcode SourceKit** shows "No such module 'Supabase'" on every Swift file — cosmetic, resolved by `File → Packages → Resolve Package Versions` in Xcode.
6. A handful of permission keys referenced in code don't yet exist in DB (flagged in `05-Working/PERMISSION_MIGRATION.md`).
7. ~~**`requireRole` helper** + empty `role_permissions` table — legacy artifacts pending Phase 5 cleanup.~~ **FIXED 2026-04-18** — `requireRole` removed from `site/src/lib/auth.js`, 54 call-sites migrated to `requirePermission`; `role_permissions` table DROPped (see §12 Phase 5).
8. **`billing.stripe.portal` vs `billing.portal.open`** — product decision pending. The `/api/stripe/portal` route gates on the narrower `billing.stripe.portal` which excludes family/expert paid users. Not touched in Phase 5.
9. **Hierarchy map (`site/src/lib/roles.js`) retained.** 5 consumer files call `getMaxRoleLevel` (plus the definition in `lib/roles.js`) for actor-vs-target rank guards (F-034/F-035/F-036). Removal deferred pending an actor-vs-target rework (candidate: `require_outranks(target_user_id)` server RPC).
10. **Admin-API LOCK asymmetry — owner decision pending.** 66 admin UI files (39 pages under `site/src/app/admin/**/*.tsx` + 27 DS primitives under `site/src/components/admin/**`) carry `@admin-verified 2026-04-18` (LOCKED, extended by Round 4 Track X). 37 admin API routes under `site/src/app/api/admin/**` carry `@migrated-to-permissions` + `@feature-verified admin_api`, but only 3 of those 37 (the §12 drift files) additionally carry `@admin-verified`. The remaining 34 admin API routes are unlocked. Owner should decide whether the admin API surface is equally "frozen" (extend LOCK to all 34) or allowed to evolve (document the UI-vs-API asymmetry). Surfaced by Round 3 Track S; not actioned.
11. ~~**`01-Schema/` drift vs prod** — 21 MCP-only migrations had no SQL files on disk, `reset_and_rebuild_v2.sql` had 112 tables (3 phantoms + 4 missing) vs prod's 113, pso_select still `USING (true)` in the rebuild, no Round 6 ACL lockdown block.~~ **FIXED 2026-04-19** (Round 10 cold-start reconciliation — see `05-Working/PERMISSION_MIGRATION.md`). 21 new SQL files (`071`–`091`) added, rebuild file rewritten to 113 tables, modern RPCs + ACL lockdown appended, `site/src/types/database.ts` regenerated, `tsc --noEmit` EXIT=0.

## 12. Recently fixed (2026-04-18)

Track D (admin gaps) — the 3 known admin gaps closed:

- **Gap 1 — `perms_version` TOCTOU.** Hardened `bump_user_perms_version(uuid)` RPC (atomic SQL-level `UPDATE users SET perms_version = perms_version + 1`, now `SECURITY DEFINER` with internal `is_admin_or_above()` / `service_role` auth gate). All three call-sites switched from read-modify-write to the RPC: `site/src/app/api/admin/users/[id]/permissions/route.js`, `site/src/app/admin/users/page.tsx`, `site/src/app/admin/permissions/page.tsx`. Verified under sequential-bump test: 10 consecutive calls produce `+10`, not less.
- **Gap 2 — `/api/admin/users/:id/roles` bump missing.** POST and DELETE handlers now call `bump_user_perms_version(target_id)` after the `grant_role` / `revoke_role` RPC returns success. File: `site/src/app/api/admin/users/[id]/roles/route.js`.
- **Gap 3 — `/admin/subscriptions` plan_id sync.** New server endpoint `site/src/app/api/admin/subscriptions/[id]/manual-sync/route.js` handles both `downgrade` and `resume` actions: syncs `users.plan_id` (downgrade → free plan id; resume → the subscription's plan), updates `users.plan_status`, clears `plan_grace_period_ends_at`, bumps perms_version, writes audit row. Rank check matches `billing/cancel`. Admin UI `manualDowngrade` / `resumeAccount` now call the new endpoint instead of mutating `subscriptions.status` directly.

Permission-set hygiene sweep (2026-04-18) — one-shot cross-key audit after per-feature slices kept surfacing the same DB binding bugs. Migration `fix_permission_set_hygiene_2026_04_18`:
- Backfilled **56 user-facing keys** (profile/settings/bookmarks/comments/article-interaction/billing/support/appeals/search-history) from `admin,owner`-only to `free` set, which cascades to every signed-in role via role bindings. `permissions.version.get` backfilled to `anon`. `expert.queue.oversight_all_categories` backfilled to `moderator,editor` (admin/owner already had it; the fallback is referenced at `site/src/app/expert-queue/page.tsx:99`).
- Collapsed `home.search`, `home.subcategories`, `leaderboard.view` to anon-only (were in 9/10 sets; anon-inheritance preserves behavior).
- Bound orphan `comments.view` to `anon` explicitly (was resolving via public fallback).
- Flagged 7 keys for human review (not fixed): 4 `ios.*` keys not referenced in any Swift code, and `settings.supervisor.view` / `supervisor.categories.view` / `supervisor.eligibility.view` (family-plan scoping needs product decision).
- Verified via `compute_effective_perms` on 8 tier-representative test accounts — every backfilled key now resolves `granted=true via role` at every tier that should have it; elevated keys correctly deny lower tiers.

Phase 5 — Cleanup (2026-04-18) — 4 parallel tracks (M, N, O, P):

- **Track M — `requireRole` → `requirePermission` migration.** 54 call-sites across 38 files in `site/src/app/api/admin/**` + `api/expert/answers/[id]/approve/route.js` migrated. No new permission keys created — every route mapped to an existing `admin.*` key. Three REFERENCE.md §12 drift files got their missing `@admin-verified 2026-04-18` marker written in the same pass.
- **Track N — `role_permissions` table DROPped.** Migration `drop_role_permissions_table_2026_04_18` applied (pre-verified `row_count=0`; idempotent). `site/src/types/database.ts` regenerated. `01-Schema/reset_and_rebuild_v2.sql` updated — CREATE/FKs/indexes/UNIQUE/RLS blocks replaced with comment markers.
- **Track O — orphan + tiers cleanup.** `site/src/components/QuizPoolEditor.tsx` deleted (orphan, functionally duplicated by inline editor in `admin/story-manager/page.tsx`). `site/src/app/u/[username]/page.tsx` stale `viewerTier` comment block rewritten to current truth. 4 `@/lib/tiers` call-sites migrated to `hasPermission('profile.card.view')` / `hasPermission('profile.card_share')`. `site/src/lib/tiers.js` deleted. `@/lib/plans` retained (active plan catalog, not a gate helper).
- **Track P — finalization.** `requireRole` helper removed from `site/src/lib/auth.js`. `middleware.js:7` prose comment updated. Migration `fix_editor_access_regression_2026_04_18` applied — added explicit `editor` permission_set bindings on 10 `admin.*` keys that Track M had flagged as editor-access-loss regressions (`admin.articles.{create,edit.any,delete}`, `admin.expert.applications.{approve,reject,view}`, `admin.expert.answers.approve`, `admin.users.data_requests.{view,process}`, `admin.broadcasts.breaking.send`). Flip-test on `editor@test` for `admin.articles.create`: pre-migration `granted=false` → post-migration `granted=true via role`. Migration `deactivate_duplicate_billing_keys_2026_04_18` applied — `billing.cancel` and `billing.invoices.view` set to `is_active=false` (zero code references; canonical keys in use are `billing.cancel.own` and `billing.invoices.view_own`). `billing.stripe.portal` vs `billing.portal.open` not touched — product decision pending. `cd site && npx tsc --noEmit` → EXIT=0. Zero active `requireRole` call-sites remain.

- **~~Subscription spec-vs-DB drift.~~ RESOLVED 2026-04-18.** Phase 5 closed this. Canonical billing keys now in use: `billing.cancel.own`, `billing.resubscribe`, `billing.change_plan`, `billing.upgrade.checkout`, `billing.stripe.checkout`, `billing.portal.open`, `billing.stripe.portal`, `billing.invoices.view_own`. The two legacy duplicates (`billing.cancel`, `billing.invoices.view`) are `is_active=false` as of migration `deactivate_duplicate_billing_keys_2026_04_18`. The seven stale semantic aliases that appeared in early spec drafts (`subscription.cancel`, `subscription.resume`, `subscription.upgrade`, `subscription.downgrade`, `plan.switch`, `checkout.initiate`, `billing.view.invoices`) were never created in DB and are not referenced anywhere in code; they stay un-created per the prep-doc recommendation that spec docs follow DB.

Round 6 SECURITY — admin RPC lockdown (2026-04-19) — 3 migrations, 0 code changes:

- **`lock_down_admin_rpcs_2026_04_19`** — `REVOKE ALL ... FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE ... TO service_role` on 14 SECURITY DEFINER RPCs that had a `PUBLIC EXECUTE` grant: `anonymize_user`, `apply_penalty`, `approve_expert_application`, `cancel_account_deletion`, `grant_role`, `hide_comment`, `mark_probation_complete`, `reject_expert_application`, `resolve_appeal`, `resolve_report`, `revoke_role`, `schedule_account_deletion`, `send_breaking_news`, `unhide_comment`. Prepper expanded Auditor's list of 10 by +4 (`hide_comment`, `unhide_comment`, `resolve_report`, `mark_probation_complete` — same trust-the-actor-param pattern). Strategy: REVOKE-only (no body rewrite to `auth.uid()` — every legitimate caller is `createServiceClient().rpc(...)` where `auth.uid()` is NULL, so a rewrite would have broken admin flows). Also added a defensive self-anonymize guard to `anonymize_user`; `anonymize_user_guard_cron_safe_2026_04_19` follow-up narrowed the guard to `auth.uid() IS NOT NULL AND auth.uid() = p_user_id` so the `sweep_expired_deletions` cron (which calls `anonymize_user` with `auth.uid()` NULL) still works.
- **`tighten_pso_select_rls_2026_04_19`** — `permission_scope_overrides.pso_select` policy changed from `USING (true)` to `USING (public.is_admin_or_above() OR (scope_type = 'user' AND scope_id = auth.uid()))`. Closes a read-all-rows RLS gap. `pso_write` untouched.
- **Verification:** `has_function_privilege('anon' / 'authenticated', ...)` returns `false` for all 14 functions; `'service_role'` returns `true`. `pg_proc.proacl` no longer contains a PUBLIC grant. `perms_global_version` bumped 4409 → 4412 (3 migrations, 3 bumps).

Round 6 iOS-DATA — column-name drift fixes (2026-04-19) — 0 migrations, 5 files touched:

- **Reads migrated to real columns.** 6 SettingsView `.select("preferences")` sites changed to `.select("metadata")` since `users.preferences` never existed (Round 5 Item 2 moved writes to `metadata`; reads had remained broken). `VPNotification` CodingKeys updated `read → is_read`, `link → action_url` — before fix every iOS notification rendered as unread and tap-through was broken. Mention-autocomplete select at `StoryDetailView.swift:960` stripped phantom `plan, role, avatar`.
- **Broken inserts routed through gated APIs.** iOS expert application now POSTs `/api/expert/apply` (gate: `expert.application.apply`) with a new `full_name` TextField matching the NOT NULL column. iOS feedback (SettingsView + ProfileView) now POSTs `/api/support` (gate: `requireAuth`). `/api/support` route itself was ALSO broken (wrote phantom `description` column) — repaired to insert into `support_tickets` header + `ticket_messages` body pair.
- **Kid inline-add retired.** ProfileView `addChild()` direct insert (phantom `name`/`username`/`age_tier` columns) and `editChildSheet` Save (phantom `name`) both `#if false`-gated with informational panel pointing to web flow. Native iOS full-COPPA flow deferred to Round 7.
- **alert_preferences subscription writes disabled.** 5 iOS sites (1 select + 3 inserts + 1 delete) wrapped `#if false` — the table's real schema (`alert_type`/`channel_*`/`is_enabled`/`frequency`) does not model per-topic subscriptions; redesign deferred to Round 7.

Round 6 iOS-GATES — paid-tier bypass closed (2026-04-19) — 0 migrations, 3 files touched:

- **lib/auth.js bearer fallback.** `resolveAuthedClient` helper added — reads `Authorization: Bearer` header first, falls back to cookie-scoped `createClient()` if absent. Wired into `getUser`, `requirePermission`, `hasPermissionServer`. +29 lines. Before fix, iOS `/api/messages`, `/api/follows`, `/api/bookmarks`, `/api/comments`, `/api/comments/[id]/vote`, `/api/notifications` PATCH all silently 401'd on pure-iOS sessions.
- **DM send routed through `/api/messages`.** `MessagesView.swift:854` direct `client.from("messages").insert(...)` deleted; POST `/api/messages` with `{conversation_id, body}` and Bearer token. Redundant `conversations.update(last_message_preview, last_message_at)` at `MessagesView.swift:864-867` also deleted since `post_message` RPC does it server-side (verified in `pg_proc.prosrc`).
- **Follow/unfollow routed through `/api/follows`.** `PublicProfileView.swift:191/199` direct `follows.insert/.delete` replaced with single POST `/api/follows` carrying `{target_user_id}`; `isFollowing` now set from server-authoritative `resp.following`.
- **Verification.** `compute_effective_perms` for `free@test.veritypost.com` returns `granted=false` for both `messages.dm.compose` and `profile.follow` — gates now enforce. Cookie path for web callers unchanged.

Round 7 — Track Y (bearer bypass on pre-bound routes) (2026-04-19) — 0 migrations, 7 files touched:

- **Tier-1 (iOS-reachable): `/api/stories/read`** — route-local bearer resolution added (`bearerToken()` helper reads `Authorization: Bearer`; `createClientFromToken()` binds the resolved client to both the auth gate AND post-auth `reading_log` INSERT/UPDATE so RLS `auth.uid()` resolves). Matches `/api/account/delete` precedent.
- **Tier-2 (cookie-only web routes, Option A)**: `/api/reports`, `/api/kids/set-pin`, `/api/kids/reset-pin`, `/api/admin/stories` (3 handlers), `/api/search` (5 `hasPermissionServer` call-sites) — stripped the pre-bound `supabase` arg from helper calls so `resolveAuthedClient` can do its thing. `/api/search` also got dead-code cleanup (unused `createClient` import + `supabase` local removed).
- **`/api/support` (post-Round-7 follow-up)**: after Z Reviewer flagged the same pattern, patched with the Tier-1 route-local bearer approach so iOS SettingsView + ProfileView feedback submissions reach the `create_support_ticket` RPC with the correct authenticated identity.
- **Verification**: tsc EXIT=0; post-fix grep for pre-bound helper args returns only the 3 legitimate route-local bearer cases (`stories/read`, `account/delete`, now `support`).

Round 7 — Track Z (startConversation atomicity + support tx) (2026-04-19) — 2 migrations, 4 files touched:

- **`start_conversation_rpc_2026_04_19`** — new SECURITY DEFINER RPC `public.start_conversation(p_user_id uuid, p_other_user_id uuid) RETURNS jsonb`. Gates: `user_has_dm_access` (paid + grace), `_user_is_dm_blocked`, self-start block, recipient-exists check. Dedupes existing direct convos. Atomic insert of conversation + two participant rows in one plpgsql block. REVOKE ALL from PUBLIC; GRANT EXECUTE to authenticated + service_role.
- **`create_support_ticket_rpc_2026_04_19`** — new SECURITY DEFINER RPC `public.create_support_ticket(p_user_id uuid, p_email text, p_category text, p_subject text, p_body text) RETURNS jsonb`. Generates `VP-<hex-ms>` ticket number server-side; atomic ticket header + message body insert. Same ACLs.
- **New API route `/api/conversations/route.js`** — POST handler gated on `messages.dm.compose`, calls `start_conversation` RPC with `user.id`. Error codes propagated.
- **Code cleanup**: `site/src/app/messages/page.tsx:396-446` and `VerityPost/VerityPost/MessagesView.swift:427-494` — direct `conversations.insert` + `conversation_participants.insert` removed in both web and iOS; both now POST `/api/conversations`. `/api/support/route.js` POST handler rewritten to call `create_support_ticket` RPC instead of two sequential direct inserts.
- **Verification** (SQL probes): denial (free user) raises `P0001 direct messages require a paid plan`; paid user gets `{id, existed: false}`; second call with same pair returns `{id: <same>, existed: true}` (dedupe); `create_support_ticket` atomic success returns `{id, ticket_number, status}`; forced CHECK violation on ticket_messages rolls back the header (orphan count = 0 post-error).

## 7. DB state

**Supabase project:** `fyiwulqphgmoqullmrfn` (VP Project, us-east-1)

| | Count |
|---|---|
| Active permissions | 928 |
| Permission sets | 10 |
| Users (real) | 1 (admin@veritypost.com, owner role) |
| Test accounts (seeded) | 49 (17 role + 30 community + 2 kid) |
| Articles (published) | 6 |
| Tables | 114 total |

**Credentials management:** All live secrets are in Vercel env vars. `site/.env.local` has the dev-mode copies (anon key + service role, pointed at VP Project).

**Backups:** `test-data/backup-2026-04-18/` (pre-permission-import snapshot, 8 JSON files, 256 rows).

## 8. Key files to know

| File | What it is |
|---|---|
| `site/src/lib/permissions.js` | Client `hasPermission` + cache + version polling |
| `site/src/lib/auth.js` | Server helpers: `requireAuth`, `requirePermission` (canonical — `requireRole` removed 2026-04-18) |
| `site/src/types/database.ts` | Generated Supabase types. Regen: `npm run types:gen` |
| `site/src/components/admin/` | Admin design system, 27 components |
| `01-Schema/reset_and_rebuild_v2.sql` | Canonical schema |
| `01-Schema/064_compute_effective_perms.sql` | Permission resolver function |
| `00-Reference/Verity_Post_Design_Decisions.md` | D1–D44 product rules |
| `00-Reference/permissions_matrix.xlsx` | Original spec (stale, we rebuilt) |
| `/Users/veritypost/Desktop/verity post/permissions.xlsx` | The rebuild — **source of truth for permissions** |
| `VerityPost/VerityPost/PermissionService.swift` | iOS equivalent of `lib/permissions.js` |
| `scripts/seed-test-accounts.js` | Re-seeds the 49 test accounts |
| `scripts/import-permissions.js` | Imports xlsx → DB. Idempotent. `--dry-run` default. |
| `scripts/preflight.js` | Schema + RPC + env sanity check. 60+ green assertions. |

## 9. Dev workflow

- **Dev server:** `cd site/ && npm run dev` → `localhost:3000`
- **Types:** `npm run types:gen` (inside `site/`) regenerates from current DB schema
- **Type check:** `npx tsc --noEmit` (inside `site/`)
- **DB:** MCP tool (`mcp__claude_ai_Supabase__execute_sql`) or Supabase CLI linked to VP Project
- **Vercel:** Ignored Build Step is enabled — pushes to GitHub don't auto-deploy; click "Redeploy" to ship manually.

## 10. What's next

1. Finish Wave 2 web public pages (~33 remaining)
2. Finish Wave 2 API routes (~98 remaining — largely admin/cron/webhook)
3. Wave 2 shared components (~50)
4. Finish Wave 2 iOS (~9 remaining views)
5. Fix the remaining open issues above
6. ~~Phase 5 cleanup — remove `requireRole`, delete empty `role_permissions` table, remove the hierarchy map~~ **DONE 2026-04-18** (requireRole removed, role_permissions DROPped). Hierarchy map deliberately retained — see §6 #10 for deferral rationale.
7. Production smoke test + unhide Vercel deploys
8. Publish first 10 real articles (launch blocker per OWNER_TO_DO)

## 11. Related status docs

**Live (`05-Working/` root):**
- `05-Working/PERMISSION_MIGRATION.md` — Wave 2 live tracker (every file)
- `05-Working/OWNER_TO_DO.md` — canonical owner-action checklist
- `05-Working/ROTATE_SECRETS.md` — secret-rotation checklist
- `05-Working/LIVE_TEST_BUGS.md` — active bug intake
- `05-Working/FUTURE_DEDICATED_KIDS_APP.md` — deferred post-launch plan
- `05-Working/PRELAUNCH_HOME_SCREEN.md` — holding-page blueprint (not yet implemented)
- `05-Working/IOS_UI_AGENT_BRIEF.md` — iOS audit agent briefing
- `00-Where-We-Stand/FEATURE_LEDGER.md` — per-feature completion state + follow-ups

**Archived (see `99-Archive/<pass>/_README.md` for scope):**
- `99-Archive/2026-04-19-prelaunch-sprint/` — Rounds A–I + 3 reviewers + capstone
- `99-Archive/2026-04-18-admin-lockdown/` — admin audit/status/verification/e2e + permissions audit
- `99-Archive/2026-04-18-security-rounds-2-7/` — incremental hardening rounds 2–7
- `99-Archive/2026-04-18-ui-ios-audits/` — UI lead + 3 peers + iOS preflight
- `99-Archive/2026-04-18-phases-1-2/` — permission system buildout (MIGRATION_STATUS)
- `99-Archive/one-off-plans/` — shipped focused plans (profile card, Stripe portal)
- `99-Archive/obsolete-snapshots/` — pre-sprint status docs (STATE, INDEX, PM_HANDOFF, etc.)

**Other reference:**
- `00-Folder Structure.md` — repo layout reference (some bits may be stale — this doc is the live one)
- `00-New-Findings.md` — early end-to-end smoke test results
