# TODO

> **🟢 CLAUDE: IF THE OWNER OPENS A SESSION AND SAYS "REVIEW THE TODO FILE" / "START THE RUNBOOK" / "GO" — START EXECUTING THE AUTONOMOUS EXECUTION RUNBOOK BELOW IMMEDIATELY.**
>
> **The owner is away. Work every non-skipped item to completion, one at a time, in priority + cluster order. When ANYTHING surfaces that needs owner input — a decision, a permission, an ambiguity, a BLOCK, a schema change, a hallucination concern — write the literal question into "QUEUED FOR OWNER REVIEW" with options listed and your recommended pick, then immediately move to the next item. THE LOOP NEVER STOPS ON OWNER INPUT — the queue absorbs every blocker. Only halt when all remaining items are on the SKIP list. CHANGELOG every fix as you go (`_pending push to git_`). Do not push to git autonomously. Do not touch anything on the SKIP list. Read the runbook fully before starting.**
>
> **Owner-locked direction (do not re-litigate):** magic-link auth only · no password · no social · no MFA · no passkey v1 · 90-day sliding session · 8-article home cap removed · email transactional-only · kids = iOS only · admin = no keyboard shortcuts · AdSense + Apple are eventual gates, not active yet · beta is on hold.

Single source of truth for outstanding work on Verity Post. Consolidated from prior audit + review docs (now retired) plus 13 specialist sweeps. Every item below has been verified against current code on 2026-04-26 — items that turned out to be already-fixed, opinion-only, or false were dropped.

Numbering is sequential across the file (T1, T2, …). Priority tag per item: **CRITICAL** / **HIGH** / **MEDIUM** / **LOW** / **DEBT** / **DEFERRED** / **CLOSED** / **RE-SCOPED** / **MOVED**.

Companion files in `Ongoing Projects/`: `CHANGELOG.md` (work history), `SYSTEM_NOTES.md` (architecture reference), `Pre-Launch Assessment.md` (Sentry + Apple submission gates).

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

**TODO.md items requiring owner decision/action:**
- **T2** — Cookie consent banner: CMP choice (Funding Choices vs Cookiebot/Osano vs hand-rolled). Funding Choices needs AdSense console access. AdSense gate not active per memory; queued at start of autonomous run.
- **T16, T17, T26, T173** — MCP `pg_proc` queries (require DB-read permission grant)
- **T19** — Home feed prefs: wire vs. delete decision (owner direction)
- **T20** — iOS expert application schema match (depends on editor process tolerance — owner)
- **T34, T35, T54** — trust-positioning calls (downvotes, rank notifications, kids volume framing)
- **T40** — Story timeline desktop aside ship/hide
- **T55** — Prompt-preset versioning (depends on whether admins edit in production — owner)
- **T56** — Lifetime billing dropdown drop/keep (pricing call)
- **T57** — Stripe `stripe_price_id` automation: option (a) vs (b)
- **T77** — Record MASTER-6 SHIPPED marker (owner-administrative)
- **T85** — Profile Task 5 perm-key migration apply order (owner runs migration)
- **T117** — Error-state retry inconsistency: re-scope/audit decision
- **T268** — DMCA designated agent registration at copyright.gov
- **T271** — Choice-of-law jurisdiction (Delaware vs California)
- **T272** — Accessibility statement language sign-off
- **T291** — Verity-tier-includes-expert pricing call

**Bundle-level skip:**
- **AUTH-MIGRATION** — direction is locked, but the build is one coordinated session under direct owner supervision. Do not execute its sub-items piecemeal autonomously.
- **Everything in `Pre-Launch Assessment.md`** — Apple / Sentry / COPPA-CRITICAL items have their own owner touch points (S1 DSN check, A8 console walkthrough, K12 VPC method choice, etc.).

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

### T2 — Cookie consent banner missing — AdSense approval blocker — **CRITICAL**
**File:** `web/src/app/layout.js` (verified — only mention of consent is a TODO comment at line 166 about a "consent-gated loader once the CMP is installed"; no `CookieBanner`/`ConsentBanner` component exists anywhere in `web/src/`).
**Problem:** GA4 + AdSense load unconditionally. AdSense approval is at risk; EU traffic is legally exposed.
**Fix:** Add a bottom-of-screen consent bar. Gate `ga4-loader`, `ga4-init`, `GAListener`, and the AdSense script on accepted consent. Reject keeps scripts off. Persist decision in localStorage or a cookie.
**Recommendation:** Use a **TCF v2.2-compliant CMP** (Funding Choices is free and Google-supported, or Cookiebot/Osano). Hand-rolling is a maintenance burden once you ship to multiple jurisdictions. Critical that scripts are gated *before* consent — disclosure copy alone fails GDPR and AdSense audits.

### T9 — Admin still ships 5-email onboarding sequence under transactional-only email policy — **MEDIUM** (re-graded — pre-launch hygiene, not gate)
**File:** `web/src/app/admin/notifications/page.tsx:46-59` (verified — `EMAIL_SEQUENCES` has Onboarding (Day 0/1/3/5/7) + Re-engagement (Day 30/37) marked `status: 'active'`).
**Problem:** Email policy is transactional-only (verification, password, security, compliance). Admin UI advertises lifecycle email programs that can't and shouldn't ship.
**Fix:** Remove `EMAIL_SEQUENCES` constant + the UI that renders it. Also remove `users.metadata.notification_prefs` writes for newsletter/comment-reply (web settings card). Privacy policy (`web/src/app/privacy/page.tsx:65-79`) and Help (`web/src/app/help/page.tsx`) need matching copy edits.
**Recommendation:** **One pass** — admin UI + settings card + public copy + iOS alert settings (T29) all need the same direction. Bundle as one PR so the public-facing story is consistent on the same day.

### T10 — Admin still advertises Day 30/37 re-engagement email — **MEDIUM** (re-graded — pre-launch hygiene, not gate)
**File:** Same as T9. `database.ts:8777-8778` has `win_back_eligible_at` / `win_back_sent_at` columns; cron has no re-engagement type.
**Fix:** Bundle with T9. Remove the controls; if win-back outreach is still wanted, treat as push/in-app, not email.

---

## HIGH — close before launch quality bar

### T11 — Web has zero post-article exit path; iOS has Up Next that auto-fires — **HIGH** (engagement)
**File:** `web/src/app/story/[slug]/page.tsx` (no related-articles section); `VerityPost/VerityPost/StoryDetailView.swift:1733-1743` (auto-pop at 95% scroll), `:2320-2325` (post-comment auto-pop).
**Problem:** Web reader finishes article → home feed they already saw. iOS has Up Next data + sheet, but it pops automatically (twice).
**Fix:**
- Web: add a static "More in [Category]" strip after discussion / paywall, 1-3 same-category articles, editorially curated (not algorithmic).
- iOS: remove both auto-triggers. Surface Up Next as a static card at article end or a button in the nav bar.
**Recommendation:** **Editorial, not algorithmic** — matches the trust-product positioning. Same component on both surfaces. No personalization until home-feed personalization is fixed (T19).

### T12 — iOS comment threading missing — **HIGH**
**File:** `VerityPost/VerityPost/StoryDetailView.swift:2371` (TODO comment: "parent_id is omitted here — iOS UI doesn't expose threaded reply yet"); `parent_id` IS fetched at lines 1921, 2077.
**Fix:** Surface a Reply button per comment. Indent replies (left border). Pass `parent_id` on submit.
**Recommendation:** Web has it; data is already there. One-session task. **DB plumbing already done.**

### T14 — Streak break on adult profile shows "0d" with no recovery offer — **HIGH** (DB-WORK-PARTIAL)
**Note 2026-04-26:** Full fix needs a `use_streak_freeze` RPC + endpoint (T5 schema work, halt-and-queue per runbook). Only `use_kid_streak_freeze` exists. Half the value (the "Streak reset — start a new one today" branch) can ship as a UI-only copy edit; the freeze-restore branch is queued.
**File:** `web/src/app/profile/page.tsx:700-701`, `VerityPost/VerityPost/ProfileView.swift:495`
**Plumbing exists** (`streak_freeze_remaining` decoded in iOS Models.swift; admin `streak_freeze` flag on; kid profile shows freeze counter).
**Fix:** When `streak_current === 0 && streak_best > 0 && streak_freeze_remaining > 0` → "Your streak ended. Use a freeze to restore it? ([N] remaining)" with one button. Otherwise: "Streak reset — start a new one today."
**Recommendation:** Mirror the kid surface presentation — already designed and shipping there.

### T16 — DM enforcement gap: `allow_messages` flag may not be honored at recipient — **CRITICAL** *pending MCP verify* (privacy)
**File:** `web/src/app/api/conversations/route.js:8-17,56-85`, `web/src/app/api/messages/route.js:10-16,32-56` (only sender-side `messages.dm.compose` enforced); `MessagesView.swift:592-615`.
**Verify first:** Query `pg_proc` for `start_conversation` / `post_message` via MCP — check whether they read `users.allow_messages` for the recipient. If yes, finding collapses to "hide DM CTA when target opts out" (UI fix). If no, this is a real privacy hole.
**Fix:** Enforce recipient opt-out in the RPC bodies; hide DM entry points when `target.allow_messages === false`.
**Recommendation:** **Privacy enforcement at the data layer, not the UI.** Even if web/iOS hide the CTA, third-party clients with our public API key would bypass — RLS or RPC body must own this.

### T17 — Blocked-user DM protection appears UI-only — **CRITICAL** *pending MCP verify* (safety)
**File:** `web/src/app/messages/page.tsx:232-264,1177-1183` (web filters via `blockedUserIds` for menu label only), `MessagesView.swift:494-499` (iOS filters locally because server returns blocked convos).
**Fix:** Enforce blocks in `start_conversation` / `post_message` RPCs (or RLS). Apply server-side filter to conversation list reads on both platforms.
**Recommendation:** Same principle as T16. **Safety logic at the boundary.** Pair with T16 — same RPC bodies, same review pass.

### T18 — iOS email change bypasses hardened server flow — **HIGH** (re-scoped: under magic-link, "change email" sends a confirm-link to the new address; no password to verify)
**File:** `VerityPost/VerityPost/SettingsView.swift:1391-1452` (calls `client.auth.update(user: UserAttributes(email:))` directly).
**Problem:** Skips `/api/auth/email-change` rate limit, audit, and the `users.email_verified = false` flip. iOS profile gating reads `email_verified` — user can change email and stay treated as verified.
**Fix:** Route iOS email changes through `/api/auth/email-change`, then reload the user record on success.
**Recommendation:** Same pattern as T5 (route through hardened server endpoint). **One canonical server-owned path** for any auth-state mutation.

### T19 — Home feed preferences are decorative on both web and iOS — **HIGH** (truth-in-UI)
**File:** `web/src/app/profile/settings/page.tsx:2682-2778,2783-2878` + iOS `SettingsView.swift:2044-2142`; readers `web/src/app/page.tsx:12-19,176-257` and `HomeView.swift:7-12,118-190` never consume them.
**Problem:** Settings save `users.metadata.feed` flags (preferred categories, `showBreaking`, `showTrending`, `showRecommended`, `minScore`, display mode). Home reads zero of them. Save success message is a lie.
**Fix:** Either (a) keep the editorial hero, but bias supporting slots based on category preferences + `minScore` / `kidSafe` filters, or (b) **remove the settings cards** if the product is intentionally editorial-only.
**Recommendation:** **Decision required from owner.** Don't promise personalization you don't deliver. If editorial-only is the answer, ship the deletion this week. If personalization is on roadmap, keep + relabel as "Coming soon" with the cards disabled.

### T20 — iOS verification application underspecified vs web — **HIGH** (silent failure)
**File:** `VerityPost/VerityPost/SettingsView.swift:1013-1021,2148-2324` (sends `application_type`, `full_name`, `organization`, `title`, `bio`, `social_links`, `portfolio_urls`); web sends those + `expertise_areas`, `credentials`, `category_ids`, 3 `sample_responses`.
**Problem:** iOS creates incomplete applications editors can't review properly, OR the RPC rejects and iOS only logs the non-200 with no user signal.
**Fix:** Match the web contract. Also surface failure inline — keep the form open with an error banner, don't dismiss silently.
**Recommendation:** Single `expert_application_payload` schema in `web/src/types/database.ts` should be the source of truth — both surfaces validate against it.

