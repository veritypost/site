#!/usr/bin/env node
// Apply seeds 101-104 to live DB via supabase-js service-role client.
// Replicates the SQL files' INSERT...ON CONFLICT behavior without needing
// raw SQL access. Idempotent.
//
// Run: node scripts/apply-seeds-101-104.js

const fs = require('fs');
const path = require('path');

const WEB_DIR = path.resolve(__dirname, '..', 'web');
const { createClient } = require(path.join(WEB_DIR, 'node_modules', '@supabase', 'supabase-js'));

// Load env
for (const line of fs.readFileSync(path.join(WEB_DIR, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// ---------- 101: rate_limits ----------
const RATE_LIMITS = [
  ['login_ip',              'Sign-in attempts (IP)',          'POST /api/auth/login',                        10,   900,  'ip',   true],
  ['login_precheck_ip',     'Login precheck (IP)',            'POST /api/auth/login-precheck by IP',         30,  3600,  'ip',   true],
  ['login_precheck_email',  'Login precheck (email)',         'POST /api/auth/login-precheck by email',       3,  3600,  'user', true],
  ['login_failed_ip',       'Login-failed checks (IP)',       'POST /api/auth/login-failed by IP',           30,  3600,  'ip',   true],
  ['login_failed_email',    'Login-failed checks (email)',    'POST /api/auth/login-failed by email',         3,  3600,  'user', true],
  ['signup_ip',             'Signup attempts (IP)',           'POST /api/auth/signup',                        5,  3600,  'ip',   true],
  ['reset_password_ip',     'Password reset requests (IP)',   'POST /api/auth/reset-password by IP',          5,  3600,  'ip',   true],
  ['reset_password_email',  'Password reset requests (email)','POST /api/auth/reset-password by email',       3,  3600,  'user', true],
  ['check_email_ip',        'Email availability (IP)',        'POST /api/auth/check-email by IP',            30,  3600,  'ip',   true],
  ['check_email_addr',      'Email availability (address)',   'POST /api/auth/check-email by address',       10, 86400,  'user', true],
  ['resolve_username',      'Username lookups',               'POST /api/auth/resolve-username',             10,    60,  'ip',   true],
  ['resend_verify',         'Resend verification email',      'POST /api/auth/resend-verification',           3,  3600,  'user', true],
  ['email_change',          'Email-change attempts',          'POST /api/auth/email-change',                  3,  3600,  'user', true],
  ['account_delete',        'Account delete requests',        'POST /api/account/delete',                     5,  3600,  'user', true],
  ['bookmarks',             'Bookmarks write',                'POST /api/bookmarks',                         60,    60,  'user', true],
  ['follows',               'Follows write',                  'POST /api/follows',                           60,    60,  'user', true],
  ['users_block',           'Block user',                     'POST /api/users/[id]/block',                  30,    60,  'user', true],
  ['reports',               'Submit report',                  'POST /api/reports',                           10,  3600,  'user', true],
  ['appeals',               'Submit appeal',                  'POST /api/appeals',                           10,  3600,  'user', true],
  ['errors',                'Error upload',                   'POST /api/errors',                            60,    60,  'ip',   true],
  ['stripe_checkout',       'Stripe checkout session',        'POST /api/stripe/checkout',                   20,  3600,  'user', true],
  ['expert_apply',          'Expert application submit',      'POST /api/expert/apply',                       5,  3600,  'user', true],
  ['support_public',        'Public support ticket',          'POST /api/support/public',                     5,  3600,  'ip',   true],
  ['access_request',        'Beta access request',            'POST /api/access-request',                     3,  3600,  'ip',   true],
  ['admin_send_email',      'Admin manual email send',        'POST /api/admin/send-email',                   5,  3600,  'user', true],
  ['kids_pair',             'Kid pair (pair-code exchange)',  'POST /api/kids/pair',                         10,    60,  'ip',   true],
  ['kids_generate_pair_code','Kid pair-code generate',        'POST /api/kids/generate-pair-code',           10,    60,  'user', true],
  ['kids_verify_pin',       'Kid PIN verify',                 'POST /api/kids/verify-pin',                   30,    60,  'user', true],
  ['kids_reset_pin',        'Kid PIN reset',                  'POST /api/kids/reset-pin',                     5,  3600,  'user', true],
  ['ads_impression',        'Ad impression log',              'POST /api/ads/impression',                   300,    60,  'ip',   true],
  ['ads_click',             'Ad click log',                   'POST /api/ads/click',                        120,    60,  'ip',   true],
].map(([key, display_name, description, max_requests, window_seconds, scope, is_active]) =>
  ({ key, display_name, description, max_requests, window_seconds, scope, is_active })
);

// ---------- 102: email_templates data_export_ready ----------
const DATA_EXPORT_TEMPLATE = {
  key: 'data_export_ready',
  name: 'Data Export Ready',
  subject: 'Your Verity Post data export is ready',
  body_html: [
    '<p>Hi {{username}},</p>',
    '<p>Your account data export is ready to download.</p>',
    '<p><a href="{{action_url}}">Download your data</a></p>',
    '<p>This link expires in 7 days. If you did not request this export, please <a href="mailto:support@veritypost.com">contact support</a> immediately.</p>',
    '<p>— Verity Post</p>',
  ].join(''),
  body_text: [
    'Hi {{username}},',
    '',
    'Your Verity Post data export is ready.',
    '',
    'Download: {{action_url}}',
    '',
    'This link expires in 7 days. If you did not request this, contact support@veritypost.com.',
  ].join('\n'),
  from_name: 'Verity Post',
  variables: ['username', 'action_url'],
  is_active: true,
};

// ---------- 103: reserved_usernames ----------
const RESERVED = [
  ['admin','system'], ['administrator','system'], ['root','system'], ['system','system'],
  ['superadmin','system'], ['moderator','system'], ['owner','system'], ['official','system'],
  ['staff','system'], ['team','system'], ['support','system'], ['help','system'],
  ['contact','system'], ['info','system'], ['security','system'], ['legal','system'],
  ['privacy','system'], ['abuse','system'], ['noreply','system'], ['no-reply','system'],
  ['postmaster','system'], ['webmaster','system'], ['hostmaster','system'], ['billing','system'],
  ['accounts','system'], ['account','system'],
  ['verity','brand'], ['veritypost','brand'], ['verity_post','brand'], ['verity-post','brand'],
  ['veritynews','brand'], ['editor','brand'], ['editorial','brand'], ['news','brand'], ['press','brand'],
  ['www','route'], ['mail','route'], ['api','route'], ['app','route'], ['auth','route'],
  ['login','route'], ['logout','route'], ['signup','route'], ['signin','route'], ['register','route'],
  ['reset','route'], ['verify','route'], ['welcome','route'], ['settings','route'], ['profile','route'],
  ['home','route'], ['feed','route'], ['search','route'], ['explore','route'], ['discover','route'],
  ['bookmarks','route'], ['messages','route'], ['notifications','route'], ['leaderboard','route'],
  ['story','route'], ['stories','route'], ['article','route'], ['articles','route'],
  ['kids','route'], ['kid','route'], ['family','route'], ['experts','route'], ['expert','route'],
  ['recap','route'], ['about','route'], ['terms','route'], ['tos','route'], ['status','route'],
  ['transparency','route'], ['careers','route'], ['jobs','route'], ['blog','route'],
].map(([username, reason]) => ({ username, reason }));

// ---------- 104: blocked_words ----------
const BLOCKED = [
  ['fuck','medium','flag'], ['fucking','medium','flag'], ['fucker','medium','flag'], ['fuckers','medium','flag'],
  ['shit','medium','flag'], ['shitty','medium','flag'], ['bullshit','medium','flag'],
  ['asshole','medium','flag'], ['assholes','medium','flag'],
  ['bitch','medium','flag'], ['bitches','medium','flag'],
  ['cunt','high','deny'], ['cunts','high','deny'],
  ['dick','medium','flag'], ['dickhead','medium','flag'],
  ['douche','medium','flag'], ['douchebag','medium','flag'],
  ['pussy','medium','flag'], ['bastard','medium','flag'],
  ['piss','low','flag'], ['pissed','low','flag'],
  ['whore','high','deny'], ['slut','high','deny'], ['sluts','high','deny'],
  ['faggot','high','deny'], ['fag','high','deny'],
  ['nigger','high','deny'], ['nigga','high','deny'],
  ['retard','high','deny'], ['retarded','high','deny'],
  ['tranny','high','deny'],
  ['spic','high','deny'], ['kike','high','deny'], ['chink','high','deny'],
].map(([word, severity, action]) => ({ word, severity, action, language: 'en' }));

// ---------- Apply ----------
async function main() {
  console.log('=== Applying seeds 101-104 ===\n');

  console.log(`101 rate_limits — upserting ${RATE_LIMITS.length} rows...`);
  const r1 = await db.from('rate_limits').upsert(RATE_LIMITS, { onConflict: 'key' });
  if (r1.error) { console.error('  FAIL:', r1.error.message); process.exit(1); }
  console.log('  ok');

  console.log('\n102 email_templates — upserting data_export_ready...');
  const r2 = await db.from('email_templates').upsert(DATA_EXPORT_TEMPLATE, { onConflict: 'key' });
  if (r2.error) { console.error('  FAIL:', r2.error.message); process.exit(1); }
  console.log('  ok');

  console.log(`\n103 reserved_usernames — inserting ${RESERVED.length} rows (ignoreDuplicates)...`);
  const r3 = await db.from('reserved_usernames').upsert(RESERVED, { onConflict: 'username', ignoreDuplicates: true });
  if (r3.error) { console.error('  FAIL:', r3.error.message); process.exit(1); }
  console.log('  ok');

  console.log(`\n104 blocked_words — inserting ${BLOCKED.length} rows (ignoreDuplicates)...`);
  const r4 = await db.from('blocked_words').upsert(BLOCKED, { onConflict: 'word', ignoreDuplicates: true });
  if (r4.error) { console.error('  FAIL:', r4.error.message); process.exit(1); }
  console.log('  ok');

  // Verify counts
  console.log('\n=== Verify ===');
  const [{ count: rl }, { count: un }, { count: bw }] = await Promise.all([
    db.from('rate_limits').select('*', { count: 'exact', head: true }),
    db.from('reserved_usernames').select('*', { count: 'exact', head: true }),
    db.from('blocked_words').select('*', { count: 'exact', head: true }),
  ]);
  const { data: tpl } = await db.from('email_templates').select('key').eq('key', 'data_export_ready').maybeSingle();
  console.log(`  rate_limits:        ${rl}`);
  console.log(`  reserved_usernames: ${un}`);
  console.log(`  blocked_words:      ${bw}`);
  console.log(`  data_export_ready template: ${tpl ? 'present' : 'MISSING'}`);
  console.log('\n=== done ===');
}

main().catch(err => { console.error(err); process.exit(1); });
