# Article Lifecycle Redesign — Program Rulebook

**Started:** 2026-04-29
**Format reference:** `Conversations/Convo 1.md` (auth/login redesign — locked, completed). Slice docs in this program are shaped after that doc: narrative with reasoning, not bullet lists.

---

## What this program is

A multi-session plan-only program covering the full article lifecycle. The product has six slices that each touch how an article exists from creation to discussion:

1. **Generation** — AI-assisted drafting, the admin generation UI, the LLM pipeline that produces a draft.
2. **Publishing** — moving a draft to live, audience/visibility, scheduling, side-effects on publish.
3. **Viewing** — reader surfaces (web + iOS adult + iOS kids), citation render, ads, paywall, engagement tracking.
4. **Quizzes** — quiz authoring, taking, scoring, streaks, leaderboards, kids COPPA path.
5. **Timelines** — editorial event sequences embedded per article.
6. **Comments** — composer, threads, mentions, moderation, reports, NCMEC path.

Plus one foundation session (this one, 2026-04-29) that maps the whole surface before slice work begins.

---

## How sessions work

**One phase per session.** Don't try to barrel through. Each session reads state, advances the program by exactly one phase, writes state back, stops.

**Code only.** Read `web/src/`, `VerityPost/`, `VerityPostKids/`, `supabase/migrations/`, `vercel.json`, `package.json`. Never read `Conversations/` (except this program), `Sessions/`, `Workbench/`, `AI/`, `Reference/`, `Archived/`, `Ongoing Projects/`, `CLAUDE.md`. Never read git history.

**Plan only.** No code changes in this program, ever. Output is plan documents. Implementation happens in a separate execution program later.

**One question at a time, with reasoning visible.** Ask the owner one question, give your honest take and why, wait for the answer before moving on.

---

## Slice-status vocabulary

Each slice in `INDEX.md` carries one of these statuses:

- **not-started** — the slice doc doesn't exist; no investigation done yet.
- **investigating** — Explore agents are reading the code; findings not surfaced to owner yet.
- **questions-open** — investigation done, owner-questions surfaced, Q&A in progress, decisions not all locked.
- **adversarial-review** — owner has answered the main pass; a fresh agent is reviewing the locked plan against code.
- **locked** — slice doc exists at `slices/<NN>-<name>.md` with all decisions sealed. Don't re-open without explicit owner direction.

**Phase ordering (default).** generation → publishing → viewing → quizzes → timelines → comments. Owner can redirect any time.

---

## Start-of-session protocol (every session)

Read in this order before doing anything else:

1. `Conversations/Convo 1.md` (format and discipline reference)
2. `Conversations/article-lifecycle/README.md` (this file)
3. `Conversations/article-lifecycle/INDEX.md` (live dashboard — what's the state? **Also read the "Known implementation gaps" section before touching any implementation.**)
4. `Conversations/article-lifecycle/SESSION_LOG.md` (last 3 entries)
5. `Conversations/article-lifecycle/00-system-map.md` (foundation reference)
6. Any locked slice docs in `slices/`
7. Auto-memory at `~/.claude/projects/-Users-veritypost-Desktop-verity-post/memory/MEMORY.md`

Decide phase from state. Tell the owner one paragraph: phase, slice for this session, what's left after.

---

## Slice session protocol

When working on an individual slice:

1. **Re-read the system map**, with focus on this slice's section and its cross-surface seams.
2. **Spawn parallel Explore agents** to deepen investigation specifically for this slice — go beyond what the foundation already mapped. Find what's broken, brittle, contradictory, dead, mismatched. `file:line` for every claim.
3. **Surface findings to the owner** — brief, prioritized, no noise.
4. **Run question-by-question Q&A.** For each question: what it is, why you're asking, options, your honest take with reasoning. Wait for answer before locking.
5. **Adversarial review.** A fresh Explore agent reads the locked plan + code and finds gaps. Surface clarifications-to-absorb vs. decisions-still-needed.
6. **Write the slice doc** to `slices/<NN>-<name>.md` in the same shape as `Convo 1.md` — narrative with reasoning, not bullets.
7. **Update INDEX.md** — slice status, last-touched date, any cross-slice findings, any open owner-questions visible at the program level.
8. **Append SESSION_LOG.md.**

---

## End-of-session protocol (every session)

Before stopping, write three things in this order:

1. Update or create the slice doc / foundation doc you worked on.
2. Update `INDEX.md` — slice statuses, last-touched fields, cross-slice findings, open owner-questions visible at the program level.
3. Append a new entry to `SESSION_LOG.md` — date, phase, what you did, what got locked, what's blocked, what the next session should pick up.

If you skip any of these three, the next session starts blind. Non-negotiable.

---

## Decision discipline

- **One question at a time, reasoning visible.** Tell the owner what you'd actually pick and why, then wait.
- **No bundling.** If a question isn't ready, surface it as "not ready, need owner input on X first."
- **Never re-litigate locked decisions.** If the owner asks about something already locked, point to the slice doc + date.
- **Cross-slice findings get logged in INDEX.md, not decided in one slice.** If a finding crosses slices, defer it.
- **Memory rules apply.** No popups, no user-facing timelines, lowercase wordmark, no tier color coding, no comments-on-kids, security-only emails, etc. Read MEMORY.md every session.

---

## Adversarial-review rule

Every slice gets one. Non-negotiable, including in sessions that feel like "just documentation." The slice with the most critical finding in this program (slice 03 — broken iOS permission RPC blocking all article reads) had its adversarial review skipped. The spec for fixing it was underspecified as a result.

After the main Q&A pass closes:

- Spawn a fresh Explore agent that reads the locked plan + the actual code.
- Tell it explicitly to find what was missed.
- Triage results into:
  - **Clarifications to absorb** — small details the implementation has to handle correctly but don't change locked design. Fold into the slice doc as "absorbed" notes.
  - **Decisions still needed** — real questions that surfaced. Run a follow-up Q&A pass.

---

## What gets locked vs. deferred

- **Lock:** the redesign shape, the data-model changes, the state-machine transitions, the gates, the cross-surface contracts, the security/privacy posture, the implementation order at the slice level.
- **Defer to a final polish pass:** copy, exact placement, exact pixel-level UI details. Match Convo 1's pattern — rough copy in build, polish in a sweep before launch.
- **Defer indefinitely (named):** anything the owner explicitly says "later" or "we'll see." Capture as a named deferred item in the slice doc, not as an open question.

---

## When the program is plan-complete

All six slice docs exist with `status=locked`. Then a final session writes `SUMMARY.md` — implementation order across all slices as ordered PRs, cross-slice dependencies, owner-decision-points still open, ship sequence with greenlight checkpoints. Then stop. Implementation happens in a separate program.

---

## Files in this program

```
Conversations/article-lifecycle/
├── README.md           ← this file (rules)
├── INDEX.md            ← live dashboard (slice statuses, cross-slice findings)
├── SESSION_LOG.md      ← chronological narrative
├── 00-system-map.md    ← foundation reference (all six slices mapped)
├── slices/
│   ├── 01-generation.md     (when locked)
│   ├── 02-publishing.md     (when locked)
│   ├── 03-viewing.md        (when locked)
│   ├── 04-quizzes.md        (when locked)
│   ├── 05-timelines.md      (when locked)
│   └── 06-comments.md       (when locked)
└── SUMMARY.md          ← final implementation roadmap (when plan-complete)
```
