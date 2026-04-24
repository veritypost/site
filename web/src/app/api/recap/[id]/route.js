// @migrated-to-permissions 2026-04-18
// @feature-verified recap 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(_request, { params }) {
  try {
    await requirePermission('recap.list.view');
  } catch (err) {
    {
      console.error('[recap.[id].permission]', err?.message || err);
      return NextResponse.json(
        { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err?.status || 401 }
      );
    }
  }

  const service = createServiceClient();

  const { data: recap } = await service
    .from('weekly_recap_quizzes')
    .select('*, categories(name)')
    .eq('id', params.id)
    .maybeSingle();
  if (!recap) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: questions } = await service
    .from('weekly_recap_questions')
    .select('id, article_id, question_text, options, sort_order')
    .eq('recap_quiz_id', params.id)
    .order('sort_order');

  // Strip is_correct from options before returning.
  const safeQuestions = (questions || []).map((q) => ({
    ...q,
    options: (q.options || []).map((o) => ({ text: o.text })),
  }));

  return NextResponse.json({ recap, questions: safeQuestions });
}
