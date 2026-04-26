# Audit-Final — Open Questions, Discrepancies, and Contradictions

Consolidated from AuditV1 (4 doc-zone sessions, ~20,000 lines) and AuditV2 (full-tree audit + Wave 3 verification, ~8,500 lines).

**What's in this file:**
- §1. V1 ↔ V2 direct contradictions (the audits disagree on the same fact)
- §2. Code ↔ doc contradictions (live state contradicts a written claim)
- §3. Doc ↔ doc internal contradictions (one repo doc contradicts another)
- §4. Self-contradictions inside a single doc
- §5. Live runtime bugs the code shows
- §6. Open questions only owner can answer
- §7. Findings either audit flagged but neither verified

Every item cites **what the source said** and **what current code or DB says**. Code is the tiebreaker. Where code wasn't checked, the item is marked "needs verification."

---

## 1. V1 ↔ V2 direct contradictions

### Q1. MASTER_TRIAGE Tier 0 #1 — fixed or open?
- **V1 (Session 3):** Q_SOLO_VERIFICATION confirms `assertActorOutranksTarget` → `requireAdminOutranks` shipped in commit `4a59752`. Tier 0 #1 entry is stale, never updated to mark closed.
- **V2 (AuditV2.md C14):** lists as "still in code" launch-blocking critical bug.
- **Tiebreaker not yet run:** `git show 4a59752 -- web/src/app/api/admin/users/[id]/roles/route.js` — does the file at HEAD use `requireAdminOutranks` or `assertActorOutranksTarget` on line 130 of the DELETE handler?
- **Likely truth:** V1 (V2 carried forward the triage entry without re-grepping the current file).

### Q2. MASTER_TRIAGE Tier 0 #2 — fixed or open?
- **V1:** EXT_AUDIT_TRIAGE Bucket 1 confirms B1 (Stripe perms_version) shipped in `e8898a8`. Doesn't address #2 directly.
- **V2:** lists as still open.
- **Tiebreaker not yet run:** read `web/src/app/api/admin/billing/cancel/route.js:37` and `freeze/route.js:35` — is the variable still `actor.id` (broken) or fixed to `user.id`?

### Q3. `tsconfig.json: strict` value
- **V1 (Session 3):** external UU.1 confirms `strict: false`. PM_PUNCHLIST line 60 also says false. Concluded V1's earlier "strict: true" web-config audit was wrong.
- **V2 (Wave 3):** read the file directly: `"strict": true` on line 7.
- **Tiebreaker:** code wins. **V2 is right; V1 was misled by an external-audit hallucination.** External UU.1 itself was a BS finding the review pass missed.

### Q4. OWNER_ACTIONS_2026-04-24 ↔ OWNER_TODO_2026-04-24 — duplicate or complementary?
- **V1 (Session 3):** "complementary, not duplicates. Sub-confirmed by Q_SOLO_VERIFICATION cross-references."
- **V2 (W2-11 Q2):** "two views of the same 8-9 infra tasks. Recommend consolidating."
- **Tiebreaker not yet run:** open both files side by side, line-by-line diff.
- **Likely truth:** V1 (V1 actually read both end-to-end; V2 carried Z03 inventory secondhand).

### Q5. ParentalGateModal callers
- **V1 (Session 3 cross-link):** "K5 in MASTER_TRIAGE says exists, used only on /profile Unpair + Privacy/Terms. NOT on quizzes, expert sessions, settings, reading. COPPA gap" + memory says `feedback_verify_audit_findings_before_acting.md` 2026-04-25 says ParentalGate has live COPPA callers — but iOS audit verified zero callers. Three different doc statuses for the same modal.
- **V2 (W2-03):** verified 4 live callers via grep (PairCodeView help-mailto, ProfileView × 2, ExpertSessionsView).
- **Tiebreaker:** V2 ran the grep; V1's "iOS audit verified zero callers" claim was Wave-1 secondhand. **V2 right — at least 4 callers exist.** But V1's K5 phrasing about "NOT on quizzes, expert sessions, settings, reading" identifies specific surfaces the modal IS NOT on; ExpertSessionsView callsite may be the only expert-side one. Worth re-grepping with surface specificity.

---

## 2. Code ↔ doc contradictions (live verified)

### Q6. CLAUDE.md says CSP is "(enforce)"; PM_PUNCHLIST + PM_ROLE say "Report-Only"
- **CLAUDE.md line 49:** "auth + CORS + CSP (enforce) + /kids/* redirect"
- **PM_ROLE.md line 385:** "Auth, CSP (Report-Only), CORS, kids redirect, coming-soon gate"
- **PM_PUNCHLIST line 59:** "CSP still Report-Only at web/src/middleware.js:188 (#00-F)"
- **External audit OO.1:** confirms Report-Only.
- **AuditV2 Z12 finding:** "CSP shipped with both enforce-mode header and a strict report-only header for migration tracking."
- **Verification needed:** read `web/src/middleware.js:188` directly. Two headers may both be present (enforce + report-only-strict-for-migration). If both are emitted, CLAUDE.md isn't strictly wrong — but the doc-level wording disagreement is real.

### Q7. CLAUDE.md says owner has no Apple Dev account; ROTATIONS.md tracks Team FQCAS829U7; memory 2026-04-25 says enrolled
- **CLAUDE.md line 35-39:** "owner does not yet have an Apple Developer account"
- **ROTATIONS.md line 17, 43:** `APPLE_TEAM_ID=FQCAS829U7`, "Last rotated: 2026-04-23"
- **OWNER_TODO_2026-04-24 TODO-4:** "Start Apple Developer enrollment"
- **Memory 2026-04-25 (`project_apple_console_walkthrough_pending.md`):** "Owner is enrolled. Account active. APNs / SIWA / signing keys all present. Apple block lifted."
- **PRELAUNCH §9.2 line 482:** flags AASA + entitlements as "currently broken on both ends."
- **V1 I-3:** owner needs to clarify whether enrolled in paid Developer Program or an individual Apple ID.
- **V2 W2-04:** memory wins (most recent). CLAUDE.md is stale.
- **Real question for owner:** is the Developer Program enrollment paid-tier-active, allowing App Store Connect publishing? (vs. just credentials present.) **Open.**

