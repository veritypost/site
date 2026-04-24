# Next-session handoff — pick up from Session 1 (2026-04-23)

Read `Reference/STATUS.md` first. Then this. Then `Current Projects/MASTER_TRIAGE_2026-04-23.md` for the full open-item inventory.

## What just shipped (this session, 2026-04-23)

11-agent + 4-verifier review sweep produced `Current Projects/MASTER_TRIAGE_2026-04-23.md`. Then **Option A (Tier 0 + Tier 1, 9 items) shipped** with the 6-agent ship pattern (4 pre-impl + 2 post-impl) per item:

| # | Bug | Commit |
|---|-----|--------|
| 1 | `roles` DELETE undefined `assertActorOutranksTarget` | `4a59752` |
| 2 | `billing/cancel` + `freeze` undefined `actor` | `4a59752` |
| 3 | `email-change` flip-before-resend lockout | `a33a030` |
| 4 | iOS quiz pass at 70% via integer math | `7afc0bf` |
| 5 | `profile/[id]` direct follow/block bypass | RESOLVED-BY-9 (`11986e8`) |
| 6 | PasswordCard `signInWithPassword` bypass | `6e13089` |
| 7 | `Ad.jsx` `click_url` no scheme validation | `e0cf1af` |
| 8 | CSS injection via `backgroundImage: url(${...})` | `ccffa86` |
| 9 | `profile/[id]` tab nav broken — kill-switched both `/profile/[id]` AND `/u/[username]` behind `<UnderConstruction>` | `11986e8` |

Plus a build fix `web/src/app/messages/page.tsx` Suspense wrap (was blocking Vercel builds).

## What to do FIRST in the new session

1. **Verify last Vercel deploy is green.** `gh run list --limit 5` or the Vercel dashboard. Last commit pushed: `6e13089`.
2. **Owner action needed — apply 1 migration**: `schema/146_seed_verify_password_rate_limit.sql` (the verify-password rate-limit policy). Code is safe without it (uses inline fallback `max:5, windowSec:3600`) but the migration enables runtime tuning via admin UI. MCP was read-only this session so I couldn't apply it.
3. **Confirm `NEXT_PUBLIC_SITE_URL` is set in Vercel** for production AND preview environments. Set this session — verify it's still there.

## The recommended next cut

Per the master triage, after Option A the highest-impact open items are:

### Recommended first item to ship: **B1 — Webhooks don't bump `perms_version`**

**File refs:**
- `web/src/app/api/stripe/webhook/route.js:320-385` (handleSubscriptionUpdated, handleCheckoutCompleted)
- `web/src/app/api/ios/appstore/notifications/route.js:201-246` (SUBSCRIBED/DID_RENEW handlers)
- `schema/011_phase3_billing_helpers.sql:140-147` (billing_freeze_profile RPC)

**The bug:** Stripe + Apple webhooks call `billing_change_plan()` / `billing_resubscribe()` / `billing_freeze_profile()` to update `users.plan_id` but NEVER call `bump_user_perms_version`. Admin manual-sync route DOES bump. Result: user pays for upgrade → permission cache stays stale → paid features denied. Frozen user retains paid features until cache refresh.

**Reference implementation already exists:** `web/src/app/api/admin/subscriptions/[id]/manual-sync/route.js:166-169` calls `bump_user_perms_version({p_user_id: ...})`. Same shape applies to webhook handlers.

**Why this first:**
- Money — every paid plan change today silently misbehaves
- Surgical — add 3-4 `await service.rpc('bump_user_perms_version', ...)` calls in known locations
- Same pattern as admin manual-sync (proven)
- No new endpoint, no new migration

### Recommended second: **B3 — iOS receipt hijack via missing `appAccountToken` check**

**File ref:** `web/src/app/api/ios/subscriptions/sync/route.js:26-73`

**The bug:** Server derives `userId` from bearer token, never cross-checks against the JWS `payload.appAccountToken`. Attacker with their own session can POST a victim's receipt and claim the victim's paid subscription onto their own account.

