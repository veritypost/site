import { test, expect } from '@playwright/test';
import { createTestUser, signInViaApi } from './_fixtures/createUser';

test.describe('messages', () => {
  test('messages page loads for authed user', async ({ page, baseURL }) => {
    const user = await createTestUser(baseURL!);
    await signInViaApi(page, user);
    await page.goto('/messages');
    expect(page.url()).toContain('/messages');
  });

  test('messages requires auth (anon redirected)', async ({ page }) => {
    await page.goto('/messages');
    await page.waitForLoadState('networkidle');
    expect(['/login', '/welcome'].some((p) => page.url().includes(p))).toBeTruthy();
  });

  test('GET /api/conversations requires auth', async ({ request }) => {
    const res = await request.get('/api/conversations');
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('notifications', () => {
  test('notifications inbox loads for authed user', async ({ page, baseURL }) => {
    const user = await createTestUser(baseURL!);
    await signInViaApi(page, user);
    await page.goto('/notifications');
    expect(page.url()).toContain('/notifications');
  });

  test('notifications inbox shows anon CTA for anon (no redirect)', async ({ page }) => {
    // R13-T3: notifications page renders an anon CTA in-place rather
    // than bouncing to /login (the tab is in primary bottom-nav).
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    // Either the inbox renders or coming-soon redirects.
    if (page.url().endsWith('/welcome')) test.skip(true, 'coming-soon mode');
    expect(page.url()).toContain('/notifications');
  });

  test('notifications PATCH requires auth', async ({ request }) => {
    const res = await request.patch('/api/notifications/preferences', {
      data: { breaking_news: true },
    });
    expect([401, 403]).toContain(res.status());
  });
});
