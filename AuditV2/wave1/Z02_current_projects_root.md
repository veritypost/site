# Zone Z02: Current Projects/ (root)

## Summary

Zone covers 14 top-level documents in `Current Projects/`: the App Store metadata packet, four reader-side feature specs (F1-F4), the ads gameplan (F5), the measurement+ads master plan (F6), four F7 AI-pipeline rebuild docs (decisions, runbook, PM prompt, restructure), the canonical MASTER_TRIAGE bug tracker, the lead-PM punchlist (2026-04-24), and the prelaunch UI change spec (2026-04-25). The zone holds the live launch plan: F-series specs are scope, MASTER_TRIAGE is the bug ledger with inline `SHIPPED` blocks, F7 docs are the in-progress AI pipeline rebuild (Phases 1-3 SHIPPED, Phase 4 partial), and PRELAUNCH_UI_CHANGE is the unblessed proposal for the visible-product redesign sequenced into 6 phases.

## Files

### Current Projects/APP_STORE_METADATA.md

- **Purpose:** Submission packet for App Store Connect — App Identity, Description, Keywords, Promotional text, Age rating, Privacy Nutrition Label, App Review information, IAP catalog, and ASC setup checklist.
- **Topics:** App naming/subtitles (`Verity Post`, "Read, quiz, and discuss news"), Bundle ID `com.veritypost.app`, category (News + Education), description copy, keyword options, age rating (12+), Privacy Nutrition Label, demo account credentials, 8 IAP products with product IDs + Apple price tiers, ASC setup checklist.
- **Key claims / decisions / dates:**
  - "Last updated 2026-04-18."
  - Plan pricing/IDs in the IAP section claim `apple_product_id` is set in the live `plans` table (e.g. `com.veritypost.verity.monthly` $3.99 → Apple Tier 4, ... up to `verity_family_xl.annual` $199.99 Tier 200).
  - "no trial is promised because `plans.trial_days = 0` for every row."
  - Sentry status flagged as "verify before marking Diagnostics Collected."
  - `/help` page status declared shipped in Round 13.
- **Cross-references:** `REFERENCE.md`, `FEATURE_LEDGER.md`, `site/src/app/page.tsx`, `site/src/app/how-it-works/page.tsx`, `00-Reference/Verity_Post_Design_Decisions.md`, `plans` table on DB project `fyiwulqphgmoqullmrfn`, `test-data/accounts.json`, `VerityPost/VerityPost.xcodeproj/project.pbxproj`, `site/src/app/api/ios/appstore/notifications/route.js`, `site/src/app/api/ios/subscriptions/sync/route.js`.
- **Status:** Treated as a pre-paste draft; no `SHIPPED` markers. Awaiting Apple Developer enrollment (per CLAUDE.md Apple block + memory).
- **Concerns:**
  - Cross-references repeatedly say `site/src/app/...` but the actual repo path is `web/src/app/...`. Either the doc was authored against an earlier folder structure or the references are stale paths. Significant drift risk for anyone using this as a code map.
  - References to `00-Where-We-Stand/REFERENCE.md`, `00-Where-We-Stand/FEATURE_LEDGER.md`, `00-Reference/Verity_Post_Design_Decisions.md` — none of those folders are visible in the current repo top-level (CLAUDE.md repo tree shows `Reference/`, `Current Projects/`, etc.).
  - "Source URL `site/src/app/api/ios/appstore/notifications/route.js`" — actual file lives at `web/src/app/api/ios/appstore/notifications/route.js` per repo tree.
  - Document age (2026-04-18) predates the F7 + 2026-04-23/24/25 audit waves.

### Current Projects/F1-sources-above-headline.md

- **Purpose:** Reader-side feature spec for "REPORTED FROM" line above article headline.
- **Topics:** Article header layout, source list rendering, optional 3+ source badge, fallback behavior.
- **Key claims / decisions / dates:** Targets `web/src/app/story/[slug]/page.tsx` ~lines 780-800, sources data already loaded at `page.tsx:409-411`. Effort ~1 hour. No date in body.
- **Cross-references:** `web/src/app/story/[slug]/page.tsx`. Implicit DB: articles ↔ sources join.
- **Status:** Spec only. No `SHIPPED` markers. Per CLAUDE.md / F7-PM-LAUNCH-PROMPT, F1-F4 are launch-hidden / kill-switched.
- **Concerns:** Line numbers cited (780-800, 409-411) are ephemeral. PRELAUNCH_UI_CHANGE §3.2 "Source chips inline" supersedes the F1 above-the-headline placement with a different location (in-body superscripts) — possible scope conflict.

### Current Projects/F2-reading-receipt.md

- **Purpose:** Spec for a monospaced "reading receipt" stub at the bottom of finished articles.
- **Topics:** Reading-receipt component, `ReadingReceipt.tsx`, copy-receipt button, mobile considerations, partial-receipt fallback.
- **Key claims / decisions / dates:** Targets `web/src/app/story/[slug]/page.tsx` ~lines 922-935 mount, data sources at `page.tsx:383, 458` (timeSpentSeconds). Effort ~3 hours.
- **Cross-references:** `web/src/app/story/[slug]/page.tsx`, `web/src/components/ReadingReceipt.tsx` (proposed), existing `/api/stories/read` endpoint, `ArticleQuiz` component.
- **Status:** Spec only. No `SHIPPED` markers. F2 is launch-hidden per CLAUDE.md ("F2/F3 launch-hidden").
- **Concerns:** PRELAUNCH_UI_CHANGE doesn't mention a reading receipt; may be silently dropped or merged into the new "page ends" treatment.

### Current Projects/F3-earned-chrome-comments.md

