# Auth, Login & Email — Session Log

Append-only chronological log. Most recent at the bottom. Each entry: date, phase, what happened, what got locked, what's blocked, what next session picks up.

---

## Session 1 — 2026-04-29 — Founding

**Phase entering:** 0 (no artifacts).
**Phase leaving:** 1 (foundation locked, all slice plans decided, no code written).

**What happened.** Two specific bugs surfaced: approval emails silently failing, and link-click auth broken. Investigation started as a targeted bug hunt but widened when it became clear the root issue was that we don't own the auth email at all — Supabase sends it from their templates, the link-click path has an implicit/PKCE mismatch, and the first-login experience has no design.

Eight agents ran across two passes. The first four were independent parallel investigators covering the auth flow, email infrastructure, UX design, and product/process. The second four were fresh reviewers — a technical verifier, a UX skeptic, an engagement researcher, and a build-order analyst — each reading the first pass output and the actual codebase without shared context.

Key findings that shaped the locked plan:

**Technical (confirmed against code):**
- `createOtpClient()` at `server.ts:55` forces `flowType: 'implicit'`. The email link this produces delivers tokens in a URL `#hash`. The callback at `callback/route.js:17` reads `searchParams.get('code')` — gets null — redirects to `/login?error=missing_code`. Link-click auth has been broken. Typed-code flow works.
- `RESEND_API_KEY` is not set in Vercel production. `email.js:67-68` throws. Approve route catches it silently. No approval email ever sends.
- `admin.generateLink({ type: 'magiclink' })` is the right replacement for the link-click path but throws `User not found` for new emails. Must `admin.createUser` first.
- `admin.verifyOtp()` does not exist on the admin namespace. Correct method is `createOtpClient().auth.verifyOtp()`.
- Next.js App Router server component pages cannot write cookies. The confirm handler must be a Route Handler.
- `_SingleDoorForm.tsx:341` says "6-digit" but the input, server validation, and route all require 8 digits. One-line copy fix.

**Design (locked after agent review and owner Q&A):**
- We own the auth email completely. Resend, our template. Supabase's email disabled at the same deploy.
- Email: plain-text style. Subject: `your verity post link`. If new user: "you've been on the list N days." + link button + 8-digit fallback code. No story snippet until real content exists.
- Approval email: rewritten from transactional receipt to editorial paragraph. Signed. Evergreen. Invite link inline, not a hero button.
- Link-click → `/api/auth/confirm` Route Handler. Session established server-side. Redirect to `/`. URL bar after: `veritypost.com`. No query strings.
- Attribution moment on first login (if referred): "[Name] reads this every morning." 1.2s, then feed. Uses `onboarding_completed_at` + referrer data already in DB.

**Experience ideas cut or deferred:**
- 3-second arriving pause — cut (fragile, lies if auth fails).
- "Can't skip" reader question at first login — cut (dark pattern). Moved to day-3 in-feed prompt, future program.
- Edition drop on day-one landing — deferred (no real content).
- Founding reader label — deferred (needs DB column decision).

**What got locked.** All five slice plans. The technical architecture for Slices 03 and 04. The email design for Slices 02. The UX design for Slice 05. All deferred items named. The critical constraint list in `README.md`.

**What's blocked.** Nothing. Slice 01 requires owner action (Vercel + Resend dashboards) — no code blocker. Slices 02–05 are ready to execute as soon as the owner greenlights.

**What next session should pick up.** Slice 01 — owner sets `RESEND_API_KEY` in Vercel and confirms `no-reply@veritypost.com` is verified in Resend. Slice 01 has no code; it's an owner action checklist. The session after that opens Slice 02 (email templates) which is the first code PR.

---

## Session 2 — 2026-04-29 — Execution (Slices 02, 03, 04)

**Phase entering:** 1 (foundation locked, no code written).
**Phase leaving:** 2 (Slices 02–04 shipped, type-check clean, Slice 05 remains).

**What shipped:**

