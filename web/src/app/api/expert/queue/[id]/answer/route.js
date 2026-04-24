// @migrated-to-permissions 2026-04-18
// @feature-verified expert_queue 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// POST /api/expert/queue/[id]/answer
// Body: { body }
export async function POST(request, { params }) {
  let user;
  try {
    user = await requirePermission('expert.answer.submit');
  } catch (err) {
    if (err.status) {
      console.error('[expert.queue.[id].answer.permission]', err?.message || err);
      return NextResponse.json({ error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' }, { status: err.status });
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { body } = await request.json().catch(() => ({}));
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const service = createServiceClient();
  const { data, error } = await service.rpc('post_expert_answer', {
    p_user_id: user.id,
    p_queue_item_id: params.id,
    p_body: body,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'expert.queue.id.answer',
      fallbackStatus: 400,
    });
  return NextResponse.json(data);
}
