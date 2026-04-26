# Zone Z04: Audit_2026-04-24/ Wave A + Wave B agents

## Summary

Read all 75 Wave A/B audit files across 14 groups (Auth, Reader, Comments, Settings, Billing, AdminPerms, AdminMod, Pipeline, KidsIOS, AdultIOS, CronsLib, DB, UISmoke, RoleMatrix). Coverage is asymmetric: Wave A is missing 4 agents (Group 4 Agent 3, Group 8 Agent 1, Group 9 Agent 3, Group 12 Agent 2, Group 13 Agent 2); Wave B is missing 2 (Group 10 Agent 1, Group 13 Agent 2). Every file is a full report — no empty/half-finished stubs detected. Highest-impact findings cluster around: comment status enum mismatch ('visible' vs 'published') confirmed by 6 agents as the root cause of "comments not saving"; missing audit_log on iOS billing, user-self-cancel, and several admin moderation RPCs; bookmark PATCH permission gate mismatch (3 Wave A + 2 Wave B agents); permissions.js dual-cache stale-fallthrough race during version bump (5 agents disputed severity); kid quiz-pass threshold hardcoded client-side (4 agents). Several Wave A claims about reset_and_rebuild_v2.sql staleness, RLS gaps, and import-permissions.js issues were re-confirmed and refined in Wave B with different table counts (Wave A claimed 35 tables without RLS; Wave B Agent 3 narrowed to 14; another Wave B agent narrowed to 1 — `weekly_recap_questions` or `perms_global_version`).

## File index (count per Group, A vs B, missing agents)

| Group | Wave A | Wave B | Missing |
|-------|--------|--------|---------|
| 1 Auth | 1, 2, 3 | 1, 2, 3 | none |
| 2 Reader | 1, 2, 3 | 1, 2, 3 | none |
| 3 Comments | 1, 2, 3 | 1, 2, 3 | none |
| 4 Settings | 1, 2 | 1, 2, 3 | **Wave A Agent 3** |
| 5 Billing | 1, 2, 3 | 1, 2, 3 | none |
| 6 AdminPerms | 1, 2, 3 | 1, 2, 3 | none |
| 7 AdminMod | 1, 2, 3 | 1, 2, 3 | none |
| 8 Pipeline | 2, 3 | 1, 2, 3 | **Wave A Agent 1** |
| 9 KidsIOS | 1, 2 | 1, 2, 3 | **Wave A Agent 3** |
| 10 AdultIOS | 1, 2, 3 | 2, 3 | **Wave B Agent 1** |
| 11 CronsLib | 1, 2, 3 | 1, 2, 3 | none |
| 12 DB | 1, 3 | 1, 2, 3 | **Wave A Agent 2** |
| 13 UISmoke | 1, 3 | 1, 3 | **Wave A Agent 2 + Wave B Agent 2** |
| 14 RoleMatrix | 1, 2, 3 | 1, 2, 3 | none |

Total files: 75 (Wave A: 36; Wave B: 39). 6 missing agent slots noted.

## Per-Group consolidation

### Group 1: Auth
- **Wave A consensus (3/3):** Signup rollback incomplete — auth.users gets deleted but public.users row orphans; deleteUser failure is logged, not retried (Agents 1/2/3, identical line refs `web/src/app/api/auth/signup/route.js:116-127`). Verify-email 429 misuses 'expired' state (Agents 1+2). Reset-password silent 200 on rate-limit (Agents 1+2+3, with disagreement on whether intentional).
- **Wave A disputes:** Coming-soon wall blocks /login, /signup, /verify-email — Agent 3 flagged CRITICAL, Agents 1+2 did not raise. Agents 1+2+3 all flag the kid pair-code rate-limit as IP-based / no per-code or per-device counter, but Agent 1 calls it MEDIUM, Agent 3 HIGH.
- **Wave B verdict:** Confirmed signup rollback gap (3/3 Wave B agents, identical findings). Confirmed 429-state-naming-bug. Wave B Agent 1 added new finding: kid_profile_id verification missing in /api/kids/pair before JWT mint. Wave B Agent 3 added a NEW critical: post-auth redirect missing role-based gating during coming-soon mode (login `?next=/profile/settings` bypasses). Wave B Agent 2 added kids JWT no nbf/jti, no revocation list — same vector flagged Wave A Agent 1 #06.
- **Net findings:** Signup orphan-row rollback (HIGH, 6 agents), reset-password silent 200 (intentional security trade-off, 6 agents), 429 verify-email state confusion (5 agents), kid pair-code device-binding gap (6 agents), kid JWT lacks revocation/nbf (3 agents), Wave A Agent 3's coming-soon allowlist miss is a NEW critical confirmed only by him.

