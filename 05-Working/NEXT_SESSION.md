# Next session handoff

**Last session closed:** 2026-04-20 late-evening extended. Twenty-one commits landed locally, **not pushed**.
**Pick up from:** local `main` at commit whatever this doc lands as. `origin/main` is still at `4d3f7bc`.

Owner explicitly held off on `git push` pending smoke-test. Do not push without asking.

---

## TL;DR — do this first

1. Read CLAUDE.md. Then STATUS.md. Then **this file**. Then top of TASKS.md.
2. Verify the state:
   ```
   git log --oneline origin/main..HEAD | head -25
   git status
   ```
   Working tree clean. 21 commits ahead of origin.
3. **Owner-side work is documented** in `docs/runbooks/DEPLOY_PREP.md` — point them at it when they're ready to prep the deploy.
4. Dev side has one clean next-up pick: **T-019 consumer sweep** (19 admin pages with inline role arrays → frozen Sets from `lib/roles.js`). Mechanical, 1 session.

---

## What shipped across the 2026-04-20 late-evening extended session

10+ tasks closed across 4 batches. Total progress: P0 9→6, P1 25→21, total 93→86. SECURITY 12→9, CODE 23→20, DB-DRIFT 19→17.

| Commit range | Batch | Tasks |
|---|---|---|
| `c015c46` … `92af650` + `7a1764d` | T-005 (7 sub-commits) | T-005 admin direct-writes class (16 pages, 20+ new /api/admin routes, shared lib/adminMutation.ts, reviewer-APPROVED) |
| `3089b9d` | T-005 follow-ups | T-102..T-106 filed (hardcoded-drift discoveries from T-005) |
| `3f60ed1` `24f2e9e` | T-003 | rate_limits DB-backed via `policyKey` arg on checkRateLimit (27 files, 31 sites) + schema/101 seed |
| `412b4b7` | Seed batch | T-012 + T-014 + T-015 as 3 idempotent SQL files (schema/102, 103, 104) |
| `a3713e1` `309d259` `949a899` | Batch A — error hygiene | T-010 dev half (lib/siteUrl.js) + T-013 (115-site err.message sweep → safeErrorResponse) + T-070 (admin silent errors) + T-073 (featureFlags TTL + errors fail-closed) + T-076 (requireVerifiedEmail .status) |
| `61b0d3b` `36386a9` `e08fcdb` `053716b` | Batch B — hardcoded drift | T-017 FALLBACK_CATEGORIES + T-018 admin/story-manager CATEGORIES + T-056 help prices + T-102 PLAN_OPTIONS + T-103 ROLE_ORDER (T-016/T-018/T-019 helpers shipped, consumer sweeps remaining) |
| _this commit_ | Batch D — owner runbook | `docs/runbooks/DEPLOY_PREP.md` written |

**Helpers shipped this session:**
- `web/src/lib/adminMutation.ts` — `requireAdminOutranks`, `recordAdminAction`, `permissionError`
- `web/src/lib/siteUrl.js` — `getSiteUrl`, `getSiteUrlOrNull` (throws in prod if env missing)
- `web/src/lib/plans.js` — extended with `getPlanLimit`, `getPlanLimitValue` (plan_features-backed, 60s cache)
- `web/src/lib/roles.js` — extended with `getRoles`, `getRoleNames`, `rolesUpTo`, `rolesAtLeast`, `clearRolesCache`
- `web/src/lib/rateLimit.js` — extended with `getRateLimit` + `policyKey` support on `checkRateLimit`
- `web/src/lib/apiErrors.js` — pre-existing `safeErrorResponse` now used at 113 call-sites

**Seed SQLs awaiting owner:**
- `schema/101_seed_rate_limits.sql`
- `schema/102_seed_data_export_ready_email_template.sql`
- `schema/103_seed_reserved_usernames.sql`
- `schema/104_seed_blocked_words.sql`

Verify every commit: `tsc --noEmit` green, no iOS touched, no DB state changed (pure code + new SQL files on disk).

---

## What's next — priority order

### Pure dev engineering wins

