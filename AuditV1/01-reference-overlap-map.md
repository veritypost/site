# Session 1 — Reference/ tree, full content audit

**Date:** 2026-04-25
**Files read end-to-end (15):** `STATUS.md`, `CLAUDE.md`, `README.md`, `CHANGELOG.md`, `FEATURE_LEDGER.md`, `PM_ROLE.md`, `Verity_Post_Design_Decisions.md`, `08-scoring-system-reference.md`, `ROTATIONS.md`, `parity/{README,Shared,Web-Only,iOS-Only}.md`, `runbooks/{CUTOVER,ROTATE_SECRETS}.md`.
**Not read:** `Reference/education_site_sources_1.xlsx` (binary).
**Total:** ~3,400 lines.

---

## Topic map (every concept that appears in 2+ Reference/ files)

### T1. The repo tree / folder layout

| File:section | Says | Currency |
|---|---|---|
| `CLAUDE.md` lines 75–164 | Full ASCII tree. Path `web/`, `VerityPost/`, `VerityPostKids/`, `schema/`, `Reference/`, `Current Projects/`, `Future/Unconfirmed/Completed Projects/`, `Sessions/`, `Archived/`, `scripts/`, `supabase/`. References `schema/100_backfill_admin_rank_rpcs_*.sql` ← doesn't exist on disk (verified). | CANONICAL with one stale ref |
| `PM_ROLE.md` lines 215–298 | Different ASCII tree. Calls itself "post 2026-04-21 reorg." Lists `Current Projects/FIX_SESSION_1.md` ← retired per its own line 458 supersede note. | STALE — points at retired tracker |
| `README.md` lines 12–22 | Table-form tree. Lists `test-data/` (retired per PM_ROLE.md line 399) and `docs/` (retired per CHANGELOG.md). Says VerityPost is "currently unified: adult + kid mode" (kid mode removed per CHANGELOG). Says `(kids iOS doesn't exist yet — see VerityPostKids/README.md)` line 49. | FULLY STALE — wrong on 4 separate facts |
| `parity/README.md` line 11 | References `../04-Ops/PROJECT_STATUS.md` | DEAD LINK — path doesn't exist |

**Verdict:** CLAUDE.md tree section is the only one to keep; remove its `100_backfill_*` line. PM_ROLE's tree section is duplicate + stale. README's tree section is wrong on every kid/iOS line.

### T2. The `lib/` machinery list