### Q8. README.md says "kids iOS doesn't exist yet"; tree shows `VerityPostKids/` exists
- **README.md line 49:** "(kids iOS doesn't exist yet — see VerityPostKids/README.md)"
- **README.md line 16:** "VerityPostKids/ — SwiftUI Kids iOS app — pair-code auth via custom JWT"
- **README.md line 15:** "VerityPost/ — SwiftUI iOS app (currently unified: adult + kid mode)" — also wrong, kid mode removed 2026-04-19.
- **CLAUDE.md line 121:** "VerityPost/ — UNIFIED adult app (kid mode removed 2026-04-19)"
- **Filesystem:** `VerityPostKids/` exists with 33 Swift files, working app target.
- **Verdict:** README is wrong on three separate facts simultaneously. **Stale.**

### Q9. `Reference/runbooks/CUTOVER.md` says deploy is manual; `STATUS.md` says deploys-on-push verified 2026-04-21
- **STATUS.md line 22:** "Hosting: Vercel — Deploys on push to main (verified 2026-04-21)"
- **CUTOVER.md lines 80-82:** "Vercel's Ignored Build Step is ON by default for this project, so auto-deploy on push is disabled. Manual `vercel --prod` is the only way to ship."
- **Verification needed:** check Vercel dashboard for Ignored Build Step setting + recent deploys. Owner-side check — assistant can't see this.

### Q10. `Future Projects/db/00_INDEX.md` says latest migration `20260420020544`; live `schema/` has 169 migrations through 177
- **db/00_INDEX.md:** snapshot from 2026-04-20.
- **`supabase_migrations.schema_migrations` log:** latest = `20260420020544`. Confirms the doc's snapshot was correct AT THAT TIME.
- **`ls schema/`:** 169 numbered files through `177_grant_ai_models_select.sql`.
- **CLAUDE.md "MCP-verify schema, never trust supabase_migrations log" rule:** subsequent migrations (095+) applied via SQL editor paste don't update the log.
- **Verdict:** doc not "wrong" but stale. Should count from disk, not log. **Stale.**

### Q11. Multiple docs reference `@admin-verified` markers as live; CLAUDE.md retired them 2026-04-23
- **Active-doc residuals (verified by grep):**
  - `Current Projects/F7-DECISIONS-LOCKED.md:18`
  - `Current Projects/F7-PM-LAUNCH-PROMPT.md:61, 203`
  - `Future Projects/views/00_INDEX.md:51`
  - `Future Projects/db/00_INDEX.md:41`
  - `Future Projects/08_DESIGN_TOKENS.md:19`
  - `web/src/app/admin/pipeline/runs/page.tsx` (Z14)
  - `Reference/FEATURE_LEDGER.md` (lines 471-489)
  - `Reference/README.md:36`
- **CLAUDE.md line 232:** explicitly retires markers; "the rule applies categorically. No exceptions, no special markers."
- **Memory `feedback_admin_marker_dropped.md` 2026-04-23:** confirms retirement.
- **Verdict:** 9 active-doc residuals contradict canonical retirement. **Cleanup needed.**

### Q12. `Reference/FEATURE_LEDGER.md` references `site/` paths; `site/` was renamed to `web/` 2026-04-20
- **FEATURE_LEDGER.md lines 22, 42, 62, 82+:** `site/src/app/...` references throughout
- **CHANGELOG.md 2026-04-20:** documents the rename
- **Verdict:** stale. Same applies to `Reference/README.md`, `Current Projects/APP_STORE_METADATA.md` (5+ inline + 6 cross-refs), `Reference/runbooks/ROTATE_SECRETS.md:94`.

### Q13. `cleanup_rate_limit_events` RPC references column `occurred_at`; live column is `created_at`
- **pg_proc body:** `DELETE FROM rate_limit_events WHERE occurred_at < now() - make_interval(days => p_retention_days)`
- **information_schema.columns:** `rate_limit_events` columns are `id, rule_id, user_id, ip_address, endpoint, action, request_count, window_start, user_agent, metadata, created_at, key`. **No `occurred_at`.**
- **Live row count:** 8,562 rows (would be lower if cleanup ran).
- **Verdict:** **runtime bug.** RPC errors on every invocation. Cleanup never runs.
- **Severity check pending:** does pg_cron actually schedule this function? (`SELECT * FROM cron.job WHERE command LIKE '%cleanup_rate_limit_events%'`)

### Q14. Migrations 092, 093, 100 tracked in `supabase_migrations` log; SQL files NOT on disk
- **`ls schema/092*` `093*` `100*`:** no matches.
- **`grep -rln "require_outranks\|caller_can_assign_role" schema/`:** zero hits.
- **pg_proc:** both RPCs exist with full bodies.
- **CLAUDE.md mentions** `100_backfill_admin_rank_rpcs_*.sql` as "a backfill of live RPCs, not a real migration" — but the file does not exist in `schema/`.
- **Verdict:** the two most security-critical admin RPCs have **zero on-disk source.** `reset_and_rebuild_v2.sql` is too old to include them. Disaster recovery would be missing them.

### Q15. Schema 127 rollback DELETE references wrong perm-key naming
- **Forward 126** inserts: `admin.pipeline.clusters.manage`, `admin.pipeline.presets.manage`, `admin.pipeline.categories.manage`
- **Rollback 127** deletes: `pipeline.manage_clusters`, `pipeline.manage_presets`, `pipeline.manage_categories`
- **Verdict:** rollback would not match anything. **Footgun if ever run.**

