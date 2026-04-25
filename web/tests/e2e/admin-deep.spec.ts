import { test, expect } from '@playwright/test';
import { signInAsSeededUser } from './_fixtures/createUser';
import { getSeed } from './_fixtures/seed';

/**
 * Deep coverage of the highest-risk admin mutation routes. Signed in
 * as the seeded admin user (vp-e2e-seed-admin@veritypost.test).
 *
 * Strategy: each test posts a valid-shape payload to the route. We
 * assert no 5xx — any 4xx is acceptable because that means the route
 * (a) is reachable, (b) auth-gated, (c) permission-gated, and (d)
 * validates its input. A 5xx is the regression class we care about
 * (route exists but blows up on a normal admin call).
 *
 * Limited mutation scope: most tests hit fake target IDs to avoid
 * mutating the seeded database. The few that target real seeded rows
 * are clearly marked.
 */

const seed = (() => {
  try {
    return getSeed();
  } catch {
    return null;
  }
})();

const FAKE_USER_ID = '00000000-0000-0000-0000-000000000000';
const FAKE_ARTICLE_ID = '00000000-0000-0000-0000-000000000001';
const FAKE_REPORT_ID = '00000000-0000-0000-0000-000000000002';
const FAKE_RUN_ID = '00000000-0000-0000-0000-000000000003';
const FAKE_APPEAL_ID = '00000000-0000-0000-0000-000000000004';
const FAKE_FEATURE_ID = '00000000-0000-0000-0000-000000000005';
const FAKE_PROMO_ID = '00000000-0000-0000-0000-000000000006';
const FAKE_CATEGORY_ID = '00000000-0000-0000-0000-000000000007';
const FAKE_SUB_ID = '00000000-0000-0000-0000-000000000008';

test.describe('admin-deep — user mutations', () => {
  test.skip(!seed, 'seed data not available');

  test('mark-read does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/users/${FAKE_USER_ID}/mark-read`, {
      data: { article_slug: 'nonexistent' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('mark-quiz does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/users/${FAKE_USER_ID}/mark-quiz`, {
      data: { article_slug: 'nonexistent', score: 5 },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('award achievement does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/users/${FAKE_USER_ID}/achievements`, {
      data: { achievement_name: 'nonexistent_achievement' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('ban toggle does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/users/${FAKE_USER_ID}/ban`, {
      data: { banned: false, reason: 'e2e-test' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('data-export does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/users/${FAKE_USER_ID}/data-export`, {
      data: {},
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('plan change does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.patch(`/api/admin/users/${FAKE_USER_ID}/plan`, {
      data: { plan_name: 'verity_pro' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('role-set does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.patch(`/api/admin/users/${FAKE_USER_ID}/role-set`, {
      data: { role_name: 'editor' },
    });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('admin-deep — moderation', () => {
  test.skip(!seed, 'seed data not available');

  test('penalty (warn) does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/moderation/users/${FAKE_USER_ID}/penalty`, {
      data: { level: 1, reason: 'e2e-test' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('penalty (mute) does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/moderation/users/${FAKE_USER_ID}/penalty`, {
      data: { level: 2, reason: 'e2e-test' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('penalty (ban) does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/moderation/users/${FAKE_USER_ID}/penalty`, {
      data: { level: 4, reason: 'e2e-test' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('appeal resolve does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/appeals/${FAKE_APPEAL_ID}/resolve`, {
      data: { outcome: 'denied', notes: 'e2e-test' },
    });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('admin-deep — content', () => {
  test.skip(!seed, 'seed data not available');

  test('article patch does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.patch(`/api/admin/articles/${FAKE_ARTICLE_ID}`, {
      data: { status: 'draft' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('category create does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/categories`, {
      data: { name: 'E2E Test Category', slug: 'vp-e2e-cat-test', is_kids_safe: false },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('category update does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.patch(`/api/admin/categories/${FAKE_CATEGORY_ID}`, {
      data: { is_active: true },
    });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('admin-deep — config', () => {
  test.skip(!seed, 'seed data not available');

  test('feature flag toggle does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.patch(`/api/admin/features/${FAKE_FEATURE_ID}`, {
      data: { is_enabled: false },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('settings upsert does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.patch(`/api/admin/settings/upsert`, {
      data: { key: 'vp_e2e_throwaway', value: 'noop' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('settings cache invalidate does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/settings/invalidate`, {
      data: {},
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('permission create does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/permissions`, {
      data: { key: 'vp.e2e.test', display_name: 'E2E Test Perm', category: 'system' },
    });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('admin-deep — billing', () => {
  test.skip(!seed, 'seed data not available');

  test('promo create does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    // Randomized code so re-runs don't trip the unique constraint and
    // accumulate orphaned promos in the DB. The route's 23505 → 409
    // mapping is verified by the next test.
    const code = `VP_E2E_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const res = await page.request.post(`/api/admin/promo`, {
      data: { code, discount_type: 'percent', discount_value: 10, max_uses: 0 },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('promo create returns 409 on duplicate code', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const code = `VP_E2E_DUP_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const first = await page.request.post(`/api/admin/promo`, {
      data: { code, discount_type: 'percent', discount_value: 10, max_uses: 0 },
    });
    expect(first.status()).toBeLessThan(500);
    // Second insert with the same code should be a clean 409 now (the
    // route maps Postgres 23505 to 409 instead of bubbling a 500).
    const second = await page.request.post(`/api/admin/promo`, {
      data: { code, discount_type: 'percent', discount_value: 10, max_uses: 0 },
    });
    expect(second.status()).toBe(409);
  });

  test('refund decision does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/billing/refund-decision`, {
      data: { subscription_id: FAKE_SUB_ID, outcome: 'denied', amount_cents: 0 },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('subscription cancel does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/billing/cancel`, {
      data: { subscription_id: FAKE_SUB_ID },
    });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('admin-deep — pipeline', () => {
  test.skip(!seed, 'seed data not available');

  test('pipeline retry does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/pipeline/runs/${FAKE_RUN_ID}/retry`, {
      data: {},
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('pipeline cancel does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.admin, seed!.password);
    const res = await page.request.post(`/api/admin/pipeline/runs/${FAKE_RUN_ID}/cancel`, {
      data: {},
    });
    expect(res.status()).toBeLessThan(500);
  });
});
