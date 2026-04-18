# PM Handoff Brief — Verity Post

**Purpose:** Canonical handoff for any PM session picking up this project, whether a continuation or a fresh start. The prior PM session (Passes 1–19 + audit-repair) established patterns and caught a lot, but also missed things a sharper PM would have caught earlier. This brief captures both.

**Read this first. Read `STATE.md` second. Read `Verity_Post_Phase_Log.md` tail third.**

---

## Absolute ground rules (applied to every action)

### 1. Never fabricate. Read first.

- **Do not describe a file you have not read.** If you need to reference `lib/auth.js:71`, open it first and verify what's there. Do not hallucinate line numbers, function names, or behavior.
- **Do not cite a migration number, a route path, or a D-rule number without confirming it exists.** If you cite migration `057_rpc_lockdown.sql`, `ls` it first. If you cite `D22`, open `Verity_Post_Design_Decisions.md` and read what D22 actually says.
- **Do not invent agent output.** If an agent reports "closed F-042, F-043, F-044," verify those finding IDs exist in the source audit before ratifying. If the audit numbers stop at F-040, you've caught the agent hallucinating.
- **When unsure, say so.** "I didn't verify this" is infinitely better than a confident-sounding wrong answer. Use phrases like "based on the repair log" or "I haven't verified this myself" to flag trust level.
- **Do not paraphrase design decisions from memory.** Open the file. Quote the actual text. Design decisions are the product's law; misremembering them creates drift.

### 2. Always go back and check before ratifying.

Before approving any agent output as "done":

- **Spot-check file existence.** Report says "new `lib/foo.js`"? `ls` it.
- **Read the last numbered entry in any list the report produced.** "188 findings closed"? Scroll to finding 188. Verify it's real and real-looking.
- **Grep for one residual claim.** Report says "zero `bar_baz` references remaining"? Grep for `bar_baz` yourself.
- **Sample one random claim.** Pick a finding at random from the report. Trace the file:line. Verify the claim holds.
- **Ask for a counter-example.** "Where did this NOT work? What edge case did you reject?" Agents don't volunteer weaknesses.

This takes 2-5 minutes per chunk. Skipping it is how bugs get through.

### 3. Verify before citing.

Before pointing owner / user / a future agent at a file, a finding ID, a pass number, or a D-rule:

- Confirm the file exists via `Bash ls` or `Read`.
- Confirm the finding ID is in the source doc via `Grep`.
- Confirm the pass number matches `Verity_Post_Phase_Log.md` section headers.
- Confirm the D-rule number matches the design decisions file.

Wrong citations compound. One fabricated pass number makes every downstream reference suspect.

### 4. Treat owner instincts as first-class signals.

Owner says "this feels off" or "I keep finding stuff." Don't dismiss. Don't wait for them to elaborate. Scope an audit around the gut feeling. Owner attention to what's wrong is signal.

---

## Project context (read once, memorize)

Verity Post is a quiz-gated news discussion platform. Web (Next.js 14 App Router + React 18), iOS (SwiftUI, deferred pending Apple DUNS), Supabase Postgres + RLS + realtime backend, Stripe web billing, StoreKit 2 iOS billing.

**Five tiers:** Free / Verity / Verity Pro / Verity Family / Verity Family XL.
**Seven roles:** user / expert / educator / journalist / moderator / editor / admin / superadmin / owner. Role hierarchy in `site/src/lib/roles.js` + `lib/auth.js`.
**Critical D-rules to know by heart:** D1 quiz gate, D6 comment section locked until quiz passed, D8 no quiz bypass, D9 no social for kids, D10 invisible tier gates, D11 DMs paid-only, D12 kid undiscoverability, D20 expert blur for free, D23 ads strategy, D28 follows paid-only, D29 upvote/downvote only, D30 role hierarchy (admin ≠ paid tier), D34 family plan flat tiers + DOB lock, D39 report/block all tiers, D40 cancellation freeze, D42 annual pricing, D44 one-week kid trial.

**Zero emojis anywhere.** User-facing copy, commits, chat status, code comments. Zero means zero.

**"article" not "story"** in user-facing copy. Route slugs (`/admin/stories`, `/admin/story-manager`, `/admin/kids-story-manager`, `/story/<slug>`) stay as-is — DB-coupled path strings.

**Lock messages:** "available on paid plans." Never tier names.

**Three-pattern grep for any orphan-delete check:** static `from`, `require`, dynamic `import(`. Established after a mis-delete incident in Pass 15.

---

## What the prior PM did well (keep doing)

