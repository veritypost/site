# Zone Z10: Misc docs

## Summary

Zone Z10 covers 11 files spanning four buckets: (1) historical "completed" build logs in `Completed Projects/` (3 files), (2) two large strategic-but-stale specs in `Unconfirmed Projects/` (product roadmap + UI improvements), (3) an ad-mockup React component sitting in a planning folder, (4) a pending reorganization plan in `99.Organized Folder/Proposed Tree`, and (5) repo-root config files (.gitignore, .git-blame-ignore-revs, .mcp.json, .env.supabase-readonly) plus an essentially-empty README.md and two symlinks pointing into `Reference/`. The dominant finding is staleness — the `Unconfirmed Projects/` files reference the pre-restructure `site/` path (now `web/`), the v1→v2 plan that already shipped, the retired `WORKING.md`/`DONE.md`/`docs/` layout, and 9-plan billing that contradicts current 5-tier reality. The `Completed Projects/` folder is consistent with itself but also references the old `site/` path. The "Proposed Tree" doc (2026-04-25) is the single newest, most action-relevant artifact in the zone — it proposes a thorough numeric-prefixed reorganization of `Current Projects/` and is accurate against current state. README.md is effectively a deploy-nudge stub, not real onboarding. .gitignore explicitly ignores `.mcp.json` (which IS committed despite being listed) — minor inconsistency. .env.supabase-readonly contains 3 readonly Supabase MCP credentials; correctly gitignored via `.env.*` rule.

## Files

### /Users/veritypost/Desktop/verity-post/Completed Projects/FINAL_WIRING_LOG.md
- **Purpose**: Running build log of the 2026-04-15 "Final Wiring + Self-Review Pass" — Phase 1 (iOS wiring), Phase 2 (web loose ends), Phase 3-4 self-review.
- **Topics**: iOS comment voting, leaderboard nav links, home recap card + ads, @mention autocomplete, StoreKit v2 product IDs, Kids views, Family dashboard, deep links, profile Activity tab schema fix, profile Achievements DB wiring, kids nav chrome (skipped), quiz pool size gate, kids-story-manager v2 quiz save, iOS copy audit, web v1 artifact scan, iOS build (BLOCKED on xcode-select).
- **Key claims**: 7 new iOS files, 13 modified iOS files, 3 modified web files, 8 bugs found and fixed; iOS xcodebuild was blocked at the time of writing pending `sudo xcode-select -s` from owner; universal links flagged as needing `apple-app-site-association` server config.
- **Cross-refs**: References `site/src/...` paths throughout (the pre-2026-04-19 layout — should be `web/src/...` in current code). References `VerityPost/VerityPost/...` Swift paths which are still valid.
- **Status**: Stale path references (`site/` not `web/`); content is historical/archival not actionable.
- **Concerns**: Living in `Completed Projects/` is appropriate; shouldn't be referenced as "do this" anywhere. No dates aside from the 2026-04-15 start.

### /Users/veritypost/Desktop/verity-post/Completed Projects/CATEGORY_FIXES.md
- **Purpose**: Running log of a 10-category bug-hunt pass covering PostgREST embed disambiguation, copy/emoji removal, loading/error/empty states, tier gates, UI consistency, dead code, API routes, DB queries, security scan, realtime subs.
- **Topics**: 6 PostgREST `!fk_name(...)` disambiguations; 50+ emoji/symbol removals (including HTML entity escapees in a second sweep); 7 v1 tier-name fixes ("Premium" → v2 names); ~30 "Story" → "Article" renames; 3 state-bug fixes; tier-gate Bug 1 (Ask an Expert misgated); migration `034_bugfix_ask_expert_tier.sql`; .single() → .maybeSingle() (8 sites); .limit(500) on 4 admin routes; sanitizeIlikeTerm() PostgREST filter injection fix; kid PIN argument-order bug.
- **Key claims**: 50+ bugs fixed across 10 categories; 1 SQL migration written (`034_bugfix_ask_expert_tier.sql`); files deleted: `site/src/app/api/email/send-digest/route.js`. v2LiveGuard added to 3 high-traffic write routes.
- **Cross-refs**: All paths use the legacy `site/src/...` prefix; references migration files like `014_phase6_expert_helpers.sql` and `023_phase15_mute_checks.sql` (early-numbered migrations from the v2 build).
- **Status**: Historical pass log; stale path prefix; content is archival.
- **Concerns**: No date in the doc itself; chronologically pre-2026-04-19 restructure based on `site/` references.

