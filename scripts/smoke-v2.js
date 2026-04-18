#!/usr/bin/env node
// ============================================================
// Verity Post — v2 end-to-end smoke test
// ============================================================
// Exercises the full v2 RPC surface against a real (staging)
// Supabase project:
//   1. Sign up + verify a disposable user (service-role admin confirm)
//   2. Create an article + a 10-question quiz pool (needed to pass D1)
//   3. start_quiz_attempt + submit_quiz_attempt — verify pass
//   4. post_comment — verify it lands
//   5. toggle_vote + toggle_context_tag
//   6. create a bookmark (verify cap trigger exists on free)
//   7. billing_change_plan then billing_cancel_subscription then
//      billing_freeze_profile then billing_resubscribe
//   8. Teardown — delete user, article, quizzes (cascades)
//
// Usage:
//   node scripts/smoke-v2.js
// ============================================================

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

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) { console.error('Missing Supabase env'); process.exit(1); }
const db = createClient(URL, SERVICE, { auth: { persistSession: false } });

let failures = 0;
const pass = m => console.log(`  ✓ ${m}`);
const fail = (m, err) => { console.error(`  ✗ ${m}`, err?.message || err || ''); failures++; };

function nowTag() { return Date.now().toString(36); }

async function rpc(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data;
}

