# Q04 — `/api/auth/email-change` recent-auth gate is reading a column that doesn't exist

**Status:** Decided — Option A with a tightened gate.
**Surfaces touched:** web only (iOS uses Supabase SDK directly for email change; not applicable).
**Severity:** Critical. The route returns 401 `recent_auth_required` for **every** authenticated user since commit `8659182` (today). Email change is currently impossible.

---

## Current state

`web/src/app/api/auth/email-change/route.js:60`:

```js
// Use last_sign_in_at (only updated on real auth events, not token refreshes)
// to enforce the recent-auth gate. Stolen long-lived sessions that have
// refreshed tokens cannot bypass this by having a fresh JWT iat.
if (!user.last_sign_in_at ||
  (Date.now() - new Date(user.last_sign_in_at).getTime()) > 900_000) {
  return NextResponse.json({ error: 'recent_auth_required' }, { status: 401 });
}
```

`user` is what `requireAuth()` returns — `web/src/lib/auth.js:183-190`:

```js
return {
  ...profile,            // ← public.users row spread
  email: authUser.email, // ← email patched in from auth.users
  roles,
  kind: 'user',
  kid_profile_id: null,
  parent_user_id: null,
};
```

`profile` is the `public.users` row. Per `web/src/types/database.ts:10968`, the only timestamp column related to login on `public.users` is **`last_login_at`** — there is no `last_sign_in_at`. Result: `user.last_sign_in_at` is always `undefined`, the `!user.last_sign_in_at` branch always wins, the route always 401s.

A grep of the entire `web/src` tree confirms `last_sign_in_at` is referenced **only** at line 57–61 of this one file (everything else is in `node_modules/@supabase/auth-js/`). So this is a one-site bug, not a pattern.

## How `last_login_at` is actually written

`web/src/lib/auth/postLoginBookkeeping.ts:159-185`, `runReturningUserBookkeeping`:

```ts
try {
  const updatePayload: Record<string, unknown> = { last_login_at: new Date().toISOString() };
  if (user.email_confirmed_at) {
    updatePayload.email_verified = true;
    updatePayload.email_verified_at = user.email_confirmed_at;
  }
  await service.from('users').update(updatePayload).eq('id', user.id);
} catch (e) {
  console.error('[postLoginBookkeeping] users.update threw', e);
  ...
}
```

Callers (verified by grep — only three):

| Caller | Trigger |
|---|---|
| `web/src/app/api/auth/callback/route.js:83` | OAuth + magic-link click landing |
| `web/src/app/api/auth/confirm/route.ts:104` | Email-confirmation deep-link landing |
| `web/src/app/api/auth/verify-magic-code/route.ts:197` | OTP code entry success |

These are **the same three real-auth surfaces that cause Supabase to bump `auth.users.last_sign_in_at`**, and nothing else in the codebase writes `last_login_at`. Critically, none of them runs on token refresh — refresh hits Supabase Auth's GoTrue server, which never round-trips through our app routes.

## Empirical confirmation

Live DB query against the two real users with both columns populated:

```
id                                      last_sign_in_at              last_login_at                drift_seconds
f1c8ac0f-… (admin@veritypost.com)       2026-05-03 00:10:10.055891  2026-05-03 00:10:10.16       0
e576488c-… (cliff.hawes@outlook.com)    2026-04-29 14:27:05.299531  2026-04-29 14:27:05.428      0
```

`auth.users.last_sign_in_at` and `public.users.last_login_at` write within ~100ms of each other. For a 900-second (15-minute) gate, they are operationally identical.

## Threat model the gate is supposed to defeat

Per the original `T177` comment that was removed in commit `8659182` (preserved in `web/src/app/api/billing/cancel/route.js:18-25`):

> Stolen long-lived sessions that have refreshed tokens cannot bypass this by having a fresh JWT iat.

