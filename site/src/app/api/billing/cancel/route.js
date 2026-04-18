import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// D40: user cancels → DMs revoked immediately, 7-day grace for
// everything else, freeze on day 7. This endpoint flips the DB
// state; Stripe cancellation will be wired in a later sub-phase.
export async function POST(request) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
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
