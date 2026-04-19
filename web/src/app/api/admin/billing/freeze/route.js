// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// Skip grace and freeze immediately (D40). Use when an admin
// needs to close out a user past their grace window without
// waiting for the nightly sweeper, or to short-circuit grace.
//
// F-035: actor-outranks-target required (see billing/cancel).
export async function POST(request) {
  let user;
  try { user = await requirePermission('admin.billing.freeze'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { user_id } = await request.json();
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
  const { data, error } = await service.rpc('billing_freeze_profile', { p_user_id: user_id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
