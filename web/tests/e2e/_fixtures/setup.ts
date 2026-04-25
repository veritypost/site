/**
 * Global setup — drops the coming-soon bypass cookie into a shared
 * storageState file so every test context loads with `vp_preview=ok`
 * already set. Without this, in-coming-soon-mode runs redirect almost
 * every navigation to /welcome and the suite is mostly skips.
 *
 * No-op when PREVIEW_BYPASS_TOKEN isn't set; the storageState file is
 * still written (empty) so playwright.config.ts can reference it
 * unconditionally.
 */

import { chromium, type FullConfig } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { seedTestData } from './seed';

export const STORAGE_STATE_PATH = resolve(__dirname, '../.auth/preview.json');

async function probeSupabaseKeys() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn(
      '[e2e setup] SUPABASE_SERVICE_ROLE_KEY not set — every spec that needs a ' +
        'test user will fail. Add it to web/.env.local.'
    );
    return;
  }
  try {
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Cheapest possible probe: list 1 user. Wrong key → "Invalid API key".
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) {
      console.warn(
        `[e2e setup] Supabase admin probe failed: ${error.message}\n` +
          `         URL=${url}\n` +
          `         The SUPABASE_SERVICE_ROLE_KEY in web/.env.local does not match this project. ` +
          `Tests that need an authed user (createTestUser) will fail until this is fixed.`
      );
    }
  } catch (err) {
    console.warn('[e2e setup] Supabase admin probe threw:', (err as Error).message);
  }
}

export default async function globalSetup(_config: FullConfig) {
  mkdirSync(dirname(STORAGE_STATE_PATH), { recursive: true });

  await probeSupabaseKeys();

  // Seed deterministic test data (article+quiz, parent+kid, pair code).
  // Specs that need richer setup import getSeed() from _fixtures/seed.
  // If the probe above warned about bad keys, this throws — that's
  // intentional: every spec depending on seeded rows would have failed
  // anyway; better to fail fast at globalSetup with a clear message.
  try {
    await seedTestData();
  } catch (err) {
    console.warn(
      `[e2e setup] seedTestData failed: ${(err as Error).message}\n` +
        `         Tests that depend on seeded data (deeper-flow specs) will fail.`
    );
  }

  const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
  const token = process.env.PREVIEW_BYPASS_TOKEN;

  if (!token) {
    // No token — write an empty state so the config file load doesn't
    // ENOENT. Tests in coming-soon mode will fall back to per-test
    // soft-skip (`if (page.url().endsWith('/welcome')) test.skip(...)`).
    writeFileSync(STORAGE_STATE_PATH, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  // Visiting /preview?token=... sets the httpOnly vp_preview=ok cookie
  // and 302s back to /. We only care about the cookie landing in the
  // context; the redirect target is irrelevant.
  try {
    await page.goto(`/preview?token=${encodeURIComponent(token)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
  } catch {
    // If the dev server isn't ready yet, the test webServer block will
    // bring it up and individual tests will still soft-skip on welcome.
  }

  await context.storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}
