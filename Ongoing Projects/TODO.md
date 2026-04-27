# TODO

> ## 🟢 SESSION BOOTSTRAP PROMPT (read this first, every session)
>
> **You are the lead developer on Verity Post (see `CLAUDE.md` at repo root for operating model).** This file is the single source of truth for outstanding web + cross-cutting work. iOS-only work lives in `Pre-Launch Assessment.md` under the "IOS SESSION CLUSTER" section — don't pick those items unless you're explicitly in an iOS-build session.
>
> ### What to do when the owner opens a session
>
> 1. **Owner says "go" / "review the TODO file" / "start the runbook":** boot the autonomous loop below (read CLAUDE.md → this file → SYSTEM_NOTES.md → recent CHANGELOG → pick next non-skipped item).
>
> 2. **Owner asks "what's left" / "what's next" / "give me the questions":** read the SKIP LIST (line ~30 below). Every LOCKED item has a documented decision + impl spec in its body; every DEFERRED item is parked. Tell the owner the count + offer the first one. **Do NOT re-derive decisions that are already locked.**
>
> 3. **Owner asks an ambiguous question:** assume they want a single best-practice answer with the actual code state verified. Read the cited files. Run MCP queries if it's a schema/RPC question. Then ask one clean question with A/B/C + a recommendation + reasoning. Don't dump multiple questions unless they specifically asked for a batch.
>
> 4. **Owner says "do all of them" / "go through everything":** dispatch parallel Explore agents in clusters of 3-7 items (group by file-overlap to avoid edit conflicts) so wall time is half what serial would be. After each agent returns, synthesize, commit, push, dispatch the next wave. Trust but verify — read the agent's diff before commit.
>
> ### Hard rules — never violate
>
> - **Genuine fixes, never patches.** No parallel paths, no half-implementations, no `// TODO` comments left in code, no force-unwraps as crutches. If shipping a partial change creates an inconsistent state with another part of the codebase (e.g., one route handles a new error code while a sibling route falls through to a generic 400), finish both — that's the same fix, not two.
> - **Verify before acting.** Audit claims drift. Before editing a cited file:line, read it. Before drafting a migration, MCP-query the schema (`information_schema`, `pg_proc`, `pg_constraint`). About a third of audit findings have turned out stale this past month — don't be the agent that ships work for a problem that doesn't exist.
> - **Never push to git without explicit owner authorization.** Default behavior is commit locally + leave commits as `_pending push to git_` in CHANGELOG. The owner pushes (or says "push everything" giving you authorization for the session).
> - **Never run destructive git** (`reset --hard`, `push --force`, `checkout --`, `branch -D`) without an explicit ask.
> - **Never re-introduce removed surfaces** (passwords, social signin, MFA TOTP enrollment, lifetime billing, engagement-class email).
> - **Never edit the SKIP LIST items autonomously.** Owner reserves them. If a non-skipped item turns out to need owner input mid-investigation, add it to the skip list with the question + your recommendation + skip to the next item. The loop never stops on owner-input blockers; the skip list absorbs them.
> - **Update state in-flight, not at session end.** When you ship a fix: same turn = remove TODO entry + add CHANGELOG entry + push (if authorized). Don't batch bookkeeping; cross-session continuity breaks if state lags.
> - **Right-size the agent count per item.** T1 trivial = direct fix, no agents. T3 medium = 4 agents (investigator + planner + adversary + verifier). T5 schema = HALT, draft migration, queue for owner. See "Tier classification" table below.
>
> ### How to handle each TODO category
>
> - **LOCKED items** (T2, T19, T26, T40, T54, T55, T56, T57, T117, T173, T271, T-EMAIL-PRUNE): owner has decided. Body section contains the impl spec. When owner says "ship T<N>" or "go on locked items," execute the spec. Don't re-ask the decision. If a sub-question surfaces during impl that the spec didn't anticipate, ask once with a recommendation, then proceed.
> - **DEFERRED items** (T14, T34, T35, T79, T84): owner has parked these. Don't pick them up. Don't re-recommend them. Don't tell the owner "next" includes them.
> - **OPEN items in the body sections** (T27, T92, T165, T166, T233, T285): no owner decision needed; pick by priority and ship under the autonomous runbook. Each has audit evidence + recommended fix; verify the audit against current code before editing.
> - **iOS items moved to Pre-Launch Assessment**: don't pick during a web session. They need a Swift build + iOS-Xcode environment to verify.
> - **Pre-Launch Assessment owner-touch items** (Apple console walkthrough, Sentry DSN decision, COPPA VPC method, etc.): owner-driven. Don't auto-queue.
>
> ### Owner-locked direction (do not re-litigate)
>
> magic-link auth only · no password · no social · no MFA · no passkey v1 · 90-day sliding session · 8-article home cap removed · email transactional-only (only `data_export_ready` / `kid_trial_expired` / `expert_reverification_due` survive in `send-emails` cron, plus auth-flow emails via Supabase Auth) · kids = iOS only · admin = no keyboard shortcuts · AdSense + Apple are eventual gates, not active yet · beta = closed-invite, owner mints links via `/admin/referrals` · home page = simplified editorial (categories nav + feed + Browse + occasional hero/breaking) · governing law = Maine.
>
> ### Where to put what
>
> - **Outstanding work + locked-pending-impl items** → THIS FILE.
> - **Shipped work + decision-log closures** → `CHANGELOG.md`. Format: `## YYYY-MM-DD (description) — _shipped, pushed to git/Vercel_` per entry.
> - **Architecture reference + system knowledge** → `SYSTEM_NOTES.md`. Update when a fix changes architecture (new route, removed module, dep change).
> - **iOS items + Apple submission + Sentry + COPPA** → `Pre-Launch Assessment.md`.
> - **Schema migrations awaiting owner apply** → `Ongoing Projects/migrations/<YYYY-MM-DD>_<short_name>.sql`. Idempotent CREATE OR REPLACE; include rollback statement + verification query in header comment.
>
> ### Numbering convention
>
> T-IDs are sequential, gaps are intentional (preserve external references; CLOSED items are deleted, not renumbered). Priority tags: **CRITICAL** / **HIGH** / **MEDIUM** / **LOW** / **DEBT** / **DEFERRED**. Status tags: **OWNER DECIDED** / **VERIFIED** / **DEFERRED** / **OPEN**.

Single source of truth for outstanding work on Verity Post. Every item below was verified against current code at the time it was added. Items that turned out already-fixed / opinion-only / false were dropped, not preserved.

