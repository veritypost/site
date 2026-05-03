# UI/UX Review — Entry Doc

This is the read-once-and-forget orientation. The three docs that get loaded every session are PRINCIPLES, DECISIONS, INDEX (below).

## Doc map

- `UI_UX_REVIEW_PRINCIPLES.md` — non-negotiable rulebook. Every session applies it silently.
- `UI_UX_REVIEW_DECISIONS.md` — locked Q&A ledger. Grows once per question, never relitigated.
- `UI_UX_REVIEW_INDEX.md` — numbered units, wave grouping, status. Source of truth for "where are we."
- `UI_UX_REVIEW_NEXT.md` — single-line cursor. Tells the model which unit + anchor to resume at. Auto-updated.
- `UI_UX_REVIEW_SLICES.md` — execution plan when a unit's findings exceed in-session fix scope. Per-slice prerequisites, scope, file paths, test plans, decisions consumed. Pointed at by `NEXT.md` once unit-review enters build-ready state.
- `UI_UX_REVIEW/<wave>-<n>-<slug>.md` — per-unit findings + fixes. Created lazily when a unit is reviewed.
- `UI_UX_REVIEW_OUT_OF_WAVE.md` — drift bin. Findings spotted outside the active unit. Triaged at wave-end, not mid-session.

## ⭐ The only prompt you need (paste every session)

```
Continue UI/UX review per UI_UX_REVIEW.md.
```

That's it. The model reads this file, the cursor (`NEXT.md`), the rulebook (PRINCIPLES + DECISIONS + INDEX), and the current unit's own doc, then resumes at the anchor. No paths, no unit numbers, no setup. Same prompt every time.

## Session Continuation Protocol

When the model receives the continuation prompt, it executes this sequence:

1. **Load state.** Read `UI_UX_REVIEW_NEXT.md` + `UI_UX_REVIEW_SLICES.md` + `UI_UX_REVIEW_PRINCIPLES.md` + `UI_UX_REVIEW_DECISIONS.md` + `UI_UX_REVIEW_INDEX.md`.

2. **Determine next valuable action.** Pick ONE from this priority order — the first match wins:

   **(a) Unblocked Foundation slice not yet started** → execute it (e.g., Slice 1 god_mode rename, Slice 2 subcategory schema). Foundation slices block downstream work.

   **(b) Cross-cutting sweep candidate hit (5+ units share a pattern)** → run sweep slice ahead of the next unit-fix slice. Sweep candidates accumulate in `INDEX.md` `Sweep candidates` section. Auto-promote when threshold hit.

   **(c) Any unit at `findings` with decisions locked + slice prereqs met** → execute its fix slice. Run the slice through the full Per-Slice Required Passes stack (pre-flight verification → implementers → adversary if elevated-care → build verification → smoke test).

   **(d) Any unit at `fixed` awaiting verification** → run the unit's verification pass.

   **(e) Cursor unit (`CURRENT_UNIT` in NEXT.md) at `pending` or `in-review`** → run review (multi-agent independent pass + 3-expert panels for owner-decision questions + lock decisions per panel auto-lock rule). Default: lock decisions and proceed to fix slice in the same or next session.

   **(f) All units in current wave at `verified`** → run the wave's verification slice (e.g., Slice 10 = Wave A verification).

3. **Confirm orientation.** State in one line what's about to run: e.g., "Running Slice 1 — god_mode rename." or "Reviewing Unit 3 — Browse."