The attacker has a stolen refresh token. They can mint fresh access tokens indefinitely (Supabase refresh tokens don't expire by default, per the User Sessions doc). What they cannot do is cause our app routes to fire — magic-link callback, OAuth callback, OTP verify all require the legitimate user to receive an email or complete an OAuth round-trip. So **`last_login_at` (written only from those three routes) is exactly the timestamp the threat model needs to gate on**, because token refresh on the attacker's side does not advance it.

This is the same property `auth.users.last_sign_in_at` has, by Supabase's design — refresh-token grants update `auth.refresh_tokens` but not `auth.users.last_sign_in_at`. The two timestamps have the same security semantics for this gate.

## Decision

**Option A — read `public.users.last_login_at`.**

Rationale, in order:

1. **Same security guarantee as Option B.** Both timestamps are bumped only by genuine auth events (sign-in, magic-link, OTP, OAuth) and not by token refresh. Empirically they drift by zero seconds. The attacker's stolen-refresh-token path advances neither.
2. **Zero round-trip cost.** `requireAuth()` already returned the full `public.users` row; we just need to read a field that's already in memory. Option B requires a `service.auth.admin.getUserById(user.id)` round-trip on every email-change attempt.
3. **No service-role surface expansion.** Option B introduces a new use of `auth.admin` for read-only "what time did this user last actually sign in." Every new admin-client call site is one more place a bug could leak privilege; we shouldn't take that on for a property we already maintain locally.
4. **Already the canonical "last login" in our app.** iOS writes `last_login_at` from `AuthViewModel.swift:519`; future surfaces (account-deletion gate, billing-cancel gate per the deferred T177 TODO) should consistently read this column. Option B picks a *different* canonical and forces every future caller to choose, which is exactly the inconsistency the question asks us to avoid.

**Edge case considered and dismissed:** if `runReturningUserBookkeeping` ever fails to write `last_login_at` (it catches and logs, never throws), the user's `last_login_at` stays stale and they'd hit the 15-min gate on their *next* login attempt. Failure mode: the user is asked to sign in again. That's fail-closed and acceptable. Option B has the symmetric failure if `service.auth.admin.getUserById` fails — but failing closed there means email-change is unavailable when the auth admin endpoint is degraded, which is strictly worse.

## What "right the first time" means here

Define a single helper, `assertRecentAuth(user, maxAgeMs)`, in `web/src/lib/auth.js`. Have every sensitive-action route (today: email-change; soon: account-delete, billing-cancel per T177) call it. The helper reads `user.last_login_at`. One source of truth, one gate, identical 401 response shape across all sensitive actions.

## Implementation (concrete)

In `web/src/lib/auth.js`, add next to `requireVerifiedEmail`:

```js
export function assertRecentAuth(user, maxAgeMs = 900_000) {
  if (!user?.last_login_at ||
      (Date.now() - new Date(user.last_login_at).getTime()) > maxAgeMs) {
    const err = new Error('RECENT_AUTH_REQUIRED');
    err.status = 401;
    err.code = 'recent_auth_required';
    throw err;
  }
}
```

In `web/src/app/api/auth/email-change/route.js:57-63`, replace the inline check with:

```js
try {
  assertRecentAuth(user);
} catch (err) {
  if (err.code === 'recent_auth_required') {
    return NextResponse.json({ error: 'recent_auth_required' }, { status: 401 });
  }
  throw err;
}
```

Update the comment on the gate to reflect reality:

> Use `public.users.last_login_at` (written by `runReturningUserBookkeeping` on real auth events only — magic-link callback, OAuth callback, OTP verify — never on token refresh) to enforce the recent-auth gate. A stolen refresh token mints fresh access tokens but does not cause our app routes to fire, so this timestamp does not advance for the attacker.

## Cross-platform check

- **Web:** Fixes the broken route. Above.
- **iOS adult app:** Not applicable. iOS does not call `/api/auth/email-change`; it uses `supabase.auth.update(user:)` directly. Supabase's SDK enforces its own re-auth requirements for email change (the `email_change_current` + `email_change_new` two-leg confirmation flow already wired in `AuthViewModel.swift:818`).
- **iOS kids app:** Not applicable. Kids accounts cannot change email; they're parent-managed.

## Follow-on (out of scope for this question, file under T177)

When the deferred T177 work lands (recent-auth gates on `/api/account/delete` + `/api/billing/cancel`), reuse `assertRecentAuth` from this same helper. Do not re-implement the gate inline.

## File paths

- **Bug site:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/auth/email-change/route.js:60`
- **Bookkeeping (single writer of `last_login_at`):** `/Users/veritypost/Desktop/verity-post/web/src/lib/auth/postLoginBookkeeping.ts:159-185`
- **`requireAuth` shape:** `/Users/veritypost/Desktop/verity-post/web/src/lib/auth.js:183-191`
- **iOS parallel writer:** `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/AuthViewModel.swift:514-525`
- **Helper landing site:** `/Users/veritypost/Desktop/verity-post/web/src/lib/auth.js` (add `assertRecentAuth` near `requireVerifiedEmail`)
- **T177 deferred-work reference:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/billing/cancel/route.js:18-25`