Companion files: `CHANGELOG.md` (work history), `SYSTEM_NOTES.md` (architecture reference), `Pre-Launch Assessment.md` (Sentry + Apple submission gates + IOS SESSION CLUSTER).

---

## AUTONOMOUS EXECUTION RUNBOOK

**Purpose:** Drive every item in this TODO that doesn't require owner input through to completion, methodically and verified, with no interruption to the owner. When a session opens with this runbook in scope, follow this exactly.

### Boot sequence (every session start)

1. Read `CLAUDE.md` (project root) — operating model + memory context.
2. Read this entire `TODO.md` — full contents, including verification banner, execution plan, skip list below.
3. Read `Ongoing Projects/SYSTEM_NOTES.md` — current architecture state.
4. Read `Ongoing Projects/Pre-Launch Assessment.md` — to know what's already moved out of TODO.
5. Skim `Ongoing Projects/CHANGELOG.md` recent entries — to know what already shipped.
6. Pick the next un-closed item that's **NOT** on the SKIP list below.

### SKIP list — items require owner input, do not touch

Do not pick up these IDs autonomously. The owner has explicitly reserved them. If the next item in your sweep is on this list, skip it and pick the next non-listed item.

**Skip-list status (post 2026-04-27 owner-decision pass).** All decisions documented are LOCKED — they're listed here because they need either implementation work the autonomous loop shouldn't pick up alone, or further owner input. Items already CLOSED are NOT listed; their closure record lives in `CHANGELOG.md` (search "Decision-log closures" for T77 / T85 / T268 / T272 / T291; T16 / T17 have full ship entries).

LOCKED, awaiting "go" to ship code/migration:
- **T2** — Funding Choices CMP; gated on AdSense console access.
- **T19** — simplify home (categories nav + feed + Browse + occasional hero/breaking). See T19 body for impl spec.
- **T26** — RPC migration adding `comment_reply` + `comment_mention` notifications via `create_notification`. Scope locked (in_app + push only).
- **T40** — delete dead timeline aside (T11 covers the exit path).
- **T54** — reorder kids dashboard KPIs (Quizzes Passed → Articles → Streak → Reading Time).
- **T55** — drop `ai_prompt_preset_versions` orphan table (T242 snapshot covers audit/replay).
- **T56** — drop lifetime billing option + standardize `'month'`/`'year'`.
- **T57** — auto-mint Stripe price API on plan create (option B).
- **T117** — migrate ~9 remaining web pages to `<ErrorState>` primitive.
- **T173** — add comment-length cap to PATCH `/api/comments/[id]/route.js`.
- **T271** — Maine governing-law section in TOS.
- **T-EMAIL-PRUNE** — drop 4 engagement types from `send-emails` cron; keep `data_export_ready` + `kid_trial_expired` + `expert_reverification_due`.

DEFERRED (owner returning to it later — no decision yet):
- **T34** — downvotes ranking decision.
- **T35** — rank-change notifications decision.

**Bundle-level skip (separate session direction needed before execution):**

- **AUTH-MIGRATION** — direction locked (magic-link only); the build is one coordinated session under direct owner supervision. Do not execute its sub-items piecemeal autonomously.
- **Everything in `Pre-Launch Assessment.md`** — Apple / Sentry / COPPA-CRITICAL items + the IOS SESSION CLUSTER all have their own owner touch points and live in that file.

### Per-item workflow — RIGHT-SIZE THE AGENTS PER TIER

**Always classify the item first.** Pick the tier from the table below. Use the exact agent count for that tier — don't over-spend on trivial items, don't under-spend on risky ones.

#### Tier classification — decide before working

| Tier | When to use | Agent count |
|---|---|---|
| **T1 — TRIVIAL** | 1 file, 1-3 line change. Copy edit, missing HTML attribute, dead button removal, single env-var add, single rate-limit add, deleting a confirmed-zero-callers file, removing a stale comment. | **0 agents** (direct fix) |
| **T2 — SMALL** | 2-3 files, one logical surface. Adding Cache-Control to N similar routes, fixing a localStorage handler, adding missing entitlement, swapping one prop across a few callers. No new abstractions. | **2 agents** (verify + post-verify) |
| **T3 — MEDIUM** | Multi-file refactor, new endpoint without DB change, API response-shape edit, lib edit with non-trivial caller surface, anything touching auth/permissions client-side, palette consolidation across 5-15 files. | **4 agents** (investigator + planner + adversary + verifier) |
| **T4 — LARGE** | Cross-surface (web + iOS), changes shared library, security-sensitive (auth, privacy, RLS, session, RPC), affects >5 files OR introduces a new pattern, touches the AI pipeline, modifies admin moderation flow. | **6 agents** (investigator + planner + big-picture + adversary + verifier + regression scanner) |
| **T5 — DB / SCHEMA** | Any RLS / RPC body / migration / new table / new column / new index. **Halt — write migration, queue for owner.** Never apply autonomously. | **2 agents max** (investigator + planner only — to write the proposed migration file) |

When in doubt between two tiers, **pick the higher tier.** Over-verifying is cheap; under-verifying ships bugs.

Trigger phrases for self-classification: anything touching `auth.*`, `pg_proc`, `RLS`, payments, Stripe webhooks, admin moderation actions, security headers, CSP, or kids surface = **at least T4**, regardless of LoC.

#### T1 — TRIVIAL: 0 agents (just you)

1. Read the cited file:line — confirm issue still exists.
2. Edit the fix.
3. Re-read changed lines + 5 surrounding — confirm no syntax break.
4. Delete the item from TODO entirely.
5. CHANGELOG entry: file:line + before/after one-liner + `_pending push to git_`.
6. Next item.

**Don't dispatch agents for T1.** A subagent costs more context than the fix.

#### T2 — SMALL: 2 agents (verify + post-verify)

1. **Investigator** (Explore agent) — re-verify finding still real and unchanged at cited location. STALE / ALREADY-FIXED → delete from TODO + CHANGELOG note "verified stale" + next item.
2. Edit the fix yourself (no planner — scope is small enough).
3. **Verifier** (Explore agent) — re-read changed files + grep relevant callers. If FAIL → iterate; don't update TODO yet.
4. Update TODO (delete) + CHANGELOG entry.
5. Next item.

#### T3 — MEDIUM: 4 agents (full 4-stream)

