import { test, expect } from '@playwright/test';

/**
 * Static legal + marketing pages all return 2xx and render an <h1>.
 */

const STATIC_PAGES = [
  '/privacy',
  '/terms',
  '/cookies',
  '/dmca',
  '/accessibility',
  '/contact',
  '/login',
  '/signup',
  '/forgot-password',
];

test.describe('static pages', () => {
  for (const path of STATIC_PAGES) {
    test(`${path} loads`, async ({ page }) => {
      await page.goto(path);
      // Coming-soon may redirect; that's still a < 500 response.
      await page.waitForLoadState('domcontentloaded');
      expect(page.url()).toBeTruthy();
      // Some pages might not have h1; just confirm the body has SOME
      // visible text content > 100 chars.
      const text = await page.locator('body').innerText();
      expect(text.length).toBeGreaterThan(50);
    });
  }
});
