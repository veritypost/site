/**
 * Global teardown — deletes all `vp-e2e-*` test users created during
 * the run. Wired via `globalTeardown` in playwright.config.ts.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in the environment. If unset, the
 * teardown logs a warning and exits clean (so local runs without
 * service-role access still pass; users will accumulate but the bucket
 * is small).
 *
 * Lookup: scans `auth.users` via the admin client and matches the
 * email prefix. Uses the SECURITY DEFINER `delete_test_users` RPC if
 * present, otherwise the admin API directly.
 */

import { createClient } from '@supabase/supabase-js';
import { cleanupSeed } from './seed';

export default async function globalTeardown() {
  // Drop seeded article + quiz + pair code first; the seed users
  // themselves stay (they're stable and other DB rows reference them).
  try {
    await cleanupSeed();
  } catch (err) {
    console.warn('[e2e cleanup] cleanupSeed failed:', (err as Error).message);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('[e2e cleanup] missing SUPABASE_SERVICE_ROLE_KEY; vp-e2e-* users not deleted');
    return;
  }
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // List up to 1000 users; filter client-side. The auth admin API
  // doesn't expose a server-side filter, so this is the simple path.
  let page = 1;
  let deletedCount = 0;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users || data.users.length === 0) break;
    for (const u of data.users) {
      // vp-e2e-*@example.com — throwaway test users (createTestUser).
      // vp-e2e-seed-*@veritypost.test — stable seed users; keep them
      // so the next run can re-find them by id and not orphan the
      // public.users rows that reference them via FK.
      if (u.email?.startsWith('vp-e2e-') && u.email.endsWith('@example.com')) {
        const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
        if (!delErr) deletedCount++;
      }
    }
    if (data.users.length < 1000) break;
    page++;
  }
  console.log(`[e2e cleanup] deleted ${deletedCount} test users`);
}
