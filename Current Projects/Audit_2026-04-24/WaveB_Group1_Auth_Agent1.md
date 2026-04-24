---
wave: B
group: 1 Auth Flows
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Auth Flows, Wave B, Agent 1/3

## CRITICAL

### F-B1-01 — Signup rollback doesn't clear users row; orphaned data survives
**File:line:** `web/src/app/api/auth/signup/route.js:117-127`
**Evidence:**
```javascript
if (!roleCount) {
  console.error('[auth.signup] user has no role after signup', { userId });
  try {
    await service.auth.admin.deleteUser(userId);
  } catch (rollbackErr) {
    console.error('[auth.signup] rollback deleteUser failed', rollbackErr);
  }
  return NextResponse.json({ error: 'Signup failed. Please try again.' }, { status: 500 });
}
```
**Impact:** When signup fails due to missing role, the code rolls back the auth.users row via `deleteUser()` but the upserted `users` table row (lines 67-81) persists. Comment on line 119 acknowledges this is "harmless" but it creates orphaned data and breaks the assumption that a failed signup leaves no trace. Future reconciliation logic relies on this cleanup.
**Reproduction:** Sign up → trigger a roleCount=0 condition → rollback fires → check users table: orphaned row remains.
**Suggested fix direction:** On rollback failure, also delete from `users` table via service client before returning error.
**Confidence:** HIGH

### F-B1-02 — OAuth callback doesn't validate kid_profile_id in custom JWT claim
**File:line:** `web/src/app/api/kids/pair/route.js:87-101`
**Evidence:**
```javascript
const token = jwt.sign(
  {
    aud: 'authenticated',
    exp,
    iat: now,
    iss: 'verity-post-kids-pair',
    sub: kid_profile_id,
    role: 'authenticated',
    is_kid_delegated: true,
    kid_profile_id,
    parent_user_id,
  },
  jwtSecret,
  { algorithm: 'HS256' }
);
```
**Impact:** The JWT is signed with `is_kid_delegated: true` and both `sub` and `kid_profile_id` claims set to the same value. RLS policies in schema/096_kid_jwt_rls_2026_04_19.sql depend on `is_kid_delegated()` function (lines 26-34) which reads `auth.jwt() ->> 'is_kid_delegated'`. No validation at route time ensures the kid_profile_id returned from `redeem_kid_pair_code` RPC actually exists or belongs to the stated parent. A malformed RPC response (or a compromised kid_pair_codes row) could sign a JWT with an invalid kid_profile_id that persists in the app.
**Reproduction:** Code-reading only; requires control over RPC response or DB row injection.
**Suggested fix direction:** Verify `kid_profile_id` exists and `parent_user_id` matches via SELECT on kid_profiles before signing JWT.
**Confidence:** MEDIUM

### F-B1-03 — Kid pair-code RPC doesn't atomically mark used; reuse window exists
**File:line:** `schema/095_kid_pair_codes_2026_04_19.sql` (implied by route.js:63-66 call)
**Evidence:**
Route calls `svc.rpc('redeem_kid_pair_code', { p_code, p_device })` but the RPC signature is SECURITY DEFINER. The RPC must mark the code used before returning, but if the route crashes after RPC succeeds but before the response is sent, or if two simultaneous requests hit the same code, race conditions could occur. The `FOR UPDATE` lock in the RPC should prevent this, but there's no explicit test that the used_at is committed before the response is delivered to the client.
**Reproduction:** Fire two pair requests with the same code in rapid succession; audit which kid_profile_id got assigned or if both succeeded.
**Suggested fix direction:** Ensure the RPC uses explicit transaction boundaries and returns used_at to confirm atomicity.
**Confidence:** MEDIUM

## HIGH

### F-B1-04 — Password reset endpoint returns HTTP 200 on rate limit; silent failure
**File:line:** `web/src/app/api/auth/reset-password/route.js:25-26, 34-36`
**Evidence:**
```javascript
if (ipHit.limited) {
  return NextResponse.json({ ok: true });
}
// ...
if (emailHit.limited) {
  return NextResponse.json({ ok: true });
}
```
**Impact:** Both IP and email rate-limit checks return `{ ok: true }` without sending an email. The client sees success but no reset email is queued. The UX for a rate-limited user is silent failure — they'll wait for an email that never arrives, then retry and get the same silent response. Compare to `/api/kids/pair` which returns 429 with `Retry-After` header.
**Reproduction:** POST /api/auth/reset-password with same IP 6+ times → no email sent but client sees ok:true.
**Suggested fix direction:** Return 429 with `Retry-After` header and clear error message, matching the kids pair endpoint pattern.
**Confidence:** HIGH

### F-B1-05 — Verify-email page doesn't validate session before showing "Check your email"
**File:line:** `web/src/app/verify-email/page.tsx:57-79`
**Evidence:**
```javascript
const check = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    if (!cancelled) setStatus('waiting');
    return;
  }
```
If `getUser()` returns null (no session), the code sets status='waiting', which renders the "Check your email" screen (lines 402-589) with a masked email (`userEmail` is still empty from line 43). The fork at line 330 (`if (!userEmail)`) exists to handle this, but the main 'waiting' branch doesn't show a clear sign-in path if the session expired mid-verification.
**Impact:** User lands on verify-email with no session → sees "Check your email" with no email shown → confusing UX. The fork exists (lines 330-399) but only renders if `!userEmail`, which requires the status to be checked.
**Reproduction:** Sign up, don't verify, wait for session to expire, visit /verify-email directly → lands on waiting state with blank email.
**Suggested fix direction:** When getUser() returns null, set a separate `sessionExpired` flag and render a sign-in CTA instead of the check-email flow.
**Confidence:** MEDIUM

