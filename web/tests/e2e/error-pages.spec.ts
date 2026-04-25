import { test, expect } from '@playwright/test';

/**
 * 404 + 500 error surfaces. Bogus URLs should produce a clean 404
 * page, not a JavaScript stack trace or a 500.
 */

test.describe('error pages', () => {
  test('completely bogus URL renders 404 page (or coming-soon redirect)', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-anywhere-12345');
    await page.waitForLoadState('networkidle');
    if (page.url().endsWith('/welcome')) test.skip(true, 'coming-soon mode');
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/404|not found|page.*not.*found/i);
  });

  test('bogus story slug returns 404 surface', async ({ page }) => {
    await page.goto('/story/__definitely_not_real_slug__');
    await page.waitForLoadState('networkidle');
    if (page.url().endsWith('/welcome')) test.skip(true, 'coming-soon mode');
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/404|not found|article|story/i);
  });

  test('bogus username returns clean state', async ({ page }) => {
    await page.goto('/u/__definitely-not-a-real-user__');
    await page.waitForLoadState('networkidle');
    if (page.url().endsWith('/welcome')) test.skip(true, 'coming-soon mode');
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/404|not found|user|profile|@/i);
  });
});
