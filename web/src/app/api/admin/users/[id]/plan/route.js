// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';
import { recordAdminAction, requireAdminOutranks } from '@/lib/adminMutation';

// PATCH /api/admin/users/[id]/plan  { plan_name }
//
// Round A (C-05) — /admin/users/page.tsx used to update
//   supabase.from('users').update({ plan_id, plan_status }).eq('id', ...)
// directly. The `reject_privileged_user_updates` trigger already blocked
// this, but the client call 42501'd invisibly. Route the change through
// service-role, same rank-guard pattern used by other admin endpoints.
//
// plan_name === 'free' clears plan_id and flips plan_status to 'free'.
// Anything else resolves plans.id by plan.name and sets plan_status='active'.
export async function PATCH(request, { params }) {
  let actor;
  try {
    actor = await requirePermission('admin.billing.override_plan');
  } catch (err) {
    if (err.status) {
      console.error('[admin.users.[id].plan.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const targetId = params?.id;
  if (!targetId) return NextResponse.json({ error: 'user id required' }, { status: 400 });

  const { plan_name } = await request.json().catch(() => ({}));
  if (!plan_name || typeof plan_name !== 'string') {
    return NextResponse.json({ error: 'plan_name required' }, { status: 400 });
  }

  const rankErr = await requireAdminOutranks(targetId, actor.id);
  if (rankErr) return rankErr;

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.users.plan:${actor.id}`,
    policyKey: 'admin.users.plan',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  let update;
  if (plan_name === 'free') {
    update = { plan_id: null, plan_status: 'free' };
  } else {
    const { data: planRow, error: planErr } = await service
      .from('plans')
      .select('id')
      .eq('name', plan_name)
      .maybeSingle();
    if (planErr)
      return safeErrorResponse(NextResponse, planErr, {
        route: 'admin.users.plan',
        fallbackStatus: 500,
        fallbackMessage: 'Plan lookup failed',
      });
    if (!planRow) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    update = { plan_id: planRow.id, plan_status: 'active' };
  }

  const { error: upErr } = await service.from('users').update(update).eq('id', targetId);
  if (upErr)
    return safeErrorResponse(NextResponse, upErr, {
      route: 'admin.users.plan',
      fallbackStatus: 500,
      fallbackMessage: 'Could not update plan',
    });

  await recordAdminAction({
    action: 'plan.set',
    targetTable: 'users',
    targetId: targetId,
    newValue: { plan: plan_name },
  });

  const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
    p_user_id: targetId,
  });
  if (bumpErr) console.error('[plan.set] perms_version bump failed:', bumpErr.message);

  return NextResponse.json({ ok: true });
}
