#!/usr/bin/env node
// ============================================================================
// Seed test + community user accounts from test-data/accounts.json.
//
// - Creates Supabase Auth users (email + password, email_confirm per xlsx).
// - Upserts public.users rows (username, plan_id, verity_score, streak, flags).
// - Assigns role via public.user_roles.
// - Creates 2 kid_profiles under test_family (Emma + Liam).
// - Idempotent: re-running updates existing rows, skips auth-user recreation.
//
// Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in site/.env.local.
// ============================================================================

const fs = require('fs');
const path = require('path');

const SITE_DIR = path.resolve(__dirname, '..', 'site');
const { createClient } = require(path.join(SITE_DIR, 'node_modules', '@supabase', 'supabase-js'));

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv(path.join(SITE_DIR, '.env.local'));

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supa = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const accounts = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'test-data', 'accounts.json'), 'utf8'));

const ROLE_MAP = {
  owner: 'owner', admin: 'admin', editor: 'editor',
  moderator: 'moderator', user: 'user', expert: 'expert', educator: 'educator',
  journalist: 'journalist',
};
const PLAN_MAP = {
  free: 'free',
  premium: 'verity_annual',
  family: 'verity_family_annual',
};

async function lookupIdMap(table, key = 'name') {
  const { data, error } = await supa.from(table).select(`id,${key}`);
  if (error) throw new Error(`lookup ${table}: ${error.message}`);
  return Object.fromEntries(data.map(r => [r[key], r.id]));
}

function applySpecialState(user, special) {
  if (!special) return;
  const s = special.toLowerCase();
  if (s.includes('email unverified')) user.email_verified = false;
  if (s === 'banned') {
    user.is_banned = true;
    user.ban_reason = 'test seed — banned';
    user.banned_at = new Date().toISOString();
  }
  if (s.includes('muted')) {
    user.is_muted = true;
    user.muted_until = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  }
  if (s.includes('shadow')) user.is_shadow_banned = true;
  if (s.includes('streak')) {
    user.streak_current = 365;
    user.streak_best = 365;
    user.verity_score = 25000;
    user.articles_read_count = 500;
    user.quizzes_completed_count = 450;
  }
  if (s.includes('verified expert')) user.is_expert = true;
}

async function upsertUser({ username, email, password, roleName, planName, emailVerified, special }) {
  const roleId = roleName ? roles[ROLE_MAP[roleName.toLowerCase()]] : null;
  const planKey = PLAN_MAP[(planName || '').toLowerCase()] || 'free';
  const planId = plans[planKey];
  if (!planId) throw new Error(`no plan for ${planName}`);

  // Try to find an existing auth user with this email (idempotent re-runs).
  let authId;
  const { data: listed, error: listErr } = await supa.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw listErr;
  const existing = listed.users.find(u => u.email === email);
  if (existing) {
    authId = existing.id;
    // Reset password so the xlsx value is always authoritative.
    await supa.auth.admin.updateUserById(authId, { password, email_confirm: emailVerified });
  } else {
    const { data: created, error: createErr } = await supa.auth.admin.createUser({
      email, password, email_confirm: emailVerified,
    });
    if (createErr) throw new Error(`createUser ${email}: ${createErr.message}`);
    authId = created.user.id;
  }

  const userRow = {
    id: authId,
    email,
    email_verified: emailVerified,
    username,
    display_name: username,
    plan_id: planId,
    plan_status: 'active',
    verity_score: 0,
    articles_read_count: 0,
    quizzes_completed_count: 0,
    streak_current: 0,
    streak_best: 0,
    is_active: true,
    is_banned: false,
    is_muted: false,
    is_shadow_banned: false,
    is_expert: false,
  };
  applySpecialState(userRow, special);

  const { error: upErr } = await supa.from('users').upsert(userRow, { onConflict: 'id' });
  if (upErr) throw new Error(`upsert users ${email}: ${upErr.message}`);

  if (roleId) {
    // Replace any existing role row so a user never ends up with two.
    await supa.from('user_roles').delete().eq('user_id', authId);
    const { error: rErr } = await supa.from('user_roles').insert({ user_id: authId, role_id: roleId });
    if (rErr) throw new Error(`user_roles ${email}: ${rErr.message}`);
  }

  return authId;
}

