#!/usr/bin/env node
// ============================================================
// Verity Post — Phase 15.4: Stripe price ID checker
//
// Goal: ensure plans.stripe_price_id is populated for all 8 paid
// plans. Reads the current state from Supabase, then (if
// STRIPE_SECRET_KEY is set) fetches active prices from Stripe and
// emits UPDATE statements that map each plan to its matching
// Stripe price by (currency, unit_amount, recurring.interval).
//
// Usage:
//   node scripts/check-stripe-prices.js
//
// Env (read from web/.env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   STRIPE_SECRET_KEY     (optional — if missing, only reports
//                          the gap without suggesting price IDs)
// ============================================================

const fs   = require('fs');
const path = require('path');

const SITE_DIR = path.resolve(__dirname, '..', 'web');
const SUPABASE_PKG = path.join(SITE_DIR, 'node_modules', '@supabase', 'supabase-js');
if (!fs.existsSync(SUPABASE_PKG)) {
  console.error(`Could not find @supabase/supabase-js at ${SUPABASE_PKG}`);
  console.error(`Run "npm install" inside web/ first.`);
  process.exit(1);
}
const { createClient } = require(SUPABASE_PKG);

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv(path.join(SITE_DIR, '.env.local'));

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_KEY       = process.env.STRIPE_SECRET_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in web/.env.local');
  process.exit(1);
}

const GREEN  = (s) => `\x1b[32m${s}\x1b[0m`;
const RED    = (s) => `\x1b[31m${s}\x1b[0m`;
const YELLOW = (s) => `\x1b[33m${s}\x1b[0m`;
const DIM    = (s) => `\x1b[2m${s}\x1b[0m`;
const BOLD   = (s) => `\x1b[1m${s}\x1b[0m`;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function listStripePrices() {
  // Stripe paginates at 100 per page. Walk all active prices.
  const prices = [];
  let starting_after = null;
  while (true) {
    const params = new URLSearchParams({ active: 'true', limit: '100' });
    if (starting_after) params.set('starting_after', starting_after);
    const res = await fetch(`https://api.stripe.com/v1/prices?${params}`, {
      headers: { Authorization: `Bearer ${STRIPE_KEY}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || `Stripe ${res.status}`);
    prices.push(...json.data);
    if (!json.has_more) break;
    starting_after = json.data[json.data.length - 1].id;
  }
  return prices;
}

function intervalFromBillingPeriod(bp) {
  if (bp === 'month') return 'month';
  if (bp === 'year')  return 'year';
  return null;
}

async function main() {
  console.log(BOLD('\nVerity Post — Stripe Price ID Check\n'));

  const { data: plans, error } = await db
    .from('plans')
    .select('name, display_name, tier, billing_period, price_cents, currency, stripe_price_id')
    .neq('tier', 'free')
    .order('sort_order');
  if (error) { console.error('DB error:', error.message); process.exit(1); }

  console.log(BOLD('Current state in DB:\n'));
  let missing = 0;
  for (const p of plans) {
    const status = p.stripe_price_id
      ? GREEN(`✓ ${p.stripe_price_id}`)
      : RED('✗ NULL');
    console.log(`  ${p.name.padEnd(28)} ${String(p.price_cents).padStart(5)}¢/${p.billing_period.padEnd(5)} ${status}`);
    if (!p.stripe_price_id) missing++;
  }

  if (missing === 0) {
    console.log('\n' + GREEN(BOLD('All 8 paid plans have stripe_price_id set. Nothing to do.')));
    process.exit(0);
  }

  console.log('\n' + YELLOW(`${missing} of ${plans.length} paid plan(s) missing stripe_price_id.`));

  if (!STRIPE_KEY) {
    console.log('\n' + DIM('STRIPE_SECRET_KEY not set in web/.env.local — skipping Stripe lookup.'));
    console.log(DIM('Set it and re-run to get suggested UPDATE statements.'));
    process.exit(1);
  }

  console.log('\n' + BOLD('Fetching active Stripe prices...'));
  let stripePrices;
  try {
    stripePrices = await listStripePrices();
  } catch (e) {
    console.error(RED('Stripe API error:'), e.message);
    process.exit(1);
  }
  const recurring = stripePrices.filter(p => p.recurring && p.type === 'recurring');
  console.log(DIM(`  found ${stripePrices.length} active prices (${recurring.length} recurring)\n`));

  const mode = STRIPE_KEY.startsWith('sk_test_') ? 'TEST' : (STRIPE_KEY.startsWith('sk_live_') ? 'LIVE' : 'UNKNOWN');
  console.log(DIM(`  Stripe mode: ${mode}\n`));

  console.log(BOLD('Suggested UPDATE statements:\n'));
  let matched = 0;
  let ambiguous = 0;
  for (const p of plans) {
    if (p.stripe_price_id) continue;
    const interval = intervalFromBillingPeriod(p.billing_period);
    const candidates = recurring.filter(sp =>
      sp.unit_amount === p.price_cents
      && (sp.currency || '').toLowerCase() === (p.currency || '').toLowerCase()
      && sp.recurring?.interval === interval
    );

    if (candidates.length === 1) {
      console.log(GREEN(`-- ${p.name} (${p.display_name})`));
      console.log(`UPDATE plans SET stripe_price_id = '${candidates[0].id}' WHERE name = '${p.name}';`);
      console.log('');
      matched++;
    } else if (candidates.length === 0) {
      console.log(RED(`-- ${p.name}: no Stripe price found for ${p.price_cents}¢ ${p.currency} ${interval}ly`));
      console.log(DIM(`-- Create one in Stripe dashboard, then re-run.`));
      console.log('');
    } else {
      console.log(YELLOW(`-- ${p.name}: ${candidates.length} candidate Stripe prices match ${p.price_cents}¢ ${p.currency} ${interval}ly:`));
      for (const c of candidates) {
        console.log(YELLOW(`--   ${c.id}  product=${c.product}  nickname=${c.nickname || '(none)'}`));
      }
      console.log(DIM(`-- Pick one manually and run: UPDATE plans SET stripe_price_id = '<chosen_id>' WHERE name = '${p.name}';`));
      console.log('');
      ambiguous++;
    }
  }

  console.log(DIM(`Matched ${matched}, ambiguous ${ambiguous}, unmatched ${missing - matched - ambiguous}.`));
  process.exit(missing - matched === 0 && ambiguous === 0 ? 0 : 1);
}

main().catch((e) => { console.error(RED('Fatal:'), e); process.exit(1); });