- **`web/src/lib/magicLinkEmail.ts`** — new file. Template + `buildMagicLinkVars`. Handles the optional wait-line via pre-built string variables so `renderTemplate` needs no conditional logic. Wait line appears for new users with `days_on_list >= 1`.

- **`web/src/lib/betaApprovalEmail.ts`** — body rewrite only (subject, from fields, `buildApprovalVars` untouched). Removed the h1 "you're in." and hero button. Rewrote to editorial personal note — "we looked at your request and we're glad you applied." Invite link is a text underline link, not a large CTA. Keeps `{{name_with_space}}`, `{{invite_url}}`, `{{expires_at}}` tokens unchanged.

- **`web/src/app/api/auth/send-magic-link/route.js`** — replaced the `signInWithOtp` block with the 6-step sequence. Added two imports. Pre-flight checks, rate limits, ban check, beta gate all untouched. New sequence: (1) `admin.createUser` for new emails (catches "already exists" silently), (2) `admin.generateLink({ type: 'magiclink' })` — extracts `hashed_token` and builds our own confirm URL `?t={hashed_token}&e={email}` rather than using Supabase's action_link directly (avoids implicit-flow hash-fragment redirect issues), (3) `signInWithOtp({ shouldCreateUser: false })` for typed-code fallback (non-fatal), (4) `days_on_list` query from `access_requests` for new users (non-fatal), (5) `sendEmail` via Resend (fail-open), (6) audit + return.

- **`web/src/app/api/auth/confirm/route.ts`** — new Route Handler at `GET /api/auth/confirm`. Reads `?t=` and `?e=`. Calls `createOtpClient().auth.verifyOtp({ email, token: t, type: 'magiclink' })` — session cookies written automatically. Runs `runSignupBookkeeping` (new users) or `runReturningUserBookkeeping` (existing). Returns the same `redirectResponse` object passed to `runSignupBookkeeping` so the vp_ref cookie-clear reaches the browser. Redirects to `/` on success, `/login?error=link_expired` on failure.

**Key implementation decision:** we construct our own confirm URL from `hashed_token` (not Supabase's `action_link`). This means the user's click goes directly to our Route Handler, which calls `verifyOtp` itself — no intermediate Supabase redirect. This avoids any ambiguity about whether Supabase would append `#hash` vs `?query` params to the redirect.

**Note on typed-code fallback:** the `email_otp` displayed in the email comes from `generateLink` (type: 'magiclink'). The typed-code route (`verify-magic-code`) uses `type: 'email'`. After `signInWithOtp` runs in step 3, Supabase has a separate active OTP for type:'email'. The displayed code may or may not work in the typed-code field — test this. If it doesn't, the fix is to either display the `signInWithOtp` code (which we don't capture) or change the verify-magic-code route to accept `type: 'magiclink'`.

**What's blocked.** Slice 01 (owner action — Resend key + domain). Can't smoke-test email sends until that's done. Slice 05 (first-login attribution) is unblocked — no Resend dependency.

**Slice 05 also shipped in this session.**

- **`web/src/app/_HomeFirstLoginMoment.tsx`** — new client component mounted inside `page.tsx`. Reads `user.onboarding_completed_at` from `useAuth()` (already fetched by NavWrapper). If null (first login), queries `public.users` for `referred_by_user_id` + `email`, then in parallel: referrer's display_name/username, and `access_requests.created_at` for the day count. Shows referred line ("[Name] reads this every morning.") or waitlisted line ("you've been on the list N days." / "you made it." if same-day or access_requests not readable via RLS). CSS transition: 200ms fade-in, 1200ms hold, 200ms fade-out. After animation: writes `onboarding_completed_at = NOW()` to DB. Returns null immediately for all returning users and anon viewers.

- **`web/src/app/page.tsx`** — added `<HomeFirstLoginMoment />` inside the root div, above the breaking strip.

**What next session should pick up.** Owner completes Slice 01 (Resend API key + domain + Supabase email template disable). Then smoke-test sequence from `slices/03-send-flow.md` and `slices/04-confirm-route.md`. Atomic requirement: Supabase email template must be disabled in the same deploy window that Slices 03+04 go live.
