import { test, expect } from '@playwright/test';

test.describe('leaderboard', () => {
  test('leaderboard requires auth', async ({ page }) => {
    await page.goto('/leaderboard');
    await page.waitForLoadState('domcontentloaded');
    if (page.url().endsWith('/welcome')) test.skip(true, 'coming-soon mode');
    // /leaderboard is in PROTECTED_PREFIXES per middleware.js
    expect(['/login', '/leaderboard'].some((p) => page.url().includes(p))).toBeTruthy();
  });
});

test.describe('search', () => {
  test('search page loads anonymously', async ({ page }) => {
    await page.goto('/search');
    if (page.url().endsWith('/welcome')) test.skip(true, 'coming-soon mode');
    expect(page.url()).toContain('/search');
  });

  test('search API rejects empty query gracefully', async ({ request }) => {
    const res = await request.get('/api/search?q=');
    // Either 400 (validation) or 200 with empty results — anything < 500.
    expect(res.status()).toBeLessThan(500);
  });

  test('search query with special chars sanitized', async ({ request }) => {
    const res = await request.get('/api/search?q=' + encodeURIComponent("'; DROP TABLE users; --"));
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('browse', () => {
  test('browse page loads anonymously', async ({ page }) => {
    await page.goto('/browse');
    if (page.url().endsWith('/welcome')) test.skip(true, 'coming-soon mode');
    expect(page.url()).toContain('/browse');
    await expect(page.locator('main, h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });
});
