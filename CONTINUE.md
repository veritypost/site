# Verity Post — Review & Cleanup playbook

**Owner workflow:** open a fresh Claude conversation, type `continue session`. Claude reads this file, finds the **Current phase**, and does the **Next action** for that phase. Don't summarize history; act.

---

## Current phase

`1_review_pass`

**Last updated:** 2026-05-03 — 9 Tier-A PMs dispatched in parallel; awaiting their reports before Tier-B + synthesis.

## Phase machine

| Phase | What | Output | Advance condition |
|---|---|---|---|
| **0_not_started** | Owner says go | — | Owner says "start review" / "go" / "continue session" with no phase set |
| **1_review_pass** | Architect dispatches 9 Tier-A PMs in parallel + 2 Tier-B sequential. Each PM dispatches its own 3-5 specialized subagents. Findings consolidated into `REVIEW_REPORT.md`. | `REVIEW_REPORT.md` with full PM sections + architect synthesis | All 11 PMs reported; report exists; owner reviews high-level numbers |
| **2_question_docs** | For every finding that needs an owner decision (option A vs B / build-vs-skip / pattern call), dispatch one research agent per question that runs 2-3 sub-researchers and writes a recommendation doc to `REVIEW_SESSIONS/QUESTIONS/QXX_*.md` | All question docs written | Owner pastes decisions back |
| **3_decisions_locked** | Fold owner answers into per-session docs (`REVIEW_SESSIONS/SESSION_0X_*.md`) | Sessions doc-prepped with locked decisions | Owner says "fire session N" |
| **4_running_session_N** | Run the session per its doc (architect → PMs → subagents). Mandatory verification gates per session. Append `## Status` block when done. | Closed findings; commit hash; status block | Owner says next |
| **5_verification** | Final session: re-verify every CLOSED marker; 5 VPMs do a fresh independent re-review of the cleaned codebase; CLAUDE.md kill-switch audit. | Final synthesis at top of REVIEW_REPORT.md | Owner ratifies |
| **complete** | Done. Recommend next steps. | — | — |

## Per-phase Next action

### If phase = 0_not_started
1. Confirm with owner: "Ready to start the review pass? I'll dispatch 9 Tier-A PMs in parallel covering web public, web app-shell, web admin, web public-API, billing+iOS-bridge, iOS-adult, iOS-kids, DB+RLS, pipeline+cron. Each runs its own 3-5 subagents. ~10 min wall time. Output is REVIEW_REPORT.md."
2. On owner go: create `REVIEW_REPORT.md` at repo root with the format header (severity scale + finding template + rules-every-PM-follows). Then dispatch the 9 PMs in parallel via the Agent tool with `subagent_type: general-purpose`. Each PM's prompt brief is below in the **Tier-A PM briefs** section. After all 9 land, dispatch Tier-B (PM-10 cross-platform parity, PM-11 adversary on elevated-care). Then write the architect synthesis at the top of the report.
3. Update this file's Current phase to `1_review_pass` while running, then `2_question_docs` when synthesis is written.

### If phase = 1_review_pass
- PMs are running in background. Check task notifications. Mark each PM complete as it lands. When all 11 done, write the architect synthesis at top of REVIEW_REPORT.md (deduped P0 list, blast-radius ranking, recommended fix order, surface-by-surface rank). Then advance phase.

### If phase = 2_question_docs
- Read REVIEW_REPORT.md synthesis. Identify every finding that needs an owner decision (no clear unique fix, or option-A-vs-B, or build-vs-skip). Group small related calls into bundles (e.g., "iOS mini-decisions"). Aim for 10-15 question docs total.
- For each question: dispatch one general-purpose agent that internally runs 2-3 specialized sub-researchers (Explore for code, possibly bug-hunter / adversary). Each writes a doc to `REVIEW_SESSIONS/QUESTIONS/QXX_<topic>.md` with the standard format: Question / Context / Inventory / Options / Recommendation / Reasoning / Files affected / Risks / Owner decision.
- Tell owner the docs are ready. Wait.

