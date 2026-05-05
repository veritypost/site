#!/usr/bin/env node
/**
 * Seed QA test accounts in Supabase. Idempotent — re-running upserts.
 *
 * Accounts created:
 *   free@veritypost.com     — user role only, no plan
 *   pro@veritypost.com      — user role + pro perm set + active verity_monthly subscription
 *   family@veritypost.com   — user role + family/family_perks perm sets + verity_family_monthly + 2 kid profiles
 *   expert@veritypost.com   — user + expert role + expert perm set + is_expert=true
 *   mod@veritypost.com      — user + moderator role + moderator perm set
 *   editor@veritypost.com   — user + editor role + editor perm set
 *
 * No passwords are set on these accounts — they're sign-in via the dev-login
 * route only (which uses admin.generateLink + verifyOtp).
 *
 * Run from web/:
 *   node scripts/seed-test-accounts.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const ACCOUNTS = [
  {
    email: 'free@veritypost.com',
    username: 'qa_free',
    displayName: 'QA Free',
    roles: [],
    permSets: ['free'],
    plan: null,
    isExpert: false,
    kids: [],
  },
  {
    email: 'pro@veritypost.com',
    username: 'qa_pro',
    displayName: 'QA Pro',
    roles: [],
    permSets: ['free', 'pro'],
    plan: 'verity_monthly',
    isExpert: false,
    kids: [],
  },
  {
    email: 'family@veritypost.com',
    username: 'qa_family',
    displayName: 'QA Family',
    roles: [],
    permSets: ['free', 'family', 'family_perks'],
    plan: 'verity_family_monthly',
    isExpert: false,
    kids: [
      { displayName: 'QA Kid 8', ageYears: 8, readingBand: 'kids' },
      { displayName: 'QA Kid 11', ageYears: 11, readingBand: 'tweens' },
    ],
  },
  {
    email: 'expert@veritypost.com',
    username: 'qa_expert',
    displayName: 'QA Expert',
    roles: ['expert'],
    permSets: ['free', 'expert'],
    plan: null,
    isExpert: true,
    expertCategories: ['Politics', 'Health'],
    kids: [],
  },
  {
    email: 'expert2@veritypost.com',
    username: 'qa_expert2',
    displayName: 'QA Expert 2',
    roles: ['expert'],
    permSets: ['free', 'expert'],
    plan: null,
    isExpert: true,
    expertCategories: ['Politics', 'Technology'],
    kids: [],
  },
  {
    email: 'mod@veritypost.com',
    username: 'qa_mod',
    displayName: 'QA Moderator',
    roles: ['moderator'],
    permSets: ['free', 'moderator'],
    plan: null,
    isExpert: false,
    kids: [],
  },
  {
    email: 'editor@veritypost.com',
    username: 'qa_editor',
    displayName: 'QA Editor',
    roles: ['editor'],
    permSets: ['free', 'editor'],
    plan: null,
    isExpert: false,
    kids: [],
  },
];

async function loadLookups() {
  const [{ data: roles }, { data: permSets }, { data: plans }, { data: categories }] = await Promise.all([
    sb.from('roles').select('id, name'),
    sb.from('permission_sets').select('id, key'),
    sb.from('plans').select('id, name'),
    sb.from('categories').select('id, name'),
  ]);
  return {
    roleByName: Object.fromEntries((roles ?? []).map((r) => [r.name, r.id])),
    permSetByKey: Object.fromEntries((permSets ?? []).map((p) => [p.key, p.id])),
    planByName: Object.fromEntries((plans ?? []).map((p) => [p.name, p.id])),
    categoryByName: Object.fromEntries((categories ?? []).map((c) => [c.name, c.id])),
  };
}

async function findAuthUserByEmail(email) {
  // listUsers paginates; QA seed runs against a small DB so 1 page is fine,
  // but we step through to be safe up to 1000 users.
  const lower = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = (data?.users ?? []).find((u) => (u.email ?? '').toLowerCase() === lower);
    if (found) return found;
    if ((data?.users ?? []).length < 100) break;
  }
  return null;
}

function dobForAge(ageYears) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - ageYears);
  return d.toISOString().slice(0, 10);
}

async function ensureAuthUser(spec) {
  const existing = await findAuthUserByEmail(spec.email);
  if (existing) return { id: existing.id, created: false };
  const { data, error } = await sb.auth.admin.createUser({
    email: spec.email,
    email_confirm: true,
    user_metadata: { full_name: spec.displayName, qa_seed: true },
  });
  if (error) throw new Error(`createUser ${spec.email}: ${error.message}`);
  return { id: data.user.id, created: true };
}

async function ensurePublicUser(spec, userId, planByName) {
  const planId = spec.plan ? planByName[spec.plan] : null;
  const planStatus = spec.plan ? 'active' : 'free';
  // The handle_new_auth_user trigger creates a public.users row on auth insert,
  // but for re-runs we still upsert all the QA-specific fields.
  const { error } = await sb.from('users').upsert(
    {
      id: userId,
      email: spec.email,
      username: spec.username,
      display_name: spec.displayName,
      email_verified: true,
      email_verified_at: new Date().toISOString(),
      is_expert: spec.isExpert,
      plan_id: planId,
      plan_status: planStatus,
      primary_auth_provider: 'email',
      onboarding_completed_at: new Date().toISOString(),
      metadata: { qa_seed: true },
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error(`users upsert ${spec.email}: ${error.message}`);
}

async function ensureRoles(spec, userId, roleByName) {
  if (!spec.roles.length) return;
  const rows = spec.roles
    .map((name) => roleByName[name])
    .filter(Boolean)
    .map((roleId) => ({ user_id: userId, role_id: roleId, scope: 'global' }));
  if (!rows.length) return;
  const { error } = await sb.from('user_roles').upsert(rows, {
    onConflict: 'user_id,role_id,scope',
    ignoreDuplicates: true,
  });
  if (error) throw new Error(`user_roles ${spec.email}: ${error.message}`);
}

async function ensurePermSets(spec, userId, permSetByKey) {
  if (!spec.permSets.length) return;
  const rows = spec.permSets
    .map((key) => permSetByKey[key])
    .filter(Boolean)
    .map((psId) => ({
      user_id: userId,
      permission_set_id: psId,
      granted_at: new Date().toISOString(),
      reason: 'qa_seed',
    }));
  if (!rows.length) return;
  const { error } = await sb.from('user_permission_sets').upsert(rows, {
    onConflict: 'user_id,permission_set_id',
    ignoreDuplicates: false,
  });
  if (error) throw new Error(`user_permission_sets ${spec.email}: ${error.message}`);
}

async function ensureSubscription(spec, userId, planByName) {
  if (!spec.plan) return;
  const planId = planByName[spec.plan];
  if (!planId) throw new Error(`Plan not found: ${spec.plan}`);
  const { data: existing } = await sb
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('source', 'qa_seed')
    .maybeSingle();
  if (existing) return;
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  const { error } = await sb.from('subscriptions').insert({
    user_id: userId,
    plan_id: planId,
    status: 'active',
    source: 'qa_seed',
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    auto_renew: true,
    platform: 'stripe',
    metadata: { qa_seed: true },
  });
  if (error) throw new Error(`subscriptions insert ${spec.email}: ${error.message}`);
}

async function ensureKidProfiles(spec, userId) {
  if (!spec.kids.length) return;
  const { data: existing } = await sb
    .from('kid_profiles')
    .select('id, display_name')
    .eq('parent_user_id', userId);
  const existingNames = new Set((existing ?? []).map((k) => k.display_name));
  for (const kid of spec.kids) {
    if (existingNames.has(kid.displayName)) continue;
    const { error } = await sb.from('kid_profiles').insert({
      parent_user_id: userId,
      display_name: kid.displayName,
      date_of_birth: dobForAge(kid.ageYears),
      reading_band: kid.readingBand,
      coppa_consent_given: true,
      coppa_consent_at: new Date().toISOString(),
      is_active: true,
      metadata: { qa_seed: true },
    });
    if (error) throw new Error(`kid_profiles insert ${kid.displayName}: ${error.message}`);
  }
  // Flip parent's has_kids_profiles flag.
  await sb.from('users').update({ has_kids_profiles: true }).eq('id', userId);
}

async function ensureExpertApplication(spec, userId, categoryByName) {
  if (!spec.isExpert || !(spec.expertCategories ?? []).length) return;
  const { data: existing } = await sb
    .from('expert_applications')
    .select('id, status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let applicationId = existing?.id ?? null;
  const now = new Date().toISOString();
  if (!applicationId) {
    const { data, error } = await sb
      .from('expert_applications')
      .insert({
        user_id: userId,
        application_type: 'expert',
        full_name: spec.displayName,
        bio: 'QA seed expert.',
        status: 'approved',
        reviewed_at: now,
        review_notes: 'qa_seed auto-approve',
      })
      .select('id')
      .single();
    if (error) throw new Error(`expert_applications insert ${spec.email}: ${error.message}`);
    applicationId = data.id;
  } else if (existing.status !== 'approved') {
    const { error } = await sb
      .from('expert_applications')
      .update({ status: 'approved', reviewed_at: now, review_notes: 'qa_seed auto-approve' })
      .eq('id', applicationId);
    if (error) throw new Error(`expert_applications update ${spec.email}: ${error.message}`);
  }
  const rows = spec.expertCategories
    .map((name) => categoryByName[name])
    .filter(Boolean)
    .map((categoryId) => ({ application_id: applicationId, category_id: categoryId }));
  if (!rows.length) return;
  const { error: catErr } = await sb
    .from('expert_application_categories')
    .upsert(rows, { onConflict: 'application_id,category_id', ignoreDuplicates: true });
  if (catErr) throw new Error(`expert_application_categories ${spec.email}: ${catErr.message}`);
}

async function seedOne(spec, lookups) {
  const { id: userId, created } = await ensureAuthUser(spec);
  await ensurePublicUser(spec, userId, lookups.planByName);
  await ensureRoles(spec, userId, lookups.roleByName);
  await ensurePermSets(spec, userId, lookups.permSetByKey);
  await ensureSubscription(spec, userId, lookups.planByName);
  await ensureKidProfiles(spec, userId);
  await ensureExpertApplication(spec, userId, lookups.categoryByName);
  return { email: spec.email, userId, created };
}

async function main() {
  const lookups = await loadLookups();
  const results = [];
  for (const spec of ACCOUNTS) {
    try {
      const r = await seedOne(spec, lookups);
      results.push(r);
      console.log(`  ${r.created ? 'created' : 'updated'}  ${r.email}  (${r.userId})`);
    } catch (e) {
      console.error(`  FAILED   ${spec.email}: ${e.message}`);
      throw e;
    }
  }
  console.log(`\nSeeded ${results.length} accounts.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
