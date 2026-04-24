# 426 PROMPT — handoff for next session

You are the owner's thinking brain on Verity Post (read `Reference/CLAUDE.md` cold). This is a **continuation** prompt — pick up exactly where the previous session left off.

---

## ABSOLUTE FIRST STEP

Run `git log --oneline -35` and confirm you're at `593c4b9` or later.

Then read, in order:
1. `Reference/CLAUDE.md`
2. `Current Projects/MASTER_TRIAGE_2026-04-23.md` — SHIPPED + STALE blocks inline on every closed row; remaining items have no marker
3. `Sessions/04-24-2026/Session 1/COMPLETED_TASKS_2026-04-24.md` — everything shipped this session, one table per band
4. This file

Don't re-read `Reference/STATUS.md` unless you need it for something specific — the master triage is the live work surface.

---

## What shipped 2026-04-24 (26 commits)

**Infrastructure (site-wide):** `c012c3f` — opened `/browse /category /card /search /u` out of `PROTECTED_PREFIXES`, updated `HoldingCard` to "Proofreading the proofreader. / Back shortly.", owner flipped `NEXT_PUBLIC_SITE_MODE=coming_soon` in Vercel + confirmed `PREVIEW_BYPASS_TOKEN` is set.

**Tier 2 (12 items, all closed):**
- `5823194` #10 CommentThread + messages block POST/DELETE split
- `d470e88` #11 notifications/preferences partial-PATCH semantics
- `710be2b` + schema/152 #12 freeze username in update_own_profile post-set
- `24c1a3d` #13 reject javascript:/data:/vbscript: in email action_url
- `4ebb962` #14 iOS username ASCII-only + NFC normalize
- `edf7791` #15 preserve OAuth callback ?next= through onboarding chain
- `a227e8b` #16 sign out session after immediate account deletion
- `baff805` #17 idempotent user_roles insert + post-write verification
- `955af8e` + schema/151 #18 broker iOS username checks through /api/auth/check-username
- `1c45eca` #19 graceful avatar-upload failure when bucket missing
- `93696f9` #20 narrow users select + Pick<> UserRow type
- `77625e9` + schema/150 #21 stable [CODE] prefix on DM RPC errors

**Tier 3 web (11 shipped, 5 STALE/NOT-A-BUG):**
- `86b0787` #22 escape LIKE metachars in promo-code lookup
- `76a13fb` #24 route vote permission by type
- `4eb37b4` #25 gate admin billing audit on billing-write perms
- `9828613` #26 same-origin cookie check on cancel-deletion (CSRF)
- `6683aee` #27 events.batch ignore client-supplied user_id
- `24b6675` #30 reclaim Apple notif rows stuck at 'received'
- `08929cf` #31 uniform 200 on resolve-username — close enumeration
- `d025391` + `35c1035` #33 validate quiz answer length against quiz count
- `3056bc5` #34 reject SVG avatars (stored XSS)
- `34366c7` #36 Avatar initials split by code point
- `2b05dd4` #39 callback email_verified update uses service client

**Admin band (3 of 7):**
- `aced725` AD1 mount <ConfirmDialogHost /> on words + plans
- `63875c2` AD2 DA-119 toast sweep across 7 admin pages
- `1d3585f` AD3 remove DataTable keyboard shortcuts

