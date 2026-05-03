# Session 2 — Auth Flow Fixes

**You are the architect for this session.** Fresh conversation. Read this doc fully, then read `/Users/veritypost/Desktop/verity-post/REVIEW_REPORT.md` (top synthesis + `## PM-1 — Web-Public` + relevant items in `## PM-11 — Adversary-Sweep`), then start.

## Prerequisite

Session 1 (DB / RLS) must be marked complete in its `## Status` block. If it isn't, stop and tell the owner.

## Mandatory reads

1. `/Users/veritypost/Desktop/verity-post/REVIEW_REPORT.md` — PM-1 section + PM-11 auth items.
2. `/Users/veritypost/Desktop/CLAUDE.md` — kill-switch row #4 (OAUTH_ENABLED).
3. Owner memory:
   - `feedback_genuine_fixes_not_patches.md` — full integration, no parallel paths.
   - `feedback_cross_platform_consistency.md` — auth changes touch web + iOS-adult; verify iOS analog or state "not applicable" explicitly.
   - `feedback_no_user_facing_timelines.md` — copy must not promise "soon".

## Locked decisions (from owner, 2026-05-03)

- **Q04 Email-change recent-auth:** Option A. Read `public.users.last_login_at` (already populated by `runReturningUserBookkeeping`; `auth.users.last_sign_in_at` and `last_login_at` drift by ~0s). Add a reusable `assertRecentAuth(user, maxAgeMs = 900_000)` helper in `web/src/lib/auth.js` near `requireVerifiedEmail`. Replace the inline check at `web/src/app/api/auth/email-change/route.js:57-63` with the helper. iOS uses Supabase SDK directly for email change — **N/A**.
- **Q05 Magic-link prefetch:** Option D — drop the clickable button from the email entirely. Send only the 8-digit OTP. Edits: `web/src/lib/magicLinkEmail.ts` (remove button block), `web/src/app/api/auth/send-magic-link/route.js` (stop building actionLink), `web/src/app/api/auth/confirm/route.ts` (turn into a no-op-redirect to `/login?error=link_deprecated` for stale-link grace, two-week grace then delete). iOS: `AuthViewModel.swift:handleDeepLink` magiclink branch stays as a stale-link safety net; the typed-OTP path was already shipping.

## Scope

### P0 (must close)
1. **PM-1 / Q04** — Email-change endpoint reads `last_sign_in_at` off `public.users` (column doesn't exist there). `web/src/app/api/auth/email-change/route.js:60`. Fix per Q04 above.
2. **PM-1** — Wrong OTP code silently redirects to home as anon. `web/src/app/login/_SingleDoorForm.tsx:106`. Fix: distinguish actual session creation from privacy-posture `200 ok:true` — verify a session exists post-call before navigating.

### P1 (close all)
- **PM-1** — `auth.resend({ type: 'signup' })` 400s for magic-link OTP users (entire user base). Fix: switch to the correct resend type or remove the affordance.
- **PM-1** — verify-magic-code gate-deny may leak session cookie if signOut error-path fires.
- **PM-1** — `/preview` token compares with `!==` instead of `crypto.timingSafeEqual`.
- **PM-1** — OTP audit-log row pastes raw upstream error string verbatim.
- **PM-1** — Welcome-page graduation form leaves `busy=true` after success.
- **PM-1** — `/api/csp-report` rate limit is per-instance not per-IP.
- **PM-11 / Q05** — Magic-link prefetch by email-client URL scanners. Fix per Q05 above (drop the button; OTP-only).
- **PM-11** — `/api/auth/check-username` accepts both GET and POST, enabling cross-origin rate-limit denial.

### Out of scope
- Anything in `/admin/*` (Session 3)
- Billing flows (Session 4)
- iOS auth UI (Session 5 — flag any iOS analog needed but don't fix here unless trivial)

## Kill-switch reminder

`OAUTH_ENABLED` and iOS `VPOAuthEnabled` (`AuthViewModel.swift:48`) are gated. Any auth-flow change must keep both flags' off-state working unchanged.

## Orchestration

| PM | Owns |
|---|---|
| **PM-A: Email-change + OTP P0s** | The two P0s. Single coherent slice — both touch `_SingleDoorForm` + `email-change` route. |
| **PM-B: Resend + audit hygiene** | The resend bug (entire user base affected), audit-log raw-error leak, welcome-page busy stuck. |
| **PM-C: Hardening sweep** | timing-safe compare on `/preview`, rate-limit per-IP on `/api/csp-report`, GET→POST or interstitial for magic-link prefetch, dual-method tightening on `check-username`. |

Each PM dispatches subagents (Explore for callers, bug-hunter-flow for state-machine validation, build-verifier post-impl).

## Verification gates

1. **Pre-impl** — for each finding, open the cited file at the cited line and verify the issue still exists exactly as described. Drop refuted ones.
2. **Implementation** — each PM lands its own commits. No parallel paths, no feature flags for new behavior unless owner-instructed.
3. **Build-verifier** — `cd web && npm run lint && npx tsc --noEmit` (or whatever the project uses; check `package.json`). Sentinel grep: zero remaining occurrences of the broken patterns.
4. **Smoke-tester** — boot dev server, exercise: sign-up → magic-link → enter wrong OTP → enter right OTP → email-change → resend-verification → reset-password. Capture console errors.
5. **Independent reviewer** — fresh agent reads the diff + the relevant PM-1 section, confirms each finding closed.

No adversary pass needed unless something elevated-care surfaces during impl.

## Cross-platform note

After fixing the email-change endpoint, check whether the iOS adult app's email-change UI (search `VerityPost/VerityPost/SettingsView.swift` and similar) calls the same endpoint. If yes, log a follow-up for Session 5 to update the iOS UI to match the new error shape. If iOS calls Supabase auth directly, document as N/A.

## Done definition

- All 2 P0s + ~8 P1s closed or refuted with evidence.
- Build + smoke + reviewer all pass.
- `## Status` block appended at the bottom of this file.
- REVIEW_REPORT.md: each closed finding gets `> CLOSED in Session 2 — commit <hash>`.
- DO NOT auto-start Session 3.

## Status

(append final status block here)
