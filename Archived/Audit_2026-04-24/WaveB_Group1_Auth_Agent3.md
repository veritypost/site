---
wave: B
group: 1 Auth flows
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24T13:03:54Z
---

# Findings — Auth flows, Wave B, Agent 3

## CRITICAL

### F-B1-3-01 — Post-auth redirect missing role-based gating for coming-soon wall

**File:line:** `web/src/app/login/page.tsx:232-242`

**Evidence:**
```typescript
// First-time sign-ins land on /welcome; returning users go to the
// explicit ?next= target if present, else home.
let nextUrl = nextParam || '/';
if (authUser?.id) {
  const { data: me } = await supabase
    .from('users')
    .select('onboarding_completed_at, email_verified')
    .eq('id', authUser.id)
    .maybeSingle();
  const row = me as MeRow | null;
  if (row?.email_verified && !row?.onboarding_completed_at) nextUrl = '/welcome';
}
window.location.href = nextUrl;
```

**Impact:** After login, `nextUrl` can be any URL passing `resolveNext()` validation, including protected routes like `/profile/settings`. When `NEXT_PUBLIC_SITE_MODE=coming_soon`, the middleware (line 217-238) redirects unauthenticated visitors to `/welcome`, but **authenticated users are not gated**—they bypass to their `?next=` target immediately, even before `onboarding_completed_at` is set. If a user hand-crafted `?next=/profile/settings` during coming-soon mode, they land directly there instead of hitting `/welcome`. The preview bypass cookie (`vp_preview=ok`) is httpOnly so user can't forge it, but the redirect logic conflates "authenticated" with "bypass-eligible."

**Reproduction:** 
1. Set `NEXT_PUBLIC_SITE_MODE=coming_soon`
2. Create + verify account
3. Sign in with `?next=/profile/settings`
4. Land on protected route before onboarding carousel

**Suggested fix direction:** Query user's perms after login to confirm bypass eligibility (owner/admin), or always funnel first-logins through `/welcome` before respecting `?next=`.

**Confidence:** HIGH

---

### F-B1-3-02 — Signup rollback on role-assignment failure may leave orphaned auth.users rows

**File:line:** `web/src/app/api/auth/signup/route.js:112-127`

**Evidence:**
```javascript
const { count: roleCount } = await service
  .from('user_roles')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', userId);
if (!roleCount) {
  console.error('[auth.signup] user has no role after signup', { userId });
  // Roll back the auth row so the user can retry cleanly. The
  // users-table upsert above stays (its data is harmless without
  // an auth row) and the cron reconciler will eventually sweep it.
  try {
    await service.auth.admin.deleteUser(userId);
  } catch (rollbackErr) {
    console.error('[auth.signup] rollback deleteUser failed', rollbackErr);
  }
  return NextResponse.json({ error: 'Signup failed. Please try again.' }, { status: 500 });
}
```

**Impact:** If the defensive role check finds no rows (both trigger and upsert failed), the code attempts `deleteUser()` but **swallows exceptions**. If that call fails silently (e.g., network timeout, auth admin service unreachable), the auth row persists. User retries signup → `authData.user?.id` is nil (collision detected by Supabase, no new user created) → null dereference on line 59 → trackServer call skipped → response doesn't carry user ID → client shows success but has no session. The `public.users` row upsert stays orphaned (line 67-81), and the manual role upsert (line 97-105) never fires because userId is nil.

**Reproduction:**
1. POST `/api/auth/signup` with valid creds
2. Trigger trigger failure or role lookup fail
3. Mock `deleteUser()` to throw
4. Retry signup with same email
5. Observe: user thinks signup succeeded, session is nil, orphaned row in public.users

**Suggested fix direction:** Before returning 500, validate the rollback succeeded or use a saga pattern (e.g., write tombstone row, cron sweeps). Alternatively, fail fast if trigger doesn't fire on first signup, don't attempt belt-and-suspenders upsert.

**Confidence:** HIGH

---

## HIGH

### F-B1-3-03 — OAuth callback ?next= forwarding preserved but client-side re-validation does not block invalid paths in post-redirect

**File:line:** `web/src/app/api/auth/callback/route.js:147-153`, `web/src/app/welcome/page.tsx:14-24`

