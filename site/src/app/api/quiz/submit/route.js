import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { assertKidOwnership } from '@/lib/kids';
import { createServiceClient } from '@/lib/supabase/server';
import { scoreQuizSubmit, checkAchievements } from '@/lib/scoring';
import { v2LiveGuard } from '@/lib/featureFlags';

// D1 / D41 / D8: submit a full 5-answer quiz attempt. The RPC
// grades server-side, inserts 5 quiz_attempts rows atomically,
// and returns pass/fail, per-question explanations, remaining
// attempts, and live percentile.
//
// Body:
//   { article_id, answers: [{quiz_id, selected_answer: int}, ...5],
//     kid_profile_id?, time_taken_seconds? }
export async function POST(request) {
  const blocked = await v2LiveGuard(); if (blocked) return blocked;
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { article_id, answers, kid_profile_id, time_taken_seconds } = body || {};

  if (!article_id || !Array.isArray(answers)) {
    return NextResponse.json({ error: 'article_id and answers[] required' }, { status: 400 });
  }
  if (answers.length !== 5) {
    return NextResponse.json({ error: 'Expected 5 answers' }, { status: 400 });
  }
  for (const a of answers) {
    if (!a?.quiz_id || typeof a.selected_answer !== 'number') {
      return NextResponse.json({ error: 'each answer needs {quiz_id, selected_answer:int}' }, { status: 400 });
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
  const { data, error } = await service.rpc('submit_quiz_attempt', {
    p_user_id: user.id,
    p_article_id: article_id,
    p_answers: answers,
    p_kid_profile_id: kid_profile_id || null,
    p_time_taken_seconds: time_taken_seconds || null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Phase 14: award points and advance streak. Failure here must not
  // block the quiz result — log and continue.
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

  // Best-effort achievement rollup — any DB error is swallowed inside the helper.
  const newAchievements = data?.passed
    ? await checkAchievements(service, { userId: user.id })
    : [];

  return NextResponse.json({ ...data, scoring, newAchievements });
}
