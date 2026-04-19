// @migrated-to-permissions 2026-04-18
// @feature-verified follow 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// POST /api/follows — toggle follow (paid-only, D28).
// Body: { target_user_id }
export async function POST(request) {
  let user;
  try { user = await requirePermission('profile.follow'); }
  catch (err) { if (err.status) return NextResponse.json({ error: err.message }, { status: err.status }); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }

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