1. **Investigator** (Explore) — re-verify finding. CONFIRMED / STALE / WRONG-LOCATION / ALREADY-FIXED.
2. **Planner** (Plan agent) — concrete diff outline: every file:line edit, new files, callers to update, test additions. No prose.
3. **Adversary** (Explore with adversarial prompt) — challenge the plan: hidden coupling, broken callers, scope creep, security regressions, perf regressions, race conditions. BLOCK / BLOCK-WITH-CONDITIONS / APPROVE.
4. Implementation with adversary conditions folded in.
5. **Verifier** (Explore) — re-read every changed file + grep callers + run relevant grep/test commands. If FAIL → iterate.
6. Update TODO + CHANGELOG (include adversary notes inline).
7. Next item.

If adversary returns **BLOCK** with no safe path → queue for owner under "QUEUED FOR OWNER REVIEW", skip, next item.

#### T4 — LARGE: 6 agents (4 pre-impl + 2 post-impl)

1. **Investigator** (Explore) — finding + current architectural context.
2. **Planner** (Plan) — diff outline + cross-surface impact map.
3. **Big-picture reviewer** (Explore, fresh-context prompt) — does this fit the system as a whole? Does it conflict with locked owner direction? Does it introduce a pattern we don't want? APPROVE / APPROVE-WITH-CONDITIONS / BLOCK.
4. **Adversary** (Explore with adversarial prompt) — line-by-line plan challenge + security/perf/race-condition stress.
5. Implementation (only if both 3 and 4 returned APPROVE / APPROVE-WITH-CONDITIONS, all conditions folded in).
6. **Verifier** (Explore) — every changed file + every caller grep + relevant test commands.
7. **Regression scanner** (Explore) — broader sweep: did the change break other features, change API shapes other surfaces consume, alter timing assumptions, leak state across contexts.
8. Update TODO + CHANGELOG with big-picture + adversary + regression notes.
9. Next item.

If either reviewer returns BLOCK → queue and move on. **Never ship a T4 with unresolved BLOCK.**

#### T5 — DB / SCHEMA: HALT, queue for owner

Any DB-shape change stops the loop:

1. **Investigator** (Explore) — confirm change is actually needed.
2. **Planner** (Plan) — write the proposed migration as `Ongoing Projects/migrations/<YYYY-MM-DD>_<short_name>.sql`. Include `BEGIN;` / `COMMIT;`, idempotent guards, rollback statement, verification query.
3. Add entry to **QUEUED FOR OWNER REVIEW** with: item ID + path to migration file + apply order (migration → `perms_version` bump if needed → code push) + risk notes.
4. **Do NOT** run `mcp__supabase__apply_migration` autonomously. Owner runs it.
5. Move to next item.

#### Bundling: tier-matched

When working a cluster (e.g., privacy-hardening T170 + T175 + T209), classify the cluster by its **highest-tier member**, not the average. A T2 + T2 + T3 cluster runs as T3 for the bundle (one Planner output covers all three; one Adversary pass covers all three). More efficient than sequential per-item review.

#### Anti-patterns to avoid

- ❌ Running 4-stream on a one-line copy edit (T1 over-spend).
- ❌ Skipping investigator on a finding more than 2 weeks old (audit drift risk).
- ❌ Skipping adversary on anything touching auth, payments, RLS, or admin actions — regardless of LoC.
- ❌ Letting the verifier "trust" implementation without re-reading changed files. Verifier MUST read, not assume.
- ❌ Bundling T1 items with T3 items in one CHANGELOG entry — split so each is reviewable independently.
- ❌ Stacking up uncommitted CHANGELOG entries without TODO deletes — keep state in lockstep.
- ❌ Calling a fix "done" before the verifier passes a fresh read of the files.

### Item ordering — work this priority first

When picking the next non-skipped item, use this order:

1. **CRITICAL** items, oldest first (lower T-number first).
2. **HIGH** items.
3. **MEDIUM** items.
4. **LOW** items.
5. **DEBT** items.
6. **DEFERRED** items only if blocking gate has cleared.

Within each priority, prefer items in the same **bundle cluster** (so review context carries over):

- **Privacy hardening cluster:** T170, T175, T209
- **Trust & safety auth-gate cluster:** T274, T275, T276, T277, T279
- **iOS resilience cluster:** T244-T254 (network/lifecycle edge cases)
- **Editorial integrity cluster:** T233 (soft-delete articles), T234 (AI label render), T235 (transactional admin PATCH), T237, T238 (soft-delete users), T240, T241, T242, T243
- **Performance cluster:** T215, T217, T218, T220
- **Dead-code/operational debt:** T69, T70, T71, T72, T73, T74, T75, T76 (most are quick deletes)
- **Page-walkthrough copy edits:** T288, T289, T290, T293, T296, T297 (mostly trivial)
- **iOS Implementation Manager release-readiness cluster:** T255, T257, T258, T260, T263 (Apple submission readiness, but not Apple-required → bundle as "release-readiness" pass when ready)

Bundling means: pick the cluster, work all its items in one session with shared context. Don't ping-pong between unrelated items.

### Queue-and-continue (do NOT halt the loop on these)

When any of these fire, **write the question into "QUEUED FOR OWNER REVIEW" using the format spec above, then move to the next item.** The loop never stops on these — the queue absorbs them. You keep working.

1. An item not on the skip list **turns out to require owner input** during investigation → add to skip list above + queue with the specific question + skip to next item.
2. Verifier disagrees with implementation across two retries → don't ship; queue with both attempts described + the literal question (e.g., "Accept regression X to ship, or revert?") + skip.
3. Adversary returns **BLOCK** with no safe path → queue with the BLOCK reason + question + skip.
4. A finding's premise turns out to be **wrong** in a way that suggests the original audit was hallucinated → queue with quote of the bad claim + question (re-verify cluster?) + skip.
5. A fix would touch **owner-locked decisions** (auth direction, kids-launch scope, monetization model, removed features) → queue with the carve-out question + skip.
6. **Schema layer required** (DB migration, RLS change, RPC body change) → write the proposed migration to `Ongoing Projects/migrations/<YYYY-MM-DD>_<name>.sql`, queue with apply-order + readiness question, skip. Do NOT apply autonomously.
7. **5 consecutive items deleted-as-stale** → queue with the 5 IDs + question (re-verify surrounding cluster?) + skip.

### Real hard-halt conditions — only these stop the loop

The loop only stops when you genuinely cannot continue:

1. **All remaining items are on the SKIP list** → produce a completion summary (items closed this session + queue contents) and stop.
2. **Two unrelated TODO items in a row trigger queue-blockers from the same root cause** (suggests file or system-state corruption) → stop with summary; let owner intervene.
3. **A T4 implementation step fails midway and verifier confirms the working tree is now in an inconsistent state** → stop, queue with full state diff, do not attempt cleanup. Owner reverts.

