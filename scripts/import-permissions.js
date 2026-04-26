#!/usr/bin/env node
// ============================================================================
// Import permission matrix from `~/Desktop/verity post/permissions.xlsx`
// into Supabase. Replaces the stale 81 perms / 11 sets with the new
// 927 perms / 10 sets.
//
// Default mode: --dry-run. Prints the exact diff (insert/update/deactivate
// counts) without touching the DB.
//
// With --apply: executes the changes and bumps perms_global_version.
//
// Tables touched:
//   permissions               (upsert by key; deactivate absent ones)
//   permission_sets           (upsert by key; deactivate absent ones)
//   permission_set_perms      (fully rebuilt from xlsx X-columns)
//   role_permission_sets      (fully rebuilt from role-name → set mapping)
//   plan_permission_sets      (fully rebuilt from plan-name → set mapping)
//   perms_global_version      (bumped once at end)
//
// Tables NOT touched:
//   user_permission_sets, permission_scope_overrides (user-level grants)
//
// Backups were taken 2026-04-18 to test-data/backup-2026-04-18/*.json.
// ============================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const SITE_DIR = path.resolve(__dirname, '..', 'web');
const { createClient } = require(path.join(SITE_DIR, 'node_modules', '@supabase', 'supabase-js'));

function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [k, ...rest] = line.split('=');
    let v = rest.join('=').trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k.trim() in process.env)) process.env[k.trim()] = v;
  }
}
loadEnv(path.join(SITE_DIR, '.env.local'));

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('missing supabase env'); process.exit(1); }
const supa = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const APPLY = process.argv.includes('--apply');
const MODE = APPLY ? 'APPLY' : 'DRY-RUN';

// ---- Parse xlsx via python (openpyxl, already available) -------------------

function parseXlsx() {
  // T-034 — path resolution order:
  //   1. PERMISSIONS_XLSX_PATH env var (CI / alt machines)
  //   2. matrix/permissions.xlsx inside the repo (preferred canonical location)
  //   3. ~/Desktop/verity post/permissions.xlsx (legacy owner workflow)
  const repoPath = path.resolve(__dirname, '..', 'matrix', 'permissions.xlsx');
  // M5 — derive legacy path from os.homedir() so the script works for
  // any local user (not just veritypost). The "verity post" directory
  // name (with the space) is the canonical owner workflow per CLAUDE.md.
  const legacyPath = path.join(os.homedir(), 'Desktop', 'verity post', 'permissions.xlsx');
  const candidates = [process.env.PERMISSIONS_XLSX_PATH, repoPath, legacyPath].filter(Boolean);
  const xlsxPath = candidates.find(p => fs.existsSync(p));
  if (!xlsxPath) {
    console.error('permissions.xlsx not found. Tried:');
    for (const c of candidates) console.error('  -', c);
    console.error('Set PERMISSIONS_XLSX_PATH or move the file into matrix/.');
    process.exit(1);
  }
  console.log(`using xlsx: ${xlsxPath}`);
  const script = `
import json, openpyxl
wb = openpyxl.load_workbook('${xlsxPath}', data_only=True)

# permissions sheet
ws = wb['permissions']
hdr = [c.value for c in next(ws.iter_rows(min_row=1, max_row=1))]
tier_cols = ['anon','unverified','free','pro','family','expert','moderator','editor','admin','owner']
tier_idx = {t: hdr.index(t) for t in tier_cols if t in hdr}

perms = []
for row in ws.iter_rows(min_row=2, values_only=True):
    if not row or not row[hdr.index('permission_key')]: continue
    key = str(row[hdr.index('permission_key')]).strip()
    tiers = [t for t, i in tier_idx.items() if row[i] and str(row[i]).strip().upper() == 'X']
    perms.append({
        'surface':     str(row[hdr.index('surface')] or '').strip(),
        'feature':     str(row[hdr.index('feature')] or '').strip(),
        'key':         key,
        'sets':        tiers,
    })

# permission sets sheet
ws2 = wb['Permission Sets']
hdr2 = [c.value for c in next(ws2.iter_rows(min_row=1, max_row=1))]
sets = []
for row in ws2.iter_rows(min_row=2, values_only=True):
    if not row or not row[hdr2.index('set_key')]: continue
    sets.append({
        'key':          str(row[hdr2.index('set_key')] or '').strip(),
        'display_name': str(row[hdr2.index('display_name')] or '').strip(),
        'inherits_from': str(row[hdr2.index('inherits_from')] or '').strip() or None,
    })

print(json.dumps({'permissions': perms, 'permission_sets': sets}))
  `;
  const out = execSync(`python3 -c "${script.replace(/"/g, '\\"')}"`).toString();
  return JSON.parse(out);
}

// ---- Main ------------------------------------------------------------------

