// T-005 — server route for admin/features update + toggle + delete.
// Replaces direct supabase writes from admin/features/page.tsx.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

type PatchBody = {
  action?: 'toggle_enabled' | 'toggle_killswitch';
  // Full-edit payload (from the drawer form).
  display_name?: string;
  description?: string | null;
  is_enabled?: boolean;
  rollout_percentage?: number;
  is_killswitch?: boolean;
  expires_at?: string | null;
  target_platforms?: unknown;
  target_min_app_version?: unknown;
  target_max_app_version?: unknown;
  target_min_os_version?: unknown;
  target_user_ids?: unknown;
  target_plan_tiers?: unknown;
  target_countries?: unknown;
  target_cohort_ids?: unknown;
  conditions?: unknown;
  variant?: unknown;
};

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  let permKey = 'admin.features.create'; // full-edit uses the same perm as create
  if (body.action === 'toggle_enabled') permKey = 'admin.features.toggle_enabled';
  else if (body.action === 'toggle_killswitch') permKey = 'admin.features.killswitch';

  let actor;
  try {
    actor = await requirePermission(permKey);
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.features.update:${actor.id}`,
    policyKey: 'admin.features.update',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const { data: prior } = await service
    .from('feature_flags')
    .select('id, key, display_name, is_enabled, is_killswitch, rollout_percentage')
    .eq('id', id)
    .maybeSingle();
  if (!prior) return NextResponse.json({ error: 'Flag not found' }, { status: 404 });

  if (body.action === 'toggle_enabled') {
    if (typeof body.is_enabled !== 'boolean') {
      return NextResponse.json({ error: 'is_enabled required' }, { status: 400 });
    }
    const { error } = await service
      .from('feature_flags')
      .update({ is_enabled: body.is_enabled })
      .eq('id', id);
    if (error) return NextResponse.json({ error: 'Could not toggle flag' }, { status: 500 });
    await recordAdminAction({
      action: 'feature.toggle',
      targetTable: 'feature_flags',
      targetId: id,
      oldValue: { is_enabled: prior.is_enabled, key: prior.key },
      newValue: { is_enabled: body.is_enabled, key: prior.key },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'toggle_killswitch') {
    if (typeof body.is_killswitch !== 'boolean') {
      return NextResponse.json({ error: 'is_killswitch required' }, { status: 400 });
    }
    const { error } = await service
      .from('feature_flags')
      .update({ is_killswitch: body.is_killswitch })
      .eq('id', id);
    if (error) return NextResponse.json({ error: 'Could not toggle killswitch' }, { status: 500 });
    await recordAdminAction({
      action: 'feature.killswitch',
      targetTable: 'feature_flags',
      targetId: id,
      oldValue: { is_killswitch: prior.is_killswitch, key: prior.key },
      newValue: { is_killswitch: body.is_killswitch, key: prior.key },
    });
    return NextResponse.json({ ok: true });
  }

  // Full edit path — drawer "Save changes".
  const update: Record<string, unknown> = {};
  if (typeof body.display_name === 'string') update.display_name = body.display_name.trim();
  if (body.description !== undefined) update.description = body.description || null;
  if (typeof body.is_enabled === 'boolean') update.is_enabled = body.is_enabled;
  if (typeof body.rollout_percentage === 'number') {
    if (body.rollout_percentage < 0 || body.rollout_percentage > 100) {
      return NextResponse.json({ error: 'rollout_percentage must be 0–100' }, { status: 400 });
    }
    update.rollout_percentage = body.rollout_percentage;
  }
  if (typeof body.is_killswitch === 'boolean') update.is_killswitch = body.is_killswitch;
  if (body.expires_at !== undefined) update.expires_at = body.expires_at;
  for (const f of [
    'target_platforms',
    'target_min_app_version',
    'target_max_app_version',
    'target_min_os_version',
    'target_user_ids',
    'target_plan_tiers',
    'target_countries',
    'target_cohort_ids',
    'conditions',
    'variant',
  ] as const) {
    if (body[f] !== undefined) update[f] = body[f];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const { data, error } = await service
    .from('feature_flags')
    // @ts-expect-error — partial shape acceptable at runtime.
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error || !data) {
    console.error('[admin.features.patch]', error?.message);
    return NextResponse.json({ error: 'Could not save flag' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'feature.edit',
    targetTable: 'feature_flags',
    targetId: id,
    oldValue: prior,
    newValue: update,
  });

  return NextResponse.json({ ok: true, row: data });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  let actor;
  try {
    actor = await requirePermission('admin.features.delete');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.features.delete:${actor.id}`,
    policyKey: 'admin.features.delete',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const { data: prior } = await service
    .from('feature_flags')
    .select('id, key, display_name, is_enabled, is_killswitch, rollout_percentage')
    .eq('id', id)
    .maybeSingle();
  if (!prior) return NextResponse.json({ error: 'Flag not found' }, { status: 404 });

  await recordAdminAction({
    action: 'feature.delete',
    targetTable: 'feature_flags',
    targetId: id,
    oldValue: prior,
  });

  const { error } = await service.from('feature_flags').delete().eq('id', id);
  if (error) {
    console.error('[admin.features.delete]', error.message);
    return NextResponse.json({ error: 'Could not delete flag' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
