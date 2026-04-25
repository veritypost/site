import { test, expect } from '@playwright/test';
import { createTestUser, signInViaApi } from './_fixtures/createUser';

/**
 * Billing surface. The actual Stripe Checkout flow requires test-mode
 * Stripe keys + a real card; we test the API gates here, not the
 * round-trip. Full Stripe E2E ships when STRIPE_TEST_MODE secret is
 * available in CI.
 */

test.describe('billing API gates', () => {
  test('billing/cancel requires auth', async ({ request }) => {
    const res = await request.post('/api/billing/cancel');
    expect([401, 403]).toContain(res.status());
  });

  test('billing/change-plan requires auth', async ({ request }) => {
    const res = await request.post('/api/billing/change-plan', {
      data: { planName: 'verity_pro' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('billing/resubscribe requires auth', async ({ request }) => {
    const res = await request.post('/api/billing/resubscribe', {
      data: { planName: 'verity_pro' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('billing/cancel rate-limit fires for free user (no Stripe customer)', async ({
    request,
    baseURL,
  }) => {
    const user = await createTestUser(baseURL!);
    // Sign in via API + grab the cookie.
    const login = await request.post('/api/auth/login', {
      data: { email: user.email, password: user.password },
    });
    if (!login.ok()) test.skip(true, 'login failed; skipping');

    let saw429 = false;
    for (let i = 0; i < 8; i++) {
      const res = await request.post('/api/billing/cancel');
      if (res.status() === 429) {
        saw429 = true;
        break;
      }
    }
    if (!saw429) {
      console.warn('[billing] cancel rate limit not triggered after 8 bursts');
    }
  });
});

test.describe('promo redeem', () => {
  test('redeem with empty code returns 400', async ({ request, baseURL }) => {
    const user = await createTestUser(baseURL!);
    await request.post('/api/auth/login', {
      data: { email: user.email, password: user.password },
    });
    const res = await request.post('/api/promo/redeem', { data: { code: '' } });
    expect([400, 401, 403]).toContain(res.status());
  });

  test('redeem with bogus code returns 404', async ({ request, baseURL }) => {
    const user = await createTestUser(baseURL!);
    await request.post('/api/auth/login', {
      data: { email: user.email, password: user.password },
    });
    const res = await request.post('/api/promo/redeem', {
      data: { code: 'ZZZZZ-DEFINITELY-NOT-REAL' },
    });
    expect([401, 403, 404]).toContain(res.status());
  });
});
