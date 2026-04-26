# Owner Actions — 2026-04-24

**Bucket B: items requiring external dashboards, product/design decisions, or direct owner access that Claude cannot execute.**

Two sections: **(1) Infra / external dashboards** — things only you can log into. **(2) Product / design decisions** — items where code could go two valid ways; Claude needs direction before executing. For every (2) item, Claude already has the fix ready — you just pick the path.

---

## 1. Infra / external dashboards — you-only

### O-INFRA-01. Supabase URL typo in Vercel env (URGENT)
- **Source:** PM punchlist 00-C
- **Impact:** Blocks all auth/DB on prod
- **Action:** Vercel → project → Environment Variables → fix the typo → redeploy
- **Time:** ~2 min + redeploy

### O-INFRA-02. Remove ex-dev from Vercel (SECURITY-CRITICAL)
- **Source:** PM punchlist 00-J
- **Impact:** Unauthorized project access
- **Action:** Vercel → project → Members → remove
- **Time:** 30 sec

### O-INFRA-03. Enable `pg_cron` extension
- **Source:** PM punchlist 00-A
- **Impact:** Grace-period sweeper + kid-trial sweep + anonymize-users currently unscheduled
- **Action:** Supabase Console → Database → Extensions → enable `pg_cron`. Or swap to Vercel cron.
- **Time:** 2 min Supabase, 15 min Vercel-alt

### O-INFRA-04. Apple Developer enrollment
- **Source:** PM punchlist 00-I
- **Impact:** iOS publishing gated — does NOT block iOS development. TestFlight, App Store, APNs `.p8`, Universal Links all pending.
- **Action:** developer.apple.com enrollment
- **Time:** 15 min start + Apple review

### O-INFRA-05. Stripe live-mode audit + webhook test
- **Source:** PM punchlist 00-G
- **Action:** Stripe Dashboard → Developers → Webhooks → verify endpoint health; fire test events for `customer.subscription.updated`, `invoice.payment_succeeded`, `invoice.upcoming`
- **Time:** 30–60 min

### O-INFRA-06. Sentry DSN (deferred per your earlier memory)
- **Source:** PM punchlist 00-D
- **Status:** Deferred, post-launch per your signal when monetization/paging pain begins

### O-INFRA-07. Confirm production status of schema migrations that matter for launch
- **Impact:** Multiple audit findings reference migrations whose DB-live status Claude can't verify with MCP disconnected.
- **Action needed:** On Supabase Console SQL editor, run the queries in `OWNER_VERIFY_SQL.md` (Claude will generate on request) and paste results.
- **Specific items to confirm:**
  - Migration 148 fully deployed (B1/B3/B6 closures depend on it)
  - Migration 120 deployed (pipeline retry route reads `error_type` column)
  - Permission-matrix xlsx ↔ DB 1:1 verify (run `scripts/import-permissions.js --dry-run` and paste diff)

### O-INFRA-08. Kill switches + coming-soon bypass
- **Impact:** Audit agents could not reach authenticated flows in dev (PREVIEW_BYPASS_TOKEN not in local env)
- **Action:** If you want Claude agents to smoke-test UI end-to-end in future audits, set `PREVIEW_BYPASS_TOKEN` in `web/.env.local`
- **Time:** 1 min

---

## 2. Product / design decisions — you pick, Claude executes

Each item has the fix code-ready but could reasonably go more than one way. Pick a path; Claude moves.

### O-DESIGN-01. Comments status enum — `'visible'` or `'published'`? (blocks C1)
- **Context:** RPC inserts `visible`, RLS SELECT requires `published`, client filters `visible`. All three must agree. 5 of 6 agents identified this as the UI-COMMENTS root cause.
- **Option A:** Canonicalize on `'visible'` — change RLS policy to accept it. Implies `visible` = publicly-viewable, and a different state for moderation-pending ("hidden"/"pending"). Minimal code change.
- **Option B:** Canonicalize on `'published'` — change RPC to insert `published`. Implies comment lifecycle mirrors article lifecycle (draft/published/archived). More semantic.
- **Recommendation:** **A** — simpler, matches client expectation, preserves moderation pipeline. But your call.

