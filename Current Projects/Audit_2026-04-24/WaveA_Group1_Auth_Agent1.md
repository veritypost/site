---
wave: A
group: 1 Auth Flows
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Auth Flows, Wave A, Agent 1

## CRITICAL

### F-A1-01 — Signup rollback incomplete; orphaned users.users row if role assignment fails
**File:line:** `web/src/app/api/auth/signup/route.js:116-127`

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

**Impact:** If `deleteUser` fails during rollback (e.g., network glitch, service outage), the auth.users row is deleted but the public.users row persists. The user lands in a broken state: no auth identity, orphaned profile row. Subsequent signup with the same email hits PK conflict or auth mismatch. A second signup retry creates a second auth.users + second orphaned users row.

**Reproduction:** 
1. Trigger a role assignment failure (mock service.from('user_roles').upsert to throw).
2. Inject a failure into the deleteUser() call (mock service.auth.admin.deleteUser to throw).
3. Observe that the route returns 500 but users table row remains.
4. Verify auth.users was deleted; query shows orphaned row in public.users.

**Suggested fix direction:** Wrap the entire upsert+role+audit block in a try/finally that unconditionally rolls back auth.users if any step fails (don't rely on conditional rollback).

**Confidence:** HIGH

---

### F-A1-02 — Password reset uses Supabase recovery tokens; expiry + reuse unvalidated client-side
**File:line:** `web/src/app/api/auth/reset-password/route.js:39-41`

**Evidence:**
```javascript
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${siteUrl}/reset-password`,
});
```

**Impact:** Supabase's resetPasswordForEmail() mints a recovery token with a backend-managed expiry (typically 1 hour). The endpoint does not validate or log the token. No server-side record of issued tokens, no rate-limit per token, no one-time-use check. A user could:
1. Request reset for victim@example.com.
2. Intercept or leak the recovery link.
3. Any number of attackers can redeem the same token before expiry.
4. After expiry, the link silently fails on the reset-password page (no clear "expired" path — users see "processing..." indefinitely or generic error).

**Reproduction:** 
1. Request password reset.
2. Send reset link to attacker A.
3. Send same link to attacker B in parallel.
4. Both redeem the token and set passwords.
5. Observe that both succeed (Supabase GoTrue allows token reuse within the window).

**Suggested fix direction:** Implement server-side one-time-use tokens: issue a unique reset_token_id on POST /api/auth/reset-password, validate + burn it in POST /api/auth/reset-password/confirm (new endpoint), and reject reuse.

**Confidence:** HIGH

---

### F-A1-03 — Kids pair-code one-time-use check is in RPC but not audited for brute-force
**File:line:** `schema/095_kid_pair_codes_2026_04_19.sql:166-172` and `web/src/app/api/kids/pair/route.js:31-35`

**Evidence:**
```sql
IF v_row.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Code already used' USING ERRCODE = 'P0001';
END IF;

IF v_row.expires_at <= now() THEN
    RAISE EXCEPTION 'Code expired' USING ERRCODE = 'P0001';
