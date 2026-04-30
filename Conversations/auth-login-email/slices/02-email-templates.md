# Slice 02 — Email Templates

**Status:** not-started
**Depends on:** Slice 01 (Resend key + domain must be set or emails silently fail)
**Blocks:** nothing (can ship independently before Slices 03/04)

---

## What this slice is

Two email templates. One new file. One rewrite. One one-line copy fix. No route logic changes — those are Slice 03.

---

## Changes

### 1. New file: `web/src/lib/magicLinkEmail.ts`

The sign-in email sent when someone requests a login link. Follows the same pattern as `betaApprovalEmail.ts` — template object + vars builder.

**Template spec:**

- Subject: `your verity post link`
- No header image, no logo lockup. Small uppercase `VERITY POST` wordmark as text label at top.
- Optional wait line (new users only, only if `days_on_list > 0`): `"you've been on the list N days."` This is injected as a pre-built HTML/text string by `buildMagicLinkVars` so `renderTemplate` doesn't need conditional logic.
- Body copy: `"tap the button to sign in. this link works once and expires in 30 minutes."`
- CTA button: `"sign in to verity post →"` — dark background, links to `{{action_link}}`
- Below button: `"or enter this code on the sign-in screen:"` in small gray text
- 8-digit code: large monospace, high contrast — `{{email_otp}}`
- Footer: `"if you didn't request this, you can ignore it."` in muted gray

**Vars the template takes:**
- `{{action_link}}` — the Supabase verify URL (from `admin.generateLink`)
- `{{email_otp}}` — the 8-digit code (from `admin.generateLink`)
- `{{wait_line_html}}` / `{{wait_line_text}}` — pre-built strings from `buildMagicLinkVars`, empty string if not applicable

**`buildMagicLinkVars` input type:**
```ts
type MagicLinkEmailVars = {
  action_link: string;
  email_otp: string;
  days_on_list?: number | null;
};
```

**What NOT to include:** story snippet, any "today in the news" content, any live editorial data. Deferred until real content exists.

---

### 2. Rewrite: `web/src/lib/betaApprovalEmail.ts` — template body only

The approval email currently reads as a transactional receipt. Rewrite the `body_html` and `body_text` only — no changes to `APPROVAL_TEMPLATE` subject, from fields, or `buildApprovalVars` function.

**New template shape:**

- Short editorial paragraph: something like "we looked at your request and we're glad you applied. verity post is a small thing we're building deliberately — news that earns your attention." (rough copy — polish pass before launch)
- Signed: `— cliff at verity post` (or whatever name the owner wants)
- Invite link inline within or just below the paragraph — not as a separate hero button section
- Small text below: link expiry date, how to use it

**Keep:** the `{{name_with_space}}` greeting, `{{invite_url}}`, `{{expires_at}}` tokens. They're already wired from `buildApprovalVars`.

**Tone reference:** reads like a note from a person, not a system notification. Every word considered. No marketing language.

---

### 3. One-line fix: `web/src/app/login/_SingleDoorForm.tsx:341`

Change `"We sent a 6-digit code to"` → `"We sent an 8-digit code to"`.

The input validation (`pattern="\d{8}"`, `maxLength={8}`), the submit button state (`code.length === 8`), and the server route (`/^\d{8}$/`) all already say 8. The UI copy is the only thing out of sync.

---

## What this slice does NOT touch

- Route logic (`send-magic-link/route.js`) — that's Slice 03
- How the email gets sent — the `sendEmail()` call in the route — that's Slice 03
- The confirm route — that's Slice 04
- `email.js` itself — no changes needed

---

## Testing

After shipping this slice:
- The approval email visual design should match the new template. Trigger a test approval and inspect the email.
- The sign-in email template exists but isn't wired to a route yet (that's Slice 03). Can be previewed by writing a throwaway test that calls `renderTemplate(MAGIC_LINK_TEMPLATE, buildMagicLinkVars({ action_link: 'http://test', email_otp: '12345678' }))` and logging the HTML output.
- The `_SingleDoorForm` copy fix is visible immediately on `/login`.
