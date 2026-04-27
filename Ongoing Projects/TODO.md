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

---

## HIGH — close before launch quality bar

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

### T60 — iOS Expert settings save to nowhere — **MEDIUM** (likely dead UI)
**File:** `VerityPost/VerityPost/SettingsView.swift:2330-2436` writes `users.metadata.expert`. Web expert queue / back-channel only consult permissions/categories — no consumer for `metadata.expert` outside this settings page.
**Fix:** Wire queue routing / expert notifications to `metadata.expert`, OR remove the screen.
**Recommendation:** Verify any backend RPC reads it before deleting. If not, **delete** — fake-functional settings are worse than missing settings.

---

## LOW — opportunistic

### T66 — iOS bookmarks empty-state CTA is a dead button — **LOW**
**File:** `VerityPost/VerityPost/BookmarksView.swift:212-228` (verified — button action is just `// Would navigate back to home; tab bar handles the actual swap.`).
**Fix:** Wire the button to switch tabs to Home/Find, OR replace with static guidance.

---

## OPERATIONAL DEBT

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

#### T109 — No read/unread state on home feed cards — **MEDIUM** (return-visit)
**File:** `web/src/app/page.tsx` (no read-state metadata on supporting cards); iOS `HomeView.swift` same.
**Problem:** Returning user can't tell at a glance which articles they've already read. Wastes scan time.
**Fix:** When `read_state` row exists for the user, render the article card title in dimmer color + a subtle "Read" tag. Persist on quiz attempt or 80%-scroll.
**Recommendation:** Already have `reading_log` data; surface it visually. Pair with T91.

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

#### T126 — iOS onboarding "Skip" on every screen — **LOW**
**File:** `VerityPost/VerityPost/WelcomeView.swift:35` (Skip button visible on all 3 screens unconditionally).
**Problem:** User can skip from screen 0 immediately, bypassing the Read/Quiz/Discuss preview, landing on Home with no orientation.
**Fix:** Hide Skip on screens 0 and 1; show only on the final screen (matches typical iOS onboarding pattern).
**Recommendation:** Get the value across before allowing skip.

---

## PROFESSIONAL SWEEP 2026-04-26

5 lenses applied: UI/UX manager, engagement/retention lead, senior frontend dev, senior backend dev, senior iOS dev. ~79 new findings, deduped against T1-T126. Each tagged with source lens. Numbered T127+ continuing the sequence.

### UI/UX Manager (T127-T139)

#### T131 — iOS comment vote buttons missing visual disabled-when-active state — **MEDIUM** (UX)
**File:** `VerityPost/VerityPost/StoryDetailView.swift:~1800-1860`. `active: Bool` parameter passed but no visual differentiation.
**Fix:** Apply `.disabled(already_voted)` or opacity/color when `active`.

#### T137 — iOS email input lacks client-side format validation — **LOW** (UX)
**File:** `VerityPost/VerityPost/SettingsView.swift:1391-1452`. Server-side only; user submits invalid → server rejection.
**Fix:** Inline regex check in `onChange`, gray ✓ / red "Invalid email" hint.

#### T139 — Audit error handling pattern across iOS Settings subpages — **MEDIUM** (UX consistency)
**File:** `VerityPost/VerityPost/SettingsView.swift:1958-2040, 2090-2142, 2393-2436`. Multiple subpages use `try?` + `Log.d` swallow pattern. (Partially overlaps T44/T45 but broader.)
**Fix:** Standardize on the profile-editor red-banner pattern across all settings subpages.

### Engagement / Retention (T140-T154)

#### T148 — iOS Alerts shows Manage tab to anon, lands on disabled state — **MEDIUM** (UX)
**File:** `VerityPost/VerityPost/AlertsView.swift:137-150,29-32`. Two tabs visible; Manage tab is disabled placeholder.
**Fix:** Hide Manage for anon. On signed-in first visit, jump to Manage to onboard category selection.

