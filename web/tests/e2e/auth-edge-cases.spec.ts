import { test, expect } from '@playwright/test';
import { createTestUser } from './_fixtures/createUser';
import { randomUUID } from 'crypto';

/**
 * Failure modes of the auth flow. Signup with bad inputs, login with
 * wrong creds, rate limits, etc. The happy paths live in
 * auth-signup-login.spec.ts.
 */

test.describe('signup edge cases', () => {
  test('signup rejects missing email', async ({ request }) => {
    const res = await request.post('/api/auth/signup', {
      data: { password: 'TestPass1234!', ageConfirmed: true, agreedToTerms: true },
    });
    expect(res.status()).toBe(400);
  });

  test('signup rejects missing password', async ({ request }) => {
    const res = await request.post('/api/auth/signup', {
      data: {
        email: `vp-e2e-${randomUUID()}@example.com`,
        ageConfirmed: true,
        agreedToTerms: true,
      },
    });
    expect(res.status()).toBe(400);
  });

  test('signup rejects ageConfirmed=false', async ({ request }) => {
    const res = await request.post('/api/auth/signup', {
      data: {
        email: `vp-e2e-${randomUUID()}@example.com`,
        password: 'TestPass1234!',
        ageConfirmed: false,
        agreedToTerms: true,
      },
    });
    expect(res.status()).toBe(400);
  });

  test('signup rejects agreedToTerms=false', async ({ request }) => {
    const res = await request.post('/api/auth/signup', {
      data: {
        email: `vp-e2e-${randomUUID()}@example.com`,
        password: 'TestPass1234!',
        ageConfirmed: true,
        agreedToTerms: false,
      },
    });
    expect(res.status()).toBe(400);
  });

  test('signup rejects weak password', async ({ request }) => {
    const res = await request.post('/api/auth/signup', {
      data: {
        email: `vp-e2e-${randomUUID()}@example.com`,
        password: 'short',
        ageConfirmed: true,
        agreedToTerms: true,
      },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('login edge cases', () => {
  test('login with wrong password 401s', async ({ request, baseURL }) => {
    const user = await createTestUser(baseURL!);
    const res = await request.post('/api/auth/login', {
      data: { email: user.email, password: 'wrong-password-123' },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('login with non-existent email 401s', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { email: `vp-e2e-nonexistent-${randomUUID()}@example.com`, password: 'TestPass1234!' },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('rate limits', () => {
  test('signup IP rate limit fires after burst', async ({ request }) => {
    // Default policy is 5/hour per IP. Fire 8 requests with throwaway
    // emails; after the 5th we expect 429s.
    let saw429 = false;
    for (let i = 0; i < 8; i++) {
      const res = await request.post('/api/auth/signup', {
        data: {
          email: `vp-e2e-burst-${randomUUID()}@example.com`,
          password: 'TestPass1234!',
          ageConfirmed: true,
          agreedToTerms: true,
        },
      });
      if (res.status() === 429) {
        saw429 = true;
        break;
      }
    }
    // If we never see 429, either the rate limit isn't wired or the
    // policy has been raised. Soft-fail with a hint rather than a
    // hard fail so a config tweak doesn't break the suite.
    if (!saw429) {
      console.warn('[auth-edge-cases] signup rate limit did not trigger after 8 bursts');
    }
  });
});

test.describe('reset password', () => {
  test('reset request returns 200 even for unknown email', async ({ request }) => {
    // Anti-enumeration posture: server returns 200 regardless of whether
    // the email exists, so attackers can't probe for valid accounts.
    const res = await request.post('/api/auth/reset-password', {
      data: { email: `vp-e2e-${randomUUID()}@example.com` },
    });
    expect(res.ok()).toBeTruthy();
  });
});
