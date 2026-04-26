# Zone Z07: Sessions/

## Summary

41 files across 5 date folders (04-21 through 04-25-2026). Captures four days of intense ship+pivot+audit work: file/folder reorganization (Day 1), F7 AI pipeline build-out (Day 2), 11-agent triage + Tier 0/1 ships (Day 3), Tier 2/3 + Admin/Kids/Billing/Cron sweeps (Day 4), and bug-hunt + UI polish + e2e infrastructure (Day 5). Heavy use of multi-agent ship pattern (4 pre-impl + 2 post-impl). Several documents went stale within a session (notably the ADMIN_VERIFIED_RECONCILE which was overruled mid-session by §6.4 + §7 of OWNER_QUESTIONS, dropping the marker entirely).

Of the 41 files: 5 are SESSION_LOG_*, 5 are COMPLETED_TASKS_*, 4 are NEXT_SESSION_PROMPT/HANDOFF, plus reference artifacts (FACTS sheets, kill-switch inventory, relationship maps, runbooks, SQL bundles). 7 FACTS_taskN.md files are archived (`_facts-archive/`); 1 superseded next-session prompt is archived (`_superseded/`).

## Files (chronological)

### Sessions/04-21-2026/Session 1/SESSION_LOG_2026-04-21.md
- **Purpose**: Full narrative of Day 1 — repo reorganization + multi-item ship sprint
- **Date**: 2026-04-21
- **Topics**: PM_ROLE.md review; folder restructure (`archive/` → `Archived/`, dissolution of `proposedideas/`, `05-Working/`, `Future Projects/`, `docs/`); creation of `Sessions/`, `Reference/`, `Current Projects/`, `Completed Projects/`, `Unconfirmed Projects/`; CLAUDE.md → `Reference/CLAUDE.md` with root symlink; UI audit per-item review of 20 items; FIX_SESSION_1.md consolidation (35 items 00-A..O + #1..#20 + F1..F7); 6-agent ship pattern established; AdSense site verification (publisher ID `ca-pub-3486969662269929` baked into root layout via meta tag; ads.txt populated); pg_cron + events maintenance jobs registered; schema/106 applied (kid trial freeze notification); Apple Dev enrollment (Org track, Verity Post LLC); Stripe 3-check clean; admin compliance audit (75 routes, 31% pass).
- **Key decisions**: Reviewer-approval launch model — "launch" = AdSense + Apple review pass with everything not-ready kill-switched; admin compliance sweep PARKED with 5 trigger-events; 4-agent → 6-agent ship pattern locked into memory; HIBP toggle PARKED behind Pro plan; CMP final publish PARKED behind AdSense approval.
- **Items shipped**: #1 (server group + client group metadata via layout.js × 12 files), #3 (auth a11y), #5 (iOS bare buttons reduced 6→3), #6 (regwall a11y), #7 (cap banner overflow), #8 (home banner clickable), #17 (BREAKING badge unification web), #18 (empty states), #19 (error-message security sweep on 14 files), F1 (sources above headline), iOS parity follow-ups, schema/107 rename, AdSense (ads.txt + meta tag + privacy section)
- **Items opened (logged but parked)**: 13 missing migrations (00-N), launch-hide pattern follow-up, 23 rules-of-hooks lint disables flagged for refactor.
- **Cross-refs**: `KILL_SWITCH_INVENTORY_2026-04-21.md`, `REMAINING_ITEMS_RELATIONSHIP_MAP_2026-04-21.md`, `ADMIN_ROUTE_COMPLIANCE_AUDIT_2026-04-21.md`. Commits referenced: `7c28405`, `6dcde8a`, `b7996ee`, `cbf1875`, `1e27318`, `91055cc`, `cbdea50` (mid-session owner push of legal-pages LLC naming + /about page), `1794af9`, `7cbc1bc`, `7c229f2`, `942d467`, `5d4d1ee`, `719fd65`, `67c57d3`.
- **Concerns**: File ends mid-paragraph at line 830 ("observations / bugs spotted so far" with empty content). Session log was truncated/abandoned at end of day.

### Sessions/04-21-2026/Session 1/COMPLETED_TASKS_2026-04-21.md
- **Purpose**: Append-a-line tracker of every completed item this session
- **Date**: 2026-04-21
- **Items (line-by-line)**: 50+ tasks. Notable shipped commits: `1e27318` (ads.txt), `cbf1875` (adsense meta), `91055cc` (privacy section), `b7996ee` (signup-409 race), `7c28405` (hygiene sweep), `6dcde8a` (PM_ROLE drift fix), `5d4d1ee`, `719fd65`, `67c57d3`, `7c229f2`, `942d467`, `1794af9`, `7cbc1bc`. Plus uncommitted UI-item ships (#19, #8, #7, #6, #3, #1-server, #5 iOS, #17, #18, #1-client, F1) marked as "pending commit."
- **Cross-refs**: every shipped UI item has narrative twin in SESSION_LOG_2026-04-21.md
- **Concerns**: many items list "no-commit" — owner-side dashboard actions or work bundled into composite commits.

### Sessions/04-21-2026/Session 1/ADMIN_ROUTE_COMPLIANCE_AUDIT_2026-04-21.md
- **Purpose**: Per-route compliance audit of 75 admin mutation endpoints against CLAUDE.md mutation contract (requirePermission → createServiceClient → checkRateLimit → validate → RPC/write → audit → response)
- **Date**: 2026-04-21
- **Topics**: Per-route verdict (COMPLIANT/MINOR/MAJOR/BROKEN). 23 (31%) all-pass; 18 (24%) minor gaps; 34 (45%) major gaps; 5 (7%) broken. Top violations: missing `checkRateLimit` 73/75 (97%); missing `record_admin_action` SECDEF RPC 52/75 (69%); missing `Retry-After` 8/75. **Helper bug found**: `web/src/lib/adminMutation.ts:63-80` `recordAdminAction` wrapper omits `p_ip` + `p_user_agent` (2 of 8 RPC params).
- **Decisions**: 5 trigger events for sweep resume (second admin onboard / EU + GDPR DSAR / COPPA inquiry / 3-month mark / forensic incident).
- **Concerns**: marked PARKED. Status of helper bug fix unclear — should be tracked as a sub-item.

### Sessions/04-21-2026/Session 1/APPLE_ENROLLMENT_ENTITY_DISCLOSURE_2026-04-21.md
- **Purpose**: Documents `cbdea50` (legal-page LLC naming + /about creation) for Apple org-track enrollment
- **Date**: 2026-04-21
- **Files changed**: `web/src/app/about/page.tsx` (new), `web/src/app/NavWrapper.tsx` (footer), `web/src/app/privacy/page.tsx` (data controller paragraph + Contact), `web/src/app/terms/page.tsx` (operator paragraph + Contact)
- **Pending owner items**: WHOIS verify "Registrant Organization: Verity Post LLC", D-U-N-S number, enrollment email with @veritypost.com domain
- **Concerns**: no state-of-formation listed (deliberate per owner). EIN/DUNS not yet acquired.

### Sessions/04-21-2026/Session 1/APPLE_REVIEW_NAV_CHANGES_REVERT_GUIDE.md
- **Purpose**: Reverse-engineer guide for the 12 nav/UX changes made for Apple review-period soft launch
- **Date**: 2026-04-21
- **Topics**: 3 launch-gate flags (`SHOW_TOP_BAR`, `SHOW_BOTTOM_NAV=false`, `SHOW_FOOTER`); RecapCard hidden via `{false && ...}`; weekly recap pages return null on `LAUNCH_HIDE_RECAP=true`; anon signup interstitial hidden via `LAUNCH_HIDE_ANON_INTERSTITIAL=true`; lowercased "verity post" wordmark; Help link commented out of footer (NOT removing /help page since it's the Apple Support URL); legal pages stripped of mailing addresses + phone + privacy@/dpo@/dmca@/accessibility@ emails consolidated to `legal@`/`support@`; AI mentions removed from privacy + terms.
- **Plus**: 10 articles SQL on Desktop (`~/Desktop/VerityPost_10_Articles_INSERT_2026-04-21.sql`) — NOT applied; FTC AI-disclosure risk noted before public launch.
- **Cross-refs**: KILL_SWITCH_INVENTORY (which catalogs all 11 launch hides)
- **Concerns**: privacy page AI-disclosure was REMOVED in this commit — but FTC compliance recommends restoring before public launch. This is an **important reversal flag** since the AdSense-prep session also did privacy work; need to verify final state.

### Sessions/04-21-2026/Session 1/KILL_SWITCH_INVENTORY_2026-04-21.md
- **Purpose**: Catalog of 11 launch-hide kill switches for launch-day flip sequence
- **Date**: 2026-04-21
- **Items**: (1) mobile tab bar story/[slug]:791; (2) timeline mobile :955; (3) timeline desktop :964; (4) quiz+discussion :977 (the F3 prereq); (5) anon interstitial story:79; (6) recap list page; (7) recap detail page; (8) RecapCard on home :827; (9) Help footer link; (10) `NEXT_PUBLIC_SITE_MODE=coming_soon` in middleware; (11) `SHOW_BOTTOM_NAV=false` in NavWrapper:88-89.
- **Decisions**: 4-phase launch flip order (validation → soft launch → feature → post-MVP).
- **Concerns**: launch-flip sequence is the canonical ungate procedure; verify it's still in sync with current code by Wave 2.

### Sessions/04-21-2026/Session 1/MEMORY_2026-04-21.md
- **Purpose**: Session-local working memory (verified facts, owner decisions, bugs spotted, open questions)
- **Date**: 2026-04-21
- **Concerns**: this is the dated session log not the cross-session memory dir; some of these "open questions" may have been resolved later.

### Sessions/04-21-2026/Session 1/NEW_TREE_STRUCTURE_2026-04-21.md
- **Purpose**: was an empty scaffold per session log — owner directed it cleared after creation
- **Concerns**: dead file. Empty (1 line "(empty — to be populated)").

### Sessions/04-21-2026/Session 1/NEXT_SESSION_PROMPT.md
- **Purpose**: Handoff to Session 2 — what shipped, what's parked, what's autonomous
- **Date**: 2026-04-21
- **Topics**: 14 commits ahead of `0c37d5b`; AdSense path complete; signup race fix landed; pg_cron + schema/106 applied; 7 owner-dashboard actions logged.
- **Pick recommendations for next session**: #20 ESLint+Prettier+Husky; #16 admin `as any` cleanup; #17 strict mode; 00-N DR migrations; #11 error-state polish (8 sites left); F7 (8 owner decisions pending).
- **Cross-refs**: REMAINING_ITEMS_RELATIONSHIP_MAP, FIX_SESSION_1, KILL_SWITCH_INVENTORY.

### Sessions/04-21-2026/Session 1/REMAINING_ITEMS_RELATIONSHIP_MAP_2026-04-21.md
- **Purpose**: 4-agent cross-reference of 35 still-open FIX_SESSION_1 items
- **Date**: 2026-04-21 (mid-session — authored before Day 1 close)
- **Topics**: Files multiple items edit (`page.tsx`, `story/[slug]/page.tsx`, `middleware.js`, `layout.js`, `Ad.jsx`, `signup/page.tsx`, `tsconfig.json`, `vercel.json`, etc.); shared DB tables (quiz_questions, score_events, ad_*); env-var overlap grid; owner-decision gates; 9 natural clusters; hard + soft sequencing; silent-conflict risks; 14 unknowns blocking execution.
- **Concerns**: file's own "Session-end status" appendix marks itself partially STALE — several launch-critical items closed the same day. Use `Current Projects/FIX_SESSION_1.md` for live state, not this map.

### Sessions/04-21-2026/Session 1/TODO_2026-04-21.md
- **Purpose**: Day-1 session-local TODO (mostly PM_ROLE.md review fallout + reorganization-induced broken refs)
- **Date**: 2026-04-21
- **Items**: many DONE checkmarked; 4-5 still open (PM_ROLE §1 trivial-edit scope, "disagreement" definition, STATUS framing reconcile, broken refs in code comments)
- **Concerns**: only follows Day 1; later sessions did not maintain a session-local TODO.

### Sessions/04-21-2026/Session 2/SESSION_LOG_2026-04-21.md
- **Purpose**: Day-1 Session 2 — ESLint+Prettier+Husky landing (FIX_SESSION_1 #20)
- **Date**: 2026-04-21
- **Topics**: 4 pre-impl agents found 5 divergences → 13 fresh agents resolved per-divergence (Husky lives at `web/.husky/` 4/4, no-img-element warn 3/1, ship order #20→#16→#17 with `src/app/admin/` excluded 4/4, parser v8 because TS 6.0.3, legacy `.eslintrc.json` because Next 14 only autodiscovers legacy). Commits `761c049` (configs) + `6b7868f` (23 rules-of-hooks disables for launch-hides + 1 ternary-as-statement fix) + `162ce6d` (327-file format sweep) + `bfff379` (docs/artifacts) + `2902626` (SHA fix). Final: 0 errors, 149 warnings.
- **Items shipped**: FIX_SESSION_1 #20.
- **Items opened**: 6 follow-ups in `FOLLOW_UPS_FROM_SHIP_2026-04-21.md` (Ad.jsx img→Image gated on F5/F6; card/[username] img→Image+ts; audit 45 eslint-disable; hand-clean 149 warnings; admin format pass after #16; refactor 11 launch-hide patterns to put hooks before early-return).
- **Cross-refs**: REVIEW_UNRESOLVED_2026-04-21.md.
- **Decisions (locked into memory)**: divergence-resolution-4-fresh-agents pattern.

### Sessions/04-21-2026/Session 2/COMPLETED_TASKS_2026-04-21.md
- **Purpose**: One-line summary
- **Items**: FIX_SESSION_1 #20 — commits `761c049`, `6b7868f`, `162ce6d`, `bfff379`.

### Sessions/04-21-2026/Session 2/FOLLOW_UPS_FROM_SHIP_2026-04-21.md
- **Purpose**: 6 new tasks queued by #20 (img migrations, eslint-disable audit, lint warning hand-clean, admin format pass after #16 lands, launch-hide pattern global refactor)
- **Concerns**: Item #6 (launch-hide pattern refactor) explicitly cross-refs all 23 inline disables — must come off in same diff as feature unhide.

### Sessions/04-21-2026/Session 2/REVIEW_UNRESOLVED_2026-04-21.md
- **Purpose**: Items where 4-fresh-agent flow deadlocked 2/2 — owner adjudication
- **Date**: 2026-04-21
- **Items**: M26 (CLAUDE.md inline T-IDs) — RESOLVED on retry 4/4 vote A (sweep). M37 (F7 §6 settings clarifier) — RESOLVED on retry 4/4 vote A. M39 (F7 §16 verbatim quote-back) — RESOLVED on retry 3/1 (keep majority). M46 (daily session-state memory pattern) — DEADLOCKED twice 2/2; owner adjudicated as keep-and-refresh per memory.
- **Cross-refs**: 47-item M1-M47 review sweep on 04-22-2026.

### Sessions/04-21-2026/Session 2/NEXT_SESSION_PROMPT.md
- **Purpose**: handoff into 04-22-2026 session
- **Items**: 5 commits NOT pushed (PM held). Final state: 0 errors, 149 warnings, tsc green.

### Sessions/04-22-2026/Session 1/SESSION_LOG_2026-04-22.md
- **Purpose**: Day-2 narrative — F7 AI Pipeline Rebuild from Phase 1 Task 1 through Phase 4 + audit cleanup
- **Date**: 2026-04-22
- **Topics**: 47-item M1-M47 multi-agent review sweep (31 APPLIED, 7 NO-CHANGE, 3 SUBSUMED, 4 DEFER-OWNER, 4 DEADLOCKED) → commit `64cd609`. M6 kids-waitlist email capture → commit `c043b2d` (schema/112 staged). F7 Phases 1-4 + Phase 5 (Newsroom redesign, migration 126) + cleanup streams.
- **Migrations applied live**: 112 (kids_waitlist), 114 (F7 foundation), 116 (cluster locks + perms), 118 (persist_generated_article), 120 (pipeline_runs.error_type), 122 (cluster_id FKs + asymmetric ON DELETE), 124 (kids_summary RPC drop), 126 (Newsroom redesign — feed_clusters audience + archive/dismiss + ai_prompt_presets + 6 RPCs + 3 perms).
- **Items shipped**: ~50 commits including F7 Tasks 1-30 + Phase 5 Newsroom redesign. Phase 4 Tasks 22-29 (b250695, 1f19e42, d366911, a53a260, 16822db, f5be651) + cron schedule downgrade `1cdbadd` (`*/5 * * * *` → `0 6 * * *` for Hobby tier) + `c786b66` (admin hub link surfacing).
- **Items opened**: kid pipeline E2E verification, xlsx reconcile after migration 126 (3 new perm keys), Vercel Pro upgrade for cron, /admin/feeds audience PATCH, Phase 6 running-stories design.
- **Cross-refs**: F7-DECISIONS-LOCKED.md, F7-PHASE-3-RUNBOOK.md, MASTER_CLEANUP_PLAN.md, F7_SMOKE_TEST_RUNBOOK.md, COMPLETED_TASKS_2026-04-22.md.
- **Concerns**: monumental session. Cron downgrade on Hobby tier means orphan recovery runs daily not /5min. `Future Projects/verity-living-edition.html` flagged as untracked pre-session.

### Sessions/04-22-2026/Session 1/COMPLETED_TASKS_2026-04-22.md
- **Purpose**: SHIPPED-block journal for every commit shipped Day 2
- **Date**: 2026-04-22
- **Items shipped (commits, in reverse chronological)**: `b269e17` (newsroom redesign), `bb48426` (.gitignore .vercel), `d49a5aa` (Stream B finishing), `6132de7` (Stream A — F2 + P2-A + Task 16 stash close), `1cdbadd` (cron downgrade), `f5be651` (Phase 4 Task 29 settings UI), `1f19e42` (Phase 4 Tasks 23+24+25 article flow), `b250695` (Task 22 modal), `a53a260` (Task 27 run detail), `d366911` (Task 26 observability list), `2d63621` (Task 21 cluster detail page), `9aca4e6` (STATUS.md refresh), `2a45c11` (E1/E3/E5/E6 owner-decision defaults + archive superseded), `82bbf19` (5 deferred as-never casts post migration 120), `27145e3` (Stream 3 dead casts), `e4d11e9` (Stream 4 docs), `238045b` (Stream 1 clustering wiring), `f26da57` (cleanup prep), `8dc121b` (Stream 2 surgical fixes), `64cd609` (47-item M1-M47 review), `c043b2d` (M6 kids-waitlist), `df7b598` (Phase 1 Task 1 editorial-guide.ts).
- **22 commits total**. File is 73KB — too large for a single Read.
- **Cross-refs**: every commit has full SHIPPED block with files, RPCs, cost-cap, etc.

### Sessions/04-22-2026/Session 1/NEXT_SESSION_PROMPT.md
- **Purpose**: handoff post-Newsroom-redesign
- **Topics**: 8 migrations live; 3 new admin pages (categories, prompt-presets, pipeline/cleanup); 3 new perms wired but **xlsx reconcile pending**; click-through smoke test pending; Vercel Pro upgrade for /5min cron pending.
- **Concerns**: xlsx reconcile is a real risk — next `import-permissions.js --apply` would drop the migration 126 step-11 wirings if owner doesn't reconcile.

### Sessions/04-22-2026/Session 1/F7_SMOKE_TEST_RUNBOOK.md
- **Purpose**: end-to-end click-through verification after Vercel deploy lands green; 5 phases, ~40 min total
- **Topics**: Phase 0 sanity / Phase 1 env vars + kill switches / Phase 2 ingest + clustering + generate + review + publish / Phase 3 observability + cost dashboard / Phase 4 cancel + retry / Phase 5 cron sweep.
- **Concerns**: pre-condition: deploy ≥ `1cdbadd`. Owner-only.

### Sessions/04-22-2026/Session 1/MASTER_CLEANUP_PLAN.md
- **Purpose**: F7 post-audit cleanup plan — 5 audit + 4 verifier + 2 planner agents
- **Date**: 2026-04-22 end-of-session
- **Items**: F1-F12 critical/quality bugs (clustering unwired = P0; kids_summary latent footgun; quiz multi-correct; cache token columns at 0; etc.); D1-D11 dead casts post types:gen; DOC1-DOC6 documentation drift. 4 parallel streams + cross-verifier.
- **Decisions**: 6 owner decisions E1-E6 (E1 = throw vs patch on quiz_verification — chose throw-and-regenerate; E2 = redact.ts deferred; E3 = FIX_SESSION_1 F7 entry stub-link; E4 = Vercel Pro assumed; E5 = ratify Option A clustering inline-in-ingest; E6 = retry internal-fetch kept).
- **Cross-refs**: streams 1-4 commits 238045b/8dc121b/27145e3/e4d11e9.

### Sessions/04-22-2026/Session 1/PHASE1_EXIT_RLS_PROBE.sql
- **Purpose**: Phase 1 exit verification — RLS probes for kid JWT vs adult JWT vs service role across articles/sources/timelines/quizzes/kid_articles
- **Concerns**: owner-runs (MCP can't `SET ROLE authenticated`). Two `<REPLACE-WITH-REAL-ADULT-USER-UUID>` placeholders.

### Sessions/04-22-2026/Session 1/_facts-archive/FACTS_task14.md, _task15-_task20.md
- **Purpose**: Per-task pre-flight ground-truth sheets (DB schema, RPCs, file layouts, contracts) — agents implement against these
- **Date**: 2026-04-22
- **Items**: Task 14 (plagiarism rewrite loop port), Task 15 (Layer 1 prompt overrides + ai_prompt_overrides table check), Task 16 (pipeline_runs.error_type column add), Task 17 (retry route), Task 18 (cancel route), Task 19 (orphan cleanup cron), Task 20 (Newsroom home page).
- **Concerns**: archived `_facts-archive/`. Each FACTS sheet has a "MUST-NOT-TOUCH fence" — useful for future-session agents auditing the same surface. **Many of these contain corrections of prior session's `NEXT_SESSION_PROMPT.md` Task descriptions** (e.g. FACTS_task15 explicitly says "Handoff §5 Task 15 was WRONG on three points (corrected here)").

### Sessions/04-22-2026/Session 1/_superseded/NEXT_SESSION_PROMPT.md
- **Purpose**: ARCHIVED by `2a45c11` — early Session-2 handoff before Newsroom redesign shipped
- **Items**: described Phase 3 Tasks 14-19 + Phase 4 Tasks 20-30. Useful for understanding how Phase 3/4 was scoped before consolidation; replaced by the live `NEXT_SESSION_PROMPT.md`.

### Sessions/04-23-2026/Session 1/NEXT_SESSION.md
- **Purpose**: 5-bundle queued pickup list authored at OWNER_QUESTIONS close
- **Date**: 2026-04-23
- **Bundles**: B1 DB hygiene (5-parent-table verify-and-drop sweep + xlsx ↔ DB reconcile after schema/142); B2 Apple readiness (Day-1 Console runbook + 1Password ROTATIONS); B3 EmptyState consolidation; B4 Kid pipeline E2E + test family 2; B5 long-tail (DR migration list, 30-day perm cleanup).
- **Concerns**: 4 of 8 OWNER_QUESTIONS picks were stale at execution — recorded that 9 orphan tables already dropped, Developing badge admin toggle already exists, ParentalGate has 3 live COPPA callers (file restored), seed-test-accounts.js already deleted. Memory `feedback_verify_audit_findings_before_acting.md` saved as guard.

### Sessions/04-23-2026/Session 1/NEXT_SESSION_HANDOFF.md
- **Purpose**: Detail handoff covering Tier 0/1 ships + recommended next picks
- **Date**: 2026-04-23
- **Items shipped this session (Tier 0/1, 9 items)**: roles DELETE undefined (4a59752), billing/cancel+freeze undefined `actor` (4a59752), email-change flip-before-resend lockout (a33a030), iOS quiz pass at 70% via integer math (7afc0bf), profile/[id] direct follow/block bypass RESOLVED-BY-9 (11986e8), PasswordCard signInWithPassword bypass (6e13089), Ad.jsx click_url scheme validation (e0cf1af), CSS injection via backgroundImage url (ccffa86), profile/[id] tab nav broken — kill-switched both /profile/[id] AND /u/[username] behind `<UnderConstruction>` (11986e8). Plus build fix `messages/page.tsx` Suspense wrap.
- **Items opened**: schema/146 (verify-password rate limit), B1 webhooks bump_user_perms_version, B3 iOS receipt hijack appAccountToken check, L1 robots.js+middleware SEO leak, L2 permissions.js stale-fallthrough on revoke, K1+K2 kids JWT 7-day expiry no refresh.
- **Concerns**: Kill-switching both `/profile/[id]` and `/u/[username]` behind `<UnderConstruction>` is a major launch-time decision; `PUBLIC_PROFILE_ENABLED = true` revert is one-line in `/u/[username]/page.tsx`.

### Sessions/04-23-2026/Session 1/OWNER_QUESTIONS.md
- **Purpose**: Decisions Wave 1 + Wave 2 agents could not make alone — owner picks per item with execution log
- **Date**: 2026-04-23
- **Items**: §1.1 drop 9 orphan tables (PICKED A then turned out STALE — already dropped); §1.2 schedule sweep next session for 5 parent tables (PICKED A); §1.3 EmptyState defer; §1.4 timeAgo leave both; §2.1 apply 144 SQL → moot (orphan tables already dropped); §2.2 mark `00-M` SHIPPED; §2.3 DR migration B post-launch; §2.4 30-day perm cleanup A; §2.5 xlsx ↔ DB reconcile B (agent regenerates); §3.1 Apple Dev DONE 2026-04-23; §3.2 Apple Day-1 runbook needed; §3.3 ConfirmUnderstanding; §4.1 articles being wiped pre-launch (00-L N/A); §4.2 Developing toggle A then turned out STALE; §4.3 ParentalGate B remove → STALE (file restored when xcodebuild surfaced 2 errors); §5.1 N/A owner handles seeding; §5.2 A test_family_2 next session; §5.3 retire seed-test-accounts.js B → STALE (already deleted); §6.1 .next cache C ignore; §6.2 --breaking color split A approved; §6.3 owner-only checks resolved (00-C + 00-J both SHIPPED); §6.4 VOIDED (admin-verified bump phantom); §7 drop @admin-verified marker entirely + add 6-agent rule to CLAUDE.md.
- **Concerns**: This file is **the canonical decision log** for 2026-04-23. It explicitly logs the §6.4 voiding of ADMIN_VERIFIED_RECONCILE.md and the §7 drop-the-marker decision (77 markers stripped). Memory `feedback_admin_marker_dropped.md` saved.

### Sessions/04-23-2026/Session 1/ADMIN_VERIFIED_RECONCILE.md
- **Purpose**: Stream 4 of 4-stream parallel cleanup — bumped 77 `@admin-verified` markers to 2026-04-23 date
- **Date**: 2026-04-23
- **Concerns**: **THIS FILE IS OVERRULED.** Per OWNER_QUESTIONS §6.4 the premise was hallucinated (zero admin paths were touched in the session's 10-commit ship). Per §7 the marker was dropped entirely. **Both the bump and the marker convention were retired.** This file is now archaeology — useful for understanding the now-deleted convention but not as state.

### Sessions/04-23-2026/Session 1/BRAND_SWEEP_2026-04-23.md
- **Purpose**: C10 — color-token sweep (split `--danger` from `--breaking` to avoid AA-contrast violations on error vs banner uses)
- **Date**: 2026-04-23
- **Items shipped**: web `globals.css` added `--breaking: #ef4444`; iOS `Theme.swift` added `VP.breaking`; ~17 files swapped inline `#ef4444`/`#dc2626` to canonical tokens. F4-F11 closed clean (no plan-tier name drift, no Sign in/up casing drift, no emoji on adult surfaces, etc.). F8 timeAgo + F9 EmptyState deferred.
- **Cross-refs**: OWNER_QUESTIONS §1.4, §1.3, §6.2.

### Sessions/04-23-2026/Session 1/CONSOLIDATED_SQL.sql
- **Purpose**: Single SQL bundle (slot 144 — drop 9 orphan tables)
- **Concerns**: TURNED OUT STALE — owner ran the verification query and confirmed 9 tables already dropped from prod. Migration 144 was never authored. ORPHAN_TABLE_TRIAGE.md still reflects pre-execution state.

### Sessions/04-23-2026/Session 1/ORPHAN_TABLE_TRIAGE.md
- **Purpose**: Stream 3 read-only triage of 10 candidate orphan tables
- **Items**: 9 DROP-CANDIDATE (access_code_uses, behavioral_anomalies, campaign_recipients, cohort_members, consent_records, device_profile_bindings, expert_discussion_votes, sponsored_quizzes, translations); 1 KEEP-DEFERRED (search_history — referenced by `Future Projects/views/web_search.md`).
- **Concerns**: by execution time, all 9 already dropped from prod. CONSOLIDATED_SQL slot 144 was a no-op.

### Sessions/04-24-2026/Session 1/COMPLETED_TASKS_2026-04-24.md
- **Purpose**: Day-4 first session — L1 + Tier 2 + Tier 3 web + Admin AD1-AD3 closed
- **Date**: 2026-04-24
- **L1 SEO sweep**: middleware PROTECTED_PREFIXES — REMOVED `/browse`, `/category`, `/card`, `/search`, `/u`. RETAINED `/profile`, `/messages`, `/bookmarks`, `/notifications`, `/leaderboard`, `/recap`, `/expert-queue`, `/billing`, `/appeal`. HoldingCard rewritten (eyebrow + headline + subline). Commit `c012c3f`.
- **Tier 2 (12 items)**: #10-#21 — CommentThread+messages block POST/DELETE split, notifications partial-PATCH, freeze username via update_own_profile, javascript:/data:/vbscript: rejection in email action_url, iOS username ASCII+NFC normalize, OAuth callback ?next= preservation, sign out session after immediate deletion, idempotent user_roles insert, broker iOS username through API, graceful avatar-upload-when-bucket-missing, narrow Pick<> on users select, stable [CODE] DM error prefix.
- **Tier 3 web (11 closed, 2 STALE, 5 NOT-A-BUG)**: #22-#39. Notable closes: 24c1a3d (javascript: rejection), 4eb37b4 (admin billing audit perm gate), 9828613 (CSRF same-origin on cookie cancel-deletion), 24b6675 (Apple notification reclaim from stuck 'received'), 08929cf (uniform 200 on resolve-username), 3056bc5 (SVG avatar XSS rejection), 34366c7 (Avatar initials by code point not UTF-16 unit), 2b05dd4 (callback email_verified service-client). NOT-A-BUG: #32 iOS async login by-design. STALE: #23 #28 ephemeral-client; #29 user_id guard; #35 CRON_SECRET in Authorization not URL; #37/#38 routes already exist as redirects.
- **Admin band 3 of 7**: AD1 ConfirmDialogHost mount (aced725), AD2 raw error.message strip from admin toasts (63875c2 — 7 files DA-119 sweep), AD3 DataTable keyboard shortcuts removed (1d3585f).
- **Migrations applied**: 146, 148, 150, 151, 152.
- **Owner action pending**: create `avatars` Supabase Storage bucket (public read + own-folder upload RLS).
- **Handoff**: `426_PROMPT.md` at commit `f6c07f2` for Session 2 pickup.

### Sessions/04-24-2026/Session 2/COMPLETED_TASKS_2026-04-24.md
- **Purpose**: Day-4 continuation — Admin AD4-AD7 + all 11 Kids iOS items + 12 of 17 Billing + 11 of 20 Cron/lib closed
- **Date**: 2026-04-24
- **Admin band 4 of 4 remaining (7/7 total)**: AD4 fdf02bb (gate users + permissions on API perm), AD5 3f24c16 (gate prompt-presets + categories on API perm keys), AD6 91ea57e (toast pipeline/costs load failures), AD7 b2e9f56 (promote now/nowBg to ADMIN_C).
- **Kids iOS 11 of 11**: K1+K10 0295c41 (real quiz pass/fail wired into streak + scene chain), K2 f7ef24e (kid JWT rotation under 24h via /api/kids/refresh + schema/153), K3 cd894a2 (ArticleListView categorySlug end-to-end), K4 500dfe2 (reading_log/quiz_attempts persistence failure surface), K6+K7 bc08acf (GreetingScene cancel on disappear/name change — K7 STALE), K8 0908817 (drop URL force-unwraps on ProfileView legal rows), K9 cca0a6e (Color hex logs + visible fallback), K11+K13 8729899 (real category leaderboard rank via RPC + schema/154).
- **Billing 12 of 17**: B2+B4+B6+B7 dc7b69d (stripe webhook handlers + stuck processing reclaim), B5 bbcd785 (promo through billing_change_plan/billing_resubscribe), B8 5d95f2b (partial UNIQUE on subscriptions + schema/155), B9+B12 91146cb (appAccountToken orphan fallback + JWS error leak strip), B10 0ca552e (drop unused pending_stripe_sync flag), B15+B16+B19 a1b30d7 (rate-limit iOS sync + schema/156, preserve unhandled Apple types, resolve free plan by tier).
- **Cron/lib 11 of 20**: L2 0493050 (hard-clear permissions cache on version bump — fail-closed revokes), L3 9d04420 (BATCH_SIZE 500→200 under PostgREST 8KB cap), L4 8b304e7 (Promise.allSettled on send-emails setup), L5 7a46e71 (parallelize check-user-achievements with concurrency cap), L6 cd5b89a (state-machine data-exports worker + drop orphan uploads on error), L7 a050234 (createClientFromToken bearer shape-validate), L8+L10+L11+L17+L18 4cc5d56 (cron/lib MEDIUM batch).
- **Migrations queued for owner**: 153, 154, 155, 156.
- **STALE/NOT-A-BUG**: B13 promo ABA already optimistic-eq guarded; B14 Apple JWS header timestamp deferred (no test surface); B17 frozen-user RPC behavior; B18 webhook_log already captures errors; B20 already creates billing_alert in B11 (8984700); L9 APNs JWT max-age check well under invalidation (50min vs 60min); L12 plans.js TIERS hardcoded (real but LARGE); L13 roles.js 60s cache acceptable; L14 persist-article already row-guarded; L15 cost-tracker fail-closed on parseNum; L16 CSP Report-Only intentional; L19 cron/send-push concurrency lock (defer); L20 cronAuth length-equality timing mitigated.
- **Owner action pending**: apply 153/154/155/156; create `avatars` bucket.
- **Handoff**: `427_PROMPT.md`.

### Sessions/04-25-2026/Session 1/SESSION_LOG_2026-04-25.md
- **Purpose**: Day-5 single-day bug-hunt + UI polish + e2e infrastructure session
- **Date**: 2026-04-25
- **Items shipped (commits)**: a49b9cd (polish reader Loading state), 3524cee (drop flaky clicks-coverage spec), 83e38c0 (UI audit HIGH+MEDIUM quick wins), edb80fc (revert /preview-as-admin + signup hard-block), 94034d8 (admin-bypass route + tighten signup gates), 97b7074 (e2e service-role admin createUser bypass signup rate limit), 24d3e90 (e2e spoof unique x-forwarded-for in createTestUser), 9e1bb7b (comprehensive scenario coverage — 198 tests across 20 files). Plus migration `schema/177_grant_ai_models_select.sql` applied by owner.
- **Real bugs fixed**: iOS adult BrowseLanding non-tappable categories (regression test added); iOS kids ExpertSessionsView non-tappable session cards; /api/admin/promo POST 500 on duplicate code → 409 mapping; /api/users/[id]/block POST 500 on missing target → 404; /browse "Latest" empty grid → "No new stories yet today"; iOS Kids `UIRequiresFullScreen` missing (App Store warning); admin `/admin/newsroom` Generate button did nothing (PostgREST grants missing on `ai_models` + 3 other F7 tables — schema/177 added GRANT SELECT to authenticated/service_role).
- **UI polish**: BookmarksView Remove → VP.danger; StoryDetailView quiz "Loading…" → "Starting quiz…"; SignupView/AlertsView icons accessibilityHidden; KidQuizEngineView close X 36→44pt; ExpertSessionsView .contentShape(Rectangle()); /bookmarks at-cap banner CTA-only; /login lockout copy timezone-relative; /not-found 404 Browse-categories CTA; /story/[slug] Loading... → "Loading article…" + aria-live.
- **Test infra shipped**: tests/e2e/_fixtures (seed.ts/setup.ts/cleanup.ts/createUser.ts) + admin-deep.spec.ts (24) + admin-deep-batch2.spec.ts (40) + profile-settings-deep.spec.ts (16) + kids-deep.spec.ts (17) + expert-deep.spec.ts (13) + social-deep.spec.ts (16) + seeded-reader-flow.spec.ts (5) + seeded-roles.spec.ts (18). Plus VerityPostUITests/SmokeTests.swift (5) + VerityPostKidsUITests/SmokeTests.swift (4). Total ~287+ web tests.
- **Audit findings on file (not fully acted on)**: 51 untested admin flows (24+40 covered), 45 untested profile/settings (16 covered), 32 iOS adult UI issues (HIGH shipped), 20 iOS kids UI issues (HIGH shipped), 80+ web UI issues (MEDIUM shipped, HIGH design-system deferred), 80+ untested click paths (clicks-coverage spec too flaky under dev-server load).
- **Open**: 6 HIGH web UI items deferred (Settings dark on public surface, no signed-in-as indicator, button styles fragmented, form fields inconsistent, color palette split, typography undocumented). AI pipeline article generation should now work after schema/177 — owner end-to-end test pending. /preview-as-admin bypass workflow REVERTED — too multi-step; owner uses /preview?token=PROD_BYPASS_TOKEN.
- **Suite state**: web 287+ tests clean on chromium + mobile-chromium; iOS adult 5/5 green; iOS kids 4/4 green; both apps `xcodebuild archive` clean modulo signing.

### Sessions/04-25-2026/Session 1/BUGS_FIXED_2026-04-25.md
- **Purpose**: Living bug log keyed by FIXED/OPEN/WONTFIX with where/symptom/root-cause/fix/regression-test
- **Items**: per-bug structured entries for the Day-5 fixes (BrowseLanding, ExpertSessionsView, /api/admin/promo, /api/users/[id]/block, /browse Latest empty, iOS Kids UIRequiresFullScreen, /admin/newsroom Generate). Plus POLISH section + SECURITY section (8 routes leaked raw error.message — admin/users/role-set, permission-sets/[id], subscriptions/manual-sync, support — all routed through `safeErrorResponse`).
- **Pending audits**: 31 untested admin flows; 45 untested profile/settings; 37 user-mutation routes without explicit rate limit; ~10 admin pages empty-state branches unverified; ECONNRESET dev-server flakes.

## Decision timeline

- **2026-04-21 morning**: Repo restructure greenlit by owner → docs dissolved into `Reference/`, `Current Projects/`, `Future Projects/`, `Completed Projects/`, `Archived/`, `Sessions/`. CLAUDE.md root → symlink to `Reference/CLAUDE.md`.
- **2026-04-21 mid-morning**: PM_ROLE.md gets "PM_ROLE supersedes CLAUDE.md on scope conflicts" precedence clause + path drift fixes (`6dcde8a`).
- **2026-04-21 afternoon**: 6-agent ship pattern (4 pre + 2 post) locked in via memory `feedback_4pre_2post_ship_pattern.md`.
- **2026-04-21 afternoon**: Reviewer-approval launch model defined (memory `project_launch_model.md`) — drops 00-L quiz content + F2/F3 + 00-M from launch-blocking for AdSense+Apple approval phase.
- **2026-04-21 afternoon**: Admin compliance sweep PARKED with 5 trigger events.
- **2026-04-21 late afternoon**: Apple Dev enrollment submitted under Organization track ("Verity Post LLC"). Mid-session push of `cbdea50` (legal-pages LLC + /about).
- **2026-04-21 late afternoon**: AdSense site-verification done (publisher ID `ca-pub-3486969662269929`); CMP "3-choice" pattern selected.
- **2026-04-21 late afternoon**: Future Projects/ folder dissolved → contents moved into Current Projects with F1-F7 prefixes.
- **2026-04-21 evening (Session 2)**: Divergence-resolution-4-fresh-agents pattern locked in via memory `feedback_divergence_resolution_4_independent_agents.md`. ESLint+Prettier+Husky landed (#20). 5 commits NOT pushed.
- **2026-04-22 early**: 47-item M1-M47 review sweep — `64cd609`. 4 deadlocks logged in REVIEW_UNRESOLVED_2026-04-21.md.
- **2026-04-22 mid**: F7 Phase 1-3 build-out. 6 owner decisions E1-E6 (E1 = throw-and-regenerate on quiz_verification mismatch; E2 redact.ts deferred; E3 FIX_SESSION_1 F7 stub-link; E4 Pro tier assumed; E5 ratify Option A clustering; E6 retry internal-fetch kept).
- **2026-04-22 late**: Phase 5 Newsroom redesign single-page operator workspace with audience tabs (`b269e17` + migration 126). 3 new admin pages, 3 new perms wired but xlsx reconcile NOT done (deferred).
- **2026-04-22 evening**: Cron downgrade `1cdbadd` (`*/5 * * * *` → `0 6 * * *`) because Vercel Hobby tier limit. Pro upgrade pending.
- **2026-04-23**: 4 of 8 OWNER_QUESTIONS picks turned out STALE at execution (orphan tables already dropped, Developing toggle already exists, ParentalGate has live callers, seed-test-accounts.js already deleted). Memory `feedback_verify_audit_findings_before_acting.md` saved as guard.
- **2026-04-23**: §6.4 voids ADMIN_VERIFIED_RECONCILE.md (premise hallucinated). §7 drops `@admin-verified` marker entirely (77 markers stripped). Memory `feedback_admin_marker_dropped.md` saved.
- **2026-04-23**: Tier 0/1 9-item ship (4a59752, a33a030, 7afc0bf, 11986e8, 6e13089, e0cf1af, ccffa86). Item #9 owner pivoted: kill-switched both `/profile/[id]` AND `/u/[username]` behind `<UnderConstruction>` (revert = `PUBLIC_PROFILE_ENABLED = true` one-line flip).
- **2026-04-24 Session 1**: L1 SEO middleware sweep — public routes opened, kill-switched routes retained as PROTECTED. Tier 2/3 web + Admin AD1-AD3 (`c012c3f`, plus #10-#39 commits).
- **2026-04-24 Session 2**: Admin band closed (AD4-AD7); Kids iOS K1-K11 + K13 closed; Billing 12 of 17 closed; Cron/lib 11 of 20 closed. Migrations 153-156 queued.
- **2026-04-25**: e2e test infrastructure shipped (~287+ tests + iOS smoke). 7 real bugs fixed; UI HIGH+MEDIUM polish shipped. Schema/177 grants `ai_models` SELECT (admin Generate button now works). /preview-as-admin route REVERTED (too multi-step).

### Reversals

- **APPLE_REVIEW_NAV_CHANGES_REVERT_GUIDE Change 11**: AI mentions stripped from privacy + terms pages 2026-04-21. **AdSense privacy section ADDED back later same day** with cookie language (commit `91055cc`). The two are partially in tension — privacy AdSense language doesn't directly mention AI, so this is a partial reversion.
- **ADMIN_VERIFIED_RECONCILE.md (Stream 4 of Wave 2 cleanup, 2026-04-23)**: BUMPED 77 markers to 2026-04-23 → **OVERRULED same session** by OWNER_QUESTIONS §6.4 (premise hallucinated) + §7 (drop the marker entirely). Net: 77 markers stripped, not bumped.
- **CONSOLIDATED_SQL.sql slot 144 (drop 9 orphan tables, 2026-04-23)**: Authored as inline-DDL → **STALE BEFORE EXECUTION** (verification confirmed 9 already dropped). Migration 144 was never authored on disk.
- **§4.2 Developing badge admin toggle (2026-04-23)**: Marked PICK A "add toggle" → **STALE** (already exists at `/admin/story-manager/page.tsx:828-832`).
- **§4.3 ParentalGate file (2026-04-23)**: Picked B "remove unused file" → **STALE then RESTORED** (file deleted then restored when xcodebuild surfaced 2 compilation errors; has 3 live COPPA callers via `.parentalGate(...)` view modifier).
- **§5.3 seed-test-accounts.js (2026-04-23)**: Picked B "retire" → **STALE** (already deleted from disk).
- **/preview-as-admin route (2026-04-25)**: Shipped in `94034d8` → **REVERTED in `edb80fc`** same session (too multi-step). Owner uses `/preview?token=PROD_BYPASS_TOKEN`.
- **Pipeline-cleanup cron (2026-04-22)**: `*/5 * * * *` shipped → **DOWNGRADED to `0 6 * * *`** in `1cdbadd` (Vercel Hobby tier limit). Pro upgrade pending unblocks `*/5`.
- **Public profile route (2026-04-23)**: `/profile/[id]` + `/u/[username]` both kill-switched behind `<UnderConstruction>` in `11986e8` — owner can flip `PUBLIC_PROFILE_ENABLED = true` to restore.
- **#20 follow-up 6 (launch-hide pattern global refactor)**: identified Day 1 Session 2 as proper-fix for 23 inline `react-hooks/rules-of-hooks` disables → **NOT YET DONE** through Day 5; CLAUDE.md "23 rules-of-hooks disables" still in effect.

## COMPLETED_TASKS_* aggregate

### 2026-04-21 Session 1 — `COMPLETED_TASKS_2026-04-21.md`
50+ items. Notable commits:
- `1e27318` ads.txt populated
- `cbf1875` adsense meta tag
- `91055cc` privacy Advertising & Cookies section
- `b7996ee` signup-409 race fix
- `7c28405` hygiene sweep (STATUS deploy line, archive paths, env.example)
- `6dcde8a` PM_ROLE drift fix
- `7c229f2` Session 1 artifacts + KILL_SWITCH + REMAINING_ITEMS_MAP + schema/107
- `942d467` kill-switch inventory
- `1794af9` admin route compliance sweep
- `7cbc1bc` admin compliance PARKED block
- `cbdea50` (owner) legal pages LLC naming + /about
- `5d4d1ee`, `719fd65`, `67c57d3` various FIX_SESSION_1 + .gitignore mcp
Plus uncommitted UI ships: #19 (error-message security sweep on 14 files), #8, #7, #6, #3, #1-server, #5 iOS, #17, #18, #1-client, F1, iOS parity follow-ups.

### 2026-04-21 Session 2 — `COMPLETED_TASKS_2026-04-21.md` (Session 2)
- FIX_SESSION_1 #20 — ESLint + Prettier + Husky in `web/`. Commits: `761c049`, `6b7868f`, `162ce6d`, `bfff379` (+ `2902626` SHA fix).

### 2026-04-22 Session 1 — `COMPLETED_TASKS_2026-04-22.md`
22 commits (file is 73KB):
- `df7b598` F7 Phase 1 Task 1 editorial-guide.ts
- `c043b2d` M6 kids-waitlist
- `64cd609` 47-item M1-M47 review
- `8dc121b` Stream 2 surgical fixes
- `f26da57` cleanup prep
- `238045b` Stream 1 clustering wiring
- `e4d11e9` Stream 4 docs
- `27145e3` Stream 3 dead casts
- `82bbf19` 5 deferred as-never casts post migration 120
- `2a45c11` E1/E3/E5/E6 owner-decision defaults
- `9aca4e6` STATUS.md refresh
- `2d63621` Phase 4 Task 21 cluster detail
- `d366911` Task 26 observability list
- `a53a260` Task 27 run detail
- `b250695` Task 22 generation modal
- `1f19e42` Tasks 23+24+25 article flow
- `f5be651` Task 29 settings UI
- `1cdbadd` cron downgrade
- `6132de7` Stream A close (F2 + P2-A + Task 16 stash)
- `d49a5aa` Stream B finishing
- `bb48426` .gitignore .vercel
- `b269e17` Phase 5 Newsroom redesign + migration 126
Plus migrations applied live: 112, 114, 116, 118, 120, 122, 124, 126.

### 2026-04-23 Session 1 — no COMPLETED_TASKS file in folder. NEXT_SESSION_HANDOFF.md lists 9 commits:
- `4a59752` (item 1+2: roles DELETE + billing actor)
- `a33a030` (item 3: email-change lockout)
- `7afc0bf` (item 4: iOS quiz integer math)
- `11986e8` (item 5+9: profile/[id] kill-switched)
- `6e13089` (item 6: PasswordCard signInWithPassword)
- `e0cf1af` (item 7: Ad.jsx click_url scheme)
- `ccffa86` (item 8: CSS injection backgroundImage)
- Plus build fix `messages/page.tsx` Suspense wrap (in `4a59752`)

### 2026-04-24 Session 1 — `COMPLETED_TASKS_2026-04-24.md`
- `c012c3f` L1 + maintenance copy
- Tier 2 (12 items): `5823194`, `d470e88`, `710be2b`, `24c1a3d`, `4ebb962`, `edf7791`, `a227e8b`, `baff805`, `955af8e`, `1c45eca`, `93696f9`, `77625e9`. Migrations 150, 151, 152.
- Tier 3 web (11 closed): `86b0787`, `76a13fb`, `4eb37b4`, `9828613`, `6683aee`, `24b6675`, `08929cf`, `d025391`+`35c1035`, `3056bc5`, `34366c7`, `2b05dd4`. STALE: #23, #28, #29, #35, #37, #38. NOT-A-BUG: #32.
- Admin AD1-AD3: `aced725`, `63875c2`, `1d3585f`.
- Migrations applied this session: 146, 148, 150, 151, 152.

### 2026-04-24 Session 2 — `COMPLETED_TASKS_2026-04-24.md`
- Admin AD4-AD7: `fdf02bb`, `3f24c16`, `91ea57e`, `b2e9f56`.
- Kids iOS 11/11: `0295c41` (K1+K10), `f7ef24e` (K2), `cd894a2` (K3), `500dfe2` (K4), `bc08acf` (K6+K7 K7 STALE), `0908817` (K8), `cca0a6e` (K9), `8729899` (K11+K13).
- Billing 12/17: `dc7b69d` (B2+B4+B6+B7), `bbcd785` (B5), `5d95f2b` (B8), `91146cb` (B9+B12), `0ca552e` (B10), `a1b30d7` (B15+B16+B19).
- Cron/lib 11/20: `0493050` (L2), `9d04420` (L3), `8b304e7` (L4), `7a46e71` (L5), `cd5b89a` (L6), `a050234` (L7), `4cc5d56` (L8+L10+L11+L17+L18).
- STALE/NOT-A-BUG: B13, B14, B17, B18, B20, L9, L12 (carry-over), L13, L14, L15, L16, L19, L20.
- Migrations queued for owner: 153, 154, 155, 156.

### 2026-04-25 Session 1 — no COMPLETED_TASKS file. SESSION_LOG_2026-04-25.md + BUGS_FIXED_2026-04-25.md list:
- Commits: `a49b9cd`, `3524cee`, `83e38c0`, `edb80fc`, `94034d8`, `97b7074`, `24d3e90`, `9e1bb7b`. Plus migration 177.

## Within-zone duplicates / overlap

- `KILL_SWITCH_INVENTORY_2026-04-21.md` partially overlaps `APPLE_REVIEW_NAV_CHANGES_REVERT_GUIDE.md` — both list the same 11 launch hides but with different framing (kill-switch entry-by-entry vs. revert procedure with code snippets). Together they're the canonical pair.
- `REMAINING_ITEMS_RELATIONSHIP_MAP_2026-04-21.md` is partially superseded by its own "Session-end status" appendix — multiple launch-critical items closed the same day.
- `ADMIN_ROUTE_COMPLIANCE_AUDIT_2026-04-21.md` (75-route audit) is adjacent to but separate from `ADMIN_VERIFIED_RECONCILE.md` (77-marker bump) — and both are now of historical interest only since the admin compliance sweep is PARKED and the marker is dropped.
- `_facts-archive/FACTS_task14.md` through `_task20.md` are per-task pre-flight ground-truth sheets. Each contains a "MUST-NOT-TOUCH fence" + DB schema + RPC state + file layout. Reference docs for understanding F7 implementation invariants.
- `OWNER_QUESTIONS.md` (decision log) + `NEXT_SESSION_HANDOFF.md` (next-session pickup) + `NEXT_SESSION.md` (deferred bundles) at 2026-04-23 are three different next-session-prep files in the same folder — all useful but somewhat redundant. Tier 0/1 ship details are in NEXT_SESSION_HANDOFF; deferred bundles are in NEXT_SESSION.
- `MASTER_CLEANUP_PLAN.md` (2026-04-22) overlaps with stream-by-stream commit messages — every F1-F12, D1-D11, DOC1-DOC6 has both a planning row in MASTER_CLEANUP_PLAN and an implementation commit elsewhere. Use commits as ground truth.

## Within-zone obvious staleness (older session log overruled by newer)

- **`ADMIN_VERIFIED_RECONCILE.md` (2026-04-23)**: bumped 77 markers — **completely overruled** by §6.4 + §7 of OWNER_QUESTIONS.md the same session. The marker convention itself was retired (memory `feedback_admin_marker_dropped.md`). DO NOT REINTRODUCE.
- **`CONSOLIDATED_SQL.sql` (2026-04-23)**: slot 144 drop 9 orphan tables — **stale before execution**. All 9 already dropped in prod. Migration 144 was never authored on disk. ORPHAN_TABLE_TRIAGE.md represents pre-execution analysis only.
- **`NEW_TREE_STRUCTURE_2026-04-21.md`**: empty scaffold (1 line) — owner cleared after creation. Effectively a dead file.
- **`_superseded/NEXT_SESSION_PROMPT.md`** (2026-04-22): Phase 3 Task 14 onward original handoff — superseded mid-session by the live `NEXT_SESSION_PROMPT.md` (after Newsroom redesign shipped).
- **`REMAINING_ITEMS_RELATIONSHIP_MAP_2026-04-21.md`**: launch-critical cluster section partially superseded same day — see file's own "Session-end status" appendix. File-collision maps still valid for the still-open items.
- **`F7_SMOKE_TEST_RUNBOOK.md`**: pre-condition is deploy ≥ `1cdbadd`; the cron downgrade itself happened post-runbook authoring; runbook references `*/5 * * * *` cron in Phase 5 but notes that the live schedule is daily on Hobby tier.
- **`NEXT_SESSION.md` Bundle 1.1 verify-and-drop sweep for 5 parent tables**: mid-2026-04-23 close. Status by 2026-04-25: not directly executed in subsequent sessions; should be re-checked.
- **`NEXT_SESSION.md` Bundle 1.2 xlsx ↔ DB reconciliation**: still PENDING through 2026-04-25 — flagged in `NEXT_SESSION_PROMPT.md` 04-22 + `NEXT_SESSION.md` 04-23 + likely still open at 04-25.

## Notable claims worth verifying in later waves

1. **77 `@admin-verified` markers stripped + CLAUDE.md updated 2026-04-23 (§7)**. Verify: grep for `@admin-verified` should return 0 hits in `web/src/`. Verify CLAUDE.md "Admin code = highest blast radius" rule is present.
2. **23 inline `react-hooks/rules-of-hooks` disables across 3 files (recap, recap/[id], welcome) — Day 1 Session 2 (commit `6b7868f`)**. Verify: grep for `eslint-disable-next-line react-hooks/rules-of-hooks -- launch-hide pattern` should still return 23 hits. **Cross-ref**: Follow-up #6 (move `if (LAUNCH_HIDE) return null` AFTER hooks) was queued but never executed; verify still queued in MASTER_TRIAGE.
3. **Migrations applied live**: 106, 107, 112, 114, 116, 118, 120, 122, 124, 126, 142, 144 (NEVER, confirmed already-dropped state), 146, 148, 150, 151, 152, 153, 154, 155, 156, 177. Verify against `supabase_migrations.schema_migrations` + `pg_proc` + DDL state.
4. **Migration 144 was never authored**. Verify: should NOT exist in `schema/`. The 9 orphan tables (access_code_uses, behavioral_anomalies, campaign_recipients, cohort_members, consent_records, device_profile_bindings, expert_discussion_votes, sponsored_quizzes, translations) should not exist in `pg_tables`. `search_history` should still exist (KEEP-DEFERRED for `Future Projects/views/web_search.md`).
5. **Newsroom redesign migration 126**: 3 new perms (`admin.pipeline.clusters.manage`, `.presets.manage`, `.categories.manage`) wired but **xlsx reconcile pending**. Verify: keys exist in DB; check whether `permissions.xlsx` has been updated to match. If not, next `import-permissions.js --apply` would drop the wirings.
6. **Pipeline-cleanup cron schedule is `0 6 * * *` (daily at 6 AM UTC), NOT `*/5 * * * *`**. Verify in `web/vercel.json`. Pro upgrade pending unblocks the per-minute schedule.
7. **`/profile/[id]` and `/u/[username]` are kill-switched behind `<UnderConstruction>`** (commit `11986e8` 2026-04-23). Verify both routes render `<UnderConstruction>` for anon users. Revert: `PUBLIC_PROFILE_ENABLED = true` in `/u/[username]/page.tsx`.
8. **AI mentions removed from privacy + terms pages 2026-04-21** (Change 11 in APPLE_REVIEW_NAV_CHANGES_REVERT_GUIDE). FTC-disclosure follow-up flagged but state at end of zone unclear. Verify current `/privacy` and `/terms` content for AI disclosure.
9. **`/help` route MUST stay reachable** (Apple Support URL requirement). Verify it's not 404/redirect/null-return. Footer link is commented out (intentional).
10. **`/preview-as-admin` route was reverted (commit `edb80fc` 2026-04-25)** — verify it doesn't exist in `web/src/app/`. Live bypass mechanism is `/preview?token=PROD_BYPASS_TOKEN` setting `vp_preview=ok` cookie.
11. **Schema/177 grants SELECT on `ai_models`, `ai_prompt_overrides`, `kid_articles`, `kid_sources` to `authenticated`+`service_role`**. Verify via `pg_class.relacl` or `information_schema.role_table_grants`. Otherwise admin Generate button silently fails.
12. **8 routes had raw `error.message` leaks fixed via `safeErrorResponse` (2026-04-25)**: `web/src/app/api/admin/users/[id]/role-set/route.js` (3 spots), `web/src/app/api/admin/permission-sets/[id]/route.js` (1), `web/src/app/api/admin/subscriptions/[id]/manual-sync/route.js` (6), `web/src/app/api/support/route.js` (1). Verify still routed through helper.
13. **`avatars` Supabase Storage bucket creation pending** — owner action item carried Session 1 → Session 2 → still pending end of zone (per Session 2 closing note). Until created, avatar uploads show "not configured yet" toast (graceful fallback in commit `1c45eca`).
14. **Admin compliance sweep PARKED** with 5 trigger events. The recordAdminAction helper bug at `web/src/lib/adminMutation.ts:63-80` (omits `p_ip` + `p_user_agent`) is part of the parked work — verify whether it's been touched in any subsequent session.
15. **F7 SHIPPED block coverage in MASTER_TRIAGE_2026-04-23.md**: Tier 0/1 9 items (2026-04-23), Tier 2 12 items + Tier 3 web 11 + Admin AD1-AD7 + Kids K1-K11+K13 + Billing 12 of 17 + Cron/lib 11 of 20 (2026-04-24). Cross-check against MASTER_TRIAGE for matching SHIPPED blocks per item ID.
16. **Reviewer-approval launch model**: drops 00-L quiz content + F2/F3 + 00-M from launch-blocking. Verify FIX_SESSION_1 (and now MASTER_TRIAGE) reflects 00-L as N/A (articles being wiped pre-launch per OWNER_QUESTIONS §4.1).
17. **8 owner-locked decisions 2026-04-25** in user-memory `project_locked_decisions_2026-04-25.md` (GG.1, T.3, AA.1, KK.4, C.26, W.5, M.8, AA.3) — referenced in CLAUDE memory but the SESSION_LOG_2026-04-25 doesn't enumerate them. Wave 2 should locate these decisions in MASTER_TRIAGE or owner-memory.
18. **Tier 3 STALE markers** (#23, #28, #29, #35, #37, #38): each needs its own SHIPPED-or-STALE block in MASTER_TRIAGE. Same for Day-4 Session-2 STALE markers (B13, B14, B17, B18, B20, L9, L12, L13, L14, L15, L16, L19, L20, K7).
19. **Bug-hunt session (Day 5) discovered 7 real bugs**: BrowseLanding non-tappable, ExpertSessionsView non-tappable, /api/admin/promo 500-on-duplicate, /api/users/[id]/block 500-on-missing, /browse Latest empty grid, iOS Kids `UIRequiresFullScreen` missing, /admin/newsroom Generate button broken. All FIXED with regression tests where feasible.
20. **`Future Projects/verity-living-edition.html`**: untracked at 2026-04-22 session start; `.gitignore` entry added in commit `9aca4e6` for `Future Projects/*.html` scratch mockups. Verify still ignored.

