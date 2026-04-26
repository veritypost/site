# Web — Login / Signup / Auth Flows

**Files:** `web/src/app/login/page.tsx`, `web/src/app/signup/page.tsx`, `web/src/app/signup/pick-username/page.tsx`, `web/src/app/forgot-password/page.tsx`, `web/src/app/reset-password/page.tsx`, `web/src/app/verify-email/page.tsx`, `web/src/app/welcome/page.tsx`.
**Owner:** Wroblewski (forms), Zhuo (lifecycle onboarding).
**Depends on:** `08_DESIGN_TOKENS.md`, `12_QUIZ_GATE_BRAND.md`, `17_REFUSAL_LIST.md`, `16_ACCESSIBILITY.md`.

---

## Current state

- `/login` — email/username + password OR OAuth (Apple, Google). Per web-recon: email vs username not visually differentiated.
- `/signup` — email, password, username selection. Deferred email verification.
- `/signup/pick-username` — post-auth username flow.
- `/signup/expert` — expert profile application.
- `/forgot-password`, `/reset-password` — reset flow.
- `/verify-email` — hold until link clicked.
- `/welcome` — post-signup onboarding (currently unclear coverage).

## What changes

### `/login` — differentiate email vs username

Single input with helper text: "Email or username". Server resolves which via `/api/auth/resolve-username`. Visual: placeholder text is dynamic based on what's being typed (contains @ → "email"; else → "username"). Subtle, non-blocking.

### `/signup` — lead with quiz mechanic

Top of page, above the form:

> Verity is a news site where the comments are worth reading — because commenters proved they read the article. Create an account to join the conversation.

Signup form unchanged structurally. Copy leads with the mechanic (`01_POSITIONING.md`).

### `/welcome` — first-time-visitor flow

After signup, land on `/welcome`. Three screens:

1. **How Verity works.** The quiz gate mechanic, plain language.
2. **What Verity refuses.** Small version of the refusal list (top 5 items).
3. **Pick your categories.** Selects categories for personal feed customization (stays with the reader-configurable `/profile/settings/feed`).

No "skip" on screen 1–2. Readers set the mental model. Screen 3 has skip.

### `/verify-email` — patience + warmth

Current copy: "Check your email." Update to add reassurance:

```
We sent you a link.

Open it to confirm your email and unlock your account.

Didn't get it? [ Resend in 60s ]
```

Cooldown currently 60s (per recon) — keep.

### OAuth error paths

If Apple or Google OAuth fails, calm error:

> We couldn't sign you in with Apple.
>
> You can try again, or use your email and password.

No red banner. No "error!" No stack trace.

## Files

- `web/src/app/login/page.tsx` — input differentiation.
- `web/src/app/signup/page.tsx` — leading copy.
- `web/src/app/welcome/page.tsx` — three-screen onboarding.
- `web/src/app/verify-email/page.tsx` — copy polish.

## Acceptance criteria

- [ ] Email vs username input has dynamic helper.
- [ ] Signup page leads with quiz mechanic copy.
- [ ] Welcome flow: 3 screens, first two non-skippable.
- [ ] Verify email copy warmed up.
- [ ] OAuth errors handled with invitation voice.
- [ ] Accessibility: form labels, error states announced by SR, keyboard navigable.
- [ ] No emoji.

## Dependencies

Ship after `08_DESIGN_TOKENS.md`, `17_REFUSAL_LIST.md`.