### T22 — iOS social signup (Apple/Google) skips pick-username step — **RE-SCOPED** (no social; pick-username step still required for first-time magic-link signup)
**File:** `VerityPost/VerityPost/AuthViewModel.swift:587-599,616-667` (calls `loadUser()` and routes by `needsOnboarding`); web `api/auth/callback/route.js:153-160,195-199` forces `/signup/pick-username` when `!existing.username`.
**Problem:** First-time SIWA / Google account on iOS lands with `username == nil`. Later surfaces (share/public-card, leaderboard, profile/messaging displays) assume a handle.
**Fix:** Add a pick-username gate that runs after social OAuth, before `ContentView` lets the session through. Email signup is already correct.
**Recommendation:** Reuse the web pick-username flow's logic — same uniqueness check, same `/api/auth/check-username` endpoint.

### T23 — iOS sign-in skips server lockout/audit/daily-login bookkeeping — **HIGH** (security telemetry)
**File:** `VerityPost/VerityPost/AuthViewModel.swift:162-188,562-667` (calls `client.auth.signIn(...)` directly + best-effort `last_login_at`); web `login/page.tsx:156-239` runs `/api/auth/login-precheck` → reports failures via `/api/auth/login-failed` → POSTs `/api/auth/login` for the bookkeeping pass.
**Fix:** Mirror the web auth contract on iOS: resolve usernames, honor lockout precheck, report failures, call the server bookkeeping path on success.
**Recommendation:** **Single auth contract across surfaces.** Without server bookkeeping, lockout is iOS-bypassable, audit log is incomplete, and `daily_login` streak/score events are inconsistent.

### T25 — No topic/category alerts (publish-time fan-out) — **HIGH** (return-visit driver)
**File:** `alert_preferences` table exists, `breaking_news` is a global blast; `AlertsView.swift:300` has `manageSubscriptionsEnabled = false` (UI built but flagged off). No `subscription_topics` table; no API route.
**Fix:** Add `subscription_topics(user_id, category_id, created_at)` table. Add `/api/alerts/subscriptions` GET/POST. Flip the iOS flag to true. Wire publish-time trigger that fans out to subscribers.
**Recommendation:** **Topic alerts are the second-strongest return-visit lever** (after reply notifications T26). Same publish-time pipeline as breaking-news, just filtered by category subscription.

### T26 — Comment reply notifications wired up but RPC body unverified — **CRITICAL** *pending MCP verify* (single biggest return-visit gap)
**File:** Email template + preference UI + push cron all exist for `comment_reply`; `web/src/app/api/comments/route.js` shows no app-layer `create_notification` call. Need to verify whether `post_comment` RPC inserts into `notifications` server-side.
**Verify first:** Query `pg_proc` for `post_comment` body via MCP. If it inserts the notification row, this finding closes. If not, add the insert via migration.
**Recommendation:** **Reply notifications are the single biggest "why come back" gap** noted in the external review. Confirm before assuming gap.

### T27 — Iframe of inert email/alert settings on iOS + web — **HIGH** (paired with T9/T10)
**File:** iOS `SettingsView.swift:1887-2040` writes `users.metadata.notifications` (different keys from web); web `profile/settings/page.tsx:2112-2167` writes `users.metadata.notification_prefs`; backend reads `alert_preferences`. Repo-wide search shows no consumer for `metadata.notifications` or `metadata.notification_prefs` outside settings pages.
**Fix:** Make iOS use the same storage/backend as web. Remove email-digest/lifecycle controls. If anything from `metadata.notifications` is worth migrating, do a one-time read-fallback.
**Recommendation:** Bundle with **T9/T10** (transactional-only email cleanup). Same direction, same PR.

### T28 — iOS exposes Back-channel queue tab that's a placeholder — **HIGH** (parity)
**File:** `VerityPost/VerityPost/ExpertQueueView.swift:20-24,79-112,188-199` (tab listed, body shows "Coming soon"); web `expert-queue/page.tsx:153-231` has the real flow.
**Fix:** Hide the iOS Back-channel tab until parity exists, OR implement load/post against the same API web uses.
**Recommendation:** **Hide first** (one-line conditional). Build parity in a dedicated session.

### T29 — Empty alerts inbox tells iOS users to use disabled Manage tab — **HIGH** (dead-end CTA)
**File:** `VerityPost/VerityPost/AlertsView.swift:223-234,291-321` ("Subscribe to categories in Manage to get alerts" copy + `manageSubscriptionsEnabled = false`).
**Fix:** Update empty-state copy until Manage actually works (paired with **T25**), or just remove the instruction.
**Recommendation:** Lands with T25 — same flip.

---

## MEDIUM — quality and parity

### T30 — Quiz ad interstitial hijacks score reveal — **MEDIUM**
**File:** `web/src/components/ArticleQuiz.tsx:163-165`
**Fix:** Show quiz result, render score, then fire interstitial after 1.5-2s delay or on user dismissal.
**Recommendation:** Latency-shift only, two-line change.

### T31 — Empty comment state copy doesn't reinforce quiz-gate trust — **MEDIUM**
**File:** `web/src/components/CommentThread.tsx:856-865`, `VerityPost/VerityPost/StoryDetailView.swift:1133-1140`
**Fix:** "No comments yet. Everyone who posts here passed the quiz — including you. Start the conversation."

### T32 — Web comment-report uses free text, iOS uses structured categories — **MEDIUM**
**File:** `CommentThread.tsx` (free text) vs `StoryDetailView.swift:316-335` (`ReportReason.allCases`).
**Fix:** Replace web free-text field with category picker matching iOS `ReportReason` enum.
**Recommendation:** **Structured categories produce actionable moderation signals.** Match the iOS shape — also makes admin moderation tooling easier.

### T34 — Downvotes are decorative — **MEDIUM**
**File:** Both surfaces sort by `upvote_count DESC, created_at ASC` (`CommentThread.tsx:104-106`, `StoryDetailView.swift:1850-1851`); `downvote_count` ignored.
**Fix:** Add `downvote_count` as demoting signal: `upvote_count - (downvote_count * 0.5) DESC`.
**Recommendation:** **Wilson score** is more robust than naive subtraction — but for low-volume threads, the simple formula is fine. Worth revisiting once threads get busy.

### T35 — No rank-change notifications — **MEDIUM**
**File:** `web/src/app/leaderboard/page.tsx` has data; no cron diffs ranks.
**Fix:** Weekly cron diffs each user's rank vs 7 days ago. In-app notification (not push) for moves of 3+ spots, top-10 entry/exit. Cap at 1/week.
**Recommendation:** **Don't push** — rank changes are check-in-worthy, not ping-worthy. In-app surface only.

### T36 — Profile opens on metric dashboard for new users — **MEDIUM**
**File:** `web/src/app/profile/page.tsx:623-701`, `VerityPost/VerityPost/ProfileView.swift:557-576,727-728`
**Fix:** When all activity metrics are zero, show one onboarding card: "Read an article and pass the quiz to start building your score." Link to home/browse.

### T37 — iOS browse is a subset of web browse — **MEDIUM**
**File:** `VerityPost/VerityPost/HomeView.swift:577-657` (plain category list); web shows counts + top-3 trending + filter + Latest strip.
**Fix:** Add article count + 1-2 article previews per category row on iOS.

### T38 — iOS search has no advanced filters — **MEDIUM**
**File:** `VerityPost/VerityPost/FindView.swift:8` (MVP deferral comment).
**Fix:** Add category filter + date range picker for paid tiers, gated on the same web permission keys.

### T39 — Onboarding "Get started" routes to home, not to a featured article — **MEDIUM**
**File:** `web/src/app/welcome/page.tsx:228`
**Fix:** Route to first article shown in carousel screen 3, fallback to `/browse`.

### T40 — Web story timeline desktop aside is `false &&` killed — **MEDIUM** (decision needed)
**File:** `web/src/app/story/[slug]/page.tsx:1776`
**Fix:** Decide whether desktop aside ships at launch. If yes, drop the `false &&`. If no, document as deliberate launch-phase hide.

### T41 — iOS notification taps ignore non-story `action_url` — **MEDIUM**
**File:** `VerityPost/VerityPost/AlertsView.swift:247-252,790-795` (only routes `/story/<slug>`). Backend emits `/profile/settings/billing`, `/signup`, signed download URLs — iOS taps mark-as-read but don't navigate.
**Fix:** Route generic internal `action_url`s on iOS, or suppress tap affordance for unsupported actions.

### T42 — iOS data export uses old direct-insert path + forgets pending requests — **MEDIUM**
**File:** `VerityPost/VerityPost/SettingsView.swift:2446-2482,2538-2546` (direct `data_requests.insert()`); web routes through `/api/account/data-export` for permission/rate-limit/audit/dedupe.
**Fix:** Route iOS through `/api/account/data-export`. Load existing rows so pending state survives relaunch.

### T43 — iOS can't see/cancel pending deletion while signed in — **MEDIUM**
**File:** `VerityPost/VerityPost/SettingsView.swift:2446-2565`; `AuthViewModel.swift:181-185,521-530,690-705`; `Models.swift:5-46`.
**Fix:** Add `deletion_scheduled_for` to iOS user model. Surface countdown in Settings. Add cancel action via `/api/account/delete`.

### T44 — Multiple iOS settings pages fail silently on save — **MEDIUM**
**File:** `VerityPost/VerityPost/SettingsView.swift:1958-2040,2090-2142,2393-2436` (Alerts, Feed, Expert all `Log.d` errors with no UI signal).
**Fix:** Add success/error banners matching the profile editor pattern.

### T45 — iOS settings pages render fallbacks as "loaded" on fetch failure — **MEDIUM**
**File:** `VerityPost/VerityPost/SettingsView.swift:1592-1601,1996-2014,2103-2116,2406-2416,2513-2522` (`try?` swallow → render defaults).
**Fix:** Distinct load-error state with retry. Disable save until successful initial fetch.

### T46 — iOS "Sign-in activity" isn't real session management — **MEDIUM**
**File:** `VerityPost/VerityPost/SettingsView.swift:1519-1598` (renders audit rows from `get_own_login_activity`); web reads `user_sessions` with revoke action.
**Fix:** Back the iOS screen with `user_sessions`. Show active vs ended. Add "Sign out other sessions."

### T48 — iOS auth deep-link failures are silent — **MEDIUM**
**File:** `VerityPost/VerityPost/VerityPostApp.swift:15-17`; `AuthViewModel.swift:377-409`; `ContentView.swift:99-105`.
**Fix:** Surface invalid/expired link state with recovery CTA (resend verification / new reset link).

### T49 — iOS Username field is editable, web says it's immutable — **MEDIUM** (contract mismatch)
**File:** `VerityPost/VerityPost/SettingsView.swift:1283-1287,1320-1375` (editable); `web/src/app/profile/settings/page.tsx:1716-1720` ("Usernames cannot be changed.").
**Fix:** Decide the contract. If immutable, disable iOS field. If changeable, document and message it consistently.

### T50 — iOS DM creation/send failures largely silent — **MEDIUM**
**File:** `VerityPost/VerityPost/MessagesView.swift:600-658,1041-1107`
**Fix:** Keep compose/search surface open on failure. Show error state mapping common HTTP failures to actionable copy.

### T51 — Family/kids surfaces collapse fetch failure into empty state — **MEDIUM**
**File:** `web/src/app/profile/kids/page.tsx:99-150,410-425`; `web/src/app/profile/family/page.tsx:56-105,149-257`; `VerityPost/VerityPost/FamilyViews.swift:423-442,537-565,571-709`.
**Fix:** Separate load failure from true empty state. Show retry/error before showing creation/destructive actions.

### T52 — Trust header missing on iOS comments — **MEDIUM**
**File:** `VerityPost/VerityPost/StoryDetailView.swift:1093-1151`. Web has "Every reader here passed the quiz." (`CommentThread.tsx`); iOS jumps straight to composer.
**Fix:** Add the trust header on iOS, conditional on `visible.length > 0`.
**Recommendation:** Core-value-prop surface — iOS shouldn't be missing it.

### T53 — Web missing related-reads at end of articles (parity with iOS Up Next) — **MEDIUM**
**Fix:** See T11 above (combined item).

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

### T58 — iOS Find rows missing category + date — **MEDIUM**
**File:** `VerityPost/VerityPost/FindView.swift` — search-result rows. Web search rows show category + date; iOS Find doesn't.
**Fix:** Add category name + relative date to each `FindView` story row.

### T59 — No back-navigation from admin sub-pages on mobile — **MEDIUM**
**File:** Admin layout is auth-gate-only at `web/src/app/admin/layout.tsx`; no persistent nav primitive at `web/src/components/admin/Page`.
**Fix:** Add a back button to admin `Page` primitive when not on the admin hub. Links to `/admin` or browser back.

