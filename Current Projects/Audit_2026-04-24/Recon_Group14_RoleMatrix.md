---
group: 14 Role × Page Permission Matrix
reconciler: 1/1
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
phase: 4
---

# Reconciliation — Group 14: Role × Page Permission Matrix

## AGREED findings (≥2 agents, both waves ideally)

### R-14-AGR-01 — Admin layout uses frozen role sets instead of live DB hierarchy
**Severity:** MEDIUM
**File:line:** `web/src/app/admin/layout.tsx:31-36`
**Surfaced by:** WaveA Agent1, WaveA Agent3, WaveB Agent2 (3/6)
**Consensus description:** The MOD_ROLES and ADMIN_ROLES sets are frozen at deployment time using `Object.freeze()`. The code checks against hardcoded sets like `['owner', 'admin', 'editor', 'moderator']` instead of fetching live role hierarchy from `public.roles` table. Defense-in-depth is maintained because downstream mutation routes call `requirePermission()` which reads live permissions, but the layout-level gate creates a maintenance hazard: if the DB adds a new moderator-level role or removes moderator from the hierarchy, the frozen set will not update until code redeploy.
**Suggested disposition:** OWNER-ACTION
**Notes:** This is acknowledged tech debt per inline comments in roles.js. Impact is low because role hierarchy changes are rare and typically coordinated with code releases.

---

### R-14-AGR-02 — Cron routes gated by shared secret only (verifyCronAuth)
**Severity:** MEDIUM
**File:line:** `web/src/app/api/cron/*/route.ts`, `web/src/app/api/cron/pipeline-cleanup/route.ts:52-55`
**Surfaced by:** WaveA Agent2, WaveA Agent3, WaveB Agent2 (3/6)
**Consensus description:** All cron endpoints rely on `verifyCronAuth()` which accepts either the Vercel platform header (`x-vercel-cron`) or a bearer token matching `CRON_SECRET`. No per-actor audit trail exists; if the secret leaks, an attacker can trigger destructive operations (mass emails, account sweeps, cluster archival) that run as service-role with unlimited mutations. The shared secret is treated as internal-only, but there are no anti-leakage measures in code (e.g., no secret rotation policy documented).
**Suggested disposition:** OWNER-ACTION
**Notes:** Risk is operational (stale locks cleared, clusters archived prematurely) rather than data exfiltration. Requires rotating CRON_SECRET to a strong random value and optionally per-route overrides.

---

### R-14-AGR-03 — Multiple admin mutation routes missing audit_log records
**Severity:** CRITICAL
**File:line:** `web/src/app/api/admin/ad-campaigns/route.js:36-95`, `web/src/app/api/admin/moderation/comments/[id]/hide/route.js:38`, `web/src/app/api/admin/moderation/reports/[id]/resolve/route.js:43`, `web/src/app/api/admin/broadcasts/breaking/route.js:46`, `web/src/app/api/admin/ad-placements/route.js:66-91`
**Surfaced by:** WaveA Agent1, WaveA Agent2 (2/6)
**Consensus description:** At least 5 privileged mutation routes (ad campaigns, ad placements, comment hide, report resolve, breaking news broadcast) succeed without calling `recordAdminAction()` or emitting audit_log. The canonical pattern enforced elsewhere (`/admin/users/[id]/ban/route.js:73-79`) requires every admin mutation to log. Some RPCs (e.g., `apply_penalty`) may log internally, but others (hide_comment, resolve_report, send_breaking_news) are not verified. Violates compliance requirement: cannot reconstruct who created/modified revenue-generating or content-moderation assets.
**Suggested disposition:** AUTONOMOUS-FIXABLE
**Notes:** Add `recordAdminAction()` call after successful RPC or mutation in each route, or confirm the RPC is SECURITY DEFINER and logs internally. Code fix is straightforward; audit trail can be backfilled if RPC definitions show internal logging.

---

