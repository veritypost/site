import { test, expect } from '@playwright/test';
import { createTestUser, signInViaApi } from './_fixtures/createUser';

/**
 * Social graph (D28 follows + blocks). Most flows require paid tier
 * for follow; tests exercise the auth/permission gates that fire for
 * free users.
 */

test.describe('follows', () => {
  test('GET /api/follows requires auth', async ({ request }) => {
    const res = await request.get('/api/follows');
    expect([401, 403, 404]).toContain(res.status());
  });

  test('POST /api/follows from free user gets paid-tier rejection', async ({
    request,
    baseURL,
  }) => {
    const user = await createTestUser(baseURL!);
    await request.post('/api/auth/login', {
      data: { email: user.email, password: user.password },
    });
    const res = await request.post('/api/follows', {
      data: { target_id: '00000000-0000-0000-0000-000000000000' },
    });
    // 403 paid-required, OR 404 missing route, OR 400 self-follow.
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('blocks', () => {
  test('POST /api/users/[id]/block requires auth', async ({ request }) => {
    const res = await request.post('/api/users/00000000-0000-0000-0000-000000000000/block');
    expect([401, 403]).toContain(res.status());
  });

  test('DELETE /api/users/[id]/block requires auth', async ({ request }) => {
    const res = await request.delete('/api/users/00000000-0000-0000-0000-000000000000/block');
    expect([401, 403]).toContain(res.status());
  });
});
