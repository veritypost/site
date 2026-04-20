# Next session handoff

**Last session closed:** 2026-04-20 evening. Eight tasks landed and pushed.
**Pick up from:** `origin/main` at commit `dab828e`.

---

## TL;DR — do this first

1. Read CLAUDE.md (the agent profile). Then STATUS.md. Then **this file**. Then top of TASKS.md (the P0 section at lines 41-96 post-close-out). Then the lib/ layer.
2. Verify the state: `git log --oneline -10` — you should see the 8 commits from 2026-04-20 ending at `dab828e`. Working tree clean. If not clean, stop and ask.
3. Pick **T-005** (admin direct-writes class, 13 pages). Everything else is either owner-side (T-007..T-011) or MCP-gated for the owner to run the seed (T-003, T-004, T-012).
4. Before touching T-005: run the Bucket C safety sequence (backup tarball + stash), then spawn an agent pre-audit of the 13 pages. Don't go in blind.

---

## What shipped last session (2026-04-20, in commit order)

| Commit | What | Files |
|---|---|---|
| `d202c08` | Canonical docs landed in git (CLAUDE.md, TASKS.md, DONE.md, 05-Working/, schema/100, STATUS.md refresh, WORKING.md retired, permissions_matrix.xlsx deleted) | 11 |
| `c7af18a` | T-006 CSP enforce flip + BATCH_FIXES_2026_04_20 (51 fixes + 5 post-audit urgent fixes) | 49 |
| `b0e0ded` | STATUS.md catch-up (7 stale refs to CSP-pending + WORKING.md fixed) | 1 |
| `9c58118` | Bucket A security one-liners: T-022, T-023, T-026, T-027, T-030 | 7 |
| `cab642f` | T-002 admin achievement dropdown → DB-live | 3 |
| `2c409c4` | T-001 score_tiers unified via new `lib/scoreTiers.ts` helper | 5 |
| `dab828e` | T-001 TASKS.md block cleanup (my earlier Edit used a stale anchor) | 1 |

All verified: `tsc --noEmit` exit 0 (warm + cold), `xcodebuild VerityPostKids` BUILD SUCCEEDED, CSP header confirmed as `Content-Security-Policy` (not `-Report-Only`) via dev-server curl on `/` + `/login`, secret scans clean on every commit, reviewer agents approved commits 2, 4, 6.

**Task counts as of handoff:** P0: 9 · P1: 25 · P2: 30 · P3: 23 · P4: 6 · **Total: 93**
**Closed this session:** T-001, T-002, T-006, T-022, T-023, T-026, T-027, T-030.

---

## What's next — priority order

### T-005 — admin direct-writes class (the big one)

**TASKS.md says one file (`admin/users/page.tsx:273-290`). Reality: 13 pages.** I audited this personally last session and found these 13 admin pages calling `supabase.from(...).delete()/update()/insert()` directly from the client, bypassing `requirePermission` → `service client` → `require_outranks` → `record_admin_action`:

- admin/categories/page.tsx
- admin/email-templates/page.tsx
- admin/features/page.tsx
- admin/feeds/page.tsx
- admin/kids-story-manager/page.tsx
- admin/notifications/page.tsx
- admin/promo/page.tsx
- admin/stories/page.tsx
- admin/story-manager/page.tsx
- admin/subscriptions/page.tsx
- admin/system/page.tsx
- admin/users/page.tsx (the one flagged by T-005)
- admin/words/page.tsx

**Structural fix:**
1. For each, there's typically no server-side API route yet — need to create one that does `requirePermission → createServiceClient → require_outranks → checkRateLimit → mutation → record_admin_action → response`.
2. Migrate the client to `fetch('/api/admin/...')` instead of the direct Supabase call.
3. Delete the direct-write path on the client.

**This is one logical change (close a class of security bugs), one PR, reviewed as a unit.** Don't split — partial migration leaves half the attack surface open.

