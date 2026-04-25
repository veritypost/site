import { test, expect } from '@playwright/test';
import { signInAsSeededUser } from './_fixtures/createUser';
import { getSeed } from './_fixtures/seed';

const seed = (() => {
  try {
    return getSeed();
  } catch {
    return null;
  }
})();

test.describe('preview-as-admin', () => {
  test.skip(!seed, 'seed data not available');

  test('admin signing in then visiting /preview-as-admin sets bypass + redirects home', async ({
    browser,
  }) => {
    // Use a fresh context so we don't inherit the storageState bypass
    // cookie that globalSetup pre-drops on the default context.
    const ctx = await browser.newContext({
      // Empty storageState — don't inherit the global bypass cookie.
      // The whole point of this test is to verify the route's own
      // gate works without any pre-set bypass.
      storageState: { cookies: [], origins: [] },
      extraHTTPHeaders: { 'x-forwarded-for': `10.55.55.${Math.floor(Math.random() * 254)}` },
    });
    const page = await ctx.newPage();

    // To sign in we need /login reachable. In coming-soon mode that
    // requires the bypass cookie (we removed /login from the allowlist
    // for security). Drop the cookie via /preview?token=... first —
    // same flow a remote owner would do from a fresh device.
    const token = process.env.PREVIEW_BYPASS_TOKEN;
    if (!token) test.skip(true, 'no PREVIEW_BYPASS_TOKEN');
    await page.goto(`/preview?token=${encodeURIComponent(token!)}`, {
      waitUntil: 'domcontentloaded',
    });

    await signInAsSeededUser(page, seed!.users.admin, seed!.password);

    // Hit /preview-as-admin — it should set the cookie + redirect to /
    const res = await page.goto('/preview-as-admin', { waitUntil: 'domcontentloaded' });
    expect(res).not.toBeNull();
    // Final URL after redirect — should be home, not /welcome.
    expect(page.url()).not.toContain('/welcome');

    // Confirm the bypass cookie is now set on the context.
    const cookies = await ctx.cookies();
    const bypass = cookies.find((c) => c.name === 'vp_preview');
    expect(bypass?.value).toBe('ok');

    await ctx.close();
  });

  test('non-staff user is redirected away from /preview-as-admin', async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      extraHTTPHeaders: { 'x-forwarded-for': `10.66.66.${Math.floor(Math.random() * 254)}` },
    });
    const page = await ctx.newPage();

    const token = process.env.PREVIEW_BYPASS_TOKEN;
    if (!token) test.skip(true, 'no PREVIEW_BYPASS_TOKEN');
    await page.goto(`/preview?token=${encodeURIComponent(token!)}`, {
      waitUntil: 'domcontentloaded',
    });
    await signInAsSeededUser(page, seed!.users.free, seed!.password);

    // Hit /preview-as-admin directly. Free user has no staff role, so
    // the route should redirect to /welcome.
    const res = await page.request.get('/preview-as-admin', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toContain('/welcome');

    await ctx.close();
  });
});
