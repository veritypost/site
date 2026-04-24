---
wave: A
group: 1 Auth Flows
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Auth Flows, Wave A, Agent 3/3

## CRITICAL

### F-A1-3-01 — Coming-soon wall does NOT exempt /login, /signup, /verify-email, /forgot-password, /reset-password

**File:line:** `web/src/middleware.js:217-228`

**Evidence:**
```javascript
if (process.env.NEXT_PUBLIC_SITE_MODE === 'coming_soon') {
  const allowed =
    pathname === '/welcome' ||
    pathname === '/preview' ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/ideas') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml';
  // If not allowed and no bypass: redirect to /welcome
  if (!allowed && !hasBypass) {
    // redirect to /welcome, status 307
  }
}
```

**Impact:** When `NEXT_PUBLIC_SITE_MODE=coming_soon` (currently active per briefing), users trying to sign up, log in, or verify email are redirected to `/welcome` instead of seeing the auth flow. This blocks all new user acquisition and locks out email-verification completions. Existing users are already logged in (session persists), so this primarily affects cold-start conversions and email-verification links sent while coming-soon is active.

**Reproduction:** 
1. Set `NEXT_PUBLIC_SITE_MODE=coming_soon` (currently on).
2. Visit `/login` or `/signup` without `vp_preview=ok` cookie — redirects to `/welcome`.
3. Click an email-verification or password-reset link sent while coming-soon was active — redirects to `/welcome` instead of allowing user to complete auth.

**Suggested fix direction:** Add `/login`, `/signup`, `/verify-email`, `/forgot-password`, and `/reset-password` to the `allowed` list in the coming-soon gate (or exempt auth routes with a wildcard like `pathname.startsWith('/auth')`).

**Confidence:** HIGH — This is a straightforward allowlist miss in the coming-soon gate logic.

---

## HIGH

### F-A1-3-02 — Kid pair-code RPC not rate-limiting per-code (only per-IP and per-user)

**File:line:** `web/src/app/api/kids/pair/route.js:28-36`

**Evidence:**
```javascript
const rate = await checkRateLimit(svc, {
  key: `kids-pair:${ip}`,
  policyKey: 'kids_pair',
  max: 10,
  windowSec: 60,
});
// Rate-limit: 10 attempts per minute per IP. Fails CLOSED in prod.
```

No per-code rate limit is enforced. An attacker who knows (or guesses) a valid pair code can redeem it repeatedly before the kid enters it on their device, potentially triggering uncontrolled kid-session creation. While the RPC itself is marked one-time-use (`used_at IS NULL` check in `redeem_kid_pair_code`), there's no circuit-breaker preventing a rapid-fire brute-force of multiple codes simultaneously (e.g., device X tries 10 codes in 60 seconds, all fail, no lockout on that device for pair attempts).

**Reproduction:** 
1. Generate a pair code from parent dashboard.
2. Before the kid enters it, hammer `/api/kids/pair` with 100+ different codes from the same IP — rate limit allows 10/min, blocking the actual legitimate code on the 11th attempt.
3. Attacker also scales across IPs (VPN/botnet) to bypass per-IP rate-limit.

**Suggested fix direction:** Add a device-scoped or code-scoped rate limit (e.g., 3 failed codes per device per 5 minutes) to throttle brute-force without penalizing legitimate multi-device households.

**Confidence:** MEDIUM — Existing per-IP limit mitigates most abuse, but a determined attacker with multiple IPs can still enumerate codes. RPC atomicity prevents token-reuse, but not the attack surface.

---

### F-A1-3-03 — Signup rollback only on role-insertion failure, not on users-upsert failure

**File:line:** `web/src/app/api/auth/signup/route.js:67-127`

