---
wave: A
group: 1 Auth flows
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Wave A Group 1 (Auth flows), Agent 2

## CRITICAL

### F-A1-2-01 — Kid JWT custom claim validation missing in refresh endpoint

**File:line:** `web/src/app/api/kids/refresh/route.js:65-72`

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

**Impact:** The refresh endpoint correctly guards against adult GoTrue tokens being rotated into kid JWTs. However, this validation exists only here. The `/api/kids/pair` endpoint (line 19-118) mints the JWT without any server-side shape guard; it relies entirely on the signing secret and type hints to prevent claims injection. An attacker with knowledge of SUPABASE_JWT_SECRET (e.g., from a compromised .env or leaky logs) could forge a kid JWT with arbitrary `is_kid_delegated`, `kid_profile_id`, or `parent_user_id` values, bypassing RLS that branches on `is_kid_delegated()`. The pair endpoint should mirror the refresh endpoint's shape guard before returning.

**Reproduction:** Code-reading only; requires secret exfiltration.

**Suggested fix direction:** Add pre-response validation in `/api/kids/pair` after jwt.sign() to confirm the signed token decodes and carries the expected claims.

**Confidence:** HIGH

---

### F-A1-2-02 — Signup rollback incomplete on role-insertion failure

**File:line:** `web/src/app/api/auth/signup/route.js:116-127`

**Evidence:**
```javascript
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

**Impact:** On rare trigger/upsert race conditions, a user's auth.users row is created but no role is assigned. The code attempts rollback via deleteUser, which itself may fail (e.g., user already deleted, transient DB error, or signal from service endpoint). If deleteUser fails, the error is logged but the response is still 500 "try again." On retry, the same user ID tries to sign up again. Because auth.users already exists, Supabase auth.signUp likely returns an "already exists" error, not a clean fresh signup. The user is now in a degraded state: orphaned auth.users row with no role. The "cron reconciler" mentioned in the comment has no visible implementation in the codebase; assume it does not exist or has not been deployed.

**Reproduction:** Trigger a permission denial on user_roles INSERT (e.g., alter RLS), sign up, observe deleteUser failure due to race or network fault.

**Suggested fix direction:** Before returning 500, ensure the auth.users row is actually deleted (retry deleteUser with backoff) or surface a distinct error so client/operator knows manual intervention may be needed.

**Confidence:** HIGH

---

## HIGH

### F-A1-2-03 — Password reset response always succeeds regardless of validity

**File:line:** `web/src/app/api/auth/reset-password/route.js:38-47`

**Evidence:**
```javascript
const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${siteUrl}/reset-password`,
});

return NextResponse.json({ ok: true });
```

**Impact:** The endpoint calls `resetPasswordForEmail()` and ignores the result — it always returns `{ ok: true }` even if Supabase returns an error. An invalid email, misconfigured auth, or rate-limit on Supabase's side will silently fail to send the reset email, but the user receives a success response. The user then waits indefinitely for an email that will never arrive. Rate-limit headers are provided by checkRateLimit for the app's own quotas, but errors from the underlying auth service (e.g., Supabase SMTP misconfiguration, email validation failure) are invisible.

**Reproduction:** Trigger resetPasswordForEmail to fail (e.g., bad email domain, Supabase service down), observe { ok: true } response and no email sent.

**Suggested fix direction:** Log and conditionally surface auth service errors in the response, or at minimum return a 5xx if error is truthy.

**Confidence:** HIGH

---

### F-A1-2-04 — OAuth callback ?next= preservation passes through signup pick-username

**File:line:** `web/src/app/api/auth/callback/route.js:151-153`

**Evidence:**
```javascript
const validatedNext = resolveNext(rawNext, null);
const nextQs = validatedNext ? `?next=${encodeURIComponent(validatedNext)}` : '';
return NextResponse.redirect(`${siteUrl}/signup/pick-username${nextQs}`);
```

**Impact:** When an OAuth sign-up completes and the user has no username, the callback preserves the `?next=` parameter through to `/signup/pick-username`. However, `/signup/pick-username` does not consume or act on the `?next=` parameter. After the user picks a username and completes that page, they are routed to `/welcome` (hardcoded; see verify-email page line 170), not to the original `?next=` value. The user's intended post-login destination is lost. The `resolveNext()` validation is correct, but the parameter is inert once inside the pick-username flow.