#### T165 — 90+ inline `CSSProperties` objects, no stylesheet/Tailwind/CSS modules — **LOW** (maintainability)
**File:** Across `web/src/components/`, `web/src/app/`. Maintenance burden, bundle size cost.
**Fix:** Migrate critical components to CSS modules; consider Tailwind for new work.

#### T166 — Zero `data-testid` attributes in codebase — **LOW** (testability)
**Problem:** No test selectors; e2e tests are brittle.
**Fix:** Add `data-testid` to key interactive elements as new tests are written.

#### T167 — Hard-coded user-facing strings throughout web — **LOW** (i18n readiness)
**Example:** `web/src/components/CommentComposer.tsx:97` — "Mentions are available on paid plans...".
**Fix:** Move to a constants module; foundation for future i18n.

#### T173 — Comment body length not capped at app layer — **LOW** (defense-in-depth)
**File:** `web/src/app/api/comments/route.js` — verification: no app-layer length check; the `post_comment` RPC may enforce length but its body wasn't inspected. **MCP-verify-first** before deciding whether app-layer cap is duplicative or genuinely missing.
**Fix:** If RPC enforces, mirror at app layer with same threshold for fast-fail UX. If RPC doesn't enforce, app-layer cap is required.

#### T174 — Apple App Store webhook idempotency pattern differs from Stripe — **LOW** (defense)
**File:** `web/src/app/api/ios/appstore/notifications/route.js:121-126`. Verification: the route checks `prior.processing_status === 'received'` and reclaims only if `ageMs < 5 * 60 * 1000` (i.e., still in concurrent window). Older rows short-circuit. Original "can re-run" framing was imprecise. The substantive gap is just consistency with Stripe's `in('processing_status', [...])` guard pattern at `webhook/route.js:130-136`.
**Fix:** Align with Stripe pattern for consistency, even though current behavior is safe. Pure defense-in-depth.

#### T177 — Sensitive routes don't enforce recent re-auth (`auth_time`) — **LOW** (OWASP-class hardening)
**File:** `/api/auth/email-change`, `/api/billing/cancel`, etc. Hours-old session can mutate sensitive state.
**Fix:** Reject sensitive routes if `auth_time > 15min`. Requires `/api/auth/re-verify` route.
**Note:** Magic-link auth shape changes this — see AUTH-MIGRATION; revisit post-migration.

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

#### T200 — Signup username retry loop wastes 300ms on permanent errors — **LOW** (UX)
**File:** `VerityPost/VerityPost/AuthViewModel.swift:312-331`. Verification: early-break logic exists (`guard msg.contains("p0002") || msg.contains("not found") else { break }`), so non-transient errors break after first attempt. Remaining waste is 300ms on the first attempt before the break — minor. Pre-AUTH-MIGRATION concern only; magic-link reshapes the signup flow.
**Fix:** Skip the initial 300ms sleep entirely on permanent errors; match error message for "reserved"/"taken" pre-RPC.

---

## EXTERNAL SWEEPS 2026-04-26

10 specialist lenses applied: Security, Performance, DevOps/SRE, Product/Editorial, Mobile QA, iOS Implementation Manager, Attorney, Kids COPPA Specialist, Trust & Safety, Page Walkthrough. Each was instructed to verify before reporting and dropped unverified items. Findings deduped against existing T1-T201 and Pre-Launch Assessment. Numbered T202+ continuing the sequence.

Items below already moved to Pre-Launch Assessment (Apple/Sentry/COPPA-CRITICAL): M4→A12, M5→A13, M12→A1, L7→A9, C4→K1, C8→K9, C2/L10→new K11, plus Sentry items folded into S1-S5. Kids-COPPA-CRITICAL items C1, C5, C6 added to Pre-Launch as K12-K14 (see Pre-Launch Assessment for those).

### Security (T202-T214)

