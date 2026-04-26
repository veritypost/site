// @migrated-to-permissions 2026-04-18
// @feature-verified expert_queue 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';

export async function POST(_request, { params }) {
  let user;
  try {
    user = await requirePermission('expert.queue.claim');
  } catch (err) {
    if (err.status) {
      console.error('[expert.queue.[id].claim.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `expert-claim:${user.id}`,
    policyKey: 'expert-claim',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Claiming too quickly. Wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const { error } = await service.rpc('claim_queue_item', {
    p_user_id: user.id,
    p_queue_item_id: params.id,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'expert.queue.id.claim',
      fallbackStatus: 400,
    });
  return NextResponse.json({ ok: true });
}
