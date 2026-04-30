# Profile Bug-Fix — Program Rulebook

**Started:** 2026-04-30
**Status:** code complete — all 15 bugs shipped; no remaining open issues as of 2026-04-30
**Format reference:** `Conversations/auth-login-email/` (execution program discipline) and `Conversations/article-lifecycle/` (plan program discipline).

---

## What this program is

A reactive bug-fix program triggered by a real incident: a single iPhone user in `/profile?section=security` generated ~20,000 CSP violation reports in five minutes, flooding Vercel logs and alerting the owner.

The incident opened a full audit of the profile section. Four parallel Explore agents read every component — sections, cards, API routes, shell — and found 14 additional bugs beyond the CSP spike itself. Most were silent failures: queries that crashed without surfacing an error to the user, links pointing at routes that don't exist, and a feedback loop in the toast system that caused Blocked Users to spray error messages.

The program covers three work threads:

1. **CSP spike** — removed the strict `Content-Security-Policy-Report-Only` header that was generating the flood; added a rate limiter to the report endpoint.
2. **14-issue profile audit** — silent query failures, missing error states, false success feedback, null-slug crashes, dead links, missing loading states.
3. **Toast loop fix** — a separate `useMemo` fix in `Toast.tsx` that cured the root cause of `BlockedSection`'s error-message flood.

All three threads are complete and pushed.

---

## How sessions work

**Incident-driven, not slice-driven.** This program doesn't carve the product into pre-planned slices — it follows what the investigation finds. Each session reads state, confirms what's been found and shipped, and decides whether any remaining thread needs work.

**Investigation first.** Parallel Explore agents read actual code before any implementation starts. Confirmation agents then verify exact fix plans against current code before a single line changes.

**Verify queries against the schema.** Any Supabase `.select()` that uses a `!foreign_key_name` join hint must be cross-referenced against `web/src/types/database.ts` before declaring the query structurally sound. The schema uses `fk_` prefixed names (e.g. `fk_blocked_users_blocked_id`), not the Supabase-generated `_fkey` suffix pattern. Behavioral investigation alone won't catch a broken FK hint — it only finds what happens downstream when the query fails.

**6-agent ship pattern.** Per memory: 4 pre-impl agents (investigator → planner → big-picture reviewer → adversary) + confirmation agents before merge. Applies to any future session that reopens implementation in this program.

---

## Issue-status vocabulary

Each issue in `INDEX.md` carries one of these statuses:

- **found** — identified in investigation; no plan yet.
- **planned** — fix plan confirmed by agents; not yet implemented.
- **shipped** — code merged and pushed; commit hash recorded.
- **deferred** — acknowledged; intentionally not fixed in this program (named reason).
- **wont-fix** — investigated and decided not worth changing (named reason).

---

## Start-of-session protocol (every session)

Read in this order before doing anything else:

1. `Conversations/profile-bugfix/README.md` (this file)
2. `Conversations/profile-bugfix/INDEX.md` (live dashboard — all issue statuses)
3. `Conversations/profile-bugfix/SESSION_LOG.md` (last 2 entries)
4. `Conversations/profile-bugfix/00-system-map.md` (profile architecture reference)
5. Auto-memory at `~/.claude/projects/-Users-veritypost-Desktop-verity-post/memory/MEMORY.md`

Decide what's open. Tell the owner one paragraph: what's been shipped, what (if anything) is still open, what this session will cover.

---

## End-of-session protocol (every session)

Before stopping, write three things:

1. Update issue statuses in `INDEX.md` (status, commit hash, last-touched date).
2. Update `INDEX.md` header — last-updated date, phase summary.
3. Append a new entry to `SESSION_LOG.md` — date, what was investigated, what was fixed, what commits shipped, what's blocked, what next session should pick up.

Skipping any of these leaves the next session blind.

---

## Decision discipline

- **Don't re-open shipped issues.** If something shipped and broke again, it's a new incident, not a re-open.
- **Cross-surface findings go in INDEX.md "Cross-surface findings" section.** If investigation reveals something outside the profile section, defer it — don't fix it here.
- **Memory rules apply.** No color-per-tier, no keyboard shortcuts in admin, security-only emails, no user-facing timelines.
- **No improvements during bug-fix sessions.** A bug fix is the smallest correct change. Refactors, UX improvements, and new features belong in a separate program.

---

## Files in this program

```
Conversations/profile-bugfix/
├── README.md         ← this file (rules)
├── INDEX.md          ← live dashboard (all issues, statuses, commits)
├── SESSION_LOG.md    ← chronological narrative
└── 00-system-map.md  ← profile section architecture reference
```
