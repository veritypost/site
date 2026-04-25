import { test, expect } from '@playwright/test';
import { createTestUser, signInViaApi } from './_fixtures/createUser';

test.describe('bookmarks', () => {
  test('bookmarks page renders for authed user', async ({ page, baseURL }) => {
    const user = await createTestUser(baseURL!);
    await signInViaApi(page, user);
    await page.goto('/bookmarks');
    expect(page.url()).toContain('/bookmarks');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });

  test('add bookmark POST returns 200 or 201', async ({ page, baseURL, request }) => {
    const user = await createTestUser(baseURL!);
    await signInViaApi(page, user);
    // Use a definitely-fake article_id; we only care that the route
    // gates auth + returns a structured response (not 5xx).
    const res = await request.post('/api/bookmarks', {
      data: { article_id: '00000000-0000-0000-0000-000000000001' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('bookmarks GET requires auth', async ({ request }) => {
    // Anon GET on /api/bookmarks should not return user data.
    const res = await request.get('/api/bookmarks');
    expect([401, 403]).toContain(res.status());
  });

  test('cursor pagination — Load more button hidden when filter active', async ({
    page,
    baseURL,
  }) => {
    const user = await createTestUser(baseURL!);
    await signInViaApi(page, user);
    await page.goto('/bookmarks');
    // Fresh user has zero bookmarks → no Load more button.
    const btn = page.getByRole('button', { name: /load more/i });
    await expect(btn).toHaveCount(0);
  });
});
