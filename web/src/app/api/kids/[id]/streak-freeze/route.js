// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

export async function POST(_request, { params }) {
  let user;
  try {
    user = await requirePermission('kids.streak.freeze.use');
  } catch (err) {
    {
      console.error('[kids.[id].streak-freeze.permission]', err?.message || err);
      return NextResponse.json({ error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' }, { status: err?.status || 401 });
    }
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('use_kid_streak_freeze', {
    p_parent_id: user.id,
    p_kid_profile_id: params.id,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'kids.id.streak_freeze',
      fallbackStatus: 400,
    });
  return NextResponse.json(data);
}
