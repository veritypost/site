// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

const ALLOWED = ['name', 'display_name', 'description', 'placement_type', 'platform',
  'page', 'position', 'width', 'height', 'max_ads_per_page',
  'hidden_for_tiers', 'reduced_for_tiers', 'is_kids_safe', 'is_active'];

export async function PATCH(request, { params }) {
  try { await requirePermission('admin.ads.placements.edit'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const b = await request.json().catch(() => ({}));
  const update = {};
  for (const k of ALLOWED) if (b[k] !== undefined) update[k] = b[k];
  const service = createServiceClient();
  const { error } = await service.from('ad_placements').update(update).eq('id', params.id);
  if (error) return safeErrorResponse(NextResponse, error, { route: 'admin.ad_placements.id', fallbackStatus: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request, { params }) {
  try { await requirePermission('admin.ads.placements.delete'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const { error } = await service.from('ad_placements').delete().eq('id', params.id);
  if (error) return safeErrorResponse(NextResponse, error, { route: 'admin.ad_placements.id', fallbackStatus: 400 });
  return NextResponse.json({ ok: true });
}