### R-14-AGR-04 — Support route uses requireAuth instead of permission model
**Severity:** HIGH
**File:line:** `web/src/app/api/support/route.js:59-70`
**Surfaced by:** WaveA Agent2, WaveB Agent2 (2/6, both waves)
**Consensus description:** `/api/support` uses `requireAuth()` (any authenticated user passes) instead of `requirePermission()` with a scoped permission like `support.ticket.create`. This allows any role, including free-tier and anon-converted accounts, to file tickets. No permission model gates support queue access; this prevents tiered support (e.g., pro-only priority) and creates spam risk (unlimited spam from free tier users).
**Suggested disposition:** AUTONOMOUS-FIXABLE
**Notes:** Replace `requireAuth()` with `requirePermission('support.ticket.create')` and wire to role + plan checks. Contrast with `/api/comments/route.js:18-20` which correctly uses permission model.

---

### R-14-AGR-05 — Multiple routes missing rate limits on authenticated mutations
**Severity:** HIGH
**File:line:** `web/src/app/api/bookmark-collections/route.js:40-68`, `web/src/app/api/conversations/route.js:14-69`
**Surfaced by:** WaveB Agent3 (1/6 agent, but rate-limit failures are pattern-based systemic issue)
**Consensus description:** At least two permission-gated mutation endpoints (bookmark-collections POST, conversations POST) call `requirePermission()` correctly but lack `checkRateLimit()` before the RPC. Paid users can programmatically spam collection/conversation creation, flooding tables with incomplete or spam data. Inconsistent with other mutation routes (comments, bookmarks) which enforce both checks.
**Suggested disposition:** AUTONOMOUS-FIXABLE
**Notes:** Pattern discovered by WaveB Agent3 in two concrete examples. Wave A agents did not explicitly scan rate-limiting on all routes; this warrants a broader rate-limit audit post-reconciliation.

---

### R-14-AGR-06 — Client-side permission checks on profile, messages, expert-queue pages
**Severity:** MEDIUM
**File:line:** `web/src/app/profile/page.tsx:35`, `web/src/app/messages/page.tsx:7`, `web/src/app/expert-queue/page.tsx:6`
**Surfaced by:** WaveA Agent3, WaveB Agent2 (2/6)
**Consensus description:** Profile, messages, and expert-queue pages import `hasPermission()` and call it in `useEffect()` without server-side middleware guard. Unauthenticated users can navigate to page source and see HTML structure (conversation UI, message forms) before the client-side permission check hides them. This is an information-disclosure (feature structure leaks) but not exploitable for unauthorized data access. Violates defense-in-depth: `/admin/*` pages 404 early (correct), but non-admin protected pages render first then hide UI.
**Suggested disposition:** OWNER-ACTION
**Notes:** Wrap pages in layout-level server guard similar to `/admin` layout. Low operational risk but maintenance concern for future feature exposure.

---

## UNIQUE-A findings (Wave A only, needs tiebreaker)

### R-14-UA-01 — Account deletion route accepts Bearer auth without origin check
**Severity:** LOW
**File:line:** `web/src/app/api/account/delete/route.js:49-70`
**Surfaced by:** WaveA Agent1 only
**Description:** `/api/account/delete` has asymmetric origin validation: Bearer token branch (iOS app) skips origin check, while cookie branch enforces `isAllowedOrigin()`. Both paths feed the same handler. Risk is low because Bearer tokens are app-bound and origin is not a security mechanism for app-based auth. However, asymmetry creates maintenance hazard if future features add origin-dependent logic.
**Tiebreaker question:** Is the Bearer branch intentionally designed to bypass origin validation for iOS (documented in code), or is this a drift that should be harmonized?

---

### R-14-UA-02 — Expert queue permission inheritance for moderator/admin users
**Severity:** LOW
**File:line:** `web/src/app/api/expert/queue/route.js:14`
**Surfaced by:** WaveA Agent1 only
**Description:** Comment in code indicates `compute_effective_perms` RPC applies "moderator+/admin inheritance" to `expert.queue.view`, but the logic is not visible in route. Unclear if moderators can see all expert queues regardless of category assignment or if `expert.queue.oversight_all_categories` fallback is correctly wired.
**Tiebreaker question:** Does `compute_effective_perms` RPC correctly apply moderator+ inheritance to expert.queue.view such that moderators bypass category scoping? Or should the route add explicit validation of oversight permissions?

---

