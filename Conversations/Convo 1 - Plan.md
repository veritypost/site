# Convo 1 — Login & Access Redesign — Implementation Plan

**Date:** 2026-04-29
**Source:** `Conversations/Convo 1.md` (locked plan, owner-approved, no code yet).
**Status:** Plan only. Owner has not greenlit yet. Read this end-to-end before touching code.

> **Source revision note (2026-04-29):** Convo 1.md grew an "adversarial review pass" section after the first plan draft. This rewrite folds in 16 clarifications and 3 new locked decisions. The most material changes:
> - Email change uses Supabase's built-in link confirmation for the new address (not a custom OTP). `/verify-email/` keeps a narrow handler for that callback even though it's gone as a UI page.
> - Trial-warning banners derive **live** from `comped_until` via `deriveAccountStates()` in `profile/_lib/states.ts`. **No `in_app_banners` table.** The cron only does the plan downgrade.
> - Strangers without a session bounce to `/signup`, not `/login`. Both `/login` and `/signup` are public by design.
> - Disabled OAuth code (`OAUTH_ENABLED = false`) stays — don't remove.

---

## How to use this document

This plan is divvied into **6 sessions**. Each session is a self-contained PR (or small group of PRs) that builds on the previous one but doesn't require it to be in production yet — only that the build passes.

Every session lists:
- **Scope** — what lands in this PR.
- **DB / Supabase dashboard work** — migrations, dashboard toggles.
- **Files to add / modify / delete** with line ranges.
- **API routes** — added, modified, deleted.
- **Implementer verification checklist** — what to manually test.
- **Owner gut-check items** — questions to surface before merging.

**Implementers must double-check this plan against current code.** Several memory items in scope:
- *Verify audit findings against current code* — file paths and line numbers were captured 2026-04-29 by parallel readers. Re-grep before edit; lines drift.
- *MCP-verify schema, never trust supabase_migrations log* — query `information_schema` directly before writing migrations.
- *Genuine fixes, never patches* — when ripping password infra, kill it cleanly. No parallel paths, no TODOs.
- *6-agent ship pattern* (4 pre-impl + 2 post-impl) for non-trivial sessions. Sessions 2 and 3 are non-trivial.
- *No popups, security-only emails, no color-per-tier, no keyboard shortcuts.*
- *@admin-verified marker is dropped — do NOT reintroduce.*

---

## Pre-flight (before Session 1)

Run once before opening any PR in this stream:

1. **MCP-verify the actual schema** for the columns the plan assumes exist:
   - `users.comped_until` (timestamptz, nullable) — assumed present.
   - `users.referred_by` (uuid, nullable, FK→users) — assumed present (verify; if absent, add migration in Session 3).
   - `users.username` (varchar, nullable) — assumed nullable; confirm not NOT NULL.
   - `users.cohort` / `users.cohort_joined_at` — assumed present, set by `apply_signup_cohort`.
   - `users.onboarding_completed_at` (timestamptz, nullable) — used as first-signin proxy.
   - `users.plan_id` (uuid, FK→plans) — assumed present.
   - `plans` table: confirm rows for `free`, `pro`, `family`, `verity`, `kids`.
   - `access_codes` table — confirm columns: `tier` (`owner`|`user`), `owner_user_id`, `is_active`, `disabled_at`, `expires_at`, `max_uses`, `current_uses`.
   - `access_requests` table — confirm columns: `email`, `name`, `reason`, `referral_source`, `status`, `metadata`. **Plan adds `referral_medium`.**
   - `settings` table — confirm `beta_active` exists; we add `beta_trial_duration` (Session 4).

2. **MCP-read the `apply_signup_cohort` RPC body** before Session 4. The plan extends it to read `beta_trial_duration` and to set `referred_by`. Get the current SQL definition with:
   ```sql
   SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'apply_signup_cohort';
   ```

3. **Re-grep file/line references** — line numbers in this plan came from a static read on 2026-04-29. They drift. Use `rg -n` to confirm before editing.

4. **iOS verification grep** (one-time, before Session 2 password-deletion):
   ```bash
   rg -n "verify-password|/api/auth/signup\b|signupRollback" VerityPost/ VerityPostKids/
   ```
   Expected: zero hits. iOS uses Supabase OTP via the SDK, not our password API. If hits exist, surface to owner before deleting.

5. **Read the upstream memory items** referenced in `MEMORY.md` (especially `feedback_genuine_fixes_not_patches.md`, `feedback_4pre_2post_ship_pattern.md`, `project_email_notifications_scope.md`, `feedback_no_color_per_tier.md`).

6. **Confirm no parallel work** is in flight on auth surfaces. Last known auth-touching commits as of 2026-04-29 (main): `89f3ed1` (adsense), `4ab5b53` (Session E PR 2). Auth code untouched recently — safe.

---

## Session 1 — Phase-1 Quality Fixes (3 small independent PRs)

These are pure-quality fixes that don't change UX semantics. Ship as **three independent reviewable PRs** so any one can be reverted without affecting the others. Run these first; they de-risk everything downstream.

### PR 1.1 — Permission flicker fix

**Scope:** Components flash from "no access" to "granted" for ~half a second on sign-in because `PermissionsProvider` flips `loaded=true` before `refreshAllPermissions()` finishes hydrating.

**Locked fix per convo:** `PermissionsProvider` does NOT set `loaded=true` until the first perms fetch resolves. Children render a thin loading state until then. Fix lives at the provider level, not per-component, so all permission-gated UI inherits it consistently.

**Files to modify:**
- `web/src/components/PermissionsProvider.tsx`
  - Lines 42–58 — `loaded` state currently flipped immediately after `getUser()` resolves; perms fetch is fire-and-forget downstream. **Change so `loaded=true` only fires when both `getUser()` AND the first `refreshAllPermissions()` have resolved (or definitively failed).**
  - Lines 168–189 — `useCapabilities` hook. Confirm `ready: caps !== null` is consistent with the new `loaded` semantics.
