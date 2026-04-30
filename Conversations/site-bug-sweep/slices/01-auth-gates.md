# Slice 01 — Auth & Account Gates

**Status:** shipped
**Last updated:** 2026-04-30 (Session 2 — implementation)
**Investigation agents:** A (login/signup flows), B (PKCE/callbacks/session), C (middleware), D (beta-gate/waitlist/invite/referral)
**Adversarial agent:** spawned fresh, reviewed all 8 original findings + two priority verifications

---

## Issue list

| ID | Severity | Status | Summary |
|---|---|---|---|
| 01-00 | P0 | shipped `d2da5a0` | `auth.js:346` calls dead RPC `compute_effective_perms` — every `requirePermission()` returns 500 if RPC was dropped |
| 01-01 | P1 | shipped `55ebd09` | False success on waitlist / request-access forms — `setStage('sent')` without checking `res.ok` |
| 01-02 | P1 | shipped `55ebd09` | OTP resend cooldown starts before API success; catch block is silent |
| 01-03 | P1 | shipped `55ebd09` | Middleware `getUser()` has no try/catch — transient Supabase failure crashes the edge |
| 01-04 | P1 | shipped `55ebd09` | Beta-gate `deleteUser()` and `createUser()` failures silently orphan email in `auth.users` (two vectors) |
| 01-05 | P2 | shipped `cefad67` | Kid JWT reaches `/profile/kids` via `/kids` redirect — confusing UX; page-level gate prevents actual bypass |
| 01-06 | P2 | shipped `cefad67` | `/api/auth/confirm` ignores `?next=` — magic-link users always land on home |
| 01-07 | P2 | shipped `cefad67` | Session cookie write failure silently swallowed — no logging |
| 01-08 | P2 | shipped `cefad67` | `/profile/kids` `refreshAllPermissions()` not error-handled — valid parent sees upsell on RPC failure |
| 01-09 | — | wont-fix | Magic link email send failure intentionally fail-open (source comment confirms design) |

---

## 01-00 — `auth.js` calls dead RPC `compute_effective_perms`

**Severity:** P0 — potential production blocker
**Status:** found

**Root cause:**
`web/src/lib/auth.js:346` calls `supabase.rpc('compute_effective_perms', { p_user_id: userId })`. The article-lifecycle program updated `web/src/lib/permissions.js` (client-side) to use `my_permission_keys`, but `auth.js` (server-side) was not updated. `auth.js` is the path invoked by `requirePermission()` in every API route. If `compute_effective_perms` no longer exists in the database, every call to `requirePermission()` returns 500.

**Pre-fix verification required:**
Query DB via MCP: `SELECT proname FROM pg_proc WHERE proname IN ('compute_effective_perms', 'my_permission_keys');` to confirm which RPCs exist and what their signatures are.

**Fix plan:**
1. Confirm DB state. If `compute_effective_perms` is dropped: change `auth.js:346` to call `my_permission_keys`.
2. Verify the param shape: `permissions.js` uses `my_permission_keys` — check its call to confirm the parameter name.
3. Verify the return shape: confirm the `loadEffectivePerms` function correctly handles the `my_permission_keys` return structure (array of key strings vs. keyed rows).

**Files:**
- `web/src/lib/auth.js:346` — calling site to change
- `web/src/lib/permissions.js` — reference for correct RPC name and param shape

---

## 01-01 — False success on waitlist / request-access forms

**Severity:** P1
**Status:** found

**Root cause:**
`web/src/app/login/_RequestAccessForm.tsx:73-83` and `web/src/app/login/_WaitlistForm.tsx:46-54` call `fetch('/api/access-request', ...)` and immediately call `setStage('sent')` without checking `res.ok`. The API returns 400 on malformed input (response shape: `{ error: string }`). On any non-2xx response, the user sees a success confirmation.

**Adversarial clarification:**
Both components have an error state variable and an existing error UI slot, but the error UI is stage-gated — it only renders when `stage === 'form'`. The fix must not transition to `'sent'` on failure, or the error UI will never display.

**Fix plan:**
In both components, after `fetch()`:
```javascript
const res = await fetch('/api/access-request', { ... });
if (!res.ok) {
  const body = await res.json().catch(() => ({}));
  setError(body.error ?? 'Something went wrong. Please try again.');
  return; // do NOT call setStage('sent')
}
setStage('sent');
```

**Files:**
- `web/src/app/login/_RequestAccessForm.tsx:73-83`
- `web/src/app/login/_WaitlistForm.tsx:46-54`

---

## 01-02 — OTP resend cooldown starts before API success; catch block is silent

**Severity:** P1
**Status:** found

