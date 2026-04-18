import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { getMaxRoleLevel } from '@/lib/roles';

// Skip grace and freeze immediately (D40). Use when an admin
// needs to close out a user past their grace window without
// waiting for the nightly sweeper, or to short-circuit grace.
//
// F-035: actor-outranks-target required (see billing/cancel).
export async function POST(request) {
  let user;
  try { user = await requireRole('admin'); }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }

  const { user_id } = await request.json();
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
  const { data, error } = await service.rpc('billing_freeze_profile', { p_user_id: user_id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
