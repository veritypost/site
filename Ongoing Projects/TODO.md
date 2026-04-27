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
> - **LOCKED items** (T19, T26, T55, T57, T-EMAIL-PRUNE): owner has decided. Body section contains the impl spec. When owner says "ship T<N>" or "go on locked items," execute the spec. Don't re-ask the decision. If a sub-question surfaces during impl that the spec didn't anticipate, ask once with a recommendation, then proceed.
> - **LAUNCH BLOCKERS in `Pre-Launch Assessment.md`** (T2 — Funding Choices CMP; T271 — Maine governing-law TOS section): owner-touch only. Don't pick from the autonomous loop. Owner ships these in coordination with AdSense console access + legal sign-off windows.
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
- **T19** — simplify home (categories nav + feed + Browse + occasional hero/breaking). See T19 body for impl spec.
- **T26** — RPC migration adding `comment_reply` + `comment_mention` notifications via `create_notification`. Scope locked (in_app + push only).
- **T55** — drop `ai_prompt_preset_versions` orphan table (T242 snapshot covers audit/replay).
- **T57** — auto-mint Stripe price API on plan create (option B).
- **T117** — _Moved to QUEUED FOR OWNER REVIEW (sixth-pass)._ Verification found admin pages use `<EmptyState>` by design (not `<ErrorState>`); only 6 user-facing pages currently use `<ErrorState>` (bookmarks, leaderboard, messages, notifications, profile, search). The original ~19-page migration target was misframed — admin's `<EmptyState>` pattern is intentional. Owner question queued.
- **T-EMAIL-PRUNE** — drop 4 engagement types from `send-emails` cron; keep `data_export_ready` + `kid_trial_expired` + `expert_reverification_due`. Verified 2026-04-27: `web/src/app/api/cron/send-emails/route.js:21-29` currently maps 7 types. Concrete drops: `breaking_news`, `comment_reply`, `expert_answer_posted`, `kid_trial_day6`.

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

