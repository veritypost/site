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
  // confirmation. Trigger handles downstream rows.
  const admin = getAdmin();
  if (admin) {
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'E2E Test User' },
    });
    if (error) {
      throw new Error(`createTestUser admin path failed: ${error.message}`);
    }
    return { email, password };
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
    throw new Error(
      `createTestUser API path failed: ${res.status()} ${body.slice(0, 200)} ` +
        '(set SUPABASE_SERVICE_ROLE_KEY to use the faster admin path that bypasses rate limits)'
    );
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
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole('button', { name: /(log in|sign in)/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

/**
 * Sign in by hitting the API directly and copying the auth cookie into
 * the page context. Faster than signInViaUi; doesn't render the login
 * screen. Use when sign-in itself isn't the surface under test.
 */
export async function signInViaApi(page: import('@playwright/test').Page, user: TestUser) {
  const res = await page.request.post('/api/auth/login', {
    data: { email: user.email, password: user.password },
  });
  if (!res.ok()) {
    throw new Error(`signInViaApi failed: ${res.status()} ${await res.text()}`);
  }
  // The login route sets the auth cookies on this request context;
  // page.request shares cookies with page navigations, so the next
  // page.goto() carries the session.
}
