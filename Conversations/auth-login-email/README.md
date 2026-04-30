# Auth, Login & Email — Program Rulebook

**Started:** 2026-04-29
**Format reference:** `Conversations/article-lifecycle/` and `Conversations/search-browse-categories/` (completed + active programs — read for discipline, session log narrative style, and slice doc shape).

---

## What this program is

A multi-session plan-then-execute program covering how users get in, how the emails they receive feel, and what happens in the first moments after they arrive.

Two bugs triggered the conversation that started this program. Both surfaced something bigger: we don't own the auth email at all. Supabase sends it from their templates. The link-click path is broken. And the first-login experience has no design behind it. This program fixes all three layers.

Five slices:

1. **Ops** — Resend API key + domain verification. No code. Owner action in Vercel and Resend dashboards.
2. **Email templates** — The sign-in email and the approval email, both through Resend, both designed.
3. **Send flow** — The `send-magic-link` route rewritten to own the full send: createUser → generateLink → OTP fallback → Resend. Supabase's email disabled.
4. **Confirm route** — `/api/auth/confirm` Route Handler. The link-click path, fixed.
5. **First-login UX** — Attribution moment on first login. Reader question (day 3, not first session). Edition drop (deferred — no content yet).

---

## How sessions work

**One slice per session.** Read state, advance exactly one slice, write state back, stop.

**Code first.** Read `web/src/`, `VerityPost/`, `supabase/migrations/`. Don't read `Conversations/` (except this program and the format reference programs), `Sessions/`, `Workbench/`, `Reference/`, `Archived/`, `Ongoing Projects/`.

**Plan sessions and execution sessions are different.** Slices 1–5 are already plan-locked (decisions were made in the founding session). Sessions in this program are execution sessions. Each session reads the slice doc, verifies the plan against the current code, implements, and writes state back.

**The 6-agent ship pattern applies to every slice.** Per memory: 4 pre-impl agents (investigator → planner → big-picture reviewer → adversary) + 2 post-impl agents (reviewer + independent verifier). 4/4 pre-impl unanimous required before any code changes land.

---

## Slice-status vocabulary

- **not-started** — slice doc exists with locked plan; no code written yet.
- **in-progress** — active execution session; code partially written.
- **verifying** — code written; post-impl agents reviewing.
- **shipped** — code merged; post-impl review passed.

---

## Start-of-session protocol (every session)

Read in this order before doing anything else:

1. `Conversations/auth-login-email/README.md` (this file)
2. `Conversations/auth-login-email/INDEX.md` (slice statuses — what's next?)
3. `Conversations/auth-login-email/SESSION_LOG.md` (last 3 entries)
4. `Conversations/auth-login-email/00-system-map.md` (current code state reference)
5. The slice doc for the slice being worked this session (`slices/0N-name.md`)
6. Auto-memory at `~/.claude/projects/-Users-veritypost-Desktop-verity-post/memory/MEMORY.md`

Tell the owner one paragraph: which slice, current status, what this session covers, what's left after.

---

## Execution session protocol

1. Re-read `00-system-map.md`, focused on this slice's section and its cross-slice seams.
2. Run the 4 pre-impl agents (investigator → planner → big-picture reviewer → adversary). All four read the actual code. 4/4 unanimous required.
3. If not 4/4: per memory, dispatch 4 fresh agents on the disputed point. Their verdict decides.
4. Implement. One PR per slice.
5. Run the 2 post-impl agents (reviewer + independent verifier).
6. Update the slice doc status to `shipped`.
7. Update `INDEX.md`.
8. Append `SESSION_LOG.md`.

---

## End-of-session protocol (every session)

Before stopping, write three things:

1. Update the slice doc (status, any absorbed corrections from impl).
2. Update `INDEX.md` — slice statuses, last-touched, any cross-slice findings.
3. Append a new entry to `SESSION_LOG.md`.

Skipping any of these leaves the next session blind.

---

## Decision discipline

- **All design decisions are already locked** from the founding session (2026-04-29). Don't re-open without explicit owner direction.
- **Cross-slice findings go in INDEX.md**, not decided within one slice.
- **Deferred items stay deferred.** Edition drop, reader question at first login, and founding reader label are named deferred items. Don't surface them as TODOs or next steps during execution.
- **Memory rules apply.** Security-only email scope (the sign-in email and approval email are security/transactional — allowed). No user-facing timelines. Lowercase wordmark. No keyboard shortcuts in admin.

---

## Key technical constraints (read before every execution session)

- `admin.generateLink({ type: 'magiclink' })` throws for emails with no `auth.users` row. Always `admin.createUser` first for new users.
- The confirm route **must be a Route Handler (`route.ts`)**, not a server component page. Cookies can't be written in server components.
- `admin.verifyOtp()` does not exist on the admin namespace. Use `createOtpClient().auth.verifyOtp()`.
- `runSignupBookkeeping` takes a `NextResponse` as its last argument and writes the referral cookie-clear to it. The same object must be returned from the route handler.
- `data.properties.hashed_token` is the correct path into the `generateLink` response — not `data.hashed_token`.
- The Supabase magic-link email template must be disabled in the Supabase dashboard **in the same deploy** as the send-flow change (Slice 3). Otherwise users get two emails.

---

## Deferred items (named, intentional)

- **Edition drop on day-one landing** — deferred until real editorial content exists. Don't build against dummy data.
- **Reader question instead of username modal** — move to a day-3 in-feed prompt, not first login. Building the prompt itself is a future slice.
- **Founding reader label** — needs a DB column decision and migration. Not scoped for this program.
- **Confirm page visual design** — the `/welcome` wordmark fade-in concept. The confirm route redirects to `/`. A branded intermediate page is a polish-pass item, not a blocker.

---

## Files in this program

```
Conversations/auth-login-email/
├── README.md             ← this file (rules)
├── INDEX.md              ← live dashboard
├── SESSION_LOG.md        ← chronological narrative
├── 00-system-map.md      ← current code state (foundation reference)
├── slices/
│   ├── 01-ops.md         ← Vercel + Resend env vars (owner action)
│   ├── 02-email-templates.md
│   ├── 03-send-flow.md
│   ├── 04-confirm-route.md
│   └── 05-first-login-ux.md
└── SUMMARY.md            ← final ship sequence (when all slices shipped)
```
