# Auth, Login & Email — Index

**Last updated:** 2026-04-29 (execution session — Slices 02–05 shipped; type-check clean)
**Phase:** code complete — Slice 01 (owner action) is the only remaining item
**Next session should pick up:** smoke-test sequence after owner completes Slice 01 (see checklist below).

---

## Slice status

| # | Slice | Status | Last touched | Slice doc |
|---|---|---|---|---|
| 01 | Ops — Resend env vars | **not-started** | 2026-04-29 | `slices/01-ops.md` |
| 02 | Email templates | **shipped** | 2026-04-29 | `slices/02-email-templates.md` |
| 03 | Send flow | **shipped** | 2026-04-29 | `slices/03-send-flow.md` |
| 04 | Confirm route | **shipped** | 2026-04-29 | `slices/04-confirm-route.md` |
| 05 | First-login UX | **shipped** | 2026-04-29 | `slices/05-first-login-ux.md` |

**Dependency chain:** Slice 03 and Slice 04 must ship in the same deploy (atomic — Supabase email disabled at the same time). Slice 02 can ship independently first. Slice 01 is an owner action with no code PR. Slice 05 is independent of the chain.

---

## Foundation status

| Doc | Status |
|---|---|
| `README.md` | ✓ written 2026-04-29 |
| `00-system-map.md` | ✓ written 2026-04-29 |
| `SESSION_LOG.md` | ✓ written 2026-04-29 |

---

## Known bugs (confirmed against code)

1. **Link-click auth is broken.** `send-magic-link` uses `createOtpClient()` (implicit flow). The email link delivers tokens as a `#hash` fragment. The callback route reads `searchParams.get('code')` — gets null — redirects to `/login?error=missing_code`. Every magic-link click fails silently. Typed 8-digit code works fine. Fixed in Slices 03 + 04.

2. **Approval emails not sending.** `email.js:67-68` throws if `RESEND_API_KEY` missing. The approve route catches the throw and logs it but continues — approval stamps, email never sends. Fixed in Slice 01 (env var).

3. **`_SingleDoorForm.tsx:341` says "6-digit" but everything expects 8-digit.** `verify-magic-code/route.ts:83` validates `^\d{8}$`. UI copy says "6-digit". Fix is a one-line copy change — absorb into Slice 02 or 03, whichever ships first.

---

## Cross-slice findings

- **Supabase email disable is part of Slice 03, not a standalone step.** Must happen in the same deploy as the send-flow change. If Slice 03 ships without disabling Supabase email, users get two emails. Document this in the Slice 03 PR checklist.
- **`/app/welcome/page.tsx` exists but is dead.** It only activates on a `graduation_token` param. Safe to repurpose as a visual confirm page in a future polish pass. Not a dependency for Slices 03/04.
- **`WelcomeModal` is already mounted in `NavWrapper`.** Slice 05 (first-login UX) is a content swap inside an existing shell. Not a new component.
- **`onboarding_completed_at` column exists** on the `users` table. Usable as the first-login flag for the attribution moment in Slice 05.

---

## Deferred items

- Edition drop (first-login landing on curated stories) — deferred until real editorial content exists.
- Reader question at first login — deferred to a day-3 in-feed prompt, future program.
- Founding reader label — needs a DB migration decision, not scoped here.
- Branded `/welcome` confirm page — polish pass, not a blocker for Slice 04.

---

## Open owner-actions

- [ ] Set `RESEND_API_KEY` in Vercel dashboard → `veritypost-site` → Settings → Environment Variables (Production + Preview)
- [ ] Confirm `no-reply@veritypost.com` (or whatever `EMAIL_FROM` is) is a verified sending domain in Resend
- [ ] In Supabase dashboard: Auth → Email Templates → disable or blank the magic-link template (do this at the same time Slice 03 deploys)