| File:section | What's listed |
|---|---|
| `STATUS.md` lines 45–66 | 13 files: middleware.js, auth.js, permissions.js, roles.js, rateLimit.js, supabase/server.ts, **adminMutation.ts, apiErrors.js, siteUrl.js, stripe.js, appleReceipt.js, kidPin.js, cronAuth.js**, plus pipeline/. Most comprehensive. |
| `CLAUDE.md` lines 166–176 + 167–173 | 8 files: auth, permissions, roles, plans, rateLimit, supabase/{client,server}, featureFlags. Subset of STATUS. |
| `PM_ROLE.md` lines 372–390 | 14 files: auth, permissions, roles, plans, rateLimit, supabase/{client,server} **(.js extension — wrong, it's .ts)**, **scoring.js, track.ts, trackServer.ts, useTrack.ts, events/types.ts, botDetect.ts**, middleware, layout, Ad.jsx, AdSenseSlot.tsx, GAListener.tsx. |

**Disagreements:**
- PM_ROLE says `lib/supabase/{client,server}.js` — actual is `.ts` (verified earlier).
- The 3 lists overlap on 6 core files; STATUS adds 5 unique; PM_ROLE adds 6 unique. None of the "unique" files are wrong — they're just different curations.

**Verdict:** Three different handpicked summaries of the same machinery layer. Pick one, point the others at it.

### T3. Auth topology (web + adult iOS GoTrue; kids iOS custom JWT)

| File:line | Quote |
|---|---|
| `CLAUDE.md` line 64 | "Auth topology: web + adult iOS use GoTrue sessions. Kids iOS uses a server-signed custom JWT with `is_kid_delegated: true` and `kid_profile_id` claims — RLS branches on those claims. The kid JWT never touches GoTrue." |
| `STATUS.md` lines 42–43 | "Adult iOS + web use GoTrue sessions. Kids iOS uses a server-minted custom JWT with `is_kid_delegated: true` + `kid_profile_id` claims; RLS branches on those claims. Kid JWT never touches GoTrue." |
| `README.md` line 16 | "VerityPostKids/ — SwiftUI Kids iOS app — pair-code auth via custom JWT" — abbreviated. |

**Verdict:** CLAUDE and STATUS are paragraph-level duplicates. Same content, slightly different word order. Pick one.

### T4. Permissions xlsx ↔ DB sync rule

| File:line | Coverage |
|---|---|
| `CLAUDE.md` lines 195–215 | Full rule — path, sync tool, edit-then-apply discipline, reconcile rule. |
| `STATUS.md` line 35 | One-liner: "Sync: `scripts/import-permissions.js --apply`. xlsx and DB must stay 1:1." |
| `PM_ROLE.md` lines 113–126 + 343 + 414 | Three separate copies inside the same file — anti-hallucination rule, must-read table, sources-of-truth map. |

**Verdict:** CLAUDE.md is canonical. STATUS one-liner is fine as a pointer. PM_ROLE has three internal copies of the same rule. Should be one with two pointers.

### T5. Workflow / how-the-assistant-operates (the major conflict)

This is the most important contradiction in the Reference/ tree.

| File:section | Mode it describes |
|---|---|
| `CLAUDE.md` lines 1–7 | "You are the owner's thinking brain on this project. You operate as a master of this stack, not an assistant asking permission." Frames assistant as **hands-on, edits code, runs SQL.** |
| `CLAUDE.md` lines 235–246 | "How work enters: Owner drops a bug → you ADD an item to MASTER_TRIAGE… Owner names a task → classify risk, execute." Hands-on. |
| `PM_ROLE.md` lines 33–41 | **"Precedence clause: When CLAUDE.md and this file conflict on role or scope — e.g., CLAUDE.md framing the assistant as 'hands-on thinking brain' that edits code directly vs. this file framing the assistant as orchestrator-only — PM_ROLE.md wins."** |
| `PM_ROLE.md` lines 43–86 | "You do not touch code. You do not edit files. You do not run SQL. You orchestrate." Mandates 4-agent flow before any non-trivial change, 4/4 unanimous before greenlight. |
| `PM_ROLE.md` lines 197–207 | "Invariants: You are the PM. Agents do investigation and code. You never Edit, Write, or run SQL directly." |

**This is a real, irreconcilable doc-level conflict.** CLAUDE.md frames a hands-on engineer; PM_ROLE.md frames a strict orchestrator who never touches code. PM_ROLE.md asserts it wins. The two files describe different jobs. Today's session has been operating in CLAUDE.md mode (hands-on, ad-hoc agent dispatches, no 4/4 unanimous votes), so in practice CLAUDE.md is winning. PM_ROLE.md is shadow-canonical and ignored.

### T6. Sources of truth list

| File:section | List |
|---|---|
| `PM_ROLE.md` lines 410–422 | Most complete: permissions matrix → xlsx, schema shape → reset_and_rebuild_v2, incremental DB → numbered migrations, runtime → Supabase live, code history → git, product intent → owner + CLAUDE, "what shipped recently" → owner + git (don't quote DONE.md), "what's broken" → 4-agent verification round. |
| `CLAUDE.md` lines 195–201 + 203–215 | "DB is the default" rule + xlsx-DB rule. Implicit sources-of-truth via the "What you always know" section (line 67–73). |
| `STATUS.md` line 35 | xlsx-DB rule one-liner. |

**Verdict:** PM_ROLE has the only structured sources-of-truth list. Move it to CLAUDE.md (or STATUS.md), retire from PM_ROLE if PM_ROLE itself is being retired.

### T7. The schema/109 disaster + scoring system

| File | Coverage |
|---|---|
| `08-scoring-system-reference.md` | **Canonical.** Full post-mortem + extension guide. 298 lines, every claim cited to file:line. |
| `PM_ROLE.md` lines 158–179 | Anti-hallucination "specific traps" section — narrative version of the same incident. |
| `CHANGELOG.md` | Doesn't mention 109/111 directly. |

**Verdict:** Two tellings of the same story; 08-scoring is the technical reference, PM_ROLE is the cautionary tale. Different audiences, low overlap, both legitimate. Keep both.

### T8. Test accounts count

- `CLAUDE.md` line 313: "19 test + 30 community + 2 kids"
- `STATUS.md` line 89: "After superadmin removal (TODO #1): 19 test + 30 community + 2 kids"
- `CHANGELOG.md` line 48: "Test account count: 20 → 19"

**Verdict:** Three consistent statements of the same fact. Pick one.

### T9. CSP enforcement state

| File:line | Says |
|---|---|
| `CLAUDE.md` line 49 | "auth + CORS + CSP (enforce) + /kids/* redirect" |
| `PM_ROLE.md` line 385 | "Auth, CSP (Report-Only), CORS, kids redirect, coming-soon gate" |
| `PM_PUNCHLIST_2026-04-24.md` line 59 | "CSP still Report-Only at web/src/middleware.js:188 (#00-F)" |

**Real disagreement.** CLAUDE says CSP is enforced. PM_ROLE + PM_PUNCHLIST say Report-Only. Need to read `web/src/middleware.js:188` directly to settle. Until then: assume Report-Only based on two-vs-one + the punch list specifically flagging it.

### T10. Latest schema migration

- `STATUS.md` line 7 references `schema/177`.
- `CLAUDE.md` "schema/" tree section references `schema/100_backfill_admin_rank_rpcs_*.sql` as a real file (doesn't exist).
- `README.md` line 17: "migrations (005–094)" (latest is 177 — README is 83 migrations behind).
- `PM_ROLE.md` lines 348–358: lists migrations 105–111 as "recent." Latest in that list is 111 (current is 177 — PM_ROLE is 66 migrations behind).
- `CUTOVER.md` line 38–46: refers to "schema/NNN_*.sql" generically; doesn't claim a number.

**Verdict:** STATUS.md is current. CLAUDE has one stale file ref. README and PM_ROLE both massively stale.

### T11. Web framework version

- `STATUS.md` line 17: "Next.js 14 app router" → matches `web/package.json` (`^14.2.0` per earlier audit).
- `PM_ROLE.md` line 280: "Next.js 15 app router" → wrong.
- `CLAUDE.md` does not specify version (says "Next.js app router (version declared in `web/package.json`)" — line 60). Punts to package.json. Safest.

**Real disagreement.** PM_ROLE has the wrong major version.

### T12. Admin lockdown (`@admin-verified` markers)

| File | Says |
|---|---|
| `CLAUDE.md` line 232 | No `@admin-verified` mentioned. Says "Admin code = highest blast radius. Every change in [admin paths] runs the 6-agent ship pattern. No exceptions, no special markers — the rule applies categorically." Explicitly **denies** marker usage. |
| `FEATURE_LEDGER.md` lines 471–489 | Has `// @admin-verified 2026-04-18` as the seal for 66 LOCKED admin files. Treats marker as authoritative. |
| `README.md` line 36 | "Admin files... carry `@admin-verified 2026-04-18` — LOCKED, don't modify without explicit approval." |
| Memory `feedback_admin_marker_dropped.md` | Markers dropped 2026-04-23. |

**Real disagreement.** Two docs (FEATURE_LEDGER, README) treat the marker as live; one doc (CLAUDE) and memory say it's retired.

### T13. Apple Developer account state

| File | Says |
|---|---|
| `CLAUDE.md` lines 87–91 | "Current Apple block: the owner does not yet have an Apple Developer account." |
| `OWNER_TODO_2026-04-24.md` TODO-4 | "Start Apple Developer enrollment — Apple review takes days to weeks." |
| `ROTATIONS.md` lines 7–25 | Apple Sign In With Apple JWT "Last rotated: 2026-04-23. Next rotation due: 2026-10-23." Apple APNs Auth Key "Key ID: 8WQ2K66T63. Stored in: ~/Desktop/AuthKey_8WQ2K66T63.p8 + Vercel env." Apple Service ID, App IDs, Team ID `FQCAS829U7` all listed as set up. |

**Real disagreement.** Three docs say no developer account; one doc says credentials are set up and rotated. Either ROTATIONS describes future state, or there's a personal/non-Developer-Program Apple ID with these credentials, or one of the others is wrong.

### T14. Vercel deploy on push

| File | Says |
|---|---|
| `STATUS.md` line 22 | "Hosting: Vercel — Deploys on push to main (verified 2026-04-21)." |
| `runbooks/CUTOVER.md` lines 80–82 | "Vercel's Ignored Build Step is ON by default for this project, so auto-deploy on push is disabled. Manual `vercel --prod` is the only way to ship." |

**Real disagreement.** Direct contradiction on whether deploys are auto or manual. Could be true that auto was turned on after CUTOVER.md was last edited (2026-04-20). Verify with Vercel dashboard.

### T15. Kid mode in adult iOS (VerityPost vs VerityPostKids)

| File | Says |
|---|---|
| `README.md` line 15 | "VerityPost/ — SwiftUI iOS app (currently unified: adult + kid mode)." |
| `README.md` line 16 | "VerityPostKids/ — SwiftUI Kids iOS app — pair-code auth via custom JWT." |
| `README.md` line 49 | "(kids iOS doesn't exist yet — see VerityPostKids/README.md)" |
| `CLAUDE.md` line 121 | "VerityPost/ — UNIFIED adult app (kid mode removed 2026-04-19)" |
| `CHANGELOG.md` 2026-04-20 entry | Documents the kid-mode removal indirectly (changes refer to separate VerityPostKids work). |
| `parity/Shared.md` line 27 | Lists "Kids Mode (Home) /kids → KidViews.swift" — `KidViews.swift` doesn't exist in VerityPostKids (the entry there is `KidsAppRoot.swift`, verified earlier). |

**README has internal contradictions** — line 15 says VerityPost has kid mode, line 16 says kids iOS exists, line 49 says kids iOS doesn't exist. Three claims, mutually exclusive. CLAUDE is correct. parity/Shared is stale.

### T16. CHANGELOG currency

`CHANGELOG.md` has exactly one dated entry: 2026-04-20. Nothing for 2026-04-21 (reorg per PM_ROLE), 2026-04-22 (F7 Phase 4 ship per DECISIONS-LOCKED), 2026-04-23 (admin-marker drop per memory + STATUS.md ROTATIONS update), 2026-04-24 (audit), 2026-04-25 (bug-hunt session per latest log). **5 days of work undocumented.**

### T17. parity/ subfolder

| File | State |
|---|---|
| `parity/README.md` | 11 lines. Refers to `../04-Ops/PROJECT_STATUS.md` (dead link). Last refreshed 2026-04-16. |
| `parity/Shared.md` | All URLs `localhost:3333` — actual port is 3000. References `KidViews.swift` (doesn't exist). |
| `parity/Web-Only.md` | All URLs `localhost:3333`. Lists `/kids/leaderboard`, `/kids/profile`, `/kids/expert-sessions` as web routes — per CLAUDE.md, kids has no web surface. Lists `/create-post` (need to verify against web/src/app/). |
| `parity/iOS-Only.md` | Lists 14 iOS files. Doesn't list `BlockService`, `EventsClient`, `LeaderboardPeriod`, `Password`, `KidsAppLauncher` (verified to exist in iOS audit). Incomplete. |

**Whole parity/ subfolder is 9 days stale** with multiple wrong-fact errors. Either rebuild from current state or retire entirely (the iOS audit + STATUS.md cover the same parity territory at file resolution).

### T18. CUTOVER references

`runbooks/CUTOVER.md`:
- Line 11: References `/TODO.md §OWNER` — TODO.md retired per PM_ROLE.md and CHANGELOG.
- Line 81: Vercel manual-deploy claim conflicts with STATUS.md (T14).
- Line 95: Step 5 says "TBD — smoke test needs redesign." Self-acknowledges incompleteness. References retired walkthrough doc.
- Line 5: References `Archived/2026-04-20-consolidation/CUTOVER.md.old` — fine, that's archived properly.

### T19. ROTATE_SECRETS context staleness

`runbooks/ROTATE_SECRETS.md`:
- Line 10–11: "No git history exists in this tree yet (no `.git/` at root and no `.gitignore` prior to Chunk 1)" — false today; repo has hundreds of commits.
- Line 94: "Create web/.env.example" — already exists per web/config audit (5.5K).
- Line 89–96: Sign-off checklist all unchecked. Per `OWNER_ACTIONS_2026-04-24.md` O-INFRA-05 (Stripe audit pending) and O-INFRA-01 (Supabase URL typo to fix) and the Sentry-deferred memory entry, it looks like rotation hasn't been completed. But the doc reads like an audit-time artifact, not a live runbook.
- The whole doc is duplicated in scope with `ROTATIONS.md` — ROTATIONS describes credentials + cadence, ROTATE_SECRETS describes a one-time rotation procedure. Different but adjacent.

### T20. Decision count and tier table

`Verity_Post_Design_Decisions.md` has 44 decisions. Internal consistency check:
- D10 (line 134–151): 4 tiers (Free, Verity, Verity Pro, Verity Family) at $0/$3.99/$9.99/$14.99.
- D34 (line 506–532): 5 tiers — adds Verity Family XL at $19.99.
- D42 (line 635–652): Annual table lists all 4 of D10 + Family XL = 5 tiers.

D10's table is incomplete relative to D34's update. Not a contradiction — D10 is earlier, D34 evolves it — but a reader hitting D10 first gets the wrong tier list. A 1-line "see also D34" addendum on D10 fixes it.

### T21. CLAUDE.md self-consistency

CLAUDE.md is internally mostly consistent. One stale ref: `schema/100_backfill_admin_rank_rpcs_*.sql` (line 138, doesn't exist). Otherwise the document is current.

### T22. STATUS.md self-consistency

STATUS.md is the most current Reference/ doc. No internal contradictions found in the 97 lines.

### T23. FEATURE_LEDGER currency

Header says "Last updated 2026-04-18." Body has strikethrough/RESOLVED edits dated through 2026-04-19 (Round 5/6). So the header date is wrong by at least 1 day. Doc has been touched in-place after the header was set. The ~~strikethrough~~ resolution edits suggest active maintenance; the header date suggests freeze. Mixed signal.

928-permission claim is dated to 2026-04-19. A week of subsequent migrations + permission work has happened. Number is plausibly stale.

### T24. ROTATIONS vs ROTATE_SECRETS

Both touch the same domain. ROTATIONS.md is current, dated, lightweight, useful (next-due tracking). ROTATE_SECRETS.md is a frozen one-time procedure from when secrets were found in plaintext. Different purposes, low overlap (each has unique content), but a reader looking for "how do I rotate" hits both with no clear pointer between them.

---

## Confident bucket — Reference/ only

Things I am confident about. These are eligible for execution as soon as the owner says go.

1. `Reference/README.md` is fully stale and should be rewritten or deleted. Internal contradictions on whether kids iOS exists; references three retired things (`WORKING.md`, `docs/`, `test-data/`); migration count off by 83; admin-marker reference outdated. No useful unique content survives.
2. `Reference/parity/` (4 files) is 9 days stale. Wrong port, wrong filenames, wrong route ownership. Either rebuild from current code or retire entirely — STATUS.md and the iOS audits already provide parity at finer resolution.
3. `Reference/PM_ROLE.md` repo-tree section (lines 215–298) duplicates CLAUDE.md's tree with additional staleness. Drop or replace with a pointer.
4. `Reference/PM_ROLE.md` recent-migrations section (lines 348–358) is 66 migrations behind. Drop.
5. `Reference/PM_ROLE.md` "First task when you take over" + "Known outstanding items at handover" sections (lines 425–533) point at retired `FIX_SESSION_1.md`. Drop or repoint.
6. `Reference/PM_ROLE.md` "Next.js 15" (line 280) is wrong. Change to "Next.js 14" or punt to package.json.
7. `Reference/PM_ROLE.md` `lib/supabase/{client,server}.js` (line 380) is wrong extension. Change to `.ts`.
8. `Reference/CLAUDE.md` line 138 references `schema/100_backfill_admin_rank_rpcs_*.sql` which doesn't exist. Remove the line.
9. `Reference/CLAUDE.md` line 49 says CSP is "enforce"d. Per PM_PUNCHLIST and PM_ROLE, it's still Report-Only. Change to "Report-Only" or fix the middleware first.
10. `Reference/CHANGELOG.md` is 5 days behind. No entry for 04-21, 04-22, 04-23, 04-24, 04-25 sessions. Either backfill or repurpose: STATUS.md + MASTER_TRIAGE SHIPPED blocks + session logs cover the same ground; CHANGELOG may be redundant entirely.
11. `Reference/runbooks/CUTOVER.md` line 11 references `/TODO.md` which doesn't exist. Repoint to MASTER_TRIAGE or inline the checklist.
12. `Reference/runbooks/ROTATE_SECRETS.md` line 10–11 ("no git history exists in this tree yet") was true at audit time; today the tree has hundreds of commits. Drop the paragraph or rewrite as historical context.
13. `Reference/runbooks/ROTATE_SECRETS.md` line 94 says create `site/.env.example`. Should be `web/.env.example`. (Already exists per web audit; line is doubly wrong.)
14. `Reference/Verity_Post_Design_Decisions.md` D10 tier table is incomplete — add a "see also D34" pointer to surface Family XL.
15. Permissions xlsx ↔ DB sync rule appears verbatim in CLAUDE.md (canonical), STATUS.md (one-liner), and PM_ROLE.md (three internal copies). Pick one of CLAUDE.md or STATUS.md, retire the others to pointers.
16. Auth topology paragraph appears verbatim in CLAUDE.md and STATUS.md. Same — pick one.
17. Admin-mutation route shape paragraph appears verbatim in CLAUDE.md (lines 177–187) and STATUS.md (lines 72–79). Same.
18. Test-accounts-count claim ("19 test + 30 community + 2 kids") appears 3x. Same.
19. Rate-limit philosophy "fail-closed prod, fail-open dev" appears 3x. Same.

### What can be retired entirely from Reference/ given the above

- `Reference/README.md` — nothing in it survives that isn't said better elsewhere. Either rewrite as a pure "start here" pointer (10 lines: STATUS first, CLAUDE second, MASTER_TRIAGE third) or delete.
- `Reference/parity/` (4 files) — superseded by STATUS.md "Platforms" table + the iOS file audits + web/src/app inventory. Can retire as a folder.
- `Reference/PM_ROLE.md` — depends on whether the assistant should operate in PM mode at all (see I-1 below). If yes, the doc needs a deep rewrite. If no, retire the file.
- `Reference/CHANGELOG.md` — value redundant with `MASTER_TRIAGE` SHIPPED blocks + session logs. Could retire.
- `Reference/runbooks/ROTATE_SECRETS.md` — describes a one-time procedure that's either done or stale. If done, retire. If not done, rewrite as a current-state checklist.

---

## Inconsistent bucket — needs owner ruling

Things where the docs actively disagree on what's true, and reading more docs won't resolve it. These are the "fresh-session brief" candidates.

### I-1. PM mode vs hands-on mode (T5)

`PM_ROLE.md` asserts a strict orchestrator-only workflow with a 4/4-agent unanimous-greenlight gate. `CLAUDE.md` frames the assistant as a hands-on engineer who edits code directly. `PM_ROLE.md` has an explicit precedence clause saying it wins when they conflict. **Today's session has been operating in `CLAUDE.md` mode** — the owner has asked the assistant to do work directly, not to orchestrate 4-agent unanimous votes. If `PM_ROLE.md` is the actual operating mode the owner wants, this whole session has been off-spec. If `CLAUDE.md` is the actual mode, then `PM_ROLE.md` is shadow-canonical and should be retired or renamed.

**Question for owner:** which mode wins, and is the other file retired?

### I-2. CSP enforcement state (T9)

CLAUDE.md says enforced. PM_ROLE + PM_PUNCHLIST say Report-Only. The middleware code at `web/src/middleware.js:188` is the tiebreaker — not read in this session. **Will resolve by code-read in a later session, not by doc-read.** Leave open.

### I-3. Apple Developer account state (T13)

CLAUDE/OWNER_TODO say no developer account; ROTATIONS lists Sign-In-With-Apple credentials + Service ID + App IDs + Team ID + APNs key as set up and recently rotated.

**Question for owner:** does the owner have an Apple Developer Program enrollment, or an individual Apple ID with the credentials listed in ROTATIONS but not enrolled in the paid Developer Program? If the latter, ROTATIONS is technically correct but the OWNER_TODO/CLAUDE language about "Apple block" is misleading.

### I-4. Vercel auto-deploy vs manual (T14)

STATUS.md says "Deploys on push to main (verified 2026-04-21)." CUTOVER.md says "Manual `vercel --prod` is the only way to ship." STATUS is dated more recent. Could be that auto-deploy was turned on between CUTOVER's write and STATUS's verification.

**Question for owner:** do pushes to main auto-deploy now? If yes, CUTOVER step 4 needs rewrite. If no, STATUS line 22 is wrong.

### I-5. `@admin-verified` marker — alive or retired? (T12)

Memory + CLAUDE say retired 2026-04-23. README + FEATURE_LEDGER treat as live. **Memory + CLAUDE win on date.** Question is whether to update README (proposed retirement anyway) and FEATURE_LEDGER's marker references. Strikethrough or clean rewrite.

### I-6. 928 permissions — still current? (T23)

Stated as 2026-04-19 in FEATURE_LEDGER, restated without date in STATUS. A week of session work since then. **Will resolve by querying the live DB in a later session.** Leave open until then.

### I-7. PM_ROLE's framing of `FIX_SESSION_1.md` (T1, in-section)

PM_ROLE.md line 458 says "A later full audit at FIX_SESSION_1.md is now the canonical tracker — read that for what's actually open." But FIX_SESSION_1 was retired and absorbed into MASTER_TRIAGE per OWNER_ACTIONS O-DESIGN-15 + STATUS.md. PM_ROLE has its own retirement note for the old handover, but not for FIX_SESSION_1's retirement.

**Mechanically resolvable** (retire FIX_SESSION_1 references, repoint to MASTER_TRIAGE) but only if PM_ROLE itself isn't being retired (see I-1).

### I-8. CHANGELOG retirement vs maintenance (T16)

5 days behind. Either it's no longer being maintained (and should be retired), or it should be brought current.

**Question for owner:** is CHANGELOG.md part of the project's discipline going forward, or has MASTER_TRIAGE SHIPPED blocks + session logs replaced it?

---

## Open questions deferred to later sessions

- **I-2** CSP state — needs `web/src/middleware.js` code read (Session 8).
- **I-6** 928-permission count — needs live Supabase query.
- **README.md `/create-post` route** mentioned in `parity/Web-Only.md` line 38 — exists or not? Verify against `web/src/app/` (Session 8).

---

## Cross-zone topics flagged but not yet mapped

These topics first appeared in Reference/ but can't be settled without reading the cross-referenced zone. Carry forward to later sessions:

- T13 Apple Dev account → also referenced in OWNER_TODO_2026-04-24.md, OWNER_ACTIONS_2026-04-24.md, and (presumably) F7-DECISIONS-LOCKED Apple-MFK section. Cross-check Session 2/3.
- T14 Vercel deploy → also in STATUS.md and CUTOVER.md. No other cross-refs found in Reference/. Verify with Vercel dashboard or git push test.
- T16 CHANGELOG gap → cross-reference Session 5 (Sessions/) to see whether session logs have been carrying the load.
- T12 admin-verified marker → cross-reference whether the actual admin source code still has the markers in comments. Code-read in Session 8.

---

*End of Session 1 findings. Pending owner go-ahead for Session 2 (`Current Projects/` root).*
