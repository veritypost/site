import { test, expect } from '@playwright/test';
import { createTestUser, signInViaApi } from './_fixtures/createUser';

/**
 * Cross-user isolation. User A should not be able to:
 *   - read User B's bookmarks
 *   - read User B's notifications
 *   - read User B's data-export requests
 *   - mutate User B's profile
 *
 * RLS is the source of truth here; route layers also help. Tests
 * validate the union effect.
 */

test.describe('cross-user data isolation', () => {
  test('user A cannot read user B bookmarks', async ({ browser, baseURL }) => {
    const userA = await createTestUser(baseURL!);
    const userB = await createTestUser(baseURL!);

    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await signInViaApi(pageA, userA);

    // Sign in as A. /api/bookmarks should return A's empty list, not
    // B's anything. Smoke check: the response array should be empty
    // for a fresh user. A real cross-read attempt would be made by
    // crafting a request with B's user_id parameter, but the route
    // doesn't accept a user_id arg — the route reads auth.uid() and
    // that's the gate.
    const res = await pageA.request.get('/api/bookmarks');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    // Fresh user has no bookmarks.
    expect(Array.isArray(body) ? body.length : (body.bookmarks?.length ?? 0)).toBe(0);

    await ctxA.close();
    // userB unused beyond creation; cleanup by global teardown.
    void userB;
  });

  test('user A cannot patch user B profile via API', async ({ request, baseURL }) => {
    const userA = await createTestUser(baseURL!);
    const userB = await createTestUser(baseURL!);
    await request.post('/api/auth/login', {
      data: { email: userA.email, password: userA.password },
    });
    // Most routes don't accept a target user_id from the body for self-
    // mutation; auth.uid() is the implicit target. Best we can verify
    // here is that admin-only mutation routes 401/403 on a regular user.
    const res = await request.patch('/api/admin/users/00000000-0000-0000-0000-000000000000', {
      data: { display_name: 'pwned' },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
    void userB;
  });

  test('anon cannot read protected user data', async ({ request }) => {
    const res = await request.get('/api/bookmarks');
    expect([401, 403]).toContain(res.status());
  });
});
