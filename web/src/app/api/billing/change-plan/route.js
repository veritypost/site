// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
// @feature-verified subscription 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// Upgrade/downgrade between paid plans. DB-state-only for now;
// Stripe proration lands when webhooks are wired.
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('billing.change_plan');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const { planName } = await request.json();
  if (!planName) {
    return NextResponse.json({ error: 'planName required' }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: plan, error: planErr } = await service
    .from('plans')
    .select('id, tier')
    .eq('name', planName)
    .maybeSingle();
  if (planErr || !plan) {
    return NextResponse.json({ error: 'Unknown plan' }, { status: 404 });
  }

  const { data, error } = await service.rpc('billing_change_plan', {
    p_user_id: user.id,
    p_new_plan_id: plan.id,
  });
  if (error) {
    return safeErrorResponse(NextResponse, error, { route: 'billing.change_plan', fallbackStatus: 400 });
  }
  return NextResponse.json(data);
}
