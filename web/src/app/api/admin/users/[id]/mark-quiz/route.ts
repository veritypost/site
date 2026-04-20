// T-005 — server route for admin/users "Mark quiz completed" action.
// Replaces direct `supabase.from('quiz_attempts').insert(...)`.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

type Body = { slug?: string; score?: number };

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const targetId = params?.id;
  if (!targetId) return NextResponse.json({ error: 'user id required' }, { status: 400 });

  let actor;
  try { actor = await requirePermission('admin.users.mark_quiz'); }
  catch (err) { return permissionError(err); }
  void actor;

  const body = (await request.json().catch(() => ({}))) as Body;
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const score = Number(body.score);
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!Number.isFinite(score) || score < 0) {
    return NextResponse.json({ error: 'score must be a non-negative number' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: story } = await service
    .from('articles')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (!story) return NextResponse.json({ error: `No article with slug "${slug}"` }, { status: 404 });

  const { data: pool } = await service
    .from('quizzes')
    .select('id')
    .eq('article_id', story.id)
    .eq('is_active', true);
  const total = (pool || []).length;
  if (total === 0) {
    return NextResponse.json({ error: `No active quiz questions for "${slug}"` }, { status: 400 });
  }

  const { error } = await service.from('quiz_attempts').insert({
    user_id: targetId,
    article_id: story.id,
    quiz_id: pool![0].id,
    is_correct: score >= Math.ceil(total * 0.6),
    selected_answer: `admin_manual:${score}/${total}`,
    attempt_number: 1,
    points_earned: score,
  });
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
