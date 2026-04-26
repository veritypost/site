# AuditV2 — Verity Post Project Audit (2026-04-25)

Multi-wave audit of every file in the project: docs, code, schema, sessions, archives, scripts. Goal: separate confirmed duplicates / confirmed stale / confirmed conflicts / unresolved, and recommend specific actions for each.

**Methodology** — three waves over one session:
- **Wave 1** (19 parallel reading agents, ~7,000 lines of inventory written to `/tmp/audit-v2/wave1/`): every file read fully, indexed by purpose / topics / cross-refs / status.
- **Wave 2** (11 cross-reference threads, ~1,250 lines written to `/tmp/audit-v2/wave2/`): each thread resolves one cross-cutting topic (permissions, F7 pipeline, kids, Apple, reader/comments, billing, MASTER_TRIAGE, doc drift, hardcoded/JS-TS, schema/API, audit internals). Code + DB are tiebreakers, not docs.
- **Wave 3** (targeted spot-checks via Supabase MCP + grep): independent verification of every disputed claim against live state. Wave 2 agents hit the org budget and were re-run as in-thread verification.

Tiebreaker rule: **code wins, then DB, then most-recent doc.** No claim entered the final report without verification against current source or current DB state.

A prior `AuditV1/` exists in the repo (4 of 11 sessions complete, started today 2026-04-25). It overlaps in spirit; AuditV2 is broader and resolved-via-code rather than handcrafted. Recommendation: archive AuditV1 once V2 is acted on.

---

## 1. Confirmed duplicates

| ID | What | Where | Survivor |
|---|---|---|---|
| D1 | `hasPermissionServer` function name exported with different semantics from two libs | `web/src/lib/auth.js:201` (uses `compute_effective_perms`) vs `web/src/lib/permissions.js:207` (uses `has_permission` RPC) | **Rename** `permissions.js` export → `hasPermissionClient` |
| D2 | Permission set mappings hardcoded in script AND in DB | `scripts/import-permissions.js:156-184` vs `role_permission_sets` (45 rows) + `plan_permission_sets` (21 rows) | DB is canonical; rewrite script to derive from xlsx only |
| D3 | Same fix tracked under three audit IDs | GG.3 / C26 / R-12-UB-03 (per Z03) | C26 (most recent audit framing) |
| D4 | Two views of the same 8-9 infra tasks | `OWNER_ACTIONS_2026-04-24.md` vs `OWNER_TODO_2026-04-24.md` | OWNER_TODO; archive OWNER_ACTIONS |
| D5 | Story-manager admin surfaces parallel | `admin/story-manager/page.tsx` (1229 LOC) vs `admin/articles/[id]/{review,edit}/*` (F7) | Owner decision needed; both routable today |
| D6 | Kid story-manager near-duplicate | `admin/kids-story-manager/page.tsx` (1037 LOC) vs `admin/story-manager/page.tsx` (1229) | Merge with `?kid=true` toggle |
| D7 | Two `report` API routes both writing to `reports` table | `/api/reports` (perm `article.report`, rate-limit 10/hr) vs `/api/comments/[id]/report` (perm `comments.report`, NO rate limit) | Keep both (different perms); add rate limit to comments variant |
| D8 | Two `generate` AI routes both live | `/api/ai/generate` (legacy story-managers) vs `/api/admin/pipeline/generate` (F7 newsroom) | Keep both until D5/D6 resolved |
| D9 | F7 docs duplicate the 12-step canonical vocabulary + cost-cap | `F7-DECISIONS-LOCKED.md` ↔ `F7-PHASE-3-RUNBOOK.md` | DECISIONS-LOCKED canonical; RUNBOOK should `→` it |
| D10 | Charter spec duplicates source-counting columns | `VISION_KINETIC_EDITION.md` builds on `named/document/anonymous_sources_count` — `db/10_summary_format_schema.md` says these are NOT added per Charter commitment 4 | Pick one; current schema has neither column |
| D11 | Three sequential "current state" snapshots in archive | `Archived/obsolete-snapshots/` 2026-04-16/-17/-18/-19 reference docs | Keep as historical; intentional |
| D12 | Duplicate-named components | `Toast.tsx` vs `admin/Toast.jsx`; `ConfirmDialog.tsx` vs `admin/ConfirmDialog.jsx`; `Badge` × 2 | Intentional (different audiences); document |
| D13 | TOPICS array duplicated in two contact forms | `app/contact/page.tsx` vs `app/profile/contact/page.js` | Move to settings or shared util |
| D14 | `FALLBACK_BOOKMARK_CAP=10` triplicated | 3 files (per Z13) | Move to plan_features |
| D15 | `CommentRow.tsx` `COMMENT_MAX_DEPTH=2` mirrors DB by hand | `web/src/components/CommentRow.tsx:31` vs `settings.comment_max_depth=2` | Replace with `getSettings()` read |
| D16 | `lib/plans.js` hardcoded TIERS / PRICING / TIER_ORDER | vs `plans` table (9 rows with `display_name`, `price_cents`, `sort_order`) | Replace with cached DB helper |

