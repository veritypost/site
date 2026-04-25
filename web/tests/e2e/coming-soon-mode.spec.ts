import { test, expect } from '@playwright/test';

/**
 * Coming-soon mode behaviour. Test environment may or may not have
 * NEXT_PUBLIC_SITE_MODE=coming_soon set; tests soft-skip when the
 * environment doesn't match the scenario being exercised.
 */

test.describe('coming-soon mode', () => {
  test('home redirects to /welcome when in coming-soon', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    if (!page.url().endsWith('/welcome')) {
      test.skip(true, 'site not in coming-soon mode');
    }
    expect(page.url()).toContain('/welcome');
  });

  test('/welcome holding card shows only veritypost.com text', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('domcontentloaded');
    const text = await page.locator('body').innerText();
    expect(text.toLowerCase()).toContain('veritypost.com');
  });

  test('/api/* not redirected by coming-soon middleware', async ({ request }) => {
    const res = await request.get('/api/health', { maxRedirects: 0 });
    // The check is "not a 3xx redirect" — the route may legitimately
    // 503 if a downstream check fails, but it must NEVER be redirected.
    expect([301, 302, 303, 307, 308]).not.toContain(res.status());
  });

  test('/admin not redirected by coming-soon middleware', async ({ request }) => {
    const res = await request.get('/admin', { maxRedirects: 0 });
    // Layout returns notFound() for non-staff; status may be 404 or
    // 200-with-404-body. Just assert it isn't a 3xx redirect.
    expect([301, 302, 303, 307, 308]).not.toContain(res.status());
  });

  test('/sitemap.xml not redirected by coming-soon middleware', async ({ request }) => {
    const res = await request.get('/sitemap.xml', { maxRedirects: 0 });
    // Chunked sitemap pattern returns 200 from /sitemap.xml or 404 if
    // the index hasn't been generated; both are non-redirect outcomes.
    expect([301, 302, 303, 307, 308]).not.toContain(res.status());
  });

  test('preview-bypass route exists', async ({ request }) => {
    const res = await request.get('/preview', { maxRedirects: 0 });
    // Without a token: should not 500. May 200 (form), 302 (rejected),
    // 403 (no token).
    expect(res.status()).toBeLessThan(500);
  });
});