- **Purpose:** Spec for the "earned chrome" comment-section reveal — comments invisible to anon and pre-quiz users, materialize on quiz pass.
- **Topics:** Three-branch deletion in `discussionSection`, animation wrapper, hidden quizNode for anon, signup-CTA migration into receipt footer.
- **Key claims / decisions / dates:** Targets `web/src/app/story/[slug]/page.tsx:656-691` (`discussionSection`), `:605-643` (quizNode). Effort ~2 hours. "Why ship this one first" — this is "the only idea of the four where competitors literally cannot match."
- **Cross-references:** `web/src/app/story/[slug]/page.tsx`, `<CommentThread />`, `quiz_attempts` table for `passed_readers_count` aggregate.
- **Status:** Spec only. F3 is launch-hidden per CLAUDE.md.
- **Concerns:** Depends on F2 (receipt footer hosts the migrated signup link). PRELAUNCH_UI_CHANGE §3.2 incorporates this — "Comments unfold on pass. The Discussion panel literally slides in beneath the article." But the prelaunch doc says "the pass-then-load logic is already correct at `story/[slug]/page.tsx:541`", which suggests F3 has partially shipped or the line numbers across docs disagree.

### Current Projects/F4-quiet-home-feed.md

- **Purpose:** Spec for a "Stockholm-quiet" home feed — strip modules, leave one headline per row in serif.
- **Topics:** Home page module-stripping, redesign of feed rows (serif, meta line, hr), spacing rhythm, type pairing.
- **Key claims / decisions / dates:** Targets `web/src/app/page.tsx` main feed ~`:719`, category pills already wrapped in `{false && …}` at `:722-745`. Effort ~4 hours. Self-described as "lowest priority."
- **Cross-references:** `web/src/app/page.tsx`, `web/src/app/layout.js:15-27` (Source Serif 4 + Inter font load).
- **Status:** Spec only. F4 launch-hidden per CLAUDE.md. Notes parts already done via launch flag.
- **Concerns:** PRELAUNCH_UI_CHANGE §3.1 supersedes — mandates full-bleed hero, kept-supporting-articles model, human-readable date, and removal of `FALLBACK_CATEGORIES` (still drifted per MASTER_TRIAGE). Conflicts directly with F4's "no hero image" recommendation.

### Current Projects/F5-ads-gameplan.md

- **Purpose:** Decision-ready ads buildout gameplan: decisions, placement catalog, network setup, targeting, admin UX, instrumentation, launch checklist.
- **Topics:** AdSense as primary, CMP via Google Funding Choices, placement catalog (home/story/category/search/leaderboard/profile), ad-source dispatcher in `Ad.jsx`, `ads.txt`, Slot editor admin pages A/B/C, IntersectionObserver viewability, kid-safety failsafe (Postgres CHECK on `ad_placements`).
- **Key claims / decisions / dates:** D5 paid-tier rules: `verity_pro/family/xl` zero ads, `verity` reduced. D6 "verity (current — halved frequency caps)". D7 kids = NO permanent. D8 iOS adult app default NO. Existing `Ad.jsx` mount at `page.tsx:849` (current setting 6 stories cadence).
- **Cross-references:** `Ad.jsx`, `web/public/ads.txt`, `web/src/app/layout.js`, `ad_units`, `ad_placements`, `ad_impressions`, `serve_ad` RPC, `/api/ads/impression`, `/api/ads/click`, `Sessions/04-21-2026/...` ad-mockups.
- **Status:** Gameplan template — owner has not filled D1-D8 in this file (blank in the markdown). No `SHIPPED` markers.
- **Concerns:** The D-table fields are literal blank rows for owner to fill. Document presumes AdSense pub ID and CMP region settings are unfilled. Mostly aligns with F6 (which is the master plan that supersedes it) — F5 may be near-redundant once F6 is greenlit.

### Current Projects/F6-measurement-and-ads-masterplan.md

- **Purpose:** Master plan tying together ads + scoring + own-built telemetry + GA4 into one event pipeline. Defines the unified `events` table + batch endpoint, ClickHouse export, GA4 setup, ad placement enforcement, score-event ledger, audit dashboard, execution order across phases A-F.
- **Topics:** Authority hierarchy (Postgres > own telemetry > GA4 > ad networks), unified event schema, `events` partitioned table, `/api/events/batch`, ClickHouse / BigQuery export, 7 admin analytics pages, GA4 setup, score event ledger (`verity_score_events`), trigger-based scoring, leaderboard mat view, audit dashboard, costs ($100-400/mo pre-revenue), execution order.
- **Key claims / decisions / dates:**
  - Score events table proposed at §5 — must be reconciled with `schema/109_verity_score_events.sql` rolled back by `schema/111_rollback_parallel_score_ledger.sql` per F7-PM-LAUNCH-PROMPT.
  - "Build both, don't pick" GA4 + own-built.
  - Phases A-F.
- **Cross-references:** Ad placement table mentioned in F5, snapshot scoring schema/022, `pipeline_costs`, `ad_impressions`, settings table.
- **Status:** Master plan, no `SHIPPED` blocks. No date in body.
- **Concerns:**
  - **Direct conflict with project memory:** §5's `verity_score_events` ledger + trigger design was tried and rolled back (`schema/111_rollback_parallel_score_ledger.sql`); F7-PM-LAUNCH-PROMPT §10 says "Do not invent a parallel scoring ledger (the `verity_score_events` rollback in `schema/111` is the canonical lesson)." F6 still proposes exactly this — needs reconciliation.
  - Overlaps with F5 (placement enforcement, `ads.txt`, IntersectionObserver) — F6 supersedes F5.
  - Claims `events` table + batch endpoint already in flight ("present per `git status`: `web/src/app/api/events/`") — verify whether this shipped vs. is mid-refactor; MASTER_TRIAGE Tier 3 #27 references `web/src/app/api/events/batch/route.ts:149` so the route exists.