### T60 — iOS Expert settings save to nowhere — **MEDIUM** (likely dead UI)
**File:** `VerityPost/VerityPost/SettingsView.swift:2330-2436` writes `users.metadata.expert`. Web expert queue / back-channel only consult permissions/categories — no consumer for `metadata.expert` outside this settings page.
**Fix:** Wire queue routing / expert notifications to `metadata.expert`, OR remove the screen.
**Recommendation:** Verify any backend RPC reads it before deleting. If not, **delete** — fake-functional settings are worse than missing settings.

### T61 — Web expert vacation mode likely doesn't pause queue — **MEDIUM** (likely dead UI)
**File:** `web/src/app/profile/settings/page.tsx:4882-4911` saves `users.metadata.expertVacation`. No consumer found in queue/routing/notifications.
**Fix:** Enforce in the expert routing path, or remove the promise that questions are paused.

### T62 — Web expert watchlist saves but doesn't filter notifications — **MEDIUM** (likely dead UI)
**File:** `web/src/app/profile/settings/page.tsx:4940-5021` saves `users.metadata.expertWatchlist`. Live expert queue/back-channel work off permissions, not the watchlist.
**Fix:** Use `expertWatchlist` when choosing expert notifications/queue surfacing, OR relabel as "Coming soon" and disable writes.

### T63 — Web accessibility preferences save but reader doesn't honor them — **MEDIUM** (verified: save works correctly at `settings/page.tsx:3237-3243`; the gap is `TTSButton.tsx:22-62` never auto-starts from `metadata.a11y.ttsDefault` — TTS only fires on user click. Other a11y flags `textSize`/`reduceMotion`/`highContrast` also unread by reader. Fix scope: wire ttsDefault auto-start, decide on the rest.)
**File:** `web/src/app/profile/settings/page.tsx:3167-3245,3251-3289` saves `users.metadata.a11y` (`ttsDefault`, `textSize`, `reduceMotion`, `highContrast`). `story/[slug]/page.tsx:535-541` reads only `article.listen_tts` perm; `TTSButton.tsx:22-99` never auto-starts from `ttsDefault`.
**Fix:** Wire prefs into article rendering + TTS startup, OR remove. If motion should follow OS, relabel.

---

## LOW — opportunistic

### T66 — iOS bookmarks empty-state CTA is a dead button — **LOW**
**File:** `VerityPost/VerityPost/BookmarksView.swift:212-228` (verified — button action is just `// Would navigate back to home; tab bar handles the actual swap.`).
**Fix:** Wire the button to switch tabs to Home/Find, OR replace with static guidance.

---

## OPERATIONAL DEBT

### T69 — Legacy `/api/ai/generate/route.js:124` writes raw OpenAI output to `body_html` — **DEBT** (XSS-shape)
**Fix:** Either (a) delete the route — F7 pipeline at `/api/admin/pipeline/generate` supersedes; or (b) port it to use `renderBodyHtml()` from `web/src/lib/pipeline/render-body.ts`.
**Recommendation:** **Delete.** Grep callers first. If zero, drop the file.

### T70 — `currentschema` artifact untracked at repo root — **DEBT**
**Fix:** Either commit it as a reference snapshot, or add to `.gitignore`. Today it's noise in `git status`.
**Recommendation:** **Commit** + add `npm run schema:dump` script that re-generates it. Schema as code → easier code review of structural changes.