async function main() {
  console.log(`=== import-permissions.js [${MODE}] ===\n`);

  const xlsx = parseXlsx();
  console.log(`xlsx: ${xlsx.permissions.length} permissions, ${xlsx.permission_sets.length} sets`);

  // Pull current DB state
  const [{ data: dbPerms }, { data: dbSets }, { data: dbRoles }, { data: dbPlans }] = await Promise.all([
    supa.from('permissions').select('id,key,is_active'),
    supa.from('permission_sets').select('id,key,is_active'),
    supa.from('roles').select('id,name'),
    supa.from('plans').select('id,name,tier'),
  ]);

  const dbPermsByKey = Object.fromEntries(dbPerms.map(p => [p.key, p]));
  const dbSetsByKey = Object.fromEntries(dbSets.map(s => [s.key, s]));
  const xlsxPermKeys = new Set(xlsx.permissions.map(p => p.key));
  const xlsxSetKeys = new Set(xlsx.permission_sets.map(s => s.key));

  // --- 1. Permissions diff ---
  const permInserts = xlsx.permissions.filter(p => !dbPermsByKey[p.key]);
  const permUpdates = xlsx.permissions.filter(p => dbPermsByKey[p.key]);
  const permDeactivate = dbPerms.filter(p => !xlsxPermKeys.has(p.key) && p.is_active);

  // --- 2. Sets diff ---
  const setInserts = xlsx.permission_sets.filter(s => !dbSetsByKey[s.key]);
  const setUpdates = xlsx.permission_sets.filter(s => dbSetsByKey[s.key]);
  const setDeactivate = dbSets.filter(s => !xlsxSetKeys.has(s.key) && s.is_active);

  // --- 3. Set-perm links (fully rebuilt) ---
  const setLinkRows = [];
  for (const p of xlsx.permissions) {
    for (const sk of p.sets) {
      setLinkRows.push({ permission_key: p.key, set_key: sk });
    }
  }

  // --- 4. Role → set mapping (canonical) ---
  const roleToSets = {
    owner:       ['owner','admin','editor','moderator','expert','family','pro','free','unverified','anon'],
    admin:       ['admin','editor','moderator','expert','pro','free','unverified','anon'],
    editor:      ['editor','expert','pro','free','unverified','anon'],
    moderator:   ['moderator','expert','pro','free','unverified','anon'],
    expert:      ['expert','free','unverified','anon'],
    educator:    ['expert','free','unverified','anon'],
    journalist:  ['expert','free','unverified','anon'],
    user:        ['free','unverified','anon'],
  };
  const roleLinkRows = [];
  for (const r of dbRoles) {
    for (const sk of (roleToSets[r.name] || ['free'])) {
      roleLinkRows.push({ role_name: r.name, set_key: sk });
    }
  }

  // --- 5. Plan → set mapping ---
  const planToSets = {
    free:                     ['free'],
    verity_monthly:           ['pro','free'],
    verity_annual:            ['pro','free'],
    verity_pro_monthly:       ['pro','free'],
    verity_pro_annual:        ['pro','free'],
    verity_family_monthly:    ['family','pro','free'],
    verity_family_annual:     ['family','pro','free'],
    verity_family_xl_monthly: ['family','pro','free'],
    verity_family_xl_annual:  ['family','pro','free'],
  };
  const planLinkRows = [];
  for (const p of dbPlans) {
    for (const sk of (planToSets[p.name] || ['free'])) {
      planLinkRows.push({ plan_name: p.name, set_key: sk });
    }
  }

  // --- Print diff ---
  console.log('\n--- PERMISSIONS ---');
  console.log(`  INSERT:     ${permInserts.length}`);
  console.log(`  UPDATE:     ${permUpdates.length} (key unchanged; surface/feature/display_name refreshed)`);
  console.log(`  DEACTIVATE: ${permDeactivate.length} (keys in DB but not xlsx → is_active=false)`);

  console.log('\n--- PERMISSION SETS ---');
  console.log(`  INSERT:     ${setInserts.length} (${setInserts.map(s => s.key).join(', ')})`);
  console.log(`  UPDATE:     ${setUpdates.length}`);
  console.log(`  DEACTIVATE: ${setDeactivate.length} (${setDeactivate.map(s => s.key).join(', ')})`);

  console.log('\n--- SET-PERM LINKS (fully rebuilt) ---');
  console.log(`  TOTAL:  ${setLinkRows.length} permission-set memberships across ${xlsx.permission_sets.length} sets`);

  console.log('\n--- ROLE → SET LINKS (fully rebuilt) ---');
  console.log(`  TOTAL:  ${roleLinkRows.length} (${dbRoles.length} roles × avg ${(roleLinkRows.length / dbRoles.length).toFixed(1)} sets)`);

  console.log('\n--- PLAN → SET LINKS (fully rebuilt) ---');
  console.log(`  TOTAL:  ${planLinkRows.length} (${dbPlans.length} plans × avg ${(planLinkRows.length / dbPlans.length).toFixed(1)} sets)`);

  console.log(`\n--- perms_global_version ---`);
  console.log(`  will bump by 1`);

  if (!APPLY) {
    console.log(`\n=== DRY RUN — no writes performed ===`);
    console.log(`   run with --apply to execute`);
    return;
  }

  // --- APPLY ---
  console.log('\n=== APPLYING ===');

  // 1. Insert/update permissions
  const permRows = xlsx.permissions.map(p => ({
    key: p.key,
    display_name: p.feature || p.key,
    description: p.feature || '',
    category: 'ui',
    ui_section: p.surface || null,
    is_active: true,
    is_public: false,
    deny_mode: 'locked',
  }));
  for (let i = 0; i < permRows.length; i += 200) {
    const chunk = permRows.slice(i, i + 200);
    const { error } = await supa.from('permissions').upsert(chunk, { onConflict: 'key' });
    if (error) throw new Error(`permissions upsert: ${error.message}`);
    process.stdout.write(`  perm upsert ${i + chunk.length}/${permRows.length}\r`);
  }
  process.stdout.write('\n');

  // Deactivate permissions not in xlsx
  for (const p of permDeactivate) {
    await supa.from('permissions').update({ is_active: false }).eq('id', p.id);
  }
  console.log(`  deactivated ${permDeactivate.length} old permissions`);

  // 2. Insert/update sets
  const setRows = xlsx.permission_sets.map(s => ({
    key: s.key,
    display_name: s.display_name || s.key,
    description: '',
    is_active: true,
    is_system: true,
  }));
  const { error: setErr } = await supa.from('permission_sets').upsert(setRows, { onConflict: 'key' });
  if (setErr) throw new Error(`permission_sets upsert: ${setErr.message}`);

  for (const s of setDeactivate) {
    await supa.from('permission_sets').update({ is_active: false }).eq('id', s.id);
  }

  // Re-fetch IDs
  const { data: freshPerms } = await supa.from('permissions').select('id,key');
  const { data: freshSets } = await supa.from('permission_sets').select('id,key');
  const permIdByKey = Object.fromEntries(freshPerms.map(p => [p.key, p.id]));
  const setIdByKey = Object.fromEntries(freshSets.map(s => [s.key, s.id]));

  // 3. Rebuild permission_set_perms
  await supa.from('permission_set_perms').delete().neq('permission_id', '00000000-0000-0000-0000-000000000000');
  const pspRows = setLinkRows
    .map(r => ({ permission_id: permIdByKey[r.permission_key], permission_set_id: setIdByKey[r.set_key] }))
    .filter(r => r.permission_id && r.permission_set_id);
  for (let i = 0; i < pspRows.length; i += 200) {
    const chunk = pspRows.slice(i, i + 200);
    const { error } = await supa.from('permission_set_perms').insert(chunk);
    if (error) throw new Error(`permission_set_perms: ${error.message}`);
    process.stdout.write(`  psp insert ${i + chunk.length}/${pspRows.length}\r`);
  }
  process.stdout.write('\n');

  // 4. Rebuild role_permission_sets
  const roleIdByName = Object.fromEntries(dbRoles.map(r => [r.name, r.id]));
  await supa.from('role_permission_sets').delete().neq('role_id', '00000000-0000-0000-0000-000000000000');
  const rpsRows = roleLinkRows
    .map(r => ({ role_id: roleIdByName[r.role_name], permission_set_id: setIdByKey[r.set_key] }))
    .filter(r => r.role_id && r.permission_set_id);
  const { error: rpsErr } = await supa.from('role_permission_sets').insert(rpsRows);
  if (rpsErr) throw new Error(`role_permission_sets: ${rpsErr.message}`);
  console.log(`  inserted ${rpsRows.length} role→set links`);

  // 5. Rebuild plan_permission_sets
  const planIdByName = Object.fromEntries(dbPlans.map(p => [p.name, p.id]));
  await supa.from('plan_permission_sets').delete().neq('plan_id', '00000000-0000-0000-0000-000000000000');
  const ppsRows = planLinkRows
    .map(r => ({ plan_id: planIdByName[r.plan_name], permission_set_id: setIdByKey[r.set_key] }))
    .filter(r => r.plan_id && r.permission_set_id);
  const { error: ppsErr } = await supa.from('plan_permission_sets').insert(ppsRows);
  if (ppsErr) throw new Error(`plan_permission_sets: ${ppsErr.message}`);
  console.log(`  inserted ${ppsRows.length} plan→set links`);

  // 6. Bump perms_global_version
  const { error: bumpErr } = await supa.rpc('bump_perms_global_version');
  if (bumpErr) throw new Error(`bump_perms_global_version: ${bumpErr.message}`);
  const { data: gv } = await supa.from('perms_global_version').select('version').eq('id', 1).single();
  console.log(`  perms_global_version bumped → ${gv?.version ?? 'unknown'}`);

  console.log('\n=== DONE ===');
}

main().catch(err => { console.error(err); process.exit(1); });