### Q16. 8 RPC bodies still reference dropped `superadmin` role
- **Migration 105:** dropped `superadmin` from `roles` table.
- **Live `roles` table:** 8 rows: admin, editor, educator, expert, journalist, moderator, owner, user. No superadmin.
- **pg_proc query for `prosrc LIKE '%superadmin%'`:** 8 routines: `_user_is_moderator`, `approve_expert_answer`, `approve_expert_application`, `expert_can_see_back_channel`, `grant_role`, `mark_probation_complete`, `reject_expert_application`, `revoke_role`.
- **Verdict:** dead-code residue. Each routine likely has `r.name IN ('owner','superadmin','admin')` — the `superadmin` slot will never match a real user. Cleanup migration recommended.

### Q17. `import-permissions.js` calls non-existent RPC `bump_global_perms_version`
- **Script line ~234** (per Z19): `service.rpc('bump_global_perms_version', ...)`
- **pg_proc query:** RPC does not exist.
- **Z19 says** script falls through to a confusing "version: 999 signal" intermediate write.
- **Verdict:** script is broken; the `--apply` path doesn't bump the global version as advertised.

### Q18. `hasPermissionServer` exported with different semantics from two libs
- **`web/src/lib/auth.js:201`:** uses `compute_effective_perms` RPC + `loadEffectivePerms` cache
- **`web/src/lib/permissions.js:207`:** uses `has_permission(p_key)` RPC via `createClient()` (browser cookie session)
- **Importers (verified):**
  - From `@/lib/auth`: 5 API routes (comments, admin/billing/audit, search, account/delete, notifications/preferences)
  - From `./permissions`: `web/src/lib/rlsErrorHandler.js`
- **Question:** rlsErrorHandler is invoked from API routes (server context). It pulls from `permissions.js` which uses the browser-cookie client. Possibly wrong client semantics.
- **Verification needed:** read `lib/rlsErrorHandler.js` end-to-end + trace which client it actually gets.

### Q19. CLAUDE.md says "23 rules-of-hooks disables"; actual count is 25
- **`grep -rn "react-hooks/rules-of-hooks" web/src`:** 25 hits across 4 files.
- **Files:** `app/recap/page.tsx`, `app/recap/[id]/page.tsx`, `app/u/[username]/page.tsx`, `app/welcome/page.tsx`.
- **Z12 noted** zero in `lib/`; CLAUDE.md mentions in lib context.
- **Verdict:** count + location both wrong in CLAUDE.md.

### Q20. CLAUDE.md repo-tree comment claims `FALLBACK_CATEGORIES` hardcode in page.tsx
- **`grep -c "FALLBACK_CATEGORIES" web/src/app/page.tsx`:** **0**.
- **page.tsx line 89, 202-203:** reads from `articles.hero_pick_for_date` directly. DB-driven.
- **MASTER_TRIAGE search for FALLBACK_CATEGORIES:** **0 hits** — there is no triage entry by that name either.
- **Verdict:** CLAUDE.md comment is stale. Constant doesn't exist; triage entry doesn't exist.

### Q21. `Future Projects/24_AI_PIPELINE_PROMPTS.md` references `web/src/lib/editorial-guide.js`
- **Filesystem:** `web/src/lib/pipeline/editorial-guide.ts` exists (TS, in pipeline subfolder).
- **Verdict:** path drift. Doc stale.

### Q22. Multiple docs cite retired Charter docs as live deps
- **Charter retired 2026-04-21:** `04_TRUST_INFRASTRUCTURE.md`, `17_REFUSAL_LIST.md`, `db/07_standards_doc_table.md`, 4 web-standards mockups.
- **Still cited as deps by:** Future Projects/05, 06, 10, 19, 24, db/05 cite 04; 05 + 10 cite 17.
- **views/ docs ask UI links to retired routes** that don't exist in `web/src/app/`: `/standards`, `/corrections`, `/refusals`, `/editorial-log`, `/masthead`.
- **Verdict:** Charter cleanup incomplete; 6+ docs orphaned.

### Q23. `db/03_corrections_table` + `db/06_trust_events_table` marked DEFERRED but still cited as shipping
- **db/03 + db/06:** explicit DEFERRED note 2026-04-21.
- **views/ios_adult_profile.md:** adds `/corrections` to iOS Settings menu.
- **Verdict:** views/ refs not updated when db deferrals were applied.

### Q24. `views/00_INDEX.md` line 38 says "Kids iOS (8 files)"; actual is 9
- **Doc:** "8 files"
- **Filesystem:** 9 files (`ios_kids_pair`, `_home_greeting`, `_reader`, `_quiz`, `_streak`, `_badges`, `_leaderboard`, `_profile`, `_expert`).
- **Verdict:** miscount.

### Q25. `db/00_INDEX.md` line 54 instructs logging in retired `FIX_SESSION_1.md`
- **FIX_SESSION_1.md retired** per CLAUDE.md, absorbed into MASTER_TRIAGE_2026-04-23.md.
- **Verdict:** retired-tracker reference.

### Q26. `views/web_search.md` proposes `/` keyboard shortcut
- **Memory `feedback_no_keyboard_shortcuts.md`:** "Don't propose or build keyboard shortcuts / hotkeys / command palettes for admin flows; click-driven only."
- **Spec violates** the no-shortcuts rule.
- **Verdict:** spec contradicts captured user preference.

