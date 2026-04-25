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
    await page.waitForLoadState('domcontentloaded');
    expect(['/login', '/welcome'].some((p) => page.url().includes(p))).toBeTruthy();
  });

  test('GET /api/conversations does not leak data', async ({ request }) => {
    // POST-only route; GET → 405. Either way, no conversation data.
    const res = await request.get('/api/conversations');
    expect([401, 403, 404, 405]).toContain(res.status());
  });
});

test.describe('notifications', () => {
  test('notifications inbox loads for authed user', async ({ page, baseURL }) => {
    const user = await createTestUser(baseURL!);
    await signInViaApi(page, user);
    await page.goto('/notifications');
    expect(page.url()).toContain('/notifications');
  });

  test('notifications anon path lands on a coherent surface', async ({ page }) => {
    // Either renders an in-place anon CTA at /notifications (the
    // R13-T3 design intent) or redirects to /login (current behaviour).
    // Both are acceptable user outcomes; coming-soon also redirects to
    // /welcome. Just assert we end up on one of those three.
    await page.goto('/notifications');
    await page.waitForLoadState('domcontentloaded');
    if (page.url().endsWith('/welcome')) test.skip(true, 'coming-soon mode');
    expect(['/notifications', '/login'].some((p) => page.url().includes(p))).toBeTruthy();
  });

  test('notifications PATCH requires auth', async ({ request }) => {
    const res = await request.patch('/api/notifications/preferences', {
      data: { breaking_news: true },
    });
    expect([401, 403]).toContain(res.status());
  });
});
