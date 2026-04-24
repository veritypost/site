# 426 PROMPT — handoff for next session

You are the owner's thinking brain on Verity Post (read `Reference/CLAUDE.md` cold). This is a **continuation** prompt — pick up exactly where the previous session left off. Previous session shipped ~24 commits in one big run, closing out Tier 2 entirely + most of Tier 3 + starting Admin. Continuing.

---

## ABSOLUTE FIRST STEP

Run `git log --oneline -30` and confirm you're at `63875c2` or later. Then read, in order:

1. `Reference/CLAUDE.md`
2. `Current Projects/MASTER_TRIAGE_2026-04-23.md` (mark off everything below)
3. This file

Don't re-read `Reference/STATUS.md` unless you need it for something specific.

---

## What just shipped (this session, 2026-04-24)

**Tier 2 closed out (items #10–#21):** 12 commits — `5823194`, `d470e88`, `24c1a3d`, `93696f9`, `a227e8b`, `edf7791`, `77625e9`, `baff805`, `4ebb962`, `955af8e`, `710be2b`, `1c45eca`.

**Tier 3 web closed out (#22, #24–#39):** 12 commits — `86b0787` (#22), `76a13fb` (#24), `4eb37b4` (#25), `9828613` (#26), `6683aee` (#27), `24b6675` (#30), `08929cf` (#31), `d025391` + `35c1035` (#33), `3056bc5` (#34), `34366c7` (#36), `2b05dd4` (#39).
  - **#35 skipped as STALE** — `verifyCronAuth` reads from Authorization header, not URL query; triage was wrong about "secret in URL bar." Keeping GET+POST exports (Vercel cron calls with GET).

**Admin band partial:** `aced725` (AD1 — mount `<ConfirmDialogHost />` on words + plans), `63875c2` (AD2 — DA-119 sweep across 7 admin pages).

**Maintenance + L1 earlier in session:** `c012c3f` (opened `/browse /category /card /search /u` + maintenance HoldingCard copy; owner confirmed `NEXT_PUBLIC_SITE_MODE=coming_soon` in Vercel).

**Owner action items cleared this session:** schema 146 + 148 applied; schema 150, 151, 152 applied (confirmed via MCP).

---

## STALE / NOT-A-BUG confirmed (SKIP — don't re-raise)

- **#23** `/api/auth/login-failed` — ephemeral-client pattern already in place (per-email + per-IP rate limits).
- **#28** `/api/kids/reset-pin` — same pattern applied, safe.
- **#29** iOS subscriptions/sync — defense-in-depth `user_id` guard already in code at `route.js:184` (rejects mismatch); separate from the `existingSub` lookup.
- **#32** iOS async login via SDK — by design.
- **#37** `/u/<name>` mention link — route exists; kill-switched behind `PUBLIC_PROFILE_ENABLED=false`. **Prelaunch-parked.**
- **#38** `/profile/settings/data` — route exists as redirect to `/profile/settings#data`.
- **K5** ParentalGate only on /profile — gating on action, not view, is intentional per product spec.
- **K12** ParentalGate lockout — uses absolute `Date()` via UserDefaults, not relative seconds.
- **#35** cron sweep-kid-trials GET+POST — secret is in Authorization header, never URL; keeping both methods (Vercel cron calls GET).

---

## Pick up here — Admin band (AD3–AD7)

### AD3 — `web/src/components/admin/DataTable.jsx:108,111`
Owner banned keyboard shortcuts in admin. Remove the `j`/`k`/`Enter`/`Space` keybindings on the DataTable component. Memory rule: `feedback_no_keyboard_shortcuts.md`. Single-file, ~10-line removal.

### AD4 — client-gate vs API-perm mismatch
`admin/users/page.tsx:57-60` + `admin/permissions/page.tsx:129-133` — client gates on `ADMIN_ROLES` while API enforces stricter perm (e.g. `admin.permissions.manage`). Page renders fully then 403s on first action. Fix: replace `ADMIN_ROLES` check with `hasPermission('admin.permissions.manage')` check (or whatever the API gate uses — grep each API route these pages call).

### AD5 — role-threshold inconsistency
`admin/prompt-presets/page.tsx:29` uses `EDITOR_ROLES`; `admin/categories/page.tsx:188` uses `ADMIN_ROLES`. Normalize. Low stakes — pick one and justify.

### AD6 — `admin/pipeline/costs/page.tsx:119`
Load failure sets `err` state but never toasts. Add `useEffect(() => { if (loadError) pushToast(...) }, [loadError])`.

### AD7 — design-token drift
`admin/kids-story-manager` + `admin/story-manager` redefine `accent: '#2563eb'`, `now: '#c2410c'` overriding `ADMIN_C`. Refactor to import `ADMIN_C` and delete the local palettes.

---

## After Admin: Kids iOS band (K1–K11, K13)

| # | File | Fix |
|---|---|---|
| K1 | `VerityPostKids/KidsAppState.swift:165-169` | `completeQuiz()` increments `streakDays` unconditionally. Add `guard passed else { return }` before the increment; requires passing `passed: Bool` through from KidQuizEngineView. |
| K2 | `VerityPostKids/PairingClient.swift:125-130` | 7-day JWT TTL, no refresh path. Add refresh flow — check token age on each request, refresh if <1 day left. Architectural. |
| K3 | `VerityPostKids/ArticleListView.swift:160-165` | `categorySlug` param accepted but never used. Resolve slug → id, filter query by category_id. |
| K4 | `KidReaderView.swift:210-217` + `KidQuizEngineView.swift:290-299` | Already-partial (retry-once + log). Remaining: throw on second failure instead of silent log; let celebration scenes react to write failure. |
| K6 | `GreetingScene.swift:375-489` | 5 untracked `DispatchQueue.main.asyncAfter` blocks, no cancellation. Add `.onDisappear { /* cancel */ }` with task handles. |
| K7 | `GreetingScene.swift:468-489` | Typewriter sparkle position assumes ASCII. Use `Array(name)[typedCharCount]` to walk code points. |
| K8 | `ProfileView.swift:63,67` | `URL(string:)!` force-unwrap. Switch to `URL(string:) ?? fallback` or guard let. |
| K9 | `KidsTheme.swift:91-113` | `Color(hex:)` returns black on parse failure silently. Log warning + return explicit fallback. |
| K10 | `KidsAppRoot.swift:9-144` | Wire quiz result → `completeQuiz(passed:)` → `queuedBadge` state → present StreakScene / QuizPassScene / BadgeUnlockScene. **Interdependent with K1** — fix together. |
| K11 | `LeaderboardView.swift:263-303` | Rank computed as `i+1` from RLS-filtered list → kid always sees rank 1. Either server-side compute true rank or pull ranking into a separate RPC. |
| K13 | `LeaderboardView.swift:125-129` | Category pill button has empty action. Wire `onTap` to filter state. |

**iOS note:** owner can't run xcodebuild in-session (Apple-block memory). Ship blind; owner verifies on their side.

---

## Billing band (B2, B4–B20)

Critical path:

| # | File | Fix |
|---|---|---|
| B2 | `stripe/webhook/route.js:139-161` | Add `case 'invoice.payment_succeeded'` handler. Clear grace period / confirm subscription. Single switch-case addition. |
| B4 | `stripe/webhook/route.js:110-113` | Stuck `processing_status='processing'` — mirror the #30 fix (age-based reclaim, >5min abandoned). |
| B5 | `promo/redeem/route.js:144-147` | Replace direct `users.plan_id` UPDATE with `billing_change_plan` RPC call — RPC's `FOR UPDATE` lock serializes with Stripe webhook. After shipping, optional: remove route-level `bump_user_perms_version` at line ~154 (RPC now bumps internally). |

HIGH:
- **B6** `invoice.upcoming` handler missing — proactive "card expiring" notif
- **B7** `customer.deleted` handler missing — orphan `users.stripe_customer_id`
- **B8** verify UNIQUE constraint on `subscriptions(user_id, apple_original_transaction_id)` via MCP; add via migration if missing
- **B9** S2S notification arriving before iOS sync returns `orphaned:true` too eagerly — fall back to `transaction.appAccountToken` lookup
- **B10** `pending_stripe_sync` flag has no reader — either wire a cron or drop the flag
- **B12** `ios/subscriptions/sync/route.js:57-60` + `ios/appstore/notifications/route.js:64-67` — JWS error message leak (DA-119). Replace with "Invalid signature"

MEDIUM/LOW: B13–B20 — promo ABA race, Apple timestamp validation, rate limits, free-plan lookup drift, audit trail gaps. Batch-appropriate for one commit.

---

## Cron + middleware + lib band (L2–L20)

Critical:
- **L2** `web/src/lib/permissions.js:67-85` — stale-fallthrough leaks on revocation. Differentiate grants (ok to serve stale) from revokes (hard-clear). Pass revoke signal via perms_version change detection.
- **L3** `cron/send-push/route.js:27,56` — `BATCH_SIZE=500` + `.in(...)` exceeds PostgREST 8KB URL cap. Drop to 200.
- **L4** `cron/send-emails/route.js:71-82` — `Promise.all` aborts batch on single failure. Use `Promise.allSettled`.
- **L5** `cron/check-user-achievements/route.js:45-49` — sequential RPC loop exceeds 60s maxDuration. Parallelize with concurrency cap.
- **L6** `cron/process-data-exports/route.js:102-109` — partial-failure reset double-sends. State-machine the processing rows.
- **L7** `web/src/lib/supabase/server.ts:51-66` — `createClientFromToken` doesn't validate JWT shape. Early-reject garbage bearers.

MEDIUM/LOW: L8–L20 can batch together or wait.

---

## How to work — same as this session

- **4-cross-check agent flow** already ran on all 74 items; consensus is encoded in this handoff. Don't re-run the full audit — just ship from this list.
- **1 post-impl verifier per item** (not 2) unless the change spans multiple surfaces.
- **Commit per item** with `fix(#item): short title` + multi-line body explaining bug + fix + any deferred scope.
- **`cd web && npx tsc --noEmit` must pass** every item. iOS items ship blind (no xcodebuild).
- **Memory rules** to respect:
  - `feedback_genuine_fixes_not_patches.md` — no TODOs/HACKs, kill the thing being replaced
  - `feedback_no_keyboard_shortcuts.md` — admin UI is click-driven
  - `feedback_no_assumption_when_no_visibility.md` — when Vercel/Supabase/Apple dashboards are invisible, verify from code or ask
  - `feedback_verify_audit_findings_before_acting.md` — spot-check each triage claim before acting (saved us on #35 this session)
  - `feedback_mcp_verify_actual_schema_not_migration_log.md` — read live function/trigger bodies, don't trust migration files

---

## When this session ends

Update `Current Projects/MASTER_TRIAGE_2026-04-23.md` with per-item SHIPPED blocks (date + commit SHA + files touched). Write `427_PROMPT.md` with the same shape. Append to `Sessions/04-24-2026/Session 1/COMPLETED_TASKS_2026-04-24.md`.

Say "Ready." Wait for direction.