**Evidence:**
```javascript
// Round A writes: user-row upsert, user_roles INSERT, audit_log INSERT
const service = createServiceClient();

await service.from('users').upsert({
  id: userId,
  email,
  email_verified: false,
  // ...
});

// Belt-and-suspenders backup if trigger didn't fire
const { data: userRole } = await service
  .from('roles')
  .select('id')
  .eq('name', 'user')
  .single();
if (userRole) {
  await service.from('user_roles').upsert({ ... });
}

// Defensive check: user MUST have at least one role
const { count: roleCount } = await service
  .from('user_roles')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', userId);
if (!roleCount) {
  // Roll back the auth row
  await service.auth.admin.deleteUser(userId);
  return NextResponse.json({ error: 'Signup failed. Please try again.' }, { status: 500 });
}

// No rollback on users.upsert failure — if the upsert fails silently
// (e.g., RLS denies the write), the auth.user row exists but public.users
// is missing, leaving the account in an inconsistent state.
```

**Impact:** If the `users` table upsert fails (e.g., RLS policy issue, constraint violation, or transient DB error), the code does NOT roll back the `auth.users` row. The user's auth account exists, but their profile row is missing, which breaks RLS reads and leaves the user stranded (they can't log in cleanly because they have no role row). The code only rolls back if the role count is zero (i.e., trigger AND upsert both failed).

**Reproduction:** 
1. Break the users-table RLS policy temporarily.
2. Attempt signup — `auth.users` is created, but `public.users` upsert fails silently.
3. User is signed up but can't access any content (RLS denies reads on rolebound tables).

**Suggested fix direction:** Check the result of the `users.upsert` and rollback `auth.users` on failure, before attempting the role insert.

**Confidence:** MEDIUM — The primary failure path (missing role) is handled, but a secondary upsert failure is not.

---

## MEDIUM

### F-A1-3-04 — OAuth callback does NOT validate ?next= on first signup (only on returning user)

**File:line:** `web/src/app/api/auth/callback/route.js:147-154`

**Evidence:**
```javascript
if (!existing) {
  // First-time user: route through onboarding
  const validatedNext = resolveNext(rawNext, null);
  const nextQs = validatedNext ? `?next=${encodeURIComponent(validatedNext)}` : '';
  return NextResponse.redirect(`${siteUrl}/signup/pick-username${nextQs}`);
}
```

vs.

```javascript
if (!existing.username) {
  // Existing user with no username
  const validatedNext = resolveNext(rawNext, null);
  const nextQs = validatedNext ? `?next=${encodeURIComponent(validatedNext)}` : '';
  return NextResponse.redirect(`${siteUrl}/signup/pick-username${nextQs}`);
}
```

vs.

```javascript
// Fully-onboarded user: validate and redirect
return NextResponse.redirect(resolveNextForRedirect(siteUrl, rawNext, '/'));
```

The first two branches call `resolveNext(rawNext, null)` and pass the result to pick-username, but pick-username likely doesn't consume the `?next=` parameter. The third branch correctly uses `resolveNextForRedirect(siteUrl, rawNext, '/')`. **Verify:** Does `/signup/pick-username` respect and forward the `?next=` parameter to its final redirect?

**Reproduction:** If pick-username doesn't forward ?next=, then an OAuth first-time signup with `?next=/profile` lands the user at `/welcome` or `/` instead of `/profile`.

**Suggested fix direction:** Confirm pick-username consumes and forwards `?next=`, or route first-time and no-username users directly to the fallback (`/welcome` or `/`) and skip the intermediate redirect.

**Confidence:** MEDIUM — Depends on downstream pick-username behavior, which was not in scope to review.

---

### F-A1-3-05 — Email-change endpoint succeeds even if email_verified flip fails post-auth-call

**File:line:** `web/src/app/api/auth/email-change/route.js:100-120`

**Evidence:**
```javascript
// Call auth.updateUser FIRST
const { error: authErr } = await supabase.auth.updateUser({ email: normalized });
if (authErr) {
  return NextResponse.json(
    { error: 'Could not initiate email change. Please try again.' },
    { status: 400 }
  );
}

// Then flip email_verified=false. If this fails, we still return 200.
const service = createServiceClient();
const { error: updErr } = await service
  .from('users')
  .update({ email_verified: false })
  .eq('id', user.id);
if (updErr) {
  console.error('[auth.email-change] users.email_verified flip failed:', updErr.message || updErr);
}

return NextResponse.json({ ok: true }); // returns 200 even on updErr
```

