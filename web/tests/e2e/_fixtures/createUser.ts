/**
 * Per-test user creation. Each spec that needs an authenticated user
 * calls `createTestUser()` which:
 *   - generates a unique email (vp-e2e-<uuid>@example.com)
 *   - signs up via the live signup API (matches real user behaviour
 *     instead of bypassing via service-role insert; exercises the
 *     server-side validation + audit path)
 *   - returns { email, password, userId } for the spec to use
 *
 * Cleanup: a global teardown hook (tests/e2e/_fixtures/cleanup.ts)
 * deletes vp-e2e-* users at the end of the run via the service-role
 * client. Per-test cleanup would race across parallel workers.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in the test environment for the
 * teardown step. The signup itself goes through the public API so no
 * service key is needed for the create path.
 */

import { request } from '@playwright/test';
import { randomUUID } from 'crypto';

export interface TestUser {
  email: string;
  password: string;
}

export async function createTestUser(baseURL: string): Promise<TestUser> {
  const email = `vp-e2e-${randomUUID()}@example.com`;
  const password = 'TestPass1234!'; // satisfies the default password.* policy

  const ctx = await request.newContext({ baseURL });
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
    throw new Error(`createTestUser signup failed: ${res.status()} ${body.slice(0, 200)}`);
  }
  await ctx.dispose();

  return { email, password };
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
