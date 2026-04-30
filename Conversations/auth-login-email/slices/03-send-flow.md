# Slice 03 — Send Flow

**Status:** not-started
**Depends on:** Slice 01 (RESEND_API_KEY must be set), Slice 02 (magicLinkEmail.ts must exist)
**Ships with:** Slice 04 (must be deployed in the same release — see atomic deploy note)

---

## What this slice is

The core rewrite. `send-magic-link/route.js` currently calls `signInWithOtp` and lets Supabase send its own email. After this slice, our server generates the link via admin API, sends our own Resend email, and Supabase's email is disabled in their dashboard.

---

## Atomic deploy requirement

Slice 03 and Slice 04 must ship in the same deployment. The moment Slice 03 lands, Supabase's email must also be disabled — otherwise users get two emails (one from Supabase's old template, one from ours). The Supabase dashboard step is part of this PR's checklist, not a separate task.

**PR checklist must include:**
- [ ] Deploy Slices 03 + 04 together
- [ ] Immediately after deploy: Supabase dashboard → Auth → Email Templates → Magic Link → clear the template body (or set to a blank/null custom template)
- [ ] Smoke-test: request a sign-in for a test email, confirm exactly one email arrives

---

## Changes to `web/src/app/api/auth/send-magic-link/route.js`

**Add imports at top:**
```js
import { renderTemplate, sendEmail } from '@/lib/email';
import { MAGIC_LINK_TEMPLATE, buildMagicLinkVars } from '@/lib/magicLinkEmail';
```

**Replace the `signInWithOtp` block** (currently lines ~253–293) with this sequence:

1. **Create user if new.** If `existingUserId` is null, call `service.auth.admin.createUser({ email, email_confirm: true })`. Catch errors where `message` includes "already", "registered", or "exists" — silently ignore (can happen if `auth.users` exists but `public.users` doesn't). Any other error: log + audit + return `genericOk()`.

2. **Generate the link.** Call `service.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: siteUrl + '/api/auth/confirm' } })`. Response shape: `data.properties.action_link` and `data.properties.email_otp`. If error or either field is null: log + audit + return `genericOk()`.

3. **Issue the OTP for typed-code fallback.** Call `createOtpClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false } })`. Non-fatal — log error but continue. The link-click path still works even if this fails.

4. **Compute `days_on_list` for new users.** Query `access_requests` for this email where `status = 'approved'`, order by `created_at` ascending, take the first. Compute `Math.floor((Date.now() - new Date(created_at).getTime()) / (1000 * 60 * 60 * 24))`. If < 1, use null (same-day approval, skip the line). Non-fatal — email sends without the wait line if this query fails.

5. **Send via Resend.** `renderTemplate(MAGIC_LINK_TEMPLATE, buildMagicLinkVars({ action_link, email_otp, days_on_list }))`. Then `sendEmail({ to: email, subject, html, text, fromName, fromEmail })`. Catch errors, log, continue — fail-open (auth rows are created; user can request again).

6. **Audit + return.** Same as before: `writeAuditRow` with `sent_signin` or `sent_signup`, then `return genericOk()`.

**Remove:** the old `signInWithOtp` block. Remove `createOtpClient` from imports if it's no longer needed at the top level (it's still used in step 3, so keep it).

---

## What stays the same

Everything before the `signInWithOtp` block is untouched:
- Email format validation
- Rate limits (per-email, per-IP)
- Ban check
- Beta gate (including `isApprovedEmail` bypass)
- Existing user lookup (`existingUserId`)
- The `genericOk()` / `malformed()` / `gated()` response helpers
- Audit log helper

The route's external contract is unchanged: `POST { email }` → `200 { ok: true }` in all non-malformed cases.

---

## Security notes

- `action_link` (the full Supabase verify URL) will appear in Resend's delivery logs and potentially in our own server logs if we log the Resend call. This is acceptable for a news site — it's a short-lived, single-use token. Don't log the full action_link value explicitly.
- `admin.generateLink` runs with the service role key. No client-side PKCE state involved. The resulting link works from any device.
- The Supabase admin API has no built-in rate limiting. Our existing app-level rate limits (step already in the route) remain the sole protection. This is the same posture as before.

---

## Testing

After shipping:
1. Request a sign-in for a new email (not in the system). Confirm: one email arrives, button works, code works, no Supabase email.
2. Request a sign-in for an existing user. Same check.
3. Confirm the typed-code path still works independently (enter the code without clicking the link).
4. Check Resend dashboard → Emails → confirm delivery status.
5. Check audit_log → confirm `auth:magic_link_send` rows have correct `reason` values.
