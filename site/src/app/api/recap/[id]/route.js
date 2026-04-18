import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// GET /api/recap/[id] — fetch the recap + its questions (options
// stripped of is_correct so the client can't cheat).
export async function GET(_request, { params }) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const service = createServiceClient();
  const { data: paid } = await service.rpc('_user_is_paid', { p_user_id: user.id });
  if (!paid) return NextResponse.json({ error: 'Verity+ only (D36)' }, { status: 403 });

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
  const safeQuestions = (questions || []).map(q => ({
    ...q,
    options: (q.options || []).map(o => ({ text: o.text })),
  }));

  return NextResponse.json({ recap, questions: safeQuestions });
}
