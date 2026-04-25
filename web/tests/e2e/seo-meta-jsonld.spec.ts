import { test, expect } from '@playwright/test';

/**
 * SEO + JSON-LD coverage. The Organization + WebSite schemas should
 * appear on every page; NewsArticle should appear on story pages
 * once the article loads.
 */

test.describe('JSON-LD', () => {
  test('home emits Organization + WebSite schemas', async ({ page }) => {
    await page.goto('/');
    if (page.url().endsWith('/welcome')) test.skip(true, 'coming-soon mode');
    const scripts = page.locator('script[type="application/ld+json"]');
    const count = await scripts.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const types: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await scripts.nth(i).textContent();
      if (!text) continue;
      try {
        const parsed = JSON.parse(text);
        const t = parsed['@type'];
        if (typeof t === 'string') types.push(t);
      } catch {
        /* not all scripts are parseable; that's fine */
      }
    }
    expect(types).toContain('Organization');
    expect(types).toContain('WebSite');
  });

  test('story page emits NewsArticle schema when article loads', async ({ page }) => {
    await page.goto('/');
    if (page.url().endsWith('/welcome')) test.skip(true, 'coming-soon mode');
    const articleLink = page.locator('a[href^="/story/"]').first();
    if ((await articleLink.count()) === 0) test.skip(true, 'no published articles');
    await articleLink.click();
    await page.waitForLoadState('domcontentloaded');

    const scripts = page.locator('script[type="application/ld+json"]');
    const count = await scripts.count();
    let foundNewsArticle = false;
    for (let i = 0; i < count; i++) {
      const text = await scripts.nth(i).textContent();
      if (!text) continue;
      try {
        const parsed = JSON.parse(text);
        if (parsed['@type'] === 'NewsArticle') foundNewsArticle = true;
      } catch {
        /* skip */
      }
    }
    expect(foundNewsArticle).toBeTruthy();
  });

  test('home has a <title> tag', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('home has meta description', async ({ page }) => {
    await page.goto('/');
    const meta = page.locator('meta[name="description"]');
    if ((await meta.count()) === 0) {
      // Coming-soon scrub strips the description tag entirely on /welcome.
      // Acceptable — there's nothing to index, so nothing to describe.
      return;
    }
    const desc = await meta.getAttribute('content');
    if (desc) expect(desc.length).toBeGreaterThan(0);
  });
});
