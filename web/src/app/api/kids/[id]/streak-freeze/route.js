// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';
import { assertKidOwnership } from '@/lib/kids';

export async function POST(_request, { params }) {
  let user;
  try {
    user = await requirePermission('kids.streak.freeze.use');
  } catch (err) {
    {
      console.error('[kids.[id].streak-freeze.permission]', err?.message || err);
      return NextResponse.json(
        { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err?.status || 401 }
      );
    }
  }

  const service = createServiceClient();

  // BugList #1 — pre-check kid ownership + is_active + paused_at parity
  // with the rest of the kid-mutating routes. The RPC enforces ownership
  // at SQL too, but this keeps the lockout semantics consistent (a paused
  // kid shouldn't burn a streak-freeze even if the RPC would allow it).
  try {
    await assertKidOwnership(params.id, { client: service, userId: user.id });
  } catch {
    return NextResponse.json({ error: 'Kid profile not accessible' }, { status: 403 });
  }

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
