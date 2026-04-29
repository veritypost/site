// T-005 — server route for admin/users "Mark quiz completed" action.
// Replaces direct `supabase.from('quiz_attempts').insert(...)`.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction, requireAdminOutranks } from '@/lib/adminMutation';

type Body = { slug?: string; score?: number };

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const targetId = params?.id;
  if (!targetId) return NextResponse.json({ error: 'user id required' }, { status: 400 });

  let actor;
  try {
    actor = await requirePermission('admin.users.mark_quiz');
  } catch (err) {
    return permissionError(err);
  }

  const rankErr = await requireAdminOutranks(targetId, actor.id);
  if (rankErr) return rankErr;

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.users.mark-quiz:${actor.id}`,
    policyKey: 'admin.users.mark-quiz',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const score = Number(body.score);
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!Number.isFinite(score) || score < 0) {
    return NextResponse.json({ error: 'score must be a non-negative number' }, { status: 400 });
  }

  const { data: story } = await service
    .from('articles')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (!story)
    return NextResponse.json({ error: `No article with slug "${slug}"` }, { status: 404 });

  const { data: pool } = await service
    .from('quizzes')
    .select('id')
    .eq('article_id', story.id)
    .eq('is_active', true);
  const total = (pool || []).length;
  if (total === 0) {
    return NextResponse.json({ error: `No active quiz questions for "${slug}"` }, { status: 400 });
  }

  const passed = score >= Math.ceil(total * 0.6);
  const rows = (pool ?? []).map((q) => ({
    user_id: targetId,
    article_id: story.id,
    quiz_id: q.id,
    is_correct: passed,
    selected_answer: `admin_manual:${score}/${total}`,
    attempt_number: 1,
    points_earned: score,
  }));

  const { error } = await service.from('quiz_attempts').insert(rows);
  if (error) {
    console.error('[admin.users.mark-quiz]', error.message);
    return NextResponse.json({ error: 'Could not log quiz' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'user.mark_quiz',
    targetTable: 'quiz_attempts',
    targetId: null,
    newValue: { user_id: targetId, article_id: story.id, score, total },
  });

  return NextResponse.json({ ok: true });
}