- **2026-04-27** — Supabase "Confirm email" project setting
  - **What I was doing:** auditing the AUTH/PERMS SYSTEM MAP for blockers
  - **What's blocking:** the system map's Phase 1 plan (and the AUTH-MIGRATION magic-link cutover) both depend on this setting being ON in Supabase Dashboard → Authentication → Sign In/Up. I cannot read this from code.
  - **Question for owner:** is "Confirm email" currently ON in the production Supabase project? (If OFF, magic-link signups won't actually wait for the click — sessions will issue immediately on signup.)
  - **Options I see:** (A) ON — proceed with AUTH-MIGRATION as planned; (B) OFF — flip ON before migration session, plan rollback if needed; (C) need help checking — owner pulls up the dashboard while we co-pilot. **Recommended pick: A** if it's already ON.
  - **What I did instead:** captured the dependency as T345 (beta-cron pre-flight) + flagged here.

- **2026-04-27** — Manual admin email-confirm tool (for support recovery cases)
  - **What I was doing:** auditing the AUTH/PERMS SYSTEM MAP §13 (email-change flow leaves users stuck `email_verified=false` indefinitely if they never confirm)
  - **What's blocking:** under magic-link, users who lose email access OR whose magic link gets eaten by a corporate scanner have NO recovery path other than support. The system map §18 raises whether an admin tool exists for this — I checked `web/src/app/admin/users/[id]/*` and there's no email-confirm action.
  - **Question for owner:** ship a `/admin/users/[id]/confirm-email` action now (5-min route) so support has the lever, or wait until the first support ticket lands?
  - **Options I see:** (A) ship now (defensive, ~1 hour incl. audit-log + 6-agent pattern); (B) defer until first ticket (lazy, but support has a manual SQL workaround anyway via the service-role connection); (C) add as a `/admin/auth-recovery/` mini-page with multiple recovery levers (confirm email, clear `verify_locked_at`, reset failed-login lockout) consolidated. **Recommended: C** — one page covers all the recovery cases that come up in beta + post-launch support.
  - **What I did instead:** captured here.

_(Above queue items added during the AUTH/PERMS SYSTEM MAP fifth-pass audit, 2026-04-27.)_

- **2026-04-27** — T117 admin error-state primitive direction
  - **What I was doing:** sixth-pass re-audit; original "migrate ~19 web pages to `<ErrorState>`" claim against admin pages.
  - **What's blocking:** verification shows admin pages (analytics, breaking, ad-campaigns, ad-placements, email-templates, moderation, newsroom, pipeline, promo, recap, reports, sponsors, stories, subscriptions, support, webhooks) use `<EmptyState>` for both empty AND error rendering. User-facing pages (bookmarks, leaderboard, messages, notifications, profile, search) use `<ErrorState>`. The pattern split looks intentional, not a missed migration.
  - **Question for owner:** keep the `<EmptyState>`-for-admin / `<ErrorState>`-for-user split (close T117 entirely), or unify everything onto `<ErrorState>` (re-enable the migration)?
  - **Options I see:** (A) close T117, intentional pattern; (B) unify on `<ErrorState>`, ~16 admin pages to migrate; (C) build a third primitive `<AdminErrorState>` that visually matches admin's denser layout. **Recommended pick: A** — admin's denser table-style pages don't benefit from `<ErrorState>`'s hero treatment.
  - **What I did instead:** removed T117 from skip list, captured here.

- **2026-04-27** — T309 billing-state RPC cross-clearing
  - **What I was doing:** sixth-pass re-audit of the `frozen_at` + `plan_grace_period_ends_at` interaction.
  - **What's blocking:** RPC bodies (`billing_freeze_profile` / `billing_resubscribe` / `billing_unfreeze`) aren't readable from local SQL files; need MCP to confirm whether they cross-clear each other.
  - **Question for owner:** ready to MCP-inspect the three RPC bodies so we can write the migration to fix cross-clearing (or confirm it's already correct)?
  - **Options I see:** (A) MCP-inspect now and ship migration if needed; (B) defer until billing-state-machine pass (T347 consolidation); (C) leave as-is and only address if it surfaces in support. **Recommended pick: A** — pair with T308 (manual-sync ignores `frozen_at`) for one billing-state-machine bundle.
  - **What I did instead:** captured here.

- **2026-04-27** — T338 deletion-scheduled banner severity (`warnSoft` vs `dangerSoft`)
  - **What I was doing:** sixth-pass re-audit of the redesign banner severity classes.
  - **What's blocking:** verifier and adversary disagreed. Verifier called the original CONFIRMED (yellow understates 30-day countdown urgency); adversary called STALE (warn correctly signals "reversible during the window," danger would oversignal).
  - **Question for owner:** UX call — `warnSoft` (yellow, current) or `dangerSoft` (red) for the 30-day deletion-scheduled banner?
  - **Options I see:** (A) keep `warnSoft` — it's reversible; (B) switch to `dangerSoft` — irreversibility looms; (C) split severity by countdown remaining (warn → danger when <7 days left). **Recommended pick: A** unless owner wants harder pressure to revert.
  - **What I did instead:** captured here, kept T338 body with the disagreement noted.

_(Above queue items added during the sixth-pass full TODO re-audit, 2026-04-27.)_

---

### Verification status (as of 2026-04-27 — sixth pass)
**Sixth-pass (2026-04-27) full TODO re-audit via 6 parallel Explore agents** — every open + locked item read against current code. Result:
- **3 items DROPPED as already-fixed / wrong claim:** T117 (admin pages use `<EmptyState>` by design — not the same migration target as `<ErrorState>`; only 6 user-facing pages currently use `<ErrorState>`, none of the 19 listed admin pages need it), T314 (TTS button is conditionally rendered `{canListenTts && ...}` — it doesn't render at all for non-Pro, "disabled-but-visible" claim is wrong), T326 (`/api/events/batch` line 164 sets `user_id` server-authoritatively before line 167's `user_tier` clamp — security invariant holds via user_id, the tier clamp is hardening not a hole).
- **5 items RE-SCOPED inline:** T54 (lines 807-814 → 880-887; original order still in place), T165 (4,272 → ~4,630 inline `style={{...}}` matches), T173 (file-path note: POST is in `/api/comments/route.js`, not `[id]/route.js` — parity gap kernel still real), T310 (explicit route list added: signup:200-210, login:119-128, callback:157-166, email-change:132-148), T322 (5-of-19 → only 3 events actually fire: `signup_complete`, `onboarding_complete`, `page_view`).
- **6 items moved to QUEUED FOR OWNER REVIEW:** T54 KPI order (locked spec doesn't match current code OR original claim; need owner re-confirm what shipped), T117 admin-pages question (keep `<EmptyState>` pattern or migrate to `<ErrorState>`?), T309 + T318 + T319 (defer to MCP — RPC bodies, perm-set identity, SKU-row deletion all need DB inspection), T338 (UX call: warnSoft is arguably correct for reversible deletion-scheduled; my read is keep, owner confirms).
- **T330 verdict overridden:** one agent called it STALE because `/u/[username]/page.tsx` was assumed obsolete. **It's not** — that path is the live public-profile route; the redesign work is at `/profile/*` (the user's own editor). T330 remains CRITICAL — a privacy leak the moment `PUBLIC_PROFILE_ENABLED` flips.
- **T333 demoted to LOW** (host-check is implicitly production-safe since `:3333` never appears in prod hostnames; defense-in-depth concern remains but is low risk).
- **T-EMAIL-PRUNE clarified:** current `send-emails/route.js:21-29` defines 7 types; locked decision keeps 3 (`data_export_ready` + `kid_trial_expired` + `expert_reverification_due`). Concrete drops: `breaking_news`, `comment_reply`, `expert_answer_posted`, `kid_trial_day6`. Ready to ship.
- **Everything else (~50 items spanning T299-T351 + T26 + T40 + T55-T57 + T173 kernel + T233 + T315 + T92 + T166 + T301 + T312 + T350 + T19 + T27 + T302-T308 + T315-T317 + T320-T321 + T323-T325 + T327-T329 + T331-T337 + T339-T344): CONFIRMED-REAL** with file:line citations re-read against current code.

### Verification status (as of 2026-04-27 — fourth pass)
**Every item T1-T201 has been reviewed against live code at least once. The newest professional-sweep items (T127-T200) were cross-verified by 4 parallel agents.** Final tally:
- **~113 items remain open and confirmed real**
- **32 items DELETED entirely** — closed (already implemented or wrong claim) or moved elsewhere:
  - **Auth-migration / Pre-Launch moves:** T1, T4, T5, T6, T8, T21, T24, T47, T78, T80, T86, T87, T93, T94, T95, T96, T158, T178, T183, T191
  - **Verified already-fixed in code:** T33, T76, T83, T114, T115, T120, T127 (login `inputMode`), T128 (focus-visible IS in layout.js), T150 (leaderboard link IS in profile), T164 (null guard exists), T186 (safe subscript exists), **T201** (REFERRAL_COOKIE_SECRET IS in `.env.example:130`, dropped 2026-04-27), **T285** (web report now enum-validates via `assertReportReason`, dropped 2026-04-27)
  - **Verified stale / claim-was-wrong:** T133 (delay IS guarded), T154 (Expert tab IS in nav), T184 (LoginView capture is fine), T192 (didReceive is optional), T196 (only 2 .task blocks), T199 (intentional pattern)
- **13 items RE-SCOPED inline** — kernel real, claim corrected: T18, T22, T40 (line 1776→2066), T54 (lines 749-756→807-814), T63, T74, T82, T99, T107, T117 (~9→~19 pages), T130, T141, T144, T165 (90+→4,272), T173 (parity-only, RPC enforces), T174, T185, T188, T200, T233 (line 611→762; audit-before-delete, not after)
- **3 items PENDING MCP VERIFY** — `pg_proc` inspection: T16, T17, T26 (T26 since CONFIRMED-REAL via MCP 2026-04-27)

**Fourth-pass (2026-04-27) re-verified all open + locked + deferred items via 4 parallel Explore agents:** T14 / T19 / T26 / T27 / T34 / T35 / T40 / T54 / T55 / T56 / T57 / T92 / T117 / T165 / T166 / T173 / T201 / T233 / T285 / T-EMAIL-PRUNE all read against live code; consensus filed above. No new bugs surfaced from incidental code traversal.

**Fifth-pass (2026-04-27) AUTH/PERMS SYSTEM MAP audit:** 4 parallel Explore agents verified each finding from `Ongoing Projects/2026-04-27_AUTH_PERMS_SYSTEM_MAP.md` (61 items total: §16 anomalies #1-22, pen-test #23-30, analytics #31-38, redesign §21.1+§21.2). Result:
- **47 new items added** as T298-T344 + T298 meta-issue (direction conflict). See "AUTH/PERMS SYSTEM MAP FINDINGS — verified 2026-04-27" section for full bodies with file:line citations.
- **+7 architectural / sequencing items added** as T345-T351 — second pass over the doc surfaced concerns that aren't bug-with-file:line but are real considerations: T345 beta-cron + AUTH-MIGRATION sequencing pre-flight (CRITICAL — blocks AUTH-MIGRATION), T346 freeze-scope product question, T347 8-flag enum consolidation, T348 per-request perm memoization, T349 single-screen signup magic-link form, T350 deprecated auth-mockups deletion, T351 §21.3 polish bundle.
- **+5 DB-perf / ops-debt items added** as T352-T356 from a follow-on DB-perf review (post-5th-pass): audit_log retention, webhook_log retention, events partition-drop, Stripe reconcile N+1, permission_set_perms REINDEX. (Sixth review item — `compute_effective_perms` request memoization — already captured as T348; not duplicated.)
- **System map doc updated inline** for items already-fixed: §16 #26, #27, #30 + §21.2.9 marked `[RESOLVED 2026-04-27 — TODO 5th-pass verification]` so future agents reading the system map see the resolved status without having to cross-reference TODO.
- **+4 cutover-plan items added** as T357-T360 from system map §22 (Cutover plan — added to the doc after the 5th-pass): T357 web profile cutover (delete legacy 7,200 lines + move /redesign/* → /profile/*), T358 iOS profile redesign port (mirror master/detail shell + 22 sections), T359 iOS `profile_visibility='hidden'` audit (CRITICAL — privacy leak parallel to T330), T360 build redesign CategoriesSection + MilestonesSection on web (currently LinkOut'd, blocks iOS port).
- **+2 owner-queue entries added** to QUEUED FOR OWNER REVIEW: Supabase "Confirm email" project setting verification + manual admin email-confirm tool decision.
- **4 items dropped as already-fixed:** pen-test #26 (rate limit fires before JSON parse at `/api/access-redeem`), pen-test #27 (login-precheck has constant-shape responses + per-email rate limit), pen-test #30 (email-change calls `auth.updateUser` first, race no longer reproducible), redesign §21.2.9 (AvatarEditor has its own footer Save).
- **3 items not added (out of scope):** anomaly #14 (free-reads pill — owner-decided to drop in system map Phase 0.4), #15 (lifecycle email cadence — separate retention project), #21 (anon save-for-later — separate retention project).
- **DIRECTION CONFLICT surfaced (T298):** system map §17 Phase 1 plan describes email+password unified-verify-email; this contradicts the AUTH-MIGRATION magic-link lock (TODO line 39 + AUTH DIRECTION). Owner-decision required before Phase 1 can ship.

Total open items now: ~176 (was ~113 + 47 anomaly + 7 architectural + 5 DB-perf + 4 cutover-plan).

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

### T55 — `ai_prompt_preset_versions` table designed but never written by routes — **MEDIUM** (admin foot-gun)
**File:** Schema `currentschema:258-273` defines the versions table; `web/src/app/api/admin/prompt-presets/route.ts:131-137` and `[id]/route.ts:173-180` overwrite the active row directly. `recordAdminAction()` provides audit trail forensics, not rollback.
**Fix:** Insert into `ai_prompt_preset_versions` on every prompt edit before mutating the active row. Add `/admin/prompt-presets/[id]/history` page that shows prior versions and a "Restore" action.
**Recommendation:** **Keep the table you already designed.** Admin-editable LLM prompts without rollback = ship-the-hostage scenario. Lowest-effort versioning: `INSERT INTO versions ... ; UPDATE active ...` in the same transaction.

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

#### T165 — ~4,630 inline `style={{...}}` usages across web — **LOW** (maintainability)
**File:** Across `web/src/components/`, `web/src/app/`. Tailwind PostCSS plugin is wired (`web/postcss.config.js`) and `web/src/app/globals.css` exists, but adoption is minimal — most styling is inline objects. Maintenance burden, bundle size cost.
**Fix:** Migrate critical components to CSS modules / utility classes; consider Tailwind for new work. (Re-scoped 2026-04-27 from "90+" → 4,272 → 4,630 — count drift confirms growth.)

#### T166 — Zero `data-testid` attributes in codebase — **LOW** (testability)
**Problem:** No test selectors; e2e tests are brittle.
**Fix:** Add `data-testid` to key interactive elements as new tests are written.

---

## EXTERNAL SWEEPS 2026-04-26

10 specialist lenses applied: Security, Performance, DevOps/SRE, Product/Editorial, Mobile QA, iOS Implementation Manager, Attorney, Kids COPPA Specialist, Trust & Safety, Page Walkthrough. Each was instructed to verify before reporting and dropped unverified items. Findings deduped against existing T1-T201 and Pre-Launch Assessment. Numbered T202+ continuing the sequence.

Items below already moved to Pre-Launch Assessment (Apple/Sentry/COPPA-CRITICAL): M4→A12, M5→A13, M12→A1, L7→A9, C4→K1, C8→K9, C2/L10→new K11, plus Sentry items folded into S1-S5. Kids-COPPA-CRITICAL items C1, C5, C6 added to Pre-Launch as K12-K14 (see Pre-Launch Assessment for those).

### Security (T202-T214)

#### T233 — Hard-delete on articles, no soft-delete window — **HIGH**
**File:** `web/src/app/api/admin/articles/[id]/route.ts:762`. `.delete()` removes permanently; `recordAdminAction` writes BEFORE the mutation, so audit lands but the article is irrecoverable. Schema already has `articles.deleted_at` (unused).
**Fix:** Soft-delete via `deleted_at`; write audit before mutation; cron purges after 30 days.

---

**Cross-cutting pattern: bundling opportunities surfaced**
- **Privacy hardening pass:** T170/T209 (Cache-Control), T175 (hash salt), T178/S4 (Sentry extras), T191/A13 (consent gate), L9/T67 (newsletter copy), L1/L6/T68/T264 (deletion contract). All same compliance theme.
- **Auth-migration cleanup pass:** T256 (drop SIWA entitlement) bundles with AUTH-MIGRATION removing the SIWA UI.
- **Trust & safety pass:** T274/T275 ban-evasion + muted-login auth gates land together.
- **Resilience pass:** T217/T219/T220/T247 + T244-T254 mostly iOS — same UX-on-flaky-network theme.

---

## AUTH/PERMS SYSTEM MAP FINDINGS — verified 2026-04-27

Source: `Ongoing Projects/2026-04-27_AUTH_PERMS_SYSTEM_MAP.md`. 4 parallel Explore agents re-verified each finding against live code 2026-04-27. Items already-fixed dropped (pen-test #26 — rate limit fires before JSON parse; pen-test #27 — login-precheck has constant-shape responses + per-email rate limit; pen-test #30 — email-change calls `auth.updateUser` first now; §21.2.9 — AvatarEditor has its own footer Save). Items not added to TODO: anomaly #14 (free-reads pill — owner-decided to drop in system-map Phase 0.4), #15 (lifecycle email — separate retention project), #21 (anon save-for-later — separate retention project).

### Security — CRITICAL

#### T299 — Homoglyph bypass on ban-evasion email check — **CRITICAL** (security)
**File:** `web/src/app/api/auth/signup/route.js:57`. `.ilike('email', email)` does ASCII case-folding only — Unicode homoglyphs (Cyrillic 'а' U+0430 vs Latin 'a' U+0061) bypass the banned-account match.
**Fix:** NFKD-normalize both sides before compare; or use a homoglyph-aware library; or normalize at insert time so the DB only stores canonical form. 5-line change.

#### T300 — Public-profile column-level leakage on `users` table — **CRITICAL** (privacy/PII)
**File:** RLS policy on `users` is row-level: `id=auth.uid() OR profile_visibility='public' OR is_admin_or_above()`. When `profile_visibility='public'`, the entire row is readable via PostgREST `from('users').select('*')` — including `email, plan_id, stripe_customer_id, comped_until, cohort, frozen_at`, all kill-switch flags.
**Fix:** Either (a) SECURITY DEFINER view `public_profiles_v` with whitelisted columns + RLS-revoke direct SELECT on `users`, or (b) split into a `public_profile` view + private internal `users` table. T5 schema change — halt and queue migration for owner.

#### T301 — Kid pair-code grants 7-day full-session impersonation if leaked — **CRITICAL** (kids security)
**File:** `web/src/app/api/kids/pair/route.js:24` (`TOKEN_TTL_SECONDS = 60*60*24*7`); :136-150 mints JWT with `is_kid_delegated: true`. If pair code shared via SMS/Slack/screenshot leaks, attacker reads kid reading log, quiz attempts, sibling kid_profiles for 7 days.
**Fix:** Reduce TTL (1h proposed) + require out-of-band parent confirmation in iOS app before JWT issues + alert parent on first device pair. Bundle with kids-security pass.

### Auth/Billing flow — HIGH

#### T303 — Leaderboard hardcoded `.eq('email_verified', true)` filters — **HIGH** (truth-in-UI)
**File:** `web/src/app/leaderboard/page.tsx:207, 242, 327`. Three identical hardcoded filters that override the public `leaderboard.view` perm grant. Pro-unverified beta users see top-3-only.
**Fix:** Drop all three filters (perm-driven only) OR consolidate via the same allowlist gate that compute_effective_perms uses. Owner decision required.

#### T304 — Stripe + cohort double-billing risk — **HIGH** (revenue/CX)
**File:** `web/src/app/api/stripe/checkout/route.js` (and `web/src/lib/stripe.js`). No pre-checkout guard against `cohort='beta' + plan_id=verity_pro_monthly + comped_until > now()`. A beta user who clicks Upgrade pays $9.99 Stripe-side; `sweep_beta_expirations` only modifies local state, never cancels upstream Stripe.
**Fix:** Pre-checkout 409 if cohort-Pro-active. Bundle with billing-state-machine work.

#### T308 — Admin manual-sync downgrade ignores `frozen_at` — **HIGH** (state coherence)
**File:** `web/src/app/api/admin/subscriptions/[id]/manual-sync/route.js:100-150` (downgrade branch). Comment at line 32 says "we leave verity_score / frozen_at alone" — frozen user downgraded to free remains frozen-on-free, logically incoherent (no plan to be frozen against).
**Fix:** Branch on `frozen_at` — admin downgrade should either unfreeze or surface a confirmation that frozen state will persist.

#### T309 — `frozen_at` and `plan_grace_period_ends_at` don't clear each other — **HIGH** (state machine)
**File:** RPCs `billing_freeze_profile` / `billing_resubscribe` / `billing_unfreeze` (in migrations). User can have both columns set; AccountStateBanner only shows the higher-priority one. Defer-to-MCP needed to verify the exact RPC bodies — cited in system map §16 #10 as unverifiable from local SQL.
**Fix:** T5 schema/RPC change — halt and queue migration. Pair with T308 for the broader billing-state-machine consolidation.

#### T310 — Audit-log writes are best-effort across multiple routes — **HIGH** (compliance)
**File:** Pattern recurs across the auth surface. Sixth-pass enumerated explicitly: `web/src/app/api/auth/signup/route.js:200-210`, `web/src/app/api/auth/login/route.js:119-128`, `web/src/app/api/auth/callback/route.js:157-166`, `web/src/app/api/auth/email-change/route.js:132-148`. All four wrap the `audit_log` insert in `try { ... } catch { console.error(...) }`. Connection-pool exhaustion or transient DB partition produces un-audited account creations / mod actions.
**Fix:** Either (a) queue audit events to a retry table that a cron processes, or (b) fail the security-critical request when audit insert fails. Sweep all four routes (and any new ones) in a single pass.

### Auth/Billing flow — MEDIUM


#### T317 — `access_codes.type` taxonomy is dual-purpose and mostly dead — **MEDIUM** (dead UI)
**File:** `web/src/app/r/[slug]/route.ts:76-77` and `web/src/app/api/access-redeem/route.ts:62-63` filter `.eq('type', 'referral')` only. `web/src/app/admin/access/page.tsx:37` mints `'invite'|'press'|'beta'|'partner'` — none honored by redemption routes.
**Fix:** Either delete the legacy types from the schema enum + admin UI, or wire them into redemption. Today they're a ship-the-hostage admin foot-gun.

#### T320 — Owner-link Pro recipients are gutted (cohort=beta, email_verified=false) — **MEDIUM** (CX, superseded by AUTH-MIGRATION)
**File:** `web/src/app/welcome/page.tsx:106-107` — `isBetaOwnerLinkSignup` bypass lets cohort-beta+Pro past the welcome carousel only; every other surface still hard-blocks the 21 `requires_verified=true` perms. Cannot comment, follow, vote, bookmark unlimited, see own activity, use TTS.
**Fix:** Resolved automatically when AUTH-MIGRATION ships (every magic-link signin produces an inherently-verified user; no `email_verified=false` state). Until then, owner direction (system map §17 Phase 1) is "everyone verifies the same way" — drop the `isBetaOwnerLinkSignup` bypass + run them through the standard flow.

#### T321 — Owner-link recipients locked out of `/profile/settings#billing` — **MEDIUM** (revenue, superseded by AUTH-MIGRATION)
**File:** `web/src/app/profile/settings/page.tsx:80` — `SECTION_BILLING_VIEW: 'billing.view.plan'` requires verified email. Owner-link Pro users can't reach the upgrade page even if they want to actually pay.
**Fix:** Resolves with AUTH-MIGRATION. Pre-migration mitigation: carve `billing.view.plan` out of `requires_verified` for cohort-beta-Pro users only.

### Analytics — instrumentation gaps

#### T322 — Most defined event types never fire (3 of 19 wired) — **HIGH** (analytics fidelity)
**File:** `web/src/lib/events/types.ts:67-101` defines 19 event names. Sixth-pass recount of `trackServer\(` + `trackEvent\(` call sites in `web/src/` finds only 3 distinct events firing: `signup_complete, onboarding_complete, page_view` (the last via `usePageViewTrack('home')`). `quiz_started` / `quiz_completed` not actually wired despite earlier audit. Missing: `signup_start, verify_email_complete, subscribe_start, subscribe_complete, comment_post, bookmark_add, article_read_start, article_read_complete, scroll_depth, score_earned`, all ad/quiz events, etc.
**Fix:** Wire the unwired event types at their natural call sites. Precondition for any meaningful conversion-funnel work.

#### T328 — GA4 + custom-events pipelines fire in parallel, page_view only on home for custom — **MEDIUM** (analytics integrity)
**File:** `web/src/components/GAListener.tsx:45` (GA4 page_view on every route) vs `web/src/app/_HomeFooter.tsx:23` (custom page_view on home only). Story / leaderboard / settings views never captured in custom events pipeline.
**Fix:** Decide which pipeline is canonical; instrument the missing surfaces on the canonical one. Likely consolidate to custom-events with route-change listener mounted at app root.

#### T329 — No admin dashboard reads from `events` table — **HIGH** (product decision-making)
**File:** `web/src/app/admin/analytics/page.tsx:75-80` queries `users / articles / comments / reading_log / quiz_attempts` — never the `events` table. 5,846 events in last 7 days are write-only.
**Fix:** Add events-table panels to admin analytics (signup funnel, page_view by tier, event-type frequency). Precondition: T322 (more events firing) + T323/T324 (tier accuracy).

### Redesign cutover prep — `/redesign/*` track

These items live in `web/src/app/redesign/*` (currently dev-mounted at `localhost:3333`). They become production-blocking when the redesign cuts over to `/profile/*` and `/u/*`.

#### T331 — `profile_visibility` enum-write mismatch (PrivacyCard vs PublicProfileSection) — **CRITICAL** (data integrity)
**File:** `web/src/app/redesign/_components/PrivacyCard.tsx:168` writes `'hidden'`; `PublicProfileSection.tsx:75` writes `'public'|'private'`. Saving in either surface flips the other unexpectedly.
**Fix:** Unify — PublicProfileSection reads `'hidden'` as a third tri-state (render read-only with link to PrivacyCard) OR expose the same tri-state.

#### T333 — Dev-perms-all-true override gates only on `host === 'localhost:3333'` — **LOW** (defense-in-depth, demoted sixth-pass)
**File:** `web/src/app/redesign/profile/ProfileApp.tsx:117-121`. Single host check; production hostnames never end in `:3333`, so the failure mode requires an environment misconfiguration AND a port collision — practically near-zero. Demoted from HIGH to LOW.
**Fix:** Belt-and-suspenders — tighten to `process.env.NODE_ENV !== 'production' && host === 'localhost:3333'`. Same pattern in `web/src/middleware.js _isRedesignPort` check. Cheap edit; address opportunistically with the next redesign cutover work.

#### T334 — Lockdown deletes `follows` rows directly from the client — **HIGH** (auth/security)
**File:** `web/src/app/redesign/_components/PrivacyCard.tsx:175-178`. Direct `from('follows').delete().eq('following_id', authUser.id)` trusts RLS to enforce caller-identity. If RLS drifts, this becomes a write-to-other-users primitive.
**Fix:** Server RPC `lockdown_self()` that atomically sets `profile_visibility='hidden'` AND deletes follows rows. One transaction, server-side identity check. T5 schema work.

#### T335 — `Field.tsx` declares CSS transitions but never wires `:focus`/`:hover` — **HIGH** (a11y)
**File:** `web/src/app/redesign/_components/Field.tsx:62`. Transition rule present; `focusRing` helper exists in `palette.ts:124` but isn't applied. Keyboard users get no focus feedback in any settings card.
**Fix:** Add `onFocus`/`onBlur` handlers toggling `boxShadow: SH.ring`; `:hover` background changes for button variants.

#### T336 partial — focus trap + banner z-index promotion — **HIGH** (a11y)
**File:** `web/src/app/redesign/_components/AppShell.tsx`. Escape-to-close drawer shipped (rolls up with redesign-cutover commit). Focus trap when drawer is open + banner z-index promotion (drawer z-30 below banners z-40 — banned user on mobile can't see ban banner above open drawer) deferred to a follow-up since both involve scope expansion (focus trap needs a small `useFocusTrap` hook integration; banner promotion needs auditing every banner caller's z-index).

#### T337 — Native `window.confirm()` in 3 redesign components — **MEDIUM** (visual consistency)
**File:** `web/src/app/redesign/_components/BillingCard.tsx`, `MFACard.tsx`, `SessionsSection.tsx`. Inconsistent with the rest of the redesign's modal style.
**Fix:** Replace with `Card variant="danger"` pattern already used by Hidden lockdown confirm.

#### T338 — Deletion-scheduled banner uses `warnSoft` not `dangerSoft` — **MEDIUM** (severity match — owner UX call queued)
**File:** `web/src/app/redesign/_components/AccountStateBanner.tsx:78-82`. Account deletion is irreversible after 30 days; warn (yellow) understates severity.
**Sixth-pass:** Reasonable case for keeping `warnSoft` — deletion is reversible during the 30-day window, so warn (vs danger) signals "act if you didn't mean it" rather than "imminent irreversible loss." Owner UX call queued.
**Fix:** Switch to `dangerSoft` (red) only if owner agrees. Same change to `DataCard.tsx` inline pending-banner.

#### T339 — `as never` casts on Avatar in PrivacyCard + BlockedSection — **MEDIUM** (type safety)
**File:** `web/src/app/redesign/_components/PrivacyCard.tsx:492` and `BlockedSection.tsx:123`. Avatar receivers may be null → silent broken-avatar fallback.
**Fix:** Define proper `AvatarUser` type; explicit null guard.

#### T341 — `YouSection` action cards drive users out of profile — **MEDIUM** (retention)
**File:** `web/src/app/redesign/profile/YouSection.tsx:86-119`. ActionCards link to `/`, `/bookmarks`, `/messages`, `/expert-queue`, `/profile/family` — primary abandonment vector for users who came to edit profile.
**Fix:** Replace with profile-internal CTAs ("Polish your profile: avatar / bio / privacy"); move outbound nudges into a discrete onboarding card only when `articles_read_count === 0`.

### Architectural / sequencing concerns surfaced from system map (non-finding considerations)

These aren't bugs with a file:line — they're architectural decisions, sequencing dependencies, and product questions that the system map raised but which a one-line "TODO entry per anomaly" walk-through would skip. Captured here so they don't get lost.

#### T345 — Beta-cron + AUTH-MIGRATION sequencing pre-flight — **CRITICAL** (BLOCKS AUTH-MIGRATION)
**Source:** System map §11 (`sweep_beta_expirations` body lines 989-1090). When `settings.beta_active='false'`, the cron stamps `verify_locked_at=now()` for **every** beta user with `email_verified=false` — including owner-link recipients. The cron has a hard expiry baked in: any owner-link Pro user who hasn't verified by beta-end loses Pro AND gets stripped to the allowlist.
**Why this matters now:** AUTH-MIGRATION (magic-link) cutover is the moment this trips. Currently-beta cohort users with passwords + `email_verified=false` get nuked at next sweep run after migration. Even if migration handles new signups via magic-link, the legacy beta cohort needs to be reconciled BEFORE the cron runs again.
**Fix:** Pre-flight migration step before AUTH-MIGRATION ships: (a) bulk-trigger magic-link emails to all `cohort='beta' AND email_verified=false` users with a deadline, OR (b) admin-confirm them in bulk (set `email_verified=true` server-side under support exception), OR (c) flip `settings.beta_active='true'` permanently so the cron's downgrade path never fires. Pick one with owner before the migration session opens.

#### T346 — Freeze scope is monetization-only, not content lockout — **MEDIUM** (product decision)
**Source:** System map §14. `frozen_at` disables score scoring, DM, leaderboard visibility — but **NOT** comments, voting, following, or reading. A frozen user (e.g., disputed payment) can still post comments and follow others. Question: is freeze supposed to be a content lockout, or only a monetization signal?
**Fix:** Owner product decision. If content lockout: add `frozen_at IS NULL` to comment INSERT RLS, vote routes, follow routes. If monetization-only: document the intent so future agents don't "fix" it as a bug.

#### T347 — Consolidate 8 user-state flags into one enum with documented transitions — **MEDIUM** (architectural)
**Source:** System map §8. The 8 kill-switches (`is_banned`, `locked_until`, `is_muted`/`muted_until`, `deletion_scheduled_for`, `frozen_at`, `plan_grace_period_ends_at`, `verify_locked_at`, `comped_until`) are independent boolean/timestamp columns. They're not synchronized — a user can be in any combination. AccountStateBanner picks the highest-priority one; nothing enforces sane combinations.
**Fix:** State-machine pass: define legal transitions, add CHECK constraints, document mutually-exclusive states. Pairs with T305/T309 (banner stacking + frozen+grace clearing). T5 schema work — halt and queue.

#### T348 — `requirePermission()` no per-request memoization — **DEBT** (perf)
**Source:** System map §12. Every `requirePermission()` call hits `compute_effective_perms` directly. Two checks in the same request = two DB roundtrips. With 927 active perms and the function joining role/plan/perm-set tables, this is non-trivial latency on hot paths.
**Fix:** Memoize per-request — wrap `requirePermission` with a `Map` keyed on `permKey` scoped to the request context (Next.js `headers()` or AsyncLocalStorage). One DB call per unique perm per request.

#### T349 — Single-screen signup form factor under magic-link — **MEDIUM** (UX, bundle with AUTH-MIGRATION)
**Source:** System map §17 Phase 2. Under magic-link, signup collapses to a single email field — no password, no username at first. Pick-username becomes a post-verify step. Today's signup form has email + password + username + age + ToS checkbox; under magic-link only email + ToS remains.
**Fix:** Bundle into AUTH-MIGRATION execution session. Drop password fields, defer username to post-verify, keep ToS gate (Apple A9 requires dual-checkbox per Pre-Launch).


### DB performance / ops debt — surfaced from external DB-perf review 2026-04-27

Five items below come from a follow-on DB-perf review pass on the auth/perms system map. None launch-blocking; all real ops debt. (A 6th item from that review — `compute_effective_perms` request-scoped memoization — is already captured as T348; not duplicated here.)

#### T352 — `audit_log` has no retention policy — **MEDIUM** (DEBT, GDPR)
**Source:** DB-perf review (post-5th-pass) finding #39. The `audit_log` table grows unbounded — every admin action, signup, mod action appends a row, none are reaped. Compliance angle: GDPR data-minimization expects retention windows on audit data tied to identity.
**Fix:** Define retention (90d? 1y? indefinitely with PII redacted after N days?), add a cron that prunes or anonymizes old rows. T5 schema work — halt and queue migration. Owner picks the retention window.

#### T353 — `webhook_log` has no retention policy — **MEDIUM** (DEBT)
**Source:** DB-perf review #40. `webhook_log.event_id` is the Stripe-idempotency key (per system map §9). Table grows unbounded. Idempotency only needs ~24h of recent events; older rows are dead weight slowing the UNIQUE-constraint check.
**Fix:** Cron that deletes rows older than 30 days. Verify no dashboards / replays read older entries before pruning.

#### T354 — `events` table needs partition-drop retention cron — **MEDIUM** (DEBT, perf)
**Source:** DB-perf review #41. The `events` table is at 5,846 rows in last 7 days (per system map §16 analytics findings) — extrapolates to ~300k/yr. Without retention, query performance degrades as the table grows. Standard pattern: monthly partitions + drop partitions older than N months.
**Fix:** Convert to PARTITION BY RANGE on `created_at`; cron drops partitions > 12 months old. T5 schema work — halt and queue. Coordinate with T329 (admin events dashboard) to define query patterns first.

#### T355 — `subscription-reconcile-stripe` cron is N+1 sequential — **LOW** (perf, runs nightly)
**Source:** DB-perf review #43. `web/src/app/api/cron/subscription-reconcile-stripe/route.ts` (added in Phase 6 per CHANGELOG 2026-04-27) iterates over up-to-200 subs, does one Stripe REST call per sub sequentially. With Stripe rate limits + per-call latency, a 200-sub run takes ~minutes.
**Fix:** Batch via `Promise.allSettled` in chunks of 10-20 with rate-limit awareness, or use Stripe's bulk-list endpoint where available. Bundle with billing-state-machine work.

#### T356 — `permission_set_perms` index bloat — pre-launch REINDEX — **LOW** (DEBT)
**Source:** DB-perf review #44. The 21-perm-set × 927-perm join table sees heavy churn during admin perm edits + the many migrations that have rebuilt perm taxonomy (per system map §4: 9 inactive sets retired). PostgreSQL index bloat accumulates without VACUUM FULL / REINDEX.
**Fix:** Run `REINDEX TABLE CONCURRENTLY permission_set_perms` once before launch. Check `pg_stat_user_indexes` for bloat percentage first to confirm it's worth the locks. T5-adjacent — owner runs the REINDEX during a low-traffic window.

### Cutover plan — surfaced from system map §22 (added 2026-04-27)

System map §22 ("Cutover plan — taking the redesign live") was added after the 5th-pass audit and contains the file-by-file migration playbook for taking `/redesign/*` live on web AND porting the same shell to SwiftUI. The plan introduces 4 net-new items not previously captured:

#### T357 — Web profile redesign cutover (delete legacy + move `/redesign/*` → `/profile/*`) — **HIGH** (cutover, blocks T358)
**Source:** System map §22.1-§22.4 + §22.10 PR #1. Cutover is a 7-step physical-rename PR (no symlink, no feature flag): (1) delete legacy `web/src/app/profile/page.tsx` (1,876 lines) + `web/src/app/profile/settings/page.tsx` (5,300 lines) + 12 redirect-shim subpages; (2) move 45 redesign files to canonical paths under `web/src/app/profile/`; (3) drop dev-only artifacts (`_lib/demoUser.ts`, `isPreviewHost()` calls, `preview` prop plumbing across all sections, `redesign/preview/page.tsx`, `redesign/u/`); (4) drop dev-port middleware logic in `web/src/middleware.js` (`_isRedesignPort`, `_isRedesignProfilePath`, `/redesign/*` rewrite block, `localhost:3333` ALLOWED_ORIGINS entry); (5) drop `dev:3333` from `package.json`; (6) co-ship T330 (`/u/[username]/page.tsx:190` `'hidden'` check); (7) keep `PUBLIC_PROFILE_ENABLED=false` flag — separate decision.
**Why bundled:** The redesign is a parallel track at `:3333`. Until cutover ships, every redesign change has to be re-applied (or re-tested) against legacy. Maintenance cost compounds.
**No DB migration. No new API routes. No new dependencies.** Scope is purely file-system + routing.
**Estimated:** ~7,200 line deletions + ~45 file moves + ~15 min import-fixup pass. Single PR, T4 review (cross-surface).
**Fix:** Execute the 7 steps. Bundle T330 + T331 + T332 + T333 + T335 inline since they all touch the moved files.

#### T358 — iOS adult profile redesign port — **HIGH** (cross-surface, blocked by T357 + T360)
**Source:** System map §22.5-§22.9 + §22.10 PR #5. Rebuild iOS profile-area visual + IA layer (`ProfileView.swift` + `SettingsView.swift` + 18 supporting Swift files, ~8-9k LoC) to mirror the redesign's master/detail shell + 22-section model. Strategy: keep data layer (`PermissionService`, `AuthViewModel`, `StoreManager`, supabase client, REST hits) **unchanged**; rebuild visual + IA only.
**Scope:**
- New `ProfileShell.swift` — `NavigationSplitView` on iPad + custom drawer-sidebar on iPhone, with grouped section list (Library / Family & Expert / Settings / Account).
- New `Palette.swift` porting `_lib/palette.ts` tokens — `Color.vpInk` / `vpInkSoft` / `vpInkMuted` / `vpAccent` / `vpDanger` etc., plus `VPSpace` and `VPRadius` enums. Type rules: serif system font for hero (`.font(.system(.largeTitle, design: .serif).weight(.semibold))`), system sans for body.
- New `AccountStateBanner.swift` — port the 14-state tagged union from `_components/AccountStateBanner.tsx`. Hard-block states (banned/locked/deletion-scheduled) replace the entire shell; soft states render above it.
- New `AvatarEditorView.swift` — `LazyVGrid` of 72 swatches + neutrals row + native `ColorPicker` for hex/wheel + multi-size live preview. Writes to `users.avatar` jsonb + `users.avatar_color` columns (same as web).
- 16 section views per the §22.6 mapping table (web file → iOS view): some are wrappers around existing Swift views (light effort: Identity / Sessions / Notifications / Plan / Bookmarks / Messages); some are new builds (heavy effort: Privacy lockdown / Blocked / Data export+delete / Categories / Milestones / Expert profile editor + apply-form).
**No TIER_C port** — tier renders as plain text in `vpInkMuted`. Same memory rule as web.
**Pre-flight: T359 (`profile_visibility='hidden'` audit) ships first.** T360 also a precondition (web Categories+Milestones must exist before iOS can mirror them).
**Estimated:** Multi-week build, ships only after web cutover (T357) stabilizes. T4 review at minimum (cross-surface, security-sensitive).

#### T360 — Build redesign `CategoriesSection` + `MilestonesSection` on web — **MEDIUM** (gap, blocks T358)
**Source:** System map §22.6 mapping table — both rows say "TBD on web — currently LinkOut". The redesign's profile shell currently uses `LinkOutSection.tsx` to point users at the legacy `/profile/category` and `/profile/milestones` pages instead of having inline section views. Cutover (T357) inherits this gap; iOS port (T358) cannot mirror sections that don't exist on web yet.
**Fix:**
- Build `CategoriesSection.tsx` mirroring the leaderboard pill-row pattern (parent pills + sub pills under active parent + scope card with stats from `category_scores`).
- Build `MilestonesSection.tsx` showing earned + still-ahead achievements with countdown ("76 days to go", "253 articles to go") per the `/redesign/preview` fixture.
- Replace the two `LinkOutSection` entries in `ProfileApp.tsx` with the new section components.
**Estimated:** Each section is ~300-400 LoC against existing data sources (`category_scores` and `user_achievements`). Single PR, T3 review.

#### T365 — Pro pride pill in CommentRow (Phase 2 of T316) — **MEDIUM** (retention/upsell)
**File:** `web/src/components/CommentThread.tsx` (query at line 117) + `web/src/components/CommentRow.tsx` (render around line 215).
**Why this is a Phase 2:** T316 shipped the Pro badge in the profile hero (`web/src/app/profile/page.tsx`) by joining `plans:plan_id(tier)` into the user fetch. Comments need the same plumbing: extend the `users!user_id(...)` join in the comment fetch to include `plans:plan_id(tier)`, extend `CommentUser` type to carry the joined tier, render the existing neutral "Pro" badge next to username + VerifiedBadge in CommentRow.
**Recommendation:** Single PR; T2-T3.

#### T363 — Public profile redesign placeholder needs full rebuild — **HIGH** (cutover-blocking)
**File:** `web/src/app/redesign/u/[username]/page.tsx` is a static placeholder ("Public profile is being rebuilt"). The legacy `/u/[username]/page.tsx` is kill-switched (`PUBLIC_PROFILE_ENABLED=false`); on `:3333` the redesign just shows a holding state.
**Per its own placeholder copy, the rebuild needs:** new hero, member-since, expert badge with organization, tier expression (plain text per the no-color-per-tier rule), paginated followers/following lists, real report sheet (matching the legacy `PROFILE_REPORT_REASONS` enum already in code at `lib/reportReasons`), and a working block-from-public action. The preview fixture at `redesign/preview/page.tsx` doesn't cover the public-profile shape — only the user-own-profile shape — so the design spec needs to be drawn before this can ship.
**Coupling:** Co-ships with the T357 cutover OR ships earlier as a `/redesign/u/[username]` build that the T357 cutover then renames to `/u/[username]`. Either way, T330 (just-shipped 'hidden' check) AND T331 + T359 (iOS parallel) must all be in place before `PUBLIC_PROFILE_ENABLED` flips.
**Estimated:** Multi-session build. T4 review (cross-surface, security-sensitive — leaks public PII if wrong).

#### T362 — `update_metadata` RPC with JSONB merge semantics — **MEDIUM** (T5)
**Source:** Half of the T307 spec — re-stamping `metadata.terms_accepted_at` after an email change requires merging into the existing JSONB column, not overwriting it. A plain `.update({ metadata: {...} })` clobbers other keys (`age_confirmed_at`, `terms_version`, etc.).
**Fix:** SECURITY DEFINER RPC `update_metadata(p_user_id uuid, p_keys jsonb)` that does `UPDATE users SET metadata = COALESCE(metadata, '{}'::jsonb) || p_keys WHERE id = p_user_id`. Then call from `email-change/route.js` after the email-flip succeeds. T5 — halt and queue migration.

#### T361 — Standardize `billing_period` strings to `'month'` / `'year'` — **MEDIUM** (T5 schema)
**Source:** Half of the locked T56 spec — the 'lifetime' drop shipped, the string-standardize half remains. Current state: `web/src/app/admin/plans/page.tsx:56` writes `'monthly'` / `'annual'`; DB-side reads (e.g., `web/src/app/profile/settings/page.tsx:4253` checks `billing_period === 'year'`) and Stripe glue (`web/src/lib/plans.js:58,78`) use `'month'` / `'year'`. Existing plan rows likely carry `'monthly'`/`'annual'` from the admin form; some carry `'month'`/`'year'` from direct seeding.
**Fix:** (1) Update admin BILLING_PERIODS to `['', 'month', 'year']`. (2) Migration to `UPDATE plans SET billing_period = CASE WHEN 'monthly' THEN 'month' WHEN 'annual' THEN 'year' ELSE billing_period END;` (idempotent). (3) Sweep all callers to read only the canonical strings. (4) Optional CHECK constraint on `plans.billing_period IN ('month','year')`. T5 — halt and queue migration.

#### T351 partial — Redesign §21.3 polish bundle (5 sub-items remain) — **LOW** (polish)
**Source:** System map §21.3, deliberately skipped in the main verification pass. **2 of 7 sub-items shipped** alongside Wave B (rail search placeholder `Search settings` → `Search profile`, LockedSection `{title} is part of premium` → `Upgrade to unlock {title}`). 5 remain — bundle as one cleanup PR after redesign cutover stabilizes:
- **Spacing literals** drift to S-tokens — `gap: 1` / `padding: '0 4px'` / `padding: '0 6px'` scattered across `AppShell.tsx`, `MessagesSection.tsx`, `PasswordCard.tsx`, `preview/page.tsx`. Snap every literal to `S[N]`.
- **Tier badge has 3 visual treatments** (rail identity card / stat tile / public-profile preview). One canonical pill component.
- **PasswordCard rule checklist** uses green dot on pass + inert gray on fail. Add red dot when typed-but-unmet for bidirectional signal.
- **PrivacyCard followers list no Retry on load failure.** Currently shows toast; add retry button in empty/error state.
- **PrivacyCard Hidden-confirm copy** doesn't say count of followers being removed. Inject `{count}` into the confirmation.
- **Expert queue back-channel empty state** misleads non-expert admins — when `isAdminScope && categories.length === 0`, copy says "Apply for expert verification" (wrong CTA for someone with admin perms). Branch the copy.
- **Microcopy still pending:** "Data & danger" → "Your data" (rail title) — section title rather than placeholder; PublicProfileSection "Add a bio below" → use placeholder text inside textarea.

---

## NOTES

- **No web push.** Web has no ambient notification channel. iOS APNs is wired. Web push (service worker + VAPID) explicitly deferred. Worth scheduling before the first major growth push.
- **Email direction = transactional-only.** T9, T10, T27, T67 all flow from this. Bundle into one PR for consistent public-facing story.
- **Trust-product positioning.** Several MEDIUM items (T34, T35, T54) ask whether engagement mechanics (downvotes, rank changes, volume framing) align with the editorial-quality positioning. Owner-decision territory before writing code.
- **Architecture cost: leaderboards/streaks/achievements.** `score_events`, `user_achievements`, `advance_streak` (verified at `web/src/lib/scoring.js:43,114`) are real. If trust-principle review concludes these mechanics shouldn't ship, the cleanup is non-trivial — multiple writers + a ledger + admin surfaces.
- **Six-agent ship pattern still applies** (4 pre-impl + 2 post-impl) for any non-trivial item below.

_Generated 2026-04-26 by consolidating prior audit + review docs (now retired) plus 13 specialist sweeps. Items verified against current code at write time — re-verify before acting on anything more than two weeks old._