**Evidence:**
```javascript
// callback/route.js line 151
const validatedNext = resolveNext(rawNext, null);
const nextQs = validatedNext ? `?next=${encodeURIComponent(validatedNext)}` : '';
return NextResponse.redirect(`${siteUrl}/signup/pick-username${nextQs}`);
```

```typescript
// welcome/page.tsx lines 14-24
function getValidatedNextPath(fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const raw = new URLSearchParams(window.location.search).get('next');
  return resolveNext(raw, fallback) ?? fallback;  // re-validates
}
```

**Impact:** The server validates `?next=` at `/api/auth/callback` (line 151) and forwards it through the signup flow. The client re-validates via `resolveNext()` in welcome.tsx. However, no intermediate page enforces the redirect—`/signup/pick-username` and `/welcome` both accept the QS without gating. If a page renders between callback and the final redirect (e.g., a new onboarding step added later), that step might lack re-validation and blindly forward the `?next=` QS. The regex `NEXT_RX` (authRedirect.js:23) is strict, so **current risk is low**, but the pattern is fragile and missing defense-in-depth on intermediate routes.

**Reproduction:**
- Code-reading only. The current flow is safe because re-validation happens client-side before the final redirect (welcome.tsx:17). Risk is architectural drift if new intermediate routes skip the check.

**Suggested fix direction:** Mark every signup-flow page with a `@validateNextParam` directive or enforce server-side redirect guards that re-validate before forwarding.

**Confidence:** MEDIUM

---

### F-B1-3-04 — Kid pair-code refresh endpoint lacks device_id validation on token rotation

**File:line:** `web/src/app/api/kids/refresh/route.js:54-72`

**Evidence:**
```javascript
let decoded;
try {
  decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
} catch (err) {
  console.warn('[kids.refresh] jwt.verify failed:', err?.message || err);
  return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
}

// Shape guard — refuse any token that isn't a kid-delegated pair JWT, even
// if signed correctly. Stops an adult GoTrue access_token (same secret)
// from being rotated into a kid JWT by this endpoint.
if (
  !decoded ||
  decoded.is_kid_delegated !== true ||
  typeof decoded.kid_profile_id !== 'string' ||
  typeof decoded.parent_user_id !== 'string'
) {
  return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
}
```

**Impact:** The refresh endpoint validates the JWT shape but **does not verify the requesting device matches `used_by_device`** from the original pair-code redemption (schema 095, line 176). An attacker who obtains a kid JWT (via network sniff, device backup theft, phishing) can call `/api/kids/refresh` from a different device and rotate a fresh token without any server-side indication. The `kid_pair_codes` table logs `used_by_device`, but refresh doesn't consult it. The iOS client stores device_id in UserDefaults (PairingClient.swift:65-72) and sends it to `/api/kids/pair`, but doesn't send it to `/api/kids/refresh`. If the kid loses the device or it's compromised, a parent cannot revoke the pair via device tracking.

**Reproduction:**
1. Parent generates pair code via `/api/kids/generate-pair-code`
2. Kid device A redeems at `/api/kids/pair`, stores device_id + JWT
3. Attacker copies the JWT from device A's storage (backup, USB dump)
4. Attacker calls `/api/kids/refresh` from device B with the JWT
5. Server issues fresh token; parent's dashboard shows original device but token is now active on device B

**Suggested fix direction:** Pass device_id in refresh request, store it in `kid_sessions` table (if created), and fail if device_id doesn't match the initial redemption or if revoked via parent controls.

**Confidence:** HIGH

---

## MEDIUM

### F-B1-3-05 — Resend-verification rate-limit window is hourly but no per-address backoff enforcement

**File:line:** `web/src/app/api/auth/resend-verification/route.js:20-30`

**Evidence:**
```javascript
const hit = await checkRateLimit(supabase, {
  key: `resend_verify:user:${user.id}`,
  policyKey: 'resend_verify',
  max: 3,
  windowSec: 3600,
});
if (hit.limited) {
  return NextResponse.json(
    { error: 'Too many verification resends. Try again in an hour.' },
    { status: 429, headers: { 'Retry-After': '3600' } }
  );
}
```

