# Slice 04 — Confirm Route

**Status:** not-started
**Depends on:** Slice 03 (the send-flow generates links pointing to this route)
**Ships with:** Slice 03 (same deployment — see Slice 03's atomic deploy note)

---

## What this slice is

A new Route Handler that receives the user when they click the sign-in button in the email. It verifies the token, establishes the session, runs post-login bookkeeping, and redirects to home. Clean URL bar after: `veritypost.com`.

---

## New file: `web/src/app/api/auth/confirm/route.ts`

**Why a Route Handler, not a page component:** cookies cannot be written inside Next.js App Router server component pages. The session establishment requires `cookies().set()` calls, which only work in Route Handlers and Server Actions. This is the same reason `/api/auth/callback/route.js` exists as a Route Handler.

**Incoming URL:** `GET /api/auth/confirm?t={hashed_token}&e={email}`

This is the `redirectTo` target set in `admin.generateLink()`. The user's browser follows Supabase's verify URL, which validates the token and redirects here with `t` and `e` as query params.

---

## Handler logic

```ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const t = searchParams.get('t');
  const e = searchParams.get('e');
  const siteUrl = getSiteUrl();

  if (!t || !e) {
    return NextResponse.redirect(`${siteUrl}/login?error=missing_params`);
  }

  // Verify the token. createOtpClient() has cookie-writing handlers,
  // so session cookies are set automatically on successful verifyOtp.
  const otpClient = createOtpClient();
  const { data, error } = await otpClient.auth.verifyOtp({
    email: e,
    token: t,
    type: 'magiclink',
  });

  if (error || !data.user) {
    return NextResponse.redirect(`${siteUrl}/login?error=link_expired`);
  }

  const user = data.user;
  const service = createServiceClient();

  const { data: existing } = await service
    .from('users')
    .select('id, username, onboarding_completed_at, email_verified')
    .eq('id', user.id)
    .maybeSingle();

  // Build the redirect response first. runSignupBookkeeping writes the
  // referral cookie-clear to this object — must be the same object returned.
  const redirectResponse = NextResponse.redirect(`${siteUrl}/`);

  if (!existing) {
    const provider = user.app_metadata?.provider || 'email';
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    await runSignupBookkeeping(service, user, provider, meta, request, redirectResponse);
  } else {
    await runReturningUserBookkeeping(service, user, existing, request);
  }

  return redirectResponse;
}
```

---

## Key details

**`type: 'magiclink'`** — this is what `admin.generateLink({ type: 'magiclink' })` produces. Using `type: 'email'` (what `verify-magic-code` uses for the typed 8-digit code) would not match.

**`createOtpClient()`** — not `createClient()` (PKCE) and not `createServiceClient()`. The OTP client has the cookie-writing handlers that persist the session. The service client has no-op cookie handlers and would not persist a session.

**`redirectResponse` passed to `runSignupBookkeeping`** — `runSignupBookkeeping` clears the `vp_ref` referral cookie by calling `response.cookies.delete()` on whatever object is passed as the last arg. If a different response object is constructed and returned, the cookie-clear never reaches the browser. This object must be the one returned.

**No `?next=` handling** — the confirm route always redirects to `/`. If a `?next=` preservation is needed in the future (e.g., deep-linking before login), it can be added by reading `next` from params on the original email request and passing it through the `action_link` somehow. Not scoped now.

**Error page** — `/login?error=link_expired` is the fallback. The `_SingleDoorForm` already handles error params from the URL (reads `searchParams.get('error')`). Confirm that `link_expired` produces a reasonable message there, or add it if needed.

---

## Imports needed

```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createOtpClient, createServiceClient } from '@/lib/supabase/server';
import { getSiteUrl } from '@/lib/siteUrl';
import {
  runSignupBookkeeping,
  runReturningUserBookkeeping,
} from '@/lib/auth/postLoginBookkeeping';
```

---

## What stays the same

`/api/auth/callback/route.js` is untouched. It continues to handle the OAuth path (Google, Apple) using its current `exchangeCodeForSession` + PKCE flow. The two routes serve different entry points and don't conflict.

`/api/auth/verify-magic-code/route.ts` is untouched. The typed-code path works independently and continues to work after this slice ships.

---

## Testing

After shipping (with Slice 03, as a single deploy):
1. Click the sign-in button in the email on the same device. Confirm: lands on `veritypost.com` (not `/api/auth/...`, not `/login?error=...`). Session established. Logged in.
2. Click on a different device/browser from where the email was requested. Confirm same result — no cross-device failure.
3. Click an expired link (wait >30 min or use a link twice). Confirm: lands on `/login?error=link_expired`.
4. Confirm existing user: no `public.users` upsert, `last_login_at` updated.
5. Confirm new user: `public.users` row created, role assigned, `vp_ref` cookie cleared.
