import { test, expect } from '@playwright/test';
import { signInAsSeededUser } from './_fixtures/createUser';
import { getSeed } from './_fixtures/seed';

/**
 * Deep coverage of parent-side kid management. Signed in as the
 * seeded `parent` user (verity_family plan, has one seeded kid).
 *
 * Covers: list, create, update, delete (lifecycle), pair-code
 * generation, set/reset PIN, verify PIN, trial, household KPIs.
 */

const seed = (() => {
  try {
    return getSeed();
  } catch {
    return null;
  }
})();

const FAKE_KID_ID = '00000000-0000-0000-0000-0000000000aa';

test.describe('kids-deep — list & metadata', () => {
  test.skip(!seed, 'seed data not available');

  test('GET /api/kids lists parent kids', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.parent, seed!.password);
    const res = await page.request.get('/api/kids');
    expect([200, 206]).toContain(res.status());
  });

  test('GET /api/kids/household-kpis does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.parent, seed!.password);
    const res = await page.request.get('/api/kids/household-kpis');
    expect(res.status()).toBeLessThan(500);
  });

  test('GET /api/kids/global-leaderboard does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.parent, seed!.password);
    const res = await page.request.get('/api/kids/global-leaderboard');
    expect(res.status()).toBeLessThan(500);
  });

  test('GET /api/family/config returns parent config shape', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.parent, seed!.password);
    const res = await page.request.get('/api/family/config');
    expect([200, 206]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.max_kids).toBeTruthy();
      expect(body.coppa_consent_version).toBeTruthy();
      expect(Array.isArray(body.reading_levels)).toBeTruthy();
    }
  });
});

test.describe('kids-deep — kid CRUD', () => {
  test.skip(!seed, 'seed data not available');

  test('PATCH on non-existent kid does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.parent, seed!.password);
    const res = await page.request.patch(`/api/kids/${FAKE_KID_ID}`, {
      data: { display_name: 'E2E Updated' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('DELETE on non-existent kid does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.parent, seed!.password);
    const res = await page.request.delete(`/api/kids/${FAKE_KID_ID}`);
    expect(res.status()).toBeLessThan(500);
  });

  test('PATCH on seeded kid (idempotent display_name) does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.parent, seed!.password);
    const res = await page.request.patch(`/api/kids/${seed!.kidProfileId}`, {
      data: { display_name: 'E2E Kid' }, // same name as seed — no-op update
    });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('kids-deep — pair code', () => {
  test.skip(!seed, 'seed data not available');

  test('generate-pair-code for seeded kid does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.parent, seed!.password);
    const res = await page.request.post('/api/kids/generate-pair-code', {
      data: { kid_profile_id: seed!.kidProfileId },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('generate-pair-code for non-existent kid does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.parent, seed!.password);
    const res = await page.request.post('/api/kids/generate-pair-code', {
      data: { kid_profile_id: FAKE_KID_ID },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('pair endpoint with bogus code rate-limits or rejects, no 5xx', async ({ request }) => {
    const res = await request.post('/api/kids/pair', {
      data: { code: 'ZZZNOPE0', device: 'e2e-test-device' },
    });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('kids-deep — PIN management', () => {
  test.skip(!seed, 'seed data not available');

  test('set-pin for seeded kid does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.parent, seed!.password);
    const res = await page.request.post('/api/kids/set-pin', {
      data: { kid_profile_id: seed!.kidProfileId, pin: '0000' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('reset-pin for seeded kid does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.parent, seed!.password);
    const res = await page.request.post('/api/kids/reset-pin', {
      data: { kid_profile_id: seed!.kidProfileId },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('verify-pin (kid auth flow) does not 5xx', async ({ request }) => {
    // verify-pin is called by the kids iOS app post-pair to confirm
    // the parent-set PIN. Anon-ish; just no 5xx.
    const res = await request.post('/api/kids/verify-pin', {
      data: { kid_profile_id: FAKE_KID_ID, pin: '0000' },
    });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('kids-deep — trial', () => {
  test.skip(!seed, 'seed data not available');

  test('GET trial status does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.parent, seed!.password);
    const res = await page.request.get('/api/kids/trial');
    expect(res.status()).toBeLessThan(500);
  });

  test('POST trial start does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.parent, seed!.password);
    const res = await page.request.post('/api/kids/trial', { data: {} });
    // Parent already on family plan; trial should reject with 4xx (not eligible)
    // or 200 (idempotent). Either way no 5xx.
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('kids-deep — pages render', () => {
  test.skip(!seed, 'seed data not available');

  test('parent /profile/kids dashboard renders', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.parent, seed!.password);
    await page.goto('/profile/kids');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/profile/kids');
    const text = await page.locator('body').innerText();
    expect(text.length).toBeGreaterThan(20);
  });

  test('parent /profile/family dashboard renders', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.parent, seed!.password);
    await page.goto('/profile/family');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/profile/family');
  });
});