### Group 2: Reader
- **Wave A consensus:** Bookmarks PATCH `/api/bookmarks/[id]:14` requires `bookmarks.note.edit` for collection-only moves — paid users with `bookmarks.collection.create` can't move bookmarks. Flagged by Agents 1, 2, 3 with identical evidence. Anon search filter silently drops params (Agents 1+2). Bookmarks unbounded query / no pagination (Agents 2+3).
- **Wave A disputes:** Recap 403→200 fallback (only Agent 3 flagged HIGH at `/api/recap/route.js:13`). Bookmarks duplicate-on-rapid-click (only Agent 2 flagged in Wave A; Agent 3 also).
- **Wave B verdict:** Bookmarks PATCH gate confirmed 3/3. Pagination unbounded confirmed 2/3. Wave B added: bookmark POST has no client/server dedup check (3 Wave B agents). Bookmark `b.articles?.title` fallback to "Untitled" if article soft-deleted (Wave B Agent 3).
- **Net findings:** PATCH gate mismatch (5 agents), bookmark unbounded fetch (4 agents), POST race-condition / no dedup (4 agents), search advanced-filters silent drop (3 agents), home-page categories no `is_active` filter (Wave A Agent 1 only — flagged HIGH).

### Group 3: Comments
- **Wave A consensus (3/3):** RLS `comments_select` requires `status='published'` but `post_comment` RPC inserts `status='visible'` and CommentThread filters `.eq('status','visible')`. This is the root cause of "comments not saving or showing." All three Agent 1/2/3 findings cite identical `schema/013_phase5_comments_helpers.sql:137`, `web/src/components/CommentThread.tsx:100`, and the RLS qual `(status='published' AND deleted_at IS NULL) OR user_id=auth.uid() OR is_mod_or_above()`.
- **Wave A disputes:** Whether `post_comment` RPC enforces quiz-pass server-side. Agent 1 said NO, Agent 3 said YES (per RPC body `IF NOT user_passed_article_quiz`). Agent 2 was UNSURE.
- **Wave B verdict:** Status-mismatch confirmed 3/3 with same evidence. Wave B Agent 1 also confirmed RPC DOES enforce quiz-pass (per migration 013 line 103-105), resolving the Wave A dispute in Agent 3's favor. Wave B Agent 2 added: comment re-fetch after RPC may return null fallback `{ id: data.id }`, creating ghost partial comments.
- **Net findings:** RLS status enum drift (6 agents, unanimous CRITICAL — single root cause). Quiz gate is enforced at RPC layer (3 agents confirmed). API route doesn't expose actionable "quiz not passed" error (Wave B Agent 2). Optimistic vote update has no rollback on error (Wave A Agent 2 only).

### Group 4: Settings
- **Wave A consensus (2/2 — Agent 3 missing):** Unblock at `web/src/app/profile/settings/page.tsx:3281` does direct `supabase.from('blocked_users').delete()` bypassing the API route's permission gate, rate limit, and audit. Both agents identical.
- **Wave A disputes:** Concurrent metadata write race (Agent 1 = MEDIUM, Agent 2 = HIGH). Blocked-card stale-data after unblock (Agent 2 only).
- **Wave B verdict:** Wave B Agent 1 flagged ExpertWatchlist toggle as CRITICAL — same metadata clobber pattern, missing the M16 immediate re-read fix that FeedCard/AccessibilityCard have. Wave B Agent 2 confirmed unblock + data-export-request bypass with identical line refs. Wave B Agent 3 confirmed ProfileCard handleSave reads stale `user.metadata` instead of re-reading freshly.
- **Net findings:** Unblock bypass (4 agents). Data-export-request bypass (Wave B Agent 2 only). ExpertWatchlist concurrent-write clobber (Wave B Agent 1 only — overlooked in Wave A). Concurrent two-tab Feed↔A11y clobber (4 agents). Settings mutations don't `invalidate()` permissions cache after save (Wave B Agent 2).