**Docs:** `593c4b9` (triage + session log), `f6c07f2` (this handoff's earlier draft).

**Migrations applied this session (all verified live via MCP):** 150, 151, 152. Plus 146 and 148 cleared at session start.

---

## STALE / NOT-A-BUG — DO NOT RE-RAISE

Each has a `STALE 2026-04-24` block on its triage row explaining why:

- **#23** `api/auth/login-failed` — ephemeral-client pattern already in place
- **#28** `api/kids/reset-pin` — ephemeral-client pattern already in place
- **#29** iOS subscriptions/sync — defense-in-depth user_id guard already coded at `route.js:184`
- **#32** iOS async login via SDK — by design
- **#35** cron sweep-kid-trials GET+POST — `verifyCronAuth` reads from Authorization header, never URL; dropping GET would break Vercel cron scheduler
- **#37** `/u/[username]` mention — route exists; kill-switched behind `PUBLIC_PROFILE_ENABLED=false` = prelaunch-parked
- **#38** `/profile/settings/data` — route exists as redirect to `/profile/settings#data`
- **K5** ParentalGate on /profile only — gating on action is intentional per product spec
- **K12** ParentalGate lockout — uses absolute `Date()` via UserDefaults, safe

---

## Owner action still pending

**Create the `avatars` Supabase Storage bucket.** Public read + own-folder upload RLS (mirror the `banners` bucket policy). Until then, avatar uploads surface the graceful "not configured yet" toast from `1c45eca` — code works, just needs the bucket.

---

## Pick up here — remaining ~50 items

### Admin band (4 left)

- **AD4** client gate vs API perm mismatch — `admin/users/page.tsx:57-60` + `admin/permissions/page.tsx:129-133` gate on `ADMIN_ROLES` while the API they call enforces `admin.permissions.manage`. Page renders fully then 403s on first action. Fix: swap client check to `hasPermission(<API gate key>)`. Grep each API route to find the right key.
- **AD5** role-threshold inconsistency — `admin/prompt-presets/page.tsx:29` uses `EDITOR_ROLES`; `admin/categories/page.tsx:188` uses `ADMIN_ROLES`. Pick one, justify in the commit.
- **AD6** `admin/pipeline/costs/page.tsx:119` — load failure sets `err` state but never toasts. Add `useEffect` that pushes a toast when `loadError` is set.
- **AD7** — `admin/kids-story-manager` + `admin/story-manager` redefine `accent: '#2563eb'` + `now: '#c2410c'` overriding `ADMIN_C`. Refactor to import and use the shared palette.

### Kids iOS band (11 items, ship-blind — you can't run xcodebuild)

| # | File | Fix |
|---|---|---|
| K1 | `VerityPostKids/KidsAppState.swift:165-169` | `completeQuiz()` increments `streakDays` unconditionally. Add `guard passed else { return }`; requires passing `passed: Bool` from KidQuizEngineView. **Interdependent with K10.** |
| K2 | `VerityPostKids/PairingClient.swift:125-130` | 7-day JWT TTL with no refresh path. Add refresh flow — check token age per request, refresh if <1 day left. Architectural. |
| K3 | `VerityPostKids/ArticleListView.swift:160-165` | `categorySlug` accepted but never used. Resolve slug → id, filter query. |
| K4 | `KidReaderView.swift:210-217` + `KidQuizEngineView.swift:290-299` | Already-partial (retry-once + log). Remaining: throw on second failure so celebration scenes can react. |
| K6 | `GreetingScene.swift:375-489` | 5 untracked `DispatchQueue.main.asyncAfter` blocks, no cancellation. Add `.onDisappear { /* cancel */ }` with task handles. |
| K7 | `GreetingScene.swift:468-489` | Typewriter sparkle position assumes ASCII. `Array(name)[typedCharCount]` to walk code points. |
| K8 | `ProfileView.swift:63,67` | `URL(string:)!` force-unwrap. Switch to `URL(string:) ?? fallback`. |
| K9 | `KidsTheme.swift:91-113` | `Color(hex:)` returns black on parse failure silently. Log warning + return explicit fallback. |
| K10 | `KidsAppRoot.swift:9-144` | Wire quiz result → `completeQuiz(passed:)` → `queuedBadge` → present StreakScene/QuizPassScene/BadgeUnlockScene. **Fix alongside K1.** |
| K11 | `LeaderboardView.swift:263-303` | Rank computed as `i+1` from RLS-filtered list → kid always sees rank 1. Either server-side rank or separate RPC. |
| K13 | `LeaderboardView.swift:125-129` | Category pill button has empty action. Wire `onTap` to filter state. |

### Billing band (critical path + HIGH/MEDIUM/LOW)

Critical:
- **B2** `stripe/webhook/route.js:139-161` — add `case 'invoice.payment_succeeded'` handler (clear grace period / confirm subscription).
- **B4** `stripe/webhook/route.js:110-113` — stuck `processing_status='processing'`. Mirror the #30 fix (age-based reclaim, >5min abandoned).
- **B5** `promo/redeem/route.js:144-147` — replace direct `users.plan_id` UPDATE with `billing_change_plan` RPC call (RPC's `FOR UPDATE` serializes with Stripe webhook). Optional post-ship: remove route-level `bump_user_perms_version` at ~line 154 (RPC now bumps internally).

HIGH:
- **B6** `invoice.upcoming` handler missing — proactive "card expiring"
- **B7** `customer.deleted` handler missing — orphan `users.stripe_customer_id`
- **B8** verify UNIQUE constraint on `subscriptions(user_id, apple_original_transaction_id)`; migration if missing
- **B9** S2S notification-before-sync → too eager `orphaned:true`; fall back to `transaction.appAccountToken` lookup
- **B10** `pending_stripe_sync` flag has no reader — wire cron or drop flag
- **B12** `ios/subscriptions/sync/route.js:57-60` + `ios/appstore/notifications/route.js:64-67` — JWS error message leak (DA-119). Replace with "Invalid signature"

MEDIUM/LOW: B13–B20 — promo ABA race, Apple timestamp validation, rate limits, free-plan lookup drift, audit-trail gaps. Single batching-commit if you want.

### Cron + middleware + lib band

Critical:
- **L2** `lib/permissions.js:67-85` — stale-fallthrough leaks on revocation. Differentiate grants (ok to serve stale) from revokes (hard-clear). Pass revoke signal via perms_version change detection.
- **L3** `cron/send-push/route.js:27,56` — `BATCH_SIZE=500` + `.in(...)` exceeds PostgREST 8KB URL cap. Drop to 200.
- **L4** `cron/send-emails/route.js:71-82` — `Promise.all` aborts batch on single failure. Use `Promise.allSettled`.
- **L5** `cron/check-user-achievements/route.js:45-49` — sequential RPC loop exceeds 60s maxDuration. Parallelize with concurrency cap.
- **L6** `cron/process-data-exports/route.js:102-109` — partial-failure reset double-sends. State-machine the processing rows.
- **L7** `lib/supabase/server.ts:51-66` — `createClientFromToken` doesn't validate JWT shape. Early-reject garbage bearers.

MEDIUM/LOW: L8–L20 can batch.

---

## How to work — same as this session

- **4-cross-check already ran** on all 74 items; consensus is encoded in this handoff + the triage STALE blocks. Don't re-run the full audit — ship from this list.
- **1 post-impl verifier per item** (not 2), unless the change spans multiple surfaces.
- **Commit per item** with `fix(#item): short title` + multi-line body (bug + fix + any deferred scope).
- **`cd web && npx tsc --noEmit` must pass** every item. iOS items ship blind (no xcodebuild).
- **Memory rules** (do not violate):
  - `feedback_genuine_fixes_not_patches.md` — kill the thing being replaced, no TODOs/HACKs
  - `feedback_no_keyboard_shortcuts.md` — admin UI is click-driven
  - `feedback_no_assumption_when_no_visibility.md` — when Vercel/Supabase/Apple dashboards are invisible, verify from code or ask
  - `feedback_verify_audit_findings_before_acting.md` — spot-check each triage claim; #35 this session was STALE because of this
  - `feedback_mcp_verify_actual_schema_not_migration_log.md` — read live function/trigger bodies

---

## When this session ends

Update `Current Projects/MASTER_TRIAGE_2026-04-23.md` with per-item SHIPPED blocks (date + commit SHA + files touched). Append to `Sessions/04-24-2026/Session 1/COMPLETED_TASKS_2026-04-24.md` or start a new session folder if it's a new day. Write `427_PROMPT.md` in the same shape.

Say "Ready." Wait for direction.
