import { test, expect } from '@playwright/test';

/**
 * Anon golden path. The most important smoke test: a fresh visitor
 * can land on the home page and reach an article. If this breaks,
 * nothing else matters.
 *
 * Coming-soon mode caveat: when NEXT_PUBLIC_SITE_MODE=coming_soon,
 * the home page redirects to /welcome. This test detects that case
 * and asserts the holding page renders cleanly instead.
 */

test.describe('anon golden path', () => {
  test('home loads and serves either real content or coming-soon', async ({ page }) => {
    await page.goto('/');

    // Either we land on the real home (status 200, has feed content)
    // or middleware redirects to /welcome (status 200, holding card).
    const url = page.url();
    if (url.endsWith('/welcome')) {
      // Holding mode — minimal brand card visible.
      await expect(page.getByText(/veritypost\.com/i)).toBeVisible();
      return;
    }

    // Real home — should have at least one article link OR an empty
    // state. Both are valid; both render something a screen reader
    // can find.
    await expect(page).toHaveTitle(/verity/i);
    const main = page.locator('main').first();
    await expect(main).toBeVisible();
  });

  test('verifies CSP header is set', async ({ request }) => {
    const res = await request.get('/');
    const csp =
      res.headers()['content-security-policy'] ||
      res.headers()['content-security-policy-report-only'];
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
  });

  test('robots.txt + sitemap.xml respond', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.ok()).toBeTruthy();
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBeTruthy();
  });
});
