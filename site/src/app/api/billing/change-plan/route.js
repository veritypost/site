import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// Upgrade/downgrade between paid plans. DB-state-only for now;
// Stripe proration lands when webhooks are wired.
export async function POST(request) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
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
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data);
}