### Q27. `Reference/PM_ROLE.md` says "Next.js 15"; live `web/package.json` is `^14.2.0`
- **PM_ROLE line 280:** "Next.js 15 app router"
- **STATUS.md line 17:** "Next.js 14 app router" (matches package.json)
- **CLAUDE.md line 60:** punts to package.json (safest)
- **Verdict:** PM_ROLE wrong major version.

### Q28. `Reference/PM_ROLE.md` says `lib/supabase/{client,server}.js`
- **Filesystem:** files are `.ts` extension.
- **Verdict:** PM_ROLE stale on extension.

### Q29. Adult quiz pass threshold hardcoded `>= 3` in RPC
- **`user_passed_article_quiz` body:** `WHERE t.correct_sum >= 3` — hardcoded.
- **`settings` table query for `quiz%`:** only `kids.quiz.pass_threshold_pct = 60` (kids-only).
- **CLAUDE.md "DB is default" rule:** violated.
- **Verdict:** real but minor.

### Q30. iOS adult `aps-environment` entitlement missing
- **Z17:** missing despite `PushRegistration` calling `registerForRemoteNotifications`.
- **Apple block status:** memory says owner now has Dev account; this is now a code-fix not blocked.
- **Verdict:** real bug.

### Q31. iOS AppIcon.appiconset has no PNG
- **Z17:** appiconset directory empty of PNG.
- **Verdict:** App Store submission blocker.

### Q32. iOS `CFBundleVersion = 1` never bumped
- **Z17:** never incremented.
- **Verdict:** App Store rejects identical CFBundleVersion across uploads.

### Q33. KidsAppState `completeQuiz` mutates state before server confirmation
- **KidsAppState.swift:187-200:** local `verityScore += scoreDelta`, `quizzesPassed += 1`, `streakDays += 1` BEFORE server call.
- **`loadKidRow()`** only re-reads `streak_current`. verityScore + quizzesPassed never re-fetched.
- **Verdict:** real divergence on server failure or app restart.

### Q34. iOS `BadgeUnlockScene` unreachable
- **KidsAppState.swift:202-206:** badge constructed inside `if biasedSpotted`.
- **KidsAppRoot.swift:199:** calls `completeQuiz(...biasedSpotted: false)` hardcoded.
- **Verdict:** dead branch — badge never assigned.

### Q35. iOS `QuizPassScene` orphan
- **grep:** only constructed in own `#Preview` (line 335).
- **KidQuizEngineView.swift:7** has a comment referring to it but no constructor.
- **Verdict:** orphan code.

### Q36. `events` parent partitioned table has RLS enabled but no policies
- **`pg_policies`:** zero policies for `events`.
- **`events_*` partitions:** RLS disabled (correct PostgreSQL pattern; partitions inherit at parent level).
- **Effect:** writes via service role only; user-context queries fail closed.
- **Wave A's "35 tables missing RLS" / Wave B's "1+14":** both wrong. Only `events` qualifies and it's intentional.
- **Verification needed:** confirm `/api/events/batch` uses service-role client.

### Q37. `verity_family_annual` + both `verity_family_xl` plans `is_active=false`
- **Live `plans` table:** these 3 rows have `is_active=false`. `verity_family_monthly` is the only family plan active.
- **Verdict:** owner-decision item — intentional pre-launch posture, or oversight?

### Q38. `lib/plans.js` hardcoded TIERS / PRICING / TIER_ORDER
- **`plans` table** has `display_name`, `price_cents`, `sort_order` columns with all the data needed.
- **Verdict:** DB-default-rule violation. Replace with cached helper.

### Q39. `CommentRow.tsx:31` hardcoded `COMMENT_MAX_DEPTH = 2`
- **`settings.comment_max_depth = 2`** (verified). Match coincidental.
- **post_comment RPC** uses `_setting_int('comment_max_depth', 3)` fallback.
- **Verdict:** DB-default-rule violation; fragile.

### Q40. `import-permissions.js` hardcoded role→set + plan→set mappings (lines 156-184 per Z19)
- **DB tables:** `role_permission_sets` (45 rows), `plan_permission_sets` (21 rows).
- **Verdict:** third source-of-truth alongside xlsx + DB.

### Q41. `/api/comments/[id]/report` has NO rate limit
- **Sister `/api/reports`:** has `checkRateLimit` 10/hr.
- **`/api/comments/[id]/report`:** read first 40 lines — no rate-limit call. Possibly added below body parsing (unlikely; needs full read).
- **Verification needed:** read the full file end-to-end.

### Q42. Three competing client-side admin gating patterns
- **Hardcoded `'owner'||'admin'` literals** on 6 admin pages: access, analytics, feeds, notifications, subscriptions, system
- **Role-set membership** via `ADMIN_ROLES`/`MOD_ROLES` etc. on ~30 pages
- **`hasPermission('key')` resolver** on 4 pages: categories, permissions, prompt-presets, users
- **CLAUDE.md "permissions matrix is platform DNA":** implies `hasPermission` is canonical.
- **Verdict:** 3 patterns coexisting; canonical wins.

---

## 3. Doc ↔ doc internal contradictions

### Q43. `Reference/CLAUDE.md` vs `Reference/PM_ROLE.md` — assistant role
- **CLAUDE.md lines 1-7:** "You are the owner's thinking brain. You operate as a master of this stack, not an assistant asking permission."
- **PM_ROLE.md lines 33-41:** "Precedence clause: When CLAUDE.md and this file conflict on role or scope... PM_ROLE.md wins."
- **PM_ROLE.md lines 43-86:** "You do not touch code. You do not edit files. You do not run SQL. You orchestrate."
- **PM_ROLE.md lines 197-207:** "Invariants: You are the PM. Agents do investigation and code. You never Edit, Write, or run SQL directly."
- **Today's session (and presumably others) operates in CLAUDE.md mode.** PM_ROLE.md is shadow-canonical.
- **Owner question:** which mode wins? Is the other file retired?

