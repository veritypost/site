import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Verity Post web E2E.
 *
 * Defaults are dev-friendly:
 *   - baseURL = E2E_BASE_URL (default http://localhost:3000)
 *   - reuses an already-running dev server when present; spawns one
 *     when none is detected (handy for CI)
 *   - chromium only (the only engine we care about for now; Safari +
 *     Firefox can be added once the surface stabilises)
 *   - headless by default; flip via PWDEBUG=1 or `npm run test:e2e:headed`
 *   - trace + screenshot on first retry so flake is debuggable
 *
 * If the site is in coming-soon mode, set PREVIEW_BYPASS_TOKEN in
 * web/.env.local AND in the test environment, then point baseURL at the
 * /preview route to drop the bypass cookie before any spec runs.
 *
 * Auth strategy: every spec creates its own throwaway user via the
 * helpers in tests/e2e/_fixtures/createUser.ts. Per-test isolation
 * means a flaky test can't poison the next one's state.
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalTeardown: require.resolve('./tests/e2e/_fixtures/cleanup'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Mirror the user's locale + timezone so date/time formatting in
    // tests matches what a real user sees.
    locale: 'en-US',
    timezoneId: 'America/New_York',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Mobile viewport project — handy because the home/reader/comments
    // surfaces are responsive and break differently at narrow widths.
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] },
    },
  ],

  // Auto-spawn `next dev` if no server is reachable. Reuses a server
  // already running on localhost:3000 (the common dev workflow).
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