**Root cause:**
`web/src/app/login/_SingleDoorForm.tsx:138-154`: `handleResend` calls `startResendCooldown()` unconditionally after `fetch()`, regardless of `res.ok`. The catch block at lines 149-150 is `catch { }` — fully silent. After a failed resend (network error, 500), the user sees "Resend in 30s" and cannot retry, with no indication that the send failed.

**Adversarial clarification:**
No toast mechanism exists in this component. Error display must use `setCodeError()` — the same state used by the email-submit path at lines 87-88, rendered as a `role="alert"` div. Do not introduce toast.

**Fix plan:**
```javascript
const handleResend = async () => {
  if (resendCooldown > 0 || emailBusy) return;
  setCodeError(null);
  setEmailBusy(true);
  try {
    const res = await fetch('/api/auth/send-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: sentEmail }),
    });
    if (res.ok) {
      startResendCooldown();
    } else {
      setCodeError('Could not resend. Please try again.');
    }
  } catch {
    setCodeError('Could not resend. Check your connection.');
  } finally {
    setEmailBusy(false);
  }
};
```

**Files:**
- `web/src/app/login/_SingleDoorForm.tsx:138-154`

---

## 01-03 — Middleware `getUser()` has no try/catch

**Severity:** P1
**Status:** found

**Root cause:**
`web/src/middleware.js:348`: `const user = needsUser ? (await supabase.auth.getUser()).data.user : null;` — no error boundary. If Supabase is unreachable or returns an unexpected shape, this throws an unhandled promise rejection, crashing the middleware edge worker. In-flight requests at that moment may get 500 or be left hanging.

**Fix plan:**
Wrap in try/catch. On error: redirect protected routes to `/login?next=<pathname>`; allow public routes through (they will fail gracefully on their own data fetches):

```javascript
let user = null;
if (needsUser) {
  try {
    user = (await supabase.auth.getUser()).data.user ?? null;
  } catch {
    if (isProtected(pathname)) {
      const dest = new URL('/login', request.url);
      dest.searchParams.set('next', pathname);
      return NextResponse.redirect(dest);
    }
    // Public routes: pass through; page-level fetches will handle degradation
  }
}
```

**Files:**
- `web/src/middleware.js:348`

---

## 01-04 — Beta-gate `deleteUser()` and `createUser()` failures silently orphan email in `auth.users`

**Severity:** P1
**Status:** found

**Root cause — two vectors:**

**Vector A:** `web/src/app/api/auth/callback/route.js:58-62` — when the beta gate blocks a new OAuth signup, `auth.admin.deleteUser(user.id)` is called to clean up. If it throws (caught and logged only), the redirect to `/beta-locked` still fires and the `auth.users` row is left behind. The email address is permanently reserved; the user can never re-register with that email.

**Vector B:** `web/src/app/api/auth/send-magic-link/route.js:260-278` — if `auth.admin.createUser()` throws or returns a non-"already exists" error, the code logs and returns `genericOk()`. The `auth.users` row may be in a partial or absent state; future signup attempts for that email may fail with "already exists" when no functional account exists.

**Fix plan:**
Both vectors: tag orphan-risk failures with a distinct log marker for ops monitoring. On failure, log `console.error('[NEEDS_CLEANUP] auth.users orphan:', identifier, e.message)` so these surface in Vercel log queries.

Vector A specifically: after `deleteUser()` fails, do not silently proceed — make the ops-visible log the explicit outcome rather than a buried `console.error`.

Long-term fix (deferred, separate ticket): a cleanup cron that queries `auth.users` rows with no matching `public.users` row older than 24h and attempts deletion.

**Files:**
- `web/src/app/api/auth/callback/route.js:58-62` (Vector A)
- `web/src/app/api/auth/send-magic-link/route.js:260-278` (Vector B)

---

## 01-05 — Kid JWT reaches `/profile/kids` via `/kids` redirect

**Severity:** P2 (downgraded from P1 — page-level permission gate prevents actual bypass)
**Status:** found

**Root cause:**
`/kids` is listed in `isKidAllowedPath` at `middleware.js:336-337`, so the kid-reject check at line 365 never fires for `/kids`. The redirect block at line 434 checks `if (user)` — any authenticated JWT, including a kid JWT, satisfies this and is sent to `/profile/kids`.

The page at `app/profile/kids/page.tsx:124-136` checks `kids.parent.view` permission and renders an upsell/denied modal for anyone lacking it. A kid JWT does not have this permission, so no adult UI is accessible. The bug is UX: a kid hits `/kids`, is redirected to an adult account management route, and sees a confusing permission-denied/upsell state.

**Adversarial confirmation:**
`app/profile/kids/page.tsx:132-136` — the permission gate is confirmed present and correct. No fix needed in that file.

