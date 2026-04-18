import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';

// POST /api/recap/[id]/submit — grade a recap attempt.
// Body: { answers: [{ question_id, selected_answer:int }] }
export async function POST(request, { params }) {
  const blocked = await v2LiveGuard(); if (blocked) return blocked;
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const { answers } = await request.json().catch(() => ({}));
  if (!Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ error: 'answers[] required' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: paid } = await service.rpc('_user_is_paid', { p_user_id: user.id });
  if (!paid) return NextResponse.json({ error: 'Verity+ only (D36)' }, { status: 403 });

  const { data, error } = await service.rpc('submit_recap_attempt', {
    p_user_id: user.id,
    p_recap_quiz_id: params.id,
    p_answers: answers,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
