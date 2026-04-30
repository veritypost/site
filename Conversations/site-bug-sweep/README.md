# Site Bug-Sweep — Program Rulebook

**Started:** 2026-04-30
**Format reference:** `Conversations/profile-bugfix/` (bug-sweep discipline) and `Conversations/article-lifecycle/` (multi-session program structure).

---

## What this program is

A systematic sweep of every web surface in the Verity Post web app, organized by account type, tier, plan, and permission level. The profile section is already covered by `Conversations/profile-bugfix/` — everything else is in scope here.

The program visits each surface as: anonymous visitor, signed-in free user, signed-in pro user, signed-in admin. It looks for silent failures (queries that crash without telling the user), broken feedback (success/error toasts that fire when they shouldn't or don't), dead links, missing loading/error states, broken permission gates, and structural mismatches between what the UI expects and what the API or DB actually returns.

The article lifecycle implementation (slices 01–06) shipped recently. This sweep is the first full-coverage verification of that implementation across the surfaces it touches — `/[slug]`, `ArticleEngagementZone`, `ArticleTracker`, `SourcesSection`, `TimelineSection`, and the downstream API routes. Verifying it is a first-class goal, not a side concern.

---

## How sessions work

**One slice per session.** Read state, advance by exactly one slice, write state back, stop.

**Investigation first.** Parallel Explore agents read actual code before any findings are surfaced. For each claim they make — especially about query shapes, FK joins, and API contracts — confirm against the current file before deciding on a fix.

**Confirm before implementing.** Any bug fix must be confirmed by a verification agent against the current code before a single line changes. The fix plan quotes the exact file and line.

**6-agent ship pattern applies.** For any implementation session: 4 pre-impl agents (investigator → planner → big-picture reviewer → adversary) + confirmation before merge. Non-negotiable.

---

## Slice-status vocabulary

Each slice in `INDEX.md` carries one status:

- **not-started** — no investigation done yet.
- **investigating** — Explore agents are reading the code; findings not yet surfaced.
- **findings-open** — investigation done; findings surfaced to owner; Q&A in progress if design decisions needed.
- **adversarial-review** — main findings pass closed; a fresh agent is reviewing the locked plan against code.
- **locked** — all issues confirmed, fix plans sealed; ready for implementation. Issue list lives in the slice doc.

Issue statuses (within a slice doc):

- **found** — identified in investigation; no plan yet.
- **planned** — fix plan confirmed; not yet implemented.
- **shipped** — code merged and pushed; commit hash recorded.
- **deferred** — acknowledged; intentionally not fixed in this program (named reason).
- **wont-fix** — investigated; not worth changing (named reason).

---

## Start-of-session protocol (every session)

Read in this order before doing anything else:

1. `Conversations/site-bug-sweep/README.md` (this file)
2. `Conversations/site-bug-sweep/INDEX.md` (live dashboard — slice statuses)
3. `Conversations/site-bug-sweep/SESSION_LOG.md` (last 2 entries)
4. `Conversations/site-bug-sweep/00-system-map.md` (architecture reference — read the section for this session's slice)
5. Auto-memory at `~/.claude/projects/-Users-veritypost-Desktop-verity-post/memory/MEMORY.md`

Decide what to do from state. Tell the owner one paragraph: which slice, what it covers, what types of bugs the investigation will look for.

---

## Slice session protocol

When working on an individual slice:

1. **Re-read the system map** for this slice's section, including its cross-surface seams.
2. **Spawn parallel Explore agents** to read the actual code — page components, API routes, shared utilities, Supabase queries. Agents must quote `file:line` for every claim.
3. **Verify FK hints.** Any `.select()` that uses a `!foreign_key_name` hint must be cross-checked against `web/src/types/database.ts`. See FK hint rule below.
4. **Surface findings to the owner** — brief, prioritized, no noise. ≤8 bullets.
5. **If design decisions are needed**, run Q&A: one question at a time, your honest take + reasoning, wait for answer.
6. **Adversarial review.** A fresh Explore agent reads the confirmed issue list + actual code and finds gaps. Non-negotiable.
7. **Write the slice doc** to `slices/<NN>-<name>.md` — all confirmed issues with file:line citations, fix plans, and statuses.
8. **Update INDEX.md** and **append SESSION_LOG.md**.

---

## End-of-session protocol (every session)

Before stopping, write three things in this order:

1. Write or update the slice doc at `slices/<NN>-<name>.md`.
2. Update `INDEX.md` — slice status, last-touched date, any cross-surface findings.
3. Append a new entry to `SESSION_LOG.md` — date, slice, what was found, what got fixed, what's blocked, what next session picks up.

Skipping any of these leaves the next session blind. Non-negotiable.

---

## FK hint rule

Any Supabase `.select()` that uses a `!foreign_key_name` hint to disambiguate a join must be cross-referenced against `web/src/types/database.ts` under the `foreignKeyName:` field for that relationship.

The schema uses `fk_` prefixed names (e.g. `fk_blocked_users_blocked_id`), never the Supabase-auto-generated `_fkey` suffix pattern (e.g. `blocked_users_blocked_id_fkey`). A broken FK hint fails silently at query time — the join returns no rows rather than an error. Behavioral investigation alone will not catch it.

Cross-check every FK hint before declaring a query structurally sound.

---

## Decision discipline

- **One question at a time, reasoning visible.** Tell the owner what you'd pick and why, then wait.
- **No bundling.** If a question isn't ready, surface it as "not ready, need owner input on X first."
- **Don't re-open shipped issues.** If something shipped and broke again, it's a new incident.
- **Cross-surface findings go in INDEX.md**, not decided in the current slice.
- **No improvements during bug-fix sessions.** The fix is the smallest correct change. No refactors, no UX additions. Profile-bugfix memory: "genuine fixes, never patches" — full integration, no TODOs, types and callers coherent.
- **Memory rules apply** every session: no color-per-tier, no keyboard shortcuts in admin, security-only emails, no user-facing timelines.

---

## Adversarial review rule

Every slice gets one. Non-negotiable. The adversary reads the confirmed issue list and the actual code and looks for:

- Issues that were missed.
- Fix plans that are underspecified or would introduce regressions.
- FK hints that were not checked.
- Scope that's larger than the plan accounts for.

Triage results into:
- **Clarifications to absorb** — small details the implementation must handle; fold into the slice doc.
- **Decisions still needed** — real questions that surfaced; run a follow-up Q&A pass.

---

## What gets locked vs. deferred

- **Lock:** confirmed bug, root cause, fix plan, affected files and lines.
- **Defer (named):** anything the owner explicitly says "later," or bugs that require a separate design decision before a fix is possible.
- **Won't-fix (named):** investigated and decided the behavior is intentional or the fix cost exceeds value.

---

## Files in this program

```
Conversations/site-bug-sweep/
├── README.md           ← this file (rules)
├── INDEX.md            ← live dashboard (slice statuses, cross-surface findings)
├── SESSION_LOG.md      ← append-only chronological log
├── 00-system-map.md    ← full site architecture reference
└── slices/
    ├── 01-auth-gates.md        (when locked)
    ├── 02-nav-discovery.md     (when locked)
    ├── 03-article-reading.md   (when locked)
    ├── 04-engagement-social.md (when locked)
    ├── 05-messaging.md         (when locked)
    ├── 06-billing.md           (when locked)
    ├── 07-admin.md             (when locked)
    └── 08-api-crosscut.md      (when locked)
```