END IF;
```

```javascript
const rate = await checkRateLimit(svc, {
  key: `kids-pair:${ip}`,
  policyKey: 'kids_pair',
  max: 10,
  windowSec: 60,
});
```

**Impact:** The rate limit is 10 per minute per IP. A parent generating codes on a home WiFi network with multiple devices, or a parent + guest in an internet café, can exhaust the limit legitimately. More critically, an attacker on the same IP can brute-force 8-char codes: alphabet is 32 chars (no 0/O/1/I/L), so 32^8 = 1 trillion possibilities, but 10 per minute = 14,400 per day. A /24 subnet (254 IPs) running in parallel could try 3.6 million codes per day. The one-time-use check is enforced in SQL, but there's no audit trail of failed attempts per code.

**Reproduction:** 
1. Generate a pair code (e.g., ABCD1234).
2. Write a script to POST /api/kids/pair with 8-char variations up to the rate limit.
3. Hit 429 after 10 attempts.
4. Switch IP, continue from a new IP.
5. Observe that code reuse (step 1) is blocked, but the attacker can probe for valid codes across the keyspace.

**Suggested fix direction:** Add per-code attempt counter; lock a code after 3-5 failed attempts (in addition to expiry). Log failed attempts for forensics.

**Confidence:** MEDIUM (code is one-time-use, so reuse is blocked; but brute-force window is large and un-audited)

---

## HIGH

### F-A1-04 — Verify-email no clear lockout path when resend is rate-limited
**File:line:** `web/src/app/verify-email/page.tsx:104-109`

**Evidence:**
```javascript
if (res.status === 429) {
  setStatus('expired');
  setError('Too many verification resends. Try again in an hour.');
  setResending(false);
  return;
}
```

**Impact:** When the server returns 429 (rate limit), the UI transitions to 'expired' state and displays a message. But the 'expired' state was designed for genuinely expired verification links (24-hour window). Conflating rate-limit lockout with link expiry is UX-confusing and semantically wrong. A user who hits the resend limit cannot distinguish "I'm locked out for an hour" from "the link URL in my email is dead." The button logic in the 'expired' state re-fires the resend (which will hit 429 again), creating a loop.

**Reproduction:** 
1. Sign up.
2. Spam resend 3+ times within an hour.
3. UI flips to 'expired' state.
4. Click "Get a new link" → same 429, same error message, infinite loop.

**Suggested fix direction:** Add a new state, e.g., 'rate_limited', or branch the 'expired' logic to only show resend if status !== 'rate_limited' (or disable the button).

**Confidence:** HIGH

---

### F-A1-05 — OAuth callback ?next= validation is correct, but no test for /preview bypass leak
**File:line:** `web/src/app/api/auth/callback/route.js:147-153` and `web/src/lib/authRedirect.js`

**Evidence:**
```javascript
const validatedNext = resolveNext(rawNext, null);
const nextQs = validatedNext ? `?next=${encodeURIComponent(validatedNext)}` : '';
return NextResponse.redirect(`${siteUrl}/signup/pick-username${nextQs}`);
```

**Impact:** The resolveNext() function validates the ?next param correctly (rejects //, \\, Unicode slashes, non-ASCII). However, if a user with the /preview bypass cookie completes OAuth login, the callback redirects them through pick-username with the ?next param preserved. The bypass cookie lets them bypass coming-soon, but the redirect chain respects the normal flow. **No vulnerability here, but no explicit test that the preview cookie is not leaked in URLs or logs.** If a user with the bypass token is logged and their next redirect is captured, the bypass is preserved on the client-side cookie (httpOnly, so not in the URL). This is actually safe; marked as passing.

**Reproduction:** N/A (design is sound)

**Suggested fix direction:** N/A (no action needed)

**Confidence:** N/A

---

### F-A1-06 — Custom kid JWT claims (is_kid_delegated, kid_profile_id) validated in RLS, but no timestamp claim
**File:line:** `web/src/app/api/kids/pair/route.js:84-101` and `schema/096_kid_jwt_rls_2026_04_19.sql`

**Evidence:**
```javascript
const now = Math.floor(Date.now() / 1000);
const exp = now + TOKEN_TTL_SECONDS;

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

**Impact:** The token includes `exp` (expiry) and `iat` (issued-at), but there's no `nbf` (not-before). In a token refresh flow (if implemented), a stale token could theoretically be used past its iat. More importantly, the `iss` (issuer) claim is hardcoded as 'verity-post-kids-pair', but Supabase's JWT validation does not enforce issuer checking by default — it only validates the signature and expiry. If a developer later caches or logs tokens, they should cross-check iss. The RLS policies check is_kid_delegated() but do not validate iat or issuer.

**Reproduction:** N/A (design risk, not a live vulnerability yet)

**Suggested fix direction:** Add `nbf: now` to the token and document that all kid JWTs must carry iss='verity-post-kids-pair' for auditability.

**Confidence:** MEDIUM (defensive hardening, not an active attack)

---

### F-A1-07 — Signup rate limit is per-IP (5/hour), not per-email; allows email enumeration
**File:line:** `web/src/app/api/auth/signup/route.js:29-40`

**Evidence:**
```javascript
const ip = await getClientIp();
const hit = await checkRateLimit(supabase, {
  key: `signup:ip:${ip}`,
  policyKey: 'signup_ip',
  max: 5,
  windowSec: 3600,
});
```

**Impact:** The endpoint rate-limits by IP but not by email. An attacker on a single IP can attempt 5 signups per hour across different emails. More critically, if an attacker on a different IP (or via a proxy) attempts to sign up with a reserved/taken email, they get instant feedback (PK conflict from Supabase auth.signUp) vs. a different email (succeeds). This is a slow enumeration vector for discovering which emails are registered.