Ranked by impact-per-hour:

- **T-019 consumer sweep** — 19 admin pages still enumerate role arrays inline (`['owner', 'admin']`, `['moderator', 'editor', 'admin', 'superadmin', 'owner']`, etc.). `lib/roles.js` already exports the correct frozen Sets. Replace the inline arrays with `ADMIN_ROLES.has(x)` / `MOD_ROLES.has(x)` / `EDITOR_ROLES.has(x)`. Mechanical, good fit for a Python sweep script. **Closes T-019.** See TASKS.md:101 for the file list.
- **T-018 residual** — admin/pipeline + admin/cohorts still hardcode categories. Same pattern as admin/story-manager which I migrated this session — load from DB on mount. **Closes T-018.** ~30 min.
- **T-016 residual** — admin/subscriptions + profile/settings read PRICING/TIERS/maxKids from lib/plans.js. The upgrade-UI copy in those consts (feature-bullet strings, taglines) is marketing text; moving it to DB means either extending plans.metadata or adding feature-list columns. profile/settings is 3800 lines. **Do this one last** — bigger than it looks. Plausibly split further into "move PRICING to DB reads" (small) and "move copy to DB" (bigger).

### Batch E — auth surface small wins (1 session)

- T-025 Retry-After header on 13 auth routes (partial; T-003 touched some)
- T-068 auth/callback + pick-username drop rawNext on first-login
- T-077 apply-to-expert confirmation strands user
- T-080 sanitizeIlikeTerm strips `%` instead of escaping

### Batch C — Kid iOS hardening (1 session, needs xcodebuild)

- T-043 Dynamic Type across 11 kids files
- T-044 KidsAppState vs DB dual-source
- T-045 PIN brute-force resistance
- T-046 Kid-pair JWT re-verify parent_user_id

Deferred because it needs xcodebuild verification and this session was web-only.

### Owner-side

All owner-side P0s are now consolidated in `docs/runbooks/DEPLOY_PREP.md`. Hand that doc to the owner; they can work through it in one sitting (~45-60 min including verification).

---

## Operational discipline — what tightened this session

### What worked

1. **Targeted reads.** offset + limit on big files (admin/system 650, admin/users 960, permissions.xlsx, profile/settings 3800). Kept context surface tight.
2. **Scripts for N-across-files edits.** T-003 did 31 call-sites in one Python invocation; T-013 did 113 call-sites in one Python sweep. Would have been hundreds of Edit tool calls otherwise.
3. **Typecheck after every batch** — not at the end. Caught two `@ts-expect-error` placement errors in T-005 before commit, a variable collision in T-102.
4. **Scope-gated agent use.** Explore + reviewer agent on T-005 (architectural, >20 files). No agents on T-003 / T-013 / Batch A / Batch B — surgical or mechanical enough that tsc + anti-hallucination greps gave full coverage.
5. **Close-as-you-go docs.** Each batch commit included the TASKS.md removal + DONE.md append + count bump in the same push. Task state never drifted from commit state for more than one commit.

### What still slacks

- Commit-message bodies got long on T-005 sub-commits. Could trim.
- Had one typecheck cycle fail because `planOptions` collided with a local var — would've caught via grep before commit.
- DONE.md entries are getting quite long. A concise-format-switch might help when we hit 100+ entries.

### Per-task gameplan (unchanged — still the right shape)

1. Pre-flight: re-read task block, grep file:line, grep DONE.md for regression.
2. Scope-check: grep the pattern across the whole target dir. Named scope often understates.
3. Implement: targeted reads, scripts for repetitive changes.
4. Verify: `cd web && npx tsc --noEmit` exit 0; `xcodebuild` if iOS.
5. Close loop: remove block from TASKS.md, append DONE.md, bump counts, commit `T-<id>: <title>` with HEREDOC + Co-Authored-By.
6. Anti-hallucination grep: the pattern the task targeted should now return 0.
7. Agent review (>5 files / architectural only): APPROVE / REVISE / BLOCK.

### Safety nets still on disk