### /Users/veritypost/Desktop/verity-post/Completed Projects/MIGRATION_PAGE_MAP.md
- **Purpose**: Per-phase v1→v2 migration page-and-code map (Phase 0–8) — work checklist, not spec.
- **Topics**: Phase 0 source-of-truth lockdown, Phase 1 schema foundation (108 tables), Phase 2 auth+verification, Phase 3 permission rewiring, Phase 4 pricing/billing, Phase 5 (a-h sub-phases for quiz, context pinning, expert queue, bookmarks, supervisors, weekly recaps, family, ads), Phase 6 trust+safety, Phase 7 cutover, Phase 8 cleanup. Lists "files likely untouched" and "files spanning multiple phases (hot paths)".
- **Key claims**: 108 tables in v2; references `reset_and_rebuild_v2.sql` as canonical (still true), names `permission_sets`, `role_permission_sets`, `plan_permission_sets` (still in use). Phase 8 "DROP TABLE reactions, community_notes, community_note_votes" is presumably done; CLAUDE.md confirms reactions, community_notes are dead.
- **Cross-refs**: All paths in `site/src/...` legacy form. References `Verity_Post_Schema_Guide.xlsx`, `PROFILE_FULL_FLOW.md`, `permissionKeys.js`, `kidSession.js`, `rlsErrorHandler.js`, `permLocked` helper, `user_has_feature` RPC — most of which are likely deleted/superseded post-migration.
- **Status**: Historical migration plan; v2 cutover shipped per memory; file is reference-only.
- **Concerns**: Stale path prefix; if anyone pulled this up looking for current page locations they'd be misled to a non-existent `site/` tree.

### /Users/veritypost/Desktop/verity-post/Unconfirmed Projects/product-roadmap.md
- **Purpose**: Self-described "authoritative multi-product plan" laying out P1 (adult web launch), P2 (adult iOS), P3 (kids iOS + kids web redirect), P4 (admin/permissions/schema evolution), with decisions log, pending decisions, risk register, timeline, env-var inventory.
- **Topics**: 4 surfaces (adult web, adult iOS, kids iOS, kids web redirect) all on one Supabase project; launch sequencing (web → iOS → kids); HIBP toggle, secret rotation, Sentry DSN, NEXT_PUBLIC_SITE_URL, Resend domain, Stripe webhook; LB-006/010/013/016/034 bug list; DUNS application, App Store Connect setup, 8 IAP product IDs, AASA, APNs; kids pairing flow design (`kid_pair_codes` table, `POST /api/kids/generate-pair-code`, `POST /api/kids/pair`); Swift Package extraction (`packages/ios-core/`); deep-link strategy (Option X subdomain vs Option Y path); 11 closed decisions in §10.1; 928 active permissions; env-var inventory across phases.
- **Key claims (verifying against memory + CLAUDE.md)**:
  - "Adult iOS DUNS-blocked" — superseded; memory says owner now has Apple Dev account (per `project_apple_console_walkthrough_pending.md`).
  - "9 plans" — superseded; canonical is now 4 paid tiers (`verity`, `verity_pro`, `verity_family`, `verity_family_xl`) plus free.
  - "928 active permissions" — likely changed; current permission system tracked via `permissions.xlsx` + `scripts/import-permissions.js`.
  - References `site/`, `docs/`, `WORKING.md`, `STATUS.md` (root not symlink), `DONE.md`, `Archived/` paths — repo has since restructured to `web/`, `Reference/STATUS.md` (with root symlink), `Current Projects/MASTER_TRIAGE_2026-04-23.md` (replaces WORKING/DONE/TASKS).
  - References `permissions.xlsx` outside the repo at `/Users/veritypost/Desktop/verity post/` (note space) — confirmed correct per CLAUDE.md.
  - References `docs/runbooks/CUTOVER.md`, `docs/runbooks/ROTATE_SECRETS.md`, `docs/planning/FUTURE_DEDICATED_KIDS_APP.md` — directory `docs/` does not exist in current repo top-level.
  - Migrations 092/093 unconfirmed-applied claim from §5.3 B1 — needs verification.
  - Apple Root CA G3 "already done 2026-04-17" claim worth verifying against `web/src/lib/certs/`.
