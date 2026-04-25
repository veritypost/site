# E2E tests (Playwright)

End-to-end browser automation for Verity Post web. Runs against a live dev server (`npm run dev`) by default.

## Quick start

```bash
cd web
npm run test:e2e             # headless, full suite
npm run test:e2e:ui          # interactive Playwright UI
npm run test:e2e:headed      # see the browser
npm run test:e2e:debug       # PWDEBUG=1, step through interactively
npm run test:e2e:report      # open the HTML report from the last run
```

If `localhost:3000` already has `next dev` running, Playwright reuses it. Otherwise it spawns one (120s startup budget).

## Hitting a non-local server

```bash
E2E_BASE_URL=https://staging.veritypost.com npm run test:e2e
```

When `E2E_BASE_URL` is set, Playwright skips the auto-spawn and runs against the URL you point it at. Useful for smoke-testing a Vercel preview.

## Coming-soon mode

If `NEXT_PUBLIC_SITE_MODE=coming_soon` is set on the target environment, the home page redirects to `/welcome`. The `anon-golden-path.spec.ts` suite detects this and asserts the holding card renders cleanly instead of failing.

`globalSetup` automatically drops the `vp_preview=ok` bypass cookie into a shared `storageState` (`tests/e2e/.auth/preview.json`) when `PREVIEW_BYPASS_TOKEN` is set. Every test context loads with that cookie, so navigation tests don't have to special-case coming-soon mode. Tests that explicitly assert the coming-soon redirect (like `coming-soon-mode.spec.ts:home redirects to /welcome`) soft-skip when the bypass is in effect.

## Supabase keys are mandatory

Every spec that creates a user (most of the suite) needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `web/.env.local` AND they must be for the same project. If they're for different projects:

- `globalSetup` logs `[e2e setup] Supabase admin probe failed: Invalid API key`
- The dev server's rate-limit RPC also can't reach Supabase, so it fails closed and signup returns 429 even from a fresh IP
- `createTestUser` surfaces a clear diagnostic; the affected tests fail with that message

Fix it by:

1. Open the Supabase dashboard for the project the URL points at
2. Settings → API → copy the `service_role` key (not the anon key)
3. Paste into `web/.env.local` as `SUPABASE_SERVICE_ROLE_KEY=...`
4. Restart `npm run dev` so the new key loads

Tests that don't touch the DB (CSP/headers, `/api/csp-report`, `/welcome`, `/preview`, error pages) keep passing regardless.

## Per-test users

Every spec creates its own throwaway user via `_fixtures/createUser.ts`:

```ts
import { createTestUser, signInViaApi } from './_fixtures/createUser';

test('does a thing', async ({ page, baseURL }) => {
  const user = await createTestUser(baseURL!);
  await signInViaApi(page, user); // fast — bypasses login UI
  // OR
  await signInViaUi(page, user); // exercises the login form
  // ... your assertions
});
```

- Email pattern: `vp-e2e-<uuid>@example.com`
- Password: `TestPass1234!` (satisfies the default policy)
- Cleanup: `_fixtures/cleanup.ts` deletes all `vp-e2e-*` users at the end of the run via the service-role admin API. Requires `SUPABASE_SERVICE_ROLE_KEY` in the test environment; if missing, cleanup logs a warning and exits clean (users accumulate harmlessly until next clean run).

## Layout

```
tests/e2e/
├── _fixtures/
│   ├── createUser.ts        — signup + login helpers
│   └── cleanup.ts           — global teardown deletes vp-e2e-* users
├── anon-golden-path.spec.ts — home loads, CSP set, robots/sitemap respond
└── auth-signup-login.spec.ts — signup, UI login, API login flows
```

## Adding new specs

Drop a `*.spec.ts` file in `tests/e2e/`. The convention:

```ts
import { test, expect } from '@playwright/test';
import { createTestUser, signInViaApi } from './_fixtures/createUser';

test.describe('feature name', () => {
  test('what should happen', async ({ page, baseURL }) => {
    const user = await createTestUser(baseURL!);
    await signInViaApi(page, user);
    await page.goto('/some-route');
    await expect(page.getByText(/something visible/i)).toBeVisible();
  });
});
```

## Coverage suggestions to expand into

- **Comments flow:** quiz pass → comment posts → renders for other users
- **Bookmarks:** add → list → cursor pagination
- **Settings:** profile save → revert → password change
- **Billing:** mock Stripe checkout (set `STRIPE_TEST_MODE=true`) → cancel → resubscribe
- **Admin:** sign in as a seeded admin user → moderate a comment → audit log row appears
- **Kids parent:** create kid profile → generate pair code → confirm `parental_consents` row
- **Mobile viewport:** the `mobile-chromium` project runs the same suite at Pixel 5 dimensions

## CI integration (when you want it)

Two-line addition to a GitHub Actions workflow:

```yaml
- run: cd web && npm ci
- run: cd web && npx playwright install --with-deps chromium
- run: cd web && npm run test:e2e
```

Set `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and any preview-bypass tokens as repository secrets.

## Troubleshooting

- **"Cannot find module 'playwright'":** run `npx playwright install chromium` once.
- **Tests time out at 30s:** dev server may not be ready; raise `webServer.timeout` in `playwright.config.ts`.
- **Cleanup didn't delete users:** check that `SUPABASE_SERVICE_ROLE_KEY` is set in the run environment.
- **Coming-soon redirect breaks tests:** set `PREVIEW_BYPASS_TOKEN` + visit `/preview` before the spec.