### If phase = 3_decisions_locked
- Read each `REVIEW_SESSIONS/QUESTIONS/QXX_*.md` for locked decisions (or owner's "accept all").
- Draft `REVIEW_SESSIONS/SESSION_0X_*.md` for each session in the recommended fix order. Standard format: Prerequisite / Mandatory reads / Locked decisions (folded in) / Scope (P0 + P1 + out-of-scope) / Orchestration (4-stream parallel) / Verification gates / Done definition / Status.
- Recommended session split:
  - **Session 0** — autonomous quick wins (truly mechanical, zero-decision fixes)
  - **Session 1** — DB / RLS hardening (most P0s usually here; broadest blast radius)
  - **Session 2** — Auth flow fixes
  - **Session 3** — Admin RBAC + chrome
  - **Session 4** — Billing + iOS bridge (elevated-care; adversary mandatory)
  - **Session 5** — Pipeline cost-cap + UX polish (biggest by volume)
  - **Session 6** — End-to-end verification + CLAUDE.md cleanup (no new fixes)
- Tell owner sessions are prepped. Wait for "fire session 0" or "fire session N".

### If phase = 4_running_session_N
- Open `REVIEW_SESSIONS/SESSION_0N_*.md`. Verify prerequisite (prior session's `## Status` is closed).
- Run the orchestration plan per the session doc: 4 PMs in parallel (or 5 for Session 5). Each PM dispatches own subagents. Pre-impl verification (each finding still applies on disk). Implementation. Build-verifier. Independent reviewer. Adversary if elevated-care.
- Apply DB migrations via `mcp__claude_ai_Supabase__apply_migration` (the writable namespace; bare `mcp__supabase__apply_migration` is read-only).
- Append `## Status` block at the bottom of the session doc with: closed/refuted counts, files touched, migrations applied, owner-action items, follow-ups.
- Append `> CLOSED in Session N — commit <hash>` markers in `REVIEW_REPORT.md` under each closed finding.
- Update this file's Current phase to `4_running_session_(N+1)` and prompt owner. Don't auto-advance.

### If phase = 5_verification
- Pass 1: re-verify every CLOSED marker by reading the cited file/RPC at current state.
- Pass 2: dispatch 5 fresh VPMs (general-purpose) covering combined Tier-A surfaces. Cap each at 25 net-new findings.
- Pass 3: rewrite CLAUDE.md kill-switch table per the audit.
- Pass 4: update REVIEW_REPORT.md synthesis with final post-cleanup numbers + Session-6 net-new findings section.
- Final recommendation block to owner: ship-ready or one-more-session.

---

## Tier-A PM briefs (Phase 1 dispatch)

Use these scopes verbatim when dispatching. Each PM gets its own `general-purpose` agent in the background.

| PM | Files / scope | Elevated care |
|---|---|---|
| **PM-1 — Web-Public** | `web/src/app/login/`, `signup/`, `forgot-password/`, `reset-password/`, `verify-email/`, `welcome/`, `request-access/`, `beta-locked/`, `appeal/`, `logout/`, marketing/legal pages, top-level layout/error/not-found/manifest/robots/sitemap, `preview/`, `api/auth/*`, `api/csp-report/`, `api/health/`, `middleware.js`, `lib/auth.js`, `lib/auth/postLoginBookkeeping.ts`, `lib/cors.js`, `lib/session.js`, `lib/password.js`, `lib/emailNormalize.ts`, `lib/betaGate.ts`, `lib/featureFlags.js`, `lib/rateLimit.js`, `lib/rateLimits.ts`, `lib/botDetect.ts` | — |
| **PM-2 — Web-AppShell** | `app/browse/`, `search/`, `category/`, `following/`, `leaderboard/`, `[slug]/`, `story/`, `card/`, `r/`, `recap/`, `bookmarks/`, `notifications/`, `messages/`, `expert-queue/`, `profile/` (entire tree), `u/`, `mockup-explore/`, all non-admin `components/`, UI-side `lib/` (copy, brand, dates, zIndex, scoreTiers, mentions, track, useFocusTrap, friendlyError, consent, referralCookie, anonReadCounter, observability) | — |
| **PM-3 — Web-Admin** | `app/admin/*` (all pages), `api/admin/*` (all routes minus pipeline which PM-9 owns), `components/admin/*`, `lib/adminMutation.ts`, `lib/adminPalette.js`, `lib/adminValidation.ts`, `lib/permissions.js`, `lib/permissionKeys.js`, `lib/roles.js`, `lib/rlsErrorHandler.js` | RBAC |
| **PM-4 — Web-API-Public** | All `api/*` not owned by PM-1, PM-3, PM-5, PM-9. ~95 routes (articles, comments, follows, bookmarks, profile, search, notifications, push, reports, appeals, family, kids, quiz, expert, conversations, etc.) | — |
| **PM-5 — Billing-and-iOS-Bridge** | `api/billing/*`, `api/stripe/*`, `api/ios/appstore/*`, `api/ios/subscriptions/*`, `lib/stripe.js`, `lib/appleReceipt.js`, `lib/plans.js`, `app/pricing/*`, `app/billing/*`, `BillingCard.tsx`, plus iOS read-only `StoreManager.swift` + `SubscriptionView.swift` for parity | **Payments — adversary** |
| **PM-6 — iOS-Adult** | All Swift files under `VerityPost/VerityPost/` | — |
| **PM-7 — iOS-Kids** | All Swift files under `VerityPostKids/VerityPostKids/` | **COPPA / Apple Kids — adversary** |
| **PM-8 — DB-and-RLS** | `supabase/migrations/*`, `web/src/types/database.ts`, `lib/permissions.js`, `lib/permissionKeys.js`, `lib/roles.js`. Verify via Supabase MCP (`mcp__claude_ai_Supabase__list_tables`, `execute_sql` against `pg_policies` / `pg_proc` / `pg_constraint` / `information_schema`). NEVER trust `supabase_migrations` log table. Run `mcp__claude_ai_Supabase__get_advisors`. | **RLS — adversary** |
| **PM-9 — Pipeline-and-Cron** | `lib/pipeline/*`, `api/cron/*`, `api/ai/*`, `api/newsroom/*`, `api/admin/pipeline/*`, `api/admin/newsroom/clusters/*`, `lib/scoring.js`, `lib/ncmec.ts`, `lib/coppaConsent.js`, `lib/kidPin.js`, `lib/cronAuth.js`, `lib/cronHeartbeat.js`, `lib/cronLog.js`, `lib/apns.js` | — |

### Tier-B (run after Tier-A finishes)

| PM | Scope |
|---|---|
| **PM-10 — Cross-Platform-Parity** | Read all Tier-A reports. Audit web ↔ iOS-adult ↔ iOS-kids drift on: auth, billing, push, profile, notifications, bookmarks, kill-switch flags, pricing. Audit CLAUDE.md kill-switch inventory rows against actual code. |
| **PM-11 — Adversary-Sweep** | Independent paranoid pass on auth (PM-1), billing (PM-5), kids iOS (PM-7), DB/RLS (PM-8). Look for what those PMs MISSED — don't review their diffs. |

---

## Standard finding format

```
### [P0|P1|P2|P3] <one-line title>
- File: <path>:<line>
- Issue: <what is wrong>
- Evidence: <short quote from current file>
- Impact: <user/system consequence>
- Suggested fix: <concrete change>
- Verified by: <subagent or check>
```

**Severity:**
- **P0** — crash, data loss, auth bypass, payment bug, RLS hole, COPPA violation
- **P1** — broken user flow, dead-end UX, wrong data shown, race condition with user-visible effect
- **P2** — polish, copy, a11y, dark-mode, minor inconsistency
- **P3** — nice-to-have

## Rules every PM follows
1. Verify against the actual file on disk before logging a finding. Quote the line.
2. Ignore stale md notes at repo root; the code is source of truth.
3. Kill-switched surfaces (see `CLAUDE.md`): do NOT flag missing functionality. DO flag broken chrome on the disabled surface; prefix `[KILL-SWITCHED]`.
4. Don't recommend deletes/renames without grepping for callers.
5. If a finding can't be verified, drop it — no speculation.
6. Owner-feedback memories apply (cross-platform consistency, no Sentry, no keyboard shortcuts in admin, click-driven, no user-facing timelines, etc.).

## Decisions log

Append every owner decision here so we never re-ask. Format: `<phase>.<topic>: <decision> — <date>`.

(empty — fresh run)

## Notes for whoever picks this up
- Owner wants tight responses. No walls of text.
- Don't recite history. Read this file's Current phase + Decisions log; act.
- Don't auto-advance phases — ask owner before firing each session.
- DB migrations apply via `mcp__claude_ai_Supabase__apply_migration`, NOT the bare `mcp__supabase__apply_migration` (latter is read-only).
- iOS Adult build canonical sentinel: `cd VerityPost && xcodebuild` should succeed at end of every session that touches Swift.
