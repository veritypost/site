# Owner To-Do — 2026-04-24

Everything below requires your hands. Claude can't execute these. All other audit decisions are locked and Claude will execute on your GO signal for Phase 7.

Tackle in any order. Each is independent unless noted.

---

## URGENT — blocks prod or has security risk

### TODO-1. Fix Supabase URL typo in Vercel env vars
- **Where:** Vercel → project → Settings → Environment Variables
- **What:** Correct the malformed Supabase URL, redeploy
- **Impact:** Blocks all auth/DB on prod
- **Time:** ~2 min + redeploy

### TODO-2. Remove ex-dev from Vercel project
- **Where:** Vercel → project → Members
- **What:** Remove former dev's access
- **Impact:** Security — unauthorized project access
- **Time:** 30 sec

---

## Infra — do this week

### TODO-3. Enable `pg_cron` in Supabase
- **Where:** Supabase Console → Database → Extensions
- **What:** Toggle `pg_cron` on
- **Impact:** Unblocks grace-period sweeper + kid-trial sweep + anonymize-users cron jobs
- **Time:** 2 min

### TODO-4. Start Apple Developer enrollment
- **Where:** developer.apple.com → Enroll
- **Why now:** Apple review takes days to weeks. Start in parallel with web launch prep — no reason to wait.
- **Doesn't block:** iOS development (both iOS apps continue to work locally and stay production-ready)
- **Does block:** iOS app publishing, TestFlight, APNs `.p8` auth key, Universal Links `apple-app-site-association`
- **Time:** 15 min to start; then wait

### TODO-5. Stripe live-mode audit + webhook test
- **Where:** Stripe Dashboard → Developers → Webhooks
- **What:** Verify your webhook endpoint is healthy; fire test events from the Stripe dashboard for:
  - `customer.subscription.updated`
  - `invoice.payment_succeeded`
  - `invoice.upcoming`
- **Check:** each event lands at your endpoint, returns 200, and shows up in `webhook_log` table in Supabase
- **Time:** 30–60 min

---

## Verification — pasteback requests

Claude needs the output of these to resolve open audit items. Copy + paste the result back in chat.

### TODO-6. Migration state verification
- **Where:** Supabase SQL editor
- **Run:**
  ```sql
  SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 20;
  ```
- **What it tells me:** Whether migrations 148 (billing RPC bumps), 120 (pipeline error_type column), and 160 (avatars bucket) are actually deployed. Resolves several "needs verification" items on the master fix list.
- **Time:** 30 sec

### TODO-7. Permissions matrix drift check
- **Where:** Local terminal, in repo root
- **Run:**
  ```bash
  cd web && node ../scripts/import-permissions.js --dry-run
  ```
- **Paste:** the diff output
- **What it tells me:** Whether `permissions.xlsx` and the live `permissions` table are in sync, or drift exists that needs reconciling.
- **Time:** 1 min

---

## Dev-env — optional but helpful

### TODO-8. Set `PREVIEW_BYPASS_TOKEN` in `web/.env.local`
- **Where:** `web/.env.local` (create if missing)
- **What:** Add `PREVIEW_BYPASS_TOKEN=any-random-string-you-pick`
- **Why:** Lets future audit agents and Claude run end-to-end UI smoke tests behind the coming-soon wall. Without it, agents can only read code — they can't click through the real app flows.
- **Prod risk:** Zero (it's a local dev env var, never deployed)
- **Time:** 1 min

---

## Standing decisions

- **Sentry activation (TODO-9):** Staying deferred until monetization + real traffic. No action unless that pain point arrives.

---

## When you're done with TODO-1 through TODO-7

Reply "GO" and Claude fires Phase 7 implementation. The plan locked in from your answers:

**CRITICAL fixes going first:**
1. Comments RLS status mismatch → RLS accepts `visible` (the UI-COMMENTS root cause)
2. Settings concurrent metadata clobber → server-side atomic `jsonb_set` RPC (the UI-SETTINGS root cause)
3. Unblock direct-delete → route through `/api/users/[id]/block` DELETE
4. Data export bypasses gate → new `POST /api/data/export-request` with permission + rate limit
5. Signup orphaning → transactional rollback across auth + public.users
6. Messages page stale-closure chain → fix all 5 broken `useEffect` dep arrays
7. Story page stale-closure → fix dep arrays
8. Admin numeric settings edits lost on navigate → persist on change + dirty-state guard
9. Bookmarks duplicate POST + permission mismatch → dedup + split PATCH gates
10. Home page inactive-category filter → one-line fix
11. Kid pair-code TOCTOU → atomic check-and-update SQL
12. Kids quiz threshold → move to `kids.quiz.pass_threshold_pct` DB setting; server returns `is_passed`
13. Kids COPPA → pair-time gate + `parental_consents` DB row; keep Unpair/link/expert-session gates
14. Bearer token global-header leak → per-request auth + logout clears
15. Streak/badge persistence → defer state update until write succeeds
16. StoreKit sync verification → surface `.vpSubscriptionSyncFailed` + defer `.finish()` until server ack
17. APNs `registerIfPermitted()` → actually call it post-login
18. Permission cache invalidation → call on login + tokenRefresh + settings save
19. Admin audit_log coverage → role grant/revoke, billing freeze/cancel, 4 moderation routes, 3 more admin routes, iOS billing, user-facing billing, plus actor_id threading
20. Client HIERARCHY drift → read from DB
21. Penalty buttons → disable by hierarchy
22. Prompt preset versioning → schema + history table + snapshot on mutation
23. 4 cron routes → add `maxDuration` exports
24. 14 RLS-no-policies tables → Claude classifies, you greenlight, policies added
25. `reset_and_rebuild_v2.sql` → regenerated from current schema
26. 3 unauthed endpoints → honeypots + auth + rate limits per the Q13 plan
27. `handlePaymentSucceeded` → add `bump_user_perms_version`
28. Doc consolidation → retire FIX_SESSION_1.md, archive prompt files (standalone commit first)
29. Plagiarism check → soft-degrade with `needs_manual_review` flag
30. Verify-email → dedicated `rate_limited` state
31. Feed card → Cancel/Revert button
32. Permission rename → `bulk_resolve` → `resolve` + new `list`
33. Password reset copy → "If that account exists..."
34. Q-SOLO batch verification + Q18 HIGH-severity tiebreaker pass

**HIGH + MEDIUM** fixes after CRITICALs — same flow, paired implementer + reviewer agents, no merge without sign-off.

**Blocked by you:**
- TODO-6 + TODO-7 results (informs which recent fixes need verification vs are already live)
- Q14 (c) RLS classifications — Claude produces the list once you say GO; you spot-check + greenlight

**Reviewers:**
- Each CRITICAL fix ships with 1 implementer + 1 live reviewer (pre-merge diff check)
- Admin-surface fixes run the 6-agent ship pattern per CLAUDE.md
- Phase 8: 1-2 independent agents verify each merged fix
