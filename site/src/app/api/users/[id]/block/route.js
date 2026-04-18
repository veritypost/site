import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// POST /api/users/[id]/block — toggle block.
// D39: available to all verified users.
export async function POST(request, { params }) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  if (!user.email_verified) {
    return NextResponse.json({ error: 'verify email to block' }, { status: 403 });
  }
  const { id: targetId } = params;
  if (targetId === user.id) {
    return NextResponse.json({ error: 'cannot block yourself' }, { status: 400 });
  }

  const { reason } = await request.json().catch(() => ({}));
  const service = createServiceClient();

  const { data: existing } = await service
    .from('blocked_users')
    .select('id')
    .eq('blocker_id', user.id)
    .eq('blocked_id', targetId)
    .maybeSingle();

  if (existing) {
    await service.from('blocked_users').delete().eq('id', existing.id);
    return NextResponse.json({ blocked: false });
  }
  await service.from('blocked_users').insert({
    blocker_id: user.id,
    blocked_id: targetId,
    reason: reason || null,
  });
  return NextResponse.json({ blocked: true });
}
