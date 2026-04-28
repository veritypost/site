# Session Runbook

How we work together on Verity Post. Reference this at the start of any non-trivial task so the same mistakes don't repeat.

---

## What this session shipped (2026-04-28)

**Beta access intake (`/api/access-request` + `/login` UI)**
- Dropped the email-confirm step. Email-only intake → admin queue. Idempotent on re-submit, anti-enumeration generic-200 across every account-state branch.
- Captures attribution at submit time (UTM, referrer, vp_ref cookie, signup_cohort snapshot, IP /24, UA) into `access_requests.metadata` jsonb. No DDL needed.
- Two rate-limit scopes: `ACCESS_REQUEST_SUBMIT_PER_IP` (5/hr) + `ACCESS_REQUEST_SUBMIT_PER_EMAIL` (1/day). Registered in `web/src/lib/rateLimits.ts`.
- `/login` is the canonical surface — three tabs (Sign in / Have a code / Request access). `/request-access` redirects to `/login?mode=request` so there's only one form.
- Copy reset to professional + active voice (no "drop your email" idioms).

**Admin access-requests queue (`/admin/access-requests`)**
- Pending tab no longer gated on `email_confirmed_at`. Source column shows UTM source / referrer hostname. Drawer surfaces full attribution (cohort, referral code, UTM map, referer).
- Approve is one-click. No reason field, no destructive-action dialog. Audit trail still captures actor + timestamp.
- Drawer for approved rows includes an **Invite link** block — full URL + Copy button + expiry — recoverable when the auto-email fails.
- Pending count + alert banner on `/admin` hub when count > 0.

**Profile invites (`/profile?section=refer`)**
- `InviteFriendsCard` mounted, replaced the buggy `LinkOutSection` placeholder that was constructing `/r/{username}` instead of using actual minted slugs.
- Component rewritten against profile palette tokens, with `:focus-visible` modality detection, aria-live announcer, single shared copy timer (rapid-copy race fixed), preserved-state-on-clipboard-failure, AA-passing contrast on disabled state, `max_uses`-aware exhaustion logic.

**Auth flow fixes**
- Magic-link callback now fire-and-forgets the four side-effect writes (last_login_at, cancel_account_deletion, complete_email_verification, scoreDailyLogin) for returning users — redirect happens immediately. ~200-500ms shaved off the perceived hop.
- Approval-based bypass added to `lib/betaGate.ts` (`isApprovedEmail`). An admin-approved email bypasses the cookie gate at magic-link send time, so a recipient whose invite-link email never landed (Resend down, deleted, cookies cleared) can still sign in by typing their email.
- DB trigger collision fixed (`supabase/migrations/2026-04-28_auth_sync_guc_bypass.sql`). `handle_auth_user_updated` now sets a transaction-local GUC `app.auth_sync='true'` so `users_protect_columns` knows to allow the legitimate auth-sync write of `email_verified`. Without this, every brand-new signup transaction rolled back with `42501`.

**Environment**
- `.env.local` switched from `NEXT_PUBLIC_SITE_MODE=coming_soon` (with PREVIEW_BYPASS_TOKEN) to `NEXT_PUBLIC_BETA_GATE=1` to match the Vercel prod state.
- Supabase auth email templates drafted (Magic Link / Confirm Signup / Change Email / Reset Password) — paste-ready for the Supabase Dashboard.

