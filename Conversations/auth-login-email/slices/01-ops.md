# Slice 01 — Ops

**Status:** not-started
**Type:** Owner action — no code PR
**Depends on:** nothing
**Blocks:** Slice 02 (approval email won't send until key is set), Slice 03 (send-flow Resend email won't send)

---

## What this slice is

Two environment-level actions. No code changes. No PR. The owner does these directly in the Vercel and Resend dashboards.

---

## Actions

**1. Set `RESEND_API_KEY` in Vercel**

- Dashboard: `veritypost-site` project → Settings → Environment Variables
- Add `RESEND_API_KEY` for Production and Preview environments
- Value: the API key from the Resend dashboard (Settings → API Keys)
- This fixes approval emails immediately on next deploy. No deploy needed — env vars take effect on the next request.

**2. Verify the sending domain in Resend**

- The from address is `no-reply@veritypost.com` (fallback in `email.js:39` if `EMAIL_FROM` not set)
- In the Resend dashboard: Domains → verify `veritypost.com` by adding DNS records
- If `EMAIL_FROM` is set to something else in Vercel, verify that domain instead
- Resend will reject sends from any unverified domain regardless of whether the key is valid

**3. Optionally set `EMAIL_FROM` explicitly**

- If the desired from address differs from `no-reply@veritypost.com`, set `EMAIL_FROM` in Vercel env vars
- The approval email uses `betaApprovalEmail.ts` → `process.env.EMAIL_FROM || 'beta@veritypost.com'`
- The sign-in email (Slice 02) will use `magicLinkEmail.ts` → `process.env.EMAIL_FROM || 'no-reply@veritypost.com'`
- These should match. Simplest: set one `EMAIL_FROM` in Vercel that both templates pick up.

---

## Verification

After setting the key and verifying the domain:

1. Go to the admin access-requests queue (`/admin/access-requests`)
2. Approve a test request (or re-approve an already-approved one if the route allows)
3. Check the target inbox — approval email should arrive
4. Check Resend dashboard → Emails → confirm the send appears with status `delivered`

If the email doesn't arrive: check Resend → Emails for error details (domain not verified, invalid key, etc.).

---

## Completion

Mark this slice `shipped` in `INDEX.md` once the domain is verified and a test approval email successfully delivers. No code commit needed — update INDEX.md and SESSION_LOG.md only.
