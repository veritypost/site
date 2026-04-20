// @migrated-to-permissions 2026-04-18
// @feature-verified follow 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

// POST /api/follows — toggle follow (paid-only, D28).
// Body: { target_user_id }
export async function POST(request) {
  let user;
  try { user = await requirePermission('profile.follow'); }
  catch (err) {
    console.error('[follows.POST]', err);
    if (err.status) {
      return NextResponse.json({ error: 'Not allowed to follow' }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const { target_user_id } = await request.json().catch(() => ({}));
  if (!target_user_id) return NextResponse.json({ error: 'target_user_id required' }, { status: 400 });

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `follows:${user.id}`,
    max: 60,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const { data, error } = await service.rpc('toggle_follow', {
    p_follower_id: user.id,
    p_target_id: target_user_id,
  });
  if (error) {
    console.error('[follows.POST]', error);
    return NextResponse.json({ error: 'Could not update follow' }, { status: 400 });
  }
  return NextResponse.json(data);
}
