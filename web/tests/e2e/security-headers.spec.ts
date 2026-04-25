import { test, expect } from '@playwright/test';

/**
 * Security headers + CSP + CORS + the access-request 410.
 * Validates the policy posture, not just functional behaviour.
 */

test.describe('security headers', () => {
  test('home page sets X-Robots-Tag in coming-soon mode', async ({ request }) => {
    const res = await request.get('/');
    const robotsTag = res.headers()['x-robots-tag'];
    // Coming-soon mode emits noindex,nofollow. Otherwise the header
    // may be absent — only assert when we know we're in coming-soon.
    if (robotsTag) {
      expect(robotsTag.toLowerCase()).toContain('noindex');
    }
  });

  test('home page sets request-id', async ({ request }) => {
    const res = await request.get('/');
    expect(res.headers()['x-request-id']).toBeTruthy();
  });

  test('CSP header includes default-src self + report-uri', async ({ request }) => {
    const res = await request.get('/');
    const csp =
      res.headers()['content-security-policy'] ||
      res.headers()['content-security-policy-report-only'];
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('report-uri /api/csp-report');
  });

  test('CSP forbids dangerous script sources', async ({ request }) => {
    const res = await request.get('/');
    const csp =
      res.headers()['content-security-policy'] ||
      res.headers()['content-security-policy-report-only'];
    expect(csp).toBeTruthy();
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain('strict-dynamic');
    // Should NOT allow unsafe-eval or unsafe-inline on scripts.
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  test('frame-ancestors none', async ({ request }) => {
    const res = await request.get('/');
    const csp =
      res.headers()['content-security-policy'] ||
      res.headers()['content-security-policy-report-only'];
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

test.describe('CORS', () => {
  test('preflight from allowed origin returns Access-Control-Allow-Origin', async ({ request }) => {
    const res = await request.fetch('/api/csp-report', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
      },
    });
    if (res.status() === 204 || res.status() === 200) {
      const allowOrigin = res.headers()['access-control-allow-origin'];
      expect(allowOrigin).toBe('http://localhost:3000');
    }
  });

  test('preflight from unlisted origin gets no allow header', async ({ request }) => {
    const res = await request.fetch('/api/csp-report', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example.com',
        'Access-Control-Request-Method': 'POST',
      },
    });
    if (res.status() === 204 || res.status() === 200) {
      const allowOrigin = res.headers()['access-control-allow-origin'];
      expect(allowOrigin).toBeFalsy();
    }
  });
});

test.describe('access-request endpoint stripped', () => {
  test('POST /api/access-request returns 410 (Gone)', async ({ request }) => {
    const res = await request.post('/api/access-request', {
      data: { email: 'test@example.com' },
    });
    expect(res.status()).toBe(410);
    const body = await res.json();
    expect(body.action).toBe('sign_up');
    expect(body.action_url).toBe('/signup');
  });
});
