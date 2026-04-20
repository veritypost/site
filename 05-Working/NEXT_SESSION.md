# Next session handoff

**Last session closed:** 2026-04-20 late-evening. Ten commits landed locally, **not pushed**.
**Pick up from:** local `main` at commit `24f2e9e`. `origin/main` is at `4d3f7bc` — you are 10 commits ahead.

Owner explicitly held off on `git push` — do not push without asking.

---

## TL;DR — do this first

1. Read CLAUDE.md. Then STATUS.md. Then **this file**. Then top of TASKS.md.
2. Verify the state:
   ```
   git log --oneline -12
   git status
   git rev-list --count origin/main..HEAD   # should be 10
   ```
   You should see `24f2e9e` at the top, working tree clean, 10 commits ahead of origin.
3. Every remaining P0 is owner-gated (see below). First engineering task is a P1 — pick up **T-013** (error.message leak sweep) or a trivial P1 seed like **T-014** / **T-015**, or the dev **T-012** data_export_ready template.

---

## What shipped last session (2026-04-20 late-evening, in commit order)

| Commit | What | Files |
|---|---|---|
| `c015c46` | T-005(a): `lib/adminMutation.ts` helper + `/api/admin/categories` routes + client migration | 4 |
| `943517b` | T-005(b): words + email-templates + feeds (4 new routes, 3 client migrations) | 7 |
| `e3f6b83` | T-005(c): features + system + notifications (5 new routes incl. `/api/admin/settings/upsert`, `/api/admin/rate-limits`, `/api/admin/notifications/broadcast`) | 8 |
| `2e71c30` | T-005(d): users + subscriptions + stories + promo (10 new routes under `/api/admin/users/[id]/**`, `articles/[id]`, `promo`, `subscriptions/[id]/extend-grace`, `billing/refund-decision`) | 15 |
| `4a7a160` | T-005(e): story-manager + kids-story-manager (unified `/api/admin/articles/save` cascade) + 3 settings-upsert stragglers (streaks, comments, reader) | 6 |
| `7a1764d` | T-005(f): reviewer-agent fixes — broadcast perm key swapped off `admin.broadcasts.breaking.send` to `admin.settings.edit`; rank guards added to `achievements`, `sessions/[sessionId]`, `mark-read`, `mark-quiz`; kids quiz payload now explicit on `question_type/sort_order/is_active` | 6 |
| `92af650` | T-005 close — TASKS.md block removed, DONE.md appended, counts bumped | 2 |
| `3089b9d` | Filed T-102..T-106 (hardcoded config surfaced during T-005): PLAN_OPTIONS, ROLE_ORDER, system config metadata, notifications config metadata, EMAIL_SEQUENCES | 1 |
| `3f60ed1` | T-003: rate_limits DB-backed. `lib/rateLimit.js` gets `getRateLimit(policyKey, fallback)` + `checkRateLimit(..., policyKey)`. All 31 call-sites in 27 files migrated. `schema/101_seed_rate_limits.sql` idempotent seed (31 rows). | 29 |
| `24f2e9e` | T-003 close — docs/counts | 2 |

All verified: `tsc --noEmit` exit 0 at every commit. No iOS touched this session. Reviewer agent APPROVED T-005 after the (f) revisions. Anti-hallucination greps: `grep "supabase\.from\([^)]*\)\.(insert|update|upsert|delete)" web/src/app/admin` = 0; `grep "policyKey:" web/src/app/api` = 31 = `grep "checkRateLimit("` call count.

**Tasks closed this session:** T-003, T-005.
**Tasks filed this session:** T-102, T-103, T-104, T-105, T-106.

**Task counts as of handoff:** P0 7 · P1 25 · P2 32 · P3 26 · P4 6 · **Total 96**.
DB-DRIFT 23 · SCHEMA 6 · SECURITY 11 · IOS 11 · MIGRATION-DRIFT 4 · A11Y 3 · UX 13 · CODE 23.

---

## What's next — priority order

### Remaining P0s — ALL owner-gated

None of the open P0s are pure engineering anymore. Owner has to run SQL or flip dashboard toggles:

- **T-004** — migration disk↔live reconcile. Needs Supabase Studio or MCP. Runbook-ready if you want to draft one under `docs/runbooks/RECONCILE_MIGRATIONS.md`.
- **T-007** — HIBP toggle (Supabase Auth settings).
- **T-008** — Rotate live secrets (Supabase service-role, Stripe live, Stripe webhook).
- **T-009** — `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` Vercel env vars.
- **T-010** — `NEXT_PUBLIC_SITE_URL` Vercel env var (plus harden 4 routes to throw if env missing — this half is engineering, ~15 min).
- **T-011** — Publish 10+ real articles, retire the `Test:` placeholders.
- **T-012** — Seed `data_export_ready` email template. Write `schema/102_seed_data_export_ready_email_template.sql` (dev work, owner runs). ~15 min.