**Impact:** If the `users` table update fails after `auth.updateUser` succeeds, the response is still 200 and the client believes the email change succeeded. The user's `auth.users.email_confirmed_at` is pending, but `public.users.email_verified` was not flipped to false — the trigger will flip it back to true when they click the confirmation link, BUT in the interim, the user still has access to verified-only features (quiz, expert queue, etc.) with an unconfirmed email. This is a minor temporal inconsistency, but the endpoint should signal failure if the state flip fails.

**Reproduction:** Temporarily break the users-table RLS policy, call email-change, observe `auth.updateUser` succeeds but users-table update is denied silently.

**Suggested fix direction:** Return 500 (or log and return 200 with a warning) if the `users.update` fails after auth succeeds, so the client can prompt the user to contact support.

**Confidence:** MEDIUM — The trigger will eventually repair the state, so this is a short-lived inconsistency, not a complete failure path.

---

## LOW

### F-A1-3-06 — Reset-password endpoint returns 200 for all errors, hiding rate-limit hits

**File:line:** `web/src/app/api/auth/reset-password/route.js:8-48`

**Evidence:**
```javascript
const ipHit = await checkRateLimit(svc, {
  key: `reset:ip:${ip}`,
  policyKey: 'reset_password_ip',
  max: 5,
  windowSec: 3600,
});
if (ipHit.limited) {
  return NextResponse.json({ ok: true }); // Returns 200 even when rate-limited
}

const emailHit = await checkRateLimit(svc, {
  key: `reset:email:${email.toLowerCase()}`,
  policyKey: 'reset_password_email',
  max: 3,
  windowSec: 3600,
});
if (emailHit.limited) {
  return NextResponse.json({ ok: true }); // Returns 200 even when rate-limited
}

// At end of function:
} catch (err) {
  console.error('[reset-password]', err);
  return NextResponse.json({ ok: true }); // Returns 200 even on exceptions
}
```

**Impact:** The endpoint always returns 200 with `{ ok: true }`, even when rate-limited or when an exception occurs. This is intentional (security-by-obscurity: don't leak whether an email is registered). However, it also means the client has no way to detect that the reset email was not sent (e.g., to show a retry message or throttle client-side resend buttons). The server-side cooldown on verify-email's resend-verification (429 response) is stricter and more honest.

**Reproduction:** Trigger the rate-limit by sending 5+ reset requests from the same IP, or 3+ from the same email — client always receives 200 and has no signal to back off.

**Suggested fix direction:** (Optional) Return 429 on rate-limit hits (like resend-verification does) so the client can surface a retry-after message. Or document the constant-200 behavior in comments if this is intentional obfuscation.

**Confidence:** LOW — This may be intentional security design (don't enumerate registered emails). Verify with product intent before changing.

---

## UNSURE

### F-A1-3-07 — Custom JWT claim `is_kid_delegated` and `kid_profile_id` validation on RLS

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

**Unclear:** 
- Are RLS policies on kid-readable tables (e.g., `kid_profiles`, `kid_sessions`) actually validating `auth.jwt->'is_kid_delegated'` and `auth.jwt->'kid_profile_id'`? 
- Or are they only checking `auth.uid()` (which is set to `sub` = kid_profile_id)?
- If the latter, then the custom claims are informational only and don't add authorization value.

**Reproduction:** Unknown — would need to inspect actual RLS policies (not provided in audit scope).

**Suggested fix direction:** Verify RLS policies explicitly check `is_kid_delegated = true` before allowing any access; do not rely on `auth.uid()` alone, which could be spoofed if the JWT signing is ever compromised.

**Confidence:** LOW — Custom claims are present, but verification that they're enforced is beyond read-only file inspection.