- Spot-check consumers that gate on `loaded`:
  - `web/src/app/NavWrapper.tsx`
  - Any admin landing pages that show "no access → granted" flicker

**Fix shape:** Initialize `loaded: false`. Promise-chain `getUser()` → `refreshAllPermissions()` → `setLoaded(true)`. Consumers continue to gate on `loaded`; the flicker disappears because the gate is now correct. Render a thin neutral skeleton/empty state during the loading window — not a spinner, not a popup.

**Implementer verification:**
- Sign out → sign in → confirm gated UI never flashes "no access" before the granted state.
- Sign in as `admin@veritypost.com` → admin nav links don't pop in late.
- Network throttle to Slow 3G → flicker still gone.
- Anon visit → no infinite loading state (handle the "no user, no perms to fetch" case explicitly).

**Owner gut-check:** None. Pure quality fix.

---

### PR 1.2 — `?toast=session_expired` emission from middleware

**Scope:** Middleware silently redirects expired sessions to `/login` with no signal. Login page already handles `?toast=session_expired` (lines 104–111 of `web/src/app/login/page.tsx`); we wire middleware to emit the param when (and only when) the cause is session expiry.

**Locked detection rule per convo:** Middleware distinguishes expired-session bounces from anon-user bounces by **checking for the auth cookie's presence even when `getUser()` returns null**. Auth cookie present + no user = expired session → emit toast. Auth cookie absent = anon visitor → no toast.

**Files to modify:**
- `web/src/middleware.js`
  - Lines 446–454 — current redirect to `/login` preserves `?next=` only. Add the cookie-presence check (look for `sb-...-auth-token` cookie) and conditionally append `loginUrl.searchParams.set('toast', 'session_expired')`.
  - Lines ~422–432 — beta-gate redirect path: must NOT emit toast (different cause).

**Files to verify only (no changes):**
- `web/src/app/login/page.tsx` lines 104–111 — confirm the existing handler already covers `session_expired`. Quote the snippet in PR description.