**Suggested approach:**
- Spawn an Explore agent to map EXACT write-call-sites per page (method, table, shape of payload) before you touch anything. The 13-page list above is from my audit; per-page write operations need cataloguing.
- Build the canonical admin-mutation API shape once in a new `web/src/lib/adminMutation.js` helper (or similar) that codifies the pattern.
- Migrate pages in small groups (3-4 per commit) with tsc between. 3-4 commits total.
- Post-audit agent each commit.
- Reviewer agent on the final set before push.

**Effort estimate: 4-8 hours focused. Enough for a full session.** Don't try to stack other P0s on top.

### T-003 — rate_limits DB-backed (MCP-gated partially; can land code without)

Safe to do WITHOUT owner running SQL first: write `getRateLimit(key)` helper in `lib/rateLimit.js` that **falls back to route-supplied defaults** when the table has 0 rows. Migrate the ~10 inline-literal routes to use it. Ship. When owner later runs a seed SQL against `rate_limits`, the routes pick up DB values automatically (60s cache).

Then write `schema/101_seed_rate_limits.sql` with 10 seed rows for owner to apply at their leisure.

Scope: 1 helper file + ~10 route edits + 1 new SQL file. ~2 hours.

### T-012 — data_export_ready email template (MCP-gated, code-free)

Write `schema/102_seed_data_export_ready_email_template.sql` with one INSERT into `email_templates`. Owner runs it.

**Template shape** — confirm via `git show 2c409c4 -- schema/100_backfill_admin_rank_rpcs_2026_04_19.sql` for formatting style. The `email_templates` columns are in `schema/reset_and_rebuild_v2.sql` — grep it. Needed fields: `type` (the cron key, `data_export_ready`), subject, body_html, body_text.

Scope: 1 SQL file. 15 min.

### T-004 — migration disk↔live reconcile (MCP-gated, owner-driven)

I can't pull live migrations without Supabase MCP. Owner runs via Supabase Studio:

```sql
SELECT version, name, statements FROM supabase_migrations.schema_migrations ORDER BY version;
```

Then for each applied-but-no-disk-file migration, they copy the statements into a new numbered file under `schema/`. Also: the duplicate `096_function_search_path_hygiene` at two timestamps needs a rename of one to `_v2`.

This is owner work. I can write the instructions as a runbook under `docs/runbooks/RECONCILE_MIGRATIONS.md` if you want to draft it before handing over.

### Owner-side P0s (not engineering)

T-007 HIBP toggle, T-008 secret rotation, T-009 Sentry DSN env, T-010 SITE_URL env, T-011 publish real articles. These are the remaining hard blockers for adult-web launch.

---

## Operational discipline that worked last session

### Per-task gameplan

1. **Pre-flight** — re-read the task in TASKS.md, grep the claimed file:line to verify current state matches (task descriptions go stale). Grep DONE.md by file:line — did we already ship this?
2. **Scope-check** — grep the pattern across the target directory. If the task says 1 site but there are 11 (like T-030), expand scope consciously and document in the commit message.
3. **Implement** — Edit tool, keep related edits in same session since context has the file hot.
4. **Verify** — `cd web && npx tsc --noEmit`. Exit code 0 before committing. If iOS touched: `xcodebuild -scheme VerityPostKids build`.
5. **Close the loop**:
   - Remove the task block from TASKS.md (not checkmarked — removed).
   - Append entry to DONE.md in the matching area section.
   - Update the task counts at top of TASKS.md.
   - Commit `T-<id>: <title>` with HEREDOC message + Co-Authored-By line.
6. **Run the anti-hallucination check** — grep for the pattern the task described. Should return 0 matches.
7. **Agent review** (optional but recommended for commits that touch >5 files) — spawn an independent auditor, feed it the commit SHA, ask for APPROVE/REVISE/BLOCK. Pattern that worked: explicit per-check list in the prompt.