**The fix:** After JWS verification, add `if (payload.appAccountToken && payload.appAccountToken !== userId) { return 403 }`.

**Why this second:**
- Account-takeover vector — clean exploit path
- iOS app required to set `appAccountToken` to user's UUID at purchase time. Verify the iOS code does this in `StoreManager.swift` BEFORE shipping the server check (otherwise you'll lock out legitimate purchases).

### Then in priority order:

- **L1 — `robots.js` ↔ middleware SEO leak** on `/category` + `/card` (single-file fix to `web/src/middleware.js` + `web/src/app/robots.js`; categories should be public)
- **L2 — `permissions.js` stale-fallthrough on revocation** (in `web/src/lib/permissions.js:67-85`)
- **K1+K2 — Kids iOS V3 celebration unwired + JWT 7-day expiry no refresh** (kids launch blockers; only matters if kids ships near-term)
- **B5 — Promo redeem races webhook** for `users.plan_id` divergence

## How to work

Same 6-agent ship pattern per item per CLAUDE.md:
1. 4 pre-impl agents (3 investigators + 1 adversary, `subagent_type: "Explore"`, no shared context)
2. Synthesize (3-vs-1 splits → take majority unless adversary names a real blocker; per-memory `feedback_divergence_resolution_4_independent_agents.md`, dispatch 4 fresh agents on the disputed point if you can't resolve)
3. Implement minimal scope; don't fold in cleanup
4. Typecheck (`cd web && npx tsc --noEmit`); for iOS items also `xcodebuild -project VerityPost/VerityPost.xcodeproj -scheme VerityPost -destination 'generic/platform=iOS' build`
5. 2 post-impl verifiers (parallel, full trace through all input cases)
6. Commit + push (lefthook will lint + prettier on the staged files)

Per CLAUDE.md: minimal scope, fix all of it (adjacent callers in same commit), no scope expansion without naming it. Memory `feedback_genuine_fixes_not_patches.md` — kill the thing being replaced; no parallel paths; no TODOs/HACKs.

## Triage source files

- `Current Projects/MASTER_TRIAGE_2026-04-23.md` — full inventory, 244 open items, ranked by corroboration count from 11-agent sweep
- `Sessions/04-23-2026/Session 1/SESSION_LOG_2026-04-23.md` (if it exists yet — may need to create at session close)

## Open agent reports (raw, for reference)

Located at `/private/tmp/claude-501/-Users-veritypost-Desktop-verity-post/cac30464-d918-4b28-bccd-54b4bf063dcf/tasks/`:
- 3 zone-split (settings / API / components) + 4 round-2 unified (A/B/C/D) + 4 round-3 specialised (Kids iOS / Admin UI / Billing+IAP / Cron+lib)

Don't read these end-to-end — they're huge JSONL transcripts. The triage file already extracted everything.

## Anything weird that happened this session

- Vercel build broke twice from prior commit `2bad85c`:
  1. `_not-found` page-data collection failed with "NEXT_PUBLIC_SITE_URL is required in production" (env var missing — fixed by owner setting it in Vercel; the throw at `lib/siteUrl.js:27` is intentional, don't soften it)
  2. `/messages` page used `useSearchParams()` without Suspense boundary — fixed in commit `4a59752` by wrapping `MessagesPage` body in `<Suspense fallback={null}>`
- Item 9 owner pivoted mid-flight: replaced both `/profile/[id]` and `/u/[username]` with `<UnderConstruction>` instead of just dropping tabs. Single-line revert: flip `PUBLIC_PROFILE_ENABLED = true` in `/u/[username]/page.tsx`.
- Item 5 closed-via-9 (the bypass code is gone with the page).
- Adversary D for item 4 raised "iOS not shippable yet (Apple block)" as a "blocker" — overruled per memory `project_apple_console_walkthrough_pending.md` (owner has dev account; iOS bug fixes ship now, only publishing is gated).

Ready for the next cut.