- Tarball at `~/Desktop/verity-post-snapshot-20260420-0933.tgz` (6.8MB).
- `git stash list` — old prelaunch stash, safe to drop.

---

## Gotchas that still apply

All prior-handoff gotchas plus:

1. **Python edit scripts break formatting.** T-003 needed a second pass to rejoin split inline calls and realign indent. Budget a cleanup pass if you script edits; verify with `grep -B1 -A1 <inserted-symbol>` on a sample.

2. **`@ts-expect-error` placement is picky.** TypeScript requires the directive immediately before the offending expression. Mass-inserting before a wrapping `await service.from(...)` can miss the specific line the error fires on — I hit this twice in T-005's cascade endpoint. Always tsc after inserting `@ts-expect-error`.

3. **`planOptions` was already a local variable in admin/users.** My new state var collided. Grep before introducing a new state name in an existing file.

4. **`plan_features` table IS seeded via `reset_and_rebuild_v2.sql:3090-3250`.** The bookmarks limit (10 for free), breaking_alerts (1/day for free), kid_profiles (2/4 for family plans), and streak_freeze (2/week for Pro+Family) are all there. `getPlanLimit()` reads them directly.

5. **`permissions.xlsx` has 308 admin.* keys.** Extractable via the unzip-and-regex one-liner in the previous handoff. Use before picking a permission key for a new route.

6. **No dedicated `admin.notifications.broadcast` permission key yet.** The T-005 broadcast route uses `admin.settings.edit` as a restrictive stopgap. If you ship a new admin feature that needs a dedicated key, seed it in the xlsx + `scripts/import-permissions.js --apply` + migration file.

7. **`require_outranks` + `record_admin_action` RPCs aren't in the generated `database.ts`.** The pattern for calling them from .ts is in `lib/adminMutation.ts` (`authed.rpc as unknown as ...` cast).

8. **`DestructiveActionConfirm` component writes its own audit client-side.** 8 admin pages now have dual-audit (component + new server route). Not a bug; just noise in admin_audit_log. Rip-out-the-component-audit is a follow-up.

9. **Legacy `.js` admin routes leak err.message verbatim.** `ban/route.js`, `manual-sync/route.js`, `plan/route.js` still return `upErr.message` / `rankErr.message`. Not in T-013 scope (T-013 was specifically the `error: error.message` pattern); upgrade them to `safeErrorResponse` as a follow-up.

10. **T-019 has two patterns that look interchangeable but aren't.** `['owner', 'superadmin', 'admin']` (3-wide ADMIN_ROLES) vs `['owner', 'admin']` (missing superadmin — probably a bug). Review each hit before normalizing.

---

## Task state at handoff

**Counts:** P0 6 · P1 21 · P2 29 · P3 24 · P4 6 · Total 86.
Lens: DB-DRIFT 17 · SCHEMA 5 · SECURITY 9 · IOS 11 · MIGRATION-DRIFT 4 · A11Y 3 · UX 13 · CODE 20.

**All remaining P0 is owner-side.** See `docs/runbooks/DEPLOY_PREP.md`.

**Crucial owner decisions still outstanding:**
1. **Push to origin/main.** 21 commits ahead. Smoke-test first or push first — owner's call.
2. **Apply the 4 seed SQLs** — from DEPLOY_PREP.md §1.
3. **Set NEXT_PUBLIC_SITE_URL + SENTRY_DSN in Vercel** — §2.
4. **HIBP toggle + secret rotation + migration reconcile + publish real articles** — §3-§6.

Every step is documented in `docs/runbooks/DEPLOY_PREP.md` with verify commands inline.

---

## Memory file check

`/Users/veritypost/.claude/projects/-Users-veritypost-Desktop-verity-post/memory/MEMORY.md` — updated this session to reflect T-003/T-005/T-010/T-012/T-013/T-014/T-015/T-017/T-056/T-070/T-073/T-076/T-102/T-103 closures, 21-commits-unpushed state, and the no-push-without-asking hold.

---

*Doc written 2026-04-20 late-evening extended at end of session. Author: Claude Opus 4.7 (1M context).*
