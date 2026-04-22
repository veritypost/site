// @migrated-to-permissions 2026-04-18
// @feature-verified recap 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';
import { safeErrorResponse } from '@/lib/apiErrors';

// POST /api/recap/[id]/submit — grade a recap attempt.
// Body: { answers: [{ question_id, selected_answer:int }] }
export async function POST(request, { params }) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;
  let user;
  try {
    user = await requirePermission('recap.list.view');
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 401 });
  }

  const { answers } = await request.json().catch(() => ({}));
  if (!Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ error: 'answers[] required' }, { status: 400 });
  }

  const service = createServiceClient();

  const { data, error } = await service.rpc('submit_recap_attempt', {
    p_user_id: user.id,
    p_recap_quiz_id: params.id,
    p_answers: answers,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'recap.id.submit',
      fallbackStatus: 400,
    });
  return NextResponse.json(data);
}