### Safety nets that worked

Before any multi-file commit sequence:
- **Tarball backup**: `tar czf ~/Desktop/verity-post-snapshot-$(date +%Y%m%d-%H%M).tgz -C /Users/veritypost/Desktop verity-post --exclude='verity-post/node_modules' --exclude='verity-post/.next' --exclude='verity-post/web/node_modules' --exclude='verity-post/web/.next' --exclude='verity-post/VerityPost/build' --exclude='verity-post/VerityPostKids/build'` — takes ~1 second, sits outside git, total-loss recovery.
- **Git stash**: `git stash push -u -m "pre-commit-safety"` then `git stash apply` to restore. In-git restore point.
- Only push to `origin/main` after reviewer approve. NEVER force push. NEVER use `--no-verify`.

### Commit message template

```
<type>(<scope>): <short description> (T-<id>)

Context / why (1-3 lines).

Files / what (2-5 lines, focus on pattern, not per-file enumeration).

Verification: tsc --noEmit exit 0; <other checks>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Style matches existing commits on main. Reference the task ID explicitly.

---

## Gotchas learned the hard way

1. **CWD drift in bash sessions.** `cd web` persists across Bash invocations. Use absolute paths or be aware that `git status` from `web/` shows `../STATUS.md` for repo-root files. I wasted turns confused by this early on.

2. **Port 3000 check needs content test.** `if lsof -i :3000 -sTCP:LISTEN -t | head -1; then` is WRONG — `head -1` on empty input still exits 0. Correct: `if [ -n "$(lsof -i :3000 -sTCP:LISTEN -t)" ]; then`.

3. **No Supabase MCP available.** Only Gmail/Calendar/Drive OAuth MCPs are in the tool list. Any DB read/write requires SQL files for the owner to run.

4. **`@admin-verified 2026-04-18` marker is stale on every admin page.** Don't trust the marker — `git log --since=2026-04-18 <file>` shows post-marker edits on all 39 admin pages. Treat the marker as "was verified then; not necessarily now."

5. **`permissions.xlsx` is the canonical source for permission keys, BUT** `scripts/import-permissions.js` hardcodes role→set and plan→set mappings in JS literals (lines 138-148, 157-167) AND hardcodes `category: 'ui'` for every permission (line 213-216). These are not in xlsx. CLAUDE.md's "xlsx is 1:1 with DB" claim is false for those three things. Don't rely on xlsx edits landing role/plan/category changes.

6. **Build fails without SENTRY_DSN in prod env.** `npm run build` hard-fails per `next.config.js:61-68` unless `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` are set. `tsc --noEmit` works fine without. For local verification, tsc is enough for code correctness; `npm run build` needs env setup.

7. **`requireAuth / requirePermission` error envelope is intentional.** The pattern `if (err.status) return NextResponse.json({ error: err.message }, { status: err.status })` is in dozens of routes and returns sentinel codes like `UNAUTHENTICATED`, `EMAIL_NOT_VERIFIED`, `PERMISSION_DENIED:<key>`. These are NOT DB-error leaks; don't "fix" them.

8. **Edit tool `old_string` must match EXACTLY.** If you edited a file earlier in the session, your next Edit must account for prior changes (I bit this twice — once with UserDetail prop threading on T-002, once with a now-gone `### T-002` anchor on T-001 cleanup).

9. **Score tiers behavior change is LIVE.** Users who were "contributor" now render as "informed". Users who were "trusted" at 2000 now are "analyst" at a LOWER threshold (600). This is the entire point of T-001 — code now agrees with DB — but it's a visible change to any existing user. If someone reports "my tier changed", this is why.

10. **`tierFor`/`ScoreTier` now come from `@/lib/scoreTiers`.** The old local `tierFor` in profile/page.tsx + admin/users/page.tsx are gone. Any future tier UI needs to import from the helper.

---

