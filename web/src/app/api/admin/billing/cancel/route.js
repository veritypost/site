// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// Admin-triggered cancellation. D40 flow: DMs off immediately,
// 7-day grace, then freeze.
//
// F-035: actor must strictly outrank the target. An admin (80) can
// cancel anyone at or below admin; only the owner can cancel another
// owner. Without this, any admin could freeze the owner out of their
// own subscription.
export async function POST(request) {
  let user;
  try { user = await requirePermission('admin.billing.cancel'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { user_id, reason } = await request.json();
  if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

  if (user_id !== user.id) {
    // Q6 — server-side rank guard via require_outranks RPC.
    const authed = createClient();
    const { data: outranks, error: rankErr } = await authed.rpc('require_outranks', {
      target_user_id: user_id,
    });
    if (rankErr) return NextResponse.json({ error: rankErr.message }, { status: 500 });
    if (!outranks) {
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