**Reproduction:** OAuth sign up with `?next=/bookmarks`, get redirected through callback → `/signup/pick-username?next=%2Fbookmarks` → complete username pick → land on `/welcome`, not `/bookmarks`.

**Suggested fix direction:** Pass ?next through the pick-username page form/state machine and redirect to it after onboarding, or drop the param earlier in callback so users don't see a false signal.

**Confidence:** HIGH

---

### F-A1-2-05 — Kid pair-code one-time enforcement relies on atomicity; no re-atomicity guarantee

**File:line:** `schema/095_kid_pair_codes_2026_04_19.sql:156-168`

**Evidence:**
```sql
IF v_row.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Code already used' USING ERRCODE = 'P0001';
END IF;

IF v_row.expires_at <= now() THEN
    RAISE EXCEPTION 'Code expired' USING ERRCODE = 'P0001';
END IF;

UPDATE public.kid_pair_codes
   SET used_at = now(),
       used_by_device = p_device
 WHERE code = p_code;
```

**Impact:** The RPC `redeem_kid_pair_code` uses FOR UPDATE to lock the code row during validation. However, the subsequent UPDATE is not in the same transaction block in the RPC (they are both PL/pgSQL statements, but the distinction between lock-and-check vs. check-then-lock-and-update matters under concurrent load). If two requests arrive simultaneously with the same code after the lock is released, the second check might pass before the first UPDATE completes, leading to both requests seeing used_at as NULL. The FOR UPDATE lock prevents the TOCTOU window, but only if the check and update are guaranteed atomic. The code appears atomic as written, but documentation or explicit transaction framing would strengthen assurance. (Verification: the UPDATE WHERE code=p_code is implicit ACID within the RPC, but Postgres semantics under concurrent EXECUTE calls should be verified.)

**Reproduction:** Code-reading only; would require precise timing or load injection to trigger.

**Suggested fix direction:** Add explicit isolation level or comment affirming that FOR UPDATE + immediate UPDATE within RPC guarantees atomicity, or refactor to single UPDATE with conditional check.

**Confidence:** MEDIUM

---

### F-A1-2-06 — Verify-email resend rate-limit lockout path returns 429 but UI says "Try again in an hour"

**File:line:** `web/src/app/verify-email/page.tsx:104-106`

**Evidence:**
```typescript
if (res.status === 429) {
  setStatus('expired');
  setError('Too many verification resends. Try again in an hour.');
```

**Impact:** When the resend endpoint returns 429, the client correctly identifies rate-limit lockout and displays an error message. However, setStatus('expired') transitions to the "expired" view (line 271-322), which is semantically incorrect — the link is not expired, the user is rate-limited. The UI title says "Link expired" and the message is user-customizable (line 295), but the error banner says "Too many verification resends." The state machine mixes two error conditions, which could confuse users who believe they need a fresh link rather than waiting out the rate-limit window.

**Reproduction:** Resend email 4+ times within an hour, observe 429 → status="expired" → "Link expired" title with "Too many resends" error message, mixed semantics.

**Suggested fix direction:** Add a distinct 'rate_limited' status or differentiate the expired state message based on the underlying error type.

**Confidence:** MEDIUM

---

## MEDIUM

### F-A1-2-07 — Preview bypass cookie missing secure flag in dev

**File:line:** `web/src/app/preview/route.ts:26-32`

**Evidence:**
```typescript
res.cookies.set('vp_preview', 'ok', {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 30,
  path: '/',
});
```

**Impact:** The coming-soon-wall bypass cookie is set with `secure: process.env.NODE_ENV === 'production'`. In development (NODE_ENV !== 'production'), the cookie is sent over http, which is not exploitable if dev server is localhost-only. However, if dev is deployed to a staging domain over https, the secure flag should be true. The logic should be `secure: true` (always HTTPS-only in modern deployment) or explicitly `secure: !process.env.IS_LOCAL_DEV` if local unencrypted dev is needed.

**Reproduction:** Set NODE_ENV=development and HTTPS=false, observe secure flag is false; any network observer can intercept the cookie.

