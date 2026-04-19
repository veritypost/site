// @admin-verified 2026-04-19
// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';

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
  try { actor = await requirePermission('admin.billing.override_plan'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const targetId = params?.id;
  if (!targetId) return NextResponse.json({ error: 'user id required' }, { status: 400 });

  const { plan_name } = await request.json().catch(() => ({}));
  if (!plan_name || typeof plan_name !== 'string') {
    return NextResponse.json({ error: 'plan_name required' }, { status: 400 });
  }

  if (targetId !== actor.id) {
    const authed = createClient();
    const { data: outranks, error: rankErr } = await authed.rpc('require_outranks', {
      target_user_id: targetId,
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

  let update;
  if (plan_name === 'free') {
    update = { plan_id: null, plan_status: 'free' };
  } else {
    const { data: planRow, error: planErr } = await service
      .from('plans')
      .select('id')
      .eq('name', plan_name)
      .maybeSingle();
    if (planErr) return NextResponse.json({ error: planErr.message }, { status: 500 });
    if (!planRow) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    update = { plan_id: planRow.id, plan_status: 'active' };
  }

  const { error: upErr } = await service
    .from('users')
    .update(update)
    .eq('id', targetId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  try {
    await service.from('audit_log').insert({
      actor_id: actor.id,
      action: 'plan.set',
      target_type: 'user',
      target_id: targetId,
      metadata: { plan: plan_name },
    });
  } catch { /* best-effort */ }

  const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
    p_user_id: targetId,
  });
  if (bumpErr) console.error('[plan.set] perms_version bump failed:', bumpErr.message);

  return NextResponse.json({ ok: true });
}