If none of these are true: keep moving. Always pick the next item.

### Update protocol — keep state honest

- **CLOSED items** are deleted entirely from TODO, not left as pointers. Numbering gaps are intentional (preserve external T-references).
- **CHANGELOG** entry per item OR per bundle (a clean cluster lands as one entry). Format: `## YYYY-MM-DD (bundle name) — _pending push to git_` then `### T### — title` per item with what changed + file:line + adversary notes.
- **SYSTEM_NOTES.md** updated whenever a fix changes architecture (new route, new pattern, removed module, dependency change). Don't let SYSTEM_NOTES drift.
- **Verification banner** at top of this file gets updated counts after every batch.
- **Pre-Launch Assessment** mirrors the same delete-on-close pattern.

### Loop control

- **Run as `/loop` dynamic** — re-enter every 20-30 minutes with this runbook in scope. Each tick picks the next un-closed non-skipped item.
- **Single-pass invocation** is also valid — read this runbook, work as many items as fit a session, surface completion summary at end.
- The runbook itself is the durable instruction; sessions don't need to re-derive the workflow each time.

### Invariants — never violated

- Never edit a file without reading the relevant lines first.
- Never delete a TODO item that hasn't been verified-complete by a separate read.
- Never skip the adversary step on a non-trivial fix.
- Never push to git autonomously — leave commits as `_pending push to git_` for owner review.
- Never run destructive Git operations (`git reset --hard`, `git push --force`, `git checkout .`).
- Never re-introduce items the owner explicitly removed (passwords, social signin, MFA TOTP enrollment surface).
- Never invent file:line references — every claim must come from a current file read.

### Quick reference

- **Owner-input items remaining:** ~14 in TODO + ~10 in Pre-Launch Assessment
- **Autonomous items remaining:** ~280 in TODO across all priority bands (CRITICAL through DEBT)
- **Largest single autonomous bundle:** Editorial integrity cluster (T233-T243) + iOS Implementation Manager (T255-T263)
- **Cheapest wins (sub-10-min each):** Page-walkthrough copy edits T288-T297, dead-code sweep T69-T76, iOS Info.plist fixes T257-T260

---

## 📋 QUEUED FOR OWNER REVIEW

**Every time autonomous work hits something the owner has to decide, write the question here, then move to the next item. The loop never stops because of an owner-input blocker — the queue absorbs it.**

Owner clears entries when they return. **Do NOT remove entries autonomously.**

### Format per entry — write a real question, not "blocked"

```
- **YYYY-MM-DD** — [Item ID or context]
  - **What I was doing:** one line on the work that surfaced this
  - **What's blocking:** one line on what the actual ambiguity / decision / permission is
  - **Question for owner:** the literal question, phrased so a yes/no or short answer unblocks me
  - **Options I see:** (A) ... (B) ... (C) ... — with my recommended pick if I have one
  - **What I did instead:** "skipped, moved to next item" / "drafted migration at <path>, did not apply" / etc.
```

### Examples of what belongs here (and what doesn't)

**Belongs in queue (write the question):**
- Adversary returns BLOCK with no safe path → "Question: do we accept the regression risk to ship X, or skip until Y is fixed?"
- Investigation reveals the finding's premise was wrong → "Question: is the original audit source still trusted, or should we re-verify the surrounding cluster?"
- Item touches an owner-locked decision → "Question: was this carved out of the lock, or should I leave it permanently?"
- Schema change required → "Migration drafted at `Ongoing Projects/migrations/...sql`. Question: ready to apply via MCP?"
- Trust-positioning / pricing / monetization implications surface mid-fix → "Question: <specific decision>?"
- 5 consecutive stale-deletes → "Question: re-run a verification pass on the surrounding cluster, or trust and continue?"

**Does NOT belong (just keep going):**
- A small implementation choice between two near-equivalent approaches → pick the lower-risk option, document in CHANGELOG, keep going.
- A naming-convention choice → match the surrounding code style, keep going.
- A formatting / lint preference → defer to existing project conventions, keep going.
- A "would be nice to also fix X" thought → add as a new TODO item if it's verified real, keep going.

_(Empty at start. Populate as autonomous work surfaces blockers.)_

---

### Verification status (as of 2026-04-26 — third pass)
**Every item T1-T201 has been reviewed against live code at least once. The newest professional-sweep items (T127-T200) were cross-verified by 4 parallel agents.** Final tally:
- **~115 items remain open and confirmed real**
- **30 items DELETED entirely** — closed (already implemented or wrong claim) or moved elsewhere:
  - **Auth-migration / Pre-Launch moves:** T1, T4, T5, T6, T8, T21, T24, T47, T78, T80, T86, T87, T93, T94, T95, T96, T158, T178, T183, T191
  - **Verified already-fixed in code:** T33, T76, T83, T114, T115, T120, T127 (login `inputMode`), T128 (focus-visible IS in layout.js), T150 (leaderboard link IS in profile), T164 (null guard exists), T186 (safe subscript exists)
  - **Verified stale / claim-was-wrong:** T133 (delay IS guarded), T154 (Expert tab IS in nav), T184 (LoginView capture is fine), T192 (didReceive is optional), T196 (only 2 .task blocks), T199 (intentional pattern)
- **11 items RE-SCOPED inline** — kernel real, claim corrected: T18, T22, T63, T74, T82, T99, T107, T117, T130, T141, T144, T173, T174, T185, T188, T200
- **3 items PENDING MCP VERIFY** — `pg_proc` inspection: T16, T17, T26
- **1 new item from gap-finder:** T201 (REFERRAL_COOKIE_SECRET missing from `.env.example`)

Numbering gaps are intentional — items deleted, not renumbered, so external references stay stable. Items moved to Apple-submission scope live in `Pre-Launch Assessment.md`. CHANGELOG audit confirmed: most "_pending push to git_" entries are pre-commit reviews (correct by design); 3-of-5 spot-checked shipped items match code; no orphan TODO/CHANGELOG collisions.

---

## LAUNCH MODEL (status as of 2026-04-26)

**AdSense + Apple review are the eventual launch gates** (per CLAUDE.md memory). **Not at either yet — pre-launch work continues.** Beta is also out-of-scope for now per owner direction; revisit at the end of this work cycle.

The minimal launch-unblock set, execution plan, and MCP-verify items below stand as the eventual roadmap. They become active sequencing once owner signals "we're going for the gates."

