/**
 * Per-test user creation. Each spec that needs an authenticated user
 * calls `createTestUser()`.
 *
 * Two paths:
 *   1. Service-role (preferred) — when SUPABASE_SERVICE_ROLE_KEY is
 *      present in the test env, create the auth.users row directly
 *      via the admin API. Bypasses the rate-limited /api/auth/signup
 *      route entirely + no email confirmation step. The
 *      `handle_new_auth_user` trigger handles the public.users +
 *      user_roles inserts.
 *   2. API fallback — when no service key is present, post to
 *      /api/auth/signup with a spoofed unique x-forwarded-for so the
 *      per-IP rate limit doesn't fire across parallel workers. Slower
 *      and rate-limit-bound; use only when you're testing without DB
 *      access (rare).
 *
 * Cleanup: tests/e2e/_fixtures/cleanup.ts deletes vp-e2e-* users at
 * the end of the run via the same service-role admin API.
 */

import { request } from '@playwright/test';
import { randomUUID } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface TestUser {
  email: string;
  password: string;
}

let _admin: SupabaseClient | null = null;
let _warnedAdminFailure = false;
function getAdmin(): SupabaseClient | null {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

export async function createTestUser(baseURL: string): Promise<TestUser> {
  const email = `vp-e2e-${randomUUID()}@example.com`;
  const password = 'TestPass1234!'; // satisfies the default password.* policy

  // Path 1 — service-role admin createUser. Skips rate limit + email
  // confirmation. Trigger handles downstream rows. If the admin path
  // errors (wrong key, project mismatch, etc.) fall through to the API
  // path so the run isn't dead — surface a one-time warning so the
  // operator knows the fast path is broken.
  const admin = getAdmin();
  if (admin) {
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'E2E Test User' },
    });
    if (!error) return { email, password };
    if (!_warnedAdminFailure) {
      _warnedAdminFailure = true;
      console.warn(
        `[createTestUser] admin path failed (${error.message}); falling back to /api/auth/signup. ` +
          `Verify SUPABASE_SERVICE_ROLE_KEY matches NEXT_PUBLIC_SUPABASE_URL in web/.env.local.`
      );
    }
  }

  // Path 2 — fallback to the public signup API. Spoof unique IP so
  // parallel workers don't share the per-IP rate-limit bucket.
  const fakeIp = `10.${rand255()}.${rand255()}.${rand255()}`;
  const ctx = await request.newContext({
    baseURL,
    extraHTTPHeaders: { 'x-forwarded-for': fakeIp },
  });
  const res = await ctx.post('/api/auth/signup', {
    data: {
      email,
      password,
      ageConfirmed: true,
      agreedToTerms: true,
      fullName: 'E2E Test User',
    },
  });
  if (!res.ok()) {
    const body = await res.text();
    const status = res.status();
    await ctx.dispose();

    // 429 from /api/auth/signup with a unique x-forwarded-for almost
    // never means the legitimate per-IP cap fired — it means the
    // rate-limit RPC is failing closed because the dev server can't
    // reach Supabase (wrong/typo'd keys in web/.env.local). Surface
    // that diagnosis instead of the misleading "too many" message.
    if (status === 429) {
      throw new Error(
        'createTestUser: dev server returned 429 for a fresh IP — likely the ' +
          'rate-limit RPC is failing closed because Supabase keys are bad. ' +
          'Verify NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in web/.env.local ' +
          'point at the same project, then restart `npm run dev`.'
      );
    }
    throw new Error(`createTestUser API path failed: ${status} ${body.slice(0, 200)}`);
  }
  await ctx.dispose();
  return { email, password };
}

function rand255(): number {
  return Math.floor(Math.random() * 255);
}

/**
 * Sign the given user in via the UI. Use this in the test body when
 * you want to exercise the real login form. For tests that don't care
 * about the sign-in UX, prefer `signInViaApi()` below — faster and
 * doesn't pollute screenshots with the login screen.
 */
export async function signInViaUi(page: import('@playwright/test').Page, user: TestUser) {
  // Spoof a unique x-forwarded-for on every request this page makes,
  // so parallel workers don't share the per-IP login rate-limit bucket
  // on /api/auth/login (10/15min).
  const fakeIp = `10.${rand255()}.${rand255()}.${rand255()}`;
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': fakeIp });

  await page.goto('/login');
  await page.getByLabel(/email/i).first().fill(user.email);
  // Login form may render multiple password-labeled fields. Take the
  // primary input (always rendered first).
  await page
    .getByLabel(/password/i)
    .first()
    .fill(user.password);
  // The page also renders "Sign in with Apple" — match the exact label
  // of the email-password submit button instead of a regex that would
  // collide with the Apple SSO button.
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // Mobile-chromium with the supabase signInWithPassword round-trip
  // sometimes takes >10s on the first sign-in — bump the budget.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
}

/**
 * Sign in by hitting the API directly and copying the auth cookie into
 * the page context. Faster than signInViaUi; doesn't render the login
 * screen. Use when sign-in itself isn't the surface under test.
 */
/**
 * Convenience: sign in as one of the seeded role users. Same flow as
 * signInViaApi (form-based to land the @supabase/ssr cookie correctly)
 * but takes a seed entry directly so spec files don't repeat the
 * email/password pair.
 */
export async function signInAsSeededUser(
  page: import('@playwright/test').Page,
  seedUser: { email: string },
  password: string
) {
  await signInViaApi(page, { email: seedUser.email, password });
}

export async function signInViaApi(page: import('@playwright/test').Page, user: TestUser) {
  // Originally this helper hit /api/auth/login directly to skip the
  // login UI. That route does NOT call signInWithPassword — it expects
  // the browser to have already established a Supabase session via
  // supabase-js (which sets the @supabase/ssr cookie set the middleware
  // reads). The cookie format is non-trivial to fabricate, so we just
  // submit the real login form. Still under a second per call; the only
  // cost vs. the old fake-cookie approach is one screenshot of /login.
  await signInViaUi(page, user);
}