### Group 5: Billing
- **Wave A consensus (3/3):** B1 fix VERIFIED — `schema/148_billing_rpcs_bump_perms_version.sql` adds `PERFORM bump_user_perms_version(p_user_id)` to all four billing RPCs at lines 91/157/247/352. B3 receipt hijack defense VERIFIED across both sync route + S2S notification handler. B6 invoice.upcoming handler implemented at `web/src/app/api/stripe/webhook/route.js:855-891`. All 3 agents reach IDENTICAL "no critical findings" verdict.
- **Wave A disputes:** Audit_log coverage on iOS billing — Wave A Agent 2 flagged HIGH ("billing RPCs don't audit_log internally on success path"); Wave A Agent 3 flagged the iOS notification path specifically.
- **Wave B verdict:** Wave B Agent 2 found NEW critical: `handlePaymentSucceeded` doesn't call `bump_user_perms_version` after clearing grace period. Wave B Agent 3 added comprehensive critical: ALL iOS billing routes (sync + appstore notifications) have NO audit_log; web user-facing change-plan/cancel/resubscribe also no audit_log; admin freeze/cancel routes also no audit_log.
- **Net findings:** B1/B3/B6 fixes verified (6 agents). `handlePaymentSucceeded` missing perms_version bump (Wave B Agent 2 only — NEW). Audit_log gap on iOS + user-self + admin billing routes (Wave B Agent 3 + Wave A Agent 3 + Wave B Agent 1 partial — strongest finding). StoreKit fallback when session unavailable strips appAccountToken (Wave B Agent 2 / B10 Agent 3).

### Group 6: AdminPerms
- **Wave A consensus:** `/api/admin/users/[id]/roles` POST/DELETE call `bump_user_perms_version` but DON'T call `recordAdminAction` (Agents 1+2). `/api/admin/billing/freeze` and `/api/admin/billing/cancel` lack `recordAdminAction` (Agent 2 only — confirmed in Group 5). DestructiveActionConfirm.tsx records audit BEFORE the destructive mutation, creating orphan audit entries on failure (Agent 3).
- **Wave A disputes:** T0-1 "DELETE /roles crash" — Agent 3 said the endpoint doesn't exist, Agent 1+2 inspected `/api/admin/users/[id]/roles` and said current code is correct (uses `requireAdminOutranks`, not the alleged `assertActorOutranksTarget`). Wave B Agent 2 confirmed: T0-1 was already fixed.
- **Wave B verdict:** Wave B Agent 1 + 2 confirmed the role grant/revoke audit gap. Wave B Agent 1 added: `toggleRoleSet` and `togglePlanSet` in `admin/permissions/page.tsx` write audit BEFORE API call AND the API also writes audit → DOUBLE LOG. Wave B Agent 3 added: DELETE permission-sets/members lacks audit. All Wave B agents confirmed: caller_can_assign_role + requireAdminOutranks pattern is correct.
- **Net findings:** Roles grant/revoke missing audit (5 agents). Billing freeze/cancel missing audit (Group 5+6 cross-confirm). Double-audit on role/plan toggles (2 agents). DestructiveActionConfirm pre-mutation audit anti-pattern (3 agents). T0-1 closed (Wave B 2/3 confirmed).

### Group 7: AdminMod
- **Wave A consensus:** Penalty buttons render unconditionally regardless of actor↔target hierarchy (Agents 1+2). Hardcoded HIERARCHY constant in `web/src/app/admin/moderation/page.tsx:28-37` drifts from DB `roles.hierarchy_level` (Agent 3 only in Wave A).
- **Wave A disputes:** Whether moderation RPCs (apply_penalty, hide_comment, resolve_report, resolve_appeal) emit audit_log internally (Agent 2 + Agent 3 disputed; both UNSURE without RPC source).
- **Wave B verdict:** Wave B Agent 1 confirmed HIERARCHY drift (CRITICAL). Wave B Agents 2 + 3 BOTH flagged the audit_log gap on moderation RPCs as CRITICAL — confirms penalty/appeal/report/hide flows have NO audit trail at API layer. Wave B Agent 2 confirmed report.resolve does not validate `resolution` enum at API. Wave B Agent 3 confirmed appeal.resolve does not validate `outcome` enum.
- **Net findings:** Moderation RPC audit gap (5 agents — strongest signal). HIERARCHY constant drift (3 agents). Penalty/role buttons not gated client-side (3 agents). Resolution/outcome enum validation missing at API (3 agents).