### Eventual minimal launch-unblock set

| # | Item | Why it gates the AdSense or Apple gate |
|---|---|---|
| **T2** | Cookie consent banner | AdSense approval requirement; EU legal exposure |
| **T15** | Stop linking to kill-switched `/u/[username]` | First-impression killer on anon leaderboard |
| **T7** | iOS profile editor wipes bio/location/website | Silent data loss; reviewer can demonstrate |
| **T18** | iOS email change (re-scoped under magic-link) | Confirm-link to new address |
| **AUTH-MIGRATION** | Build magic-link login bundle | Replaces password + MFA + social entirely |
| **Pre-Launch Assessment A1, K1, A8, S1-S3** | Apple HIG push pre-prompt, kids server-grading, Apple Dev console, Sentry decisions | Tracked separately in `Pre-Launch Assessment.md` |

### Verify-via-MCP-first (collapse or escalate)

- **T16/T17** — `pg_proc` for `start_conversation` / `post_message`. If RPCs don't enforce recipient `allow_messages` + blocks → escalate to CRITICAL pre-launch (privacy hole).
- **T26** — `pg_proc` for `post_comment`. If it doesn't insert into `notifications`, reply notifications are silently broken — biggest single return-visit lever in the file.

---

## AUTH DIRECTION — LOCKED 2026-04-26

**Strategy: magic-link only. No password. No social (Apple/Google). No TOTP/MFA.**

### Rationale
- Owns the email relationship (matches trust/news product positioning — no platform tenancy via SIWA/Google)
- No Hide My Email tax, no platform-suspension risk, no ban-evasion via relay aliases
- Single auth path to harden — not three
- Closes the entire MFA architectural problem (T6, T80)
- Apple App Store guideline 4.8 doesn't apply (no third-party social offered)

### Spec
- Email contains both clickable link AND 6-digit code (code is the fallback for corporate email scanners that pre-fetch links and burn them)
- Token lifetime: 15 minutes, single-use
- Rate limits: per-email-address (3 sends/hour) + per-IP (5 sends/hour) + 60-second client-side cooldown
- Bounce/complaint webhook from Resend → auto-disable bouncing addresses
- Disposable-email-domain blocklist on send
- Session length: **90 days, sliding** — every authenticated request bumps expiry forward 90 days. Active users effectively never re-auth; abandoned devices self-heal within a quarter. NextAuth/Lucia/Supabase Auth all support sliding refresh as a config flag (no extra work).

### NEW work bundle: AUTH-MIGRATION (Phase 0 priority)
- Build `/api/auth/magic-link` route wrapping Supabase `signInWithOtp({ email })` with rate limits + 6-digit code emission
- Magic-link email template (link + code, single layout)
- New `/login` and `/signup` UI: single email field + send button, replacing password fields
- Code-entry fallback UI ("Didn't get the email? Enter the code instead")
- iOS `LoginView` + `SignupView` rewritten to mirror web flow (email-only field, deep-link callback already wired in `VerityPostApp.swift:15-17`)
- Pick-username step retained for first-time signup (single screen post-signin)
- Resend bounce/complaint webhook handler
- Rip out: password fields, password-reset flow, password-change flow, TOTP/MFA enrollment surface, MFA settings card, **Apple/Google OAuth signin buttons + OAuth callback handlers (web + iOS — confirmed by owner 2026-04-26)**
- Migration path for existing password users: next time they log in, email-link them their existing account; password becomes unused-but-unbroken until cleanup pass

### TODO items COLLAPSED by this direction
- **T5** (iOS password re-auth + session revocation) — CLOSED, no password
- **T6** (MFA enrollment without challenge) — CLOSED, drop entire TOTP surface
- **T18** (iOS email change bypass) — RE-SCOPED, simpler under magic-link (re-confirm via new email, no password to verify)
- **T21** (iOS username login) — CLOSED, no username login field
- **T47** (iOS password-reset throttling) — CLOSED, no password reset
- **T80** (web MFA bundle) — CLOSED entirely
- **T4** (verified-email branch on discussion CTA) — CLOSED, every signed-in user is inherently email-verified under magic-link
- **T22** (iOS social pick-username gate) — RE-SCOPED, pick-username step still needed but for magic-link signup not OAuth callback
- **T19** (iOS MFA-without-challenge risk) — CLOSED with T6
- **T24** (verify-email recovery dead-ends) — CLOSED, magic-link is the verification, no separate "verify email" state
- **T49** (username editable mismatch) — UNCHANGED, separate concern

### Net effect on the launch-unblock set
The AUTH-MIGRATION bundle replaces these original launch items: T5, T6, T18 partially. Remaining launch-unblockers post-migration: T2, T1, T15, T7, T8.

### v2 breadcrumb (not for launch — leave the door open)
**Passkeys as the magic-link upgrade path post-launch.** Magic-link is the v1 floor; passkeys (WebAuthn / Face ID / Touch ID) are the v2 ceiling. Once enrolled, they replace the email round-trip for return logins → first login is email, every subsequent login is one-tap biometric. Owner currently has passkey off the table; this note is here so a future revisit doesn't read "no MFA forever" and miss the path. Not work for now — just don't paint over it.

---

## EXECUTION PLAN

Five phases. Each bundle is sized to fit the 6-agent ship pattern (4 pre-impl + 2 post-impl). Items inside a bundle share a file or a concept — easier to review together than fragmented.

### Phase 0 — Launch unblockers (~4 sessions, parallelizable)
- **0A** Cookie consent + reg-trigger timing — **T2 + T3 + T64 + T65** (single PR; CMP install + script gating; move regwall + anon interstitial to existing 80%-scroll handler; localStorage clear on auth)
- **0E** Transactional-email cleanup — **T9 + T10 + T27 + T67** (admin sequences gone, settings cards gone, privacy copy updated; one PR)
- **0F** Dead-end user links — **T15** (gate the link or flip `PUBLIC_PROFILE_ENABLED`)
- **0G** AUTH-MIGRATION bundle — magic-link only (see "AUTH DIRECTION" section above for spec)
- _Apple-submission items (push pre-prompt, kids server-grading) tracked in `Pre-Launch Assessment.md` (A1, K1)_

### Phase 1 — Auth/safety hardening (~3 sessions)
- **1A** iOS auth contract parity — **T18 + T22 + T23** (route iOS through hardened endpoints; bundle with AUTH-MIGRATION)
- **1B** iOS profile dirty-state save — **T7** (sequence after 1A — same `SettingsView.swift`)
- **1C** Server-side message safety — **T16 + T17** (after MCP verification; enforce in RPC bodies + RLS)