**Implementer verification:**
- Manually expire a session (delete the auth cookie's value but leave the cookie key, or wait it out) → navigate to a protected route → land on `/login?next=...&toast=session_expired` → see the existing yellow banner.
- Anon visits `/profile` (no auth cookie at all) → lands on `/login?next=/profile` with NO toast.
- Beta-gate bounce → no toast.

**Owner gut-check:** None.

---

### PR 1.3 — Callback-handler await fixes

**Scope:** The returning-user fast path in the auth callback fires off post-login bookkeeping in a `void (async () => {...})()` block that doesn't block the redirect. Stale flags can linger ~60s if any RPC fails. Convo locks: await the fast ones; only `scoreDailyLogin` stays async.

**Files to modify:**
- `web/src/app/api/auth/callback/route.js`
  - Lines 220–251 — the fire-and-forget block. RPCs:
    - Line 227 — `users.update({ last_login_at, email_verified })` — **await**.
    - Line 232 — `rpc('cancel_account_deletion', ...)` — **await**.
    - Line 236 — `rpc('complete_email_verification', ...)` — **await**.
    - Line 246 — `scoreDailyLogin(...)` — **stays fire-and-forget** (slowest, least critical, recoverable on next login).

**Fix shape:** Refactor so the three fast calls are awaited inline before the redirect completes, wrapped in try/catch. Errors → `audit_log` row (Sentry deferred per memory). Slow `scoreDailyLogin` stays in a separate `void (async () => { ... })()` wrapper.

**Implementer verification:**
- Sign in as a returning user → `users.last_login_at` updates synchronously (query DB during the same request lifecycle).
- Sign in with a deletion-pending account → `cancel_account_deletion` runs before redirect, home reflects the cancelled state.
- Sign in with an unverified email → `complete_email_verification` runs before redirect, `email_verified=true` is visible on home.
- Force one of the three RPCs to throw (in dev) → login still completes; error written to audit log; user lands on home.

**Owner gut-check:** None.

---

### Session 1 close-out
- Three independent PRs merged.
- Build green, no UX changes visible to existing users beyond the flicker disappearing.
- No DB migrations, no schema changes.
- Move to Session 2 when all three are merged on `main`.

---

## Session 2 — Main Auth Redesign

This is the heart of the work and the largest session. **Ship as one PR if reviewable; split into two only if it crosses a reviewability threshold** (PR 2A: single-door page + welcome modal + dead-route cleanup; PR 2B: code-verify route + email-change rebuild + middleware redirect change).

### Scope summary
1. Single-door login page (rip three-tab structure).
2. Code-verify route (`/api/auth/verify-magic-code`) + shared post-exchange helper.
3. Welcome modal on first sign-in (handle picker, undismissable until saved).
4. Remove password infrastructure (UI never existed; backend routes get deleted).
5. Remove dead beta-confirmation routes + middleware allowlist cleanup.
6. Email-change flow: in-session "you sure?" + Supabase's existing link-based new-email confirmation.
7. Middleware: anon strangers bounce to `/signup` (not `/login`).

### Supabase dashboard work (one-time, do FIRST, owner-driven)

These are dashboard settings, not migrations:

- ~~**OTP lifetime:**~~ **DONE.** Changed to 1800s (30 min) 2026-04-29.
- ~~**Email template:**~~ **DONE.** `{{ .Token }}` added to magic-link template body 2026-04-29.

**Pre-merge staging smoke-test:** before the auth-redesign PR merges to main, send a real OTP from staging and confirm the email body contains a 6-digit token. Without `{{ .Token }}` the dashboard change was forgotten and day-one login is silently broken.

### DB migrations

**Migration A — Make `users.username` definitively nullable (verify-only or fix).**

Account creation must allow inserting a `users` row before the welcome modal collects a handle. Explorer reported username is already nullable; MCP-verify and add a migration only if not.

```sql
-- supabase/migrations/2026-04-30_users_username_nullable.sql
ALTER TABLE public.users ALTER COLUMN username DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_when_set
  ON public.users (lower(username))
  WHERE username IS NOT NULL;
```

**Migration B — Owner allowlist row.**

```sql
-- supabase/migrations/2026-04-30_owner_allowlist.sql
INSERT INTO public.access_requests (email, status, type, name, reason, metadata, created_at, updated_at, approved_at)
VALUES (
  'admin@veritypost.com', 'approved', 'closed_beta',
  'Cliff (owner)', 'owner allowlist', '{"reason":"owner_recovery_safety_net"}',
  now(), now(), now()
)
ON CONFLICT (email) DO NOTHING;
```

If `access_requests.email` doesn't have a UNIQUE constraint, MCP-verify and add one or use a different conflict strategy.

**Migration C — Rate-limit constants for the new verify route.**

Whatever shape the existing rate-limit policy table takes (likely `rate_limit_policies` or similar — MCP-verify), insert two new rows in the same migration that creates the verify route:
- `AUTH_MAGIC_CODE_FAILURES_PER_ACCOUNT` — 10 failures in 24 hours per account → 1-hour lockout.
- `AUTH_MAGIC_CODE_PER_EMAIL_HOURLY` — 3 codes per email per hour (mirrors existing send-magic-link cap).
- `AUTH_MAGIC_CODE_ATTEMPTS_PER_CODE` — 5 attempts per code before invalidation.

The constants must also be added to `web/src/lib/rateLimits.ts` (or wherever `AUTH_MAGIC_LINK_SEND_PER_EMAIL` etc. live today).

### Files to ADD

**1. `web/src/app/api/auth/verify-magic-code/route.ts` (new)**

POST handler taking `{ email, code }`. Calls `supabase.auth.verifyOtp({ email, token: code, type: 'email' })`. On success, runs the same post-exchange bookkeeping as the magic-link callback via the shared helper (see #2). On failure, returns the same generic 200 as send-magic-link rate-limit hits.

**Privacy posture rules** (must be tested explicitly — see verification checklist):
- Wrong code, expired code, used code, banned account, locked account, unrecognized email → identical generic response.
- Real reason → `audit_log`.
- Apply rate limits from Migration C.

Mirror `send-magic-link/route.js`'s ban/lock/banned-account handling exactly so future regressions don't quietly leak signal.

**2. `web/src/lib/auth/postLoginBookkeeping.ts` (new shared helper)**

Extract the post-`exchangeCodeForSession`/`verifyOtp` bookkeeping currently in `callback/route.js`:
- `users` upsert / last_login_at / email_verified update.
- `auth_providers` insert (signup only).
- Default role assign (signup only).
- `audit_log` insert (`auth:signup` or `auth:signin`).
- `cancel_account_deletion` RPC.
- `complete_email_verification` RPC.
- `scoreDailyLogin` (kept fire-and-forget per Session 1.3).
- `processSignupReferralAndCohort` (signup only).

Two exports: `runSignupBookkeeping(...)` and `runReturningUserBookkeeping(...)`. Both routes (`callback` and `verify-magic-code`) import these.

**3. `web/src/components/welcome/WelcomeModal.tsx` (new)**

Mirror `ConfirmDialog.tsx` pattern (focus trap, Tab handling). Differences:
- **Cannot be dismissed.** No Esc, no backdrop click, no X button.
- Inputs: handle field with live availability check (debounced 250ms, calls `/api/auth/check-username` — already exists).
- Submit calls `/api/auth/save-username` (already exists).
- **Reads `?next=` from search params on mount, holds it, redirects to it after username save.** Falls through to home if absent.
- Copy: roughed in per convo. Owner explicitly said copy gets polished in Session 6.

**4. `web/src/components/welcome/WelcomeModalMount.tsx` (new client island)**

Mounts `WelcomeModal` conditionally:
- Reads user from `usePermissionsContext()`.
- Triggers if `user && !user.username && !user.onboarding_completed_at`.
- Lives in `NavWrapper.tsx` so it covers all post-login landings, not just home. Confirm with owner.

**5. `web/src/app/login/_SingleDoorForm.tsx` (new, replaces `_MagicLinkForm.tsx`)**

Single-door form:
- State 1: email field + continue button. Footer line: "new here? we're invite-only during beta. request access →" (reads `beta_active` from server, swaps to "sign up" when false).
- State 2 after submit: 6-digit code field + verify button. Resend code link with 30s cooldown.
- On verify success: redirect per `?next=` or `/`.
- Privacy posture in error states.

**OAuth note:** The `OAUTH_ENABLED = false` flag and the disabled Google/Apple buttons stay in place. **Don't remove the disabled OAuth code.** Optionality is real; cost of leaving it is essentially zero. Document the flag in code comments so future readers don't think it's accidental.

The lowercase wordmark above the form is owner-locked.

### Files to MODIFY

**1. `web/src/app/login/page.tsx` (heavy rewrite)**

- Lines 242–296 (three-tab structure): **delete entirely**. Replace with single mount of `_SingleDoorForm`.
- Lines 104–111 (toast handler): keep as-is (Session 1.2 already wired session_expired).
- Lines 335–341 (`MagicLinkForm` mount): replace with `_SingleDoorForm`.
- Add a "having trouble signing in?" link near the bottom for users who lost old-email access.
- Add a footer link "new here? read about us →" pointing to `/signup`.
- The disabled OAuth section (whatever its current line range is) **stays** — gated by `OAUTH_ENABLED = false`. Owner gut-check on placement when single-door form lands.

**2. `web/src/middleware.js`**

- **Anon-bounce target change:** lines that currently redirect anon strangers to `/login` (the protected-routes redirect, around lines 446–454) → change target to `/signup`. Logged-in users untouched.
- **Beta-gate allowlist:** ensure both `/login` and `/signup` are public-by-design. Lines around 422–432 (beta-gate redirect) — add `/signup` to the allowlist if not present.
- **Allowlist cleanup:** when this PR deletes `/forgot-password/`, `/reset-password/`, `/verify-email/` (UI page only — the route file stays as a narrow handler), `/signup/pick-username/`, and `/request-access/confirmed/`, remove their entries from the middleware's path allowlist in this same PR.
- **Session-expired toast emission:** already shipped in Session 1.2; verify still working after the redirect-target change.

**3. `web/src/app/api/auth/email-change/route.js` (light rewrite)**

The convo's "code to new email" framing was imprecise. Locked correction: **Supabase's `auth.updateUser({ email })` already sends a link-based confirmation to the new email**, and Supabase verifies it via that link (no custom OTP needed). What we build is **only** the in-session "you sure?" confirmation gate.

Current shape (lines ~109, 135–142, 152, 166, 180): the route already calls `auth.updateUser({email})`, flips `email_verified=false`, etc. Light changes:
- Add an in-session "are you sure? you'll sign back in with the new email" client-side confirmation step **before** the API call. This lives in `EmailsCard.tsx` (see below), not the route.
- Confirm rate limit covers session-hijack threats.

**4. `web/src/app/profile/settings/_cards/EmailsCard.tsx` (lines 32–50)**

- Add a two-step UX: type new email → "send confirmation" button shows a confirm sub-card ("are you sure? you'll sign back in with the new email") → confirm calls the API.
- API behavior unchanged (Supabase sends the link to the new address).
- Pending-state copy: "we sent a link to <new-email>. click it to finish the change."

**5. `web/src/app/api/auth/logout/route.js`**

One-line addition: clear the `vp_ref` invite cookie in the same response that calls `supabase.auth.signOut()`. Prevents stale invite cookies persisting across sessions.

**6. `web/src/lib/betaGate.ts` (light cleanup)**

The convo says: "betaGate.ts simplifies as the dual-path (cookie OR approval) collapses into something cleaner." Re-read; if there's redundant branching from the old request-access/confirm flow, prune it. Don't change gate semantics.

### Files to DELETE

**One consolidated cleanup PR (or part of Session 2's main PR).**

**Backend:**
- `web/src/app/api/auth/signup/route.js` — entire dir.
- `web/src/app/api/auth/verify-password/route.js` — entire dir.
- `web/src/app/api/auth/signup-rollback/route.js` — entire dir.
- `web/src/app/api/access-request/confirm/route.ts` — entire dir.

**Frontend:**
- `web/src/app/login/_MagicLinkForm.tsx` — replaced by `_SingleDoorForm.tsx`.
- `web/src/app/forgot-password/page.tsx` — passwords are gone; login footer covers recovery via "having trouble signing in?".
- `web/src/app/reset-password/page.tsx` — same reasoning.
- `web/src/app/verify-email/page.tsx` (the **UI page only**) — delete.
- `web/src/app/signup/pick-username/page.tsx` — replaced by welcome modal.
- `web/src/app/request-access/confirmed/page.tsx` — dead route.

**Files that STAY (don't accidentally delete):**
- `web/src/app/api/auth/email-change/` — Supabase's link-based new-email confirmation needs this; light rewrite only.
- **A narrow Supabase-callback handler at `/verify-email`** — Supabase's email-change flow lands here. Keep it as a tiny route handler (no UI page) that handles the callback and redirects to `/profile/settings?email_changed=1`. **Verify which file holds this today** — likely a route inside `/verify-email/` other than `page.tsx`. If only `page.tsx` exists, replace it with a minimal `route.ts` handler.
- `web/src/app/signup/expert/page.tsx` — **DELETE.** Expert application moved to the profile (`profile/_sections/ExpertApplyForm.tsx`, `profile/settings/expert/page.tsx`). This file is dead code.
- `web/src/app/signup/pick-categories/page.tsx` and the `/welcome` carousel — see Session 5 for status.

**Database (cleanup, scheduled for Session 6):**
- `access_requests.email_confirm_token`, `access_requests.email_confirm_expires_at`, `access_requests.email_confirmed_at` columns become dead schema after `/api/access-request/confirm` deletion. Don't drop in this PR — Session 6 polish.

### iOS verification checkpoint (before deletion)

Per pre-flight step 4: `rg -n "verify-password|/api/auth/signup\b|signupRollback" VerityPost/ VerityPostKids/`. If zero hits, proceed with deletion. If hits, surface to owner.

### Implementer verification checklist

- [ ] Sign-in flow: email → code → verified, lands on home (or `?next=`).
- [ ] First sign-in flow: same as above, but welcome modal mounts and blocks interaction until handle saved. **`?next=` survives the modal and redirects after save.**
- [ ] Welcome modal cannot be dismissed via Esc, backdrop click, or X button.
- [ ] **Privacy posture test (explicit):** wrong code / expired code / used code / banned account / unrecognized email → identical responses. New test file `tests/auth/verify-magic-code-privacy.test.ts` covers all five cases.
- [ ] Cross-device test: send code on desktop, type code on desktop. Email arrives on phone with the code visible.
- [ ] Email-change flow: type new email → see "are you sure?" → confirm → Supabase emails the new address → click link → email swaps + signed back in with new email.
- [ ] Password-related routes return 404, not 500.
- [ ] `/forgot-password`, `/reset-password`, `/request-access/confirmed`, `/signup/pick-username` return 404.
- [ ] `/verify-email` UI page returns 404 BUT the Supabase callback handler at that path still works.
- [ ] Owner allowlist works: even with `beta_active=true` and no cookie, `admin@veritypost.com` can sign up.
- [ ] Audit log gets an `auth:signin` or `auth:signup` row for every successful verify.
- [ ] Returning user with `username` already set: welcome modal does NOT mount.
- [ ] Anon visits `veritypost.com/` → bounced to `/signup` (not `/login`).
- [ ] Anon visits `/login` directly → gets the bare login page.
- [ ] Logout clears `vp_ref` cookie.
- [ ] Disabled OAuth code still in `_SingleDoorForm.tsx`, gated by `OAUTH_ENABLED = false`.
- [ ] **Pre-merge staging smoke-test:** real OTP email from staging contains a 6-digit code in the body.

### Owner gut-check items

- **Expert signup flow** — rewrite to magic-link, or keep password just for them?
- **Welcome modal mount point** — `NavWrapper` (recommended, everywhere) or `home/page.tsx` only?
- **Support contact path** — `mailto:` link. Implementer: check `/contact` page and existing support email before hardcoding; use whatever's already canonical.
- **Dashboard changes** — **DONE 2026-04-29.** OTP lifetime 1800s, `{{ .Token }}` in magic-link template.

---

## Session 3 — Access / Invite / Cohort

### Scope summary
1. Personal `/r/<username>` link on every user (one per user, persistent, never rotates).
2. Profile UI with "X of N invites left" counter.
3. Beta-state-aware cap enforcement (default 2 during beta, unlimited after; per-user override in admin).
4. Cohort `source` and `medium` fields on invites and access-requests.
5. `referred_by` foreign key on users (verify exists; populate on redemption — done in `apply_signup_cohort`).
6. Admin queue extensions: bulk-approve, source/medium inputs at approval.
7. Request-access form gets `name` and `reason` fields (current form is email-only).

### DB migrations

**Migration D — Personal user invite codes uniqueness.**

`/r/[slug]` resolves `[slug]` as a username, looks up that user, finds their personal access_code (`tier='user'`, `owner_user_id=user.id`). Lazy-create on first profile visit if missing. **Path A** per the prior review.

```sql
-- supabase/migrations/2026-05-XX_personal_invite_uniqueness.sql
CREATE UNIQUE INDEX IF NOT EXISTS access_codes_one_personal_per_user
  ON public.access_codes (owner_user_id)
  WHERE tier = 'user' AND is_active = true AND owner_user_id IS NOT NULL;
```

**Migration E — Cohort source/medium fields.**

```sql
ALTER TABLE public.access_codes ADD COLUMN IF NOT EXISTS cohort_source varchar(64);
ALTER TABLE public.access_codes ADD COLUMN IF NOT EXISTS cohort_medium varchar(64);
CREATE INDEX IF NOT EXISTS access_codes_cohort_source_idx ON public.access_codes (cohort_source);
CREATE INDEX IF NOT EXISTS access_codes_cohort_medium_idx ON public.access_codes (cohort_medium);

ALTER TABLE public.access_requests ADD COLUMN IF NOT EXISTS referral_medium varchar(64);
-- referral_source already exists per schema map; just add medium.
```

**Migration F — Per-user invite cap override.**

```sql
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS invite_cap_override integer;
-- null = use global default (settings.invite_cap_default); integer = per-user override.

INSERT INTO public.settings (key, value, value_type, category, display_name, description, is_public, is_sensitive)
VALUES ('invite_cap_default', '2', 'number', 'beta',
  'Default invite cap (during beta)',
  'Default number of invites each user can spread during beta. Per-user overrides on the user dossier.',
  false, false)
ON CONFLICT (key) DO NOTHING;
```

**Migration G — `referred_by` populate (verify-only or fix).**

If `users.referred_by` already exists, MCP-verify the `apply_signup_cohort` RPC populates it on signup (the convo says it should). If not, update the RPC body in this migration.

### Files to ADD

**1. `web/src/app/api/admin/access-requests/bulk-approve/route.ts` (new)**

POST handler taking `{ ids: string[], source?: string, medium?: string }`. Iterates and calls the same approve RPC chain per row. Permission: reuses existing `admin.access_requests.approve` key — no new DB row needed. Returns aggregate `{ approved: number, failed: number, errors: [...] }`.

**2. `web/src/app/profile/_sections/InviteLinkCard.tsx` (new)**

Profile section showing:
- The user's `/r/<username>` link with a copy button.
- Counter: "X of N invites left" — reads `access_codes.current_uses` and `(invite_cap_override ?? settings.invite_cap_default)`.
- Quiet — no share-on-Twitter button.

Mount in the existing profile shell. Find the section list in `web/src/app/profile/page.tsx` and adjacent `_sections/` files.

**3. `web/src/app/admin/users/[id]/_sections/InviteOverrideCard.tsx` (new)**

Per-user admin control: edit `invite_cap_override`. Submit hits a new admin endpoint:

**4. `web/src/app/api/admin/users/[id]/route.ts` (new PATCH endpoint)**

Accepts `{ invite_cap_override?: number | null, trial_extension_until?: timestamptz | null }`. Permission: `admin.users.edit`. Used by both Session 3 (invite cap) and Session 4 (trial override) — register here so we don't ship two endpoints.

### Files to MODIFY

**1. `web/src/app/r/[slug]/route.ts`**

- Lines 26 (`SLUG_RE = /^[a-z0-9]{8,12}$/`): change to allow username format. Reuse `USERNAME_RE` from the welcome-modal handle picker.
- Lines 55–87 (resolve slug): change to resolve username → user → their personal access_code. Lazy-create personal code (with `cohort_source='referral'`, `cohort_medium='user-{username}'`) if missing.
- Keep all hardening: IP rate limit, Sec-Fetch-Dest CSRF check, generic miss response.

**2. `web/src/app/admin/access-requests/page.tsx`**

- Lines 144–188 (DataTable columns config): add a checkbox column at index 0 for multi-select.
- Add a "Bulk approve selected (N)" button above the table that becomes active when ≥1 rows selected.
- Lines 243–332 (approve drawer): add two text inputs — `source` and `medium` — to the approve form. Free-form, optional. Submit passes them to the approve API.

**3. `web/src/app/api/admin/access-requests/[id]/approve/route.ts`**

- Lines 72–77 (`mint_owner_referral_link` RPC): extend to accept `cohort_source` and `cohort_medium`. Update the RPC SQL accordingly (write a migration to redefine the function).
- Lines 119–126 (update payload): add `referral_source` and `referral_medium` from request body to the access_requests row update.

**4. `web/src/app/api/access-request/route.js` (form fields update)**

Current public submission accepts `{ email }`. Convo locks three fields: `email`, `name`, `reason`. Update validator and storage to accept all three. Keep `referral_source` extraction from referer/UTM as today.

**5. `web/src/app/login/page.tsx` (request-access form section)**

The conversational request-access form lives below the login form. Update copy and add `name` + `reason` fields per convo's spec. Confirmation screen: "got it. we'll take a look and email you when you're in. usually within a day or two."

**6. `web/src/lib/referralCookie.ts`** — verify only. No changes.

### Implementer verification checklist

- [ ] Brand-new user signs up → `/r/<their-username>` works immediately (lazy-mint succeeds on first hit).
- [ ] `/r/<unknown-username>` → same generic miss response (privacy posture).
- [ ] Counter shows "0 of 2 invites left" for a fresh beta user.
- [ ] Friend redeems link → counter goes to "1 of 2 invites left."
- [ ] Hit cap → next visit to `/r/<username>` gets graceful "this doesn't work" message.
- [ ] Admin sets `invite_cap_override=10` → counter shows "X of 10."
- [ ] Bulk-approve 5 access_requests → all 5 get approval emails (Resend) and access_codes minted.
- [ ] Source/medium typed on approval gets stored on both the access_request row AND the minted access_code.
- [ ] Signed-in user clicking someone else's `/r/<other>` link: lands on home, no cohort change.
- [ ] `users.referred_by` is set on a fresh signup that came through `/r/<inviter>`.
- [ ] Request-access form accepts and stores `email`, `name`, `reason`.

### Owner gut-check items

- **Default cap of 2 during beta** — confirmed in convo. Settings row is editable in admin.
- **Counter copy** — "0 of 2 invites left" or other? Polished in Session 6.
- **Inviter notification when their link is redeemed** — convo locks: counter only, no banner, no email. Confirm.

---

## Session 4 — Trial Mechanics

### Scope summary
1. Auto-grant 30-day pro on new beta signups (uses existing `comped_until`).
2. Daily cron for `comped_until` expiry sweep — drops users to free.
3. Trial-warning banners derived **live** from `comped_until` (no banner table, no warning cron).
4. Per-user trial overrides (extend, shorten, lifetime, revoke).
5. Global trial-duration knob in `/admin/settings`.
6. Rip the `verity` middle tier.

### Locked design correction (from adversarial review)

**No `in_app_banners` table is created.** The site already has `AccountStateBanner` rendering banners derived from user state via `deriveAccountStates()` in `web/src/app/profile/_lib/states.ts`. Locked: extend that function to emit two new states:
- `trial-ending-week` — when `comped_until - now() < 7 days` and `> 1 day`.
- `trial-ending-day` — when `comped_until - now() < 24 hours` and `> 0`.

The existing banner renders them with appropriate copy. The cron's only job is the actual plan downgrade at expiry — banners are derived live from the timestamp.

This drastically simplifies Session 4: no `in_app_banners` table, no `emit-trial-warnings` cron, no dismiss API, no localStorage juggle.

### DB migrations

**Migration H — Settings row for trial duration.**

```sql
INSERT INTO public.settings (key, value, value_type, category, display_name, description, is_public, is_sensitive)
VALUES ('beta_trial_duration', '30', 'number', 'beta',
  'Beta Trial Duration (Days)',
  'Default trial duration granted to new beta signups. Per-user overrides available on the user dossier.',
  false, false)
ON CONFLICT (key) DO NOTHING;
```

**Migration I — Update `apply_signup_cohort` RPC.**

The RPC already sets `comped_until` for cohort='beta' signups. Update to read `beta_trial_duration` from settings instead of hardcoding 30 days. **Body confirmed in Pre-flight step 2.**

```sql
-- Adapt to the real RPC body — don't blind-overwrite
CREATE OR REPLACE FUNCTION public.apply_signup_cohort(p_user_id uuid, p_via_owner_link boolean)
RETURNS text AS $$
DECLARE
  v_trial_days int;
BEGIN
  SELECT (value::int) INTO v_trial_days FROM public.settings WHERE key = 'beta_trial_duration';
  IF v_trial_days IS NULL THEN v_trial_days := 30; END IF;
  -- ... rest of existing body, using v_trial_days for comped_until ...
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

The RPC must also confirm `referred_by` is being set when invite-driven (Session 3 dependency).

**Migration J — Per-user trial override column.**

```sql
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS trial_extension_until timestamptz;
-- null = no expiry override; cron takes coalesce(trial_extension_until, comped_until).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS trial_extended_seen_at timestamptz;
-- null = user hasn't dismissed the "trial extended" banner yet.
```

**Migration K — Drop `verity` middle tier.**

```sql
DELETE FROM public.plans WHERE tier = 'verity';
```

Owner confirmed zero users on this tier. Run without pre-check.

### Files to ADD

**1. `web/src/app/api/cron/sweep-trial-expiry/route.ts` (new)**

Daily cron that:
- Selects users where `coalesce(trial_extension_until, comped_until) < now()` AND on pro tier AND `cohort = 'beta'`.
- Updates each: drop `plan_id` to free-tier plan id, write audit row.
- That's it — no banner insert, banners derive live.

Pattern: copy from `web/src/app/api/cron/sweep-beta/route.js` for cron auth (`verifyCronAuth`) and shape.

Add to Vercel cron config (`web/vercel.json`) — daily at e.g. 02:00 UTC. Verify there's not already a cron that does this; if so, extend it.

**2. `web/src/app/admin/users/[id]/_sections/TrialOverrideCard.tsx` (new)**

Admin form to set `trial_extension_until` for a user. Buttons: extend by 30 days, set to lifetime (null `comped_until` and `trial_extension_until` — sentinel for "no expiry"), revoke (set to `now()`). Submit hits the existing `/api/admin/users/[id]` PATCH endpoint (created in Session 3).

When admin extends a trial, the user sees a one-time dismissible banner: "your trial has been extended to [date]." Dismissed = gone forever. Stored server-side (not localStorage) so it survives across devices.

Implementation: add a `trial_extended_seen_at` timestamptz column on `users`. Admin sets `trial_extension_until` → also clears `trial_extended_seen_at`. Banner shows in `deriveAccountStates()` when `trial_extension_until IS NOT NULL AND trial_extended_seen_at IS NULL`. Dismiss action sets `trial_extended_seen_at = now()` via a small API call.

### Files to MODIFY

**1. `web/src/app/profile/_lib/states.ts`**

Extend `deriveAccountStates()` (or whatever the actual exported function is — MCP-grep `deriveAccountStates` to confirm name) to emit:
- `trial-ending-week` when `now() < comped_until` AND `comped_until - now() < 7 days` AND `comped_until - now() > 1 day` AND user is on pro AND cohort='beta'.
- `trial-ending-day` when `now() < comped_until` AND `comped_until - now() < 24 hours`.

Use `coalesce(trial_extension_until, comped_until)` for the comparison (the override wins).

**2. `web/src/components/AccountStateBanner.tsx`**

Confirm the new state keys are picked up. Add copy for each. Severity: `trial-ending-day` higher than `trial-ending-week`. Owner Sessions-6-polishes copy.

**3. `web/src/app/api/cron/sweep-beta/route.js`**

Re-read its actual behavior; if it overlaps with the new sweep-trial-expiry, decide: combine or keep separate. Recommendation: keep separate, name them by purpose.

**4. `web/src/app/admin/settings/page.tsx`**

No code changes needed — the page renders rows by category dynamically. The new `beta_trial_duration` row appears automatically once Migration H runs.

**5. `web/src/app/api/admin/users/[id]/route.ts` (the PATCH route from Session 3)**

Wire `trial_extension_until` field. Already designed to accept it.

### Files to DELETE
None.

### Implementer verification checklist

- [ ] New beta signup gets `comped_until = now() + 30 days` AND on pro tier.
- [ ] `beta_trial_duration` set to 60 in admin → next signup gets 60-day trial.
- [ ] User 7 days from expiry → `trial-ending-week` banner appears.
- [ ] User <24 hours from expiry → `trial-ending-day` banner appears (week banner gone).
- [ ] Cron run on day 30+ → user dropped to free, banners disappear automatically.
- [ ] Admin sets `trial_extension_until = now() + 60 days` → user keeps pro, banners disappear (extension > week).
- [ ] Admin revokes (sets `comped_until = now()`) → user drops to free on next cron run.
- [ ] `verity` tier no longer in any user-facing dropdowns.
- [ ] No popups for any of these events; all top-of-page strips.
- [ ] No emails sent for any of these events.

### Owner gut-check items

- **"Trial extended" notification** — one-time dismissible banner, stored server-side via `trial_extended_seen_at` column.
- **Lifetime trial sentinel** — null `comped_until` (treat as "no expiry") or far-future timestamp? Recommendation: null + cron treats null as "no expiry."
- **Beta sweep vs trial-expiry sweep** — keep separate or merge?
- **Verity-tier drop** — confirm no live users before DELETE.

---

## Session 5 — `/signup` Landing Page

### Scope summary

Repurpose `/signup` from a near-clone of `/login` into the public-facing manifesto + sample article + access flow page. **Per the adversarial review, `/signup` is now the default destination for anonymous strangers** — the middleware change for that landed in Session 2.

### DB migrations

**Migration L — Featured article setting.**

```sql
INSERT INTO public.settings (key, value, value_type, category, display_name, description, is_public, is_sensitive)
VALUES ('signup_featured_article_id', '', 'string', 'general',
  'Featured article on /signup',
  'Story id or slug to render in the /signup sample. Leave blank to auto-pick the most recent high-citation piece.',
  false, false)
ON CONFLICT (key) DO NOTHING;
```

### Files to ADD / MODIFY

**1. `web/src/app/signup/page.tsx` (full rewrite)**

Three layers:
- Top: lowercase wordmark + 3-line manifesto.
- Middle: server-fetched real article (headline, byline, tier badge, first 2 paras, citation markers, first few citations) via the existing article rendering pipeline.
- Bottom: 4-step access flow (request → reviewed → invite → sign in) + two CTAs side-by-side ("I have an invite, sign in →" → `/login`; "Request access →" → `/login?mode=request` or scroll to a section).

Honest copy on timing: "we usually respond within a day or two" — describes present state, not a timeline commitment per memory.

**2. `web/src/app/signup/_FeaturedArticle.tsx` (new server component)**

Server-fetches the featured article based on `settings.signup_featured_article_id`, falling back to most-recent high-citation piece. Renders snippet via existing article components.

**3. `web/src/app/signup/_AccessFlow.tsx` (new client component)**

The 4-step visual + two CTAs. Honest about what they get: "30 days of pro on us during beta."

**4. `web/src/app/signup/layout.js`**

Update title metadata to reflect this is a landing page, not a signup form.

**5. Onboarding chain review:**
- `web/src/app/signup/pick-username/page.tsx` — already deleted in Session 2 (welcome modal replaces it).
- `web/src/app/signup/pick-categories/page.tsx` — KEEP. Still used post-modal for category selection.
- `web/src/app/signup/expert/page.tsx` — DELETE (dead code; expert application now lives in profile).
- `web/src/app/welcome/page.tsx` — **DELETE.** Welcome modal handles the only required first-login action. Users go straight to the product after handle is saved.

### Files to MODIFY

**1. `web/src/app/login/page.tsx`** — already added the footer link "new here? read about us →" in Session 2. Confirm it's still pointing to `/signup`.

**2. `web/src/app/admin/settings/page.tsx`** — `signup_featured_article_id` row appears automatically.

**3. `web/src/middleware.js`** — already updated in Session 2 (anon → `/signup`, beta-gate allowlist includes both). No changes.

### Implementer verification checklist

- [ ] Visit `/signup` while signed-out → see manifesto, real article, access flow.
- [ ] Visit `/signup` while signed-in → either show same content or redirect to home (owner gut-check).
- [ ] Owner sets `signup_featured_article_id` to a specific story → that story renders.
- [ ] Owner blanks the setting → auto-picked recent high-citation piece renders.
- [ ] Two CTAs at bottom both work.
- [ ] Footer link from `/login` points to `/signup` and vice versa.
- [ ] Article snippet uses the *live* article system, not a mock.
- [ ] Anon stranger types `veritypost.com/` → bounced to `/signup` (Session 2 middleware change).
- [ ] Anon stranger types `/login` directly → bare login page renders.

### Owner gut-check items
- **Welcome carousel post-modal** — keep or delete?
- **Signed-in users on /signup** — redirect to home.
- **Manifesto copy** — three locked lines (rough first; polished Session 6).

---

## Session 6 — Final Polish

### Scope summary
- Copy sweep across all user-facing surfaces (welcome modal, banners, approval email, request-access form, manifesto, login footer, all error states).
- Schema cleanup: drop dead columns from `access_requests`.
- Anything that surfaced during build that wants tightening.

### DB migrations

**Migration M — Drop dead `access_requests` columns.**

```sql
-- Verify no live data uses them BEFORE dropping:
-- SELECT count(*) FROM public.access_requests WHERE email_confirm_token IS NOT NULL;
ALTER TABLE public.access_requests DROP COLUMN IF EXISTS email_confirm_token;
ALTER TABLE public.access_requests DROP COLUMN IF EXISTS email_confirm_expires_at;
ALTER TABLE public.access_requests DROP COLUMN IF EXISTS email_confirmed_at;
```

### Files affected

- `web/src/components/welcome/WelcomeModal.tsx` — copy polish.
- `web/src/lib/betaApprovalEmail.ts` — final approval-email copy.
- `web/src/app/login/page.tsx` — manifesto sub-line, support-contact link target.
- `web/src/app/signup/page.tsx` — manifesto polish.
- `web/src/app/profile/_lib/states.ts` — banner copy for `trial-ending-week` / `trial-ending-day`.
- All error-state copy across the auth surface (privacy posture preserved).

### Implementer verification checklist
- [ ] Read every user-facing string with the owner; tighten where flagged.
- [ ] Cross-link audit: every "back to login" path works; every "have an invite?" path works.
- [ ] Privacy posture preserved everywhere (no leaked account-existence, invite-state, email-state).

---

## What this plan does NOT include

Per convo, explicit deferrals:
1. **Referral analytics dashboard** — data captured (Session 3); UI deferred.
2. **Top-referrer rewards** — TBD when there's data.
3. **Passwords as a UI surface** — backend routes go (Session 2); the data-model side stays so passwords can be turned back on later.
4. **Passkeys / WebAuthn** — right call once token-only is shipping; not now.
5. **CAPTCHA on login** — rate limits cover the realistic threat.
6. **SMS fallback** — out of scope (security-only email scope).
7. **Public profile (`/u/[username]`)** — currently disabled; this plan doesn't enable it.

---

## Cross-session dependency graph

```
Session 1 (3 PRs, independent of each other)
    ↓
Session 2 (heavy — single-door + welcome modal + email change + middleware redirect to /signup)
    ↓
Session 3 (access/invite/cohort — depends on Session 2 single-door form + welcome modal)
    ↓
Session 4 (trial mechanics — depends on Session 2 signup path setting comped_until + Session 3 PATCH endpoint)
    ↓
Session 5 (/signup landing — depends on Session 2 middleware redirect + welcome modal already shipping)
    ↓
Session 6 (polish — depends on all of the above being mergeable)
```

Sessions 3, 4, 5 are mostly parallel from a code-conflict standpoint, but each has UX dependencies on Session 2. Don't try to ship them out of order.

---

## Implementer's pre-merge checklist (every session)

- [ ] All migrations MCP-verified against actual schema (don't trust the migration log).
- [ ] All file/line references in the PR description re-verified at PR time (lines drift).
- [ ] No fire-and-forget RPCs except those explicitly named (only `scoreDailyLogin`).
- [ ] No `--no-verify`, no skipping pre-commit hooks.
- [ ] No keyboard shortcuts added.
- [ ] No color-per-tier added.
- [ ] No popups added (welcome modal is the one locked exception).
- [ ] No emails added beyond the security-only scope.
- [ ] No `@admin-verified` markers reintroduced.
- [ ] Privacy posture preserved on every public failure path (same response in all cases; real reason → audit log).
- [ ] 6-agent ship pattern run on Sessions 2 and 3 (4 pre-impl + 2 post-impl).
- [ ] Build passes; no half-finished implementations left behind.
- [ ] OAuth disabled-flag code (`OAUTH_ENABLED = false`) preserved.
- [ ] Pre-merge staging smoke-test for Session 2 (real OTP email contains 6-digit code).

---

## Open questions for the owner before Session 1 starts

These are the small unanswered calls. If owner answers them up front, the plan is fully unambiguous.

1. ~~**Expert signup**~~ — **RESOLVED.** `/signup/expert/page.tsx` is dead code; expert application lives in the profile. Delete it in Session 2.
2. **Welcome modal mount point** — `NavWrapper` (everywhere, recommended) or `home/page.tsx` only?
3. ~~**`/welcome` carousel**~~ — **RESOLVED.** Delete it. Modal handles the forced moment, users go straight to the product.
4. ~~**Signed-in users hitting `/signup`**~~ — **RESOLVED.** Redirect to home.
5. ~~**Lifetime trial sentinel**~~ — **RESOLVED.** null = no expiry. Cron skips rows where `comped_until IS NULL`.
6. ~~**"Trial extended" notification**~~ — **RESOLVED.** One-time dismissible banner. `trial_extended_seen_at` column on users tracks dismissal server-side.
7. ~~**Support contact path**~~ — **RESOLVED.** mailto: link. Implementer verifies existing `/contact` page and canonical support email before hardcoding.
8. ~~**`verity` tier rip**~~ — **RESOLVED.** Owner confirmed zero users. Delete in Session 4 Migration K.
9. ~~**Dashboard changes**~~ — **RESOLVED.** Both done 2026-04-29.
10. ~~**Bulk-approve permission key**~~ — **RESOLVED.** Reuses existing `admin.access_requests.approve` key. No new DB row needed.

If owner answers all 10 before Session 1, an implementer can pick this up cold and ship without further blocking questions.
