#!/usr/bin/env node
// ============================================================
// Verity Post — production cutover pre-flight check
// ============================================================
// Runs a battery of schema + seed + env checks against the target
// Supabase project. Exits 0 if clean, 1 on any hard failure.
//
// Usage:
//   node scripts/preflight.js
//
// Required env (reads from web/.env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Optional env (warn if missing — launch blockers but not pre-flight
// blockers since they only matter at runtime):
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
//   RESEND_API_KEY
//   CRON_SECRET
// ============================================================

const fs   = require('fs');
const path = require('path');

const SITE_DIR = path.resolve(__dirname, '..', 'web');
const SUPABASE_PKG = path.join(SITE_DIR, 'node_modules', '@supabase', 'supabase-js');
if (!fs.existsSync(SUPABASE_PKG)) {
  console.error(`@supabase/supabase-js not found at ${SUPABASE_PKG}. Run npm install in web/.`);
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

let failures = 0, warnings = 0;
const fail = (msg) => { console.error(`  ✗ ${msg}`); failures++; };
const warn = (msg) => { console.warn(`  ! ${msg}`); warnings++; };
const pass = (msg) => { console.log(`  ✓ ${msg}`); };

async function checkRpcExists(name) {
  // Calling with bogus args forces an error, but Postgres returns a
  // specific code when the function doesn't exist (42883).
  const { error } = await db.rpc(name, {});
  if (!error) return true;
  if (/function .* does not exist/i.test(error.message) || error.code === '42883') {
    return false;
  }
  // Any other error = function exists but args were wrong. That's fine.
  return true;
}

async function checkSetting(key) {
  const { data } = await db.from('settings').select('value').eq('key', key).maybeSingle();
  return data !== null;
}

async function checkPlanSeed() {
  const { data } = await db.from('plans').select('name, tier').eq('is_active', true);
  const names = (data || []).map(r => r.name);
  const required = [
    'free',
    'verity_monthly', 'verity_annual',
    'verity_pro_monthly', 'verity_pro_annual',
    'verity_family_monthly', 'verity_family_annual',
    'verity_family_xl_monthly', 'verity_family_xl_annual',
  ];
  const missing = required.filter(n => !names.includes(n));
  return { ok: missing.length === 0, missing, count: names.length };
}

async function checkRoleSeed() {
  const { data } = await db.from('roles').select('name');
  const names = (data || []).map(r => r.name);
  const required = ['owner', 'admin', 'editor', 'moderator', 'expert', 'educator', 'journalist', 'user'];
  return { ok: required.every(n => names.includes(n)), count: names.length };
}

async function checkTemplateSeed() {
  const { data } = await db.from('email_templates').select('key').eq('is_active', true);
  const keys = (data || []).map(r => r.key);
  const required = ['weekly_reading_report', 'weekly_family_report', 'breaking_news_alert'];
  return { ok: required.every(k => keys.includes(k)), count: keys.length };
}

async function checkStripePriceIdsFilled() {
  const { data } = await db.from('plans').select('name, stripe_price_id').neq('name', 'free');
  const missing = (data || []).filter(r => !r.stripe_price_id).map(r => r.name);
  return { ok: missing.length === 0, missing };
}

async function checkAnyAdminExists() {
  const { count } = await db.from('user_roles')
    .select('id', { count: 'exact', head: true })
    .in('role_id', (await db.from('roles').select('id').in('name', ['owner', 'admin']).then(r => (r.data || []).map(x => x.id))));
  return (count || 0) > 0;
}

async function main() {
  console.log('\n=== Verity Post — pre-flight ===\n');

  console.log('-- Core infra --');
  const { error: pingErr } = await db.from('users').select('id').limit(1);
  pingErr ? fail(`supabase ping failed: ${pingErr.message}`) : pass('supabase reachable');

  console.log('\n-- Phase 3 (billing) RPCs --');
  for (const f of ['user_has_dm_access', 'billing_cancel_subscription', 'billing_freeze_profile',
                   'billing_freeze_expired_grace', 'billing_resubscribe', 'billing_change_plan']) {
    (await checkRpcExists(f)) ? pass(f) : fail(`missing RPC: ${f}`);
  }

  console.log('\n-- Phase 4 (quiz) RPCs --');
  for (const f of ['article_quiz_pool_size', 'user_article_attempts', 'user_passed_article_quiz',
                   'start_quiz_attempt', 'submit_quiz_attempt']) {
    (await checkRpcExists(f)) ? pass(f) : fail(`missing RPC: ${f}`);
  }

  console.log('\n-- Phase 5 (comments) RPCs --');
  for (const f of ['can_user_see_discussion', 'post_comment', 'toggle_vote',
                   'toggle_context_tag', 'soft_delete_comment', 'edit_comment']) {
    (await checkRpcExists(f)) ? pass(f) : fail(`missing RPC: ${f}`);
  }

  console.log('\n-- Phase 6 (expert) RPCs --');
  for (const f of ['is_user_expert', 'expert_can_see_back_channel', 'is_expert_in_probation',
                   'submit_expert_application', 'approve_expert_application', 'reject_expert_application',
                   'ask_expert', 'claim_queue_item', 'decline_queue_item', 'post_expert_answer',
                   'approve_expert_answer', 'post_back_channel_message']) {
    (await checkRpcExists(f)) ? pass(f) : fail(`missing RPC: ${f}`);
  }

  console.log('\n-- Phase 7 (bookmarks/search/social) --');
  for (const f of ['_user_is_paid', 'create_bookmark_collection', 'rename_bookmark_collection',
                   'delete_bookmark_collection', 'toggle_follow']) {
    (await checkRpcExists(f)) ? pass(f) : fail(`missing RPC: ${f}`);
  }

  console.log('\n-- Phase 8 (trust & safety) --');
  for (const f of ['user_supervisor_eligible_for', 'user_is_supervisor_in',
                   'supervisor_opt_in', 'supervisor_opt_out', 'supervisor_flag_comment',
                   'hide_comment', 'unhide_comment', 'apply_penalty', 'resolve_report',
                   'submit_appeal', 'resolve_appeal', 'grant_role', 'revoke_role']) {
    (await checkRpcExists(f)) ? pass(f) : fail(`missing RPC: ${f}`);
  }

  console.log('\n-- Phase 9 (family) --');
  for (const f of ['start_kid_trial', 'freeze_kid_trial', 'sweep_kid_trial_expiries',
                   'convert_kid_trial', 'use_kid_streak_freeze',
                   'family_members', 'family_weekly_report', 'is_family_owner']) {
    (await checkRpcExists(f)) ? pass(f) : fail(`missing RPC: ${f}`);
  }

  console.log('\n-- Phase 10 (ads) --');
  for (const f of ['_user_tier_or_anon', 'serve_ad', 'log_ad_impression', 'log_ad_click']) {
    (await checkRpcExists(f)) ? pass(f) : fail(`missing RPC: ${f}`);
  }

  console.log('\n-- Phase 11 (notifications) --');
  for (const f of ['breaking_news_quota_check', 'create_notification', 'send_breaking_news',
                   'weekly_reading_report', 'submit_recap_attempt']) {
    (await checkRpcExists(f)) ? pass(f) : fail(`missing RPC: ${f}`);
  }

  console.log('\n-- Settings seeds --');
  for (const k of ['supervisor_eligibility_score', 'context_pin_min_count', 'context_pin_percent',
                   'comment_max_depth', 'comment_max_length', 'breaking_alert_cap_free',
                   'streak.freeze_max_kids']) {
    (await checkSetting(k)) ? pass(k) : fail(`missing setting: ${k}`);
  }

  console.log('\n-- Seed data --');
  const plans = await checkPlanSeed();
  plans.ok ? pass(`plans: ${plans.count}/9`) : fail(`plans missing: ${plans.missing.join(', ')}`);
  const roles = await checkRoleSeed();
  roles.ok ? pass(`roles: ${roles.count}/8`) : fail('role seed incomplete');
  const templates = await checkTemplateSeed();
  templates.ok ? pass(`active email templates: ${templates.count}`) : fail('core email templates not active');
  (await checkAnyAdminExists()) ? pass('at least one admin/owner exists') : fail('no admin or owner user found');

  console.log('\n-- Billing config --');
  const stripe = await checkStripePriceIdsFilled();
  stripe.ok ? pass('all paid plans have stripe_price_id') : warn(`stripe_price_id missing on: ${stripe.missing.join(', ')}`);

  console.log('\n-- Runtime env (warnings, not failures) --');
  for (const v of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY', 'CRON_SECRET']) {
    process.env[v] ? pass(v) : warn(`${v} not set`);
  }

  console.log('\n-- Stripe webhook endpoints --');
  if (!process.env.STRIPE_SECRET_KEY) {
    warn('skipped (STRIPE_SECRET_KEY not set)');
  } else {
    try {
      const res = await fetch('https://api.stripe.com/v1/webhook_endpoints?limit=100', {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      });
      const json = await res.json();
      if (!res.ok) {
        warn(`Stripe webhook list failed: ${json?.error?.message || res.status}`);
      } else {
        const endpoints = (json.data || []).filter(e => e.status === 'enabled');
        const hasOurs = endpoints.some(e => /\/api\/stripe\/webhook$/.test(e.url || ''));
        hasOurs
          ? pass(`enabled webhook endpoint pointing at /api/stripe/webhook (of ${endpoints.length} total)`)
          : warn(`${endpoints.length} enabled webhook endpoint(s), none match /api/stripe/webhook`);
      }
    } catch (e) {
      warn(`Stripe webhook check error: ${e.message}`);
    }
  }

  console.log('\n-- Resend API key --');
  if (!process.env.RESEND_API_KEY) {
    warn('skipped (RESEND_API_KEY not set)');
  } else {
    try {
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        const count = Array.isArray(json?.data) ? json.data.length : 0;
        pass(`Resend key valid (${count} domain${count === 1 ? '' : 's'} configured)`);
      } else if (res.status === 401) {
        fail('Resend API key rejected (401)');
      } else {
        warn(`Resend unexpected status ${res.status}`);
      }
    } catch (e) {
      warn(`Resend check error: ${e.message}`);
    }
  }

  console.log('\n-- Cron schedule --');
  try {
    const vercelJsonPath = path.join(SITE_DIR, 'vercel.json');
    if (!fs.existsSync(vercelJsonPath)) {
      warn('web/vercel.json not found — crons only run on Vercel');
    } else {
      const { crons = [] } = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
      const expected = [
        '/api/cron/freeze-grace',
        '/api/cron/sweep-kid-trials',
        '/api/cron/send-emails',
        '/api/cron/send-push',
        '/api/cron/recompute-family-achievements',
        '/api/cron/check-user-achievements',
        '/api/cron/process-deletions',
        '/api/cron/process-data-exports',
        '/api/cron/flag-expert-reverifications',
      ];
      const paths = crons.map(c => c.path);
      const missing = expected.filter(p => !paths.includes(p));
      if (missing.length === 0) {
        pass(`all ${expected.length} cron jobs scheduled`);
      } else {
        warn(`cron jobs missing from vercel.json: ${missing.join(', ')}`);
      }
      for (const c of crons) {
        pass(`  ${c.schedule.padEnd(14)} ${c.path}`);
      }
    }
  } catch (e) {
    warn(`cron schedule check error: ${e.message}`);
  }

  console.log(`\n=== Summary: ${failures} failures, ${warnings} warnings ===\n`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