### Phase 2 — Settings split + truth-in-UI (~5 sessions)
- **2A — gate** Settings split — **T79** + 7 anchor-redirect dependents (single deploy; everything below depends on this)
- **2B** Settings hygiene wave — **T19 + T44 + T45 + T49 + T60 + T61 + T62 + T63** (each "saves to nowhere" surface decided wire-or-delete)
- **2C** Account/profile parity — **T20 + T42 + T43 + T46**
- **2D** Deletion-contract single source of truth — **T68**

### Phase 3 — Engagement parity (~7 sessions, high concurrency)
- **3A** Story page exit + reading polish — **T11 + T13 + T14 + T30 + T31 + T36 + T39 + T53**
- **3B** Comments + moderation parity — **T12 + T32 + T33 + T34 + T52**
- **3C** Topic alerts + reply notifications — **T25 + T26 + T29** (T26 verified via MCP first)
- **3D** Browse/Find/notification routing — **T28 + T37 + T38 + T41 + T58**
- **3E** Family/kids load-state + framing — **T51 + T54**
- **3F** DM error states + admin nav — **T50 + T59**

### Phase 4 — Polish + dead-code sweep (~4 sessions)
- **4A** Admin/billing housekeeping — **T40 + T55 + T56 + T57**
- **4B** Dead-code/legacy sweep — **T69 + T70 + T71 + T72 + T73 + T74 + T75 + T76**
- **4C** iOS small fixes — **T66**
- **4D** Deferred design-required — **T81 + T82 + T83 + T84**

### Owner-action items (schedule, don't sequence with code)
- **T77** record commit SHA, mark MASTER-6 SHIPPED
- **T85** Profile Task 5 perm-key migration (apply order: migration → bump perms_version → push iOS)
- _Apple Developer console walkthrough + Sentry decisions tracked in `Pre-Launch Assessment.md` (A8, S1–S7)_

**Total estimated sessions: ~25.** Within each phase, the bundles labeled with different letters can run in parallel branches with minimal merge collisions.

---

## PRIORITY TAG CHANGES (from adversary critique)

The first-pass priorities ranked items by raw severity. Re-graded to reflect launch-gate impact:
- **T9, T10** demoted CRITICAL → **MEDIUM**. Email programs aren't wired up; user-facing impact today is zero. Pre-launch hygiene, not a review gate.
- **T15** upgraded HIGH → **CRITICAL**. Leaderboard is anon-visible; "View profile" → placeholder kills first impression.
- **T16, T17** upgraded HIGH → **CRITICAL** *pending MCP verify*. If RPC doesn't enforce, third-party clients bypass UI entirely (privacy hole).
- **T26** upgraded HIGH → **CRITICAL** *pending MCP verify*. If `post_comment` doesn't insert notification rows, the single biggest return-visit lever is broken.

The numbered items below retain their original section placement for readability, but the tags reflect the new priorities.

---

## LAUNCH BLOCKERS