4. **Execute the action.**
   - **Reviews:** create unit doc from template (or load existing), walk surfaces, log findings with `[status]` field (`logged | confirmed | refuted | fixed | verified | deferred | wontfix | duplicate`), dispatch 3 reviewers in parallel (5 for deep-coverage units), merge net-new, run 3-expert panels per owner-decision question, apply panel auto-lock rule (auto-lock convergent panels; surface only divergent / elevated-care). For panels surfaced to owner, use the mandated three-part format and stop the session for adjudication.
   - **Fix slices:** read the slice's per-finding fix recipes from `SLICES.md`. Run through the full **Per-Slice Required Passes** stack (above): pre-flight verification → implementer streams (4-stream parallel for big slices, single-stream for mechanical slices) → adversary pass if elevated-care → build verification → smoke test → state update. Session never auto-marks slice complete if any pass failed.
   - **Verifications:** walk the slice/unit/wave's verification matrix. Read-only. Log any bugs to `UI_UX_REVIEW/slice-<n>-bugs.md` or `UI_UX_REVIEW/A-wave-verification-bugs.md`. Blocking bugs roll into the next fix-pass; non-blocking bugs roll into the next slice's scope.

5. **Auto-update state at every meaningful step.** After each finding logged, after each fix shipped, after each interruption handled — update the unit doc/slice doc AND update `ANCHOR` in `NEXT.md` so a hard exit is recoverable.

6. **Token-pacing — end session at natural boundaries.** Sessions end when:
   - The current action (review / fix slice / verification) completes naturally, OR
   - Context approaches limits, OR
   - An owner-adjudication question requires input.
   
   At session end:
   - Update unit/slice status (e.g., `pending → findings → fixed → verified`).
   - Update INDEX row's status column where applicable.
   - Update SLICES.md slice tracking-table status.
   - Advance `NEXT.md` cursor: if a slice completes, point cursor at the next slice in dependency order; if a unit reaches `verified`, advance to the next pending unit.
   - Tell the owner: "<Action> complete. Next up: <next action>. Paste the continuation prompt to start."

7. **On session end without action completion** — update `ANCHOR` to a precise resume point, save state, summarize what's left in 2 lines.

The cursor + unit doc + slice doc together hold all state. Conversation history is not load-bearing — a fresh session can resume from the files alone. **The owner pastes the same prompt every time** (`Continue UI/UX review per UI_UX_REVIEW.md.`); the protocol auto-detects what's next and executes it.

**Default mode after Foundation slices land:** review + fix interleaved per unit. Each unit completes (review → decisions → fix → verify) before the next begins. Cross-cutting slices fire when sweep candidates hit threshold; cross-platform slices (e.g., parity bridges) fire when web-side reaches verified state. This avoids the "1000s of fixes piled up at end" failure mode.

## Per-Slice Required Passes (mandatory before any slice ships)

Every fix slice (Foundation / Unit-fix / Cross-cutting) MUST run through this stack of passes. The session never ships a slice on the implementer's word alone. **The adversary and verification agents look at the code on their own — they do NOT see the implementer's diff or summary.** Their job is to find what's missing, not confirm what's there.

**Each pass dispatches a named subagent in `.claude/agents/`. The subagent has its model pinned in frontmatter — the session orchestrator does NOT need to switch models manually. Subagent output is what the orchestrator reads back; intermediate reasoning stays inside the subagent.**

| Pass | Named subagent | Pinned model | When |
|---|---|---|---|
| Pre-flight finding verification | `finding-verifier` | Haiku 4.5 | Before every fix slice |
| Implementer streams (4-stream parallel for big slices) | `fix-implementer` | Sonnet 4.6 | The fix-pass itself |
| Adversary | `adversary` | Opus 4.7 | Mandatory for elevated-care slices |
| Build verification | `build-verifier` | Haiku 4.5 | After implementers; type-check + lint + sentinel grep |
| Smoke test | `smoke-tester` | Haiku 4.5 | After build verification; dev server + key routes |
| Per-unit independent review (3-or-5 reviewers) | `independent-reviewer` | Sonnet 4.6 | During unit reviews |
| Per-question expert panel | `panel-expert` | Sonnet 4.6 | Owner-decision questions in reviews |
| Surface inventory | `inventory-scanner` | Haiku 4.5 | At the start of every unit review |
| Cross-cutting sweep execution | `sweep-executor` | Sonnet 4.6 | When a sweep is auto-promoted |