#### T206 — Deep-link `setSession()` not validated against Supabase issuer/audience — **HIGH**
**File:** `VerityPost/VerityPost/AuthViewModel.swift:377-407`. `verity://` URL scheme is registered; attacker can craft a deep-link with fake `access_token`/`refresh_token` and the app calls `setSession()` blindly.
**Fix:** After `setSession()`, immediately call `auth.getUser()` to validate; reject + clear session on failure. Validate `aud`/`iss` claims if available.

#### T207 — DOMPurify SSR fallback returns input unsanitized — **MEDIUM**
**File:** `web/src/app/expert-queue/page.tsx:11-18`. `dompurify` is browser-only; if any future state path renders `dangerouslySetInnerHTML` server-side, sanitize is a no-op.
**Fix:** Move markdown rendering to server-only path with `sanitize-html`, or always guard with `typeof window !== 'undefined'` at the inject point.

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

#### T233 — Hard-delete on articles, no soft-delete window — **HIGH**
**File:** `web/src/app/api/admin/articles/[id]/route.ts:611`. `.delete()` removes permanently; audit log writes after delete (orphan if persist fails).
**Fix:** Soft-delete via `deleted_at`; write audit before mutation; cron purges after 30 days.

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

#### T267 — AI-generated content disclosure missing (EU AI Act + CA AB 2655) — **HIGH**
**File:** `privacy/page.tsx:85-88` mentions AI processing but no end-user-facing disclosure on stories.
**Fix:** Wire `is_ai_generated` flag to a story-page label "Summary generated with AI assistance"; update privacy policy to cite EU AI Act Article 50 + AB 2655 compliance.

#### T268 — DMCA designated agent registration with US Copyright Office unverified — **HIGH** (safe harbor)
**File:** `dmca/page.tsx:119`. Lists `legal@veritypost.com` only; no Copyright Office registration number cited.
**Fix:** Register agent at copyright.gov/dmca-agent (free, ~10 min); update DMCA page with registration number.

#### T271 — Missing choice-of-law clause — **LOW** (contract enforceability)
**File:** `terms/page.tsx`. No "Governing Law" section.
**Fix:** Add: "Governed by laws of [Delaware/California], exclusive jurisdiction in [county/state]."

#### T272 — Accessibility statement page absent (ADA defense) — **MEDIUM**
**File:** `web/src/app/accessibility/page.tsx` exists but lacks formal Accessibility Statement (WCAG commitment + known limitations + contact).
**Fix:** Add statement section: WCAG 2.1 AA commitment + accessibility@veritypost.com contact.

#### T282 — Block scope hides DMs/comments only, not leaderboard/profile/expert-Q&A — **MEDIUM**
**File:** `web/src/app/api/users/blocked/route.js`. Pairs with T17.
**Fix:** Extend block to hide mentions, expert responses, leaderboard, public profile.

#### T284 — Expert credential expiry has no auto-revoke — **MEDIUM**
**File:** `web/src/app/api/cron/flag-expert-reverifications/route.js:13-16`. Flags only; expired experts keep badge.
**Fix:** Second cron at expiry+35d auto-revokes; require re-approval.

#### T285 — Web comment report uses free text; iOS uses structured — **MEDIUM** *(pairs with T32)*
**File:** `web/src/app/api/comments/[id]/report/route.js:45-46`. Pairs with T32.
**Fix:** Server-side enum validation; UI category picker on web.

#### T287 — No system-wide kill-switch UI for comments / expert Q&A — **LOW**
**File:** `web/src/lib/featureFlags.js`. `v2LiveGuard()` exists but no admin-facing toggle UI.
**Fix:** `/admin/system-controls` with pause toggles + audit-logged enable/disable.

### Page Walkthrough (T288-T297)

#### T291 — Help page omits Ask-an-Expert from Verity tier feature list — **MEDIUM** (truth-in-pricing)
**File:** `web/src/app/help/page.tsx:96-98`. Lists ads/bookmarks/quiz/TTS/DMs/follows; no expert access mentioned.
**Fix:** Confirm whether Verity tier includes expert access; update copy to match.


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
