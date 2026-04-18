import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// POST /api/admin/recap/[id]/questions — add a question.
// Body: { article_id?, question_text, options: [{text, is_correct}], explanation?, sort_order? }
export async function POST(request, { params }) {
  try { await requireRole('editor'); }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }

  const b = await request.json().catch(() => ({}));
  if (!b.question_text || !Array.isArray(b.options) || b.options.length < 2) {
    return NextResponse.json({ error: 'question_text + 2+ options required' }, { status: 400 });
  }
  if (b.options.filter(o => o.is_correct).length !== 1) {
    return NextResponse.json({ error: 'exactly one option must be marked correct' }, { status: 400 });
  }
  const service = createServiceClient();
  const { data, error } = await service.from('weekly_recap_questions').insert({
    recap_quiz_id: params.id,
    article_id: b.article_id || null,
    question_text: b.question_text,
    options: b.options,
    explanation: b.explanation || null,
    sort_order: b.sort_order || 0,
  }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}