async function upsertKidProfile(parentId, displayName, ageRange, pin) {
  const row = {
    parent_user_id: parentId,
    display_name: displayName,
    age_range: ageRange,
    reading_level: 'intermediate',
    is_active: true,
    coppa_consent_given: true,
    coppa_consent_at: new Date().toISOString(),
    verity_score: 0,
    articles_read_count: 0,
    quizzes_completed_count: 0,
    streak_current: 0,
    streak_best: 0,
  };

  const { data: existing } = await supa.from('kid_profiles')
    .select('id').eq('parent_user_id', parentId).eq('display_name', displayName).maybeSingle();

  if (existing) {
    await supa.from('kid_profiles').update(row).eq('id', existing.id);
    return existing.id;
  }
  const { data: ins, error } = await supa.from('kid_profiles').insert(row).select('id').single();
  if (error) throw new Error(`insert kid_profiles ${displayName}: ${error.message}`);
  return ins.id;
}

let roles, plans;

async function main() {
  roles = await lookupIdMap('roles');
  plans = await lookupIdMap('plans');
  console.log(`loaded ${Object.keys(roles).length} roles, ${Object.keys(plans).length} plans`);

  let familyUserId = null;
  const report = [];

  for (const acct of accounts['Test Accounts']) {
    const username = acct['Username'];
    const email    = acct['Email'];
    if (!email) { report.push({ username, status: 'skipped (no email)' }); continue; }
    const password = acct['Password'];
    const role     = acct['Role'];
    const plan     = acct['Plan'];
    const verified = (acct['Email Verified'] || '').toLowerCase() === 'yes';
    const special  = acct['Special State'];

    try {
      const id = await upsertUser({
        username, email, password,
        roleName: role, planName: plan,
        emailVerified: verified, special,
      });
      if (username === 'test_family') familyUserId = id;
      report.push({ username, email, status: 'ok' });
      process.stdout.write('.');
    } catch (err) {
      report.push({ username, email, status: `fail: ${err.message}` });
      process.stdout.write('x');
    }
  }

  if (familyUserId) {
    try {
      await upsertKidProfile(familyUserId, 'Emma', '8-10', '1234');
      await upsertKidProfile(familyUserId, 'Liam', '11-13', '5678');
      report.push({ username: 'test_kid_1 (Emma)', status: 'ok (kid_profile)' });
      report.push({ username: 'test_kid_2 (Liam)', status: 'ok (kid_profile)' });
    } catch (err) {
      report.push({ username: 'kid_profiles', status: `fail: ${err.message}` });
    }
  }

  for (const acct of accounts['Community Users']) {
    const username = acct['Username'];
    const email    = acct['Email'];
    const password = acct['Password'];
    if (!email || !password) { report.push({ username, status: 'skipped' }); continue; }

    try {
      await upsertUser({
        username, email, password,
        roleName: 'user', planName: 'free',
        emailVerified: true, special: '',
      });
      report.push({ username, email, status: 'ok' });
      process.stdout.write('.');
    } catch (err) {
      report.push({ username, email, status: `fail: ${err.message}` });
      process.stdout.write('x');
    }
  }

  console.log('\n--- summary ---');
  const ok = report.filter(r => r.status === 'ok' || r.status.startsWith('ok ')).length;
  const fail = report.filter(r => r.status.startsWith('fail')).length;
  const skipped = report.filter(r => r.status.startsWith('skipped')).length;
  console.log(`ok: ${ok}, fail: ${fail}, skipped: ${skipped}`);
  for (const r of report.filter(x => x.status.startsWith('fail'))) {
    console.log(`  ${r.username} <${r.email}>: ${r.status}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