---

## 2. Confirmed stale

### A. Reference/ canonical docs

| File | Stale because | Action |
|---|---|---|
| `Reference/CLAUDE.md:35-39` | Says owner has no Apple Dev account; verified via memory 2026-04-25 that account is enrolled (Team FQCAS829U7); BBB.* items code-shippable | **P0 rewrite** |
| `Reference/CLAUDE.md` repo-tree comment about page.tsx | Says "FALLBACK_CATEGORIES hardcode still there"; verified `grep -c FALLBACK_CATEGORIES web/src/app/page.tsx` = 0; constant doesn't exist | **P0 delete comment** |
| `Reference/CLAUDE.md` "23 rules-of-hooks disables" mention | Actual count is 25, in `app/{recap,welcome,u}/...`, not in `lib/` | **P1 update count + location** |
| `Reference/CLAUDE.md` ParentalGate "zero callers (T-tbd)" | Verified 4 live callers (PairCodeView, ProfileView × 2, ExpertSessionsView) | **P1 delete claim** |
| `Reference/README.md` | References nonexistent WORKING.md, retired docs/+test-data/, says "kids iOS doesn't exist yet" (false), cites retired @admin-verified, migration range 005-094 (live: 177) | **P1 rewrite or delete** |
| `Reference/FEATURE_LEDGER.md` | mtime 2026-04-18; references deleted `site/` paths, retired `05-Working/`, retired `@admin-verified`, possibly outdated `perms_global_version=4409` | **P1 rewrite** |
| `Reference/parity/{Shared,Web-Only,iOS-Only}.md` | localhost:3333 (actual 3000), /kids/* on web treated as real surface, references removed `KidViews.swift`, no acknowledgement of `VerityPostKids/` | **P1 rewrite** |
| `Reference/runbooks/CUTOVER.md` | Cross-refs retired `/TODO.md §OWNER`; §5 smoke openly TBD; cites archived TEST_WALKTHROUGH | **P1 fix §5** |

### B. Current Projects/ specs

| File | Stale because | Action |
|---|---|---|
| `Current Projects/F7-pipeline-restructure.md` | ~60% superseded by F7-DECISIONS-LOCKED on kids model, provider, cadence, cost cap, discovery tables | **P2 archive** |
| `Current Projects/F2-reading-receipt.md` | Silently dropped by PRELAUNCH_UI_CHANGE_2026-04-25 (no cross-reference) | **P2 explicit retirement note** |
| `Current Projects/F5-ads-gameplan.md` | 8 unanswered owner decisions in §1; superseded by F6 | **P2 retire as superseded** |
| `Current Projects/F6 §5 Scoring system` | Describes rolled-back schema/109 design (per Reference/PM_ROLE.md:467) | **P2 rewrite section or redirect to `Reference/08-scoring-system-reference.md`** |
| `Current Projects/F7-PM-LAUNCH-PROMPT.md` | Stale references to migrations 105-111, `@admin-verified` markers, mismatched phased plan | **P2 update or archive** |
| `Current Projects/APP_STORE_METADATA.md` | 5+ inline `site/src/...` paths + 6 cross-ref `site/` paths + retired `00-Where-We-Stand/` + `00-Reference/` + `test-data/` | **P0 fix paths (App Store submission depends on it)** |
| `Current Projects/PM_PUNCHLIST_2026-04-24.md:60` | Claims `tsconfig 'strict':false` — verified strict is true | **P1 fix line 60** |
| `Current Projects/PRELAUNCH_UI_CHANGE.md` Part 5 vs §3.13 | Part 5 says schema stays the same; §3.13 proposes new `articles.illustration_url` column | **P2 reconcile** |

### C. Audit_2026-04-24/

| Item | Stale because | Action |
|---|---|---|
| 15 items already marked STALE 2026-04-24 in MASTER_TRIAGE | Re-classified as never-was-bugs | **P1 move to "Resolved-as-Stale" section** |
| MASTER_TRIAGE item 5 | Resolved-by-9 (file replaced with stub); not formally marked | **P1 add SHIPPED block** |
| Wave B "/api/access-request no auth" | Route is a 410 stub since 2026-04-25 owner decision (Ext-AA1) | **P1 mark refuted** |
| Wave B "registerIfPermitted never called" | Function does not exist anywhere in `web/src` | **P1 mark refuted** |
| Wave B "handlePaymentSucceeded missing perms_version bump" | Bump IS wired at `api/stripe/webhook/route.js:846` | **P1 mark refuted** |
| Wave A "comment_status enum drift `'visible'` vs `'published'`" | Live system is consistent on `'visible'`/`'hidden'`; zero `'published'` writes anywhere; no `comment_status` enum exists | **P1 mark refuted** |
| Wave A "35 tables missing RLS" / Wave B "1 + 14 RLS-no-policies" | Verified — only `events` parent table has RLS-no-policies, intentional | **P1 mark refuted** |
| L08-001 "kid RLS blocks writes (NULL = uuid → FALSE)" | Live RLS verified correct; kid auth.uid() IS the kid_profile_id; no blocking | **P1 mark refuted** |
| L06-001 "cross-provider duplicate sub rows" | No production duplicates exist; 2 active stripe subs, both unique | **P1 mark "no current repro; theoretical concurrency note"** |
| `Audit_2026-04-24/_RECONCILER_BRIEFING.md` references `/root/.claude/plans/` and `/home/user/site/` | External-agent paths (per AuditV1/03) | Already flagged; benign |

### D. Future Projects/

| File | Stale because | Action |
|---|---|---|
| `Future Projects/db/00_INDEX.md` | Says latest migration `20260420020544`; live schema/ has 169 numbered migrations through 177 | **P1 rewrite, count from disk** |
| `Future Projects/24_AI_PIPELINE_PROMPTS.md` | Refers to `web/src/lib/editorial-guide.js`; actual is `web/src/lib/pipeline/editorial-guide.ts` | **P1 fix path or archive** |
| `Future Projects/views/{ios_adult_profile,ios_adult_alerts,web_welcome_marketing}.md` | Ask to add UI links to `/standards`, `/corrections`, `/refusals`, `/editorial-log`, `/masthead` — none exist in web/src/app/ | **P2 mass-edit OR resurrect Charter docs** |
| `Future Projects/{05,06,10,19,24}, db/05` | Cite retired `04_TRUST_INFRASTRUCTURE.md` as dependency | **P2 mass-edit** |
| `Future Projects/{05,10}` | Cite retired `17_REFUSAL_LIST.md` | **P2 mass-edit** |
| `Future Projects/views/00_INDEX.md:51` | References retired `@admin-verified` marker | **P1 fix** |
| `Future Projects/db/00_INDEX.md:41` | References retired `@admin-verified` marker | **P1 fix** |
| `Future Projects/08_DESIGN_TOKENS.md:19` | References retired `@admin-verified` marker | **P1 fix** |

### E. Unconfirmed Projects/

Both files are heavily stale (`site/` paths, retired layout, 9-plan billing claim, DUNS-blocked iOS claim). **P2 archive entirely.**

### F. Top-level + scripts

| File | Stale because | Action |
|---|---|---|
| `.gitignore:12-13` | Dead `site/.env*` patterns (renamed 2026-04-20) | **P2 delete** |
| `.gitignore:57` | `.mcp.json` ignored despite being committed | **P2 decide tracking** |
| `scripts/smoke-v2.js` | References nonexistent `site/` directory; broken | **P2 fix or delete** |
| `scripts/import-permissions.js` | Calls non-existent RPC `bump_global_perms_version` (verified absent in pg_proc); falls through to "version: 999 signal" intermediate write | **P0 fix** |
| `scripts/dev-reset-all-passwords.js` | Zero prod-safety guards (no env allowlist, no project-ref check, no confirmation prompt) | **P1 add guards** |

---

## 3. Confirmed conflicts (real bugs the code shows now)

### Severity P0 — runtime / load-bearing

| ID | Bug | Verified by | Fix |
|---|---|---|---|
| C1 | `cleanup_rate_limit_events` RPC references nonexistent column `occurred_at`; live column is `created_at`. RPC errors on every invocation; rate_limit_events grows unbounded (currently 8,562 rows) | `pg_proc.prosrc` of cleanup_rate_limit_events + information_schema.columns of rate_limit_events | **Migration to replace `occurred_at` → `created_at`** |
| C2 | Migrations 092/093/100 missing on disk; `require_outranks` + `caller_can_assign_role` RPCs (live in pg_proc) have **zero on-disk source** | `ls schema/092*` no match; `grep -rln "require_outranks" schema/` empty | **Dump pg_proc bodies into `schema/178_recreate_admin_rank_rpcs.sql`** |
| C3 | `import-permissions.js` calls non-existent `bump_global_perms_version` RPC | `pg_proc` query returns no match | **Either create the RPC OR rewrite script to use `bump_user_perms_version` per-user** |
| C4 | adult `aps-environment` entitlement missing despite PushRegistration calling `registerForRemoteNotifications` | Z17 + W2-04 | **Add entitlement (now unblocked — Apple account active)** |
| C5 | AppIcon.appiconset has no PNG; App Store rejects builds without icons | Z17 | **Generate icon set** |

### Severity P1 — drift / partial

| ID | Bug | Verified by | Fix |
|---|---|---|---|
| C6 | 8 RPC bodies still reference dropped `superadmin` role: `_user_is_moderator`, `approve_expert_answer`, `approve_expert_application`, `expert_can_see_back_channel`, `grant_role`, `mark_probation_complete`, `reject_expert_application`, `revoke_role` | pg_proc query | **Migration: CREATE OR REPLACE for the 8** |
| C7 | Schema 127 rollback DELETE references wrong perm-key form (`pipeline.manage_*` vs forward `admin.pipeline.*.manage`); rollback would not delete the inserted rows | grep schema/127 | **Edit 127 OR write 178+ corrected** |
| C8 | `adminMutation.ts:84-88` calls `record_admin_action` without `p_ip` / `p_user_agent` despite RPC signature accepting both | Z12 + W2-10 | **Patch helper to pass headers** |
| C9 | `/api/comments/[id]/report` has NO rate limit (sister `/api/reports` has 10/hr) | direct read | **Add `checkRateLimit({key: 'comments-report:'+user.id, max:10, windowSec:3600})`** |
| C10 | KidsAppState `completeQuiz` mutates `verityScore`/`quizzesPassed`/`streakDays` in-memory before server confirmation; `loadKidRow()` only re-reads `streak_current`. On server failure or app restart, totals diverge from DB | KidsAppState.swift:187-200 | **Make async; reconcile from server response** |
| C11 | `BadgeUnlockScene` unreachable: `KidsAppRoot.swift:199` calls `completeQuiz(...biasedSpotted: false)` hardcoded; the only branch that constructs the scene is `if biasedSpotted` | KidsAppState.swift:202-206 + KidsAppRoot.swift:199 | **Decide: wire bias-spotting from quiz answers OR delete dead branch** |
| C12 | `QuizPassScene` orphan; only its own `#Preview` constructs it (line 335), no external caller | grep | **Wire it (per KidQuizEngineView comment intent) OR delete** |
| C13 | Adult quiz pass threshold hardcoded `>= 3` in `user_passed_article_quiz` RPC; no `quiz.unlock_threshold` setting (verified all 30 settings rows) | pg_proc body + settings query | **Add setting + parameterize RPC** |
| C14 | `MASTER_TRIAGE_2026-04-23.md` items 1, 2 are launch-blocking critical bugs (every revoke 500s; every admin billing cross-user mutation ReferenceError) — still listed open | direct read of triage | **Verify still present in code, ship fix** |
| C15 | StoryDetailView quiz-pass at 70% via integer math vs server's 60% threshold (3/5 web pass → iOS reloads → discussion gated forever) — listed open in MASTER_TRIAGE #4 | iOS source | **Match server pct (or convert to count threshold)** |
| C16 | `Ad.jsx:148-152` — `<a href={ad.click_url}>` from DB with no scheme validation. `javascript:` execution vector. MASTER_TRIAGE #7 | direct read | **Add scheme allowlist (https/http only)** |
| C17 | Avatar/banner backgroundImage from raw user URLs — CSS-injection vector. MASTER_TRIAGE #8 | direct read of profile/settings/page.tsx | **URL-encode or validate** |
| C18 | profile/[id] tab nav hardcoded to viewer's own profile. MASTER_TRIAGE #9 | direct read | **Use viewed user's id** |
| C19 | Email-change flips `email_verified=false` BEFORE `auth.resend`; swallows resend error → permanent unverified-state lockout. MASTER_TRIAGE #3 | direct read | **Resend first, then flip** |
| C20 | PasswordCard verifies current password via `signInWithPassword` (clobbers session, bypasses login rate limit). MASTER_TRIAGE #6 | direct read | **Use ephemeral client like other code already does for kid PINs** |
| C21 | Admin client-side gating: 6 pages use hardcoded `'owner'\|\|'admin'` literals (access, analytics, feeds, notifications, subscriptions, system) | Z14 | **Migrate to `hasPermission('key')`** |
| C22 | 3 admin client-side gating patterns coexist: hardcoded literals (6), role-set membership (~30), `hasPermission` resolver (canonical, 6 pages + partial). Audit log writes also split: server-owned, client-side `record_admin_action` (drift in access/reader/support), and direct supabase mutations bypassing audit | Z14 | **Establish canonical, migrate** |
| C23 | DB-default rule violations: `lib/plans.js` hardcoded TIERS/PRICING/TIER_ORDER, `CommentRow` MAX_DEPTH, `import-permissions.js` role→set hardcodes, etc. | W2-09 | **Move to DB-backed cached helpers** |
| C24 | 7 active-doc `@admin-verified` residuals contradict CLAUDE.md retirement: F7-DECISIONS-LOCKED:18, F7-PM-LAUNCH-PROMPT:61,203, Future Projects/views/00_INDEX.md:51, Future Projects/db/00_INDEX.md:41, Future Projects/08_DESIGN_TOKENS.md:19, web/src/app/admin/pipeline/runs/page.tsx, plus FEATURE_LEDGER + README | grep | **Sweep removal** |
| C25 | F7-DECISIONS-LOCKED Decision 8 vs §5 line 348 — Decision 8 says "patches wrong correct_index"; §5 says "throw-and-regenerate for safety". Internal contradiction | AuditV1/02 | **Pick one** |
| C26 | F1 conflicts with PRELAUNCH §3.2; F4 conflicts with PRELAUNCH §3.1 | AuditV1/02 | **Retire F1 + F4 (or reframe)** |
| C27 | F3 absorbed into PRELAUNCH §3.2 with no cross-reference either direction | AuditV1/02 | **Retire F3 + add credit in PRELAUNCH** |
| C28 | 27 `.jsx` admin component files still in repo (CLAUDE.md "Web is TypeScript" rule) | find | **Migrate when next admin work happens** |
| C29 | 218 `.js` files in web/src (155 API routes, 63 app/non-API). Per CLAUDE.md, no new `.js` allowed | find | **Establish ESLint rule; migrate incrementally** |
| C30 | 5 stale code-comment `site/` references (Toast.jsx, ConfirmDialog.jsx, permissionKeys.js, adminPalette.js, admin-components.d.ts header, profile settings line 2111) | grep | **P3 sweep** |

### Severity P2 — minor / cleanup

| ID | Issue | Fix |
|---|---|---|
| C31 | `109/111` self-supersede left no `verity_score_events` table (correct rollback) but the ledger framing in F6 §5 still describes it | F6 doc fix only |
| C32 | `127 rollback` perm-key bug (see C7) — also list 178 fix |
| C33 | `177` only granted SELECT on 4 of ~10 F7-era tables | List F7 tables, grant where missing |
| C34 | `APNS_BUNDLE_ID` (in .env.example) vs `APNS_TOPIC` (in apns.js) — env var mismatch | Pick one |
| C35 | Adult-side `appleSignin` capability TBD (now unblocked — Apple account active) | Add entitlement |
| C36 | AASA `apple-app-site-association` file missing from `web/public/`; needed for Universal Links | Create file or route handler |
| C37 | Kids `aps-environment=development` (should be `production` for App Store builds) | Update entitlement |
| C38 | Round 9 expert-Q&A panel `#if false`'d in adult iOS | Either remove or wire |
| C39 | AlertsView Manage tab gated off pending `subscription_topics` table | Create table or remove gate |
| C40 | iOS `HomeFeedSlots.swift` and `Keychain.swift` orphan (no callers) | Delete if confirmed |
| C41 | iOS `CFBundleVersion=1` never bumped | Establish bump pattern |
| C42 | iOS App: 7 HTML/JSX mockups + REVIEW.md ship as Resources in `.app` bundle | Remove from target before ship |
| C43 | `kids/OpenKidsAppButton.tsx` App Store URL placeholder (Apple-block — now unblocked) | Replace after publish |
| C44 | `web/public/` is bare (only ads.txt); no robots.txt / sitemap.xml / icon.svg / favicons. Tests assume robots/sitemap respond — likely served by route handlers, but `JsonLd.tsx` references `/icon.svg` which is missing | Add files OR fix references |
| C45 | 5 confirmed orphan components: `RecapCard.tsx`, `admin/Sidebar.jsx`, `admin/ToastProvider.jsx`, `FollowButton.tsx`, `TTSButton.tsx` | Delete |
| C46 | `admin/PipelineRunPicker.tsx` "two call sites only" comment is stale (only 1 importer now) | Fix comment |

---

## 4. Unresolved (need owner decision or further work)

| U# | Question | Suggested next step |
|---|---|---|
| U1 | Charter retired-but-still-cited: resurrect 4 docs (04_TRUST_INFRASTRUCTURE, 17_REFUSAL_LIST, db/07_standards_doc_table, 4 web-standards mockups) OR mass-edit 6 citing docs | **Owner decision** |
| U2 | Story-manager fate: keep parallel admin (legacy + F7) or deprecate legacy? | **Owner decision** |
| U3 | kids-story-manager merge with `?kid=true` toggle — same decision | **Owner decision** |
| U4 | F1-F4 silent-vs-explicit retirement: PRELAUNCH supersedes some, but F-specs aren't marked. Wave 3 needs side-by-side scope diff to know which to retire | Wave 4 / one-shot diff |
| U5 | `verity_family_annual` + `verity_family_xl` plans `is_active=false` in DB — intentional pre-launch, or oversight? | **Owner decision** |
| U6 | xlsx ↔ DB row-by-row diff for permissions (need Python/Node xlsx reader) | Tooling |
| U7 | 47 NOTIFICATION_DIGEST lens findings (Round 2 unwritten lenses) — sweep needed | Wave 4 / mechanical pass |
| U8 | 15 O-DESIGN-* + Tiers A-D items in EXT_AUDIT_FINAL_PLAN — many likely superseded by PRELAUNCH_UI_CHANGE | Wave 4 / scope diff |
| U9 | PROFILE_FULL_FLOW.md (Z08 candidate to promote to Reference/) — read it directly to decide | One-shot read |
| U10 | F7-PM-LAUNCH-PROMPT relevance vs DECISIONS-LOCKED — full diff needed | One-shot diff |
| U11 | `lib/rlsErrorHandler.js` use of `permissions.js#hasPermissionServer` — is it the wrong client (browser cookie vs service)? | One-shot read |
| U12 | F2 reading-receipt: data layer is built (reading_log table active, 8 rows; api/stories/read live; admin pages consume it), but UI may be hidden | One-shot read of /story/[slug] for UI gate |
| U13 | F3 earned-chrome perm-vs-plan gating | One-shot read of CommentRow |
| U14 | Round 2 L03 TOCTOU specifics in comment edit/delete + quiz attempt-count | One-shot read |
| U15 | Story-page launch-hide enumeration (regwall, anon interstitial) | One-shot read |
| U16 | `_user_id_outranks` etc. — 8 superadmin RPC bodies could be cleaned in one migration; specific role-allowlist syntax needs viewing | One-shot pg_proc dump |
| U17 | Whether the `events_*` partition RLS-disabled state is intentional (likely yes per PostgreSQL pattern) | Confirm |
| U18 | `ai_models` table: 4 active. Is dual-provider use intentional (Anthropic + OpenAI) or one of them is defunct? | **Owner decision** |
| U19 | `permissions.js` dual-cache stale-fallthrough — Wave A 4 vs 1 said bug; needs trace through cache logic | One-shot read |
| U20 | AuditV1 vs AuditV2 — once V2 acted on, archive AuditV1? | **Owner decision** |

---

## 5. Recommended actions (in execution order)

### Sprint 1 — P0 (this week)

1. **Fix `cleanup_rate_limit_events` column bug** (`schema/178`) — 1-line CREATE OR REPLACE; rate_limit_events at 8,562 rows is growing.
2. **Recreate admin-rank RPCs in repo** (`schema/179`) — dump pg_proc bodies of `require_outranks` + `caller_can_assign_role`. These have zero on-disk source.
3. **Fix `import-permissions.js`** — either create `bump_global_perms_version` RPC or rewrite to use existing `bump_user_perms_version` per-user. Currently broken.
4. **Update `Reference/CLAUDE.md`** — Apple-block paragraph (account active 2026-04-25), FALLBACK_CATEGORIES comment removal, ParentalGate "zero callers" claim, rules-of-hooks count + location.
5. **Fix `APP_STORE_METADATA.md`** — replace 11+ `site/` references with `web/`. App Store submission depends on it.
6. **Ship MASTER_TRIAGE 1-9** — items 1, 2 are launch-blocking 500s; 3-9 are user-visible bugs.
7. **Add adult `aps-environment` entitlement** — push registration broken without it.
8. **Generate AppIcon set** — App Store blocker.

### Sprint 2 — P1 (next week)

9. **Strip `superadmin`** from 8 RPC bodies (`schema/180`).
10. **Fix `adminMutation.ts:84-88`** — pass `p_ip`/`p_user_agent`.
11. **Add rate limit to `/api/comments/[id]/report`**.
12. **Make KidsAppState.completeQuiz async** + reconcile from server response.
13. **Decide bias-spotting fate** (BadgeUnlockScene + QuizPassScene wire-or-delete).
14. **Migrate 6 admin pages** from hardcoded `'owner'||'admin'` → `hasPermission('key')`.
15. **Replace `lib/plans.js` hardcodes** with cached DB helper.
16. **Sweep 7 active-doc `@admin-verified` residuals**.
17. **Fix `127 rollback` perm-key bug** (schema/181).
18. **Mark refuted Wave A/B audit findings** in MASTER_TRIAGE / audit tracker:
    - Comment status enum drift (false alarm)
    - "35 tables missing RLS" / "1 + 14" (only `events`, intentional)
    - L08-001 kid RLS blocks writes (RLS verified correct)
    - Wave B `/api/access-request` no auth (route is 410 stub)
    - Wave B `registerIfPermitted` never called (function doesn't exist)
    - Wave B `handlePaymentSucceeded` missing bump (bump IS wired)
19. **Update memo-pad MASTER_TRIAGE** — move 15 STALE items to "Resolved-as-Stale" section so active count is clearly 9.
20. **Pick canonical ID `C26`** for the GG.3/C26/R-12-UB-03 trio.
21. **Consolidate `OWNER_ACTIONS_2026-04-24` → `OWNER_TODO_2026-04-24`**; archive OWNER_ACTIONS.
22. **Rewrite `Reference/README.md`** (or delete).
23. **Rewrite `Reference/FEATURE_LEDGER.md`**.
24. **Rewrite `Reference/parity/*.md`** (3 files).
25. **Fix `Reference/runbooks/CUTOVER.md` §5**.

### Sprint 3 — P2 (within 2 weeks)

26. Add adult `applesignin` + `associated-domains` entitlements (Apple now unblocked).
27. Create AASA file/route at `/.well-known/apple-app-site-association`.
28. Switch kids `aps-environment` to `production` for App Store builds.
29. Establish CFBundleVersion bump pattern (manual / agvtool / CI).
30. Fix `APNS_BUNDLE_ID` vs `APNS_TOPIC` env-var mismatch.
31. Replace App Store URL placeholders post-publish.
32. Archive `Future Projects/F7-pipeline-restructure.md`.
33. Mark `F2-reading-receipt.md` retirement note; same for `F5`.
34. Fix `Future Projects/db/00_INDEX.md` migration count.
35. Resolve F7-DECISIONS-LOCKED Decision 8 vs §5 contradiction.
36. Resolve PRELAUNCH Part 5 vs §3.13 contradiction.
37. Audit which F7 tables need SELECT grant (177 partial).
38. Add cost-cap validation logic to `lib/pipeline/cost-tracker.ts` if not already reading from settings.
39. Migrate `RATE_LIMIT_DEFAULTS`, `EMAIL_SEQUENCES`, `WEBHOOK_SOURCES` admin UIs to read from DB tables (verify tables exist first).
40. Migrate ~30 admin role-set pages to `hasPermission` (incremental).
41. Owner decision U1 (Charter resurrect/delete).
42. Owner decision U2/U3 (story-manager + kids-story-manager merge).
43. Owner decision U5 (`verity_family*` plans is_active).
44. Mass-edit 6 Charter-citing docs (after U1).
45. Mass-edit views/ docs to remove dead UI links (after U1).
46. Archive `Unconfirmed Projects/`.
47. Resolve `.gitignore` `site/.env*` + `.mcp.json` entries.
48. Delete 5 confirmed orphan components.
49. Archive 7 dev-only HTML/JSX mockups in `VerityPost/possibleChanges/` before App Store submission.
50. Sweep BUCKET5_TRACKER stale "queued" entries.
51. Wave 4 sweep: 47 NOTIFICATION_DIGEST lens findings.
52. Wave 4 sweep: 15 O-DESIGN-* + Tiers A-D against PRELAUNCH_UI_CHANGE.

### Sprint 4 — P3 (cleanup)

53. Bulk-migrate `components/admin/*.jsx` (26 files) to `.tsx`.
54. Establish "no new .js" ESLint rule.
55. Sweep code-comment `site/` references (5 files).
56. Bulk-migrate 33 layout/loading/error JS shims to TS.
57. Promote `PROFILE_FULL_FLOW.md` to `Reference/` if Wave 3 confirms still useful.
58. Archive AuditV1/.
59. Add concurrency comment to webhook + iOS sync routes (cross-provider race scenario).
60. Resolve `lib/rlsErrorHandler.js` client-semantics question (U11).

---

## 6. Audit-process notes

- **Wave 1 inventories** at `/tmp/audit-v2/wave1/Z01..Z19_*.md` (~7,000 lines).
- **Wave 2 cross-reference findings** at `/tmp/audit-v2/wave2/W2-01..W2-11_*.md` (~1,250 lines).
- **Wave 3 verification summary** at `/tmp/audit-v2/wave3/W3_verification_summary.md`.
- **Tiebreaker rule applied**: every claim involving code state was checked against actual source or actual DB; doc claims that conflicted with code were marked stale.
- **Limits encountered**: org token budget capped Wave 2 agents partway through; remaining work was done in main thread with same rigor (DB queries + grep + direct reads). Wave 3 was scoped to highest-leverage spot-checks rather than full sweeps.
- **Pre-existing AuditV1** (4 of 11 sessions complete) covered ~30% of the same ground; its confirmed findings are incorporated above.

— End of AuditV2.