### O-DESIGN-02. Password reset silent-success behavior (blocks H1-adjacent)
- **Context:** Reset endpoint returns 200 even when rate-limited, preventing email enumeration. But user sees success, email never arrives, confused retry loop.
- **Option A:** Keep current (security-first — never leak which emails exist). Add copy: "If that account exists, you'll receive an email shortly."
- **Option B:** Return 429 explicitly (match `resend-verification`). Acknowledges enumeration tradeoff but UX transparency.
- **Recommendation:** **A** with better copy. Standard industry tradeoff.

### O-DESIGN-03. Coming-soon wall scope (**critical — needs immediate verification**)
- **Context:** One wave-B agent claimed coming-soon middleware is blocking `/signup`, `/login`, `/verify-email`, `/forgot-password`, `/reset-password` for unauthed users — which would mean no one can sign up or verify right now. I re-read the middleware earlier and I don't think this is true, but I want to verify before the master list calls it autonomous.
- **Action:** Do you expect `/signup` to be reachable on prod right now? If yes, this is a stale finding (no fix needed). If no, R-1-AGR-06 escalates to CRITICAL and Claude fixes.
- **Other question:** After login, should users be forced through `/welcome` even if they have an `?next=` URL until onboarding_completed_at is set? One agent flagged post-auth bypass of coming-soon for authed users with custom `?next=`.

### O-DESIGN-04. Verify-email: 429 vs 'expired' state (blocks H1)
- **Context:** UI currently conflates rate-limit lockout with link expiry; user in the 429 loop keeps hitting resend in an "expired" state.
- **Option A:** Add dedicated `rate_limited` status + copy ("Try again in X seconds"). Cleanest.
- **Option B:** Show the 429 message in the existing expired state without state change.
- **Recommendation:** **A**.

### O-DESIGN-05. Feed preferences: add Cancel/Revert button? (from G4 AGR-05)
- **Context:** FeedCard has Save but no Cancel, unlike ProfileCard which has both. Users can't discard unsaved changes without losing server state.
- **Option A:** Add Cancel button that resets form to last-saved state.
- **Option B:** Keep current; Save-only is intentional.
- **Recommendation:** **A**. Parity with ProfileCard.

### O-DESIGN-06. Kids COPPA gate placement (blocks C15)
- **Context:** `reading_log` and `quiz_attempts` currently write before parental gate. Options to fix:
- **Option A:** Fire `ParentalGateModal` at pair time once, then trust the paired state.
- **Option B:** Fire `ParentalGateModal` on first quiz attempt / first article open per session.
- **Option C:** Fire `ParentalGateModal` on every state-changing action (heaviest, most COPPA-conservative).
- **Recommendation:** **A**. The pair flow is where a parent is presumed present; requiring a second gate for same-session activity is noisy and undercuts the product. But Apple's Kids Category review may require **C** — your call based on App Store policy.

### O-DESIGN-07. Plagiarism check: fail-closed or soft-degrade? (from G8 AGR-04)
- **Context:** When plagiarism-rewrite LLM call fails, current code returns original body with `cost_usd=0`. Potentially ships plagiarized content; underreports spend.
- **Option A:** Fail-closed — abort the generation entirely, surface to operator.
- **Option B:** Soft-degrade but signal — persist with `needs_manual_review: true` + explicit cost estimate.
- **Option C:** Current (silent fallback).
- **Recommendation:** **B**. Preserves throughput while giving operators visibility.

### O-DESIGN-08. iOS / user-facing / admin billing audit_log scope (blocks 4 items in C-range)
- **Context:** Stripe webhook handlers audit correctly; iOS receipt handlers, user-facing billing routes (`/api/billing/change-plan`, `/cancel`, `/resubscribe`), and admin billing routes (`/admin/billing/freeze`, `/cancel`) all skip `recordAdminAction`.
- **Question:** Do you want `audit_log` as the canonical trail for ALL billing mutations (compliance), or is `subscription_events` sufficient for user-initiated ones?
- **Recommendation:** Audit all billing mutations — compliance, forensics, fraud investigation. Claude will add the calls + thread `actor_id` through admin RPCs so admin freezes record the admin, not the affected user.

