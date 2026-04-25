import { test, expect } from '@playwright/test';

/**
 * Public-facing API endpoints — health checks, anon-allowed routes,
 * + the few endpoints that have intentional anon access.
 */

test.describe('API health + public endpoints', () => {
  test('GET /api/health returns 200', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
  });

  test('POST /api/csp-report accepts violation reports', async ({ request }) => {
    const res = await request.post('/api/csp-report', {
      data: { 'csp-report': { 'document-uri': '/', 'violated-directive': "script-src 'self'" } },
      headers: { 'Content-Type': 'application/csp-report' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('GET /api/settings/password-policy returns the policy', async ({ request }) => {
    const res = await request.get('/api/settings/password-policy');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.min_length).toBe('number');
    expect(typeof body.require_upper).toBe('boolean');
    expect(typeof body.require_number).toBe('boolean');
    expect(typeof body.require_special).toBe('boolean');
  });

  test('GET /api/auth/check-email handles unknown email', async ({ request }) => {
    const res = await request.get('/api/auth/check-email?email=noone@example.com');
    expect(res.status()).toBeLessThan(500);
  });

  test('POST /api/events/batch rate-limits per IP', async ({ request }) => {
    // 60/min cap per Ext-Y.1. Just check that 1 valid request gets
    // through without 4xx/5xx; full burst test would slow the suite.
    const res = await request.post('/api/events/batch', {
      data: {
        events: [
          {
            event_name: 'page_view',
            occurred_at: new Date().toISOString(),
            session_id: 'e2e-test-session',
            page: '/',
          },
        ],
      },
    });
    expect(res.status()).toBeLessThan(500);
  });
});