## Findings I surfaced that are NOT yet in TASKS.md

These are things I noticed during the session but didn't have time to task-ify. Next session should either file them or include them in adjacent sweeps.

1. **NavWrapper.tsx runs 3 DB round-trips on every page load.** `auth.getUser()` + `users.select(16 cols)` + `refreshAllPermissions()` + 60s-polling `/api/notifications?unread=1&limit=1`. Under load this is meaningful. Not in TASKS.md. Consider: does NavWrapper need to re-fetch the user row on every mount, or could middleware inject it?

2. **`story/[slug]/page.tsx:424-435` fail-open leaks paid body.** On transient perms-fetch error, `canViewBody/Sources/Timeline` all flip to `true`. The comment claims "RLS still gates server-side" but the body is fetched via `.select('*')` at :317-321 and `articles` RLS is published-status only, NOT paid-tier. So transient fail means free users can see paid body content briefly. Not in TASKS.md.

3. **`CommentThread.tsx:136` has hardcoded role array `['moderator', 'editor', 'admin', 'superadmin', 'owner']`.** T-019 captures this pattern but names other files; `CommentThread.tsx` is not listed. Add to T-019 scope or file as new.

4. **`scoring.js` (every RPC wrapper) returns `{ error: error.message }`.** 5 call sites. T-013 covers the broader class; `scoring.js` is not specifically named. Routes that call `scoreQuizSubmit` etc. may pass the raw error through to clients.

5. **`profile/settings/page.tsx:105-108`** has an inline TODO admitting that permission keys `settings.profile.edit.own` and `settings.expert.edit` don't exist in DB. No TASKS.md entry for seeding these.

6. **`search/page.tsx:61`** has defensive OR of three permission keys (`search.view` || `search.basic` || `search.articles.free`) — suggests key-rename drift. Whichever resolver path won't break first was unclear.

7. **`lib/scoreTiers.ts` fallback label `'Newcomer'` is hardcoded in 3 places** (profile OverviewTab, MilestonesTab, ProfileCardPreview, admin/users UserDetail). Only visible when DB load fails, but if score_tiers is ever reseeded without a `newcomer` row this mislabels. Cosmetic.

8. **DONE.md T-001 entry** has two malformed file:line anchors: `789-,820-` (trailing dash, missing end). Cosmetic, my typo. Fix it if you touch DONE.md next.

---

## Files still not personally read (if you need depth)

I surveyed these via agents last session but did NOT read them line-by-line myself. If your T-005 work doesn't require deep knowledge of them, skip. If it does, budget time for personal reads:

- Most of the 39 admin pages (only read admin/users/page.tsx + admin/layout.tsx personally)
- Most of the 149 API routes (read auth, kids/pair-adjacent, admin/users/permissions, reports, expert/apply, resend-verification personally; rest via agent)
- Both iOS apps (surveyed, not personally read)
- Schema SQL migrations (surveyed, not personally read; did grep for specific tables like score_tiers)
- Profile settings page lines 500-3800 (only read first 500)
- Story/home pages beyond what I read for T-001 work

---

## State of safety nets (possibly still there, possibly cleaned up)

- Tarball at `~/Desktop/verity-post-snapshot-20260420-0820.tgz` (6.3MB). May still be there — check with `ls ~/Desktop/verity-post-snapshot-*` before relying on it. If gone, make a fresh one before T-005.
- Stash `stash@{0}` "pre-commit-split-safety-net-20260420-0828" — may still be there, `git stash list` to check. Probably safe to drop now that everything is pushed.

---

## Memory file check

`/Users/veritypost/.claude/projects/-Users-veritypost-Desktop-verity-post/memory/MEMORY.md` — my auto-memory. Still valid as of session end. If you find something that contradicts current state during Phase 1 reading, fix the memory file entry.

---

*Doc written 2026-04-20 at end of session. Author: previous Claude instance. Commit: whatever this file lands as.*
