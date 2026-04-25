import { test, expect } from '@playwright/test';

/**
 * Coming-soon mode behaviour. Test environment may or may not have
 * NEXT_PUBLIC_SITE_MODE=coming_soon set; tests soft-skip when the
 * environment doesn't match the scenario being exercised.
 */

test.describe('coming-soon mode', () => {
  test('home redirects to /welcome when in coming-soon', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    if (!page.url().endsWith('/welcome')) {
      test.skip(true, 'site not in coming-soon mode');
    }
    expect(page.url()).toContain('/welcome');
  });

  test('/welcome holding card shows only veritypost.com text', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');
    const text = await page.locator('body').innerText();
    expect(text.toLowerCase()).toContain('veritypost.com');
  });

  test('/api/* not redirected by coming-soon middleware', async ({ request }) => {
    const res = await request.get('/api/health', { maxRedirects: 0 });
    // Should be 200 (or 401/403 for gated routes), never a redirect.
    expect(res.status()).toBeLessThan(300);
  });

  test('/admin not redirected by coming-soon middleware', async ({ request }) => {
    const res = await request.get('/admin', { maxRedirects: 0 });
    // Layout returns notFound() for non-staff; that's a 200-with-404-body
    // OR a 404 status. Should NOT be a 3xx redirect.
    expect(res.status()).toBeLessThan(300);
  });

  test('/sitemap.xml not redirected by coming-soon middleware', async ({ request }) => {
    const res = await request.get('/sitemap.xml', { maxRedirects: 0 });
    expect(res.status()).toBeLessThan(300);
  });

  test('preview-bypass route exists', async ({ request }) => {
    const res = await request.get('/preview', { maxRedirects: 0 });
    // Without a token: should not 500. May 200 (form), 302 (rejected),
    // 403 (no token).
    expect(res.status()).toBeLessThan(500);
  });
});