**Suggested fix direction:** Set secure: true unconditionally, or add an explicit IS_LOCAL_DEV flag.

**Confidence:** MEDIUM

---

### F-A1-2-08 — OAuth avatar_url sanitization does not block data: URIs

**File:line:** `web/src/app/api/auth/callback/route.js:31-42`

**Evidence:**
```javascript
function sanitizeAvatarUrl(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, 2000);
  if (!trimmed.startsWith('https://')) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}
```

**Impact:** The function rejects non-https URLs. However, `data:` URIs do not parse as valid URL objects in all JS runtimes or may have inconsistent protocol values. A crafted data URL like `https://example.com" data:image/svg+xml...` could potentially bypass the protocol check depending on URL parser edge cases. The code is defensible (new URL throws on many malformed URIs), but a positive allowlist (https + a known CDN domain) would be stricter.

**Reproduction:** Code-reading only; depends on JS engine's URL parser behavior.

**Suggested fix direction:** Allowlist known IdP avatar CDNs (e.g., lh3.googleusercontent.com, platform-lookaside.fbsbx.com) instead of trusting a generic https:// check.

**Confidence:** MEDIUM

---

## LOW

### F-A1-2-09 — Signup fails closed on rate-limit but succeeds on auth service error

**File:line:** `web/src/app/api/auth/signup/route.js:54-57`

**Evidence:**
```javascript
if (authError) {
  console.error('[auth.signup]', authError);
  return NextResponse.json({ error: 'Signup failed' }, { status: 400 });
}
```

**Impact:** If Supabase auth.signUp returns an error (e.g., email already registered, auth service down), the route returns 400 and treats it as a client error. Rate-limit errors from the auth service (if Supabase imposes its own per-IP or per-email rate limits) would also return 400, indistinguishable from invalid input. The client cannot distinguish "this email already exists" from "service is down" from "you've signed up too many times." This is a low-priority ergonomic issue because the route already has its own rate-limit checks (checkRateLimit), but Supabase's service-level limits may also fire and their error codes could be more granular.

**Reproduction:** Sign up with an already-registered email, observe generic 400 "Signup failed."

**Suggested fix direction:** Parse authError.message for Supabase error codes (user_already_exists, rate_limit_exceeded) and return distinct status codes or error details.

**Confidence:** LOW

---

### F-A1-2-10 — Kid pair-code generation invalidates prior live codes but race condition possible

**File:line:** `schema/095_kid_pair_codes_2026_04_19.sql:96-101`

**Evidence:**
```sql
UPDATE public.kid_pair_codes
   SET used_at = now()
 WHERE kid_profile_id = p_kid_profile_id
   AND used_at IS NULL
   AND expires_at > now();
```

**Impact:** When a parent generates a new pair code, any existing live codes for the same kid are marked used. This is a one-at-a-time enforcement and is correct. However, if two parents simultaneously hold access to the same kid_profile (e.g., co-parenting scenario not yet modeled), they could both call generate_kid_pair_code concurrently and each successfully create a live code. The kid could pair with either code, creating ambiguity about which parent authorized the pairing. The schema does not constrain kid_profiles.parent_user_id to a single parent, so multi-parent scenarios are not ruled out. This is low-confidence because the product may not support multiple parents, but if it does, the one-live-code-per-kid invariant should be explicit.

**Reproduction:** As two different parents of the same kid (if schema allows), call generate_kid_pair_code simultaneously; observe both codes are live.

**Suggested fix direction:** Add a unique constraint or clarify the one-parent-per-kid contract in the schema.

**Confidence:** LOW

---

## UNSURE

### F-A1-2-11 — Signup pick-username flow ?next= parameter not visible to confirm post-username flow

**File:line:** `web/src/app/signup/pick-username/page.tsx` (not yet read)

**Unresolved:** F-A1-2-04 flagged that ?next= is passed to pick-username but not consumed. To fully assess the impact, I need to see the pick-username page's post-submit handler. Does it ignore ?next= and always go to /welcome, or does it pass it forward? If the former, the finding stands as-is. If the latter, no issue.

**Info needed:** Read the pick-username page's redirect logic after form submission.

---

