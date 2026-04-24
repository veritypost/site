// @migrated-to-permissions 2026-04-18
// @feature-verified quiz 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { assertKidOwnership } from '@/lib/kids';
import { createServiceClient } from '@/lib/supabase/server';
import { scoreQuizSubmit, checkAchievements } from '@/lib/scoring';
import { v2LiveGuard } from '@/lib/featureFlags';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(request) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;
  let user;
  try {
    user = await requirePermission('quiz.attempt.submit');
  } catch (err) {
    {
      console.error('[quiz.submit.permission]', err?.message || err);
      return NextResponse.json(
        { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err?.status || 401 }
      );
    }
  }

  const body = await request.json().catch(() => ({}));
  const { article_id, answers, kid_profile_id, time_taken_seconds } = body || {};

  if (!article_id || !Array.isArray(answers)) {
    return NextResponse.json({ error: 'article_id and answers[] required' }, { status: 400 });
  }
  for (const a of answers) {
    if (!a?.quiz_id || typeof a.selected_answer !== 'number') {
      return NextResponse.json(
        { error: 'each answer needs {quiz_id, selected_answer:int}' },
        { status: 400 }
      );
    }
  }

  if (kid_profile_id) {
    try {
      await assertKidOwnership(kid_profile_id, { userId: user.id });
    } catch {
      return NextResponse.json({ error: 'Kid profile not accessible' }, { status: 403 });
    }
  }

  const service = createServiceClient();

  // Validate length against the article's actual quiz count rather than
  // hardcoded 5 — quiz length is DB-driven (submit_quiz_attempt reads
  // quizzes by article_id) and weekly recap / future variable-length
  // quizzes want different counts. Previously rejected any length !== 5.
  const { count: quizCount, error: countErr } = await service
    .from('quizzes')
    .select('*', { count: 'exact', head: true })
    .eq('article_id', article_id);
  if (countErr) {
    console.error('[quiz.submit] count quizzes', countErr);
    return NextResponse.json({ error: 'Could not validate quiz' }, { status: 500 });
  }
  if (!quizCount || quizCount === 0) {
    return NextResponse.json({ error: 'No quiz for this article' }, { status: 400 });
  }
  if (answers.length !== quizCount) {
    return NextResponse.json({ error: `Expected ${quizCount} answers` }, { status: 400 });
  }

  // Rate-limit: 30 submits per minute per user. Generous enough for
  // legitimate retries / multi-tab edge cases; tight enough to stop a
  // scripted attempt to brute-force quiz answers.
  const rate = await checkRateLimit(service, {
    key: `quiz_submit:${user.id}`,
    policyKey: 'quiz_submit',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many quiz submissions. Slow down.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  const { data, error } = await service.rpc('submit_quiz_attempt', {
    p_user_id: user.id,
    p_article_id: article_id,
    p_answers: answers,
    p_kid_profile_id: kid_profile_id || null,
    p_time_taken_seconds: time_taken_seconds || null,
  });
  if (error) {
    console.error('[quiz.submit]', error);
    return NextResponse.json({ error: 'Could not submit quiz' }, { status: 400 });
  }

  let scoring = null;
  if (data?.attempt_number) {
    scoring = await scoreQuizSubmit(service, {
      userId: user.id,
      kidProfileId: kid_profile_id || null,
      articleId: article_id,
      attemptNumber: data.attempt_number,
    });
    if (scoring?.error) {
      console.error('score_on_quiz_submit failed', scoring.error);
      scoring = null;
    }
  }

  const newAchievements = data?.passed ? await checkAchievements(service, { userId: user.id }) : [];

  return NextResponse.json({ ...data, scoring, newAchievements });
}
