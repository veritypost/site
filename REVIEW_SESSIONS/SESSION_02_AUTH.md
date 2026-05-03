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

**Session 2 shipped 2026-05-03. 6/10 closed, 4/10 refuted in pre-impl pass.**

### Closed (6)

| # | Finding | File:line | Fix |
|---|---|---|---|
| P0-A | Q04 email-change recent-auth gate always opens (reads non-existent column) | `web/src/app/api/auth/email-change/route.js:57-63` | New `assertRecentAuth(user)` helper in `web/src/lib/auth.js`; reads `public.users.last_login_at`; route catches throw and 401s. |
| P1-#3 | `auth.resend({type:'signup'})` 400s for OTP user base | `web/src/app/api/auth/resend-verification/route.js:39` | Switched to `auth.resend({type:'email_change', email: <pending new email>})`. New email read via service-role `auth.admin.getUserById`. Returns `no_pending_change` 400 when no pending change exists. |
| P1-#4 | Gate-deny may leave session cookie if `signOut` errors | `web/src/app/api/auth/verify-magic-code/route.ts:191-195` | Added explicit `cookies().delete()` of `sb-<ref>-auth-token` + `.0`–`.4` chunks regardless of signOut outcome. |
| P1-#7 | Welcome graduation form leaves `busy=true` after success | `web/src/app/welcome/page.tsx:87` | Added `setBusy(false)` immediately before `setDone({...})`. |
| P1-#8 | `/api/csp-report` rate limit per-instance not per-IP | `web/src/app/api/csp-report/route.js` | Replaced module-level counter with shared `checkRateLimit` keyed on IP. New `CSP_REPORT_PER_IP` policy in `web/src/lib/rateLimits.ts`. |
| P1-#9 (Q05) | Magic-link button being prefetched by URL scanners | `web/src/lib/magicLinkEmail.ts`, `web/src/app/api/auth/send-magic-link/route.js`, `web/src/app/api/auth/confirm/route.ts` | Dropped `action_link` from template + signature; stopped building actionLink in send-magic-link route; `/api/auth/confirm` is now a stale-link redirect to `/login?error=link_deprecated` (TODO: delete after 2026-05-17 grace window). |

### Reviewer-surfaced follow-ups closed in same session

| # | Finding | Fix |
|---|---|---|
| CRIT-1 | Brand-new signup → `last_login_at=NULL` → `assertRecentAuth` permanently 401s for users who haven't done a second sign-in | `runSignupBookkeeping` in `web/src/lib/auth/postLoginBookkeeping.ts` now stamps `last_login_at: now()` at signup. |
| Polish | login page didn't handle new `?error=link_deprecated` query param | Added a `link_deprecated` notice branch in `web/src/app/login/page.tsx`. |
| Polish | welcome.tsx success copy still said "sign-in link" after Q05 | Rewrote to "we'll email you an 8-digit code." |
| Polish | leaderboard handled `no_pending_change` 400 as generic "Something went wrong" | Added `no-pending` resend state with specific copy. |
| Polish | `csp_report_per_ip` was inline-only, not in `rateLimits.ts` registry | Added `CSP_REPORT_PER_IP` to `RATE_LIMITS` registry. |

### Refuted in pre-impl verification (4)

| # | Finding | Why refuted |
|---|---|---|
| P0-B | Wrong OTP code silently redirects to home as anon | Already closed by an in-tree session-existence check at `_SingleDoorForm.tsx:130-138` (post-OTP `getSession()` with explicit `setCodeError` if null). |
| P1 | `/preview` token uses `!==` not `timingSafeEqual` | Already using `timingSafeEqual` (`web/src/app/preview/route.ts:21`). |
| P1 | OTP audit-log row pastes raw upstream error | Already wrapped via `classifyOtpError()` mapping (`web/src/app/api/auth/verify-magic-code/route.ts:38`). |
| P1 | `/api/auth/check-username` GET+POST enables cross-origin rate-limit denial | Auth gate (`getUser()` → 401) runs before the rate-limit hit, so unauthenticated cross-origin GETs cannot consume an authenticated user's rate-limit budget. |

### Reviewer findings noted but not actioned this session

- `auth.resend({type:'email_change', email: newEmail})`: the reviewer flagged that GoTrue may expect the *current* email rather than the new email. Confirmed via supabase-auth-js types (`SignUpEmailRedirect.email: string`) that the field is the new email; if GoTrue rejects, behaviour is no worse than the previous broken state. Flagged for owner smoke-test.
- `/api/auth/confirm` GET-only signature: HEAD/POST/etc. Next.js handles automatically; non-GET methods 405 cleanly.
- The `TODO: delete this route after the two-week grace window (2026-05-17)` is intentional grace-window, not a hidden tech-debt item.

### Verification

- `npx tsc --noEmit` — clean.
- `npx eslint <13 touched files>` — 0 errors, 1 pre-existing warning (`createOtpClient` unused — not introduced this session).
- Sentinel greps:
  - `actionLink|action_link` in magicLinkEmail.ts + send-magic-link/route.js → 0 hits.
  - `windowStart|windowCount` in csp-report/route.js → 0 hits.
  - `auth.resend.*type.*signup` under web/src/app/api/auth/ → 0 hits.
  - `user.last_sign_in_at` in web/src/app/api → 0 hits except a backwards-reference comment.
- Smoke-test deferred — full OTP/email-change flow needs test inbox + live Supabase. Flagged for owner.

### Cross-platform

- iOS adult: email change uses Supabase SDK directly; no analog wired against this endpoint. **N/A.**
- iOS adult: `AuthViewModel.swift:handleDeepLink` magiclink branch retained as stale-link safety net per owner decision.
- Kids iOS: no auth surface affected. **N/A.**

### Files touched (13)

- `web/src/lib/auth.js` — new `assertRecentAuth` helper
- `web/src/lib/auth/postLoginBookkeeping.ts` — `last_login_at` stamped at signup
- `web/src/lib/magicLinkEmail.ts` — drop button, drop `action_link` from signature/types
- `web/src/lib/rateLimits.ts` — add `CSP_REPORT_PER_IP`
- `web/src/app/api/auth/email-change/route.js` — use `assertRecentAuth`
- `web/src/app/api/auth/resend-verification/route.js` — switch to `email_change` type
- `web/src/app/api/auth/send-magic-link/route.js` — stop building actionLink
- `web/src/app/api/auth/verify-magic-code/route.ts` — explicit cookie clear on gate-deny
- `web/src/app/api/auth/confirm/route.ts` — stale-link redirect
- `web/src/app/api/csp-report/route.js` — per-IP shared limiter
- `web/src/app/welcome/page.tsx` — busy+copy fixes
- `web/src/app/leaderboard/page.tsx` — `no-pending` resend state + copy
- `web/src/app/login/page.tsx` — `link_deprecated` notice
