# Article UX Audit — Program Rulebook

**Started:** 2026-04-30
**Format reference:** `Conversations/site-bug-sweep/` (discipline model) and `Conversations/article-lifecycle/` (multi-session program structure).

---

## What this program is

A systematic UX audit of the Verity Post article reading experience — from the moment a reader sees a card on the home page to the moment they leave (or choose to stay). The site-bug-sweep program looks for silent failures and broken code. This program looks for **confusion, friction, and missing polish**: flows that technically work but feel unclear, incomplete, or forgettable.

The scope is the full reading journey:
1. Home page card layout — first impression, hierarchy, card readability
2. Story page and article reading — core reading experience, article switching, sources and timeline
3. Quiz experience — pre-start through pass/fail, locked composer gate
4. Discussion and comments — thread, composer, expert inline rendering
5. Ask-an-expert — reader question through surfaced answer, back-channel
6. Post-read engagement — what pulls a reader back after they finish

This is not a bug-sweep. A "finding" here might be an affordance that's too easy to miss, a transition that lacks feedback, a locked state with insufficient explanation, or an empty state that feels like a dead end. The test is: **does this move the engagement bar?** (See below.)

---

## How this differs from the bug-sweep

| Site bug-sweep | Article UX audit |
|---|---|
| Silent failures, broken queries, dead code | Confusion, friction, polish gaps |
| Root cause: code is wrong | Root cause: UX is unclear or unfinished |
| Fix: smallest correct code change | Fix: design decision first, then implementation |
| 6-agent ship pattern applies | Same ship pattern, but design Q&A comes first |
| FK hint rule is mandatory | FK hint rule still applies to any query touched |

Any code fix that emerges from this program must still follow the 6-agent ship pattern (4 pre-impl + 2 post-impl). If a finding turns out to be a code bug rather than a UX issue, defer it to the site-bug-sweep program or fix it in an implementation session with full discipline.

---

## The engagement bar

The owner's quality floor (stated 2026-04-27):
- **90%+ retention** on agent-touched features
- **~100%/day growth** target on engagement signals

Every finding in this program should be evaluated against one question: **does fixing this move one of those numbers?** If yes, it's a real finding. If it's aesthetic-only with no plausible retention or engagement impact, it's deferred or won't-fix.

Bias toward polish over ship-now. Craft compounds unusually fast on this product.

---

## How sessions work

**One slice per session.** Read state, advance by exactly one slice, write state back, stop.

**UX-first.** The investigation asks: what does a reader experience? Map each user state (anon, free, pro, quiz-passed, quiz-failed, expert) through every visible element of the slice. Findings are about the reader's experience, not the code.

**Design decisions before implementation.** Any finding that requires a choice — what should happen here? what should be shown? — surfaces as a Q&A item before any code is touched.

**Code verification still mandatory.** Before a fix is planned, read the relevant file:line and verify the current behavior matches the investigation description.

**6-agent ship pattern for implementation.** When an investigation session produces findings that are ready to implement, a separate implementation session follows the full pattern: 4 pre-impl agents (investigator → planner → big-picture reviewer → adversary) + 2 post-impl agents (verifier + end-to-end checker).

**Adversarial review per slice.** After the main findings pass, a fresh agent reads the confirmed issue list and the actual code and looks for missed gaps, underspecified plans, and regressions. Non-negotiable.

---

## Slice-status vocabulary

Each slice in `INDEX.md` carries one status:

- **not-started** — no investigation done yet.
- **investigating** — Explore agents are reading code and mapping user states; findings not yet surfaced.
- **findings-open** — investigation done; findings surfaced to owner; design Q&A in progress if decisions needed.
- **adversarial-review** — main findings pass closed; a fresh agent is reviewing the confirmed issue list against code.
- **locked** — all findings confirmed, design decisions made, fix plans sealed; ready for an implementation session. Issue list lives in the slice doc.

Issue statuses (within a slice doc):

- **found** — identified in investigation; design decision not yet made.
- **decided** — design decision made; fix plan written; not yet implemented.
- **shipped** — code merged and pushed; commit hash recorded.
- **deferred** — acknowledged; intentionally not in scope for this program (named reason).
- **wont-fix** — investigated; engagement impact too low or behavior is intentional (named reason).

---

## Start-of-session protocol (every session)

Read in this order before doing anything else:

1. `Conversations/article-ux/README.md` (this file)
2. `Conversations/article-ux/INDEX.md` (live dashboard — slice statuses)
3. `Conversations/article-ux/SESSION_LOG.md` (last 2 entries)
4. `Conversations/article-ux/00-system-map.md` (architecture reference — read the section for this session's slice)
5. Auto-memory at `~/.claude/projects/-Users-veritypost-Desktop-verity-post/memory/MEMORY.md`

Decide what to do from state. Tell the owner one paragraph: which slice, what it covers, what the investigation will look for.

---

## Slice session protocol

When working on an individual slice:

1. **Re-read the system map** for this slice's section, including cross-surface seams.
2. **Map user states first.** For each state (anon / free / pro / quiz-passed / quiz-failed / expert), walk the slice's screens mentally: what does a reader in that state see? What can they do? What might confuse them?
3. **Spawn parallel Explore agents** to read the actual code and verify the mapping against implementation. Agents must quote `file:line` for every claim.
4. **FK hint rule applies.** Any `.select()` with a `!foreign_key_name` hint must be cross-checked against `web/src/types/database.ts`. See FK hint rule below.
5. **Surface findings to the owner** — brief, prioritized, no noise. ≤8 bullets. Each finding gets: what a reader experiences, why it's a problem for retention/engagement, and the suspected root cause.
6. **Run design Q&A for any finding that needs a decision.** One question at a time: one context sentence + your honest take + one ask. Wait for owner answer before the next question.
7. **Adversarial review.** A fresh Explore agent reads the confirmed issue list and the actual code. Non-negotiable.
8. **Write the slice doc** to `slices/<NN>-<name>.md` — all confirmed findings with file:line citations, design decisions, fix plans, and statuses.
9. **Update INDEX.md** and **append SESSION_LOG.md**.

---

## End-of-session protocol (every session)

Before stopping, write three things in this order:

1. Write or update the slice doc at `slices/<NN>-<name>.md`.
2. Update `INDEX.md` — slice status, last-touched date, any cross-surface findings.
3. Append a new entry to `SESSION_LOG.md` — date, slice, what was found, what design decisions were made, what's blocked, what next session picks up.

Skipping any of these leaves the next session blind. Non-negotiable.

---

## FK hint rule

Any Supabase `.select()` that uses a `!foreign_key_name` hint to disambiguate a join must be cross-referenced against `web/src/types/database.ts` under the `foreignKeyName:` field for that relationship.

The schema uses `fk_` prefixed names (e.g. `fk_comments_user_id`), never the Supabase-auto-generated `_fkey` suffix pattern (e.g. `comments_user_id_fkey`). A broken FK hint fails silently — the join returns no rows rather than an error.

Known-fixed mismatches (do not re-investigate):
- `users!user_id` → `users!fk_comments_user_id` — fixed in site-bug-sweep slice 03 (`8166fde`)

---

## Decision discipline

- **One question at a time, reasoning visible.** Tell the owner what you'd pick and why, then wait.
- **No bundling.** If a question isn't ready, surface it as "not ready, need owner input on X first."
- **Don't re-open shipped issues.** If something shipped and broke again, it's a new incident.
- **Cross-surface findings go in INDEX.md**, not decided in the current slice.
- **No improvements during implementation sessions.** The fix is the smallest correct change that addresses the confirmed UX finding. No refactors, no additional polish. "Genuine fixes, never patches" — full integration, types and callers coherent, no TODOs.
- **No code during investigation/Q&A.** Findings sessions surface and decide. Implementation sessions build.

---

## Memory rules — apply every session

These are non-negotiable constraints from owner-stated memory. Apply them without being asked:

- **No color-per-tier.** Tiers don't get distinct hues — no rainbow, no muted ramp, no gradient. Tier is a label, not a visual identity. Reject any reviewer or agent suggestion of color-coded ranks.
- **No user-facing timelines.** No "coming soon," "in the next pass," or future tense in any copy, status text, or anything shippable. Describe present state only.
- **Lowercase wordmark.** The product is "verity post" (lowercase) everywhere the wordmark appears.
- **Security-only emails.** Password reset, email verify, billing receipts, and deletion notices only. No UI promising follow/reply/digest emails.
- **No keyboard shortcuts in admin UI.** Admin flows are click-driven only. No hotkeys, no command palettes.
- **Kids scope is iOS only.** Kids web is redirect-only. No UX work on the kids web surface.
- **Launch-phase features are kill-switched, not deleted.** Hide via gates, keep state and queries alive.

---

## Adversarial review rule

Every slice gets one. Non-negotiable. The adversary reads the confirmed finding list and the actual code and looks for:

- Findings that were missed.
- Fix plans that are underspecified or would introduce regressions.
- User states that were not fully covered (especially anon and expert).
- Scope that's larger than the plan accounts for.

Triage results into:
- **Clarifications to absorb** — small details the implementation must handle; fold into the slice doc.
- **Decisions still needed** — real design questions; run a follow-up Q&A pass.

---

## What gets locked vs. deferred

- **Lock:** confirmed UX finding, design decision made, fix plan sealed, affected files and lines cited.
- **Defer (named):** anything the owner explicitly says "later," or findings that require a separate program or milestone before they can be addressed.
- **Won't-fix (named):** investigated and decided the behavior is intentional, or the engagement impact is too low to justify the change.

---

## Files in this program

```
Conversations/article-ux/
├── README.md           ← this file (rules)
├── INDEX.md            ← live dashboard (slice statuses, cross-surface findings)
├── SESSION_LOG.md      ← append-only chronological log
├── 00-system-map.md    ← full reading-experience architecture reference
└── slices/
    ├── 01-home-cards.md          (when locked)
    ├── 02-story-reading.md       (when locked)
    ├── 03-quiz.md                (when locked)
    ├── 04-discussion.md          (when locked)
    ├── 05-ask-an-expert.md       (when locked)
    └── 06-post-read.md           (when locked)
```