async function main() {
  console.log('\n=== v2 smoke test ===\n');
  const tag = nowTag();
  const email = `smoke-${tag}@verity.test`;

  // 1. Create user via admin API.
  const { data: { user: authUser }, error: signupErr } = await db.auth.admin.createUser({
    email, password: `Smoke_${tag}_PW!`, email_confirm: true,
  });
  if (signupErr) { fail('signup', signupErr); process.exit(1); }
  pass(`user ${authUser.id.slice(0, 8)} created + verified`);

  const userId = authUser.id;
  let articleId, quizIds = [], commentId;

  try {
    // 2. Seed article + category + 10 quiz questions.
    const { data: cat } = await db.from('categories').select('id').limit(1).single();
    const categoryId = cat.id;

    const { data: article } = await db.from('articles').insert({
      title: `Smoke article ${tag}`,
      slug: `smoke-${tag}`,
      body: 'Body. '.repeat(50),
      category_id: categoryId,
      status: 'published',
      published_at: new Date().toISOString(),
    }).select('id').single();
    articleId = article.id;
    pass(`article ${articleId.slice(0, 8)} created`);

    // 10 questions, option 0 always correct.
    const rows = Array.from({ length: 10 }, (_, i) => ({
      article_id: articleId,
      title: `Q${i + 1}`,
      question_text: `Smoke question ${i + 1}?`,
      options: [{ text: 'yes', is_correct: true }, { text: 'no', is_correct: false },
                { text: 'maybe', is_correct: false }, { text: 'other', is_correct: false }],
      explanation: 'Because.',
      is_active: true, approval_status: 'approved',
    }));
    const { data: qs } = await db.from('quizzes').insert(rows).select('id');
    quizIds = qs.map(r => r.id);
    pass(`quiz pool of ${quizIds.length}`);

    // 3. Start + submit a quiz attempt — all correct.
    const startRes = await rpc('start_quiz_attempt', {
      p_user_id: userId, p_article_id: articleId, p_kid_profile_id: null,
    });
    if (!startRes.questions || startRes.questions.length !== 5) throw new Error('expected 5 questions');
    pass('start_quiz_attempt returned 5 questions');

    const answers = startRes.questions.map(q => ({ quiz_id: q.id, selected_answer: 0 }));
    const submitRes = await rpc('submit_quiz_attempt', {
      p_user_id: userId, p_article_id: articleId, p_answers: answers,
      p_kid_profile_id: null, p_time_taken_seconds: 30,
    });
    if (!submitRes.passed) throw new Error(`expected pass, got ${submitRes.correct}/5`);
    pass(`submit_quiz_attempt passed (${submitRes.correct}/5)`);

    const passedCheck = await rpc('user_passed_article_quiz', {
      p_user_id: userId, p_article_id: articleId,
    });
    passedCheck ? pass('user_passed_article_quiz = true') : fail('user_passed_article_quiz should be true');

    // 4. Post a comment (uses the quiz-gate internally).
    const posted = await rpc('post_comment', {
      p_user_id: userId, p_article_id: articleId,
      p_body: `Smoke comment ${tag}`, p_parent_id: null, p_mentions: [],
    });
    commentId = posted.id;
    pass(`post_comment → ${commentId.slice(0, 8)}`);

    // 5. toggle_vote + toggle_context_tag
    const vote1 = await rpc('toggle_vote', {
      p_user_id: userId, p_comment_id: commentId, p_vote_type: 'upvote',
    });
    vote1.up === 1 ? pass('upvote recorded') : fail(`unexpected up count: ${vote1.up}`);
    const vote2 = await rpc('toggle_vote', {
      p_user_id: userId, p_comment_id: commentId, p_vote_type: 'clear',
    });
    vote2.up === 0 ? pass('vote cleared') : fail(`clear failed: up=${vote2.up}`);

    const tagRes = await rpc('toggle_context_tag', {
      p_user_id: userId, p_comment_id: commentId,
    });
    tagRes.tagged ? pass(`context tag (${tagRes.count}/${tagRes.threshold} to pin)`) : fail('tag should be true');

    // 6. Bookmark (free tier; cap trigger should allow first one).
    const { error: bmErr } = await db.from('bookmarks')
      .insert({ user_id: userId, article_id: articleId });
    bmErr ? fail('bookmark insert', bmErr) : pass('bookmark created (cap trigger allowed)');

    // 7. Billing round-trip. Change to verity_monthly, cancel, freeze, resubscribe.
    const { data: verityPlan } = await db.from('plans').select('id').eq('name', 'verity_monthly').single();
    await rpc('billing_change_plan', { p_user_id: userId, p_new_plan_id: verityPlan.id });
    pass('billing_change_plan → verity_monthly');

    await rpc('billing_cancel_subscription', { p_user_id: userId, p_reason: 'smoke' });
    pass('billing_cancel_subscription (grace started)');

    await rpc('billing_freeze_profile', { p_user_id: userId });
    const { data: frozen } = await db.from('users')
      .select('frozen_at, frozen_verity_score').eq('id', userId).single();
    frozen.frozen_at ? pass('billing_freeze_profile (frozen_at set)') : fail('profile not frozen');

    const resub = await rpc('billing_resubscribe', { p_user_id: userId, p_new_plan_id: verityPlan.id });
    resub.was_frozen ? pass(`billing_resubscribe (restored score=${resub.restored_score})`) : fail('resubscribe: was_frozen false');

    // 8. Notification creation — create_notification returns an id
    // (or null if alert_preferences explicitly opts the user out).
    const notifId = await rpc('create_notification', {
      p_user_id: userId, p_type: 'test_smoke',
      p_title: `Smoke ${tag}`, p_body: null, p_action_url: null,
      p_action_type: null, p_action_id: null,
      p_priority: 'normal', p_metadata: {},
    });
    notifId ? pass(`create_notification → ${String(notifId).slice(0, 8)}`) : pass('create_notification returned null (opted out — acceptable)');

    // 9. Kid trial lifecycle — start, verify stored, convert to family.
    const kidId = await rpc('start_kid_trial', {
      p_user_id: userId, p_display_name: `Smoke Kid ${tag}`,
      p_avatar_color: '#f59e0b', p_pin_hash: null, p_date_of_birth: null,
    });
    kidId ? pass(`start_kid_trial → ${kidId.slice(0, 8)}`) : fail('start_kid_trial returned null');

    const { data: kidRow } = await db.from('kid_profiles')
      .select('is_active, metadata').eq('id', kidId).single();
    kidRow?.is_active && kidRow?.metadata?.trial === true
      ? pass('kid profile active + trial metadata stamped')
      : fail(`kid profile unexpected state: ${JSON.stringify(kidRow)}`);

    const { data: familyPlan } = await db.from('plans').select('id').eq('name', 'verity_family_monthly').single();
    await rpc('billing_change_plan', { p_user_id: userId, p_new_plan_id: familyPlan.id });
    const { data: kidAfter } = await db.from('kid_profiles')
      .select('is_active, metadata').eq('id', kidId).single();
    kidAfter?.metadata?.trial_converted_at
      ? pass('convert_kid_trial fired on Family upgrade (D44)')
      : fail('convert_kid_trial did not fire');

    // 10. Family aggregates — family_members returns the owner + kid.
    const members = await rpc('family_members', { p_owner_id: userId });
    (members || []).length >= 1
      ? pass(`family_members returned ${(members || []).length} row(s)`)
      : fail('family_members returned empty');

    // 11. Ad serving — asserts the RPC is reachable. No ad placement
    // seed required; returning NULL for an unknown placement is the
    // expected "no match" path.
    const served = await rpc('serve_ad', {
      p_placement_name: 'smoke_nonexistent', p_user_id: userId,
      p_article_id: null, p_session_id: null,
    });
    served === null || served?.ad_unit_id
      ? pass(`serve_ad reachable (got ${served === null ? 'null' : 'unit'})`)
      : fail(`serve_ad unexpected shape: ${JSON.stringify(served)}`);

    // 12. Quiet-hours predicate — midnight spanner (22:00 -> 07:00).
    const qhCases = [
      { at: '23:00', expect: true,  label: '23:00 inside 22→07' },
      { at: '03:00', expect: true,  label: '03:00 inside 22→07' },
      { at: '07:00', expect: false, label: '07:00 boundary excluded' },
      { at: '12:00', expect: false, label: '12:00 outside' },
      { at: '22:00', expect: true,  label: '22:00 boundary included' },
      { at: '21:59', expect: false, label: '21:59 outside' },
    ];
    for (const c of qhCases) {
      const v = await rpc('_is_in_quiet_hours', {
        p_start: '22:00', p_end: '07:00', p_at: c.at,
      });
      v === c.expect ? pass(`quiet hours: ${c.label}`) : fail(`quiet hours: ${c.label} — got ${v}`);
    }

  } catch (err) {
    fail('flow', err);
  } finally {
    // 13. Teardown.
    try {
      if (articleId) {
        await db.from('comments').delete().eq('article_id', articleId);
        await db.from('quiz_attempts').delete().eq('article_id', articleId);
        await db.from('bookmarks').delete().eq('article_id', articleId);
        await db.from('quizzes').delete().eq('article_id', articleId);
        await db.from('articles').delete().eq('id', articleId);
      }
      await db.from('kid_profiles').delete().eq('parent_user_id', userId);
      await db.from('notifications').delete().eq('user_id', userId);
      await db.auth.admin.deleteUser(userId);
      pass('teardown complete');
    } catch (err) {
      fail('teardown', err);
    }
  }

  console.log(`\n=== ${failures === 0 ? 'PASS' : failures + ' FAILURES'} ===\n`);
  process.exit(failures ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
