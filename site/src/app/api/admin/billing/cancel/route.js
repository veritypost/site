import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { getMaxRoleLevel } from '@/lib/roles';

// Admin-triggered cancellation. D40 flow: DMs off immediately,
// 7-day grace, then freeze.
//
// F-035: actor must strictly outrank the target. An admin (80) can
// cancel anyone at or below admin; only the owner can cancel another
// owner. Without this, any admin could freeze the owner out of their
// own subscription.
export async function POST(request) {
  let user;
  try { user = await requireRole('admin'); }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }

  const { user_id, reason } = await request.json();
  if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

  if (user_id !== user.id) {
    const actorLevel = await getMaxRoleLevel(user.id);
    const targetLevel = await getMaxRoleLevel(user_id);
    if (actorLevel <= targetLevel) {
      return NextResponse.json(
        { error: 'Cannot act on a user whose rank meets or exceeds your own' },
        { status: 403 }
      );
    }
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('billing_cancel_subscription', {
    p_user_id: user_id,
    p_reason: reason || 'admin cancel',
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
