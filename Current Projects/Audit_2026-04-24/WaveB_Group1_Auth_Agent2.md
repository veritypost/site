---
wave: B
group: 1 — Auth flows
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24T13:03:54Z
---

# Findings — Auth Flows, Wave B, Agent 2/3

## CRITICAL

### F-B1-2-01 — Signup rollback missing users table cleanup on role assignment failure
**File:line:** `web/src/app/api/auth/signup/route.js:116–127`
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
**Impact:** If `auth.admin.deleteUser()` fails (permissions, transient error, network), the auth row is deleted but the public.users row (upserted on line 67–81) persists orphaned. User sees 500 error and can retry signup with same email, but that orphan blocks them from registering a new account. Cron reconciler is a compensating control but leaves a window of user-facing failure.
**Reproduction:** (1) Signup with email/password (2) Interrupt role assignment mid-transaction or mock auth.admin.deleteUser to throw (3) See user orphaned in public.users with no auth row.
**Suggested fix direction:** Don't upsert public.users row before confirming auth + role setup succeeds, or wrap both in a transaction-like sequence with defensive cleanup.
**Confidence:** HIGH

### F-B1-2-02 — Kids pair code reuse window: marked used_at but not atomically checked before JWT mint
**File:line:** `web/src/app/api/kids/pair/route.js:62–77` + `schema/095_kid_pair_codes_2026_04_19.sql:143–177`
**Evidence:**
```javascript
// API route:
const { data, error } = await svc.rpc('redeem_kid_pair_code', {
  p_code: normalised,
  p_device: typeof device === 'string' ? device.slice(0, 128) : null,
});
```
```sql
-- Migration:
IF v_row.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Code already used' USING ERRCODE = 'P0001';
END IF;
```
The RPC correctly returns "already used" error on second redemption, and the API properly maps it to 410 (line 72–73). However, the check `v_row.used_at IS NOT NULL` happens *after* the `FOR UPDATE` lock is released by the SELECT. Between SELECT and UPDATE, a concurrent request can slip through, both getting "success" responses and minting two valid kid JWTs for the same device. RPC must check + mark in a single atomic statement.
**Reproduction:** (1) Generate a code (2) Simultaneously POST /api/kids/pair from two devices with same code (3) Both receive 200 + valid JWT + same kid_profile_id.
**Suggested fix direction:** Move the used_at check into the UPDATE statement (UPDATE ... WHERE code=X AND used_at IS NULL ... RETURNING...) so the check + mark are atomic per database round-trip.
**Confidence:** HIGH

## HIGH

### F-B1-2-03 — Kids pair code expiry: 15 minutes but no server-side hard enforcement on aged codes
**File:line:** `schema/095_kid_pair_codes_2026_04_19.sql:170–171`
**Evidence:**
```sql
IF v_row.expires_at <= now() THEN
    RAISE EXCEPTION 'Code expired' USING ERRCODE = 'P0001';
END IF;
```
The RPC checks `expires_at <= now()` correctly, but the check is *before* the `FOR UPDATE` lock. The row can be marked used after expiry check but before update (same race as F-B1-2-02). A code with `expires_at = 2026-04-24 13:32:00Z` that reaches redeem at 13:32:01Z might slip through if a concurrent mutation races. No critical impact (token is scoped correctly), but violates "no reuse after expiry" intent.
**Reproduction:** (1) Generate code (2) Wait until 1 second before expiry (3) Simultaneously POST from two devices (4) One may succeed with an aged code.
**Suggested fix direction:** Bundle the expiry + used_at checks into a single READ WHERE clause that feeds the UPDATE.
**Confidence:** HIGH

### F-B1-2-04 — Password reset token reuse: Supabase GoTrue auto-expires after 1 hour, no secondary expiry
**File:line:** `web/src/app/api/auth/reset-password/route.js` (no secondary validation)
**Evidence:** The route calls `supabase.auth.resetPasswordForEmail(email, { redirectTo })` (line 39) which delegates all token minting + expiry to Supabase GoTrue. The client-side `/reset-password` page (line 74 of reset-password/page.tsx) checks the URL hash for `type=recovery` but does NOT validate token age, signature, or nonce. If a user visits the reset link, resets password, then an attacker later obtains the link from browser history/email cache, the token is still valid until GoTrue's 1-hour server TTL expires.
**Reproduction:** (1) Request password reset (2) Click link, reset password (3) Attacker finds link in email/history (4) Before 1 hour elapses, attacker uses same link + can reset again if they navigate to /reset-password with same token in hash.
**Suggested fix direction:** Store token hash + mark consumed after first use (similar to pair code reuse check), or rely on Supabase's token rotation (which it does per sign-in but not per reset).
**Confidence:** MEDIUM (Supabase 1-hour hard TTL is a strong compensating control; reuse window is small and requires link disclosure)

