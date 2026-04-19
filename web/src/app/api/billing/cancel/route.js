// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
// @feature-verified subscription 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// D40: user cancels → DMs revoked immediately, 7-day grace for
// everything else, freeze on day 7. This endpoint flips the DB
// state; Stripe cancellation will be wired in a later sub-phase.
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('billing.cancel.own');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  let reason = null;
  try {
    const body = await request.json();
    reason = body?.reason || null;
  } catch {}

  const service = createServiceClient();
  const { data, error } = await service.rpc('billing_cancel_subscription', {
    p_user_id: user.id,
    p_reason: reason,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data);
}