**Doc + tooling**
- `web/src/lib/turnstile.ts` was added then removed (owner doesn't want Cloudflare anti-bot).
- Updated stale comment in `LinkOutSection.tsx` removing dropped consumers.

---

## What went wrong

**The recurring failure mode: code review without user-journey validation.**

Every bug we hit this session was sitting on the path "admin approves request → recipient gets email → recipient clicks link → recipient signs up → recipient lands signed-in." Each individual file looked fine in code review. The 6-agent flow (investigator → planner → 2 pre-impl reviewers → 2 post-impl reviewers) checked types, contracts, edge cases, palette consistency. **No agent ever ran that user journey end-to-end with curl or in a browser.**

Specifically what slipped past:

1. **Closed-beta gate silently dropped approved users.** Audit log read `closed_beta_no_cookie` for two users the admin had explicitly approved. The gate required a `vp_ref` cookie, but recipients never clicked an invite link (because the auto-email failed), so they had no cookie. Approval status — the canonical "this email is allowed in" signal — wasn't checked at the gate. Fix: `isApprovedEmail` bypass in `lib/betaGate.ts`.

2. **Trigger collision blocked every fresh signup.** `handle_auth_user_updated` (auth.users) cascaded into `public.users.email_verified`. `users_protect_columns` (public.users BEFORE UPDATE) rejected the write because the JWT role was `anon` (SECURITY DEFINER preserves the original caller's role context). Every new-email signup transaction rolled back with `Database error updating user`. This was a *latent* bug — pre-existing, unhit until someone tried a fresh signup in this DB. Fix: transaction-local GUC bypass.

3. **Resend not wired locally.** Caused two visible failures: access-request submission 500'd ("Could not send confirmation email") and approval emails fell into the manual-copy fallback. Not a code bug — config gap — but it was invisible until I curled the actual route.

4. **Multi-tab dev rate limit hits.** Per-IP cap of 5/hr is fine for real traffic but local dev shares `127.0.0.1` across the human + the agent's curl tests, so we kept brushing the cap. Not a bug, but a UX wart during testing.

The owner's frustration was correct: I claimed "ship-ready" after the 6-agent flow and then the actual user couldn't get in. That gap is the lesson.

---

## How to work future tasks

A sequence to follow for any non-trivial change. Keep it short, don't ceremonialize it.

### 1. Define the user journey before any code

For every change that affects an end-user surface, write the journey first — three or four lines:

> *Admin clicks Approve → recipient gets email → recipient clicks link → recipient signs in → recipient lands on /welcome.*

Stick that in the task scratchpad. Every reviewer agent gets that journey as the prompt. If a reviewer can't trace the journey, they didn't actually review.

### 2. Investigator → Planner → Reviewer (parallel) pre-impl

Same as we ran. Do not skip this on anything that touches auth, billing, permissions, or DB triggers. For one-line copy changes or pure UI restyle, skip — overhead exceeds value.

The investigator agent must answer: *"what surfaces does this touch, what's already there, what gates apply, where does the data flow."* Cite paths and line numbers, no hand-waving.

The planner agent must produce: *"here are the exact files I'd change, here are the lead-decisions you need to make, here's the test plan."*

### 3. Verify, don't claim

After implementing:
- TypeScript clean (run `npx tsc --noEmit`)
- Curl every public route and confirm the status code matches expectation
- For DB-touching paths, query the audit_log + the actual rows before saying it works
- For email-sending paths, **verify the email actually sent** (Resend dashboard or audit-log reason field) — generic 200 is not proof

Use these words carefully:
- **"Built"** = code written, types compile
- **"Tested"** = I ran the route and saw the expected response
- **"User-journey verified"** = I traced a real user end-to-end through every hop with evidence (audit log entries, DB rows, email-arrival confirmation)

If I say "ready" without "user-journey verified", you should push back.

### 4. Post-impl review (parallel) before commit

Two adversarial agents on the diff. Their prompt explicitly mentions the user journey from step 1. They look for: where the chain can silently break, where errors get swallowed, where state goes stale.

### 5. Don't commit until you say so

Default behavior: I never `git commit` or push without an explicit "ship it" from you. I'll show you the diff and verification evidence; you make the call.

### 6. When something fails after I claimed it worked

I owe you:
- Direct ownership of the miss, not a wall of context
- The exact failure mode (audit log, error message, line number)
- The fix in the next message, not three messages later
- A note here in this runbook so the same class of bug doesn't repeat

---

## Standing rules I should already know

These are codified elsewhere (CLAUDE.md, memory) but worth restating here for one-stop reference:

- **Genuine fixes, never patches.** No TODO/HACK leftovers, no force-unwrap-as-crutch, no parallel paths.
- **Engagement floor is 90%+ retention, ~100%/day growth.** Polish over ship-now when the choice exists.
- **No user-facing timelines.** "Coming soon" / "in the next pass" / "shortly" are banned in copy.
- **No keyboard shortcuts in admin UI.** Click-driven only.
- **No color-per-tier.** Tier is a label, not a visual identity.
- **Email scope is security-only.** Password reset, email verify, billing receipts, deletion notices. No rich digest pipeline.
- **Kids product = iOS only.** Kids web is redirect-only, not active dev.

---

## Active outstanding follow-ups

Things this session left open, in priority order:

1. **Set `RESEND_API_KEY`** (Vercel + `.env.local`) so transactional emails actually send. Until then, the approval drawer's invite-link copy button is the workaround.
2. **Apple Developer console walkthrough** is owner-scheduled for a later session. Don't auto-queue.
3. **`/api/access-request/confirm` route + `email_confirm_token` columns** are now dead code (Phase 1 dropped the confirm step). Drop in a future migration after any in-flight pre-Phase-1 confirm tokens have aged out.
4. **End-to-end Playwright tests for the approve → signup chain.** Would have caught both bugs from this session. ~2 hours of work; worth doing before launch.
