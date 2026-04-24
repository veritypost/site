# 427 PROMPT — handoff for next session

You are the owner's thinking brain on Verity Post (read `Reference/CLAUDE.md` cold). This is a **continuation** prompt — the previous session closed the entire Admin + Kids iOS bands, most of Billing, and most of Cron/lib. Remaining items are specific + narrow.

---

## ABSOLUTE FIRST STEP

Run `git log --oneline -40` and confirm the tip is at or past `a1b30d7`.

Then read, in order:
1. `Reference/CLAUDE.md`
2. `Current Projects/MASTER_TRIAGE_2026-04-23.md` — every row now has SHIPPED/STALE/DEFERRED markers; remaining open work is easy to spot
3. `Sessions/04-24-2026/Session 2/COMPLETED_TASKS_2026-04-24.md` — what shipped in the prior run + STALE/DEFERRED decisions with reasoning
4. This file

---

## What shipped 2026-04-24 Session 2 (25 commits)

**Admin (4/4 closed):** AD4 `fdf02bb`, AD5 `3f24c16`, AD6 `91ea57e`, AD7 `b2e9f56`.

**Kids iOS (11/11 closed, K5/K7/K12 STALE, QuizPassScene deferred inside K10):**
- K1+K10 `0295c41` — KidQuizResult propagation + StreakScene/BadgeUnlockScene scene chain via sceneQueue in KidsAppRoot
- K2 `f7ef24e` — /api/kids/refresh + refreshIfNeeded on launch + scenePhase.active (schema/153)
- K3 `cd894a2` — categorySlug threaded through KidCategory → ArticleListView
- K4 `500dfe2` — throw on double-fail, writeFailures propagated, scenes suppressed when > 0
- K6 `bc08acf` — runChoreography rewritten as async over Task.sleep (K7 folded: claim was stale)
- K8 `0908817` — URL(string:) ?? fallbackLegalURL
- K9 `cca0a6e` — Color(hex:) logs + fuchsia sentinel
- K11+K13 `8729899` — get_kid_category_rank RPC (schema/154) + category pill tap wires selectedCategory

**Billing (12/17 closed, 3 STALE, 2 DEFERRED):**
- B2+B4+B6+B7 `dc7b69d` — webhook handlers: invoice.payment_succeeded, invoice.upcoming, customer.deleted + age-based stuck-processing reclaim
- B5 `bbcd785` — promo/redeem through billing_change_plan / billing_resubscribe
- B8 `5d95f2b` — partial UNIQUE on subscriptions(user_id, apple_original_transaction_id) (schema/155)
- B9+B12 `91146cb` — appAccountToken orphan fallback + strip JWS error leaks
- B10 `0ca552e` — drop pending_stripe_sync flag
- B15+B16+B19 `a1b30d7` — ios_subscription_sync rate limit (schema/156), unknown Apple types stay at 'received', free plan by tier

**Cron / lib (11/20 closed, 6 STALE, 3 DEFERRED):**
- L2 `0493050` — permissions hard-clear on version bump
- L3 `9d04420` — cron/send-push BATCH_SIZE 500 → 200
- L4 `8b304e7` — send-emails Promise.allSettled
- L5 `7a46e71` — check-user-achievements concurrency pool
- L6 `cd5b89a` — process-data-exports state machine
- L7 `a050234` — createClientFromToken JWT shape check
- L8+L10+L11+L17+L18 `4cc5d56` — MEDIUM batch

**Migrations queued (owner applies — MCP read-only):**
- `schema/153` kids_refresh rate_limits row
- `schema/154` get_kid_category_rank SECURITY DEFINER RPC
- `schema/155` partial UNIQUE on subscriptions(user_id, apple_original_transaction_id)
- `schema/156` ios_subscription_sync rate_limits row

All four are **non-blocking** — every route works with the code-default fallback (matching the seed values) or gracefully degrades. Apply when convenient, verify via MCP.

---

## STALE / DEFERRED — DO NOT RE-RAISE

Each has a per-row marker in the triage with the reasoning. Quick reference:

**STALE (triage claim was wrong or already mitigated):**
- **K5** — ParentalGate on /profile only. Gating on action is per product spec (prior session).
- **K7** — Swift `name.count` is grapheme cluster count; no ASCII-indexing code existed.
- **K12** — Lockout uses absolute `Date()` via UserDefaults (prior session).
- **B13** — Promo ABA race already guarded by optimistic eq-claim + duplicate-use check.
- **B20** — Notification already shipped in B11 prior session.
- **L9** — JWT cache refreshes before 50min; well under Apple's 60min invalidation.
- **L14** — `persist-article.ts` already guards `if (!row) throw`.
- **L15** — cost-tracker's `cap_usd=-1` is the documented fail-closed SIGNAL, not uncapped.
- **L16** — CSP Report-Only is intentional.
- **L20** — cronAuth timing mitigated by random-secret rotation.