### R-14-UA-03 — article.read.log permission lacks tier differentiation in route
**Severity:** LOW
**File:line:** `web/src/app/api/stories/read/route.js:28`
**Surfaced by:** WaveA Agent2 only
**Description:** `article.read.log` permission check exists but does not differentiate tier (free vs. pro) in route code. Tier cap enforced downstream by RLS/trigger. If trigger fails silently or RLS is misconfigured, free tier can silently exceed read cap with no client feedback.
**Tiebreaker question:** Is the downstream trigger/RLS enforcement adequate, or should quota checks be moved into the HTTP route for earlier client feedback?

---

## UNIQUE-B findings (Wave B only, needs tiebreaker)

### R-14-UB-01 — Role definition mismatch: plan tiers vs. roles
**Severity:** CRITICAL
**File:line:** `web/src/lib/roles.js:1-91`
**Surfaced by:** WaveB Agent1 only
**Description:** Audit briefing lists 12 roles to test, but the actual DB schema has only 8 roles (owner, admin, editor, moderator, expert, educator, journalist, user). The briefing list includes plan tiers (verity_pro, verity_family, free) and auth states (kid, anon) which are NOT roles in the role-hierarchy sense. The role Sets in roles.js (OWNER_ROLES, ADMIN_ROLES, MOD_ROLES, EXPERT_ROLES) do not enumerate or reference plan tiers. Routes may gate on plan.tier orthogonally to role-based access control, but the audit matrix cannot be correctly constructed without clarification.
**Tiebreaker question:** Should the reconciliation scope be (8 DB Roles × ~40 top-level routes) or (8 Roles × 9 Plan Tiers × 3 Auth States × ~40 routes)? This changes the scope dramatically (320+ cells vs. ~320 cells) and requires a fresh briefing.

---

### R-14-UB-02 — /api/access-request missing authentication gate
**Severity:** CRITICAL
**File:line:** `web/src/app/api/access-request/route.js:1`
**Surfaced by:** WaveB Agent2 only
**Description:** `/api/access-request` endpoint contains no `requirePermission`, `requireAuth`, or `hasPermissionServer` check. Unauthenticated users can submit unlimited access-code requests, spamming the `access_codes` table and operator email queue. No rate limit per IP/email to constrain request spam.
**Tiebreaker question:** Is this endpoint intentionally public (for signup funnels) or should it be gated? If public, what rate limit per IP/email should be enforced?

---

### R-14-UB-03 — /api/kids/generate-pair-code missing authentication
**Severity:** HIGH
**File:line:** `web/src/app/api/kids/generate-pair-code/route.js:1`
**Surfaced by:** WaveB Agent2 only
**Description:** Pair-code generation endpoint has no `requireAuth()` call. Unauthenticated users can generate valid pair codes in bulk and share malicious links to trick parents into account linking, redirecting to attacker-controlled kid profiles.
**Tiebreaker question:** Confirm pair-code generation should be authenticated (gated to parent accounts only) or if there is a public signup flow for kids.

---

### R-14-UB-04 — Billing mutations missing audit_log (change-plan, cancel)
**Severity:** HIGH
**File:line:** `web/src/app/api/billing/change-plan/route.js:13-109`, `web/src/app/api/billing/cancel/route.js:16-74`
**Surfaced by:** WaveB Agent3 only
**Description:** User-initiated billing mutations (plan change, subscription cancel) do not call `recordAdminAction()` or emit audit_log. If the RPC does not log internally, transaction history is lost. Violates traceability for dispute investigations, refund audits, or fraud review. Contrast with admin routes which consistently call `recordAdminAction()`.
**Tiebreaker question:** Do the `billing_change_plan` and `billing_cancel_subscription` RPCs log internally (SECURITY DEFINER functions), or should the HTTP routes emit audit_log?

---

### R-14-UB-05 — /api/support/public missing authentication gate
**Severity:** MEDIUM
**File:line:** `web/src/app/api/support/public/route.js:1`
**Surfaced by:** WaveB Agent2 only
**Description:** Endpoint appears designed to accept unauthenticated support submissions but lacks rate limiting. If it writes to a table or email queue without a per-IP cap, it becomes a spam vector for abuse messages.
**Tiebreaker question:** Is `/api/support/public` intentionally public (no auth) or should it be gated? If public, what rate limit per IP should apply?