- **Cross-refs**: STATUS.md, WORKING.md, docs/runbooks/CUTOVER.md, docs/runbooks/ROTATE_SECRETS.md, docs/planning/FUTURE_DEDICATED_KIDS_APP.md, Archived/2026-04-19-prelaunch-sprint/* — almost all of these paths predate the restructure.
- **Status**: STALE — date 2026-04-19 (6 days old in repo time), in `Unconfirmed Projects/` (folder name itself signals "not blessed"). Whole structure is pre-restructure plus pre-MASTER_TRIAGE-canonicalization.
- **Concerns**: Big risk if a future agent reads this without context — has the same authoritative tone as live docs but is materially out of date. Multiple decisions in §10.1 conflict with newer memory locked-decisions (`project_locked_decisions_2026-04-25.md`). The decisions log says "Kids iOS architecture: Option B" + "Kids iOS deep-link: kids.veritypost.com subdomain" — both worth verifying are still the chosen direction. The §11 "pending decisions" list overlaps and contradicts current `MASTER_TRIAGE_2026-04-23.md` priorities.

### /Users/veritypost/Desktop/verity-post/Unconfirmed Projects/UI_IMPROVEMENTS.md
- **Purpose**: Compiled UI audit (4 independent auditors — Lead + 3 peers) covering web adult, web admin, kids web, iOS, at every breakpoint 320–1920px. Top-20 priority list, per-surface findings, cross-cutting findings, copy consistency matrix, empty-state rewrite catalog, error-message rewrite catalog, design principles, implementation roadmap (Phase A/B/C), iOS runtime fixes.
- **Topics**: iOS Dynamic Type / accessibility / forced light mode (4/4 critical), Sign in / Sign Up / Log In casing chaos, per-page `<title>`, double/triple headers, story regwall modal a11y, /login error tone, touch-target sub-44pt sweep, iOS TextTabBar, /messages free-user silent redirect, marketing/legal triple-header, inline `const C` palette duplication, font-size soup (16 web sizes + 5 more iOS), container-width sprawl (20 distinct), bottom-nav reorder (Home/Browse/Bookmarks/Notifications/Profile), action-row crowding, three Breaking treatments, 80%-informational empty states, "Failed to X. Please try again." across 12+ sites, radius/avatar/shadow sprawl, 7-step type scale (11/13/15/17/20/24/32), 3 weights (400/600/700), spacing scale 4/8/12/16/24/32/48/64, radius scale 4/8/12/20/999, avatar 32/48/80, shadow sm/md/lg, container 480/720/960. Rewrite catalogs for empty states + error messages. iOS runtime fixes: `StoreManager.transaction.finish()` skip on sync failure, MessagesView realtime never torn down, NotificationsSettingsView non-atomic metadata write, AlertsView Manage tab dead UI, AuthViewModel deep-link fragment parsing, PushRegistration.lastUserId logout clear, SettingsService TTL on parse failure, post-launch refactor candidates.
- **Key claims**: 4-auditor agreement (4/4, 3/4, 2/4, 1/4 splits documented); 7 items at 4/4, 12 at 3/4, ~28 at 2/4; defensible 1/4 solo items kept. 4 named iOS runtime bugs ("definitely fix"). Implementation roadmap calibrated to Phase A 1-2 days, Phase B 3-5 days.
- **Cross-refs**: References `web/` paths (good — post-restructure aware) AND `site/...` in some legacy contexts (mixed). References `@/lib/tokens`, `VP.*` iOS tokens, `globals.css`, `NavWrapper.js`, `LockedTab`, `StoryDetailView.swift`, `MessagesView.swift`, `NotificationsSettingsView`, `AlertsView`, `PushRegistration`, `SettingsService`, `AuthViewModel`, `StoreManager.swift:168-190`, `MessagesView.swift:120-122 + 571-577 + 735-741`. Also references `/admin/notes/`, `/admin/credibility/` which per memory are deleted.
- **Status**: STALE — 2026-04-19 date; in `Unconfirmed Projects/`. Many of the "Won't ship without these" Phase A items would be tracked in MASTER_TRIAGE_2026-04-23 if still open. Some likely shipped (Sign in casing, story regwall, double-header sweep) — needs cross-reference against MASTER_TRIAGE SHIPPED entries.
- **Concerns**: This doc has real, specific iOS runtime-bug findings (StoreManager finish() skip, MessagesView channel teardown) that should be verified shipped or carried forward into MASTER_TRIAGE. The mixed `site/` + `web/` path references show partial transition. The principle codifications (type scale, weights, radius, avatar, container widths) overlap with what design-system PRs would have done — verify whether `web/src/lib/tokens` exists today.

### /Users/veritypost/Desktop/verity-post/Current Projects/ad-mockups/VerityAdMockups.jsx
- **Purpose**: Standalone React component file (.jsx) defining 6 Facebook-style ad mockups for Verity marketing.
- **Topics**: VerityAds default export rendering Ad1 (kid-focused, "Real news. For real kids."), Ad2 (Contrast vs clickbait), Ad3 (Quiet typography), Ad4 (phone mockup with feed), Ad5 (Family — adult+kid view), Ad6 (Bold typography "No spin. No bait. Just news."); shared design tokens (NEUTRAL palette, KID_TEAL, KID_VIOLET, ACCENT_RED, ACCENT_YELLOW, SF Pro Rounded + system fonts); FacebookAdFrame wrapper, VerityCardMini, KidCardMini, ClickbaitCardMini sub-components.
- **Key claims**: 6 ads to test with parents; recommended testing strategy ("Run two or three at once with a small budget. Let the click-through rate tell you which message works."); $5/day each for a week.
- **Cross-refs**: None — fully self-contained; uses inline design tokens, not the project's `@/lib/tokens`. Contains emoji characters in Ad6 ("👍 Like", "💬 Comment", "↗ Share") which are part of the ad mockup chrome (Facebook reaction buttons), not adult-product copy — but if this file ever ships *into* the adult product surface, the no-emoji rule would bite.
- **Status**: Active mockup; unclear whether intended to become real ad creative or remain reference. Not deployed code (no import path into web/ or VerityPost/ trees).
- **Concerns**: Lives in `Current Projects/ad-mockups/` but is a `.jsx` file — sits in a planning folder, not a code folder. Per "Proposed Tree" doc, a recommended move is to `90-ASSETS/ad-mockups/` or to `web/src/components/__mockups__/`. The Facebook reactions row uses emoji characters — defensible for a *mockup of Facebook* but not okay if surfaced in product.

### /Users/veritypost/Desktop/verity-post/99.Organized Folder/Proposed Tree
- **Purpose**: Owner-side reorganization plan for `Current Projects/` — audit + proposed tree + concrete renames/moves + checklist + effort estimate + open questions.
- **Topics**: Section 1 inventories 17 root entries + ~100 audit subfiles in `Audit_2026-04-24/`. Section 2 lists 8 root issues (mixed file types, 4-doc F7 redundancy, F1-F4 launch-parked sitting next to live work, 90% raw audit output, 2 extensionless 190KB+ files, code-asset misshelving, no README/index, audit overlap with MASTER_TRIAGE). Section 3 proposes a numeric-prefixed tree: `00-LIVE/`, `10-LAUNCH-PACKETS/`, `20-FEATURES/{active,parked-launch,F7-pipeline}`, `30-AUDITS/2026-04-24/{00-syntheses,10-recon,20-round2-lenses,30-classifications,90-raw-waves,_process}`, `90-ASSETS/`. Section 4 gives 10 concrete ordered moves. Section 5 says delete nothing, archive only F7-superseded eventually, keep raw waves. Section 6 best-practices checklist. Section 7 effort: ~1 hour total. Section 8 four open questions.
- **Key claims (verifying against current state)**:
  - "MASTER_TRIAGE_2026-04-23.md = canonical, 72 SHIPPED + 15 STALE" — claims to verify against actual file state.
  - "Audit_2026-04-24 has 100+ files" — claims to verify.
  - "F7-DECISIONS-LOCKED.md explicitly says it supersedes §5 of F7-PM-LAUNCH-PROMPT.md" — needs verification by reading the F7 docs (Z2/Z3 zones).
  - "Two extensionless 190KB+ files: review external audit, review external audit-review" — direct dirent claim, easy to verify.
  - "ad-mockups/ is one file: VerityAdMockups.jsx (25KB)" — verified in this audit (file exists, is the only one in folder).
  - Path references like `Current Projects/MASTER_TRIAGE_2026-04-23.md` and `Current Projects/Audit_2026-04-24/` are accurate against current state.
- **Cross-refs**: References memory `feedback_kill_switched_work_is_prelaunch_parked.md` (correct — F1-F4 are launch-parked); `Reference/CLAUDE.md`, `Reference/STATUS.md`, `reference_status_doc.md` memory; `Archived/` at repo root.
- **Status**: ACTIVE PLAN, dated 2026-04-25 (today). Most up-to-date doc in this entire zone.
- **Concerns**: This is a proposal not yet executed. Open questions §8 pending owner answers. Filename has no `.md` extension which is itself one of the issues the plan flags about other files — minor irony. If the plan executes, every CLAUDE.md path reference to `Current Projects/MASTER_TRIAGE_2026-04-23.md`, `Current Projects/Audit_2026-04-24/...`, etc. needs updating.

### /Users/veritypost/Desktop/verity-post/README.md
- **Purpose**: Repo root README.
- **Topics**: One HTML comment.
- **Key claims**: `<!-- deploy nudge 1776896446 -->` — a deploy-nudge marker (used to force Vercel rebuilds). No actual readme content.
- **Cross-refs**: None.
- **Status**: Effectively empty; serves as a deploy-trigger pad rather than onboarding.
- **Concerns**: Public GitHub viewer would see a blank repo. Not blocking — repo isn't public yet — but a real README pointing into `CLAUDE.md` / `Reference/STATUS.md` would help any new collaborator.

### /Users/veritypost/Desktop/verity-post/.git-blame-ignore-revs
- **Purpose**: Tells Git (and GitHub) to skip mechanical formatting commits when computing `git blame` history.
- **Topics**: One ignored SHA: `162ce6dcabe042ac8f2cd9b5ce0cfcf4e96d7105` (FIX_SESSION_1 #20 autofix sweep, 2026-04-21).
- **Key claims**: Local enable via `git config blame.ignoreRevsFile .git-blame-ignore-revs`; GitHub enable via "Ignore revisions in blame view by default" repo setting. Per CLAUDE.md, FIX_SESSION_1 is retired (absorbed into MASTER_TRIAGE) — the SHA reference is historical but valid.
- **Cross-refs**: References FIX_SESSION_1 #20 (the prettier/eslint config rollout).
- **Status**: Active configuration file. Single ignored SHA.
- **Concerns**: None — this is correctly configured infrastructure.

### /Users/veritypost/Desktop/verity-post/.gitignore
- **Purpose**: Root gitignore for the whole repo tree.
- **Topics**: .env* secrets (with .env.example whitelist); Node/Next.js (node_modules, .next, out, .turbo, .vercel, dist, build, coverage, *.tsbuildinfo, next-env.d.ts); package-manager artifacts (.npm, .yarn, .pnpm-store, .pnp.*); logs; **Claude Code session data: `.claude/` AND `.mcp.json`**; macOS noise; IDE; iOS Xcode (DerivedData, xcuserdata, Pods, Carthage, Package.resolved, *.ipa, *.dSYM, generated `VerityPost/VerityPost.xcodeproj/`, `VerityPost/build/`); iOS Secrets.xcconfig; `Future Projects/*.html` mockups; supabase local state; test output (playwright-report, test-results, .nyc_output, web/tests/e2e/.auth); cert files (*.pem, *.p8, *.p12, *.key, *.cer, *.mobileprovision); .cache, tmp, temp.
- **Key claims**: `site/` paths still listed alongside `web/` — line 12-13 has `site/.env` patterns. `.mcp.json` is explicitly gitignored at line 57.
- **Cross-refs**: References `site/.env*`, `web/`, `VerityPost/`, `scripts/`, `supabase/`, `Future Projects/` directories.
- **Status**: Active. `site/` references are legacy and should be cleaned (the directory no longer exists per CLAUDE.md).
- **Concerns**:
  - **Line 12-13** (`site/.env`, `site/.env.*`) reference `site/` which the 2026-04-19 restructure renamed to `web/` — dead pattern, prune-able.
  - **Line 57** ignores `.mcp.json`, but `.mcp.json` IS present in the repo at root (in this audit). If it was ever committed, the gitignore line is post-hoc; if it's untracked, status would show it. Either way: minor inconsistency between the file's existence and the ignore rule.
  - The `Future Projects/*.html` rule is interesting — implies `Future Projects/` is in the repo but its `*.html` mockups are not version-controlled. Not visible from Z10's discovery scope (Z10 only covers `Completed Projects/`, `Unconfirmed Projects/`, `Current Projects/ad-mockups/`, `99.Organized Folder/`).

### /Users/veritypost/Desktop/verity-post/.mcp.json
- **Purpose**: Claude Code MCP server configuration.
- **Topics**: One MCP server: `supabase`, type `stdio`, runs via `sh -c 'set -a; . /Users/veritypost/Desktop/verity-post/.env.supabase-readonly; set +a; exec npx -y @supabase/mcp-server-supabase@latest --read-only --project-ref=fyiwulqphgmoqullmrfn'`.
- **Key claims**: Uses `--read-only` mode (writes blocked at MCP level); points at project `fyiwulqphgmoqullmrfn` (matches CLAUDE.md). Loads credentials from `.env.supabase-readonly` (see below). Absolute path tied to owner's machine (`/Users/veritypost/...`).
- **Cross-refs**: Project-ref `fyiwulqphgmoqullmrfn` matches CLAUDE.md and memory. The MCP server name `supabase` matches the deferred-tools list (`mcp__supabase__*`).
- **Status**: Active config.
- **Concerns**:
  - Per `.gitignore` line 57, `.mcp.json` is gitignored — but the file is at the repo root in plain view. If it was committed prior to the gitignore rule being added (or `git add -f`'d), it's tracked despite the rule. If untracked, fine. (Z10 scope doesn't include git-tracked-vs-not check, but `git status` from session start showed only `99.Organized Folder/` as untracked — so `.mcp.json` is tracked.) The file does not contain secrets directly (those live in `.env.supabase-readonly`), so committing it is low-risk.
  - The hardcoded `/Users/veritypost/...` path means this config doesn't work on a second machine without edit — minor portability nit.

### /Users/veritypost/Desktop/verity-post/.env.supabase-readonly
- **Purpose**: Environment-variable file holding Supabase MCP read-only credentials (sourced by `.mcp.json` at MCP server launch).
- **Topics**: Contains 3 environment variables (verified via `grep '=' | wc -l` = 3): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_READONLY_DB_URL`. File is 33 lines total (most are likely comments/blank lines), UTF-8.
- **Key claims**: Per filename + context, holds read-only Supabase access credentials so MCP queries can't mutate prod.
- **Cross-refs**: Loaded by `.mcp.json`. Caught by `.gitignore` `.env.*` rule.
- **Status**: Active secrets file.
- **Concerns**: Properly gitignored. Not printing values per audit instructions. Owner should ensure rotation tracked (per `product-roadmap.md` §9.2 the rotation cadence is 90d for Supabase service role).

## Symlinks at root
- CLAUDE.md → Reference/CLAUDE.md
- STATUS.md → Reference/STATUS.md

Both confirmed via `ls -la` at session start (`lrwxr-xr-x ... CLAUDE.md -> Reference/CLAUDE.md` and `lrwxr-xr-x ... STATUS.md -> Reference/STATUS.md`). Z1 is reading their targets in `Reference/`.

## "Proposed Tree" analysis

### What it proposes
1. **Add `Current Projects/README.md`** as a single-screen index pointing to canonical/live/frozen docs.
2. **Numeric-prefixed top-level inside `Current Projects/`**: `00-LIVE/` (active trackers + UI redesign + PM punchlist + owner TODO), `10-LAUNCH-PACKETS/` (App Store metadata), `20-FEATURES/{active,parked-launch,F7-pipeline/{_superseded}}/` (segregates F5/F6 active from F1-F4 parked, colocates all F7 docs with the superseded ones in a `_superseded/` subfolder), `30-AUDITS/2026-04-24/` (renamed from `Audit_2026-04-24/`, with 6 subfolders: `00-syntheses/`, `10-recon/`, `20-round2-lenses/`, `30-classifications/`, `90-raw-waves/`, `_process/`), `90-ASSETS/` (the JSX mockup).
3. **Rename two extensionless files**: `Audit_2026-04-24/review external audit` → `REVIEW_external_audit.md`; same for `-review`.
4. **Add 3 new READMEs**: root, F7-pipeline/, 30-AUDITS/2026-04-24/.
5. **Update CLAUDE.md / STATUS.md / memory references** to the new paths (5 + 2-3 + 1 = ~8 references total).
6. **Move `ad-mockups/`** to `90-ASSETS/ad-mockups/` (or alternate: into `web/src/components/__mockups__/`).
7. **One commit** via `git mv`. ~1 hour effort, fully reversible.

### Conflicts vs current state
- **Path references in CLAUDE.md**: every `Current Projects/MASTER_TRIAGE_2026-04-23.md`, `Current Projects/Audit_2026-04-24/...`, `Current Projects/PRELAUNCH_UI_CHANGE.md`, `Current Projects/PM_PUNCHLIST_2026-04-24.md` reference shifts. CLAUDE.md is the single most-cited doc in the repo — update care needed.
- **Memory reference**: `reference_status_doc.md` memory has 1 path. Per CLAUDE.md instructions, memory is checked into Claude config not the repo, so updating it requires owner attention.
- **Session log links**: explicit "leave; sessions are historical" — accepted in proposal. Good.
- **`90-raw-waves/` keeps ~72 files**: zero deletion, audit raw waves preserved as source-of-truth — aligned with project preference to keep history.
- **Open questions §8** flag 4 owner-decision points still pending: (1) rename `Audit_2026-04-24/` or just clean inside, (2) move `ad-mockups/` to `web/` or `90-ASSETS/`, (3) promote `00-LIVE/` to repo root or keep nested, (4) F7 superseded docs to `_superseded/` or fully `Archived/`.
- **Filename inconsistency**: the proposal doc itself is at `99.Organized Folder/Proposed Tree` — has no `.md` extension and uses `99.` (period not dash) which doesn't match the proposal's own `90-ASSETS/` (dash) convention. Minor self-inconsistency.

## Within-zone duplicates / overlap
- **`Completed Projects/FINAL_WIRING_LOG.md` and `Completed Projects/CATEGORY_FIXES.md`** both reference Phase 2 web copy fixes (emoji removal, "Story" → "Article", v1 tier → v2 tier). FINAL_WIRING covers it at high level; CATEGORY_FIXES enumerates the 50+ specific sites. Not duplicated content — different abstraction level. Could be cross-linked at the head of each.
- **`Unconfirmed Projects/product-roadmap.md` and `Unconfirmed Projects/UI_IMPROVEMENTS.md`** both touch on iOS Dynamic Type, accessibility labels, force-light-mode, touch targets. Roadmap mentions them in §6.7 "post-launch iOS work". UI_IMPROVEMENTS is the deep audit. Not redundant — different purposes.
- **`product-roadmap.md` §10.1 decisions log** overlaps with memory `project_locked_decisions_2026-04-25.md` (per CLAUDE.md, 8 owner-locked decisions exist there). Need to verify the two don't contradict — the roadmap is older (2026-04-19) and may have been superseded.

## Within-zone obvious staleness
1. **`Unconfirmed Projects/product-roadmap.md`** — most stale. Uses `site/`, `WORKING.md`, `STATUS.md` (root), `DONE.md`, `docs/` paths. References 9-plan billing (now 5 tiers). DUNS-blocked claim contradicts memory's "owner has Apple Dev account". 928 permissions claim worth checking. References `Archived/2026-04-19-prelaunch-sprint/` paths which may no longer exist post-restructure.
2. **`Unconfirmed Projects/UI_IMPROVEMENTS.md`** — partially stale. Some Phase A items likely shipped (Sign in casing, story regwall, double headers); others likely still open. Mixed `site/` + `web/` path references.
3. **`Completed Projects/FINAL_WIRING_LOG.md`** — references `site/` paths but appropriately archived. Stale only in the sense that someone reading it without context might look for files that no longer exist at those paths.
4. **`Completed Projects/CATEGORY_FIXES.md`** — same `site/` issue.
5. **`Completed Projects/MIGRATION_PAGE_MAP.md`** — same `site/` issue plus references `Verity_Post_Schema_Guide.xlsx`, `PROFILE_FULL_FLOW.md`, `permLocked` helper, `user_has_feature` RPC — most likely deleted/superseded post-v2 cutover.
6. **`.gitignore`** — `site/.env*` lines (12-13) reference the deleted `site/` directory. Dead pattern.
7. **`README.md`** — empty save for a deploy-nudge HTML comment. Stale in that it never had real content.

## Notable claims worth verifying in later waves
1. **product-roadmap.md §5.3 B1**: "Migrations 092/093 not committed to schema/ — disaster recovery replay broken without them." Wave that touches `schema/` should verify whether `schema/092_*.sql` and `schema/093_*.sql` exist now. Per CLAUDE.md, `schema/100_backfill_admin_rank_rpcs_*.sql` exists, so numbering passed 092/093 — verify content actually shipped.
2. **product-roadmap.md §6.2 A2**: "Apple Root CA G3 already done 2026-04-17, file at `web/src/lib/certs/apple-root-ca-g3.der` OR env `APPLE_ROOT_CA_DER_BASE64`". Wave reading `web/src/lib/` should confirm.
3. **product-roadmap.md §8.2**: "928 active permissions today + 10 sets". Wave touching DB or `scripts/import-permissions.js` should confirm current count.
4. **UI_IMPROVEMENTS.md iOS runtime fixes (definitely fix #1-#4)**: claims real bugs in `StoreManager.swift:168-190` (transaction.finish skip), `MessagesView.swift:120-122 + 571-577 + 735-741` (channel teardown), `SettingsView.swift:904-938` (NotificationsSettingsView non-atomic write), `AlertsView.swift:232-252` (Manage tab dead UI). Wave reading `VerityPost/VerityPost/` should verify whether these are fixed in current code or still open. If still open, they should be in MASTER_TRIAGE.
5. **CATEGORY_FIXES.md Bug #2 in Category 9**: "Kid PIN set/reset argument-order bug at `api/kids/set-pin/route.js:36` and `api/kids/reset-pin/route.js:29`". Wave on `web/src/app/api/kids/` should confirm `assertKidOwnership(kid_profile_id, supabase)` arg order is correct.
6. **CATEGORY_FIXES.md Bug #1 in Category 9**: PostgREST filter injection at `/api/search` fixed via `sanitizeIlikeTerm()`. Wave reading search route should verify the helper is present.
7. **product-roadmap.md §5.4 C3**: "Embedded Checkout owner preference, ship before launch". Wave touching `/api/stripe/checkout/` should confirm `ui_mode: 'embedded'` is in the session create.
8. **product-roadmap.md §4.1 launch sequence**: Adult web → Adult iOS → Kids iOS. Per memory the launch model is now "AdSense + Apple review gates" not the broader sequence — the gates have shifted. Verify against `Reference/STATUS.md`.
9. **Proposed Tree §1**: claims `Audit_2026-04-24/` has 100+ files including ~36 Wave A + ~36 Wave B + 8 Recon + 10 Round2 + various synthesis files. Wave with that zone (Z3?) should verify the precise file count.
10. **Proposed Tree §1**: claims two extensionless files `review external audit` (190KB) and `review external audit-review` (22KB). Trivial to verify with `ls -la`.
11. **VerityAdMockups.jsx**: contains `👍 Like / 💬 Comment / ↗ Share` emoji line in the FacebookAdFrame footer. If this file is ever imported into the live web tree, the no-emoji rule (CLAUDE.md "Brand / UX rules") would flag it. Currently isolated to `Current Projects/ad-mockups/` so not a violation, but flag-worthy if the file moves.
12. **`.mcp.json`**: the file is committed to the repo despite `.gitignore` line 57 telling git to ignore it. Either an explicit `git add -f` happened or the gitignore rule was added after the file was staged. Wave touching git config or `.gitignore` should consider whether the file should remain tracked (committing this config means anyone cloning gets the supabase MCP wired automatically — good for owner workflow, fine since it doesn't contain secrets).
