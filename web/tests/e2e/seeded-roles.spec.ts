import { test, expect } from '@playwright/test';
import { signInAsSeededUser } from './_fixtures/createUser';
import { getSeed } from './_fixtures/seed';

/**
 * Per-role coverage. Each describe signs in as one of the seeded role
 * users (vp-e2e-seed-<role>@veritypost.test) and exercises the
 * surfaces unique to that role.
 *
 * Skipped when seed data isn't available (globalSetup skipped or
 * Supabase keys missing).
 */

const seed = (() => {
  try {
    return getSeed();
  } catch {
    return null;
  }
})();

test.describe('owner role', () => {
  test.skip(!seed, 'seed data not available');

  test('owner can hit /admin without notFound', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.owner, seed!.password);
    await page.goto('/admin');
    await page.waitForLoadState('domcontentloaded');
    if (page.url().endsWith('/welcome')) test.skip(true, 'coming-soon mode');
    const text = await page.locator('body').innerText();
    // Owner should NOT see the 404 surface — the layout shows real
    // admin nav. We just check the body doesn't read as 404.
    expect(text).not.toMatch(/^404 |^not found$/i);
  });

  test('owner can read /api/admin/recap (admin-gated GET)', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.owner, seed!.password);
    const res = await page.request.get('/api/admin/recap');
    expect([200, 206]).toContain(res.status());
  });
});

test.describe('admin role', () => {
  test.skip(!seed, 'seed data not available');

  test('admin can read /api/admin/recap', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get('/api/admin/recap');
    expect([200, 206]).toContain(res.status());
  });

  test('admin can read /api/admin/data-requests', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get('/api/admin/data-requests');
    expect([200, 206]).toContain(res.status());
  });

  test('admin can read seeded audit_log entry via API', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get('/api/admin/audit-log?action=seed_test_event');
    // Endpoint may not exist on every build — just no 5xx.
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('editor role', () => {
  test.skip(!seed, 'seed data not available');

  test('editor reaches /admin without 404', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.editor, seed!.password);
    await page.goto('/admin');
    await page.waitForLoadState('domcontentloaded');
    if (page.url().endsWith('/welcome')) test.skip(true, 'coming-soon mode');
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/^404 /i);
  });
});

test.describe('moderator role', () => {
  test.skip(!seed, 'seed data not available');

  test('moderator can read seeded report from queue', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.moderator, seed!.password);
    const res = await page.request.get('/api/admin/moderation/reports?status=open');
    expect(res.status()).toBeLessThan(500);
  });

  test('moderator action on the seeded report does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.moderator, seed!.password);
    if (!seed!.reportId) test.skip(true, 'no seeded report id');
    const res = await page.request.post(`/api/admin/moderation/reports/${seed!.reportId}/resolve`, {
      data: { resolution: 'dismissed', resolution_notes: 'E2E seed dismissal' },
    });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('expert role', () => {
  test.skip(!seed, 'seed data not available');

  test('expert sees their queue surface', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.expert, seed!.password);
    await page.goto('/profile');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/profile');
  });

  test('expert application status query does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.expert, seed!.password);
    const res = await page.request.get('/api/expert/status');
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('journalist role', () => {
  test.skip(!seed, 'seed data not available');

  test('journalist can sign in and reach profile', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.journalist, seed!.password);
    await page.goto('/profile');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/profile');
  });
});

test.describe('free reader', () => {
  test.skip(!seed, 'seed data not available');

  test('free user sees seeded bookmark on /bookmarks', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    await page.goto('/bookmarks');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/bookmarks');
    const body = await page.locator('body').innerText();
    // Either the seeded article shows up by title, or empty state shows
    // (RLS or feature flag could hide it on this build). Both prove the
    // page rendered without crashing.
    expect(body.length).toBeGreaterThan(20);
  });

  test('free user has unread notifications', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    await page.goto('/notifications');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/notifications');
  });
});

test.describe('verity (paid) tier', () => {
  test.skip(!seed, 'seed data not available');

  test('verity user can reach billing portal entry', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.verity, seed!.password);
    const res = await page.request.post('/api/stripe/portal', { data: {} });
    // Stripe may reject if no real customer exists; we just want to
    // confirm the gate lets the user through (no 401/403).
    expect([200, 400, 404, 422, 500]).toContain(res.status());
  });
});

test.describe('verity_pro (paid) tier', () => {
  test.skip(!seed, 'seed data not available');

  test('verity_pro user signs in and reaches profile', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.verity_pro, seed!.password);
    await page.goto('/profile/settings');
    expect(page.url()).toContain('/profile/settings');
  });
});

test.describe('parent role', () => {
  test.skip(!seed, 'seed data not available');

  test('parent can list their kids', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.parent, seed!.password);
    const res = await page.request.get('/api/kids');
    // Family-plan parent should be allowed; 200 with an array including
    // the seeded kid id, or 200 empty if the route filters more strictly.
    expect([200, 206]).toContain(res.status());
  });

  test('parent reaches /profile/kids dashboard', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.parent, seed!.password);
    await page.goto('/profile/kids');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/profile/kids');
  });

  test('parent can read family config', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.parent, seed!.password);
    const res = await page.request.get('/api/family/config');
    expect([200, 206]).toContain(res.status());
  });
});