**Cost shape:** orchestrator on Sonnet 4.6 by default; Opus only for adversary on elevated-care slices and the rare orchestrator-judgment moment. Haiku does the volume work (verification, inventory, smoke). This keeps the per-slice spend in the right band.

**1. Pre-flight finding verification (before fix-pass starts).**

Dispatch the `finding-verifier` subagent (Haiku 4.5, defined in `.claude/agents/finding-verifier.md`) with the slice's findings list + cites. Refuted findings are dropped from the slice scope (mark `[REFUTED]` in the unit doc, don't fix). Drifted findings (line moved) get the cite updated. Without pre-flight, the implementer wastes work on findings that no longer apply.

**2. Implementer streams (the fix-pass itself).**

Dispatch the `fix-implementer` subagent (Sonnet 4.6) per stream. For slices with 5+ fixes across 5+ files: 4 parallel `fix-implementer` calls in one orchestrator message, each with non-overlapping file ownership (Streams A/B/C/D from the slice's recipe section). For mechanical slices (god_mode rename), single-stream is fine.

The subagent's system prompt enforces:
- Strict file-ownership (no edits outside the stream's files)
- Drift detection (stop and flag if "before" state doesn't match the recipe)
- No drive-by improvements outside the recipe

Orchestrator collects all streams' diffs, confirms no boundary violations.

**3. Adversary pass (elevated-care slices: MANDATORY; other slices: recommended).**

Dispatch the `adversary` subagent (Opus 4.7, defined in `.claude/agents/adversary.md`). This is the "look on your own" pass. The adversary subagent's system prompt explicitly forbids reading the implementer's diff. The orchestrator gives it ONLY:
- The slice's INTENT (2-3 sentences)
- The locked DECISIONS that govern the slice
- The file scope (where to look)
- The relevant failure-mode template from the agent's system prompt (RBAC / migration / payments / kid-safety / auth)

The adversary returns: `"SHIP-READY, here's what I checked"` OR `"GAPS FOUND — DO NOT SHIP UNTIL ADDRESSED: <list with file:line>."` Gaps must be addressed before ship.

**Elevated-care slices (adversary mandatory):**
- RBAC / permission renames / Owner Mode work
- Payments / billing / subscription state changes
- Kid safety / COPPA / parental gate work
- Data deletion / appeal / restricted-account state
- Authentication flows (login, signup, password reset, MFA)
- Migration scripts that touch existing user/perm/article rows
- Anything that, if subtly broken, would lock owner out of admin OR violate user trust

For every slice in SLICES.md, the slice header marks `Elevated-care: yes/no`. Default: no. The session checks at slice-open time and dispatches adversary if yes.

**Adversary failure-mode templates (extend per slice type):**

- *RBAC / perm rename adversary:* check RLS policies referencing the literal old-key string in `USING(...)` clauses; check `permission_set_items` / `user_permissions` / `role_permissions` / any other text-storing table; check JWT claim invalidation strategy; check iOS Keychain/UserDefaults cached perm strings; check casing variants of the renamed identifier; check audit log historical rows (leave intact); check docs/comments; check webhook payloads or external integrations.
- *Schema migration adversary:* check FK cascade behavior; check existing data that may violate new constraints; check RLS policies that need to extend to new tables; check `database.ts` regen lag; check seed-data inserts; check that `mcp__supabase__list_tables` confirms landing.
- *Payments / billing adversary:* check Stripe webhook idempotency; check refund / proration paths; check tier-state in cached JWT; check renewal cron; check dunning flow; check tax handling.
- *Kid safety / COPPA adversary:* check parental-gate bypass paths; check pairing-code reuse; check kid-content adult-leak paths; check ad-network behavioral-targeting flags.
- *Auth flow adversary:* check session invalidation on password reset; check MFA enrollment race; check OAuth callback redirect-validation; check token refresh during password change.

**4. Build verification pass (every slice, automatic).**

Dispatch the `build-verifier` subagent (Haiku 4.5). Type-check, lint, sentinel grep (e.g., zero `god_mode` after Slice 1), file-existence checks. Returns pass/fail per check. Fail = block ship.

**5. Inter-slice smoke test (every slice, automatic).**

Dispatch the `smoke-tester` subagent (Haiku 4.5). Boots `bun --cwd web dev`, hits ~5 critical routes, confirms zero console errors / hydration errors / 500s. Failures logged to `UI_UX_REVIEW/slice-<n>-bugs.md`.

**6. Per-slice bug doc.**

Auto-create `UI_UX_REVIEW/slice-<n>-bugs.md` whenever any pass returns "found these gaps" or smoke test logs an error. Bugs that block ship roll into the slice's fix-pass; bugs that don't block ship roll into the next slice's scope.

**Order of passes per slice:**

```
finding-verifier (Haiku) → fix-implementer × N streams (Sonnet) → (adversary [Opus] if elevated-care) → build-verifier (Haiku) → smoke-tester (Haiku) → orchestrator updates state files → marks slice complete → owner-facing summary
```

Session never auto-marks a slice complete if any pass failed. Owner is informed; the slice stays open until the gaps are closed in the next fix-pass.

**How the orchestrator dispatches subagents.** The orchestrator (whatever model is running the session) calls each subagent by name. It does NOT need to know the subagent's model — that's pinned in the agent file's frontmatter. Subagents return their results to the orchestrator's context; their intermediate reasoning + tool calls stay inside the subagent. This keeps the orchestrator's context light and lets cheap models do volume work without burning Opus on grep + type-check.

---

## Sweep auto-promotion (cross-cutting patterns)

When a finding pattern appears in 5+ unit docs, the next session auto-promotes it to its own sweep slice. Tracking lives in `UI_UX_REVIEW_INDEX.md` "Sweep candidates" section. When a candidate hits 5+ unit references, the auto-detect protocol fires the sweep slice ahead of the next unit-fix slice.

Sweep slice template:
- Single concern across N files (e.g., `dark-mode-token-sweep` = swap all hardcoded hex for `var(--*)` tokens)
- Owns ALL matching call sites across the codebase
- Single implementer agent + adversary pass (sweeps are typically simple but high-volume, so adversary catches missed instances)
- Build verification + smoke test as standard

---

## Panel auto-lock rule (reduce owner load on convergent decisions)

Panels (3 experts per owner-decision question) auto-lock when:
- All 3 experts converge on the same answer (3/3), OR
- 2/3 converge and the dissenter explicitly says "I prefer X but Y is acceptable" (soft dissent)

Panels surface to owner only when:
- 3/3 disagree (genuine divergence), OR
- 2/3-with-dissenter-rejecting (hard dissent), OR
- The decision is locked-decision-grade (RBAC, payments, kid safety, anything in elevated-care list).

Auto-locked decisions still write to DECISIONS.md, just without owner adjudication. Owner is informed via the slice's owner-facing summary ("auto-locked decisions: #048 (heading + tease pattern), #049 (hide reason required)"). Owner can override post-hoc by editing DECISIONS.md.

---

## Multi-Agent Independent Review Protocol (3 reviewers per unit, mandatory)

A single Opus pass over a surface misses things — different lenses catch different gaps. Every per-unit review session MUST include a multi-agent independent pass before findings are considered complete.

1. **Main session does its own review pass first.** Read code, log findings to the unit doc.
2. **Dispatch 3 `independent-reviewer` subagents in parallel** (single orchestrator message, 3 parallel Agent calls — Sonnet 4.6). Each call passes:
   - The same surfaces (paths to all relevant files, including chrome wrappers).
   - A DIFFERENT lens: typically (a) accessibility + visual system + dark-mode parity, (b) state coverage matrix (auth tier × data state × user-flag × permissions hydration), (c) interaction + edge cases (race conditions, hydration mismatches, mobile viewports, copy bugs, dead code).
   - The locked PRINCIPLES + DECISIONS + already-locked constraints that should NOT be flagged.
   
   The `independent-reviewer` system prompt enforces the "don't read UI_UX_REVIEW*.md" independence rule and the 25-finding cap. Returns findings as `[SEV] one-line — file:line` format.
3. **Main session merges** — dedupe against own findings, add net-new ones to the unit doc, escalate cross-cutting ones to `UI_UX_REVIEW_OUT_OF_WAVE.md`.
4. **Re-evaluate question list** — new findings may surface new owner-decision questions. Run the 3-expert panel (below) on those before the fix pass.

**Why three reviewers, not one or five.** One reviewer = single perspective, misses ~30%+ of findings (proven on Unit 1). Three lenses (a11y, state, edge cases) cover the bulk of what matters for UI/UX without diminishing returns. Five only justified for deep-coverage units with complex role × state matrices (per INDEX).

**Deep-coverage units** (8 of 55, listed in INDEX) get 5 reviewers: add (d) role × state × permission matrix coverage and (e) cross-platform parity audit.

**Never:** declare a unit's findings list complete without the multi-agent pass. The single-reviewer mode was retired 2026-05-02 after Unit 1 surfaced ~30 missed findings on the second pass.

## Owner-Decision Triage Protocol (3-expert panel per question)

Whenever the review surfaces a question that needs an owner judgment call (empty-state copy, dead-link policy, redundancy resolution, gate-vs-drop, etc.), the main session **does not ask the owner directly**. Instead:

1. **Collect questions.** Finish the unit's findings pass. Group every owner-decision item into a numbered question list.
2. **Dispatch 3 `panel-expert` subagents per question, in parallel** (single orchestrator message, 3 parallel Agent calls — Sonnet 4.6). For each question, the orchestrator briefs each agent as a different domain expert relevant to that specific question (e.g. "newspaper editorial UX expert", "consumer empty-state conversion expert", "accessibility / hit-target expert"). The three experts per question are chosen to cover the **distinct angles the answer actually depends on** — not three clones of the same lens.
3. **Each expert prompt must include:** the lens the agent embodies, the question, the relevant code cite, the locked PRINCIPLES + DECISIONS that constrain the answer, and the answer options. The `panel-expert` system prompt enforces the 200-word cap + the three-field response shape: (1) recommended answer, (2) rationale, (3) tradeoff.
4. **Synthesize.** Main session reads all three responses per question, surfaces convergence and divergence to the owner in a tight format: question → 3 expert recommendations summarized in one line each → main session's own synthesized recommendation → ask owner to confirm or override.
5. **Lock the answer.** Once owner picks, append the answer to `UI_UX_REVIEW_DECISIONS.md` if it's a recurring pattern, or to the unit doc if it's one-off. Then proceed to fix pass.

**Why three, not one or five.** Three is the smallest panel that surfaces real disagreement (a single agent gives a confident-but-narrow answer; two ties unhelpfully). Five is wasteful unless the question is genuinely cross-cutting. Default to three; escalate to five only when 3/3 disagree or the question is locked-decision-grade.

**Never:** bring an owner-decision question to the owner without running the panel first. The panel produces the synthesis; the owner adjudicates the synthesis. This keeps owner attention on calls only humans can make and prevents the main session from anchoring the owner on a single perspective.

**Always default to dispatch.** Do NOT ask the owner for permission before running panels — running the panels IS the protocol. The owner reviews the synthesis when it lands, not the decision to run them. Lock-rule established 2026-05-02.

**Owner approval format (mandatory before any decision is locked).** When surfacing a panel synthesis to the owner for adjudication, present each question in this exact three-part shape — never lock anything to DECISIONS.md until the owner has explicitly approved or modified each one:

```
**Q<n> — <short title>**
- **Question:** <the question that was asked, verbatim or near-verbatim>
- **Why it was asked:** <what finding / observation / state the question came from — file:line if applicable>
- **Recommended answer:** <synthesized panel recommendation, including key per-flag/per-state breakdown if relevant>
```

Owner replies with "approve" / "change to X" / "skip" per question. Only after explicit approval does a decision land in DECISIONS.md (if recurring) or the unit doc (if one-off). Never auto-lock; never present a flat "here's the synthesis" without the why; never bundle approvals. Lock-rule established 2026-05-02.

## Mid-Session Interruption Protocol

The owner WILL ask ad-hoc questions during per-unit sessions. The main session **must not derail** — its job is the current unit. Interruptions are absorbed by spawning a subagent that does the actual writing/researching while the main session keeps reviewing.

**Anchor discipline (always).** Before responding to any interruption: "Pausing unit #N at <anchor>. Handling: <bucket> via subagent." After handling: "Returning to unit #N at <anchor>." Before continuing review, **re-read the file the subagent touched** so the main session's view is fresh.

**The 5 buckets — each handled by a dedicated subagent:**

1. **In-scope for this unit** → handle inline (no subagent needed). Integrate into findings/fixes, log in unit doc, continue.

2. **New standing rule** (applies to many future units) → spawn subagent: "Draft a new PRINCIPLE/DECISION entry for: <ask>. Read PRINCIPLES + DECISIONS first to avoid duplicating. Write the entry to the right file. Surface 1-sentence summary for owner confirmation." Main session continues review in parallel. On return, owner confirms, main re-reads the rule file, applies retroactively to unreviewed items in this unit.

3. **Revises a locked rule** (contradicts existing PRINCIPLE/DECISION) → spawn subagent: "Append a NEW DECISION that supersedes #<X>. Read the prior entry; write the supersession with explicit reference. Update memory if affected." Main re-reads DECISIONS on return.

4. **Cross-cutting** (would repeat across 5+ units) → spawn subagent: "Append a sweep candidate to UI_UX_REVIEW_OUT_OF_WAVE.md describing: <pattern>." Main session continues; logs "deferred — see sweep candidate <name>" in the current unit doc on subagent return.

5. **Different unit entirely** → spawn subagent: "Append the following queued question to UI_UX_REVIEW/<wave>-<n>-<slug>.md (create the file from template if missing): <question>." Main session continues without further context shift.

**Why subagents:** the main session's context is the current unit's surfaces and findings. Researching/drafting/writing for an unrelated concern would push that context out. Subagents inherit only what they need, return only the file path they wrote, and keep the main session's working memory clean.

**Never:** silently expand scope, drop the interruption, defer with "I'll think about it," or do the bucket-2/3/4/5 work inline (it pollutes the main review's context — always delegate).

## State Freshness Discipline

State files (`NEXT.md`, current unit doc, PRINCIPLES, DECISIONS, INDEX) can change DURING a session — owner edits them, subagents write to them, the main session itself updates them. Drift between what's on disk and what the main session "remembers" is the #1 failure mode.

**Re-read rules:**

1. **At session start** — always read NEXT.md + PRINCIPLES + DECISIONS + INDEX + current unit doc. Don't trust any prior session's memory.
2. **After every subagent returns** — re-read the file(s) the subagent claims to have written. The subagent's summary describes intent, not necessarily what landed.
3. **After every meaningful step in the review** (finding logged, fix landed, interruption handled) — update `ANCHOR` in NEXT.md AND in the current unit doc. The two anchors must agree at all times.
4. **Before answering an owner question that depends on locked state** — re-read the relevant DECISION or PRINCIPLE entry. Don't quote from memory; quote from disk.
5. **At session end** — final write to NEXT.md and unit doc with a precise anchor + 2-line summary of what's left.

**Stale-state symptom check.** If the model finds itself disagreeing with a file (e.g., "I just wrote DECISION #021 but it's not in the file"), STOP. Re-read the file. Trust disk over memory. Memory is wrong.

**Concurrent-edit safety.** If owner edits a file while a subagent is writing it, the subagent's write may overwrite owner edits. Subagents must use Edit (not Write) on existing files, with surgical replacements. Only Write a brand-new file.

## How to start a review session

Just paste:

```
Continue UI/UX review per UI_UX_REVIEW.md.
```

The model handles everything else via the Session Continuation Protocol above.

(Override only if needed: to manually jump to a different unit, edit `UI_UX_REVIEW_NEXT.md` and set `CURRENT_UNIT` + `CURRENT_DOC` + `STATUS: pending`, then paste the continuation prompt.)

## Per-unit doc template

When starting a unit, create `UI_UX_REVIEW/<wave>-<n>-<slug>.md` with this shape:

```
# Unit <N> — <Title>

**Surface(s):** <file paths or routes>
**Status:** in-review | findings | fixed | verified
**Date:** YYYY-MM-DD
**Anchor:** <where the last session ended; updated every meaningful step>

## Queued questions
*(populated by Mid-Session Interruption Protocol bucket #5 from other units' sessions)*
- <question text> — from session YYYY-MM-DD
- ...

## Findings
1. [SEV] <one-line> — `path/to/file.tsx:123` — violates PRINCIPLE §X / DECISION #Y
2. ...

## Fixes
- Finding 1 → commit <sha or "pending">
- ...

## Mid-session log
*(every interruption logged; bucket label + outcome)*
- 2026-MM-DD — bucket 2 (new rule) → DECISION #021 added
- 2026-MM-DD — bucket 4 (cross-cutting) → sweep candidate "form-error-summary"
- ...

## Deferred / sweep
- <finding> → moved to sweep unit #<N>
```

SEV = `crit` (broken/blocks task) | `polish` (visual) | `parity` (cross-platform inconsistency).

## Efficiency rules (applies to execution sessions)

These exist so Opus 4.7 doesn't get burned on mechanical work.

1. **Three docs loaded, nothing else.** Per session: PRINCIPLES + DECISIONS + INDEX + unit's own doc + the actual code files for that unit. Don't read sibling units' code unless the principle requires cross-checking.
2. **Delegate inventory work to subagents.** Code surveys, screen-by-screen audits, "find every place X happens" — Explore agent. Keeps main context tight.
3. **Findings cite, don't quote.** `file.tsx:42` not 200-line code blocks. Doc stays reviewable.
4. **Sweep > scatter.** If a principle violation appears across 5+ units, it's one sweep unit, not five separate fixes. Log it once and move on.
5. **Downshift the model when work is mechanical.** "Apply principle §X to file Y" is Sonnet 4.6 / Haiku 4.5 work. Opus 4.7 only for: principles-seeding session, novel judgment calls, ambiguous findings. `/model` switches per session.
6. **Per-unit doc stays under ~80 lines.** If it grows, the unit was probably two units.
7. **No re-asking what's locked.** If a question would recur across units, the answer goes into PRINCIPLES (if it's a rule) or DECISIONS (if it's a one-off call). Same question never asked twice.
8. **Wave-end verification, not session-end.** Don't burn a session re-verifying after every unit. Run a verification pass when a wave completes.

## Workflow

1. **Seeding session (one time).** Walk 3–4 representative units — home, article reader, login flow, profile shell. Surface every recurring "how should this work" question in one batch. Owner answers. Answers land in PRINCIPLES + DECISIONS. After this, most units don't need owner judgment.
2. **Per-unit sessions (~55).** Use the start prompt above. Review → log findings → fix in-session or queue. Update INDEX status.
3. **Wave verification (5 sessions, one per wave).** Re-walk the wave's units to confirm fixes hold and no regressions.

## Order

Waves run A → B → C → D → E. See INDEX. Order is by user impact:
- A: web public/reading (every visitor)
- B: web authed surfaces
- C: kids iOS (small but COPPA-critical)
- D: iOS adult
- E: admin (lower bar — "works correctly + no broken layouts," not "looks great")
