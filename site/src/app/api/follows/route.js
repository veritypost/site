import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// POST /api/follows — toggle follow (paid-only, D28).
// Body: { target_user_id }
export async function POST(request) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const { target_user_id } = await request.json().catch(() => ({}));
  if (!target_user_id) return NextResponse.json({ error: 'target_user_id required' }, { status: 400 });

  const service = createServiceClient();
  const { data, error } = await service.rpc('toggle_follow', {
    p_follower_id: user.id,
    p_target_id: target_user_id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