**T-010 fallback hardening and T-012 SQL** are the two dev tasks inside the P0 pool. Everything else is owner-gated.

### First non-P0 engineering wins

- **T-013** (P1) — `error.message` leak sweep. 115 occurrences across 87 API files. `web/src/lib/apiErrors.js` helper exists. The new T-005 routes I added don't leak (all generic). Pattern: `NextResponse.json({ error: err.message }, ...)` → `apiError(err, 'domain.action.failed', status)`. Grep it: `grep "error: error\.message\|error: err\.message" web/src/app/api` — current count is the scope. Bigger than it sounds because some of those are intentional sentinel codes (`UNAUTHENTICATED`, `PERMISSION_DENIED:*`) — need to distinguish.
- **T-014** (P1) — Seed `reserved_usernames`. 1L, trivial. Write SQL.
- **T-015** (P1) — Seed `blocked_words`. 1L, trivial. Write SQL.

### Behavior watch — nothing live-breaking changed today

T-005 is behaviorally invisible — pages work the same for users; server handles what the client used to. T-003 falls back to code defaults until `schema/101_seed_rate_limits.sql` runs, so no change visible to users.

**Owner still needs to run `schema/101_seed_rate_limits.sql`** to populate the `rate_limits` table. Until then the admin/system UI shows the hardcoded defaults (it merges DB rows when present). No rush — the fallback path works identically.

---

## Operational discipline that worked this session (update vs. last session)

### What tightened

1. **Targeted reads.** Big files (admin/system 650 lines, admin/users 960 lines, permissions.xlsx) read with `offset + limit` only where needed. Cut a lot of context waste vs. prior session.
2. **Bash/Python scripts for N-across-files edits.** T-003 migrated 31 call-sites across 27 files in one Python invocation. Would have been 31 `Edit` round-trips under the old approach.
3. **Scope-gated agent use.** Explore agent used once (T-005 pre-audit of 13 pages). Reviewer agent used once (T-005 post-audit). Both times it caught real things. T-003 didn't warrant an agent — surgical change, single helper + fan-out.
4. **Skip the tarball for surgical changes.** T-005 got a tarball (architectural, 20+ files). T-003 got none (1 helper + seed SQL + mechanical fan-out). No regret.
5. **Typecheck after every batch** not just at the end. Caught two `@ts-expect-error` placement errors in T-005's cascade endpoint before they reached commit.

### What still slacks

- I still sometimes re-read a file I already have in context. Context checker pass before each Read.
- Commit message bodies ran long on T-005(d)+(e) — could trim to 6 lines + a link to DONE.md.

### Per-task gameplan (unchanged, still works)

1. **Pre-flight** — re-read the task in TASKS.md, grep the file:line, grep DONE.md by file:line for regression check.
2. **Scope-check** — grep the pattern across the whole target dir. T-005 named 13 pages but the full grep showed 16.
3. **Implement** — targeted reads, minimal context surface, scripts for repetitive changes.
4. **Verify** — `cd web && npx tsc --noEmit` exit 0 before committing. iOS touched → `xcodebuild`.
5. **Close the loop**:
   - Remove the task block from TASKS.md (not checkmarked — removed).
   - Append entry to DONE.md in the matching area section.
   - Update the task counts at top of TASKS.md.
   - Commit `T-<id>: <title>` with HEREDOC message + Co-Authored-By line.
6. **Anti-hallucination grep** — grep for the pattern the task described. Should return 0 matches. Commit-msg verify counts should match reality.
7. **Agent review** (>5 files or architectural changes only) — spawn an independent auditor, feed it the commit SHA, ask for APPROVE/REVISE/BLOCK.

### Safety nets that are still there

- Tarball at `~/Desktop/verity-post-snapshot-20260420-0933.tgz` (6.8MB). Still on disk as of session end.
- `git stash list` has the old prelaunch stash — safe to drop.

---

## Gotchas learned this session

1. **`require_outranks` and related RPCs aren't in the generated `database.ts`.** The `.js` admin routes use them freely; in `.ts` you must cast. The pattern is in `lib/adminMutation.ts` (`authed.rpc as unknown as ...`). Don't regenerate types unless you have a reason — it's a lot of diff for one RPC.

