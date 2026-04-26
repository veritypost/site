# PM Punchlist — 2026-04-24

Lead PM's independent working list. **Not canonical** — `MASTER_TRIAGE_2026-04-23.md` still holds that spot. This doc captures everything I personally see outstanding across trackers, code, and infra, so the multi-wave audit that follows has a baseline to reconcile against.

Maintained fresh: re-read before each new wave dispatches.

**Mode context (2026-04-24):** Web is in `NEXT_PUBLIC_SITE_MODE=coming_soon`. Public pages are gated behind a coming-soon wall. Backend + iOS development is unblocked. UI smoke-testing must happen against the dev server or behind the wall — user explicitly wants UI ready at launch, so the coming-soon mode is not an excuse to skip UI verification.

**Goal this cycle:** launch-ready + UI-ready, not "works on paper." Thoroughness > speed.

---

## Critical — launch-blocking code

**Owner-reported (2026-04-24, not yet reproduced by me):**
- **UI-COMMENTS** — Comments "not saving or showing or something." Needs end-to-end reproduction: article → quiz pass → comment submit → display after refresh. Root cause could be RLS policy, API route (`/api/comments/...`), quiz-unlock gate, or client hook. **Audit track must reproduce this, not just inspect code.**
- **UI-SETTINGS** — Settings page broken. `web/src/app/profile/settings/page.tsx` is 3800 lines across many tabs; each section's save path needs exercised. **Audit track must click every section's save/revert/load.**
- **UI-OTHER** — "Other weird UI shit" — vague by design. Need a systematic UI smoke-test pass across every page to catch anything else drifted.

**Tracker-known (MASTER_TRIAGE):**
- **T0-1** — Handler crash on `DELETE /roles`. Source: MASTER_TRIAGE Tier 0 #1. Not shipped.
- **T0-2** — Handler crashes on cancel/freeze routes. Source: MASTER_TRIAGE Tier 0 #2. Not shipped.
- **B1** — Stripe webhook RPCs don't call `bump_user_perms_version`. Frozen users retain paid features.
- **B3** — Receipt hijack: iOS `userId` from bearer never cross-checked vs JWS `appAccountToken`. Account-takeover vector.
- **B6** — `invoice.upcoming` webhook unhandled. No "card expiring" proactive notification.
- **K5** — `ParentalGateModal` wired only on `/profile` Unpair. Missing on quizzes, expert sessions, settings, reading. COPPA gap; grep confirms 4 self-referential hits, no real callers.
- **L8** — Dev fail-open bypasses rate limits on staging/custom-VPC deploys.

## Needs verification — recent commits may have closed these

Tracker may be stale on these; commits exist but need diff-level confirmation the fix is complete, not partial.

- **L3** — `BATCH_SIZE` + `.in()` over 8KB PostgREST cap. Commit `9d04420` (500→200). **Verify:** 200 × per-row URL length under 8KB for worst case.
- **L4** — `Promise.all` aborts batch on single failure. Commit `8b304e7` converts setup fetch to `allSettled`. **Verify:** whole `send-emails` worker, not only setup fetch.
- **L5** — Sequential RPC over 10k users exceeds `maxDuration=60`. Commit `7a46e71` adds concurrency cap. **Verify:** cap value, timeout headroom, partial-failure idempotency.
- **L6** — Partial-failure idempotency broken (RPC succeeded + upload failed → double notify). Commit `cd5b89a` state-machine data-exports worker. **Verify:** RPC+upload atomicity end-to-end.
- **L19** — Cron/send-push atomic claim. Commit `98c6662` via `claim_push_batch` RPC. **Verify:** contention semantics, retry behavior on claim-lost.

## Owner-side infra — I can't execute, you control these

- **00-C URGENT** — Supabase URL typo in Vercel env vars. Blocks all auth/DB on prod. ~2 min + redeploy.
- **00-J SECURITY-CRITICAL** — Remove ex-dev from Vercel project access. 30 sec.
- **00-A** — Enable `pg_cron` extension in Supabase. 2 min or swap to Vercel cron.
- **00-I** — Apple Developer account enrollment. Gates iOS publishing only, not development.
- **00-G** — Stripe live-mode audit + webhook test. 30-60 min owner-side.
- **00-D** — Sentry DSN env var. Deferred (memory: not cost-justified pre-launch).

## Meta / consolidation — documentation drift

- Retire `Current Projects/FIX_SESSION_1.md` — superseded by MASTER_TRIAGE_2026-04-23.md. Roll any unique open items into master. Repoint `Reference/CLAUDE.md`.
- Archive `424_PROMPT.md`, `426_PROMPT.md`, `427_PROMPT.md` from repo root to `Archived/`.
- Update `Reference/STATUS.md` to reflect 2026-04-24 state.
- COMPLETED_TASKS classification lag: B14, B17, B18, L19 labeled DEFERRED but shipped same day. Reclassify.

## Quality debt — YELLOW, not launch-blocking but ideally cleaned before ship

- Web: **94 type-escape hatches** across `web/src`. 19 concentrated in `web/src/app/admin/` (MASTER_TRIAGE #16).
- Web: **33+ `next lint` warnings**, majority `react-hooks/exhaustive-deps` (messages/page.tsx, settings/page.tsx, home page, story detail). Stale-closure risk — these directly correlate with "weird UI shit."
- Web: **CSP still `Report-Only`** at `web/src/middleware.js:188` (#00-F).
- Web: **`web/tsconfig.json: "strict": false`** (#17).
- iOS adult: expert Q&A wrapped in `#if false` at `VerityPost/VerityPost/StoryDetailView.swift:1907-1933`. Feature off, not broken.

## Product-gap — post-launch, not blocking

- **#14** — Reserved-username claim flow. `claim_mode` column + `username_claim_requests` table both absent.
- **F2/F3/F4** — Launch-hidden features per kill-switch inventory. Keep state/queries/types alive, flip on post-approval.

---

*Refresh cadence: before every audit wave dispatch. Delta this edit: added owner-reported UI-COMMENTS / UI-SETTINGS / UI-OTHER items; added coming-soon mode context; linked react-hooks lint warnings to "weird UI shit" signal.*