### O-DESIGN-09. Permission naming: `bulk_resolve` for single-item routes (from G7 AGR-04)
- **Context:** `admin.moderation.reports.bulk_resolve` permission gates both list and single-item resolve, which is semantically confusing.
- **Option A:** Rename to `admin.moderation.reports.resolve`; add separate `admin.moderation.reports.list` for GET.
- **Option B:** Keep current (coarse grouping acceptable).
- **Recommendation:** **A**. Clean naming; minimal code churn.

### O-DESIGN-10. Kids scoring threshold — where does it live? (blocks C14)
- **Context:** 60% hardcoded in iOS. Fix is to move to DB settings table.
- **Question:** Under which `settings` key? Any per-category override needed? Recommendation: `kids.quiz.pass_threshold_pct`, single global value.
- **Recommendation:** Single global. Claude picks key name unless you want specific naming.

### O-DESIGN-11. Quiz result response should return `is_passed` from server (from R-9-2-06 Wave A)
- **Context:** Client currently computes pass/fail locally. Even if threshold moves to DB, the iOS client still evaluates it. Cleaner: server computes on attempt insert and returns.
- **Option A:** Server computes + returns is_passed; client trusts server.
- **Option B:** Client fetches threshold + computes; server re-validates but doesn't return verdict.
- **Recommendation:** **A**. Eliminates any divergence risk; single source of truth.

### O-DESIGN-12. `access-request` + `support/public` + `generate-pair-code` auth model (blocks C28)
- **Context:** Currently unauthenticated and unthrottled.
- **Question:** Should these be auth-required (dropping the "public" semantic) or remain public with CAPTCHA + rate limit?
- **Options per endpoint:**
  - `access-request`: public with CAPTCHA (form entry from marketing)
  - `support/public`: public with CAPTCHA (contact form from marketing)
  - `kids/generate-pair-code`: auth-required (only parents should be able to generate codes from authed adult app)
- **Recommendation:** As above per endpoint.

### O-DESIGN-13. 14 tables with RLS-enabled-but-no-policies (blocks C26)
- **Context:** Group 12 identified: `weekly_recap_*`, `kid_expert_*`, `family_achievements`, 11 others. All currently silent-fail on DML (empty reads, invisible writes).
- **Question per table class:**
  - Are these meant to be service-role-only (disable RLS)?
  - Or meant to be user-accessible (add per-table policies)?
- **Action:** Claude will produce table-by-table classification when you want it; you confirm; Claude ships migrations.

### O-DESIGN-14. Rate-limit threshold uniformity (from G7 M1)
- **Context:** Rate limits vary across mutations without clear rationale — `penalty` 10/60s, `appeals resolve` 30/60s, `role revoke` 30/60s, `user ban` 10/60s. Similar-destructiveness actions have different thresholds.
- **Question:** Do you want uniform thresholds by destructiveness tier (e.g., "destructive = 10/60s", "administrative = 30/60s"), or keep per-route judgment?
- **Recommendation:** Tier them — destructive ≤ 10/60s, admin-helper ≤ 30/60s.

### O-DESIGN-15. Tracker consolidation (housekeeping)
- **Context:** `FIX_SESSION_1.md` + `MASTER_TRIAGE_2026-04-23.md` coexist; CLAUDE.md still points at FIX_SESSION_1.md; 424/426/427_PROMPT.md clutter the repo root.
- **Action proposal:** Retire FIX_SESSION_1.md (archive to `Archived/`), repoint CLAUDE.md at MASTER_TRIAGE, archive the prompt files.
- **Recommendation:** Do this as part of Phase 7 merge — one small cleanup commit.

---

## Summary

- **8 infra/dashboard items** — only you can execute
- **15 product/design items** — pick direction, Claude executes
- Items 03 (coming-soon scope) and 08 (billing audit scope) are the two biggest unknowns; everything else has a recommendation.

Greenlight each item individually, in batches, or reject. Claude holds until direction given.