**DEFERRED (real but needs scope beyond a single-session fix):**
- **B14** — Apple JWS header timestamp validation. Needs real JWS payload for testable anti-replay.
- **B17** — `billing_cancel_subscription` frozen-user rejection. RPC-level.
- **B18** — audit_log on Stripe webhook errors. `webhook_log` already captures; duplication.
- **L12** — plans.js TIERS/PRICING hardcoded. DB read path across admin/checkout/settings.
- **L13** — roles.js 60s cache. Needs pub/sub to invalidate.
- **L19** — cron/send-push concurrency lock. Needs schema (claim column or advisory lock RPC).

---

## Remaining open work

### Billing — B11 (HIGH) still open

`stripe/webhook/route.js:392-419` `handleChargeRefunded` — auto-freezes on apparent full refund. Prior session tightened the flag logic (commit 8984700) and added a notification (B11 partial). The **deferred tail** is the two related paths:
- `charge.refund.updated` (`status='reversed'`) handler + `billing_unfreeze` RPC — reversed-refund users stay frozen forever
- `charge.dispute.closed` handler — won-disputes leave the user frozen if a refund had fired; admin must unfreeze manually

Both require a `billing_unfreeze` RPC that doesn't exist yet. Design + migration + two handlers.

### B14 (Apple JWS timestamp), B17, B18

As noted above — if the owner wants these this session, they need:
- **B14**: craft a signed JWS test payload and gate on it (lib/appleReceipt.js already knows how to verify — add a `Math.abs(now - iat) < 5min` check + mock test).
- **B17**: teach `billing_cancel_subscription` to no-op instead of throw when user is already frozen.
- **B18**: add an audit_log mirror when webhook_log.processing_status transitions to `failed`.

### L12, L13, L19 (architectural)

- **L12**: plans table reads + 60s cache helper in lib/plans.js; migrate checkout + admin + settings callers to DB read. Tests.
- **L13**: Supabase Realtime channel on `roles` table → invalidate roles cache.
- **L19**: schema migration adding `push_claimed_at timestamp` or `pg_try_advisory_lock` RPC wrapper; concurrency-safe claim in cron/send-push.

---

## Owner action items still pending

1. **Apply schema/153, 154, 155, 156** via Supabase SQL editor. Every route works with the code defaults pre-apply, but the seeded rate-limit rows + the RPC + the unique index are all production-quality improvements.
2. **Create `avatars` Supabase Storage bucket** (carried from Session 1). Public read + own-folder upload RLS (mirror `banners`). Code already handles the "bucket not configured" case gracefully (commit 1c45eca).

---

## How to work — same as this session

- Pre-verified: every remaining item has a STALE / DEFERRED / open marker in the triage; the open ones carry the most context.
- **1 post-impl verifier per item** (2 if multi-surface). No 4-agent pre-impl on already-triaged work.
- **Commit per item** with `fix(#item): short title` + multi-line body.
- **`cd web && npx tsc --noEmit` must pass** every item. iOS ships blind (no xcodebuild).
- **Memory rules** (do not violate):
  - `feedback_genuine_fixes_not_patches.md` — kill the thing being replaced, no TODOs/HACKs
  - `feedback_no_keyboard_shortcuts.md` — admin UI is click-driven
  - `feedback_no_assumption_when_no_visibility.md` — when Vercel/Supabase/Apple dashboards are invisible, verify from code or ask
  - `feedback_verify_audit_findings_before_acting.md` — several items this session were STALE after verification (K7, K12, L9, L14, L15, L16, L20, B13, B20). Always quote current code before acting on a triage claim.
  - `feedback_mcp_verify_actual_schema_not_migration_log.md` — read live function/trigger bodies.

---

## When this session ends

Update `Current Projects/MASTER_TRIAGE_2026-04-23.md` with per-item SHIPPED blocks (date + commit SHA + files touched). Start a new session folder (`Sessions/<MM-DD-YYYY>/Session 1/COMPLETED_TASKS_<YYYY-MM-DD>.md`) or append to Session 2's if it's still the same day. Write `428_PROMPT.md` in the same shape.

Say "Ready." Wait for direction.