### F-B1-2-05 — OAuth callback ?next= parameter: decoded but not anchor-checked against session state
**File:line:** `web/src/app/api/auth/callback/route.js:151–153, 189–192, 205`
**Evidence:**
```javascript
const validatedNext = resolveNext(rawNext, null);
const nextQs = validatedNext ? `?next=${encodeURIComponent(validatedNext)}` : '';
return NextResponse.redirect(`${siteUrl}/signup/pick-username${nextQs}`);
```
The `resolveNext()` function (imported from lib/authRedirect) rejects cross-origin + malformed URLs, but the validation happens once per session. If an attacker crafts `/api/auth/callback?code=X&next=/admin`, the callback route does validate & reject it. However, if the attacker then crafts a separate legitimate OAuth flow with `next=/billing` and the user is on a shared device, the user could be redirected to another user's billing page if the session persists but the attacker's `next` param is cached in localStorage/cookies. No evidence of this in the codebase, but the param is user-supplied and flows through multiple routes.
**Reproduction:** (1) Start OAuth with attacker-controlled ?next=/admin (2) Callback rejects it (3) Attacker replays with legit next=/billing but user has prior session (4) User may land on stale billing if not refetched.
**Suggested fix direction:** Always validate ?next in the final redirect destination, not just the callback route. Validate against a whitelist of safe post-auth routes.
**Confidence:** MEDIUM (resolveNext appears robust; requires shared device + prior session + specific timing)

## MEDIUM

### F-B1-2-06 — Kids JWT is_kid_delegated claim: no rate-limit bypass via bearer token rotation
**File:line:** `web/src/app/api/kids/refresh/route.js:65–71`
**Evidence:**
```javascript
if (
  !decoded ||
  decoded.is_kid_delegated !== true ||
  typeof decoded.kid_profile_id !== 'string' ||
  typeof decoded.parent_user_id !== 'string'
) {
  return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
}
```
The refresh endpoint correctly validates `is_kid_delegated === true`, so an adult GoTrue token cannot be rotated into a kid JWT (same secret, different claim). Rate-limit on /api/kids/refresh is per-IP + 30/min (line 29–39). An attacker with a valid kid JWT can refresh it every ~30 seconds (before expiry) and stay within the rate-limit while keeping the JWT fresh indefinitely. Not a direct breach, but no per-JWT invalidation mechanism if the pair code is compromised (no revocation list, no server-side session store).
**Reproduction:** (1) Pair a device (get valid kid JWT) (2) Call /api/kids/refresh every 30s to keep token fresh (3) Even if parent deletes the kid profile, old token stays valid until natural 7-day expiry (migration 096 checks is_active, so it is stopped, but only on refresh, not on read operations).
**Suggested fix direction:** Add a refresh_token_version or session_id claim so invalidation can be forced server-side. Monitor refresh rate per kid_profile for anomalies.
**Confidence:** MEDIUM (7-day TTL + on-refresh check mitigate; detection requires log analysis)

### F-B1-2-07 — Signup email-verification lockout: 429 status but no UI guidance on cooldown duration
**File:line:** `web/src/app/verify-email/page.tsx:103–109` + `web/src/app/api/auth/resend-verification/route.js:27–31`
**Evidence:**
```javascript
if (res.status === 429) {
  setStatus('expired');
  setError('Too many verification resends. Try again in an hour.');
  setResending(false);
  return;
}
```
The resend endpoint enforces 3/hour per user (line 27–31) but the 429 response includes only the generic `Retry-After: 3600` header. The client sets error text "Try again in an hour" (hardcoded), but if the limit is breached 30 minutes into the window, the user still sees "one hour" instead of ~30 minutes remaining. Client has no way to calculate exact retry time from the response body (no `retry_after_seconds` in JSON).
**Reproduction:** (1) Request verification resend 3 times within an hour (2) On 4th attempt at minute 30, see "Try again in an hour" instead of ~30 minutes.
**Suggested fix direction:** Include retry-after timestamp or seconds in JSON response body; client parses Retry-After header or body field.
**Confidence:** MEDIUM (UX annoyance, not security; users can retry sooner than claimed)