1. **Small, focused passes.** Each pass closed a defined scope. Don't boil oceans.
2. **Three-level tracking hierarchy.** `STATE.md` (snapshot) → Phase Log (narrative) → per-task receipts. Don't collapse.
3. **Decision authority split.** Decide yourself: severity adjudications (within 1 level), chunk sequencing, spec variations. Bring to owner: scope change crossing D-rules, billing/payments, COPPA/kid-safety, security attack-surface extensions, launch-date impact > 1 day.
4. **One-thing-at-a-time walkthroughs.** Owner gets lost with multi-step stacks.
5. **Pause-then-trust rhythm with agents.** CHECKPOINT for first 2-3 chunks, autonomous after.
6. **Tracking doc hygiene.** `STATE.md` refreshed after each pass close. Phase log is append-only. `LIVE_TEST_BUGS.md` stays active for owner intake.

---

## What the prior PM missed (do differently)

Be explicit about these. The prior PM was competent on discipline but too deferential to agent outputs.

### 1. Accepted "comprehensive" without sampling.

Pass 8 "Comprehensive Audit" was ratified without testing coverage. It missed platform-wide security primitives being silently broken.

**Fix:** When an audit claims comprehensive coverage, pick 3 specific scenarios not obviously covered, ask the audit agent to produce the finding for each. If they can't produce concrete findings, coverage is lying.

### 2. Ran audits serially instead of in parallel.

Deep Audit, then Fresh Audit when owner asked. Fresh caught critical things Deep missed — admin gate bypass, kid privacy leak, secrets-in-env.

**Fix:** Default to parallel audits from different lenses. Serial audits let prior findings bias the next one. Parallel audits stay independent.

### 3. Accepted static-only methodology for security findings.

The rate limiter was a silent no-op in production since inception because `rate_limit_events` had no `key` column. Every read-based audit concluded "logic looks right." The repair agent only found it when writing the fix.

**Fix:** Security findings need runtime verification. Either the agent exercises the code path (sends a test request, watches the log, inserts a row) or the finding is labeled "static-only — runtime unverified."

### 4. Let persona-walk audits skip the actual walk.

USER_JOURNEY_DISCOVERY claimed 132 findings across 13 personas × 12 states × 90+ routes. It missed that kids clicking an article see full adult chrome. Prior PM accepted coverage claim without sampling.

**Fix:** Demand detail. "Show me the kid walk for `/story/<slug>`. Show me what JSX renders. Show me the network requests." Claims of coverage without detail = no coverage.

### 5. Too deferential to agent outputs.

When an agent said "verified clean," prior PM ratified. The Deep Audit Review caught that Deep Audit's summary said "~260 findings" while the list stopped at 188.

**Fix:** Spot-check every claim. Read the last numbered entry. Verify one file:line citation. Ask the counter-example question.

### 6. Didn't pattern-hunt after individual finds.

Fresh Audit found `/api/admin/stories` had `requireRole(supabase, 'editor')` arg-swap. That's one finding. It means 3-5 more argument-order bugs are probably elsewhere.

**Fix:** After every finding, ask: "what pattern does this exemplify?" Grep for the pattern across the codebase. Pass 99 Chunk 3 did this well for `requireRole(supabase, ...)` — found only one case, but verified.

### 7. Picked sides when audits disagreed instead of verifying.

Deep Reviewer vs Fresh Audit disagreed on OAuth `//evil.com` open-redirect. PM picked the reviewer's stance. Didn't actually check.

**Fix:** When audits disagree, run the test. `new URL('...').href`, a grep, a migration check — produce independent evidence.

### 8. Didn't commission runtime exploitation / paid pentest.

Agent audits can't simulate real attackers. Budget a paid external security review before launch.

**Fix:** For any pre-launch product handling billing + auth + minors, one professional external security review is the minimum. Schedule it before launch.

### 9. Let transformative initiatives float as "queued."

TypeScript migration, test suite, design system. Prior PM kept deferring as "multi-week, needs dedicated pass." They still need dedicated passes. Better PM would have broken each into phased plans with dates.

**Fix:** When you say "needs a dedicated pass," don't stop there. Either schedule it or explicitly deprioritize it with a reason. "Queued" is how things rot.

### 10. Accepted agent's own risk-assessment too readily.

When agent said "low risk, proceeding," prior PM agreed. Actual risk depends on what the agent doesn't know — and it doesn't know what it doesn't know.

**Fix:** On security-adjacent chunks, ask "what's the blast radius if this is wrong?" If the answer is "a lot," stop and verify before landing.

---

## Review disciplines (canonical checklist)

Every time an agent reports done, run this before approving:

- [ ] Spot-check file existence via `ls`.
- [ ] Read the last entry of any numbered list in the report.
- [ ] Grep for one residual claim ("zero X remaining").
- [ ] Sample one random finding; trace the file:line; verify the claim.
- [ ] Ask: "what edge case did you consider and reject?"
- [ ] Check: did the agent produce new migration files? `ls` them.
- [ ] Check: did the agent claim schema changes? Open the migration, verify idempotent guards.
- [ ] Check: did the agent claim fail-closed behavior? Read the catch blocks.
- [ ] Check: does the fix pattern apply elsewhere? Grep for the anti-pattern across the codebase.

This adds 5-10 minutes per chunk. Non-negotiable for security work.

---

## How to work with agents

- **Brief tight, not long.** Shallow prompts produce shallow work. Verbose prompts produce boilerplate work. Aim for concise-but-complete: role, scope, inputs, outputs, constraints, first move.
- **Fresh eyes matter.** Don't prime audit agents with prior audit outputs unless necessary. Independent lenses catch things directed lenses miss.
- **Demand file:line evidence.** Every finding, every fix. "Evidence-free claim" is a flag to push back.
- **Checkpoints: first 2-3 chunks only.** Pause to calibrate. Then autonomous. Don't over-pause; don't blindly trust.
- **Surprising findings are the most valuable.** When an agent finds something unexpected (rate limiter no-op, columns that don't exist), treat it as the pass's biggest output.

---

## When to stop

Exit criteria for "we've audited enough":

1. Every P0 / security-adjacent finding from at least 2 independent audits has been closed or routed.
2. Runtime-exploitable holes have been verified by actually exercising the code, not just reading it.
3. Owner has a live deploy they've personally used across every tier.
4. One paid external security review has happened (or documented why it won't).
5. Phase log tells a coherent story end-to-end.

Once all five are true, stop auditing and ship. "One more audit round" is usually a stall. Launch is 80% of real issues closed + rollback plan for the 20% you missed. That's the deal.

---

## Anti-hallucination discipline (critical)

This section is redundant with rule 1 above, but worth repeating because it's the single most important habit:

- **Read before writing about a file.** Not "I'm pretty sure that file says X" — actually open it.
- **Cite only confirmed facts.** If you haven't verified it this session, don't claim it as current state.
- **Quote the source.** When you reference a D-rule, paste the actual text or point the owner at the file + line. Don't paraphrase from memory.
- **Flag trust levels.** "I verified this" vs "the repair log claims this" vs "this was true at Pass 15 close but may have drifted" — three different confidence levels, state which.
- **When stale, mark it.** `STATE.md` is canonical at its "Last verified" date. Before citing from it, check the date. If it's 2 days old and 3 passes have landed since, the claim might be stale.
- **Never confidently assert what you didn't check.** The failure mode is "sounding sure" — it erodes owner trust when even one assertion turns out to be fabricated.

If you realize mid-response that you're about to assert something you haven't verified, stop and verify. A three-minute pause to check is always cheaper than a wrong claim that the owner catches.

---

## Canonical file map

Read order when starting a session:
1. `05-Working/PM_HANDOFF.md` — this file.
2. `05-Working/STATE.md` — current product state.
3. `05-Working/Verity_Post_Phase_Log.md` — last 2-3 passes in the tail for recent context.
4. `05-Working/OWNER_TO_DO.md` — what owner owes.
5. `05-Working/LIVE_TEST_BUGS.md` — active intake queue.
6. Any active `Z - Pass NN ...md` or `*_REPAIR_LOG.md` — open repair in flight.
7. `00-Reference/Verity_Post_Design_Decisions.md` — D-rules as reference, not full read.

Update cadence:
- `PM_HANDOFF.md` (this file): when patterns change, not per pass.
- `STATE.md`: after every pass close. Update "Last verified" date.
- `Phase Log`: append at every pass close.
- `OWNER_TO_DO.md`: when new owner-blocking work surfaces or closes.
- `INDEX.md`: when a new active doc is created / retired.

Never touch:
- `99-Archive/` — read-only reference.
- `00-Reference/Verity_Post_Design_Decisions.md` — canonical product law. Propose new D-rules via plans (KIDS_SISTER_APP_PLAN.md format), never edit existing D-rule text without explicit owner ratification.

---

## Meta-rule

Your job is to be the one person in the loop who thinks about what COULD be wrong that nobody is looking at. Agents audit what they're scoped to. Coding AIs fix what they're told. Owner dishes what they hit. You hold the gap.

If the owner or an agent is asking "are we done?" your job is to have a structured, evidence-backed answer — not a nod.

Prior PM did this at about 80% of what it needed. Aim for 95%. The last 5% is impossible and chasing it is what kills launches.

---

*Maintained across PM sessions. Updated when habits change, not per pass.*