### T2 — Cookie consent banner missing — AdSense approval blocker — **CRITICAL** (owner decided: Funding Choices)
**Decision (2026-04-27):** Owner picked **Funding Choices** (option A — free, Google-supported, single-script integration). Implementation deferred until AdSense console access is set up by owner.
**File:** `web/src/app/layout.js` (verified — only mention of consent is a TODO comment at line 166 about a "consent-gated loader once the CMP is installed"; no `CookieBanner`/`ConsentBanner` component exists anywhere in `web/src/`).
**Problem:** GA4 + AdSense load unconditionally. AdSense approval is at risk; EU traffic is legally exposed.
**Fix when ready:** (1) Owner enables Funding Choices in the Google AdSense / Funding Choices console + selects EEA/UK/CH coverage. (2) Owner provides the publisher ID + script tag from the console. (3) Code adds the script to `web/src/app/layout.js` above the existing `ga4-loader` / `ga4-init` / `GAListener` / AdSense script tags, gated so those scripts only load on accepted consent (Google's Funding Choices supplies the standard consent-state API — `googlefc.callbackQueue.push(...)` or the IAB TCF `__tcfapi`). (4) Persist consent state via the CMP's own cookie (no extra localStorage needed). Reject keeps scripts off. (5) Update `web/src/app/cookies/page.tsx` copy to reflect the live banner (T288 already softened it; replace with truthful "first-visit banner via Funding Choices" once shipped).
**What I need from owner to ship this:** the publisher ID + the consent-callback shape from the Funding Choices console (different accounts get slightly different snippets). 30-min implementation window once those land.

---

## HIGH — close before launch quality bar

### T14 — Streak break on adult profile shows "0d" with no recovery offer — **HIGH** (DB-WORK-PARTIAL)
**Note 2026-04-26:** Full fix needs a `use_streak_freeze` RPC + endpoint (T5 schema work, halt-and-queue per runbook). Only `use_kid_streak_freeze` exists. Half the value (the "Streak reset — start a new one today" branch) can ship as a UI-only copy edit; the freeze-restore branch is queued.
**File:** `web/src/app/profile/page.tsx:700-701`, `VerityPost/VerityPost/ProfileView.swift:495`
**Plumbing exists** (`streak_freeze_remaining` decoded in iOS Models.swift; admin `streak_freeze` flag on; kid profile shows freeze counter).
**Fix:** When `streak_current === 0 && streak_best > 0 && streak_freeze_remaining > 0` → "Your streak ended. Use a freeze to restore it? ([N] remaining)" with one button. Otherwise: "Streak reset — start a new one today."
**Recommendation:** Mirror the kid surface presentation — already designed and shipping there.

### T19 — Home feed preferences are decorative on both web and iOS — **HIGH** (truth-in-UI)
**File:** `web/src/app/profile/settings/page.tsx:2682-2778,2783-2878` + iOS `SettingsView.swift:2044-2142`; readers `web/src/app/page.tsx:12-19,176-257` and `HomeView.swift:7-12,118-190` never consume them.
**Problem:** Settings save `users.metadata.feed` flags (preferred categories, `showBreaking`, `showTrending`, `showRecommended`, `minScore`, display mode). Home reads zero of them. Save success message is a lie.
**Fix:** Either (a) keep the editorial hero, but bias supporting slots based on category preferences + `minScore` / `kidSafe` filters, or (b) **remove the settings cards** if the product is intentionally editorial-only.
**Recommendation:** **Decision required from owner.** Don't promise personalization you don't deliver. If editorial-only is the answer, ship the deletion this week. If personalization is on roadmap, keep + relabel as "Coming soon" with the cards disabled.

### T26 — `post_comment` RPC does NOT insert notifications — **CRITICAL** (verified 2026-04-27, awaiting owner direction)
**MCP verify 2026-04-27:** CONFIRMED REAL. The `post_comment(p_user_id, p_article_id, p_body, p_parent_id, p_mentions)` RPC body inserts the comment row + bumps `reply_count` on parent + bumps user `comment_count`, but **never inserts into `notifications`** for either replies or mentions. Verified zero triggers on the `comments` table (`information_schema.triggers` returns 0 rows). Email templates, preference UI, push cron all exist for `comment_reply` — but the source-of-truth INSERT that those downstream consumers read never fires. Audit's "biggest single return-visit lever" claim is correct.
**Two-part gap:**
- (a) **Reply notifications** — when `p_parent_id IS NOT NULL`, the parent comment's author should receive a `comment_reply` notification. Currently silent.
- (b) **Mention notifications** — when `mentions` jsonb has entries (paid-tier authors only — free-tier mentions are stripped at line ~30 of the RPC), each mentioned user should receive a `comment_mention` notification. Currently silent.
**Open questions for owner:**
1. **Scope** — fix both (a) + (b) in one migration, or strict T26 = replies only and queue mentions as a separate item?
2. **Notification schema** — `notifications.type` enum already includes `comment_reply` (and likely `comment_mention`). Confirm any additional fields needed (e.g., `action_url` shape, `metadata` jsonb keys consumed by client).
3. **Self-reply guard** — should a user replying to their own comment fire a notification to themselves? Standard answer is no — defer the INSERT when `parent.user_id = p_user_id`. Confirming.
4. **Muted/blocked sender** — should a reply from a user the parent-author has blocked still create a notification? Standard answer: no notification (silent block). Confirming.
**Status:** awaiting owner answers; no migration drafted yet, no code changed.

### T27 — Iframe of inert email/alert settings on iOS + web — **HIGH** (paired with T9/T10)
**File:** iOS `SettingsView.swift:1887-2040` writes `users.metadata.notifications` (different keys from web); web `profile/settings/page.tsx:2112-2167` writes `users.metadata.notification_prefs`; backend reads `alert_preferences`. Repo-wide search shows no consumer for `metadata.notifications` or `metadata.notification_prefs` outside settings pages.
**Fix:** Make iOS use the same storage/backend as web. Remove email-digest/lifecycle controls. If anything from `metadata.notifications` is worth migrating, do a one-time read-fallback.
**Recommendation:** Bundle with **T9/T10** (transactional-only email cleanup). Same direction, same PR.

---

## MEDIUM — quality and parity

### T34 — Downvotes are decorative — **MEDIUM**
**File:** Both surfaces sort by `upvote_count DESC, created_at ASC` (`CommentThread.tsx:104-106`, `StoryDetailView.swift:1850-1851`); `downvote_count` ignored.
**Fix:** Add `downvote_count` as demoting signal: `upvote_count - (downvote_count * 0.5) DESC`.
**Recommendation:** **Wilson score** is more robust than naive subtraction — but for low-volume threads, the simple formula is fine. Worth revisiting once threads get busy.

### T35 — No rank-change notifications — **MEDIUM**
**File:** `web/src/app/leaderboard/page.tsx` has data; no cron diffs ranks.
**Fix:** Weekly cron diffs each user's rank vs 7 days ago. In-app notification (not push) for moves of 3+ spots, top-10 entry/exit. Cap at 1/week.
**Recommendation:** **Don't push** — rank changes are check-in-worthy, not ping-worthy. In-app surface only.

### T40 — Web story timeline desktop aside is `false &&` killed — **MEDIUM** (decision needed)
**File:** `web/src/app/story/[slug]/page.tsx:1776`
**Fix:** Decide whether desktop aside ships at launch. If yes, drop the `false &&`. If no, document as deliberate launch-phase hide.

### T54 — Kids parent dashboard leads with volume/streak metrics — **MEDIUM** (framing)
**File:** `web/src/app/profile/kids/page.tsx:749-756` (KPI order: Articles → Minutes → Quizzes Passed → Longest Streak).
**Fix:** Reframe parent dashboard around comprehension quality + what the kid bookmarked. Verify weekly email copy via the `family_weekly_report` RPC body before deciding email-side action.
**Recommendation:** **Lead with quiz scores + bookmarked articles**, not minutes-read. Aligns with the trust principle parents are escaping the volume frame for. Cheap reorder of the existing KPI cards.

### T55 — `ai_prompt_preset_versions` table designed but never written by routes — **MEDIUM** (admin foot-gun)
**File:** Schema `currentschema:258-273` defines the versions table; `web/src/app/api/admin/prompt-presets/route.ts:131-137` and `[id]/route.ts:173-180` overwrite the active row directly. `recordAdminAction()` provides audit trail forensics, not rollback.
**Fix:** Insert into `ai_prompt_preset_versions` on every prompt edit before mutating the active row. Add `/admin/prompt-presets/[id]/history` page that shows prior versions and a "Restore" action.
**Recommendation:** **Keep the table you already designed.** Admin-editable LLM prompts without rollback = ship-the-hostage scenario. Lowest-effort versioning: `INSERT INTO versions ... ; UPDATE active ...` in the same transaction.

### T56 — Lifetime billing dropdown still in admin — **MEDIUM** (dead option)
**File:** `web/src/app/admin/plans/page.tsx:52` — `BILLING_PERIODS = ['', 'monthly', 'annual', 'lifetime']`.
**Fix:** Remove `'lifetime'` from the array. Optionally add a CHECK constraint on `plans.billing_period`.

### T57 — Stripe `stripe_price_id` set manually per plan row — **MEDIUM** (operational risk)
**File:** `web/src/app/api/stripe/checkout/route.js:62-66` fails with `"plan ... has no stripe_price_id configured"` if missing; field is not in admin PATCH `ALLOWED_FIELDS` (`api/admin/plans/[id]/route.js:14-24`).
**Fix:** Either (a) script the Stripe price creation as part of plan creation (admin route POSTs to Stripe + writes back the ID), or (b) add `stripe_price_id` to admin PATCH `ALLOWED_FIELDS` so it can be entered without a DB poke.
**Recommendation:** **Option (a)** — eliminates the silent-fail class entirely. Stripe `prices.create` is idempotent with the right `lookup_key` so re-runs are safe.

---

## LOW — opportunistic

---

## OPERATIONAL DEBT

---

## DEFERRED — bundles, blocked, awaiting design

### T79 — T-073 settings split + 7 anchor-redirect dependents — **DEFERRED**
**Scope:** `web/src/app/profile/settings/page.tsx` is a 5,299-line monolith. 11 sub-route stub directories already exist. Split must land in a single deploy with anchor-redirect rules so all `/profile/settings#anchor` cross-surface links keep working.
**Dependents (must land same deploy):** Story Task 6 (paywall anchor), Bookmarks Task 4 (cap banner anchor), Messages Task 8 (DM paywall anchor), Notifications Task 5 (alerts link), Profile Note A (profile anchors), Settings Task 6 (DM read receipts → `PrivacyPrefsCard`), Search Note A (line 230 billing anchor).
**Recommendation:** **Single-deploy window required.** Don't split partial.

### T84 — "Please try again" copy sweep (T-013) — **DEFERRED**
**Scope:** Settings is the largest cluster. Bundle with global T-013 sweep across remaining surfaces.

---

## FRICTION SWEEP 2026-04-26

40-item friction audit across web + iOS adult + iOS kids, verified against current code on 2026-04-26. Items eliminated as fantasy/already-fixed/stale-vs-T1-T86 dropped before this list. Fact-checked against agent claims; only verified file:line evidence retained.

### HIGH — engagement, retention, compliance

#### T92 — No web push at all — **HIGH** (return-visit)
**File:** Repo grep: no VAPID keys, no service worker, no push subscription routes. Confirmed in TODO.md NOTES.
**Problem:** Web has zero ambient notification channel. iOS push ships breaking news + reply alerts; web users get nothing.
**Fix:** Wire web push (service worker + VAPID + `/api/push/subscribe`). Reuse the same `notification_deliveries` cron as APNs. Opt-in pre-prompt at value moments — never cold.
**Recommendation:** Standard PWA push stack. Dedicated session — not bundleable with T1.

### MEDIUM — quality and parity

---

## PROFESSIONAL SWEEP 2026-04-26

5 lenses applied: UI/UX manager, engagement/retention lead, senior frontend dev, senior backend dev, senior iOS dev. ~79 new findings, deduped against T1-T126. Each tagged with source lens. Numbered T127+ continuing the sequence.

### UI/UX Manager (T127-T139)

#### T165 — 90+ inline `CSSProperties` objects, no stylesheet/Tailwind/CSS modules — **LOW** (maintainability)
**File:** Across `web/src/components/`, `web/src/app/`. Maintenance burden, bundle size cost.
**Fix:** Migrate critical components to CSS modules; consider Tailwind for new work.

#### T166 — Zero `data-testid` attributes in codebase — **LOW** (testability)
**Problem:** No test selectors; e2e tests are brittle.
**Fix:** Add `data-testid` to key interactive elements as new tests are written.

---

## EXTERNAL SWEEPS 2026-04-26

10 specialist lenses applied: Security, Performance, DevOps/SRE, Product/Editorial, Mobile QA, iOS Implementation Manager, Attorney, Kids COPPA Specialist, Trust & Safety, Page Walkthrough. Each was instructed to verify before reporting and dropped unverified items. Findings deduped against existing T1-T201 and Pre-Launch Assessment. Numbered T202+ continuing the sequence.

Items below already moved to Pre-Launch Assessment (Apple/Sentry/COPPA-CRITICAL): M4→A12, M5→A13, M12→A1, L7→A9, C4→K1, C8→K9, C2/L10→new K11, plus Sentry items folded into S1-S5. Kids-COPPA-CRITICAL items C1, C5, C6 added to Pre-Launch as K12-K14 (see Pre-Launch Assessment for those).

### Security (T202-T214)

#### T233 — Hard-delete on articles, no soft-delete window — **HIGH**
**File:** `web/src/app/api/admin/articles/[id]/route.ts:611`. `.delete()` removes permanently; audit log writes after delete (orphan if persist fails).
**Fix:** Soft-delete via `deleted_at`; write audit before mutation; cron purges after 30 days.

#### T271 — Missing choice-of-law clause — **LOW** (contract enforceability)
**File:** `terms/page.tsx`. No "Governing Law" section.
**Fix:** Add: "Governed by laws of [Delaware/California], exclusive jurisdiction in [county/state]."

#### T285 — Web comment report uses free text; iOS uses structured — **MEDIUM** *(pairs with T32)*
**File:** `web/src/app/api/comments/[id]/report/route.js:45-46`. Pairs with T32.
**Fix:** Server-side enum validation; UI category picker on web.

---

**Cross-cutting pattern: bundling opportunities surfaced**
- **Privacy hardening pass:** T170/T209 (Cache-Control), T175 (hash salt), T178/S4 (Sentry extras), T191/A13 (consent gate), L9/T67 (newsletter copy), L1/L6/T68/T264 (deletion contract). All same compliance theme.
- **Auth-migration cleanup pass:** T256 (drop SIWA entitlement) bundles with AUTH-MIGRATION removing the SIWA UI.
- **Trust & safety pass:** T274/T275 ban-evasion + muted-login auth gates land together.
- **Resilience pass:** T217/T219/T220/T247 + T244-T254 mostly iOS — same UX-on-flaky-network theme.

## NOTES

- **No web push.** Web has no ambient notification channel. iOS APNs is wired. Web push (service worker + VAPID) explicitly deferred. Worth scheduling before the first major growth push.
- **Email direction = transactional-only.** T9, T10, T27, T67 all flow from this. Bundle into one PR for consistent public-facing story.
- **Trust-product positioning.** Several MEDIUM items (T34, T35, T54) ask whether engagement mechanics (downvotes, rank changes, volume framing) align with the editorial-quality positioning. Owner-decision territory before writing code.
- **Architecture cost: leaderboards/streaks/achievements.** `score_events`, `user_achievements`, `advance_streak` (verified at `web/src/lib/scoring.js:43,114`) are real. If trust-principle review concludes these mechanics shouldn't ship, the cleanup is non-trivial — multiple writers + a ledger + admin surfaces.
- **Six-agent ship pattern still applies** (4 pre-impl + 2 post-impl) for any non-trivial item below.

_Generated 2026-04-26 by consolidating prior audit + review docs (now retired) plus 13 specialist sweeps. Items verified against current code at write time — re-verify before acting on anything more than two weeks old._