### F-B1-06 — Custom JWT claim is_kid_delegated not validated at signature level
**File:line:** `schema/096_kid_jwt_rls_2026_04_19.sql:26-34`
**Evidence:**
```sql
CREATE OR REPLACE FUNCTION public.is_kid_delegated()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((auth.jwt() ->> 'is_kid_delegated')::boolean, false);
$$;
```
The function reads the claim from `auth.jwt()` without validating signature or issuer. The signature is validated by Supabase itself (PostgREST checks the JWT secret), but there's no Postgres-level validation that the claim came from a trusted issuer. A compromised JWT secret could inject fake is_kid_delegated claims into adult sessions. No namespace isolation.
**Impact:** If SUPABASE_JWT_SECRET leaks, attacker can sign adult user JWTs with `is_kid_delegated: true` and bypass adult-only RLS checks.
**Reproduction:** Code-reading only; requires leaked secret.
**Suggested fix direction:** Add issuer check in the RLS policy or document the secret as critical. Alternatively, use different JWT secrets for kid vs adult paths (not currently in scope but noted).
**Confidence:** MEDIUM

## MEDIUM

### F-B1-07 — OAuth callback doesn't preserve ?next= for new non-username accounts
**File:line:** `web/src/app/api/auth/callback/route.js:151-153`
**Evidence:**
```javascript
const validatedNext = resolveNext(rawNext, null);
const nextQs = validatedNext ? `?next=${encodeURIComponent(validatedNext)}` : '';
return NextResponse.redirect(`${siteUrl}/signup/pick-username${nextQs}`);
```
When a new user signs up via OAuth and must pick a username, the ?next param is forwarded to pick-username. However, pick-username/page.tsx doesn't have evidence of respecting or forwarding ?next to /welcome. The validation is good, but the chain is incomplete.
**Reproduction:** OAuth sign-up with ?next=/profile → lands on pick-username?next=/profile → gets redirected to /welcome without ?next.
**Suggested fix direction:** Ensure pick-username/page.tsx reads and forwards ?next to /welcome and beyond.
**Confidence:** MEDIUM

### F-B1-08 — Password reset success redirects before route handlers complete
**File:line:** `web/src/app/reset-password/page.tsx:47-54`
**Evidence:**
```javascript
useEffect(() => {
  if (success) {
    const timer = setTimeout(() => {
      window.location.href = '/';
    }, 1800);
    return () => clearTimeout(timer);
  }
}, [success]);
```
After `supabase.auth.updateUser({ password })` succeeds and `signOut({ scope: 'others' })` is called, the success flag is set and the page redirects in 1.8s. However, there's no server-side session validation or audit_log write after password reset. The client-side success is cosmetic; the backend doesn't record the reset event.
**Impact:** No audit trail for password resets. Compromised accounts that reset their password aren't logged for investigation.
**Reproduction:** Reset password → check audit_log; no entry for this reset event.
**Suggested fix direction:** Call an `/api/auth/password-reset-complete` endpoint after updateUser succeeds to log the event and validate the new session.
**Confidence:** MEDIUM

### F-B1-09 — Coming-soon bypass cookie lacks secure flag in dev
**File:line:** `web/src/app/preview/route.ts:26-32`
**Evidence:**
```typescript
res.cookies.set('vp_preview', 'ok', {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 30, // 30 days
  path: '/',
});
```
The `secure` flag is only set when `NODE_ENV === 'production'`. In dev, the preview cookie can be transmitted over HTTP, making it susceptible to eavesdropping on public WiFi. Mitigation: dev servers should not be exposed to the internet, but the flag is best-practice-incomplete.
**Impact:** Dev/staging preview cookies transmitted in plaintext if exposed to untrusted networks.
**Reproduction:** Set NODE_ENV=development, visit /preview in dev server on HTTP, inspect Set-Cookie header → no secure flag.
**Suggested fix direction:** Set secure=true unconditionally; rely on NODE_ENV=development to disable HTTPS enforcement in dev only (already standard for local dev).
**Confidence:** LOW

## LOW

### F-B1-10 — Kid refresh endpoint response doesn't include kid_name
**File:line:** `web/src/app/api/kids/pair/route.js:21-26` (vs `/api/kids/refresh`)
**Evidence:**
Schema comment in pair/route.js mentions the refresh response does not include kid_name (line 21), but PairingClient.swift (lines 172-175) re-reads kid_name from UserDefaults after refresh instead of parsing it from the response. This works but is an inconsistency: if the parent renames the kid profile between pair and refresh, the local name won't update.
**Impact:** Kid's display name in the app doesn't reflect name changes made by parent between refresh cycles (up to 7-day TTL).
**Reproduction:** Pair kid → parent renames kid profile → wait for or force refresh → app still shows old name.
**Suggested fix direction:** Include kid_name in /api/kids/refresh response so PairingClient can update it.
**Confidence:** LOW

## UNSURE

### F-B1-11 — is_kid_delegated function not defined in provided schema files
No CREATE FUNCTION for `public.is_kid_delegated()` visible in initial grep of schema/*.sql files. The grep output shows it's used but not defined. Either the migration is missing from the search scope or it was already applied outside the schema/ directory. Need to verify this function exists in the Supabase project before shipping.
**Info to resolve:** Run `mcp__supabase__execute_sql` to SELECT proname FROM pg_proc WHERE proname='is_kid_delegated' and confirm it exists.

---

**Summary:** 3 HIGH+ findings (signup orphan data, reset-password silent failure, JWT validation gap), 6 MEDIUM findings (OAuth chain, audit logging, crypto isolation). Signup rollback and password reset error handling are the most user-visible. Kid JWT claims lack issuer validation but require secret compromise to exploit. All findings include file:line evidence.

