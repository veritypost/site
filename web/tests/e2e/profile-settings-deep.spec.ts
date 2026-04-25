import { test, expect } from '@playwright/test';
import { signInAsSeededUser } from './_fixtures/createUser';
import { getSeed } from './_fixtures/seed';

/**
 * Deep coverage of profile/settings flows. Signed in as the seeded
 * `free` reader (vp-e2e-seed-free@veritypost.test).
 *
 * Strategy mirrors admin-deep: post a valid-shape payload to each
 * route, assert no 5xx. Real mutation behavior (does the password
 * actually change?) is out of scope — these tests catch the
 * regression class where a route exists but blows up on a normal
 * authed call.
 */

const seed = (() => {
  try {
    return getSeed();
  } catch {
    return null;
  }
})();

test.describe('profile-settings-deep — account', () => {
  test.skip(!seed, 'seed data not available');

  test('email-change does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    // Use a fake email; the route should validate + reject with a 4xx,
    // not crash. Real email change requires double-verification.
    const res = await page.request.post('/api/auth/email-change', {
      data: { email: 'vp-e2e-changeprobe@example.test' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('resend-verification does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    const res = await page.request.post('/api/auth/resend-verification', { data: {} });
    expect(res.status()).toBeLessThan(500);
  });

  test('logout does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    const res = await page.request.post('/api/auth/logout', { data: {} });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('profile-settings-deep — preferences', () => {
  test.skip(!seed, 'seed data not available');

  test('GET notification preferences does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    const res = await page.request.get('/api/notifications/preferences');
    expect(res.status()).toBeLessThan(500);
  });

  test('PATCH notification preferences does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    const res = await page.request.patch('/api/notifications/preferences', {
      data: { breaking_news: false, replies: true, mentions: true, weekly_report: false },
    });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('profile-settings-deep — privacy & blocking', () => {
  test.skip(!seed, 'seed data not available');

  test('GET blocked users does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    const res = await page.request.get('/api/users/blocked');
    expect(res.status()).toBeLessThan(500);
  });

  test('block + unblock round-trip does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    const targetId = '00000000-0000-0000-0000-000000000099';
    const blockRes = await page.request.post(`/api/users/${targetId}/block`, { data: {} });
    expect(blockRes.status()).toBeLessThan(500);
    const unblockRes = await page.request.delete(`/api/users/${targetId}/block`);
    expect(unblockRes.status()).toBeLessThan(500);
  });
});

test.describe('profile-settings-deep — data & deletion', () => {
  test.skip(!seed, 'seed data not available');

  test('data-export request does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    const res = await page.request.post('/api/account/data-export', { data: {} });
    expect(res.status()).toBeLessThan(500);
  });

  test('account-delete confirmation gate does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    // Use the wrong confirmation string — the route should reject with
    // a 4xx (confirmation required), NOT actually start a deletion.
    const res = await page.request.post('/api/account/delete', {
      data: { confirmation: 'NOT_THE_RIGHT_STRING' },
    });
    expect(res.status()).toBeLessThan(500);
    // Critical safety: must NOT have scheduled a deletion. 200 here
    // would mean we just nuked the seeded free user.
    expect(res.status()).not.toBe(200);
  });

  test('login-cancel-deletion does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    const res = await page.request.post('/api/account/login-cancel-deletion', { data: {} });
    expect(res.status()).toBeLessThan(500);
  });

  test('onboarding mark-complete does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    const res = await page.request.post('/api/account/onboarding', { data: {} });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('profile-settings-deep — pages render', () => {
  test.skip(!seed, 'seed data not available');

  // Skipping the redirect-stub pages (/profile/settings/{alerts,blocked,
  // data,login-activity,password,profile,emails,feed,supervisor}) — they
  // each render `null` and immediately router.replace() to /profile/
  // settings#<anchor>. They have no body to assert; the parent
  // /profile/settings page is the real surface.
  for (const path of [
    '/profile',
    '/profile/settings',
    '/profile/activity',
    '/profile/milestones',
    '/profile/family',
  ]) {
    test(`${path} renders for authed user`, async ({ page }) => {
      await signInAsSeededUser(page, seed!.users.free, seed!.password);
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');
      expect(page.url()).toContain(path);
      const text = await page.locator('body').innerText();
      // Page must render something — empty body would mean a render
      // crash that the auth-only gate doesn't catch.
      expect(text.length).toBeGreaterThan(20);
    });
  }
});