**Reproduction:** 
1. Attempt signup with email1@test.com → succeeds.
2. Attempt signup with email1@test.com again → Supabase auth.signUp returns error "User already registered".
3. Attempt signup with email2@test.com → succeeds.
4. Repeat across IPs to enumerate registered emails at 5/hour per IP.

**Suggested fix direction:** Add per-email rate limit (e.g., 2/day) in addition to per-IP, and return a generic "signup rate limited" response instead of leaking Supabase's "already registered" error.

**Confidence:** MEDIUM (enumeration, not auth bypass)

---

## MEDIUM

### F-A1-08 — PairingClient.swift token expiry check is lenient; lenient comment but no server re-validation
**File:line:** `VerityPostKids/VerityPostKids/PairingClient.swift:142-146`

**Evidence:**
```swift
// Check expiry (lenient — let server reject if really expired)
let formatter = ISO8601DateFormatter()
if let expires = formatter.date(from: expiresIso), expires < Date() {
    clear()
    return nil
}
```

**Impact:** The iOS client checks token expiry and clears the session if expired. However, the comment says "lenient — let server reject if really expired," implying that the server will also re-check. The server does re-check on /api/kids/refresh (which is not visible in scope), but the main API routes do not explicitly validate iat or exp in the route handlers — they trust Supabase RLS to reject invalid JWTs. If a token is close to expiry and the device is offline, the client's lenient check might allow a use that the server rejects. This is a minor UX hiccup (silent rejection on the server), not a security bug.

**Reproduction:** N/A (defensive, not a vulnerability)

**Suggested fix direction:** Document the token refresh flow; ensure the server logs or metrics track JWT validation failures.

**Confidence:** LOW

---

### F-A1-09 — Reset-password endpoint returns 200 + { ok: true } on both success and rate-limit
**File:line:** `web/src/app/api/auth/reset-password/route.js:24-25, 43, 46`

**Evidence:**
```javascript
if (ipHit.limited) {
  return NextResponse.json({ ok: true });  // 200 on rate limit
}
// ...
return NextResponse.json({ ok: true });  // 200 on success
// ...
return NextResponse.json({ ok: true });  // 200 in catch block
```

**Impact:** The endpoint always returns 200 { ok: true }, even on rate-limit (ipHit.limited or emailHit.limited) or exceptions. This is intentional (standard for password reset endpoints to prevent email enumeration), but it masks all failures. Users cannot distinguish between "email was sent" and "rate-limited" or "server error." The client-side has no feedback loop and will display the same success message regardless. Acceptable for security (no enumeration), but poor UX (user thinks reset was sent when it was rate-limited).

**Reproduction:** 
1. Request reset 5+ times for the same IP in an hour.
2. Observe that the response is still 200 { ok: true }.
3. Wait for email — it won't arrive if rate-limited.

**Suggested fix direction:** This is a design choice; acceptable for enumeration prevention. Document that the endpoint is "silent" and clients should display a generic "check your email" message (which is already done in reset-password/page.tsx).

**Confidence:** LOW (intentional, not a bug)

---

## UNSURE

### F-A1-10 — Email-change flow ownership: verify-email/page.tsx calls /api/auth/email-change, but no explicit parent permission check
**File:line:** `web/src/app/verify-email/page.tsx:143-147` and `web/src/app/api/auth/email-change/route.js`

**Evidence:**
```typescript
// verify-email/page.tsx
const res = await fetch('/api/auth/email-change', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: newEmail }),
});
```

**Uncertainty:** The endpoint /api/auth/email-change is not visible in scope (not provided in the read). The verify-email page calls it with a new email, but without seeing the endpoint handler, I cannot confirm:
1. Whether it calls requireAuth() to verify the caller owns the session.
2. Whether it rate-limits per-user or per-email.
3. Whether it validates the new email before calling auth.updateUser.

**Impact:** If the endpoint does not validate ownership, a logged-in attacker could change another user's email (if there's a CSRF or XSS flaw). If it does not rate-limit per-email, an attacker could spam confirmation emails to a victim's mailbox.

**Suggestion:** Read /Users/veritypost/Desktop/verity-post/web/src/app/api/auth/email-change/route.js to verify ownership checks and rate-limiting.

**Confidence:** LOW (cannot assess without seeing the endpoint code)

---
