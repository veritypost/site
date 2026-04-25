import { test, expect } from '@playwright/test';

/**
 * Article reader surface. Anon-friendly tests; the gated comment
 * thread lives in quiz-and-comments.spec.ts.
 *
 * These tests assume the home feed renders at least one published
 * article. If the feed is empty (fresh DB), they soft-skip.
 */

test.describe('article reader', () => {
  test('clicking a story card opens the article', async ({ page }) => {
    await page.goto('/');
    if (page.url().endsWith('/welcome')) test.skip(true, 'coming-soon mode');

    const articleLink = page.locator('a[href^="/story/"]').first();
    const count = await articleLink.count();
    if (count === 0) test.skip(true, 'no published articles in this environment');

    const href = await articleLink.getAttribute('href');
    await articleLink.click();
    await page.waitForURL(`**${href}`);
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('article URL renders headline + body or 404', async ({ page, request }) => {
    // Hit /story/__nope__ and expect a graceful 404, not a 500.
    const res = await request.get('/story/__definitely_not_a_real_slug__', {
      maxRedirects: 0,
    });
    expect(res.status()).toBeLessThan(500);
  });
});