2. **DestructiveActionConfirm component writes its own audit.** From the client, via `supabase.rpc('record_admin_action')`. After T-005, 8 pages still use it and the new server routes ALSO audit. That's a dual-audit pattern (not a security bug but noise). Don't fix by removing the server-side audit — the component audit will be ripped out in a future pass.

3. **Permissions xlsx has 308 `admin.*` keys.** Extractable via `unzip -p "/Users/veritypost/Desktop/verity post/permissions.xlsx" xl/worksheets/sheet1.xml | python3 -c 'import sys,re; print("\n".join(sorted(set(re.findall(r"<t>(admin\.[^<]+)</t>", sys.stdin.read())))))'`. Use this before picking a permission key for a new route.

4. **No dedicated `admin.notifications.broadcast` key yet.** T-005(c) landed `admin.broadcasts.breaking.send` as a first pass, reviewer rejected it (too article-bound), T-005(f) swapped to `admin.settings.edit` as a restrictive stopgap. Follow-up is to seed the correct key and swap.

5. **`checkRateLimit` now takes optional `policyKey`** alongside `key`. The `key` is the per-caller counter partition (`login:ip:${ip}`). The `policyKey` is the stable DB lookup name (`login_ip`). Don't conflate them.

6. **Python inline-edit scripts don't always produce clean formatting** — they split inline JS calls across lines weirdly. T-003 needed a second pass to rejoin and realign. If you use the pattern, budget a formatting cleanup pass and verify with `grep -B1 -A1 policyKey:` (or equivalent) on a sample.

7. **`scripts/import-permissions.js` hardcodes role→set, plan→set, and `category:'ui'`** in JS literals. The xlsx is canonical for permission keys but NOT for those three mappings. CLAUDE.md's "xlsx is 1:1" claim is false for these. Don't rely on xlsx edits landing role/plan/category changes.

8. **Previously-flagged: `scripts/import-permissions.js`, score-tier behavior change, `@admin-verified` marker staleness, sentinel-code err.message responses, Apple DUNS block, Supabase MCP unavailability.** All still apply. See previous handoff content in commit history (`4d3f7bc`).

---

## Findings I surfaced that are NOT yet in TASKS.md

- **`DestructiveActionConfirm` audits client-side.** See gotcha #2. Consider: rip out the audit, update all 8 callers so their backing route owns it. That's a multi-file refactor. Not yet filed — tracked implicitly under the T-005 follow-up list in DONE.md.
- **Legacy `.js` admin routes still leak `err.message`.** `api/admin/users/[id]/ban/route.js` returns `upErr.message`, `bumpErr.message`, etc. verbatim. Same for `manual-sync/route.js`, `plan/route.js`. T-013 covers this broadly; these specific files should be upgraded to use the helper. Mention in T-013's acceptance criteria.
- **`admin.features.edit` key missing.** Reviewer noted: `features/[id]/route.ts` full-edit uses `admin.features.create` as a stopgap. Not a security risk (create is stricter than edit) but a mis-mapping. Follow-up: seed `admin.features.edit` and swap.
- **Audit-failure observability.** `recordAdminAction` soft-fails to `console.error`. If audit is ever silent-dropped in prod, nobody will know. Wire to Sentry.

---

## Files still not personally read (if you need depth)

Mostly unchanged from previous handoff. This session added:

- I personally read most of `web/src/app/admin/**/page.tsx` for the 16 migrated pages. Outside that set, still surveyed only.
- Cascade editor route (`api/admin/articles/save/route.ts`) is the most complex new file I wrote — review if you touch that area.
- `admin/reader/page.tsx`, `admin/streaks/page.tsx`, `admin/comments/page.tsx` — touched the settings-upsert lines only, did not read the full files.

---

## Memory file check

`/Users/veritypost/.claude/projects/-Users-veritypost-Desktop-verity-post/memory/MEMORY.md` — my auto-memory. Updated at end of this session to reflect the new commit (`24f2e9e`), counts, and the no-push hold.

---

## Crucial owner-level decisions still outstanding

1. **Push to origin/main.** Ten commits ahead. Owner held off pending smoke-test. Next engineer should ask before pushing.
2. **Seed `rate_limits`** by running `schema/101_seed_rate_limits.sql`. Gives admin/system the DB-backed tuning that T-003 wired up.
3. **Whether to file follow-ups from the T-005 DONE.md list.** Several (dedicated notifications broadcast key, admin.features.edit key, Sentry for audit failures, legacy .js route upgrade) are called out in DONE.md but not filed as T-IDs. Ask owner before spending a session on any.

---

*Doc written 2026-04-20 late-evening at end of session. Author: Claude Opus 4.7 (1M context). Commit: whatever this file lands as.*
