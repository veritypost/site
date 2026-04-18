import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// POST /api/expert/queue/[id]/answer
// Body: { body }
export async function POST(request, { params }) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const { body } = await request.json().catch(() => ({}));
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const service = createServiceClient();
  const { data, error } = await service.rpc('post_expert_answer', {
    p_user_id: user.id,
    p_queue_item_id: params.id,
    p_body: body,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