### Current Projects/F7-DECISIONS-LOCKED.md

- **Purpose:** Authoritative locked-decisions contract for the F7 AI pipeline rebuild. 8 decisions + cross-decision invariants + Phase 1 pre-flight + snapshot divergences + open items + SHIPPED log per phase/task.
- **Topics:** Admin page rename (`/admin/pipeline` → `/admin/newsroom` + 301), kids data model (two separate tables), per-run model picker + `ai_models` catalog + prompt customization layers, runtime guardrails ($10/day, $0.50/run, 10-min lock, 2 concurrent, 3 retries with [1000, 4000, 15000]ms backoff), discovery 24h purge with TWO separate discovery tables (option c), workbench scope, quiz bundled with quiz_verification.
- **Key claims / decisions / dates:** "Date locked: 2026-04-22" + "Owner sign-off: cliff.hawes@outlook.com via conversation 2026-04-22". `Supersedes: the §5. 8 owner-decisions section of Current Projects/F7-PM-LAUNCH-PROMPT.md`. SHIPPED log records: Phase 1 Tasks 1-4, Phase 2 Tasks 5-9, Phase 3 Tasks 10-19, Phase 4 Decision 3.1+3.4 picker/cost-preview gap-fill, Phase 4 Task 20 newsroom home page, Phase 4 Task 27 run detail page — all SHIPPED 2026-04-22.
- **Cross-references:** `F7-PM-LAUNCH-PROMPT.md`, `F7-pipeline-restructure.md`, `Sessions/04-22-2026/Session 1/COMPLETED_TASKS_2026-04-22.md`, `Sessions/04-22-2026/Session 1/SESSION_LOG_2026-04-22.md`, `Sessions/04-22-2026/Session 1/PHASE1_EXIT_RLS_PROBE.sql`, snapshot at `/Users/veritypost/Desktop/verity-post-pipeline-snapshot/`.
- **Status:** Locked + active. SHIPPED blocks for Phases 1-3 + partial Phase 4. Tasks 21-26 + 28+ pending per Phase 4 plan.
- **Concerns:**
  - Doc marks `/admin/pipeline/page.tsx` as carrying `@admin-verified 2026-04-18` marker, but per memory file `feedback_admin_marker_dropped` from 2026-04-23 the marker is retired. Stale instruction in this doc.
  - References `web/src/app/api/ai/generate/route.js` as `runtime-broken import` — present-tense in this doc but per F7-PM and SHIPPED log Tasks 5-19 the new pipeline is in place; need verification the old stub is deleted.
  - SHIPPED log entries pre-date Phase 4 Task 22 ("modal" mentioned but task # not listed in SHIPPED) — Phase 4 partial, status of Tasks 21, 22, 23, 24, 25, 26, 28 not specified.

### Current Projects/F7-PHASE-3-RUNBOOK.md

- **Purpose:** Operational guide for the F7 pipeline orchestrator (Phase 3 Tasks 10-19 + Phase 4 Task 20).
- **Topics:** Pipeline-in-one-paragraph, entry points + perms, structured logging taxonomy ([newsroom.area.step]), step vocabulary (12 canonical step names), error_type vocabulary (14 strings), step_timings_ms map, pipeline_costs row types, Sentry breadcrumbs vs captures, cluster lock acquire/release with RPC code, cost cap enforcement (per-run $0.50, per-day $10), kill switch (`ai.ingest_enabled`, `ai.generate_enabled`), scrape→generate flow (10-step), prompt chain invariants, recovery procedures (stuck lock, cost cap, kill switch, orphan run, partial persistence, schema validation failure), admin operational checklist, what-not-to-do, changelog with task SHAs.
- **Key claims / decisions / dates:** "Tasks 10-19 (full Phase 3) shipped 2026-04-22; Task 20 (Phase 4) home page also shipped." Changelog entries: Task 11 commit `7fef1ad`, Task 16 commit `7ed6b2c`, Task 17 commit `0361d16`, Task 18 commit `31275c6`, Task 19 commit `9b9a32e`. Migration 116 cluster locks, migration 120 `pipeline_runs.error_type` column.
- **Cross-references:** `web/src/app/api/admin/pipeline/generate/route.ts`, `web/src/lib/pipeline/call-model.ts`, `web/src/lib/pipeline/errors.ts`, `web/src/lib/pipeline/cost-tracker.ts`, `web/src/lib/pipeline/prompt-overrides.ts`, `feed_clusters` schema, RPC `claim_cluster_lock` / `release_cluster_lock` / `pipeline_today_cost_usd`.
- **Status:** Active runbook. Task 11 RPC marked "Final RPC spec locked during Task 11 planning; this is the draft" — but Task 11's SHIPPED block in F7-DECISIONS-LOCKED says shipped 2026-04-22 with `7fef1ad`. The runbook RPC body shows draft signature `claim_cluster_lock(cluster_id, p_minutes default 10)` while F7-DECISIONS-LOCKED Task 11 SHIPPED block describes shipped signature as `claim_cluster_lock(cluster_id, locked_by, ttl_sec=600)`. Wording in runbook is stale.
- **Concerns:** Runbook draft SQL in §4 doesn't match shipped Task 11 signature per F7-DECISIONS-LOCKED log. Multiple "Tasks 20+" forward references that need future updates.

### Current Projects/F7-PM-LAUNCH-PROMPT.md

- **Purpose:** Master prompt to launch a dedicated F7 PM Claude session. Defines role, scope, hard rules (4-agent flow, divergence resolution, admin-locked-files, migration approval, etc.), sources of truth, locked decisions reference, four phases with deliverables + exit criteria, scope boundaries, snapshot porting policy, schema migration procedure, existing-systems respect list, handoff/docs requirements, commit conventions, success criteria, Phase 1 starting checklist, error response procedures.
- **Topics:** 16 sections covering everything from PM role through closing instructions. Lists 8 owner-decisions (Phase A original list) + flags they are now SUPERSEDED by F7-DECISIONS-LOCKED.md.
- **Key claims / decisions / dates:** "all 8 decisions are locked as of 2026-04-22." Last applied schema migration "schema/111" (says next is 112). Notes the `verity_score_events` rollback. Refers to FIX_SESSION_1 #20 ESLint/Prettier ship and 2026-04-21 sessions as priors.
- **Cross-references:** `Reference/CLAUDE.md`, `Reference/PM_ROLE.md`, `MEMORY.md` (lists 7 specific memory files), `F7-pipeline-restructure.md`, `Sessions/04-21-2026/Session 2/SESSION_LOG_2026-04-21.md`, `Sessions/04-21-2026/Session 2/NEXT_SESSION_PROMPT.md`, snapshot `/Users/veritypost/Desktop/verity-post-pipeline-snapshot/existingstorystructure/`, `schema/reset_and_rebuild_v2.sql`, `schema/111_rollback_parallel_score_ledger.sql`, `web/src/app/api/ai/generate/route.js`, `web/src/app/admin/pipeline/page.tsx`.
- **Status:** Active prompt template. Has been run; F7 is in Phase 4. The doc itself is not "shipped" — it spawns work.
- **Concerns:**
  - References `Reference/PM_ROLE.md` — is that file still extant? (Out of zone but worth verifying.)
  - Says current schema "Last applied is `schema/111`" — but F7-DECISIONS-LOCKED has shipped migrations 114, 116, 118, 120. Stale baseline.
  - References `@admin-verified <date>` markers — retired per memory.
  - References `web/src/app/api/ai/generate/route.js` deletion as still-pending (Phase 3) — F7-DECISIONS-LOCKED log indicates Phase 3 shipped, so the stub may already be gone; doc not refreshed.

### Current Projects/F7-pipeline-restructure.md

- **Purpose:** Original technical plan-of-attack for F7 AI pipeline rebuild — schema inventory, snapshot inventory, naming/page renames, Discover page design lock, Historical Context feature design, Kids data-model decision, model provider strategy, endpoint map, schema migrations SQL, prompts to author, build order in 20 tasks with hour budget, open decisions for owner, out-of-scope list, reviewer audit checklist.
- **Topics:** Heavy detail on each subsystem. Recommends single-row `articles` + `kids_*` columns kid model (option a). Lists 18 endpoint specs. Hands-on SQL for schema migration. Review/verification convention citing `web/src/types/database.ts:LINE`.
- **Key claims / decisions / dates:** No date in body but committed alongside F-series in late April. Documents `@migrated-to-permissions` discipline only implicitly. Builds order budgets ~17 hours focused build.
- **Cross-references:** `web/src/types/database.ts`, `schema/reset_and_rebuild_v2.sql`, `schema/108_events_pipeline.sql`, `schema/111_rollback_parallel_score_ledger.sql`, snapshot files, `VerityPost/VerityPost/StoryDetailView.swift`, `VerityPostKids/VerityPostKids/KidReaderView.swift`, `web/src/lib/track.ts`, `web/src/app/api/events/batch`.
- **Status:** SUPERSEDED by F7-DECISIONS-LOCKED.md. Original spec; key decisions overridden.
- **Concerns:**
  - **Direct, large-scale conflict with F7-DECISIONS-LOCKED:**
    - This doc says kids data model option (a) — single `articles` row with `kids_*` columns. F7-DECISIONS-LOCKED Decision 2 picks option A — two completely separate tables (`articles` + `kid_articles`). This doc is stale on the locked decision; the schema migration block here would create wrong columns.
    - This doc says "v1 is Anthropic-only, matching snapshot. Add provider abstraction in phase 2." F7-DECISIONS-LOCKED Decision 3 picks multi-provider (Anthropic + OpenAI) with per-run picker.
    - This doc says cron-based ingest with $75/day cap. F7-DECISIONS-LOCKED Decision 4 says manual ingest, $10/day, $0.50/run.
    - This doc says single `discovery_items` table. F7-DECISIONS-LOCKED Decision 7 says TWO separate tables (`discovery_items` + `kid_discovery_items`).
  - This is the largest source of internal-zone contradiction. Anyone reading F7-pipeline-restructure.md without first reading F7-DECISIONS-LOCKED.md will execute against the wrong plan. F7-DECISIONS-LOCKED `Supersedes:` line addresses this but only callouts F7-PM-LAUNCH-PROMPT, not F7-pipeline-restructure.md.
  - Migration block proposes column-add to `articles` for kid columns — **conflicts with shipped reality** (kid_articles separate table per migration 114).

### Current Projects/MASTER_TRIAGE_2026-04-23.md

- **Purpose:** Canonical bug ledger from the 11-agent sweep on 2026-04-23 + Round 4 owner-reported bug-hunt 2026-04-25. Tier 0/1/2/3/4 hierarchy with per-item SHIPPED blocks.
- **Topics:** Tier 0 (handler crashes), Tier 1 (4/4 unanimous critical, 7 items), Tier 2 (2-3/4 corroborated, 12 items), Tier 3 (single-agent critical, 18 items), Round 3 additions (Kids iOS K1-K11+K13, Admin UI AD1-AD7, Billing+IAP B1-B20, Cron+lib L1-L20), Round 4 additions BH1-BH8, Tier 4 (quality, ~150 items aggregate).
- **Key claims / decisions / dates:** Sources from 3 zone-split + 4 round-2 unified + 4 round-3 specialised agents. "11-agent sweep, 2026-04-23" + Round 4 2026-04-25.
- **Cross-references:** Per-bug file paths into `web/src/`, `VerityPost/`, `VerityPostKids/`, schema files (150-156, 177), `Sessions/04-25-2026/Session 1/BUGS_FIXED_2026-04-25.md`, source agent task-output files in `/private/tmp/`.
- **Status:** Canonical, live. Items get inline `SHIPPED <date> · <sha>` annotations.
- **Concerns:** See breakdown below.

### Current Projects/PM_PUNCHLIST_2026-04-24.md

- **Purpose:** Lead PM's working list as of 2026-04-24, explicitly subordinate to MASTER_TRIAGE — captures everything PM personally sees outstanding to baseline the next audit wave.
- **Topics:** Critical launch-blocking code (owner-reported UI-COMMENTS, UI-SETTINGS, UI-OTHER + tracker-known T0-1, T0-2, B1, B3, B6, K5, L8). Needs verification (L3, L4, L5, L6, L19 with commit SHAs). Owner-side infra (Vercel URL typo, ex-dev removal, pg_cron, Apple Dev, Stripe live audit, Sentry). Meta/consolidation (retire FIX_SESSION_1, archive 424/426/427_PROMPT.md, update STATUS.md, COMPLETED_TASKS reclassification). Quality debt + product-gap.
- **Key claims / decisions / dates:** "Mode context (2026-04-24): Web is in `NEXT_PUBLIC_SITE_MODE=coming_soon`." Lists 94 type-escape hatches, 33+ next lint warnings, CSP report-only, tsconfig strict false, expert Q&A `#if false` at `StoryDetailView.swift:1907-1933`.
- **Cross-references:** MASTER_TRIAGE items, MEMORY (Sentry deferred memory), `Reference/CLAUDE.md`, `Reference/STATUS.md`, FIX_SESSION_1.md, `web/src/middleware.js:188`, `web/tsconfig.json`.
- **Status:** PM's living working doc. No `SHIPPED` markers (these go on the items themselves in MASTER_TRIAGE).
- **Concerns:**
  - References `Current Projects/FIX_SESSION_1.md` to be retired — per CLAUDE.md it appears already retired ("retired into `Current Projects/MASTER_TRIAGE_2026-04-23.md` per-item SHIPPED blocks"). Possibly already done.
  - References "424_PROMPT.md, 426_PROMPT.md, 427_PROMPT.md" at repo root to archive — out of zone, can't verify here.
  - Lists T0-1 + T0-2 + B1 + B3 + B6 + K5 + L8 as launch-blocking and "not shipped" — but MASTER_TRIAGE shows nothing about T0-1/T0-2 having SHIPPED blocks (Tier 0 entries 1-2 have no SHIPPED annotation), B1 + B3 + K5 + L8 also not marked SHIPPED — consistent.
  - L19 punchlist references commit `98c6662` (`claim_push_batch` RPC) but the MASTER_TRIAGE L19 entry is "no concurrency lock" marked DEFERRED — these are different items. Possibly the punchlist L19 is stale or refers to a different L19 numbering. Worth flagging for cross-wave verification.

### Current Projects/PRELAUNCH_UI_CHANGE.md

- **Purpose:** End-to-end UI rebuild proposal across web + iOS adult + iOS kids. Foundations primitives, surface-by-surface rebuild, per-role rebuild, what-stays-same, cleanups, sequencing across 6 phases, acceptance criteria, risk audit, pre-flight checklist, compatibility shims, bottom line.
- **Topics:** North-star ("a serious place where you have to prove you read it before you can talk about it"), 10 foundations primitives (Spacing, Type, Color, Elevation, Motion, EmptyState, Skeleton, Toast, LockedFeatureCTA, Date format), 14 surface specs (3.1-3.14), 6-phase sequencing (Foundations → Auth polish → Settings split → Story+Home+Bookmarks+Billing → Profile+LockedFeatureCTA inversion+notifications → Engagement+admin surgical+errors+kids polish), risk matrix, file:line citations, gateType discipline.
- **Key claims / decisions / dates:** "Date drafted: 2026-04-25." Owner notes added 2026-04-25 supersede earlier sections. Owner notes: no curation-attribution, profile nav real redesign needed, "Reading activity" tab to repurpose/remove, weekly email digests removed pre-launch (`weekly_reading_report`, `weekly_family_report` soft-deleted). Three new notification templates (`comment_reply`, `expert_answer_posted`, `streak_jeopardy`).
- **Cross-references:** Massive — `web/src/app/profile/settings/page.tsx`, all 11 settings sub-routes, `web/src/app/story/[slug]/page.tsx:541`, `web/src/app/api/stripe/checkout/route.js:82`, `web/src/app/api/stripe/portal/route.js:53`, `web/public/.well-known/apple-app-site-association` (does not exist), `VerityPost/VerityPost/VerityPost.entitlements`, `VerityPostKids/VerityPostKids/ParentalGateModal.swift:59-70`, `web/src/app/api/cron/send-emails/route.js:23-24`, etc. About 30 specific file:line citations.
- **Status:** Drafted, owner-reviewed. Three open owner decisions (profile nav, activity tab, surface ordering). No `SHIPPED` markers. Most recent doc in zone.
- **Concerns:**
  - References F1-F4 indirectly (F1 source-line conflict noted under F1 entry; F3 quiz-pass logic line `541` in section 3.2 vs F3 lines `656-691, 605-643`).
  - `MASTER_TRIAGE Tier 4` mentions ~50-100 `.js`/`.jsx` files in `web/src/` violating CLAUDE.md "no new `.js`/`.jsx`" — this UI change spec says nothing about TS migration, so it's adjacent but uncoordinated.
  - Pre-flight checklist item "No conflict with active items in `Current Projects/MASTER_TRIAGE_2026-04-23.md`" — needs explicit pass/fail.
  - PRELAUNCH_UI_CHANGE §3.2 references `story/[slug]/page.tsx:541` for "pass-then-load logic is already correct" — but F3 says the same file lines 656-691 contain three branches that need replacement. These two cite different parts of the same file with different framings.

## MASTER_TRIAGE breakdown

- **Total items:** 67 numbered entries plus aggregate Tier 4 themes
  - Tier 0: 2 items (#1, #2)
  - Tier 1: 7 items (#3-#9)
  - Tier 2: 12 items (#10-#21)
  - Tier 3: 18 items (#22-#39)
  - Round 3-A Kids iOS: 11 items (K1, K2, K3, K4, K5, K6, K7, K8, K9, K10, K11, K13 — note K12 absent)
  - Round 3-B Admin UI: 7 items (AD1-AD7)
  - Round 3-C Billing+IAP: 20 items (B1-B20)
  - Round 3-D Cron+lib: 20 items (L1-L20)
  - Round 4 Bug Hunt: 8 items (BH1-BH8)
  - Tier 4: aggregate, ~150 items not individually numbered

- **SHIPPED items (with dates and SHA where given):**
  - **Tier 2:** #10 (2026-04-24 · 5823194), #11 (2026-04-24 · d470e88), #12 (2026-04-24 · 710be2b), #13 (2026-04-24 · 24c1a3d), #14 (2026-04-24 · 4ebb962), #15 (2026-04-24 · edf7791), #16 (2026-04-24 · a227e8b), #17 (2026-04-24 · baff805), #18 (2026-04-24 · 955af8e), #19 (2026-04-24 · 1c45eca), #20 (2026-04-24 · 93696f9), #21 (2026-04-24 · 77625e9)
  - **Tier 3:** #22 (2026-04-24 · 86b0787), #24 (2026-04-24 · 76a13fb), #25 (2026-04-24 · 4eb37b4), #26 (2026-04-24 · 9828613), #27 (2026-04-24 · 6683aee), #30 (2026-04-24 · 24b6675), #31 (2026-04-24 · 08929cf), #33 (2026-04-24 · 35c1035), #34 (2026-04-24 · 3056bc5), #36 (2026-04-24 · 34366c7), #39 (2026-04-24 · 2b05dd4)
  - **Round 3-A Kids:** K1+K10 (2026-04-24 · 0295c41), K2 (2026-04-24 · f7ef24e), K3 (2026-04-24 · cd894a2), K4 (2026-04-24 · 500dfe2), K6 (2026-04-24 · bc08acf), K8 (2026-04-24 · 0908817), K9 (2026-04-24 · cca0a6e), K11+K13 (2026-04-24 · 8729899)
  - **Round 3-B Admin UI:** AD1 (2026-04-24 · aced725), AD2 (2026-04-24 · 63875c2), AD3 (2026-04-24 · 1d3585f), AD4 (2026-04-24 · fdf02bb), AD5 (2026-04-24 · 3f24c16), AD6 (2026-04-24 · 91ea57e), AD7 (2026-04-24 · b2e9f56)
  - **Round 3-C Billing:** B2 (2026-04-24 · dc7b69d), B4 (2026-04-24 · dc7b69d), B5 (2026-04-24 · bbcd785), B6 (2026-04-24 · dc7b69d), B7 (2026-04-24 · dc7b69d), B8 (2026-04-24 · 5d95f2b — owner applies), B9 (2026-04-24 · 91146cb), B10 (2026-04-24 · 0ca552e), B12 (2026-04-24 · 91146cb), B15 (2026-04-24 · a1b30d7), B16 (2026-04-24 · a1b30d7), B19 (2026-04-24 · a1b30d7)
  - **Round 3-D Cron+lib:** L1 (2026-04-24 · c012c3f), L2 (2026-04-24 · 0493050), L3 (2026-04-24 · 9d04420), L4 (2026-04-24 · 8b304e7), L5 (2026-04-24 · 7a46e71), L6 (2026-04-24 · cd5b89a), L7 (2026-04-24 · a050234), L8 (2026-04-24 · 4cc5d56), L10 (2026-04-24 · 4cc5d56), L11 (2026-04-24 · 4cc5d56), L17 (2026-04-24 · 4cc5d56), L18 (2026-04-24 · 4cc5d56)
  - **Round 4 BugHunt:** BH1 (2026-04-25 · 94034d8), BH2 (2026-04-25 · 83e38c0), BH3 (2026-04-25 · 94034d8), BH4 (2026-04-25 · 94034d8), BH5 (2026-04-25 · 83e38c0), BH6 (2026-04-25 · 94034d8), BH7 (2026-04-25 · schema/177 + 94034d8), BH8 (2026-04-25 · 29f7a22)

- **Open items (no SHIPPED block, not marked STALE/DEFERRED):**
  - **Tier 0:** #1 (admin/users/[id]/roles DELETE crash), #2 (billing cancel/freeze actor.id ReferenceError)
  - **Tier 1:** #3 (auth/email-change premature unverified flip), #4 (iOS quiz pass 70% vs server 60%), #6 (PasswordCard signInWithPassword bypass), #7 (Ad.jsx javascript: URL XSS), #8 (settings page CSS injection via avatar/banner URL), #9 (profile/[id] tab nav pointing wrong place — note: #5 is RESOLVED-BY-9 not a separate fix)
    - #5 is a resolved-by-#9 case (file replaced with stub)
  - **Tier 2:** none open — all 12 SHIPPED
  - **Tier 3:** #23 (STALE), #28 (STALE), #29 (STALE), #32 (STALE), #35 (STALE), #37 (STALE), #38 (STALE) — all marked STALE so effectively closed; no truly open items in Tier 3
  - **Round 3-A Kids:** K5 (ParentalGateModal call-site coverage), K7 (STALE)
  - **Round 3-B Admin UI:** none open (all 7 SHIPPED); plus deferred page list noted for follow-up agent
  - **Round 3-C Billing:** B1 (Stripe webhook bump_user_perms_version missing), B3 (iOS receipt hijack — userId not cross-checked vs JWS appAccountToken), B11 (Stripe handleChargeRefunded auto-freeze too aggressive), B13 (STALE), B14 (DEFERRED), B17 (DEFERRED), B18 (DEFERRED), B20 (STALE)
  - **Round 3-D Cron+lib:** L9 (STALE), L12 (DEFERRED), L13 (DEFERRED), L14 (STALE), L15 (STALE), L16 (STALE), L19 (DEFERRED), L20 (STALE) — no truly open items

  Truly open and non-stale: **Tier 0 #1, #2; Tier 1 #3, #4, #6, #7, #8, #9; K5; B1, B3, B11.** That's 11 items.

- **Items with conflicting state:**
  - **#5** is annotated `RESOLVED-BY-9 (commit 11986e8)` with explanation that the file containing the bug was replaced. Treated as closed-by-side-effect, not a discrete SHIPPED. Worth a normalized status.
  - **L19 punchlist vs L19 master triage:** PM_PUNCHLIST §"Needs verification" lists L19 as `cron/send-push atomic claim` with commit `98c6662`. MASTER_TRIAGE L19 reads "cron/send-push:262-266 no concurrency lock — overlapping cron invocations fight queue **DEFERRED**". These two L19s describe the same file/issue but the punchlist says shipped while triage says deferred. One of the two is stale.
  - **K12 missing** — Round 3-A items run K1-K11 then jump to K13. Either K12 was renumbered or never reported; should be confirmed.
  - **Tier 4 mentions `webhook_log reclaim missing 'received' state for Apple notif rows`** — same problem as Tier 3 #30 which is SHIPPED. Tier 4 line is stale.
  - **Tier 4 mentions `messages + conversations brittle error-string status mapping (also a Tier 2 issue)`** — Tier 2 #21 SHIPPED so this Tier 4 entry is stale.

## Within-zone duplicates / overlap

1. **F5 vs F6** — F6 is master plan that absorbs F5. Many F5 sections (placement catalog, ad targeting, admin UI, instrumentation) are restated in F6 with more rigor. F5 unfilled D-table makes it a worksheet; F6 is plan-of-record. F5 is effectively orphaned once F6 ships.

2. **F7-pipeline-restructure.md vs F7-DECISIONS-LOCKED.md** — direct conflicts on kids data model, model provider strategy, ingest cadence, cost cap, and discovery table layout. F7-DECISIONS-LOCKED should mark F7-pipeline-restructure.md fully superseded; today it only mentions superseding the §5 of F7-PM-LAUNCH-PROMPT.md.

3. **F1, F2, F3, F4 vs PRELAUNCH_UI_CHANGE.md** — PRELAUNCH_UI_CHANGE re-specifies story-page UX from scratch (3.2). F1's "REPORTED FROM" line above headline contradicts PRELAUNCH_UI_CHANGE's inline source chips (3.2). F4's "no hero image" contradicts PRELAUNCH_UI_CHANGE's full-bleed hero (3.1). F2 is silent in PRELAUNCH_UI_CHANGE. F3's earned-chrome is partially incorporated.

4. **PRELAUNCH_UI_CHANGE.md vs MASTER_TRIAGE Tier 4** — Tier 4 enumerates ~150 quality issues including z-index salad, inline keyframes, toast IDs collisions, raw padding numbers — exactly the surface PRELAUNCH_UI_CHANGE Phase 1 addresses with tokens + primitives. They don't conflict but they aren't cross-referenced; a sweep can deliver both.

5. **F7-PHASE-3-RUNBOOK Section 4 RPC draft vs F7-DECISIONS-LOCKED Task 11 SHIPPED block** — runbook draft RPC signature differs from shipped signature.

6. **PM_PUNCHLIST_2026-04-24 vs MASTER_TRIAGE** — punchlist is meant to be a baseline "what I see open" — its listing of T0-1, T0-2, B1, B3, B6, K5, L8 as "Critical launch-blocking code" largely matches what's still open in MASTER_TRIAGE (B6 + L8 actually shipped per the SHIPPED log). PM_PUNCHLIST is one day stale relative to MASTER_TRIAGE updates.

## Within-zone obvious staleness

1. **APP_STORE_METADATA.md uses `site/...` path prefix** instead of `web/...`. Predates 2026-04-22 architecture verify.
2. **F7-PM-LAUNCH-PROMPT.md** declares latest schema is `schema/111` and says next migration is `112`. Reality: migrations 114, 116, 118, 120 have shipped per F7-DECISIONS-LOCKED.
3. **F7-PM-LAUNCH-PROMPT.md** still references `@admin-verified` markers for admin code locking. Memory `feedback_admin_marker_dropped` (2026-04-23) retired markers.
4. **F7-DECISIONS-LOCKED.md** Decision 1 "Consequence for Phase 4" still references "currently `@admin-verified 2026-04-18`" pipeline page marker — same stale reference.
5. **F7-pipeline-restructure.md** is materially superseded but not marked as such anywhere on the doc itself.
6. **PM_PUNCHLIST L19 punchlist entry** says "Verify L19 cron/send-push atomic claim shipped via `98c6662`"; MASTER_TRIAGE L19 says DEFERRED. Indicates either punchlist or master triage L19 doesn't track the same thing.
7. **MASTER_TRIAGE Tier 4 raw error leaks (~20 sites)** — Round 4 BH8 shipped sweep on 8 specific sites via 29f7a22; the Tier 4 aggregate count should be reduced.
8. **MASTER_TRIAGE Tier 4 webhook_log reclaim** — duplicates Tier 3 #30 SHIPPED.
9. **MASTER_TRIAGE Tier 4 messages/conversations error-string mapping** — duplicates Tier 2 #21 SHIPPED.
10. **F4-quiet-home-feed.md** says category pills "now wrapped in `{false && …}`" at `page.tsx:722-745` — file/line drift very likely; PRELAUNCH_UI_CHANGE references `FALLBACK_CATEGORIES` hardcode in same file as still drifted. Need verification.
11. **K12 missing from Round 3-A Kids iOS list.** Either renumber explanation needed or the item slipped.

## Notable claims worth verifying in later waves

1. **APP_STORE_METADATA.md claim:** "every IAP `apple_product_id` is set in DB" — need to verify in `plans` table that all 8 product IDs are present.
2. **APP_STORE_METADATA.md claim:** `/help` page exists at `web/src/app/help/page.tsx` (doc says `site/src/app/help/page.tsx`). Also `/profile/contact`. Verify presence + auth-branched server-rendered HTML.
3. **APP_STORE_METADATA.md claim:** `plans.trial_days = 0` for every row — verify no trial accidentally configured.
4. **F1, F2, F3, F4:** Whether any are ALREADY shipped (kill-switched) — F4 says category pills wrapped in `{false && …}`, suggesting partial Phase 4 hide; need to confirm what actually exists in `web/src/app/page.tsx` and `web/src/app/story/[slug]/page.tsx`.
5. **F5 D-table all blank** — owner has not entered AdSense pub ID, CMP choice, launch country list. Verify whether this was filled elsewhere or remains undecided.
6. **F6 §5 verity_score_events ledger** — directly conflicts with `schema/111_rollback_parallel_score_ledger.sql`. Verify whether F6 has been redrafted to use existing `schema/022_phase14_scoring.sql` `score_events` shape, or whether F6 is the obsolete plan.
7. **F7-DECISIONS-LOCKED Phase 4 SHIPPED scope** — the doc lists Tasks 20 + 27 + the Decision 3.1+3.4 gap-fill as shipped. Tasks 21 (cluster detail), 22 (modal), 23 (refresh feeds button), 24+ are not addressed in the SHIPPED log. Verify what Phase 4 actually completed.
8. **F7-DECISIONS-LOCKED says** "Migration 114 applied by owner via Supabase SQL editor" — verify in live DB that all expected tables (ai_models, ai_prompt_overrides, kid_articles, kid_sources, kid_timelines, kid_quizzes, discovery_items, kid_discovery_items) and 21 RLS policies + 19 settings + 4 ai_models seeded rows are actually present.
9. **F7-DECISIONS-LOCKED references** `schema/107_seed_rss_feeds.sql` for feeds seed in F7-PM-LAUNCH-PROMPT — verify count + audience tagging happened (migration 114 added `feeds.audience` NOT NULL).
10. **F7-PHASE-3-RUNBOOK §4** RPC signature vs F7-DECISIONS-LOCKED Task 11 SHIPPED block — verify which signature is live in DB (`claim_cluster_lock(cluster_id, p_minutes default 10)` vs `claim_cluster_lock(cluster_id, locked_by, ttl_sec=600)`).
11. **MASTER_TRIAGE Tier 0 #1 + #2** — punchlist marks both as "not shipped" — verify still broken in current code.
12. **MASTER_TRIAGE Tier 1 #3 + #4 + #6 + #7 + #8 + #9** — these are 4/4 unanimous CRITICAL with no SHIPPED block. Independently verify each is still open vs already closed silently.
13. **MASTER_TRIAGE B1 (Stripe webhook bump_user_perms_version)** — verify against `web/src/app/api/stripe/webhook/route.js:320-385` and Apple notifications route.
14. **MASTER_TRIAGE B3 (iOS receipt hijack)** — verify against `web/src/app/api/ios/subscriptions/sync/route.js:26-73`.
15. **MASTER_TRIAGE K5** — `ParentalGateModal` callers — kid app COPPA gap. Verify call sites.
16. **PRELAUNCH_UI_CHANGE §6.1** — weekly digest removal scope: verify `email_templates` rows + `web/src/app/api/cron/send-emails/route.js:23-24` + `web/src/app/admin/notifications/page.tsx:44-45,70` + `web/src/app/profile/settings/page.tsx:244,259` against actual current state.
17. **PRELAUNCH_UI_CHANGE risk audit** — `web/public/.well-known/apple-app-site-association` claim "does not exist." Verify.
18. **PRELAUNCH_UI_CHANGE §3.2** says quiz/discussion pass-then-load "is already correct at `story/[slug]/page.tsx:541`" — verify current line 541 actually contains that logic; F3 doc points to line 656-691 for the same area — line drift indicates code has changed substantially since F3 was authored.
19. **PM_PUNCHLIST UI-COMMENTS / UI-SETTINGS / UI-OTHER** — owner-reported. Reproduce end-to-end.
20. **CLAUDE.md statement** "DONE.md retired" — verify root-level DONE.md actually deleted.
21. **APP_STORE_METADATA.md §10** — Privacy Policy URL `https://veritypost.com/privacy`, Terms `https://veritypost.com/terms`, Marketing `https://veritypost.com/`. Verify these resolve in production.
22. **PRELAUNCH_UI_CHANGE Phase 3** says "Internal `#anchor` href sweep updates ~10 callers" with explicit file:line list — verify each line is still as cited.
23. **MASTER_TRIAGE Tier 4 "50-100+ `.js`/`.jsx` files in `web/src/`"** — get a hard count for the canonical TS-migration tally.
