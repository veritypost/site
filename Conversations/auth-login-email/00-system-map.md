# Auth, Login & Email — System Map

Foundation reference. Read this at the start of every execution session. Amend (don't rewrite) as new findings surface during implementation.

**Last amended:** 2026-04-29 (founding session)

---

## Current auth flow (as-built, 2026-04-29)

### Send path — what happens when someone submits their email

Route: `web/src/app/api/auth/send-magic-link/route.js`

1. Parses email, validates format via `isAsciiEmail()`.
2. Rate-limits: per-email 3/hr (`auth_magic_link_send_per_email`), per-IP 5/hr (`auth_signup_submit_per_ip`).
3. Ban check: queries `public.users` where `is_banned=true`.
4. Beta gate: checks `vp_ref` cookie via `checkSignupGate()`. Approved emails bypass gate via `isApprovedEmail()`.
5. Calls `createOtpClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: siteUrl + '/api/auth/callback' } })`.
6. Supabase sends their own email template. We have no control over it.
7. Returns generic 200 always (privacy posture).

**What `createOtpClient()` is:** `server.ts:55` — forces `auth: { flowType: 'implicit' }`. This means the link Supabase sends routes through `auth/v1/verify` and redirects with session tokens in the URL `#hash` fragment, not as a `?code=` query param.

**Audit log:** every path writes to `audit_log` with action `auth:magic_link_send`.

---

### Link-click path — BROKEN

Route: `web/src/app/api/auth/callback/route.js`

Expects: `GET /api/auth/callback?code=...`

What it receives from implicit-flow links: tokens in `#hash` — the server never sees them.

Line 17: `const code = searchParams.get('code');` → null
Line 22-24: `if (!code) return NextResponse.redirect(siteUrl + '/login?error=missing_code');`

Every magic-link click ends at `/login?error=missing_code`. This has always been broken.

The callback also handles OAuth (Google, Apple). That path is separate and unaffected.

---

### Typed-code path — WORKS

Route: `web/src/app/api/auth/verify-magic-code/route.ts`

Validates 8-digit token via `!/^\d{8}$/.test(rawToken)`.
Calls `createOtpClient().auth.verifyOtp({ email, token, type: 'email' })`.
Session set automatically via `createOtpClient`'s cookie-writing handlers.
Runs `runSignupBookkeeping` or `runReturningUserBookkeeping` depending on whether `public.users` row exists.

This path is clean and works correctly end-to-end.

---

### Post-login bookkeeping

File: `web/src/lib/auth/postLoginBookkeeping.ts`

Two exports:
- `runSignupBookkeeping(service, user, provider, meta, request, response)` — creates `public.users` row (upsert), `auth_providers` row, role assignment, referral cookie clear. The referral cookie-clear writes to the `response` object. **The same object must be returned from the Route Handler.**
- `runReturningUserBookkeeping(service, user, existing, request)` — updates `last_login_at`, cancels pending deletion, updates email verification flag.

Both functions are non-throwing. DB errors are logged; failures in side-effects (audit, scoring, referral) never surface to the caller.

---

### Approval email path

Route: `web/src/app/api/admin/access-requests/[id]/approve/route.ts`

Calls `sendEmail()` from `web/src/lib/email.js`.
`email.js:67-68`: throws `'RESEND_API_KEY missing'` if env var is absent.
Approve route: `try { result = await sendEmail(...) } catch (e) { console.error(...) }` — error caught, approval continues.

Result: approval stamps in DB, `email_sent: false` in response, person never hears back. No visible failure to admin.

`betaApprovalEmail.ts`: template + `buildApprovalVars()`. Template uses `{{name_with_space}}`, `{{invite_url}}`, `{{expires_at}}`. All vars match what `buildApprovalVars` returns. Template itself is well-formed.

---

### Email infrastructure

File: `web/src/lib/email.js`

Thin Resend wrapper + `renderTemplate()`. Uses `fetch` directly (no npm dep).
`renderTemplate(tpl, variables)` replaces `{{ key }}` tokens with HTML-escaped values.
`sendEmail({ to, subject, html, text, fromName, fromEmail, replyTo, unsubscribeUrl })` — POSTs to `https://api.resend.com/emails`.
From address: `fromName <fromEmail>`. If `fromEmail` domain not verified in Resend, sends fail.

`RESEND_API_KEY`: read at `email.js:67`. Not set in Vercel production.
`EMAIL_FROM`: falls back to `'no-reply@veritypost.com'`. Verify this domain is live in Resend.

---

### Supabase client variants

File: `web/src/lib/supabase/server.ts`

| Factory | Flow type | Cookie handler | Use |
|---|---|---|---|
| `createClient()` | PKCE (default) | Read + write | Standard server routes |
| `createOtpClient()` | implicit | Read + write | OTP send + verify |
| `createServiceClient()` | n/a (service role) | No-op | Admin operations |
| `createClientFromToken()` | n/a | No-op | Bearer JWT |
| `createEphemeralClient()` | n/a | No-op | Ephemeral auth ops |

`createServiceClient()` has full `auth.admin` access. `admin.generateLink()` and `admin.createUser()` are available. Confirmed: `callback/route.js:59` already calls `gateService.auth.admin.deleteUser(user.id)` — admin namespace is real and accessible.

---

### First-login UI

`WelcomeModal`: exists, mounted globally in `NavWrapper`. Currently shows a username picker. No other first-login logic.

`onboarding_completed_at` column: exists on `public.users`. Null for users who haven't completed onboarding. Usable as a first-login flag.

`/app/welcome/page.tsx`: exists but dead. Only activates on `?graduation_token=` param. Safe to repurpose in a future polish pass.

---

## What the new flow looks like (target state)

### Send path (Slice 03)

1. All pre-flight checks unchanged (rate limits, ban, beta gate).
2. If new user (not in `public.users`): `service.auth.admin.createUser({ email, email_confirm: true })`. Silently ignores "already registered" errors.
3. `service.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: siteUrl + '/api/auth/confirm' } })`. Response: `data.properties.action_link`, `data.properties.email_otp`.
4. `createOtpClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false } })` — issues 8-digit OTP for typed-code fallback. Non-fatal if fails.
5. Look up `access_requests.created_at` for this email to compute `days_on_list` (new users only). Non-fatal.
6. Send via Resend using `magicLinkEmail.ts` template.

### Confirm route (Slice 04)

File: `web/src/app/api/auth/confirm/route.ts`

```
GET /api/auth/confirm?t={hashed_token}&e={email}
```

1. Read `t` and `e` from searchParams. Validate both present.
2. `createOtpClient().auth.verifyOtp({ email: e, token: t, type: 'magiclink' })` — session cookies set automatically.
3. If error or no user: redirect to `/login?error=link_expired`.
4. Query `public.users` for existing row.
5. Build `redirectResponse = NextResponse.redirect(siteUrl + '/')`.
6. New user: `runSignupBookkeeping(service, user, 'email', {}, request, redirectResponse)`.
7. Returning: `runReturningUserBookkeeping(service, user, existing, request)`.
8. Return `redirectResponse`.

### Email templates (Slice 02)

**Sign-in email** (`magicLinkEmail.ts`):
- Subject: `your verity post link`
- Optional wait line: `you've been on the list N days.` (new users only, only if > 0 days)
- CTA button → `action_link`
- 8-digit code in large monospace below

**Approval email** (`betaApprovalEmail.ts` rewrite):
- Short editorial paragraph — why now is a good time to join, signed with a name
- Invite link inline, not a hero button above the fold
- Evergreen copy (no weekly refresh cadence)

### First-login UX (Slice 05)

On first session (where `onboarding_completed_at` is null and user has viewed home):
- If referred: "[Referrer name] reads this every morning." shown for 1.2 seconds before feed loads
- If waitlisted (no referrer): "you've been on the list N days. we've been building something worth it."
- Implementation: client-side component on home, checks `onboarding_completed_at` + referrer from DB

---

## Files this program touches

| File | Slice | Change |
|---|---|---|
| Vercel dashboard | 01 | Add `RESEND_API_KEY`, confirm `EMAIL_FROM` domain |
| Resend dashboard | 01 | Verify sending domain |
| Supabase dashboard | 03 | Disable magic-link email template |
| `web/src/lib/magicLinkEmail.ts` | 02 | New — sign-in email template |
| `web/src/lib/betaApprovalEmail.ts` | 02 | Rewrite template body |
| `web/src/app/api/auth/send-magic-link/route.js` | 03 | Replace signInWithOtp block |
| `web/src/app/api/auth/confirm/route.ts` | 04 | New — Route Handler |
| `web/src/app/login/_SingleDoorForm.tsx` | 02 or 03 | `"6-digit"` → `"8-digit"` (one line) |
| Home page or NavWrapper | 05 | Attribution moment component |

**Unchanged:** `callback/route.js` (stays for OAuth path), `verify-magic-code/route.ts` (typed-code path unchanged), `server.ts`, `email.js`.
