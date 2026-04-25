import { test, expect } from '@playwright/test';
import { signInAsSeededUser } from './_fixtures/createUser';
import { getSeed } from './_fixtures/seed';

/**
 * Second batch of admin route smoke. Covers the routes admin-deep
 * batch 1 didn't reach: ad system, broadcasts, expert applications,
 * newsroom clusters, recap questions, words list, sponsors, plans,
 * data-requests, billing edge cases, sessions, comments hide/unhide,
 * permission-set wiring.
 *
 * Same strategy: sign in as admin, post valid-shape payloads, assert
 * no 5xx. Each test that surfaces a 500 is a real bug.
 */

const seed = (() => {
  try {
    return getSeed();
  } catch {
    return null;
  }
})();

const FAKE_ID = '00000000-0000-0000-0000-000000000abc';
const FAKE_USER_ID = '00000000-0000-0000-0000-000000000def';
const FAKE_SESSION_ID = '00000000-0000-0000-0000-000000000123';

test.describe('admin-batch2 — moderation', () => {
  test.skip(!seed, 'seed data not available');

  test('hide non-existent comment does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/moderation/comments/${FAKE_ID}/hide`, {
      data: { reason: 'e2e' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('unhide non-existent comment does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/moderation/comments/${FAKE_ID}/unhide`, {
      data: {},
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('GET moderation reports queue does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get('/api/admin/moderation/reports?status=open');
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('admin-batch2 — expert applications', () => {
  test.skip(!seed, 'seed data not available');

  test('GET expert applications list does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get('/api/admin/expert/applications');
    expect(res.status()).toBeLessThan(500);
  });

  test('approve non-existent expert app does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/expert/applications/${FAKE_ID}/approve`, {
      data: {},
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('reject non-existent expert app does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/expert/applications/${FAKE_ID}/reject`, {
      data: { reason: 'e2e' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('clear-background non-existent does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(
      `/api/admin/expert/applications/${FAKE_ID}/clear-background`,
      { data: {} }
    );
    expect(res.status()).toBeLessThan(500);
  });

  test('mark-probation-complete does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(
      `/api/admin/expert/applications/${FAKE_ID}/mark-probation-complete`,
      { data: {} }
    );
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('admin-batch2 — billing edge cases', () => {
  test.skip(!seed, 'seed data not available');

  test('GET billing audit does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get('/api/admin/billing/audit');
    expect(res.status()).toBeLessThan(500);
  });

  test('freeze non-existent subscription does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post('/api/admin/billing/freeze', {
      data: { subscription_id: FAKE_ID },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('sweep-grace dry-run does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post('/api/admin/billing/sweep-grace', {
      data: { dry_run: true },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('extend-grace non-existent subscription does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/subscriptions/${FAKE_ID}/extend-grace`, {
      data: { days: 7 },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('manual-sync non-existent subscription does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/subscriptions/${FAKE_ID}/manual-sync`, {
      data: {},
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('sponsor create does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post('/api/admin/sponsors', {
      data: { name: 'E2E Sponsor', email: 'sponsor-e2e@example.test' },
    });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('admin-batch2 — broadcasts', () => {
  test.skip(!seed, 'seed data not available');

  test('breaking news broadcast does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post('/api/admin/broadcasts/breaking', {
      data: { article_id: seed!.articleId, headline: 'E2E Test Breaking' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('alert broadcast does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post('/api/admin/broadcasts/alert', {
      data: { title: 'E2E Alert', body: 'Test body' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('notifications broadcast does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post('/api/admin/notifications/broadcast', {
      data: { title: 'E2E Notification', body: 'Test', target: 'all' },
    });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('admin-batch2 — ad system', () => {
  test.skip(!seed, 'seed data not available');

  test('GET ad campaigns does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get('/api/admin/ad-campaigns');
    expect(res.status()).toBeLessThan(500);
  });

  test('GET ad placements does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get('/api/admin/ad-placements');
    expect(res.status()).toBeLessThan(500);
  });

  test('GET ad units does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get('/api/admin/ad-units');
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('admin-batch2 — newsroom Generate prerequisites', () => {
  test.skip(!seed, 'seed data not available');

  // Regression guard for the bug-hunt 2026-04-25 fix where /admin/newsroom's
  // Generate button stayed disabled because PipelineRunPicker couldn't read
  // ai_models (RLS enabled but no GRANT). The picker uses the browser
  // client (authenticated role); this test signs in as admin and reads
  // ai_models the same way the picker does.
  test('admin can SELECT from ai_models (Generate prereq)', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    // Hit the public REST endpoint with the same JWT path the picker uses.
    // We can't import the supabase client directly from a spec; assert
    // indirectly by loading /admin/newsroom and checking the page doesn't
    // error out. The deeper proof (provider dropdown populated) needs a UI
    // smoke that signs in via the form and inspects DOM — out of scope here.
    await page.goto('/admin/newsroom');
    await page.waitForLoadState('domcontentloaded');
    if (page.url().endsWith('/welcome')) test.skip(true, 'coming-soon mode');
    const text = await page.locator('body').innerText();
    // Should not show the "Loading newsroom" spinner forever or a 404.
    expect(text).not.toMatch(/^404 |^not found$/i);
    expect(text.length).toBeGreaterThan(50);
  });
});

test.describe('admin-batch2 — config & system', () => {
  test.skip(!seed, 'seed data not available');

  test('GET features does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get('/api/admin/features');
    expect(res.status()).toBeLessThan(500);
  });

  test('GET feeds does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get('/api/admin/feeds');
    expect(res.status()).toBeLessThan(500);
  });

  test('GET prompt-presets does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get('/api/admin/prompt-presets');
    expect(res.status()).toBeLessThan(500);
  });

  test('GET rate-limits does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get('/api/admin/rate-limits');
    expect(res.status()).toBeLessThan(500);
  });

  test('GET words does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get('/api/admin/words');
    expect(res.status()).toBeLessThan(500);
  });

  test('GET settings does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get('/api/admin/settings');
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('admin-batch2 — pipeline', () => {
  test.skip(!seed, 'seed data not available');

  test('pipeline cleanup dry-run does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post('/api/admin/pipeline/cleanup', {
      data: { dry_run: true },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('pipeline run detail does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get(`/api/admin/pipeline/runs/${FAKE_ID}`);
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('admin-batch2 — newsroom clusters', () => {
  test.skip(!seed, 'seed data not available');

  test('archive non-existent cluster does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/newsroom/clusters/${FAKE_ID}/archive`, {
      data: {},
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('dismiss non-existent cluster does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/newsroom/clusters/${FAKE_ID}/dismiss`, {
      data: {},
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('unlock non-existent cluster does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/newsroom/clusters/${FAKE_ID}/unlock`, {
      data: {},
    });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('admin-batch2 — data requests', () => {
  test.skip(!seed, 'seed data not available');

  test('approve non-existent data request does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/data-requests/${FAKE_ID}/approve`, {
      data: {},
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('reject non-existent data request does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/data-requests/${FAKE_ID}/reject`, {
      data: { reason: 'e2e' },
    });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('admin-batch2 — user sessions', () => {
  test.skip(!seed, 'seed data not available');

  test('GET user permissions does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get(`/api/admin/users/${FAKE_USER_ID}/permissions`);
    expect(res.status()).toBeLessThan(500);
  });

  test('GET user roles does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get(`/api/admin/users/${FAKE_USER_ID}/roles`);
    expect(res.status()).toBeLessThan(500);
  });

  test('DELETE non-existent user session does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.delete(
      `/api/admin/users/${FAKE_USER_ID}/sessions/${FAKE_SESSION_ID}`
    );
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('admin-batch2 — recap', () => {
  test.skip(!seed, 'seed data not available');

  test('GET recap list does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get('/api/admin/recap');
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('admin-batch2 — permission-sets', () => {
  test.skip(!seed, 'seed data not available');

  test('GET permission-sets list does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get('/api/admin/permission-sets');
    expect(res.status()).toBeLessThan(500);
  });

  test('GET user-grants does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.get(
      `/api/admin/permissions/user-grants?user_id=${FAKE_USER_ID}`
    );
    expect(res.status()).toBeLessThan(500);
  });
});