### T71 — CHANGELOG references nonexistent paths — **DEBT**
**Files:** Top entry "IA shift bundle" cites `Ongoing Projects/migrations/2026-04-26_profile_categories_canonical_binding.sql` (dir doesn't exist) and `Ongoing Projects/Sessions-Pending/BrowseView_iOS_Session_Prep.md` (empty dir).
**Fix:** Either restore the missing files from git (likely deleted in the recent restructure sweep) or update the CHANGELOG entry to reflect actual state.
**Recommendation:** Apply the migration directly via MCP (current pattern per memory) and update CHANGELOG to drop the file reference. The Browse session-prep doc is moot — the iOS Browse swap didn't ship to ContentView (still on `case .mostInformed`).

### T72 — iOS Browse-tab commit/code drift — **DEBT** (investigate)
**Files:** Commits `79fd8ae` + `0826728` claim Browse swap; `ContentView.swift:182,194` still has `case .mostInformed`. No `BrowseView.swift`.
**Fix:** Read full `ContentView.swift` + `git log -p ContentView.swift` to determine whether the swap landed under a different name, was reverted, or was never applied.

### T73 — Wave 1 → Wave 2 permissions migration both paths still live — **DEBT** (architectural)
**File:** `web/src/lib/permissions.js` — legacy `get_my_capabilities(section)` + new `compute_effective_perms()` both used.
**Risk:** Callers on different paths can drift within the 60s poll window on perm-state changes.
**Fix:** Inventory remaining `getCapabilities` / `useCapabilities` call sites. Plan a Wave 1 retirement window OR document why both stay.
**Recommendation:** **Retire Wave 1.** Section-scoped caching is an obsolete optimization once the full resolver lands. One sweep, then delete `get_my_capabilities` RPC.

### T74 — `web/src/lib/counters.js` and `mentions.js` likely dead — **RE-SCOPED** (verification: `counters.js` IS used — `web/src/app/api/stories/read/route.js` imports `incrementField` from `@/lib/counters`. NOT dead. `mentions.js` still appears unused — verify and delete just that one.)
**Fix:** Grep for imports. If zero, delete.

### T75 — `web/src/lib/password.js` is legacy PBKDF2 hashing — **DEBT**
**Fix:** Grep for imports. If zero, delete. If non-zero, the call sites are also legacy and should migrate to Supabase Auth.

### T77 — `MASTER-6` (password verification) needs SHIPPED marker — **DEBT** (owner action)
**Status:** `web/src/app/api/auth/verify-password/route.js` exists with `requireAuth`, 5/hour rate limit, ephemeral client, `record_failed_login_by_email`. Settings password card calls it. **No code change needed.**
**Action:** Owner records the commit SHA and marks MASTER-6 SHIPPED in pre-launch tracker.

---

## DEFERRED — bundles, blocked, awaiting design

### T79 — T-073 settings split + 7 anchor-redirect dependents — **DEFERRED**
**Scope:** `web/src/app/profile/settings/page.tsx` is a 5,299-line monolith. 11 sub-route stub directories already exist. Split must land in a single deploy with anchor-redirect rules so all `/profile/settings#anchor` cross-surface links keep working.
**Dependents (must land same deploy):** Story Task 6 (paywall anchor), Bookmarks Task 4 (cap banner anchor), Messages Task 8 (DM paywall anchor), Notifications Task 5 (alerts link), Profile Note A (profile anchors), Settings Task 6 (DM read receipts → `PrivacyPrefsCard`), Search Note A (line 230 billing anchor).
**Recommendation:** **Single-deploy window required.** Don't split partial.

### T81 — iOS TTS-per-article toggle — **DEFERRED**
**Scope:** Web saves `users.metadata.tts_per_article`; iOS has no row to toggle whether the listen button appears.
**Fix:** Add Article-audio toggle to iOS Preferences. Gate on `settings.a11y.tts_per_article` perm. Read/write `users.metadata.tts_per_article` via `update_own_profile`. Bundle with TTS player QA.

### T82 — Inline palette token consolidation (20+ files) — **DEFERRED** (verification: actual count is 15 files with inline `const C = {...}` palettes, not 20+. Scope still real, just smaller than claimed.)
**Scope:** `const C` and `PALETTE` redefined inline across the codebase. Single global pass; isolated changes drift.

### T84 — "Please try again" copy sweep (T-013) — **DEFERRED**
**Scope:** Settings is the largest cluster. Bundle with global T-013 sweep across remaining surfaces.

### T85 — Profile Task 5 perm-key migration — **DEFERRED** (owner action)
**Scope:** iOS short-form perm-key swap is in source (`ProfileView.swift:191-193`). DB binding migration was written but the file is missing from the repo (see T71). Until applied, free-user iOS Categories tab is broken.
**Apply order:** (1) re-create + run the migration via MCP `apply_migration`, (2) bump `users.perms_version` to invalidate live perms cache, (3) push the iOS build. Out of order = brief stale-perm window.

---

## FRICTION SWEEP 2026-04-26

40-item friction audit across web + iOS adult + iOS kids, verified against current code on 2026-04-26. Items eliminated as fantasy/already-fixed/stale-vs-T1-T86 dropped before this list. Fact-checked against agent claims; only verified file:line evidence retained.

### HIGH — engagement, retention, compliance

#### T88 — iOS onboarding stamp failure blocks app entry — **HIGH**
**File:** `VerityPost/VerityPost/WelcomeView.swift:67-73` (`stampError` shows "Couldn't finish onboarding. Please try again." with no bypass).
**Problem:** Backend hiccup on `/api/account/onboarding` POST = user is stuck on WelcomeView forever. Onboarding is a metric, not a gate, but the code treats it as a gate.
**Fix:** Allow "Continue anyway" after one failed retry. Stamp can be re-attempted next session via existing `onboarding_completed_at IS NULL` check.
**Recommendation:** Telemetry should never block app entry. Two-line change.

#### T89 — iOS unverified user gets entire profile gated — **HIGH**
**File:** `VerityPost/VerityPost/ProfileView.swift:143-149` (when `user.emailVerified == false`, hero/stats/streak grid hidden behind `verifyEmailGate`).
**Problem:** Reading still works; only the profile surface is gated. Inconsistent — web doesn't gate profile this hard.
**Fix:** Show profile with a non-blocking "verify your email to comment and save" banner. Keep hard gates only on actions that require verification (commenting, save).
**Recommendation:** Becomes moot post-AUTH-MIGRATION (every signed-in user is inherently verified under magic-link). Decide whether to ship now or wait.

#### T91 — No "what's new since last visit" indicator on home — **HIGH** (return-visit)
**File:** `web/src/app/page.tsx` (no last-visit tracking on cards).
**Problem:** Returning user has no signal which articles are new since their last session. Breaks the reason-to-return loop.
**Fix:** Persist `last_home_visit_at` per user. Tag article cards with a "New" marker when `published_at > last_home_visit_at`. Bump on home unmount.
**Recommendation:** Editorial framing — "X new since you last visited" header strip. Newspaper voice, not gamified streak voice.

#### T92 — No web push at all — **HIGH** (return-visit)
**File:** Repo grep: no VAPID keys, no service worker, no push subscription routes. Confirmed in TODO.md NOTES.
**Problem:** Web has zero ambient notification channel. iOS push ships breaking news + reply alerts; web users get nothing.
**Fix:** Wire web push (service worker + VAPID + `/api/push/subscribe`). Reuse the same `notification_deliveries` cron as APNs. Opt-in pre-prompt at value moments — never cold.
**Recommendation:** Standard PWA push stack. Dedicated session — not bundleable with T1.

### MEDIUM — quality and parity

#### T97 — Web signup email-availability check fails silently on network error — **MEDIUM**
**File:** `web/src/app/signup/page.tsx:77-100` (catch block sets status to `'idle'`).
**Problem:** Debounced availability check times out → state reverts to "idle" with no UX signal. User submits with potentially-duplicate email and only sees rejection at submit time.
**Fix:** On catch, set a dedicated `'check_failed'` state and render a small "Couldn't verify availability — we'll check on submit" hint.
**Recommendation:** Truth-in-UI. Consistent with T19 / T44.

#### T98 — Web verify-email resend has no "email sent" toast — **MEDIUM**
**File:** `web/src/app/verify-email/page.tsx:105-142` (cooldown countdown only, no success confirmation).
**Problem:** User taps Resend, sees the button enter cooldown, has no positive confirmation the email actually sent. Under magic-link auth this becomes the primary login mechanism — UX matters more.
**Fix:** Transient toast "Sent — check your inbox." on successful POST.
**Recommendation:** Bundle with T99 / T100 / T101 — same email-friction cluster. AUTH-MIGRATION should reshape the page; bundle changes.

#### T99 — Web verify-email page lacks recovery alternatives — **MEDIUM** (re-scoped: "Change email address" button DOES exist at `verify-email/page.tsx:545-561`; only the contact-support link is missing — drop the "try a different address" half of the fix)
**File:** `web/src/app/verify-email/page.tsx:512-560` ("Didn't get it" only mentions spam folder + resend; no support link, no "try a different address").
**Problem:** Wrong email address, deliverability issue, corporate firewall — user has no path forward.
**Fix:** Add "Contact support" link below the resend section; surface "Try a different email address" that re-opens the email field.
**Recommendation:** AUTH-MIGRATION bundle.

#### T100 — Web verify-email page has no mail-app deep-link — **MEDIUM**
**File:** `web/src/app/verify-email/page.tsx` (no `mailto:` or webmail open buttons).
**Problem:** User has to manually switch tabs / open Mail. Standard newsletter-grade UX shows "Open Gmail" / "Open Outlook" buttons.
**Fix:** Detect domain from masked email; render a single "Open <provider>" button when domain matches gmail/outlook/yahoo/icloud, falling back to instruction text.
**Recommendation:** AUTH-MIGRATION bundle. Removes one of the most consistent friction points in any email-auth flow.

#### T101 — Web logout page doesn't redirect — **MEDIUM**
**File:** `web/src/app/logout/page.js` (renders "You've been signed out" with manual links; no auto-redirect).
**Problem:** User clicks Logout, sits on the logout page wondering if anything happened.
**Fix:** After successful signout, redirect to `/` after 1.5s with "Signed out — redirecting…" message.
**Recommendation:** Two-line change with `router.push('/')` in a `setTimeout`.

#### T102 — iOS splash 10s timeout has no slow-network grace — **MEDIUM**
**File:** `VerityPost/VerityPost/AuthViewModel.swift:80` (hard 10-second timeout).
**Problem:** 3G or weak-signal sessions hit the failure screen even though a 12s wait would have succeeded.
**Fix:** Two-stage: at 5s show "Connecting...", at 15-20s show fallback. Total budget extended to 20s.
**Recommendation:** Match real-world cellular latency, not the typical wifi case.

#### T103 — iOS session-expired banner is generic — **MEDIUM**
**File:** `VerityPost/VerityPost/ContentView.swift:229` ("Your session expired. Please sign in again.").
**Problem:** Could be token-refresh fail, remote signout, account ban, password change. User can't tell whether to retry or contact support.
**Fix:** Pass cause through `auth.sessionExpiredReason`; banner branches on cause: "Signed out from another device" / "Session expired — please sign in" / "Account changes detected — please sign in again."
**Recommendation:** Three causes max. AuthViewModel already knows the cause; surface it.

#### T104 — iOS bottom-nav 4th tab label flips between "Sign up" and "Profile" — **MEDIUM**
**File:** `VerityPost/VerityPost/ContentView.swift:282` (`Item(id: .profile, label: isLoggedIn ? "Profile" : "Sign up")`).
**Problem:** Same icon, label flips on auth state. Visual continuity broken; "Sign up" doesn't belong as a tab.
**Fix:** Keep Profile icon + label; gate behind a sign-up prompt screen if user is anon (matches existing Notifications anon-gate pattern).
**Recommendation:** "Sign up" should be a CTA inside the Profile screen the tab opens, not a tab itself.

#### T105 — iOS quiz teaser dismiss is per-article only — **MEDIUM**
**File:** `VerityPost/VerityPost/StoryDetailView.swift:1689,1798` (`quizTeaserDismissed` is local state).
**Problem:** Dismiss on article 1, open article 2, teaser fires again at 50% scroll. Feels like a nag.
**Fix:** Persist dismiss as a per-session @AppStorage. Optionally rate-limit to once per N articles.
**Recommendation:** Combine with T11 / T37 (move teaser to article end, not 50% scroll).

#### T106 — iOS quiz submission failure leaves user stuck — **MEDIUM**
**File:** `VerityPost/VerityPost/StoryDetailView.swift:2360+` (error sets `quizError` string but no retry button at the failure point).
**Problem:** Network blip mid-submit → quiz state shows error text. User must navigate away and reopen the article to retry.
**Fix:** Add "Try again" button next to `quizError` text when state is `.submitting` failure.
**Recommendation:** Consistent with T44 / T45 retry-state requests.

#### T107 — iOS comments composer doesn't explain quiz-pass gate — **MEDIUM** (re-scoped: cited copy "You can't post comments right now." at `StoryDetailView.swift:1252` is the muted/banned banner, NOT the quiz-pass gate; quiz gate uses separate `passToCommentCTA` at line 634 with "PASS TO COMMENT" copy. Verify whether quiz gate copy needs the same explanation treatment.)
**File:** `VerityPost/VerityPost/StoryDetailView.swift:1254` ("You can't post comments right now.").
**Problem:** Logged-in user who hasn't passed the quiz sees a generic block message. No explanation that passing the quiz unlocks discussion.
**Fix:** Branch the copy: `quizPassed == false` → "Pass the quiz above to join the discussion." Otherwise keep current copy.
**Recommendation:** Frame the quiz as the price of entry — matches the trust principle.

#### T108 — Mention-permission warning fires AFTER comment submission — **MEDIUM**
**File:** `web/src/components/CommentComposer.tsx:86-125` (warning shown post-submit).
**Problem:** Free user types `@handle`, hits Post, sees warning that mentions are paid, comment posts as plain text. Mid-engagement permission discovery.
**Fix:** Detect `@<word>` regex inline in the textarea; if user lacks `comments.mention.insert`, render an inline tooltip "@mentions are a paid feature — your text will post as plain text."
**Recommendation:** Pre-empt the gate at typing time, not post-submit.

#### T109 — No read/unread state on home feed cards — **MEDIUM** (return-visit)
**File:** `web/src/app/page.tsx` (no read-state metadata on supporting cards); iOS `HomeView.swift` same.
**Problem:** Returning user can't tell at a glance which articles they've already read. Wastes scan time.
**Fix:** When `read_state` row exists for the user, render the article card title in dimmer color + a subtle "Read" tag. Persist on quiz attempt or 80%-scroll.
**Recommendation:** Already have `reading_log` data; surface it visually. Pair with T91.

#### T110 — Home editorial day is hard-coded America/New_York — **MEDIUM**
**File:** `web/src/app/page.tsx:34,100` (`EDITORIAL_TZ = 'America/New_York'`).
**Problem:** Pacific users at 9 PM PT (midnight ET) see "today's" content that's already old. International users see worse skew.
**Fix:** Either (a) accept editorial-zone framing and add "Today's edition (NYT time)" subtitle, or (b) shift to user's local zone for "today" filtering with editorial lock at NYT publish time.
**Recommendation:** Option (a) is consistent with the newspaper-of-record positioning. One-line copy.

#### T111 — Browse filter pills are decorative — **MEDIUM**
**File:** `web/src/app/browse/page.tsx:53,241-246` (FILTERS rendered, `activeFilter` never read; comment acknowledges removal pending Phase B).
**Problem:** Click pill → nothing happens. Liar UI; user loses faith in the rest of the surface.
**Fix:** Remove now. Restore when filter pipeline + `view_count` tracking ship.
**Recommendation:** Better to ship absence than fake presence.

#### T112 — DM paywall doesn't name the unlocking tier visually — **MEDIUM**
**File:** `web/src/app/messages/page.tsx:867` ("Upgrade to Verity or above").
**Problem:** "Verity or above" is plan-jargon. User has no visual cue which of Free / Verity / Verity Pro is the upgrade target.
**Fix:** Render a tier-card preview next to the modal CTA, highlighting the minimum unlocking tier.
**Recommendation:** Pair with T113 — same modal.

#### T113 — DM paywall modal has no X / Esc dismiss — **MEDIUM**
**File:** `web/src/app/messages/page.tsx:846-900` (no close handler, no Esc handler).
**Problem:** User who lands on `/messages` accidentally is trapped. Only escapes are "Upgrade" (leaves) or "Back to home" (leaves).
**Fix:** Add X button + Esc keyboard handler that returns the user to wherever they came from (or `/` as fallback).
**Recommendation:** Modal accessibility baseline.

#### T116 — iOS comment rate-limit shows "Wait" without countdown — **MEDIUM**
**File:** `VerityPost/VerityPost/StoryDetailView.swift:2404-2420` (rate-limit flag flips, no duration shown).
**Problem:** User taps Send, gets "Wait", retries, gets "Wait" again. Same friction as kids pair-code lockout.
**Fix:** Track `comment_rate_sec` server response and render "Try again in Xs" countdown.
**Recommendation:** Apply the same UX pattern across the app — every rate-limited action gets a visible countdown.

#### T117 — Inconsistent retry-button presence across error states — **MEDIUM** (re-scoped: original claim "search has retry, others don't" was wrong — search at `search/page.tsx:106` does NOT have a retry button either, and there is no `<ErrorState>` primitive. The kernel — that error states across `web/src/app/**/page.tsx` are inconsistent (some have retry, some don't, some are inert text divs) — still holds. Need a fresh audit before sequencing.)
**File:** `web/src/app/search/page.tsx:106` has retry; DM paywall and other surfaces don't.
**Problem:** Some error states have "Try again", others have "Couldn't load" with no recovery affordance.
**Fix:** Audit error renderers across `web/src/app/**/page.tsx`; standardize on the `<ErrorState>` primitive that ships with retry by default.
**Recommendation:** Bundle with T84 ("Please try again" copy sweep).

#### T118 — Adult iOS deep-link handler has no article routing — **MEDIUM**
**File:** `VerityPost/VerityPost/VerityPostApp.swift:15-17` (`auth.handleDeepLink(url)` only handles auth deep links; no article navigation).
**Problem:** Shared `veritypost://story/<slug>` URL opens the app but doesn't navigate to the article.
**Fix:** Branch on URL host: auth deep-links → existing `auth.handleDeepLink`; story deep-links → push StoryDetailView via NavigationStack programmatic push.
**Recommendation:** Bundle with T96 (kids deep-link routing).

#### T119 — Search zero-results has no refinement suggestions — **MEDIUM**
**File:** `web/src/app/search/page.tsx:238-242` (renders "no results" with nothing else).
**Problem:** Dead-end. User typed something, got nothing, has no path forward.
**Fix:** Below "no results", render trending searches + top categories + "Try fewer keywords" hint.
**Recommendation:** Editorial-curated trending. Cheap retention fix.

#### T121 — iOS push 7-day cooldown after "Not now" too long — **MEDIUM**
**File:** `VerityPost/VerityPost/PushPermission.swift:32` (`prePromptCooldown = 7 * 24 * 60 * 60`).
**Problem:** User dismisses to clear the sheet, changes mind in minutes, can't re-trigger for a week.
**Fix:** Two-tier cooldown: 24h after "Not now", but also re-prompt at the next high-value moment (first comment posted, first save) regardless of cooldown.
**Recommendation:** Pair with T1 (push pre-prompt fix).

#### T122 — iOS push status not auto-refreshed on foreground — **MEDIUM**
**File:** `VerityPost/VerityPost/PushPermission.swift:63-69` (`refresh()` not called on app foreground).
**Problem:** User denies, manually enables in iOS Settings, returns to app — UI still shows "denied" until next manual refresh call or full app restart.
**Fix:** Call `refresh()` in a `UIApplication.didBecomeActiveNotification` observer.
**Recommendation:** Standard iOS lifecycle pattern.

### LOW — opportunistic

#### T123 — Web signup heading references discussion before user knows it — **LOW**
**File:** `web/src/app/signup/page.tsx:315` ("Join the discussion that's earned.").
**Problem:** Cold visitor doesn't know what "discussion" means in product context. Jargon-as-headline.
**Fix:** Replace with neutral plain-English heading or pair with the 4-step "Read → Quiz → Discuss" preview.
**Recommendation:** Trivial copy edit.

#### T124 — Web signup form has no autofocus on first field — **LOW**
**File:** `web/src/app/signup/page.tsx:497-507` (no `autoFocus` on name input).
**Problem:** Mobile user must tap to start typing. One extra tap = measurable drop in mobile signup.
**Fix:** Add `autoFocus` to the name input.
**Recommendation:** One-attribute change.

#### T125 — Browse category title slug-null edge case still renders non-clickable — **LOW**
**File:** `web/src/app/browse/page.tsx:437-577` (slug-null rows fall back to plain text).
**Problem:** Rare but real — categories without slug render dead-looking titles inside otherwise-clickable rows.
**Fix:** Either guarantee every category has a slug (data fix) or hide slug-null rows entirely.
**Recommendation:** Tackle the data, not the UI.

#### T126 — iOS onboarding "Skip" on every screen — **LOW**
**File:** `VerityPost/VerityPost/WelcomeView.swift:35` (Skip button visible on all 3 screens unconditionally).
**Problem:** User can skip from screen 0 immediately, bypassing the Read/Quiz/Discuss preview, landing on Home with no orientation.
**Fix:** Hide Skip on screens 0 and 1; show only on the final screen (matches typical iOS onboarding pattern).
**Recommendation:** Get the value across before allowing skip.

---

## PROFESSIONAL SWEEP 2026-04-26

5 lenses applied: UI/UX manager, engagement/retention lead, senior frontend dev, senior backend dev, senior iOS dev. ~79 new findings, deduped against T1-T126. Each tagged with source lens. Numbered T127+ continuing the sequence.

### UI/UX Manager (T127-T139)

#### T129 — Comment edit Save button has no busy disabled-state styling — **MEDIUM** (UX)
**File:** `web/src/components/CommentRow.tsx:273-285`. `disabled` attr set, no opacity/cursor change.
**Fix:** `style={{ opacity: busy === 'edit' ? 0.6 : 1, cursor: busy === 'edit' ? 'not-allowed' : 'pointer' }}`.

#### T130 — Modal close (×) buttons lack guaranteed keyboard accessibility — **RE-SCOPED MEDIUM** (verification: story report modal at `web/src/app/story/[slug]/page.tsx:1828-1960` has NO × button at all — only Cancel/Submit footer buttons. Interstitial.tsx:100-102 has `aria-label="Close"`. Admin Modal.jsx is correct. Real action: add a × close to the report modal AND audit any other ad-hoc modals that lack one.)
**File:** `web/src/app/story/[slug]/page.tsx:~1050-1100` (report modal); `web/src/components/Interstitial.tsx:100-102`. Some are `<div role="button">` with `aria-label="Close"`. Pattern inconsistency vs admin Modal.jsx:149 which is a real `<button>`.
**Fix:** Standardize all modal close buttons to `<button type="button">` with global `:focus-visible` rule.

#### T131 — iOS comment vote buttons missing visual disabled-when-active state — **MEDIUM** (UX)
**File:** `VerityPost/VerityPost/StoryDetailView.swift:~1800-1860`. `active: Bool` parameter passed but no visual differentiation.
**Fix:** Apply `.disabled(already_voted)` or opacity/color when `active`.

#### T132 — Inline hex colors in auth pages bypass design tokens — **LOW** (consistency)
**File:** `web/src/app/signup/page.tsx:14-28` defines local `C` object with `#ffffff/#fafafa/#e5e5e5`. Other pages use `var(--text)`. Drift risk on brand changes.
**Fix:** Replace with CSS-var fallbacks `background: var(--bg, #ffffff)`.

#### T134 — Web password show/hide toggle below 44×44 touch target — **MEDIUM** (mobile a11y)
**File:** `web/src/app/signup/page.tsx:~340-370`. Eye icon button likely <20px hit area.
**Fix:** `minWidth: 44; minHeight: 44` on the button wrapper.

#### T135 — Auth page placeholders are example values, not instructional hints — **LOW** (UX clarity)
**File:** `web/src/app/signup/page.tsx:~280-320`. `you@example.com`, `Jane Reader` as placeholders. Best practice is visible labels + short hints.
**Fix:** Add visible `<label>` tags or replace with `name@domain.com` / "First and Last Name."

#### T136 — Web textarea elements lack visible resize affordance — **LOW** (discoverability)
**File:** `web/src/components/CommentComposer.tsx`, `CommentRow.tsx:256-269`. No corner triangle or instruction.
**Fix:** `resize: vertical; cursor: nwse-resize;` styling cue.

#### T137 — iOS email input lacks client-side format validation — **LOW** (UX)
**File:** `VerityPost/VerityPost/SettingsView.swift:1391-1452`. Server-side only; user submits invalid → server rejection.
**Fix:** Inline regex check in `onChange`, gray ✓ / red "Invalid email" hint.

#### T138 — Signup heading "Join the discussion that's earned" is jargon for cold visitors — **LOW** (copy)
**File:** `web/src/app/signup/page.tsx:315`. Cold user doesn't know what "earned" means in product context.
**Fix:** Plain heading + 4-step "Read → Quiz → Discuss" preview.

#### T139 — Audit error handling pattern across iOS Settings subpages — **MEDIUM** (UX consistency)
**File:** `VerityPost/VerityPost/SettingsView.swift:1958-2040, 2090-2142, 2393-2436`. Multiple subpages use `try?` + `Log.d` swallow pattern. (Partially overlaps T44/T45 but broader.)
**Fix:** Standardize on the profile-editor red-banner pattern across all settings subpages.

### Engagement / Retention (T140-T154)

#### T140 — No category-picker step in post-signup flow — **HIGH** (activation)
**Surface:** `/signup/pick-username` → home redirect (no interstitial).
**Problem:** New user lands on bare feed instead of personalized starting point.
**Fix:** Lightweight category/topic picker between username + home.

#### T141 — Quiz "passed" state has no next-action CTA — **MEDIUM** (recirc)
**File:** `web/src/components/ArticleQuiz.tsx` — claim line `:72` was off; problem is real but actual CTA-rendering location TBD. Stage = 'passed' celebrates with no path forward to discussion or related reads.
**Fix:** Add "View Discussion" + "More in [Category]" buttons in the passed state. Bundles with T11/T53.

#### T142 — Comment empty states aren't pedagogic — **MEDIUM** (engagement)
**File:** `web/src/components/CommentThread.tsx:81-84,147-149`. Empty/gated state shows generic "no comments" without explaining why (quiz gate vs plan gate vs no engagement).
**Fix:** Branch copy on cause: "Pass the quiz to unlock discussion" / "Be the first to comment."

#### T143 — Messages empty state buries Ask-an-Expert discovery — **MEDIUM** (engagement)
**File:** `web/src/app/messages/page.tsx:86-150`. New user lands on empty inbox with no first-action hook.
**Fix:** Hero card "Browse experts and ask questions" with link to expert discovery.

#### T144 — Bookmark cap warning lacks benefit framing — **MEDIUM** (conversion)
**File:** `web/src/app/bookmarks/page.tsx` — claim line `99-108` showed counter logic, not warning copy itself. Warning UI lives elsewhere in the same file; verify location before edit. Substance unchanged: cap warning treats limit as a punishment, not a benefit-unlock.
**Fix:** Reframe as "Save unlimited articles with Verity+" + tier comparison card.

#### T145 — Profile zero-state shows three separate empty states without prioritization — **MEDIUM** (activation)
**File:** `web/src/app/profile/page.tsx:853, 1166, 1730`. Activity/categories/achievements all empty independently.
**Fix:** Consolidated single empty state: "Read an article. Pass the quiz to unlock comments and build your score."

#### T146 — Anon notifications page CTA doesn't explain what user will miss — **LOW** (conversion)
**File:** `web/src/app/notifications/page.tsx:180-200`. "Sign in for breaking news alerts" — no mention of category alerts or reply notifications.
**Fix:** Expanded copy listing the notification types they'd get.

#### T147 — Recap kill-switch returns `null` with no "coming soon" surface — **MEDIUM** (discovery)
**File:** `web/src/app/recap/page.tsx:42-45`. Users never learn the feature exists.
**Fix:** Replace null with a landing card explaining recap, gated/dated.

#### T148 — iOS Alerts shows Manage tab to anon, lands on disabled state — **MEDIUM** (UX)
**File:** `VerityPost/VerityPost/AlertsView.swift:137-150,29-32`. Two tabs visible; Manage tab is disabled placeholder.
**Fix:** Hide Manage for anon. On signed-in first visit, jump to Manage to onboard category selection.

#### T149 — Quiz pool exhaustion has no recovery path — **MEDIUM** (engagement)
**File:** `web/src/components/ArticleQuiz.tsx:100-104`. "You have seen every question in this article's pool" terminates engagement with no alt.
**Fix:** "Try a different article" + same-category recommendations.

#### T151 — Pick-username form doesn't explain handles unlock follower discovery + sharing — **LOW** (activation)
**File:** `web/src/app/signup/pick-username/page.tsx`. Says "Your public profile card uses your username" only.
**Fix:** Supporting copy: "This is how other readers find and follow you."

#### T152 — Browse category cards static, no "trending now" subtext — **LOW** (engagement)
**File:** `web/src/app/browse/page.tsx:62-80`. Category card shows count only, not signal of activity.
**Fix:** "Trending: [Article title]" subtitle per category.

#### T153 — Message deep-link `?to=<userId>` accepts invalid IDs without validation — **LOW** (UX)
**File:** `web/src/app/messages/page.tsx:115-116,173`. Stale/invalid user IDs show compose form into the void.
**Fix:** Resolve user on mount; "User not found" if invalid.

### Senior Frontend (T155-T169)

#### T155 — NavWrapper unsafe JSON shape assumption — **MEDIUM** (type safety)
**File:** `web/src/app/NavWrapper.tsx:212`. `await res.json().catch(() => ({}))` then assumes `{ loggedIn: boolean }` shape.
**Fix:** Runtime guard before consuming.

#### T156 — `useTrack`/`usePageViewTrack` missing explicit return types — **MEDIUM** (TS hygiene)
**File:** `web/src/lib/useTrack.ts:27,53`. Exported hooks rely on inference.
**Fix:** Add return-type signatures.

#### T157 — `searchParams as { reason?: string }` cast in beta-locked route — **MEDIUM** (TS)
**File:** `web/src/app/beta-locked/page.tsx:27`. No runtime validation.
**Fix:** Zod parse or shape guard.

#### T159 — Comment thread has no error boundary — **HIGH** (resilience)
**File:** `web/src/components/CommentThread.tsx`. RLS or Supabase failure crashes whole section silently.
**Fix:** Wrap in `<ErrorBoundary>` or add granular `error.tsx`.

#### T160 — Click handler on `<div>` in CommentThread overlay — **MEDIUM** (a11y)
**File:** `web/src/components/CommentThread.tsx:699`. `<div onClick={closeDialog}>` lacks keyboard handler.
**Fix:** Use `<button>` or add `role="button"` + `onKeyDown` for Escape/Enter.

#### T161 — `usePermissionsContext() as { user: unknown }` defeats context typing — **MEDIUM** (TS)
**File:** `web/src/components/LockModal.tsx:80`.
**Fix:** Define `PermissionsContext` interface; type `createContext` with it.

#### T162 — Multiple `await res.json().catch(() => ({}))` with `as` casts in messages — **MEDIUM** (TS)
**File:** `web/src/app/messages/page.tsx:495,531,570`. Empty object cast as expected shape; downstream undefined access.
**Fix:** Validate expected key before consuming; throw on shape mismatch.

#### T163 — Notifications GET route lacks NextRequest/NextResponse typing — **LOW** (TS)
**File:** `web/src/app/api/notifications/route.js:12`. `async function GET(request)` — no type hints.
**Fix:** Add `NextRequest` parameter type + `Promise<NextResponse>` return.

#### T165 — 90+ inline `CSSProperties` objects, no stylesheet/Tailwind/CSS modules — **LOW** (maintainability)
**File:** Across `web/src/components/`, `web/src/app/`. Maintenance burden, bundle size cost.
**Fix:** Migrate critical components to CSS modules; consider Tailwind for new work.

#### T166 — Zero `data-testid` attributes in codebase — **LOW** (testability)
**Problem:** No test selectors; e2e tests are brittle.
**Fix:** Add `data-testid` to key interactive elements as new tests are written.

#### T167 — Hard-coded user-facing strings throughout web — **LOW** (i18n readiness)
**Example:** `web/src/components/CommentComposer.tsx:97` — "Mentions are available on paid plans...".
**Fix:** Move to a constants module; foundation for future i18n.

#### T168 — Comment composer dedup creates intermediate Array — **LOW** (perf micro)
**File:** `web/src/components/CommentComposer.tsx:78`. `Array.from(new Set([...].map(...)))`.
**Fix:** Build Set; convert only when needed downstream.

#### T169 — No global error.tsx route boundary — **MEDIUM** (resilience)
**Problem:** Next.js App Router `error.tsx` files missing or sparse. Unhandled errors throw the full app to Next's default screen.
**Fix:** Add `web/src/app/error.tsx` and per-segment boundaries for major routes (story, profile, admin).

### Senior Backend (T170-T181)

#### T170 — No `Cache-Control: private, no-store` on authenticated API routes — **MEDIUM** (privacy)
**File:** ~30 routes including `web/src/app/api/comments/route.js:128`, `messages/route.js:62`, `bookmarks/route.js`. CDN/proxy could cache auth-scoped data.
**Fix:** Add `Cache-Control: 'private, no-cache, no-store, max-age=0'` to all authenticated endpoint responses.

#### T171 — JSON parse swallow pattern doesn't bound request size — **MEDIUM** (DoS)
**File:** `web/src/app/api/comments/route.js:56`, `messages/route.js:26`, `bookmark-collections/route.js:56`. `await request.json().catch(() => ({}))` doesn't cap body size before parsing.
**Fix:** Cap with `request.text()` size guard before JSON.parse (Stripe webhook has the pattern at lines 71-72).

#### T172 — Promo redeem regex escape suggests prior fragility — **MEDIUM** (defense)
**File:** `web/src/app/api/promo/redeem/route.js:49-52`. The escape works, but the comment history implies the route was once fragile.
**Fix:** Validate codes server-side to alphanumeric + hyphens before storage.

#### T173 — Comment body length not capped at app layer — **LOW** (defense-in-depth)
**File:** `web/src/app/api/comments/route.js` — verification: no app-layer length check; the `post_comment` RPC may enforce length but its body wasn't inspected. **MCP-verify-first** before deciding whether app-layer cap is duplicative or genuinely missing.
**Fix:** If RPC enforces, mirror at app layer with same threshold for fast-fail UX. If RPC doesn't enforce, app-layer cap is required.

#### T174 — Apple App Store webhook idempotency pattern differs from Stripe — **LOW** (defense)
**File:** `web/src/app/api/ios/appstore/notifications/route.js:121-126`. Verification: the route checks `prior.processing_status === 'received'` and reclaims only if `ageMs < 5 * 60 * 1000` (i.e., still in concurrent window). Older rows short-circuit. Original "can re-run" framing was imprecise. The substantive gap is just consistency with Stripe's `in('processing_status', [...])` guard pattern at `webhook/route.js:130-136`.
**Fix:** Align with Stripe pattern for consistency, even though current behavior is safe. Pure defense-in-depth.

#### T175 — `EVENT_HASH_SALT` falls back to empty string in production — **MEDIUM** (privacy)
**File:** `web/src/app/api/events/batch/route.ts:44-46`. If env var unset in prod, salt becomes `''`. Rainbow-table-friendly.
**Fix:** Throw on startup if NODE_ENV=production && !EVENT_HASH_SALT.

#### T176 — Rate-limit fail-open dev flag has no startup validation — **LOW** (config safety)
**File:** `web/src/lib/rateLimit.js:35-46`. Documented well but no runtime check that prod path is fail-closed.
**Fix:** Layout/middleware startup check; warn loudly if env is inconsistent.

#### T177 — Sensitive routes don't enforce recent re-auth (`auth_time`) — **LOW** (OWASP-class hardening)
**File:** `/api/auth/email-change`, `/api/billing/cancel`, etc. Hours-old session can mutate sensitive state.
**Fix:** Reject sensitive routes if `auth_time > 15min`. Requires `/api/auth/re-verify` route.
**Note:** Magic-link auth shape changes this — see AUTH-MIGRATION; revisit post-migration.

#### T179 — RPC error mapping inconsistent across routes — **LOW** (DX)
**File:** `web/src/app/api/comments/route.js:87-112` (good); `web/src/app/api/promo/redeem/route.js:57-58` (returns raw).
**Fix:** Shared `mapRpcError(error)` helper.

#### T180 — `Stripe webhook charge.customer` not strictly type-guarded — **LOW** (defense)
**File:** `web/src/app/api/stripe/webhook/route.js:270-275,524-526`. Stripe is reliable but defense-in-depth.
**Fix:** `typeof charge.customer === 'string'` check before use.

#### T181 — Cron auth pattern not commented in each cron handler — **LOW** (docs)
**File:** All `web/src/app/api/cron/*/route.{ts,js}`. Single source comment in `cronAuth.js` references prior timing-leak.
**Fix:** One-line comment per cron route documenting the auth contract.

### Senior iOS (T182-T200)

#### T182 — `EventsClient.shared` observer never removed — **MEDIUM** (anti-pattern)
**File:** `VerityPost/VerityPost/EventsClient.swift:18-23`. Singleton OK today, but `[weak self]` + deinit hygiene lacking.
**Fix:** Block-based observer with `[weak self]`; explicit deinit removal.

#### T185 — Hardcoded user-facing strings throughout iOS (no localization) — **LOW** (i18n future-proofing)
**File:** `HomeView.swift` and across most `*View.swift`. Verification: 0 uses of `String(localized:)` confirmed. **Severity downgraded** — English-first product is intentional; this is future-proofing only. Don't ship pre-launch.
**Fix:** When multi-language is roadmapped, wrap in `String(localized: ...)` + add `.xcstrings` catalog. Not now.

#### T187 — `setCurrentUser` doesn't validate UUID format — **LOW** (defense)
**File:** `VerityPost/VerityPost/PushRegistration.swift:20-22,46`. Malformed userId → server upsert fails silently (`Log.d`).
**Fix:** UUID validation; fail loudly in DEBUG builds.

#### T188 — `StoryDetailView` has 69 `@State` properties in one view — **MEDIUM** (perf + maintainability)
**File:** `VerityPost/VerityPost/StoryDetailView.swift:28-179` (file is 2,590 lines). Verified count: 69 `@State` props (originally claimed 80+). Body recomputes on any state change; refactor target stands.
**Fix:** Extract `QuizEngine`, `DiscussionManager` as `@StateObject`s into child views.

#### T189 — `AuthViewModel.checkSession` swallows network vs no-session distinction — **MEDIUM** (UX correctness)
**File:** `VerityPost/VerityPost/AuthViewModel.swift:91-96`. Both paths set `isLoggedIn = false`.
**Fix:** Surface error type; offer retry on transient network failure.

#### T190 — `Task.detached` analytics flush has no cancellation handle — **LOW** (data loss)
**File:** `VerityPost/VerityPost/EventsClient.swift:101-115`. Backgrounding mid-flush may abandon up to ~20 events silently.
**Fix:** Store Task handle; await synchronously in `handleBackground`.

#### T193 — SupabaseClient initialized without timeout config — **MEDIUM** (UX on flaky networks)
**File:** `VerityPost/VerityPost/SupabaseManager.swift:53-55`. Uses OS default 60s.
**Fix:** Set `URLSessionConfiguration.timeoutIntervalForRequest = 15` and `waitsForConnectivity = true`.

#### T194 — `KidsAppState.loadUser` surfaces raw error strings — **LOW** (UX)
**File:** `VerityPostKids/VerityPostKids/KidsAppState.swift:78-93`. "Couldn't load streak: error.localizedDescription" is hostile copy.
**Fix:** Map to friendly strings; offer retry button.

#### T195 — Kids quiz server-verdict has no timeout fallback — **LOW** (resilience)
**File:** `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:68-69,145-148`. `verdictPending` may hang indefinitely.
**Fix:** 5s timeout; fall back to local computation with warning log.

#### T197 — `LoginView.canSubmit` recomputes every body render — **LOW** (perf micro)
**File:** `VerityPost/VerityPost/LoginView.swift:228-230`.
**Fix:** Cache as `@State`; update via `.onChange(of:)`.

#### T198 — `VerityPostApp` only handles `.active` scenePhase, not `.background` — **LOW** (data loss)
**File:** `VerityPost/VerityPost/VerityPostApp.swift:28-32`. Force-close mid-StoreKit-restore abandons pending work.
**Fix:** `.background` handler to flush pending writes.

#### T201 — `REFERRAL_COOKIE_SECRET` missing from `.env.example` — **DEBT** (deploy hygiene)
**Source:** Gap-finder sweep (CHANGELOG audit).
**Why:** CHANGELOG entry 2026-04-26 (Closed-beta gate flip) added a new required env var `REFERRAL_COOKIE_SECRET` for the referral-cookie verification path. `.env.example` doesn't list it. New devs cloning the repo won't know the var is required; closed-beta gate breaks silently in staging if forgotten.
**Fix:** Add `REFERRAL_COOKIE_SECRET=` to `web/.env.example` with one-line comment ("Used by /api/auth/callback to verify the referral cookie hash. Set in Vercel before flipping the closed-beta gate.").

#### T200 — Signup username retry loop wastes 300ms on permanent errors — **LOW** (UX)
**File:** `VerityPost/VerityPost/AuthViewModel.swift:312-331`. Verification: early-break logic exists (`guard msg.contains("p0002") || msg.contains("not found") else { break }`), so non-transient errors break after first attempt. Remaining waste is 300ms on the first attempt before the break — minor. Pre-AUTH-MIGRATION concern only; magic-link reshapes the signup flow.
**Fix:** Skip the initial 300ms sleep entirely on permanent errors; match error message for "reserved"/"taken" pre-RPC.

---

## EXTERNAL SWEEPS 2026-04-26

10 specialist lenses applied: Security, Performance, DevOps/SRE, Product/Editorial, Mobile QA, iOS Implementation Manager, Attorney, Kids COPPA Specialist, Trust & Safety, Page Walkthrough. Each was instructed to verify before reporting and dropped unverified items. Findings deduped against existing T1-T201 and Pre-Launch Assessment. Numbered T202+ continuing the sequence.

Items below already moved to Pre-Launch Assessment (Apple/Sentry/COPPA-CRITICAL): M4→A12, M5→A13, M12→A1, L7→A9, C4→K1, C8→K9, C2/L10→new K11, plus Sentry items folded into S1-S5. Kids-COPPA-CRITICAL items C1, C5, C6 added to Pre-Launch as K12-K14 (see Pre-Launch Assessment for those).

### Security (T202-T214)

#### T203 — Bearer token from Authorization header used without JWT signature check — **HIGH**
**File:** `web/src/lib/auth.js:17-35`. `createClientFromToken(token)` is called with raw bearer; no verification of issuer/audience/signature before using.
**Fix:** Verify JWT signature server-side via `SUPABASE_JWT_SECRET` before creating the client. Wrap `getUser()` to fail closed on invalid tokens.

#### T204 — Open-redirect / path-traversal hardening on `next=` param — **HIGH**
**File:** `web/src/lib/authRedirect.js:23-42`. Regex permits `..` patterns; URL-encoded `%2e%2e` not pre-decoded before validation.
**Fix:** Reject `..` literally; `decodeURIComponent` before regex; tighten path regex.

#### T205 — Stripe webhook fallback trusts client_reference_id when no prior customer mapping — **HIGH**
**File:** `web/src/app/api/stripe/webhook/route.js:332-374`. First checkout: attacker sets `client_reference_id = <victim-uuid>` with their own `customer_id` → webhook binds attacker's Stripe customer to victim's row.
**Fix:** Require pre-signed metadata token in checkout session; reject webhook fallback to claimed UUID when no prior `stripe_customer_id` mapping exists.

#### T206 — Deep-link `setSession()` not validated against Supabase issuer/audience — **HIGH**
**File:** `VerityPost/VerityPost/AuthViewModel.swift:377-407`. `verity://` URL scheme is registered; attacker can craft a deep-link with fake `access_token`/`refresh_token` and the app calls `setSession()` blindly.
**Fix:** After `setSession()`, immediately call `auth.getUser()` to validate; reject + clear session on failure. Validate `aud`/`iss` claims if available.

#### T207 — DOMPurify SSR fallback returns input unsanitized — **MEDIUM**
**File:** `web/src/app/expert-queue/page.tsx:11-18`. `dompurify` is browser-only; if any future state path renders `dangerouslySetInnerHTML` server-side, sanitize is a no-op.
**Fix:** Move markdown rendering to server-only path with `sanitize-html`, or always guard with `typeof window !== 'undefined'` at the inject point.

#### T208 — CSP `'strict-dynamic'` permits Stripe-CDN-served scripts without SRI — **MEDIUM**
**File:** `web/src/middleware.js:92`. If Stripe's CDN is compromised (BGP/DNS hijack), CSP doesn't catch it.
**Fix:** Add Subresource Integrity hash on Stripe script tags, or remove `'strict-dynamic'` and explicitly nonce-tag Next.js bootstrap.

#### T209 — Browser `Cache-Control` not set on POST / state-changing routes (replay risk) — **LOW**
**File:** Sample: `web/src/app/api/stripe/portal/route.js`. Responses to state-changing endpoints should be `Cache-Control: no-store`. Pairs with T170 (broader cache header sweep).

#### T210 — Admin settings PATCH key allowlist missing — **LOW**
**File:** `web/src/app/api/admin/settings/route.js:72-75`. Validates `value` is string; doesn't whitelist keys. Settings poisoning vector.
**Fix:** `ALLOWED_KEYS` constant; reject unknown keys.

#### T211 — Stripe webhook event-replay rate limit absent — **LOW**
**File:** `web/src/app/api/stripe/webhook/route.js:86-100`. Idempotency via PK, but no rate limit per `event.id` or source IP.
**Fix:** Add per-event-id and per-IP rate limit on the webhook endpoint.

#### T212 — TOCTOU race on user profile fetch after `auth.getUser()` — **LOW**
**File:** `web/src/lib/auth.js:37-60`. Defense-in-depth; RLS should already enforce `auth.uid() = id` but no app-layer assertion.
**Fix:** Confirm RLS on `users` enforces `auth.uid() = id`. Add `if (authUser.id !== profile.id) throw` belt-and-suspenders check.

#### T214 — Keychain `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` for tokens — **LOW** (acceptable, monitor)
**File:** `VerityPost/VerityPost/Keychain.swift:20`. Correct level, but document acceptance + revisit if Apple changes guidance.

### Performance (T215-T223)

#### T215 — Home page is full client component, blocks first paint — **HIGH**
**File:** `web/src/app/page.tsx:3` (`'use client'`). All data fetches in `useEffect`. Anon LCP ~2-3s on 3G.
**Fix:** Convert to async server component; server-render stories + categories; gate dynamic in `<Suspense>`.

#### T216 — Story page has 102 inline style objects recreated each render — **MEDIUM**
**File:** `web/src/app/story/[slug]/page.tsx`. 102 `style={{...}}` literals; static styles re-allocated on every render.
**Fix:** Extract `const headingStyle = {...}` for repeated objects.

#### T217 — Story page has 10 `useEffect` hooks with mixed deps — **HIGH**
**File:** `web/src/app/story/[slug]/page.tsx:376-734`. Stale-closure risk on session rotation; silent comment/bookmark write failures possible.
**Fix:** Consolidate to 2-3 effects; AbortController for in-flight cleanup.

#### T218 — Story page fires 9+ parallel queries on mount — **MEDIUM**
**File:** `web/src/app/story/[slug]/page.tsx:468, 578-593, 602-626`. 9 round-trips on 3G = 9-15s load.
**Fix:** Inline `timelines` + `sources` as joined rows; cache user plan in AuthContext.

#### T219 — `Ad.jsx` fetches `/api/ads/serve` per article with no Cache-Control — **MEDIUM**
**File:** `web/src/components/Ad.jsx:34-56`. N article views = N ad fetches, ~50ms each.
**Fix:** Add `Cache-Control: max-age=300, stale-while-revalidate=3600` to ad serve route.

#### T220 — NavWrapper fires 3 `useEffect`s every route change — **MEDIUM**
**File:** `web/src/app/NavWrapper.tsx:151-202`. Permission hydrate re-fires on each navigation.
**Fix:** Move permission hydrate to context provider; cache + sync on tab visibility.

#### T221 — `@anthropic-ai/sdk` and `openai` in `dependencies` — **MEDIUM** (future-bloat)
**File:** `web/package.json:31,40`. Server-only today, but accidental client import = ~400KB gzipped to browser.
**Fix:** Add `import 'server-only';` at top of `web/src/lib/pipeline/call-model.ts`. Optionally move to devDeps.

#### T222 — Inline `<style>` in `layout.js` (skip-link + form focus) ships on every page — **LOW**
**File:** `web/src/app/layout.js:113-160`. Move to `globals.css` for tree-shake.

#### T223 — `cheerio` + `dompurify` + `sanitize-html` in deps — **LOW** (audit)
**File:** `web/package.json:35-36,44`. If client-imported by accident, ~50KB. Add `import 'server-only'` to whichever modules use them server-side.

### DevOps / SRE (T224-T232)

#### T224 — `.env.example` missing 3 vars used by code — **HIGH**
**Vars:** `RATE_LIMIT_ALLOW_FAIL_OPEN` (read at `web/src/lib/rateLimit.js:47`), `APPLE_BUNDLE_ID` (read at `web/src/lib/appleReceipt.js:27`), and per T201 `REFERRAL_COOKIE_SECRET`.
**Fix:** Add all to `.env.example` with one-line descriptions.

#### T225 — pipeline-cleanup cron swallows per-sweep errors with `console.error` only — **MEDIUM**
**File:** `web/src/app/api/cron/pipeline-cleanup/route.ts:69-91, 98-114, 124-139, 156-226`.
**Fix:** Wrap each sweep with `await captureMessage(...)` on failure (level=warning).

#### T226 — `kids-waitlist` route uses `console.log` for anti-fraud signals — **MEDIUM**
**File:** `web/src/app/api/kids-waitlist/route.ts:50,65,73,150` (bot_ua_drop, honeypot_hit, too_fast, signup).
**Fix:** Replace each with `await captureMessage(...)` at appropriate level.

#### T227 — Stripe webhook 1 MiB body-size rejection has no observability — **MEDIUM**
**File:** `web/src/app/api/stripe/webhook/route.js:67,72`. Legitimate large payloads silently 413; Stripe retries hidden.
**Fix:** `await captureMessage('stripe webhook body exceeds 1 MiB', 'warning', { actual_size })` on the rejection path.

#### T228 — Cron heartbeat insert errors silenced via `console.error` — **MEDIUM**
**File:** `web/src/lib/cronHeartbeat.js:20-31`. Operator can't distinguish "cron didn't run" from "ran but log failed."
**Fix:** Capture exception to Sentry before swallowing.

#### T229 — Cron `maxDuration=60` documented risk at scale, no timeout-detection cleanup — **MEDIUM**
**File:** `web/src/app/api/cron/check-user-achievements/route.js:21,43-49`. Vercel kills mid-flight; 'start' heartbeats hang.
**Fix:** Post-flight cleanup cron marks >60s old 'start' rows as 'timeout'; alert on `processing_status='timeout'`.

#### T231 — No CI integration test for `vercel.json` cron paths ↔ route handlers — **LOW**
**File:** `web/vercel.json` vs `web/src/app/api/cron/*/route.*`.
**Fix:** CI step: assert `count(crons in vercel.json) == count(handler files)`.

#### T232 — No deploy/rollback/secret-rotation scripts — **LOW**
**File:** `web/scripts/` does not exist. All ops via Vercel UI.
**Fix:** `web/scripts/deploy.sh`, `emergency-rollback.sh`. Document in runbook.

### Product / Editorial (T233-T243)

#### T233 — Hard-delete on articles, no soft-delete window — **HIGH**
**File:** `web/src/app/api/admin/articles/[id]/route.ts:611`. `.delete()` removes permanently; audit log writes after delete (orphan if persist fails).
**Fix:** Soft-delete via `deleted_at`; write audit before mutation; cron purges after 30 days.

#### T234 — `is_ai_generated` flag never rendered to readers — **HIGH** (trust)
**File:** Admin `system/page.tsx:45` defines `show_ai_label`; story page never reads `is_ai_generated`. Pairs with EU AI Act / CA AB 2655 disclosure (T245 below).
**Fix:** Story page renders "AI-synthesized" badge when `is_ai_generated=true && show_ai_label=true`.

#### T235 — Admin article PATCH uses non-transactional `.delete()` + `.insert()` for sources/timeline/quizzes — **MEDIUM**
**File:** `web/src/app/api/admin/articles/[id]/route.ts:440-512`. Mid-operation failure leaves child rows inconsistent; audit fires on success only.
**Fix:** Wrap in RPC or PostgreSQL transaction; audit only on commit.

#### T236 — Plagiarism rewrite prompt overrides not audited per-run — **MEDIUM**
**File:** `web/src/lib/pipeline/plagiarism-check.ts:82-84`. Admin `additionalInstructions` appended silently; no record of which override was active.
**Fix:** Snapshot override into `pipeline_runs.metadata` at run start; surface in audit log.

#### T237 — Cost-cap fail-closed has no audit trail — **MEDIUM**
**File:** `web/src/lib/pipeline/cost-tracker.ts:154-175`. RPC error = throw; caller rethrows but no observable event.
**Fix:** Emit explicit log entry / Sentry breadcrumb on fail-closed with `pipeline_run_id`.

#### T238 — Hard-delete on users orphans authored content — **MEDIUM**
**File:** `web/src/app/api/admin/users/[id]/route.ts:54`. Comments/articles still reference deleted user_id.
**Fix:** Soft-delete via `deleted_at`; RLS hides deleted user's content from public queries.

#### T239 — Featured/trending curation logic opaque — **MEDIUM**
**File:** `web/src/app/browse/page.tsx:164-165`. "Most recent 3" hardcoded client-side; `is_featured` schema column never set or surfaced.
**Fix:** Admin pin UI; "Featured by editors" label; track in audit log.

#### T240 — Comment hide has no comment-level audit log — **LOW**
**File:** `web/src/app/admin/moderation/page.tsx`. Penalty-level audit exists; comment-hide / hide-reason not tracked granularly.
**Fix:** `moderation_actions` table (comment_id, moderator_id, action, reason, created_at).

#### T241 — Sources have no broken-link verification — **LOW**
**File:** `web/src/app/story/[slug]/page.tsx:108-200`. No `last_verified_at`/`status_code` on sources.
**Fix:** Add columns; weekly cron checks links; flag dead in admin article view.

#### T242 — Prompt preset versioning timestamp/version missing — **MEDIUM**
**File:** `web/src/app/api/admin/prompt-presets/route.ts`. Pairs with T55. Re-running cluster with different prompt yields different output; no diff in audit.
**Fix:** Snapshot prompt body into `pipeline_runs.metadata` at start; diff in audit on retry.

#### T243 — Article author byline not rendered — **LOW** (trust)
**File:** `web/src/app/story/[slug]/page.tsx`. `articles.author_id` never displayed; readers don't see author/expert/AI status.
**Fix:** Fetch author on story load; render author card with expert badge + verification status.

### Mobile QA / Edge Cases (T244-T254)

#### T244 — Pull-to-refresh stacks parallel network calls — **MEDIUM**
**File:** `HomeView.swift:180`, `ProfileView.swift:173`, `SettingsView.swift:652`. `.refreshable` doesn't cancel prior in-flight load.
**Fix:** Store `loadTask` handle; cancel before re-firing.

#### T245 — Quiz auto-submit double-fire on rapid network recovery — **MEDIUM**
**File:** `StoryDetailView.swift:1137-1145`. 350ms `asyncAfter` fires regardless of network state.
**Fix:** Cancel timer task before retry-path `submitQuiz()`; gate on `quizStage != .submitting`.

#### T246 — Comment post 200 with body `{ "error": "..." }` clears UI without error feedback — **MEDIUM**
**File:** `StoryDetailView.swift:2355-2425`. Decode fails on shape mismatch; UI clears composer; user loses draft silently.
**Fix:** Check JSON for `error` field before decode; preserve composer + show error.

#### T247 — Splash 10s timeout doesn't retry on transient network — **MEDIUM**
**File:** `AuthViewModel.swift:75-101`. 8s success → still un-flips `splashTimedOut=true` later; relaunch shows duplicate splash.
**Fix:** Wrap auth call in Task with proper timeout enforcement; cancel timer on success.

#### T248 — Vote buttons silently fail when session expired — **MEDIUM**
**File:** `StoryDetailView.swift:2430-2456`. `try? await client.auth.session` returns nil; vote bails; UI shows optimistic update.
**Fix:** Throw on session-fetch failure; surface "Please sign in again."

#### T249 — `EventsClient.flush` Task.detached uncancellable; events lost on background-then-kill — **MEDIUM**
**File:** `EventsClient.swift:92-115`. Buffer cleared before HTTP enqueued; process kill drops events.
**Fix:** Persist buffer to disk on background; await flush completion.

#### T250 — APNs token arrives before `setCurrentUser()`; no retry — **MEDIUM**
**File:** `PushRegistration.swift:44-80`. Token-before-login → silent ignore; subsequent logins don't re-register.
**Fix:** Persist token; retry RPC registration on `setCurrentUser()`.

#### T251 — Kids quiz writes pending when app backgrounded; "success" celebration on stale state — **MEDIUM**
**File:** `KidQuizEngineView.swift:62-68`, `KidsAppState.swift:187-200`. `pendingWrites` Tasks cancelled; counter not persisted.
**Fix:** Wait for all pending writes (with timeout) before showing result; "Couldn't save" path on timeout.

#### T252 — Username availability race vs `auth.signUp` — **MEDIUM**
**File:** `AuthViewModel.swift:249-278`. Available at check-time → taken between check and signup → signup row has NULL username; trigger seeds NULL.
**Fix:** Surface "username unavailable" + rollback auth row on race detect.

#### T253 — TTSPlayer doesn't release buffer on memory warning — **LOW**
**File:** `StoryDetailView.swift:125`. No `UIApplication.didReceiveMemoryWarningNotification` observer.
**Fix:** Stop + release TTS buffers in observer.

#### T254 — `sessionExpired` banner stays sticky after dismissal — **LOW**
**File:** `AuthViewModel.swift:114-158`. No auto-dismiss; user navigating in cached views sees stale banner.
**Fix:** Auto-dismiss after 5s OR add "Sign in again" CTA that calls `checkSession()`.

### iOS Implementation Manager (T255-T263)

#### T255 — `aps-environment` push entitlement missing — **HIGH**
**File:** `VerityPost/VerityPost/VerityPost.entitlements` (absent key). Code calls `registerForRemoteNotifications()` but no entitlement; APNs registration silently fails.
**Fix:** Add `<key>aps-environment</key><string>production</string>` (or `development` for TestFlight).

#### T256 — Sign-in-with-Apple entitlement declared while auth direction is magic-link-only — **HIGH** (auth direction)
**File:** `VerityPost/VerityPost/VerityPost.entitlements:5-8`. Per AUTH DIRECTION, magic-link only. SIWA button still in `SignupView.swift:95-119` + `LoginView.swift:36-82`.
**Fix:** Remove SIWA entitlement, button, and AuthViewModel handler. Bundle with AUTH-MIGRATION.

#### T257 — Kids app missing `NSAppTransportSecurity` declaration — **MEDIUM**
**File:** `VerityPostKids/VerityPostKids/Info.plist`. Adult app has it (Info.plist:38-42); kids parity missing.
**Fix:** Add `NSAppTransportSecurity` dict with `NSAllowsArbitraryLoads = false` for clarity.

#### T258 — Bundle version + build hardcoded `1.0` / `1` — **MEDIUM**
**File:** `VerityPost/VerityPost/Info.plist:17-18`, `VerityPostKids/VerityPostKids/Info.plist:19-20`. Build number must increment per submission.
**Fix:** Dynamic build number via xcconfig + git commit count or build phase.

#### T259 — Adult app declares `audio` background mode but no audio playback uses it — **LOW**
**File:** `VerityPost/VerityPost/Info.plist:52-55`. Apple flags unused capability declarations.
**Fix:** Remove if no audio background usage; or wire it before submission.

#### T260 — Kids app missing `applinks:kids.veritypost.com` associated-domains entitlement — **MEDIUM**
**File:** `VerityPostKids/VerityPostKids.entitlements` (missing). Adult has `applinks:veritypost.com`.
**Fix:** Add entitlement + publish `.well-known/apple-app-site-association` on kids subdomain (when deep-link routing per K10 ships).

#### T261 — Deployment target `iOS 17.0` excludes ~10-15% of users on iOS 16 — **LOW**
**File:** project.pbxproj `IPHONEOS_DEPLOYMENT_TARGET = 17.0`. Audit code for iOS 17-only APIs; if none required, lower to 16.
**Fix:** Test build at 16; lower if no API gates.

#### T262 — UITests bundle ID variant verified, but document submission target — **LOW**
**File:** `VerityPost.xcodeproj/project.pbxproj:452,474,558,580`. Confirm only `com.veritypost.app` submits, never `.uitests`.
**Fix:** Document in release runbook.

#### T263 — `PrivacyInfo.xcprivacy` privacy manifest unverified — **MEDIUM** (iOS 17+ requirement)
**File:** Both apps. Apple requires `PrivacyInfo.xcprivacy` declaring API usage + tracking domains for any SDK touching sensitive APIs.
**Fix:** Add `PrivacyInfo.xcprivacy` for both apps; declare APIs used (file timestamp, system boot time, disk space, etc.) and tracking domains (none, ideally).

### Attorney / Legal (T264-T273)

#### T265 — Missing CCPA "Do Not Sell or Share My Personal Information" link — **HIGH** (CPRA)
**File:** `privacy/page.tsx:186` mentions California rights but no opt-out link/page exists.
**Fix:** Footer link "Your California Privacy Rights" → opt-out page or modal. Declare GA4/AdSense as "sharing" if applicable; provide toggle.

#### T266 — Missing Section 230 immunity language in TOS — **HIGH** (defamation defense)
**File:** `terms/page.tsx:76-77`. No §230 disclaimer for user-generated comments / fact-checks.
**Fix:** Add section: "Verity Post is a neutral platform under Section 230. Users are solely responsible for their comments and analyses."

#### T267 — AI-generated content disclosure missing (EU AI Act + CA AB 2655) — **HIGH**
**File:** `privacy/page.tsx:85-88` mentions AI processing but no end-user-facing disclosure on stories.
**Fix:** Wire `is_ai_generated` flag to a story-page label "Summary generated with AI assistance"; update privacy policy to cite EU AI Act Article 50 + AB 2655 compliance.

#### T268 — DMCA designated agent registration with US Copyright Office unverified — **HIGH** (safe harbor)
**File:** `dmca/page.tsx:119`. Lists `legal@veritypost.com` only; no Copyright Office registration number cited.
**Fix:** Register agent at copyright.gov/dmca-agent (free, ~10 min); update DMCA page with registration number.

#### T269 — Auto-renewal disclosure not at point of purchase (FTC ROSCA) — **MEDIUM**
**File:** `terms/page.tsx:98-99` discloses auto-renewal but only at TOS page, not at checkout/billing UI.
**Fix:** Inline disclosure at checkout: "Subscription auto-renews at $X.XX/[period] unless cancelled." Affirmative confirm before purchase button activates.

#### T270 — Refund policy ambiguous — **LOW** (consumer protection)
**File:** `terms/page.tsx:102-103`. "No paid content accessed" undefined.
**Fix:** "Refunds available within 7 days of purchase OR before first paid-feature use, whichever comes first."

#### T271 — Missing choice-of-law clause — **LOW** (contract enforceability)
**File:** `terms/page.tsx`. No "Governing Law" section.
**Fix:** Add: "Governed by laws of [Delaware/California], exclusive jurisdiction in [county/state]."

#### T272 — Accessibility statement page absent (ADA defense) — **MEDIUM**
**File:** `web/src/app/accessibility/page.tsx` exists but lacks formal Accessibility Statement (WCAG commitment + known limitations + contact).
**Fix:** Add statement section: WCAG 2.1 AA commitment + accessibility@veritypost.com contact.

#### T273 — Missing kids-specific privacy policy URL — **HIGH** (COPPA + Apple Kids)
**File:** Privacy policy has COPPA section but no `/privacy/kids` page or kids-app-linkable URL. Apple Kids Category requires distinct kids notice.
**Fix:** Create `/privacy/kids` enumerating kid-specific data collection. Also tracked as Pre-Launch Assessment K11.

### Trust & Safety (T274-T287)

#### T276 — Penalty levels don't auto-escalate on repeat violation — **HIGH**
**File:** `web/src/app/api/admin/moderation/users/[id]/penalty/route.js:10-27`. Moderators must manually pick the next tier.
**Fix:** Auto-escalate based on `user_warnings` history within 60d.

#### T277 — Auto-hide threshold action has no audit trail — **HIGH**
**File:** `web/src/app/api/reports/route.js:62-76`. Auto-hide doesn't call `recordAdminAction()`; threshold edits are silent.
**Fix:** Wrap auto-hide in audit; log threshold-config changes.

#### T278 — No CSAM reporting / NCMEC path — **HIGH** (legal duty)
**File:** Codebase-wide. `/api/reports` accepts free text; no urgent severity, no fast-lane, no NCMEC integration.
**Fix:** Add `reason: 'csam' | 'child_exploitation' | 'grooming'` enum on kids-surface reports; auto-prioritize + on-call alert; CyberTipline footer link.

#### T279 — Comment hide doesn't redact body (subpoena exposure) — **HIGH**
**File:** `web/src/app/api/admin/moderation/comments/[id]/hide/route.js:39-48`. `status='hidden'` only; body remains queryable in DB.
**Fix:** Two modes — "hide" (preserve for audit) vs "redact" (overwrite body, keep meta). Log mode chosen.

#### T280 — Comment-edit window unbounded; edit-after-quote vector — **MEDIUM**
**File:** `web/src/app/api/comments/[id]/route.js:10-52`. Users can edit indefinitely.
**Fix:** Freeze edits after 10 min OR persist `comment_edits` history with "Edited" badge.

#### T281 — Reporter rate limit per-user only, no per-target anti-brigading — **MEDIUM**
**File:** `web/src/app/api/comments/[id]/report/route.js:32-43`. Same target reportable 10×/hr by single user.
**Fix:** Extend rate-limit key with `target_user_id`; cap at 3/day same target.

#### T282 — Block scope hides DMs/comments only, not leaderboard/profile/expert-Q&A — **MEDIUM**
**File:** `web/src/app/api/users/blocked/route.js`. Pairs with T17.
**Fix:** Extend block to hide mentions, expert responses, leaderboard, public profile.

#### T283 — Conversation-start error codes leak user-existence (enumeration) — **MEDIUM**
**File:** `web/src/app/api/conversations/route.js:60-84`. `USER_NOT_FOUND` (404) vs `DM_PAID_PLAN` (403) distinguishes existence.
**Fix:** Return uniform 403 for "cannot DM"; rate-limit by `other_user_id`.

#### T284 — Expert credential expiry has no auto-revoke — **MEDIUM**
**File:** `web/src/app/api/cron/flag-expert-reverifications/route.js:13-16`. Flags only; expired experts keep badge.
**Fix:** Second cron at expiry+35d auto-revokes; require re-approval.

#### T285 — Web comment report uses free text; iOS uses structured — **MEDIUM** *(pairs with T32)*
**File:** `web/src/app/api/comments/[id]/report/route.js:45-46`. Pairs with T32.
**Fix:** Server-side enum validation; UI category picker on web.

#### T286 — De-platforming appeal process not documented in TOS or in-app — **LOW**
**File:** `web/src/app/api/appeals/route.js:8-62`. Banned user has no easy path to find appeal flow.
**Fix:** In-app banner on mute/ban: "You can appeal." + TOS section "Right to Appeal."

#### T287 — No system-wide kill-switch UI for comments / expert Q&A — **LOW**
**File:** `web/src/lib/featureFlags.js`. `v2LiveGuard()` exists but no admin-facing toggle UI.
**Fix:** `/admin/system-controls` with pause toggles + audit-logged enable/disable.

### Page Walkthrough (T288-T297)

#### T288 — Cookies page describes UI that doesn't exist — **HIGH**
**File:** `web/src/app/cookies/page.tsx:117`. Promises "consent banner appears on first visit" — no banner exists. Pairs with T2 (cookie consent).
**Fix:** Bundle copy edit with T2 implementation.

#### T289 — Accessibility page claims "skip-to-content links provided on every page" — false — **MEDIUM**
**File:** `web/src/app/accessibility/page.tsx:134-135`. Repo grep finds no skip-link implementation.
**Fix:** Implement `<a href="#main">Skip to content</a>` in layout, OR remove the claim.

#### T290 — Accessibility page directs users to "display settings" for high-contrast (wrong) — **MEDIUM**
**File:** `web/src/app/accessibility/page.tsx:93`. Setting actually lives in `/profile/settings`.
**Fix:** "Enable in Account Settings → Display → High Contrast." Pairs with T63.

#### T291 — Help page omits Ask-an-Expert from Verity tier feature list — **MEDIUM** (truth-in-pricing)
**File:** `web/src/app/help/page.tsx:96-98`. Lists ads/bookmarks/quiz/TTS/DMs/follows; no expert access mentioned.
**Fix:** Confirm whether Verity tier includes expert access; update copy to match.

#### T292 — Admin hub uses internal jargon "F7-native editor" — **MEDIUM** (admin clarity)
**File:** `web/src/app/admin/page.tsx:32`. F7 is a project-internal codename.
**Fix:** Replace with plain "integrated editor" or "newsroom editor."

#### T293 — Notifications without `action_url` render dead anchors `href="#"` — **LOW**
**File:** `web/src/app/notifications/page.tsx:419`. Tappable but goes nowhere.
**Fix:** Render as button (not link) when `action_url` is null.

#### T294 — Reset-password hash detection allows query-string match — **MEDIUM**
**File:** `web/src/app/reset-password/page.tsx:69`. `hash.includes('access_token=')` matches `?access_token=foo` in query string too.
**Fix:** Parse `window.location.hash` strictly.

#### T295 — Help page price fallback hides Stripe-fetch failure — **MEDIUM**
**File:** `web/src/app/help/page.tsx:28-31`. Falls back silently to hardcoded `$3.99/$9.99/$14.99`.
**Fix:** Log the fetch failure to Sentry / banner; don't ship stale prices unnoticed.

#### T296 — `/ideas` page hardcodes `localhost:3333` reference — **LOW** (info leak)
**File:** `web/src/app/ideas/page.tsx:147`. Visible string referencing dev port.
**Fix:** Make environment-aware or remove the line.

#### T297 — Contact form email validation is `email.includes('@')` — **LOW**
**File:** `web/src/app/contact/page.tsx:89`. `a@` and `@b` pass.
**Fix:** Use `<input type="email">` HTML validation OR a proper regex.

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
