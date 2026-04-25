import { test, expect } from '@playwright/test';
import { createTestUser, signInViaUi, signInViaApi } from './_fixtures/createUser';

/**
 * Auth flow smoke. Each test creates its own throwaway user via the
 * real signup API. Cleanup happens in global teardown.
 *
 * If you're adding more flows, copy this shape:
 *   1. const user = await createTestUser(baseURL);
 *   2. await signInViaApi(page, user) — fast path
 *      OR await signInViaUi(page, user) — when the UI itself is the test
 *   3. exercise the surface
 */

test.describe('auth flow', () => {
  test('signup API creates a user', async ({ baseURL }) => {
    const user = await createTestUser(baseURL!);
    expect(user.email).toMatch(/^vp-e2e-/);
    // No assertion about row state — that requires a service-role read.
    // Sufficient for the smoke that signup() returns 200.
  });

  test('login via UI lands on a non-login page', async ({ page, baseURL }) => {
    const user = await createTestUser(baseURL!);
    await signInViaUi(page, user);
    expect(page.url()).not.toContain('/login');
  });

  test('login via API + page.goto lands authed', async ({ page, baseURL }) => {
    const user = await createTestUser(baseURL!);
    await signInViaApi(page, user);
    // Navigating to a protected route after signInViaApi should NOT
    // bounce to /login. /profile/settings is the canonical authed
    // surface; if it redirects to /login or /verify-email, the cookie
    // didn't carry.
    await page.goto('/profile/settings');
    expect(page.url()).not.toContain('/login');
  });
});