### Group 8: Pipeline
- **Wave A consensus (2/2):** Cluster mutation finally block has discovery_items reset BEFORE pipeline_runs status guard, creating asymmetric state on cancel races (Agent 2). Prompt preset PATCH has no version history / rollback (Agents 2+3). Cost cap cache TTL=60s creates window where mid-run policy changes don't apply (Agents 2+3).
- **Wave A disputes:** Plagiarism rewrite silent fallback on error severity (Agent 2=MEDIUM, Agent 3=MEDIUM but different reasoning).
- **Wave B verdict:** Wave B Agent 1 confirmed prompt preset versioning gap. Wave B Agent 2 added: ingest run cleanup missing `.eq('status','running')` guard (different bug from Agent 2's). Wave B Agent 3 added: generate finally block UPDATE with status guard correctly present BUT errors are swallowed (response says ok:true even if guard rejects).
- **Net findings:** Cost-tracker cache vs in-flight cap changes (4 agents). Prompt preset versioning absent (4 agents). Cluster mutation idempotency / replay (4 agents). Plagiarism check silent error degradation (3 agents). iOS / web ingest mutation finally-block guard inconsistencies (Wave B Agents 2+3 disagreed on which routes have guards).

### Group 9: KidsIOS
- **Wave A consensus (2/2):** Quiz pass threshold (60%) hardcoded client-side at `KidQuizEngineView.swift:337` with no server-side enforcement. Both agents identical, CRITICAL. Streak/score state in `KidsAppState` mutates BEFORE DB writes confirm — state desync after app kill / write failure (Agents 1+2). ExpertSessions has no parental gate (Agent 1 only, also UNSURE in Agent 2).
- **Wave A disputes:** Pair-code device-binding (Agent 1 = HIGH, also flagged in Group 1).
- **Wave B verdict:** All 3 Wave B agents confirmed quiz threshold + streak desync. Wave B Agent 1 added: data collection (reading_log + quiz_attempts) writes BEFORE any parental gate during initial pairing (COPPA risk). Wave B Agent 2 + 3 both flagged ExpertSessionsView no-parental-gate as MEDIUM/CRITICAL. Wave B Agent 3 added: SUPABASE_JWT_SECRET rotation has no grace period / token versioning.
- **Net findings:** Quiz 60% threshold not server-enforced (5 agents). Streak in-memory ahead of DB write (5 agents). ExpertSessions parental gate gap (4 agents). Pair-code IP rate limit (4 agents). reading_log/quiz_attempts COPPA pre-consent collection (Wave B Agent 1 only — strong finding).

### Group 10: AdultIOS
- **Wave A consensus (3/3):** Signup auth.signUp succeeds but users-row upsert can fail without rollback (Agents 1, 2, 3 identical line refs `AuthViewModel.swift:267-283`). APNs token registration race — handleDeviceToken returns early if `lastUserId` is nil during cold start (Agents 1+2+3). StoreKit subscription sync failure doesn't surface to user — local entitlement flips, server denies (Agents 1+2+3).
- **Wave A disputes:** PermissionService.loadAll() not called on login/signup (Agent 2 = CRITICAL, Agent 1 didn't flag). Whether vpSubscriptionDidChange notification path correctly invalidates permissions (Agent 3 disagreed with Agents 1+2 — Agent 3 says it's correct).
- **Wave B verdict (only Agents 2+3):** Wave B Agent 2 confirmed signup orphan-account, APNs race, tokenRefreshed event doesn't invalidate permission cache. Wave B Agent 3 added NEW: `PushRegistration.shared.registerIfPermitted()` is defined but NEVER CALLED (CRITICAL — APNs registration completely broken). Wave B Agent 3 also confirmed Agent 3 wave-A claim: vpSubscriptionDidChange path IS correctly wired (resolves the dispute).
- **Net findings:** Signup orphan-account rollback gap (5 agents). APNs registration broken — registerIfPermitted never called (Wave B Agent 3 only — STRONGEST finding). tokenRefreshed event no permission invalidation (Wave B Agent 2 + Wave A Agent 3). StoreKit appAccountToken fallback weakens defense (Wave B Agents 2+3). Family kid management direct DB reads bypass server permission (Wave A Agent 3 + Wave B Agent 3).

### Group 11: CronsLib
- **Wave A consensus (3/3):** No CRITICAL crons issues — all CRON_SECRET checks present, L3/L4/L5/L6/L19 fixes all verified deployed. Permissions.js dual-cache fallthrough during version bump is the main finding (Agents 2+3 same finding, Agent 1 didn't note).
- **Wave A disputes:** send-push CONCURRENCY=50 vs Supabase pool (Agent 1=HIGH, Agent 2 didn't flag, Agent 3=MEDIUM). check-user-achievements cursor++ race (Agent 3 only).
- **Wave B verdict:** Wave B Agent 2 disagreed with permissions.js dual-cache claim — re-read the code and concluded it's NOT a bug (the synchronous deny correctly fires before the section-cache fallback because allPermsCache=null returns false immediately). Wave B Agents 1+3 reaffirmed it as a HIGH/CRITICAL finding. Wave B Agent 1 added: send-emails has no checkRateLimit per email/sender (different from Wave A's send-push concurrency concern). Wave B Agent 1 added: process-data-exports pre-claim error returns 500 → Vercel retries → potential duplicate exports.
- **Net findings:** Permissions.js dual-cache fallthrough (3 agents flag, 1 disagrees — Wave B Agent 2 says false-positive on re-read). send-push concurrency vs pool size (3 agents). send-emails no rate-limit per sender (Wave B Agent 1 only). check-user-achievements cursor race (2 agents). 4 cron routes missing maxDuration export (Wave A Agent 2).

### Group 12: DB
- **Wave A consensus (Agents 1+3, no Agent 2):** Tables without RLS — Agent 1 said 35 tables, Agent 3 said only 1 (`weekly_recap_questions`). Big disagreement on count. Reset_and_rebuild_v2.sql is stale (both agents). Permissions xlsx legacy desktop-path fallback (both).
- **Wave A disputes:** RLS gap count — 35 vs 1 — fundamental disagreement.
- **Wave B verdict:** Wave B Agent 1 confirmed `perms_global_version` as the only table without RLS (matches Agent 3, contradicts Agent 1). Wave B Agent 2 found 13 tables missing from reset_and_rebuild_v2.sql vs live migrations (specific list: ai_models, ai_prompt_overrides, ai_prompt_presets, discovery_items, events, events_default, kid_articles, kid_discovery_items, kid_pair_codes, kid_quizzes, kid_sources, kid_timelines, verity_score_events). Wave B Agent 3 found 14 tables with RLS-enabled-but-no-policies (different list — weekly_recap_*, behavioral_anomalies, bookmark_collections, etc.).
- **Net findings:** Reset_and_rebuild_v2.sql is 55 migrations behind — DEFINITIVE (4 agents). 14 tables have RLS-enabled but zero policies (Wave B Agent 3 specific list — CRITICAL, different from "no RLS at all"). `perms_global_version` table missing RLS (Wave B Agents 1+3, narrows Wave A Agent 1's 35-table claim). bump_global_perms_version RPC referenced but doesn't exist (Wave B Agent 2 only). Hardcoded role→set mapping in import-permissions.js drifts from DB (Wave B Agents 1+2).

### Group 13: UISmoke
- **Wave A consensus (Agents 1+3, no Agent 2):** Multiple useEffect dependency-array gaps in Messages, Settings, Story page, CommentThread, CommentComposer. Both agents identified the same lint-warning corpus. Cannot start dev server without .env.local — both blocked from runtime testing.
- **Wave A disputes:** None significant — both took the same approach.
- **Wave B verdict (Agents 1+3, no Agent 2):** Wave B Agent 1 added: admin settings numeric inputs persist only on onBlur, lose data on tab close (CRITICAL). Wave B Agent 1 added: admin settings upsert accepts arbitrary key string (no allowlist). Wave B Agent 3 added: rate-limit applied AFTER permission check, allowing brute-force enumeration of permissions without consuming rate-limit quota.
- **Net findings:** useEffect dep gaps in Messages/Settings/Story/Comment* (4 agents — known per PM_PUNCHLIST 33+ lint warnings). Settings numeric onBlur data-loss (Wave B Agent 1 only). Settings upsert no key allowlist (Wave B Agent 1). Rate-limit ordering enables permission enumeration (Wave B Agent 3). All findings are code-reading only — no agent ran the dev server to confirm UI behavior.

### Group 14: RoleMatrix
- **Wave A consensus:** 24/25 admin mutations call `recordAdminAction`; ad-campaigns/ad-placements lack audit (Agent 1). Permission enforcement is layered (Agent 3). MOD_ROLES frozen-set drifts from DB hierarchy (Agents 1+3). All 3 agents agree no privilege-escalation gaps found.
- **Wave A disputes:** Agent 2 raised `/api/support` uses `requireAuth` not `requirePermission` — HIGH. Agent 1+3 didn't note. Whether cron-secret leak is high or low risk (Agents 2+3 = MEDIUM, Agent 1 didn't raise).
- **Wave B verdict:** Wave B Agent 1 raised the role-vs-plan-tier scope confusion — briefing's role list mixes plans (verity_pro, kid, anon) with roles. Wave B Agent 2 found NEW critical: `/api/access-request` and `/api/support/public` missing requireAuth + rate limit; `/api/kids/generate-pair-code` missing requireAuth. Wave B Agent 3 found 5 mutations lacking checkRateLimit (bookmark-collections, conversations, supervisor opt-in/out, quiz/start), and billing user-self routes missing audit.
- **Net findings:** Admin mutations audit consistent (5 agents). `/api/support` uses requireAuth not requirePermission (Wave A Agent 2 only). `/api/access-request` no auth + no rate limit (Wave B Agent 2 — NEW critical). `/api/kids/generate-pair-code` missing requireAuth (Wave B Agent 2 — NEW critical). User-self billing routes missing audit (Wave B Agent 3 + Group 5 cross-confirm). 5 mutations missing rate limits at HTTP layer (Wave B Agent 3).

## Within-zone duplicates / overlap

1. **Comment status enum drift** — Found in Group 3 by all 6 agents AND Group 13 Wave B Agent 3 referenced it indirectly. The single highest-confirmed finding in this zone.
2. **Bookmarks PATCH gate mismatch** — Group 2 Wave A Agents 1+2+3 + Wave B Agents 1+2 = 5 cross-agent confirms.
3. **Signup orphan account / rollback gap** — Group 1 (3 agents) AND Group 10 (3 Wave A + 2 Wave B) = same root cause flagged from web-API and iOS-client perspectives. Note: web flow rolls back deleteUser conditionally; iOS flow has no rollback at all.
4. **Audit_log coverage gap on iOS billing** — Group 5 Wave B Agent 3 + Group 6 Wave A Agent 2 + Group 14 Wave B Agent 3 = same finding from 3 angles.
5. **Audit_log gap on moderation RPCs (apply_penalty, hide_comment, resolve_report, resolve_appeal)** — Group 6 Wave A Agent 2 + Group 7 Wave B Agents 2+3 + Group 14 Wave A Agent 2 = strong consensus.
6. **HIERARCHY constant drift in moderation page** — Group 7 Wave A Agent 3 + Group 7 Wave B Agent 1 + Group 14 Wave A Agent 3 = same drift different lens.
7. **Permissions.js dual-cache stale-fallthrough** — Group 11 Wave A Agents 2+3, Wave B Agents 1+3, Group 4 Wave B Agent 2 = 5 agents flag; Group 11 Wave B Agent 2 disputes (says it's not a bug). Worth resolving.
8. **Kid pair-code IP-rate-limit / no device-binding** — Group 1 Agents 1+3 + Group 9 Agents 1+B1+B2 + Group 14 Wave B Agent 2.
9. **Reset_and_rebuild_v2.sql staleness** — Group 12 Wave A Agents 1+3 + Wave B Agents 1+2+3.
10. **Coming-soon wall blocking auth routes** — Group 1 Wave A Agent 3 ONLY raised it as F-A1-3-01 CRITICAL — possible original finding worth checking.

## Within-zone obvious staleness (claims later disproven by sibling agent)

1. **Group 6 T0-1 "DELETE /roles crash"** — Wave A Agent 1+2 said it's a stale claim, Wave A Agent 3 said the endpoint doesn't exist, Wave B Agent 2 confirmed it was already fixed in commit 4a59752. The MASTER_TRIAGE T0-1 entry is stale.
2. **Group 5 audit_log on web user-self billing routes** — Wave A Agent 1 said audit coverage "present" on all billing mutations (F-A5-4); Wave A Agent 2 + 3 disagreed and found gap; Wave B Agent 3 made it definitive: NO audit_log on user-self billing routes. Agent 1's claim was wrong.
3. **Group 12 RLS table count** — Wave A Agent 1 said 35 tables without RLS; Wave A Agent 3 said only 1; Wave B Agent 1 + 3 narrowed to perms_global_version (no RLS) + 14 tables with RLS-enabled-but-no-policies. The Wave A Agent 1 count is wrong; the corrected interpretation is "1 table no RLS + 14 tables RLS-no-policies."
4. **Group 11 dual-cache fallthrough** — Wave A Agents 2+3 flagged HIGH; Wave B Agent 2 re-read the code carefully and reversed course (false-positive). Wave B Agents 1+3 disagree with Agent 2. Genuinely disputed; Agent 2's analysis appears to read code more carefully but other agents may have spotted timing windows Agent 2 missed.
5. **Group 10 vpSubscriptionDidChange permission invalidation** — Wave A Agents 1+2 flagged as missing/broken; Wave A Agent 3 said it's correctly wired (notification IS posted, AuthViewModel observer DOES call invalidate + loadAll). Wave B Agent 3 reconfirmed Agent 3's reading. Agents 1+2 missed lines 50-61 of AuthViewModel.swift.
6. **Group 4 Wave A claim that "settings are fucked"** — Both Wave A agents pointed to unblock bypass + concurrent metadata clobber. Wave B Agent 1 added the previously-missed ExpertWatchlist clobber path. The diagnosis is more complete in Wave B than Wave A.
7. **Group 8 ingest cleanup status guard** — Wave A Agent 2 said discovery_items state reset has no `.eq('status','running')` guard but pipeline_runs UPDATE does; Wave B Agent 2 said the OPPOSITE — pipeline_runs UPDATE in ingest is missing the guard while discovery items have it. Different routes, both partially right.

## Notable claims worth verifying in later waves

1. **Comment status enum** — Verify in DB: `SELECT DISTINCT status FROM comments WHERE created_at > now() - interval '7 days'`. If both 'visible' and 'published' appear, the bug is live.
2. **`/api/kids/generate-pair-code` requireAuth** — Wave B Agent 2 claims missing. Re-read the actual route file (`web/src/app/api/kids/generate-pair-code/route.js`) — high-impact if confirmed.
3. **`/api/access-request` and `/api/support/public` missing auth+rate-limit** — Wave B Agent 2 claims unauthenticated POST is allowed. High-impact if confirmed.
4. **iOS APNs `registerIfPermitted` never called** — Wave B Agent 3 (Group 10) claims grep for `registerIfPermitted()` shows no callers anywhere. Direct, falsifiable, high-impact. Verify with `grep -r "registerIfPermitted" VerityPost/`.
5. **`bump_global_perms_version` RPC** — Wave B Agent 2 (Group 12) claims it doesn't exist. Verify with `grep -r "bump_global_perms_version" schema/` — if no CREATE FUNCTION, the import-permissions.js fallback path is the actual primary path.
6. **`handlePaymentSucceeded` missing perms_version bump** — Wave B Agent 2 (Group 5) claims it clears grace + restores plan_status='active' without bumping perms. Verify at `web/src/app/api/stripe/webhook/route.js:809-853`.
7. **14 tables with RLS-enabled but no policies (default-deny)** — Wave B Agent 3 (Group 12) gave specific list including `weekly_recap_*`, `bookmark_collections`, `kid_expert_sessions`, `user_warnings`. Verify with `pg_policies` query.
8. **iOS+web user-self billing routes missing audit_log** — Wave B Agent 3 (Group 5) claims `/api/billing/change-plan`, `/api/billing/cancel`, `/api/billing/resubscribe` and all admin billing routes have NO `recordAdminAction` calls. Highest impact if confirmed.
9. **Comment vote optimistic update no rollback on RPC error** — Wave A Agent 2 (Group 3) claims local state mutates BEFORE server confirms; if quiz revoked mid-flight, vote ghosted. Verify with quiz-revocation test.
10. **Permissions.js dual-cache analysis disagreement** — Wave B Agent 2 says false-positive; Wave B Agents 1+3 + Wave A Agents 2+3 say real bug. Re-trace: under what timing does `allPermsCache = null` AND `sectionCache` still has stale entries? Single concrete test case would resolve.
11. **Reset_and_rebuild_v2.sql currency** — Wave B Agent 2 listed 13 specific tables missing. Verify with `comm -23 <(grep -h CREATE.TABLE reset_and_rebuild_v2.sql) <(grep -h CREATE.TABLE schema/[0-9]*.sql)`.
12. **Coming-soon wall blocking auth flows** — Wave A Agent 3 (Group 1) F-A1-3-01 — only one agent flagged. Re-read `web/src/middleware.js:217-228` to confirm allowlist.