**Impact:** The rate-limit key is per `user.id` (line 21), so a single account is capped at 3 resends per hour. However, verify-email/page.tsx also has a **client-side 60-second cooldown** (line 115), which is much stricter. The server-side limit is the authoritative enforcement (per docs: "server-side rate-limit is authoritative"), but **the displayed error says "Try again in an hour"** (line 28), which is correct. No issue found here. DOWNGRADE: The 1-hour window is reasonable for abuse prevention (brute-forcing email confirmation links isn't the attack vector; the concern is email provider rate limits). However, no per-email-address limit exists—a user could call the endpoint for 100 different accounts within the 1-hour window. Mitigated by IP-level rate limits elsewhere (checkRateLimit on signup/reset), but worth noting.

**Reproduction:**
- Low risk in practice. Rate-limit is per user session, and abuse requires multiple accounts.

**Suggested fix direction:** Add an IP-based outer limit (max 10 resends per IP per hour) to block bulk abuse across accounts.

**Confidence:** MEDIUM

---

### F-B1-3-06 — Reset-password endpoint deliberately hides rate-limit hits to prevent account enumeration

**File:line:** `web/src/app/api/auth/reset-password/route.js:24-36`

**Evidence:**
```javascript
const ipHit = await checkRateLimit(supabase, {
  key: `reset:ip:${ip}`,
  policyKey: 'reset_password_ip',
  max: 5,
  windowSec: 3600,
});
if (ipHit.limited) {
  return NextResponse.json({ ok: true });  // Silent success — no error
}

const emailHit = await checkRateLimit(supabase, {
  key: `reset:email:${email.toLowerCase()}`,
  policyKey: 'reset_password_email',
  max: 3,
  windowSec: 3600,
});
if (emailHit.limited) {
  return NextResponse.json({ ok: true });  // Silent success — no error
}
```

**Impact:** When rate limits are hit, the endpoint returns `{ ok: true }` instead of an error, so the client cannot distinguish between a successful email send and being rate-limited. This is **intentional**—prevent user enumeration by not revealing which email addresses have accounts. However, the client has no way to tell the user they've hit a limit; reset-password/page.tsx expects either success or an error, not a silent "ok: true" that hides a rate-limit hit. The user receives no feedback and assumes the email is sending. No security flaw, but poor UX.

**Reproduction:**
- Code-reading only. Behavior is intentional per docs (account enumeration prevention).

**Suggested fix direction:** Either surface the rate-limit to the user (accept the enumeration trade-off) or send a generic "we've sent an email if that account exists" message after every call (do not differentiate).

**Confidence:** MEDIUM (low severity, design tradeoff)

---

## LOW

### F-B1-3-07 — Coming-soon wall relies on middleware cookie validation without SameSite=Strict

**File:line:** `web/src/app/preview/route.ts:26-32`, `web/src/middleware.js:228`

**Evidence:**
```typescript
// preview/route.ts
res.cookies.set('vp_preview', 'ok', {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',  // <-- not Strict
  maxAge: 60 * 60 * 24 * 30, // 30 days
  path: '/',
});
```

```javascript
// middleware.js line 228
const hasBypass = request.cookies.get('vp_preview')?.value === 'ok';
```

**Impact:** The bypass cookie uses `sameSite: 'lax'` (line 28), which allows the cookie to be sent on top-level navigations from third-party sites (e.g., a link in email or an external site to veritypost.com). While `httpOnly` prevents JS access and `secure` (prod only) prevents interception, a CSRF attack could theoretically cause an authenticated user to access the site via a cross-site link and inherit the cookie in that context. The 30-day lifetime is long (line 30). Risk is **low** because: (1) the cookie only grants access to the coming-soon page during holding mode, (2) it doesn't disable other auth checks, (3) no sensitive data is exposed. But tighter SameSite=Strict would remove this vector entirely.

**Reproduction:**
- CSRF attack not realistically exploitable. The cookie grants no elevation beyond bypass to `/`. Flagged for defense-in-depth.

**Suggested fix direction:** Change `sameSite: 'strict'` to eliminate cross-site cookie attach; document the 30-day TTL as intentional (owner-controlled rotation via PREVIEW_BYPASS_TOKEN env var).

**Confidence:** LOW

---

## UNSURE

None at this time. All scope items inspected; core auth flows are well-hardened.