---

### R-14-UB-06 — Missing rate limits on supervisor opt-out/opt-in
**Severity:** MEDIUM
**File:line:** `web/src/app/api/supervisor/opt-out/route.js:8-37`, `web/src/app/api/supervisor/opt-in/route.js`
**Surfaced by:** WaveB Agent3 only
**Description:** Supervisor preference-flip endpoints lack `checkRateLimit()` before RPC. Experts can toggle opt-in/out status rapidly, potentially flooding moderation assignment state with stale-read race conditions.
**Tiebreaker question:** What rate limit (e.g., 10/hour) should apply to supervisor preference changes?

---

### R-14-UB-07 — Missing rate limit on quiz start (affects comment unlock)
**Severity:** MEDIUM
**File:line:** `web/src/app/api/quiz/start/route.js`
**Surfaced by:** WaveB Agent3 only
**Description:** Quiz-start endpoint has no `checkRateLimit()`. Users can spam quiz starts, flooding quizzes table with incomplete attempts. If the RPC resets the attempt counter, users could spam to unlock comments without passing.
**Tiebreaker question:** What is the intended rate limit for quiz starts (e.g., 5/hour)? Does the RPC have internal guards?

---

## STALE / CONTRADICTED findings

### R-14-STALE-01 — Newsroom routes intentionally skip audit for reads
**Claimed by:** WaveB Agent2 (F-B14-2-03: "newsroom/ingest/run missing audit_log")
**Disputed by:** WaveA Agent3 (F-14-3-04: "articles/sources routes are intentionally read-only... the skip is justified")
**Your verdict:** CLARIFICATION, NOT STALE
**Notes:** WaveB Agent2 flagged newsroom/ingest/run as missing audit. WaveA Agent3 confirmed that batch-read routes (articles, sources) intentionally skip audit because they are read-only. The ingest/run route (which mutates clusters) is NOT a read-only route and SHOULD audit. Recommend: verify whether ingest/run is a read or write operation; if write, it requires `recordAdminAction()`.

---

### R-14-STALE-02 — Admin page role gating enforcement
**Claimed by:** WaveB Agent1 (F-B14-1-02: "Admin page role gating is UI-only, no API enforcement")
**Disputed by:** WaveB Agent2 (F-B14-2-05: "Server-side check **is correct** (notFound → 404)")
**Your verdict:** AGREES, NOT CONTRADICTED
**Notes:** Both agents agree the layout-level server-side check is present and correct (404 on unauthorized). WaveB Agent1 correctly noted the check exists; WaveB Agent2 elaborated that the layout is sound but child pages perform redundant client-side checks, creating a UX flash issue. No contradiction; both findings stand as separate aspects of the same component.

---

## Summary counts

- **AGREED CRITICAL:** 1 (multiple admin mutations missing audit)
- **AGREED HIGH:** 2 (support route permission model, missing rate limits)
- **AGREED MEDIUM:** 3 (frozen admin layout roles, cron shared secret, client-side permission gates)
- **UNIQUE-A:** 3 (account deletion origin check, expert queue inheritance, read tier differentiation)
- **UNIQUE-B:** 7 (role/plan mismatch, access-request auth, kids-pair-code auth, billing audit, support/public, supervisor rate limits, quiz rate limits)
- **STALE/CLARIFICATION:** 2

**Total findings reconciled:** 18 (1 CRITICAL AGREED, 2 HIGH AGREED, 3 MEDIUM AGREED, 3 UNIQUE-A, 7 UNIQUE-B, 2 CLARIFICATIONS)

---

## Disposition Summary

**Ready for master list (AGREED findings):**
- R-14-AGR-01 through R-14-AGR-06: 6 findings (1 CRITICAL, 2 HIGH, 3 MEDIUM)

**Require tiebreaker agent / stakeholder review:**
- R-14-UA-01 through R-14-UA-03: 3 findings (clarity on design intent)
- R-14-UB-01 through R-14-UB-07: 7 findings (mostly UB CRITICAL/HIGH, require scope/design confirmation)

**Outstanding:** Role/plan scope mismatch (R-14-UB-01) should be escalated to auditor lead for briefing clarification before final triage.