**Fix plan:**
In `middleware.js:434-439`, check `app_metadata` before deciding the redirect destination. Send kid JWTs and anonymous visitors both to `/kids-app`:

```javascript
if (pathname === '/kids' || pathname.startsWith('/kids/')) {
  const dest = request.nextUrl.clone();
  dest.search = '';
  const isKid =
    user?.app_metadata?.is_kid_delegated === true ||
    !!user?.app_metadata?.kid_profile_id;
  dest.pathname = (user && !isKid) ? '/profile/kids' : '/kids-app';
  return NextResponse.redirect(dest, { status: 302 });
}
```

**Files:**
- `web/src/middleware.js:434-439`

---

## 01-06 — `/api/auth/confirm` ignores `?next=`

**Severity:** P2
**Status:** found

**Root cause:**
`web/src/app/api/auth/confirm/route.ts:48` hardcodes `NextResponse.redirect(\`${siteUrl}/\`)` after a successful magic-link confirmation. The PKCE OAuth callback (`/api/auth/callback/route.js:90`) correctly uses `resolveNextForRedirect()`. Magic-link users always land on home regardless of intended destination.

**Adversarial detail:**
The magic-link URL is built in `send-magic-link/route.js:298` with `?t=` and `?e=` params only — no `?next=` is appended. The fix requires two coordinated changes: (1) `send-magic-link` must pass `?next=` into the `actionLink` URL when present, and (2) `confirm` must read and validate it.

**Fix plan:**

Step 1 — `api/auth/send-magic-link/route.js`: read `next` from request body (if provided by the client). After building `actionLink` at line 298, append `&next=${encodeURIComponent(next)}` when `next` is non-empty and passes `resolveNextForRedirect` validation.

Step 2 — `api/auth/confirm/route.ts:48`: read `request.nextUrl.searchParams.get('next')`. Run through `resolveNextForRedirect(siteUrl, rawNext, '/')` (import the same utility from `authRedirect.js` that the callback uses). Redirect to the validated result.

**Files:**
- `web/src/app/api/auth/confirm/route.ts:48`
- `web/src/app/api/auth/send-magic-link/route.js:298` (pass ?next= into URL)

---

## 01-07 — Session cookie write failure silently swallowed

**Severity:** P2
**Status:** found

**Root cause:**
`web/src/lib/supabase/server.ts:37-39` wraps the cookie `set()` handler in `catch {}`. Failures are invisible in logs. If a session cookie cannot be written after a successful PKCE exchange (edge context limitation, header size limit), the user appears signed in but every subsequent request sees no session.

**Note:** The fail-silent behavior is likely intentional for Vercel Edge runtime compatibility — the same pattern appears in the Supabase SSR library itself. The fix is a minimal logging improvement only; do not change the fail-silent behavior.

**Fix plan:**
Change `catch {}` to `catch (e) { console.error('[supabase] cookie-set failed', e?.message ?? String(e)); }`.
Apply the same change to the `remove()` handler at lines 41-44.

**Files:**
- `web/src/lib/supabase/server.ts:37-39` (set handler)
- `web/src/lib/supabase/server.ts:41-44` (remove handler)

---

## 01-08 — `/profile/kids` `refreshAllPermissions()` not error-handled

**Severity:** P2
**Status:** found
**Source:** adversarial-only finding

**Root cause:**
`web/src/app/profile/kids/page.tsx:124` calls `refreshAllPermissions()` with no try/catch. If the `my_permission_keys` RPC fails (Supabase error, transient network issue), the call returns without setting any permissions. All subsequent `hasPermission()` checks at lines 125-130 return false. The page sets `denied = true` at line 133 (because `kids.parent.view` is false) and renders the upsell/denied modal — even for a valid parent user. No error is surfaced; the user sees a paywall they shouldn't be on.

**Fix plan:**
Wrap `refreshAllPermissions()` at line 124 in try/catch. On error, set `loadError = true` to render the existing error UI rather than the misleading permission-denied state:

```javascript
try {
  await refreshAllPermissions();
} catch {
  setLoadError(true);
  setLoading(false);
  return;
}
```

**Files:**
- `web/src/app/profile/kids/page.tsx:124`

---

## 01-09 — Magic link email send failure swallowed (wont-fix)

**Severity:** —
**Status:** wont-fix

**Rationale:**
`web/src/app/api/auth/send-magic-link/route.js:328-345` catches Resend failures and returns `genericOk()` regardless. The source comment at line 330 explicitly states: "Fail-open — auth rows exist; user can re-request." This is an intentional design decision: a failed email send should not block the signup flow, because the user can request another link. The failure is logged (`console.error('MAIL_ERR:', ...)`). Changing this to return 500 would surface transient Resend errors as sign-in failures.
