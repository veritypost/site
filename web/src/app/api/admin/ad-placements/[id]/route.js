// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { recordAdminAction } from '@/lib/adminMutation';
import { safeErrorResponse } from '@/lib/apiErrors';

const ALLOWED = [
  'name',
  'display_name',
  'description',
  'placement_type',
  'platform',
  'page',
  'position',
  'width',
  'height',
  'max_ads_per_page',
  'hidden_for_tiers',
  'reduced_for_tiers',
  'is_kids_safe',
  'is_active',
];

export async function PATCH(request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.ads.placements.edit');
  } catch (err) {
    if (err.status) {
      console.error('[admin.ad-placements.[id].permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.ad-placements.update:${user.id}`,
    policyKey: 'admin.ad-placements.update',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }
  const b = await request.json().catch(() => ({}));
  const update = {};
  for (const k of ALLOWED) if (b[k] !== undefined) update[k] = b[k];
  const { data: prior } = await service
    .from('ad_placements')
    .select(ALLOWED.join(', '))
    .eq('id', params.id)
    .maybeSingle();
  const { error } = await service.from('ad_placements').update(update).eq('id', params.id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.ad_placements.id',
      fallbackStatus: 400,
    });
  await recordAdminAction({
    action: 'ad_placement.update',
    targetTable: 'ad_placements',
    targetId: params.id,
    oldValue: prior ?? null,
    newValue: update,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.ads.placements.delete');
  } catch (err) {
    if (err.status) {
      console.error('[admin.ad-placements.[id].permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.ad-placements.delete:${user.id}`,
    policyKey: 'admin.ad-placements.delete',
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
    .from('ad_placements')
    .select('id, name, placement_type, page, position')
    .eq('id', params.id)
    .maybeSingle();
  const { error } = await service.from('ad_placements').delete().eq('id', params.id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.ad_placements.id',
      fallbackStatus: 400,
    });
  await recordAdminAction({
    action: 'ad_placement.delete',
    targetTable: 'ad_placements',
    targetId: params.id,
    oldValue: prior ?? null,
  });
  return NextResponse.json({ ok: true });
}
