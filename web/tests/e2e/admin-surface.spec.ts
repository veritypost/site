import { test, expect } from '@playwright/test';
import { createTestUser, signInViaApi } from './_fixtures/createUser';

/**
 * Admin surface. The admin layout (`app/admin/layout.tsx`) returns a
 * 404 for anon + non-staff callers, so /admin appears not to exist
 * unless you're a seeded admin. These tests verify the negative path
 * (anon + regular user can't reach admin) and that admin-API routes
 * gate properly.
 *
 * Full positive-path admin tests need a seeded admin user; mark them
 * test.fixme until the test-data seeding pattern lands.
 */

test.describe('admin gate', () => {
  test('/admin returns notFound for anon', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('domcontentloaded');
    if (page.url().endsWith('/welcome')) test.skip(true, 'coming-soon mode');
    // notFound() in the layout returns Next's 404 page; the URL stays
    // at /admin but the body is the 404 surface.
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/404|not found|page.*not.*found/i);
  });

  test('/admin returns notFound for regular authed user', async ({ page, baseURL }) => {
    const user = await createTestUser(baseURL!);
    await signInViaApi(page, user);
    await page.goto('/admin');
    await page.waitForLoadState('domcontentloaded');
    if (page.url().endsWith('/welcome')) test.skip(true, 'coming-soon mode');
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/404|not found/i);
  });

  test('GET /api/admin/users requires admin perm', async ({ request, baseURL }) => {
    const user = await createTestUser(baseURL!);
    await request.post('/api/auth/login', {
      data: { email: user.email, password: user.password },
    });
    const res = await request.get('/api/admin/users');
    // Regular user gets 401 or 403; admin gets 200. Anything 4xx is acceptable.
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('GET /api/admin/permissions requires admin perm', async ({ request, baseURL }) => {
    const user = await createTestUser(baseURL!);
    await request.post('/api/auth/login', {
      data: { email: user.email, password: user.password },
    });
    const res = await request.get('/api/admin/permissions');
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('admin moderation routes require admin perm', async ({ request }) => {
    const routes = [
      '/api/admin/moderation/users/00000000-0000-0000-0000-000000000000/penalty',
      '/api/admin/moderation/comments/00000000-0000-0000-0000-000000000000/hide',
      '/api/admin/moderation/reports/00000000-0000-0000-0000-000000000000/resolve',
      '/api/admin/moderation/appeals/00000000-0000-0000-0000-000000000000/resolve',
    ];
    for (const r of routes) {
      const res = await request.post(r, { data: {} });
      expect(res.status()).toBeGreaterThanOrEqual(400);
      expect(res.status()).toBeLessThan(500);
    }
  });

  test.fixme('admin can grant role to user', async () => {
    // Requires seeded admin user. Wire when test-data seeding lands.
  });

  test.fixme('admin can hide a comment + audit row appears', async () => {
    // Requires seeded admin + seeded comment + service-role read for audit.
  });
});