### F-B1-2-08 — Coming-soon wall bypass: no audit log for preview cookie assignment
**File:line:** `web/src/app/preview/route.ts:15–34`
**Evidence:**
```typescript
if (!expected || token !== expected) {
  return NextResponse.redirect(new URL('/welcome', request.url));
}
const res = NextResponse.redirect(new URL('/', request.url));
res.cookies.set('vp_preview', 'ok', {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 30,
  path: '/',
});
```
The /preview route validates the token correctly and sets a 30-day httpOnly cookie. No audit log, no rate-limit, no IP check. If the PREVIEW_BYPASS_TOKEN is compromised (leaked in logs, cached in CDN, etc.), an attacker can visit /preview?token=X once per new browser and bypass the coming-soon wall. The 30-day cookie window means once set, one attacker gains a month of unlogged access. No alert to the owner that the token was used.
**Reproduction:** (1) Attacker obtains PREVIEW_BYPASS_TOKEN from a leak/log (2) Attacker visits /preview?token=X from N browsers (3) Each receives 30-day cookie (4) N browsers bypass coming-soon wall silently (5) Owner has no audit trail.
**Suggested fix direction:** Log every successful /preview access with IP + user-agent. Rate-limit per IP (e.g., 3/hour). Consider rotating the bypass token monthly.
**Confidence:** MEDIUM (requires token compromise; 30-day window is harsh but bypassable)

## LOW

### F-B1-2-09 — Kids pair code: alphabetic constraint (no 0/O/1/I/L) may be fragile on renewal
**File:line:** `schema/095_kid_pair_codes_2026_04_19.sql:78`
**Evidence:**
```sql
v_alphabet   TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- no 0/O/1/I/L
```
The code generator excludes 0/O/1/I/L to avoid confusion during parent-to-kid dictation. However, if in the future a parent uses the admin UI to manually set a code (or if the RPC is extended to accept a parameter), the constraint is not enforced at the DB level. Only the RPC enforces it. A direct INSERT could bypass it.
**Reproduction:** (1) Admin manually INSERTs a code with ambiguous chars via SQL console (2) Code gets used (3) Kid has to guess what parent meant (4) Code is ambiguous — not security-breaking but UX-breaking.
**Suggested fix direction:** Add a CHECK constraint on the code column: `CHECK (code ~ '^[A-Z2-9]{8}$' AND code !~ '[0OIL1]')` or a custom domain.
**Confidence:** LOW (manual admin operation; no automation risk today)

## UNSURE

### U-B1-2-01 — Custom JWT claims validation in RLS: is_kid_delegated() function revoked from anon
**File:line:** `schema/096_kid_jwt_rls_2026_04_19.sql:36–37`
**Evidence:**
```sql
REVOKE ALL ON FUNCTION public.is_kid_delegated() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_kid_delegated() TO authenticated, service_role;
```
The function is correctly restricted to authenticated + service_role. However, the RLS policies that call it (e.g., kid_profiles_select_kid_jwt on line 44–49) do not explicitly check that the caller is authenticated; they just call `is_kid_delegated()` in the USING clause. If a kid device sends a request with an invalid/missing bearer token, Supabase treats the session as anon, and the is_kid_delegated() check may execute (returning false) rather than failing closed. **Question:** Does Supabase RLS evaluate policies for anon users even if the function is REVOKE'd from anon? If yes, the anon caller sees "false" and policy denies access (correct). If no, it fails closed (also correct). If it's undefined behavior, risk is LOW but should clarify.
**Reproduction:** (1) Send request to /rest/v1/kid_profiles with no Authorization header (2) Observe behavior — either 403 (correct) or 500 (risky).
**Suggested fix direction:** Clarify Supabase behavior in docs or test with anon + missing bearer. If risky, add explicit auth check in policy USING clause.
**Confidence:** LOW (Supabase's documented RLS behavior should handle this, but worth a runtime check)

