# Search, Browse & Categories — Program Rulebook

**Started:** 2026-04-29
**Format reference:** `Conversations/article-lifecycle/` (completed program — read it for discipline reference, especially the session log narrative style and the slice doc shape).

---

## What this program is

A multi-session plan-then-implement program covering how readers find and navigate content. The product currently has four surfaces that together handle discovery:

1. **Home** — the entry point. Hero pick, breaking strip, read-state dimming, "new" badge. Shared between web and iOS adult.
2. **Browse** — the category grid. Shows all categories with article counts and previews. Dead filter pills. No pagination.
3. **Categories** — the category system itself: schema, hierarchy, web category pages (currently missing), iOS CategoryDetailView.
4. **Search** — free-tier title-only ILIKE vs paid full-text. Advanced filters. iOS FindView. Kids search.

Plus one foundation session (this one, 2026-04-29) that maps the surface before slice work begins.

---

## How sessions work

**One phase per session.** Each session reads state, advances the program by exactly one phase, writes state back, stops.

**Code only.** Read `web/src/`, `VerityPost/`, `VerityPostKids/`, `supabase/migrations/`, `vercel.json`, `package.json`. Never read `Conversations/` (except this program and `article-lifecycle/` as format reference), `Sessions/`, `Workbench/`, `AI/`, `Reference/`, `Archived/`, `Ongoing Projects/`, `CLAUDE.md`. Never read git history.

**Plan only until the program closes.** No code changes until all slice docs are locked and the owner explicitly opens an execution program. Output is plan documents.

**One question at a time, with reasoning visible.** Ask the owner one question, give your honest take and why, wait for the answer before moving on.

---

## Structural questions — answer these in the foundation pass, before slice work begins

Lessons from `article-lifecycle`: the stories-as-containers architectural decision emerged in session 6 of 10, forcing absorbed-note rewrites on five prior slices. Structural questions belong in the foundation pass, not mid-program.

For this program, the questions to answer before opening any slice are:

- **What is the relationship between categories and stories?** Categories are currently assigned to articles (`articles.category_id`). After the stories-as-containers migration, should `story_id` be the category FK instead? Or do both coexist?
- **Is the two-tier search model (free = title ILIKE, paid = full-text) intentional long-term, or a temporary gate?** This shapes whether search is a monetization lever or purely a quality/access feature.
- **Should tags become a real surface, or be dropped?** `articles.tags` is populated but nothing reads it. Decision either way prevents planning against a ghost feature.
- **Is `view_count` the right signal for trending, or should it be something else?** The column exists and is incremented; it's never queried for ranking.
- **What's the personalization model?** `user_preferred_categories` table exists but is never populated. Is per-user category preference a goal for this program or explicitly out of scope?

These don't all need to be answered before every slice, but they need to be answered before the slice that would be affected by them.

---

## Slice-status vocabulary

Each slice in `INDEX.md` carries one of:

- **not-started** — investigation not done.
- **investigating** — Explore agents reading the code; findings not surfaced to owner yet.
- **questions-open** — investigation done, owner-questions surfaced, Q&A in progress.
- **adversarial-review** — Q&A closed; fresh agent reviewing the locked plan against code.
- **locked** — slice doc exists at `slices/<NN>-<name>.md` with all decisions sealed.

---

## Start-of-session protocol (every session)

Read in this order before doing anything else:

1. `Conversations/search-browse-categories/README.md` (this file)
2. `Conversations/search-browse-categories/INDEX.md` (slice statuses — what phase?)
3. `Conversations/search-browse-categories/SESSION_LOG.md` (last 3 entries)
4. `Conversations/search-browse-categories/00-system-map.md` (foundation reference)
5. Any locked slice docs in `slices/`
6. Auto-memory at `~/.claude/projects/-Users-veritypost-Desktop-verity-post/memory/MEMORY.md`

Tell the owner one paragraph: phase, slice for this session, what's left after.

---

## Slice session protocol

1. Re-read the system map, focused on this slice's section and its cross-surface seams.
2. Spawn parallel Explore agents to deepen investigation for this slice specifically. Find what's broken, dead, contradictory, or mismatched. `file:line` for every claim.
3. Surface findings to the owner — brief, prioritized.
4. Run question-by-question Q&A. One question at a time. Honest take with reasoning. Wait for answer before locking.
5. Adversarial review. Non-negotiable, including in sessions that feel like "just documentation." Fresh Explore agent reads the locked plan + code and finds gaps.
6. Write the slice doc to `slices/<NN>-<name>.md` — narrative with reasoning, not bullets.
7. Update `INDEX.md`.
8. Append `SESSION_LOG.md`.

---

## End-of-session protocol (every session)

Before stopping, write three things:

1. Update or create the slice doc / foundation doc.
2. Update `INDEX.md` — slice statuses, last-touched fields, cross-slice findings, open owner-questions.
3. Append a new entry to `SESSION_LOG.md` — date, phase, what happened, what got locked, what's blocked, what next session picks up.

Skipping any of these leaves the next session blind.

---

## Decision discipline

- **One question at a time, reasoning visible.** Tell the owner what you'd actually pick and why, then wait.
- **No bundling.** If a question isn't ready, surface it as "not ready, need owner input on X first."
- **Never re-litigate locked decisions.**
- **Cross-slice findings go in INDEX.md**, not decided within one slice.
- **Memory rules apply.** No color-per-tier, no user-facing timelines, no keyboard shortcuts in admin, security-only emails, etc. Read MEMORY.md every session.

---

## Adversarial-review rule

Every slice gets one. Non-negotiable.

After the main Q&A pass closes:
- Spawn a fresh Explore agent that reads the locked plan + actual code.
- Tell it explicitly: find what was missed, find where the spec and code disagree.
- Triage into: **clarifications to absorb** (fold into slice doc) vs. **decisions still needed** (run follow-up Q&A).

---

## What gets locked vs. deferred

- **Lock:** redesign shape, data-model changes, state-machine transitions, gates, cross-surface contracts, security/privacy posture, implementation order.
- **Defer to polish pass:** exact copy, pixel-level UI details.
- **Defer indefinitely (named):** anything the owner says "later." Capture as a named deferred item.

---

## When the program is plan-complete

All four slice docs exist with `status=locked`. A final session writes `SUMMARY.md` — implementation order as ordered PRs, cross-slice dependencies, open owner decision-points, ship sequence. Then stop. Execution is a separate program.

---

## Files in this program

```
Conversations/search-browse-categories/
├── README.md           ← this file (rules)
├── INDEX.md            ← live dashboard
├── SESSION_LOG.md      ← chronological narrative
├── 00-system-map.md    ← foundation reference
├── slices/
│   ├── 01-home.md         (when locked)
│   ├── 02-browse.md       (when locked)
│   ├── 03-categories.md   (when locked)
│   └── 04-search.md       (when locked)
└── SUMMARY.md          ← final implementation roadmap (when plan-complete)
```
