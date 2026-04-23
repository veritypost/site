#!/usr/bin/env node
/**
 * DEV-ONLY: resets every auth.users password to NEW_PASSWORD.
 *
 * Use case: test data only — flatten everyone to a known password so you can
 * log in as any test account quickly. NEVER run against production with real
 * users.
 *
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars.
 *
 * Usage:
 *   export SUPABASE_URL=https://fyiwulqphgmoqullmrfn.supabase.co
 *   export SUPABASE_SERVICE_ROLE_KEY=<service role key from Supabase dashboard>
 *   node scripts/dev-reset-all-passwords.js
 */
const { createClient } = require('@supabase/supabase-js');

const NEW_PASSWORD = 'Password1?';
const FALLBACK_PASSWORD = 'TestPassword1!';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

(async () => {
  console.log('Listing users...');
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    console.error('listUsers failed:', error.message);
    process.exit(1);
  }
  const users = data.users || [];
  console.log(`Found ${users.length} users. Resetting passwords...`);

  let ok = 0;
  let failed = 0;
  let usedFallback = false;
  let activePassword = NEW_PASSWORD;

  for (const u of users) {
    const { error: e1 } = await supabase.auth.admin.updateUserById(u.id, {
      password: activePassword,
    });
    if (e1) {
      // If first user fails on password strength, retry whole batch with fallback
      if (!usedFallback && /password|weak|short|strength/i.test(e1.message)) {
        console.warn(`Password "${activePassword}" rejected ("${e1.message}"). Switching to fallback "${FALLBACK_PASSWORD}".`);
        activePassword = FALLBACK_PASSWORD;
        usedFallback = true;
        // Retry this user with fallback
        const { error: e2 } = await supabase.auth.admin.updateUserById(u.id, {
          password: activePassword,
        });
        if (e2) {
          console.error(`Failed (fallback) ${u.email}: ${e2.message}`);
          failed++;
          continue;
        }
        ok++;
        continue;
      }
      console.error(`Failed ${u.email}: ${e1.message}`);
      failed++;
      continue;
    }
    ok++;
  }

  console.log(`\nDone. ${ok} reset, ${failed} failed.`);
  console.log(`Password: ${activePassword}`);
})();
