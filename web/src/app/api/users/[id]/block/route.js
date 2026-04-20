// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

// POST /api/users/[id]/block — toggle block.
// D39: available to all verified users.
export async function POST(request, { params }) {
  let user;
  try { user = await requirePermission('settings.privacy.blocked_users.manage'); }
  catch (err) { if (err.status) return NextResponse.json({ error: err.message }, { status: err.status }); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }

  if (!user.email_verified) {
    return NextResponse.json({ error: 'verify email to block' }, { status: 403 });
  }
  const { id: targetId } = params;
  if (targetId === user.id) {
    return NextResponse.json({ error: 'cannot block yourself' }, { status: 400 });
  }

  const { reason } = await request.json().catch(() => ({}));
  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `users-block:${user.id}`,
    policyKey: 'users_block',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

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