### Q44. `Reference/CHANGELOG.md` 5+ days behind
- **Single dated entry:** 2026-04-20
- **Missing:** 04-21 (reorg), 04-22 (F7 Phase 4 + 22 commits), 04-23 (admin-marker drop), 04-24 (audit), 04-25 (bug-hunt)
- **MASTER_TRIAGE SHIPPED blocks + session logs cover the same ground.**
- **Owner question:** retire CHANGELOG.md, or backfill?

### Q45. `Reference/PM_ROLE.md` references retired `FIX_SESSION_1.md` as canonical
- **PM_ROLE line 458:** "A later full audit at FIX_SESSION_1.md is now the canonical tracker."
- **CLAUDE.md + STATUS.md + memory:** FIX_SESSION_1 retired into MASTER_TRIAGE.
- **Verdict:** PM_ROLE has its own retirement note for the old handover but missed the FIX_SESSION_1 retirement.

### Q46. `Verity_Post_Design_Decisions.md` D10 vs D34 — tier count
- **D10 (line 134-151):** 4 tiers (Free, Verity, Verity Pro, Verity Family) at $0/$3.99/$9.99/$14.99
- **D34 (line 506-532):** 5 tiers — adds Verity Family XL at $19.99
- **D42 (line 635-652):** annual table lists all 5 tiers
- **Verdict:** D10 not flagged as superseded. Reader hitting D10 first gets wrong list.

### Q47. F7-DECISIONS-LOCKED Decision 8 vs §5 line 348 — quiz verification behavior
- **Decision 8 (line 230):** "patches wrong correct_index values"
- **§5 step list line 348:** "spec reconciled 2026-04-22 to match generate/route.ts:1338-1343 behavior — earlier 'patches' wording was aspirational; implementation chose throw-and-regenerate for safety."
- **Internal contradiction within the canonical F7 doc.**

### Q48. F7-PHASE-3-RUNBOOK §1+§8 say "10-prompt chain"; §3a vocabulary lists 12
- **§1 line 11 + §8 line 261-262:** "10 prompts"
- **§3a:** 12 step names enumerated
- **Internal inconsistency.**

### Q49. F7-PHASE-3-RUNBOOK §4 cluster-lock RPC stale
- **§4 lines 119-179:** describes draft RPC with `locked_until` columns
- **Same file's changelog lines 360-361:** notes shipped migration 116 uses `locked_at` + `generation_state` columns
- **Self-contradicting within the same doc.**

### Q50. F1 sources-above-headline vs PRELAUNCH §3.2
- **F1:** small-caps line ABOVE the headline
- **PRELAUNCH §3.2:** sources inline as superscript citations
- **Direct opposite designs.** Owner-decision.

### Q51. F4 quiet-home-feed vs PRELAUNCH §3.1
- **F4:** strip home, no images, just headlines + meta line
- **PRELAUNCH §3.1:** full-bleed image-led hero
- **Direct opposite designs.** Owner-decision.

### Q52. F2 reading-receipt silently dropped
- **F2:** monospaced read-receipt stub at end of article
- **PRELAUNCH:** no mention of reading receipt anywhere
- **F2 not retired or marked superseded.** Either retire or surface.

### Q53. F3 earned-chrome-comments absorbed into PRELAUNCH §3.2 with no cross-reference
- **F3:** hide comment section completely from anon/pre-pass
- **PRELAUNCH §3.2:** "Comments unfold on pass" — same idea, more developed
- **No cross-reference either direction.** Should mark F3 superseded.

### Q54. F5-ads-gameplan has 8 unanswered owner decisions
- **§1 D1-D8:** AdSense pub ID, networks, CMP choice, launch countries, paid-tier exclusion, reduced-tier, kids-no-ads-confirmed, iOS-ads-default-no — all blank.
- **F6 supersedes scope** but doesn't retire F5.
- **Owner-decision** to lock or retire.

### Q55. F6 §5 Scoring system stale
- **F6 §5 (lines 507-605):** describes rolled-back schema/109 verity_score_events ledger.
- **Reference/PM_ROLE.md §6** explicitly flags this.
- **Reference/08-scoring-system-reference.md** is canonical.
- **F6 still uncorrected.** Three locations inside F6 need rewrite (§5, §7 Phase A item 2, "What ships first" item 2).

### Q56. PRELAUNCH_UI_CHANGE Part 5 vs §3.13 — schema add
- **Part 5 line 297:** "What stays the same: All RPCs and DB schema. Permission matrix. Plan catalog. Score tiers. Score rules. Rate limits."
- **§3.13 line 224:** "Pull illustrations from `articles.illustration_url` (column add, UI-only)"
- **Direct contradiction.** Plus: kids section §3.13 references `articles` not `kid_articles` — muddled given F7 Decision 2 separate-tables.

### Q57. F7-DECISIONS-LOCKED line 486 says "Phase 4 continues with Tasks 21+ next session"; Task 27 SHIPPED at lines 488-490
- **Doc edited in place** after the "next session" line; the line wasn't updated.
- **Confusing reader-experience** but not factually wrong.

### Q58. PM_PUNCHLIST line 60 `tsconfig 'strict':false`
- **Verified false** by V2 Wave 3 direct read: `strict: true`.
- **Punchlist line wrong.**

### Q59. C26_RLS_CLASSIFICATION_DRAFT.md vs RLS_14_CLASSIFICATION.md
- **RLS_14:** lists 14 tables explicitly with classifications (12 USER_ACCESSIBLE + 2 SERVICE_ROLE_ONLY).
- **C26_DRAFT:** "audit didn't enumerate which 14 — owner please run query and paste."
- **Two docs in same folder, one solving the problem the other says is unsolved.**

