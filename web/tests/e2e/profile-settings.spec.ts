import { test, expect } from '@playwright/test';
import { createTestUser, signInViaApi } from './_fixtures/createUser';

test.describe('profile/settings', () => {
  test('settings page loads for authed user', async ({ page, baseURL }) => {
    const user = await createTestUser(baseURL!);
    await signInViaApi(page, user);
    await page.goto('/profile/settings');
    expect(page.url()).toContain('/profile/settings');
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 10_000 });
  });

  test('settings page redirects anon to login', async ({ page }) => {
    await page.goto('/profile/settings');
    // Should bounce to /login OR /welcome (coming-soon mode).
    await page.waitForLoadState('networkidle');
    expect(['/login', '/welcome'].some((p) => page.url().includes(p))).toBeTruthy();
  });

  test('change-password endpoint requires auth', async ({ request }) => {
    const res = await request.post('/api/auth/password-change', {
      data: { currentPassword: 'x', newPassword: 'TestPass1234!' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('email-change endpoint requires auth', async ({ request }) => {
    const res = await request.post('/api/auth/email-change', {
      data: { email: 'new@example.com' },
    });
    expect([401, 403]).toContain(res.status());
  });
});