### Q60. EXT_AUDIT_FINAL_PLAN scope (28 items in 4 batches) vs EXT_AUDIT_BUCKET5_TRACKER queue (~80 items)
- **FINAL_PLAN** post-ship at SHA `5ad6ad4`; says 4 batches, 28 items, 5 hours.
- **TRACKER** "future batches (queued)" lines 110-145: ~80 items.
- **Don't reconcile.** Reader can't tell which is canonical.

### Q61. MASTER_FIX_LIST_2026-04-24 presents 71 items as live; PHASE_8_VERIFICATION says 65/71 PASS
- **MASTER_FIX_LIST has no per-item SHIPPED markers.**
- **PHASE_8 confirms** 65/71 closed at anchor `e8898a8`.
- **Reader hitting MASTER_FIX_LIST first treats 71 as open.**

### Q62. `OWNER_ACTIONS_2026-04-24` Bucket 1 lists 6 items shipped at `e8898a8` — IDs don't appear in MASTER_FIX_LIST C-tier
- **External-audit IDs:** C2, Q.1, M.2, K.6, L.4, F.1
- **Map to MASTER_FIX_LIST H8/M-equivalents** — but the mapping isn't documented anywhere.

### Q63. `review external audit` ends with conversational meta from another agent's session
- **Lines 3512-3536:** "And don't work on anything" / "Got it — leaving the artifact alone." / references to `/root/.claude/plans/` and `/home/user/site/` (paths that don't exist on this filesystem) / proposes commit + push to `claude/review-files-c8HQu` branch.
- **Verdict:** authored externally and copy-pasted in. Tail should be stripped.

### Q64. 12+ external-audit hallucinations caught by review pass
- **Per `review external audit-review`:** K.2, BB.2, BBB.1, FF.2, AAA.9, Y.11, RR.1, L.3, U.6, W.7, EE.1, BB.1 — all verified false at file:line evidence.
- **Original `review external audit` not annotated** — reader hitting it alone takes false-positives as real.

### Q65. 8 Round 2 lenses didn't write to disk
- **Persisted:** L03, L05, L06, L07, L09, L10, L14
- **Only in `_NOTIFICATION_DIGEST.md`:** L01, L02, L04, L08, L11, L12, L13, L15
- **47 findings have weaker provenance than the 7 persisted lenses.**

### Q66. `Future Projects/24_AI_PIPELINE_PROMPTS.md` (V4) vs F7-DECISIONS-LOCKED (Phase 4 SHIPPED)
- **24_AI_PIPELINE_PROMPTS:** proposes V4 prompts with different version system + override path.
- **F7-DECISIONS-LOCKED:** records Phases 1-4 SHIPPED with 12-step orchestrator.
- **No reconciliation marker on either side.**

### Q67. `09_HOME_FEED_REBUILD.md` bridge state vs `db/04_editorial_charter_table.md` final state
- **09:** notes feed temporarily reads `articles.hero_pick_for_date` until `front_page_state` ships.
- **db/04:** designs `front_page_state` as Phase 1 Week 3 deliverable.
- **No SHIPPED marker on either side.**
- **schema/144** already shipped a hero-pick proxy 2026-04-23 (per Z06).

### Q68. `views/ios_adult_subscription.md` pricing not locked
- **Doc names** $6.99 / $12.99 / $19.99 / $29.99
- **Qualifier:** "Option A per `02_PRICING_RESET.md`; adjust if owner committed Option B"
- **`02_PRICING_RESET.md`** presents A vs B without owner-locked decision.
- **Live `plans` table** has actual prices: $3.99 / $9.99 / $14.99 / $19.99 (different numbers entirely).
- **Verdict:** spec doc divergent from live state.

### Q69. mockups: `web-home.html` vs `web-home-standalone.html` byte-identical
- **diff:** no output.
- **README.md** lists only `web-home.html`.
- **Likely incidental copy.**

### Q70. `Unconfirmed Projects/product-roadmap.md` (1443 lines, 2026-04-19) wholly superseded by Future Projects
- **References** retired `/WORKING.md`, `docs/runbooks/CUTOVER.md`, `docs/planning/FUTURE_DEDICATED_KIDS_APP.md`, `docs/reference/Verity_Post_Design_Decisions.md`.
- **Content moved to** Future Projects/02, 03, 05, 06, 07, 09, 10, 18.
- **Should retire.**

### Q71. `Unconfirmed Projects/UI_IMPROVEMENTS.md` (613 lines, 2026-04-19) partially superseded
- **Items moved to** Future Projects/08, 11, 13, 14, 16.
- **Some unique items** on `ProfileSubViews.swift` and `SettingsView.swift` not covered in Future Projects.
- **Some shipped per** Sessions/04-21-2026 logs but doc not updated.

---

## 4. Self-contradictions inside a single doc

### Q72. `Reference/README.md` line 15 vs 49
- **Line 15:** "VerityPost is currently unified: adult + kid mode"
- **Line 49:** "(kids iOS doesn't exist yet — see VerityPostKids/README.md)"
- **Three claims, mutually exclusive.**

### Q73. `Reference/FEATURE_LEDGER.md` header vs body
- **Header:** "Last updated 2026-04-18"
- **Body:** strikethrough/RESOLVED edits dated through 2026-04-19 (Round 5/6)
- **Mixed signal:** active maintenance vs frozen header date.

### Q74. F7-DECISIONS-LOCKED line 486 vs Task 27 SHIPPED block
- (Captured in Q57.)

### Q75. F7-PHASE-3-RUNBOOK 10-vs-12 step count
- (Captured in Q48.)

### Q76. F7-PHASE-3-RUNBOOK §4 stale-RPC
- (Captured in Q49.)

### Q77. F7-DECISIONS-LOCKED Decision 8 vs §5
- (Captured in Q47.)

### Q78. PRELAUNCH Part 5 vs §3.13
- (Captured in Q56.)

---

## 5. Live runtime bugs the code shows now (high confidence)

| ID | Bug | Verified by |
|---|---|---|
| R1 | `cleanup_rate_limit_events` references nonexistent column `occurred_at` | pg_proc + information_schema |
| R2 | Migrations 092/093/100 have zero on-disk source | `ls schema/092*` etc. + grep |
| R3 | Schema 127 rollback DELETE uses wrong perm-key naming | grep schema/127 |
| R4 | `import-permissions.js` calls non-existent RPC | pg_proc |
| R5 | 8 RPC bodies still reference dropped `superadmin` role | pg_proc |
| R6 | `BadgeUnlockScene` unreachable (`biasedSpotted: false` hardcoded) | grep |
| R7 | `QuizPassScene` orphan (only own #Preview) | grep |
| R8 | `KidsAppState.completeQuiz` mutates state pre-server-confirm | KidsAppState.swift |
| R9 | iOS adult `aps-environment` entitlement missing | Z17 (pbxproj entitlements file) |
| R10 | iOS AppIcon.appiconset has no PNG | Z17 |
| R11 | iOS `CFBundleVersion=1` never bumped | Z17 |

Items R1-R8 verified directly during the audit; R9-R11 verified via Wave 1 inventory (high confidence but should re-grep).

---

## 6. Open questions only owner can answer

### O1. PM_ROLE.md vs CLAUDE.md mode (Q43)
Which is canonical? Retire the other?

### O2. Apple Developer Program enrollment vs personal Apple ID (Q7)
Is the FQCAS829U7 team a paid Developer Program account or just a personal Apple ID with the listed credentials? The latter would still gate App Store publishing.

### O3. Vercel auto-deploy state (Q9)
Is "Ignored Build Step" off (auto-deploy on) or on (manual only)?

### O4. Charter retired-but-cited (Q22)
Resurrect the 4 retired Charter docs OR mass-edit the 6 citing docs?

### O5. F1 vs PRELAUNCH source attribution (Q50)
Pick one design.

### O6. F4 vs PRELAUNCH home design (Q51)
Pick one design.

### O7. F2 reading-receipt fate (Q52)
Retire explicitly OR resurface in PRELAUNCH?

### O8. F5 ads gameplan 8 unanswered decisions (Q54)
Lock or retire as superseded by F6?

### O9. PRELAUNCH §3.13 illustration_url scope (Q56)
Schema-add or schema-stays-same? Adult or kid table?

### O10. F7-DECISIONS-LOCKED Decision 8 vs §5 quiz verification (Q47)
"Patches" or "throw-and-regenerate"?

### O11. CHANGELOG retirement (Q44)
Maintain or retire (MASTER_TRIAGE + sessions log replace it)?

### O12. `verity_family_annual` + `verity_family_xl` plans `is_active=false` (Q37)
Intentional or oversight?

### O13. `ai_models` dual-provider (Anthropic + OpenAI both is_active=true)
Both intended for production, or one defunct?

### O14. Q-CON-03 coming-soon wall scope (V1 unresolved)
Wave A says blocks /signup; reviewer disagreed. Owner asked to "visit /signup in incognito."

### O15. Story-manager vs F7 articles/[id]/{review,edit}
Keep parallel admin or deprecate legacy story-manager + kids-story-manager?

### O16. `kids-story-manager` (1037 LOC) merge with `story-manager` (1229 LOC) via `?kid=true` toggle?

### O17. `auth.users` `tsconfig.json` strict false claim (Q3)
External UU.1 claimed false (it's a hallucination — V2 verified true). Q-SOLO didn't catch this. Owner aware?

### O18. AuditV1 vs AuditV2 archival
Archive AuditV1 once V2 acted on, or keep both?

### O19. Round 2 NOTIFICATION_DIGEST 8 unwritten lenses (Q65)
Re-run with Write enforcement, or accept digest as authoritative?

### O20. EXT_AUDIT_FINAL_PLAN 28 items vs BUCKET5_TRACKER 80-queue (Q60)
Which is the active queue?

### O21. MASTER_TRIAGE Tier 0/1 launch-blocking items
6 items (Tier 0 #1, #2; Tier 1 #4, #6, #7, #8) without SHIPPED markers. Per V1: at least #1 + B1 are stale (already shipped). Need owner ack of: which 6 are still real, which already shipped.

---

## 7. Findings flagged but neither audit verified

### N1. `register_if_permitted` Wave B finding
- V2 found the function doesn't exist anywhere in `web/src` (zero grep hits).
- V1 didn't reach this far.
- **Wave B's "never called" framing was wrong** — function never existed.
- **Status:** spurious. Mark refuted in audit tracker.

### N2. `/api/access-request` Wave B "no auth" finding
- V2 read the route — it's a 410 stub since 2026-04-25 owner Ext-AA1 decision.
- **Wave B finding stale.** Mark refuted.

### N3. `handlePaymentSucceeded` Wave B "missing perms_version bump" finding
- V2 verified bump IS wired at `api/stripe/webhook/route.js:846`.
- **Wave B finding refuted.** Mark refuted.

### N4. ExpertWatchlist concurrent-write clobber (Wave B)
- `profile/settings/page.tsx:2732` has a comment about concurrent A11yCard / ExpertWatchlistCard saves.
- **Not verified end-to-end.** Read both 2732+ and 4892+ blocks to confirm if clobber is mitigated or just acknowledged.

### N5. `permissions.js` dual-cache stale-fallthrough
- Wave A 4 vs 1 verdict: bug. Wave B Agent 2 reversed.
- Resolution at audit time: bug.
- **Not traced through cache logic to confirm.** Read `permissions.js` cache implementation + simulate stale section + missing full cache.

### N6. Comment status enum drift (Wave A 6/6 consensus)
- V2 verified live system uses `'visible'/'hidden'`; no `'published'` writes anywhere; no enum exists.
- **6/6 consensus is unusually strong** — possible they observed something specific not yet reproduced.
- **Wave 4 deep-grep needed** across schema/, admin/moderation, + all comment-touching code.

### N7. Wave A "35 tables missing RLS" / Wave B "1+14 RLS-no-policies"
- V2 verified: only `events` parent qualifies, intentional.
- **Both Wave A and Wave B counts wrong** by orders of magnitude.

### N8. L08-001 "kid RLS blocks writes (NULL = uuid → FALSE)"
- V2 verified live RLS: kid auth.uid() IS the kid_profile_id; `is_kid_delegated()` short-circuits. Blocking framing wrong.
- **L08-001 specific failure mode does not occur in live system.**

### N9. L06-001 "cross-provider duplicate sub rows"
- V2 verified: 2 active stripe subs, no duplicates exist in production.
- Hardening (B3 user_id ownership + non-upsert UPDATE/INSERT branching) actively prevents the race.
- **Theoretical concurrency note, not a current bug.**

### N10. iOS perms not refreshed on app foreground (multi-source)
- R-10-AGR-04 + external J.4 + EXT_AUDIT_FINAL_PLAN D1.
- **Open per V1 + V2.** Not yet verified in iOS code.

### N11. Cost cap cache TTL too long (60s) (multi-source)
- Round 1 H17 + R-8-AGR-02 + L10 L2-L10-05 + external U.1.
- V2 verified pipeline cost-cap settings exist in DB (`pipeline.daily_cost_usd_cap=10`, etc.) but didn't read `cost-tracker.ts` to verify cache TTL.

### N12. Discovery items state race in pipeline finally-vs-cancel
- Round 1 H18 + R-8-AGR-03 + L10 L2-L10-01 + external YY.A4.
- **Open per V1.** Not yet verified.

### N13. F7-PHASE-3-RUNBOOK §4 stale RPC draft (Q49)
- Doc internally inconsistent. Resolved per shipped migration 116, but doc unchanged.

### N14. C7 admin numeric blur-only persistence + L05 L13-002
- V1 + V2 flag the same admin settings persistence bug. Not verified at code level.

### N15. AASA `/.well-known/apple-app-site-association` missing
- Z16 reports `web/public/` only has `ads.txt`. Didn't check route handlers.
- **Verification needed:** `find web/src/app -path '*well-known*'`.

### N16. `JsonLd.tsx` references `/icon.svg`; missing from `web/public/`
- **Verification needed:** check whether route handler serves it.

### N17. iOS `HomeFeedSlots.swift` and `Keychain.swift` orphan
- Z17 reports. Comprehensive grep across iOS target not done.

### N18. `admin/PipelineRunPicker.tsx` "two call sites" comment stale
- Z16 says only newsroom imports now. Didn't check dynamic imports.

### N19. 47 NOTIFICATION_DIGEST findings unswept
- Each needs a status: shipped / stale / still-open.

### N20. ~60 of 72 MASTER_TRIAGE SHIPPED claims unverified
- V2 spot-checked ~12. The other ~60 trusted, not independently verified.

### N21. 15 O-DESIGN-* + Tiers A-D items in EXT_AUDIT_FINAL_PLAN unclassified
- Many likely superseded by PRELAUNCH_UI_CHANGE_2026-04-25.

### N22. F1-F4 vs PRELAUNCH side-by-side scope diff
- Section-level diff not done.

### N23. xlsx ↔ DB row-by-row diff for permissions
- 998 permissions + 3,090 permission_set_perms vs xlsx. Tooling needed.

### N24. `tsc --noEmit` + `xcodebuild` never run
- Cannot claim green-build state.

### N25. `git log` SHA validation of SHIPPED commit refs
- 72 SHIPPED blocks cite SHAs. None individually verified via `git show <SHA>`.

### N26. `lib/rlsErrorHandler.js` cross-client semantics (Q18)
- Imports from `permissions.js`'s `hasPermissionServer` (browser-cookie client) but invoked from server context.

### N27. `audit_log` (6,456 rows) vs `admin_audit_log` (90 rows)
- Two audit-log tables. Canonical use of each not determined.

### N28. `webhook_log` (22 rows) idempotency claim end-to-end
- Locking mechanism not code-verified end-to-end.

### N29. PROFILE_FULL_FLOW.md promotion candidate
- Z08 flagged. File not opened to decide.

### N30. F7 tables 177 SELECT-grant audit
- `177_grant_ai_models_select.sql` only granted on 4 of ~10 F7 tables per Z11.
- Per-table enumeration not done.

### N31. AppleSignIn wiring in `web/src/app/api/auth/*`
- Searched briefly. No definitive answer on whether SIWA is wired end-to-end.

### N32. Adult quiz unlock threshold setting
- Q29 confirmed RPC hardcodes `>= 3`. No `settings` row exists.
- **Owner question:** is the intent "match kid pct" (60%, which `>=3` = 60% of 5 happens to be) or hardcode for performance?

### N33. `events_*` partition RLS-disabled state intent
- Q36. Likely correct PostgreSQL pattern (partitions inherit at parent), but `/api/events/batch` not read to verify service-role usage.

---

## How to use this file

- §1-§4: things that need a decision (audit verdicts disagree, or docs disagree).
- §5: things that need a code/migration fix (no decision needed; just ship).
- §6: things only the owner can resolve.
- §7: things either audit flagged but never verified — Wave 4 / mechanical close-out work.

When acting on any item: cite the Q/R/O/N number from this file in the commit / SHIPPED block so the audit thread closes cleanly.

— End of consolidated questions.
