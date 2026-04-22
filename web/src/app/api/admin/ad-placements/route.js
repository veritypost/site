// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

export async function GET() {
  try {
    await requirePermission('admin.ads.view');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const { data, error } = await service.from('ad_placements').select('*').order('name').limit(500);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.ad_placements',
      fallbackStatus: 400,
    });
  return NextResponse.json({ placements: data || [] });
}

export async function POST(request) {
  try {
    await requirePermission('admin.ads.placements.create');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const b = await request.json().catch(() => ({}));
  if (!b.name || !b.placement_type || !b.page || !b.position) {
    return NextResponse.json(
      { error: 'name, placement_type, page, position required' },
      { status: 400 }
    );
  }
  const service = createServiceClient();
  const { data, error } = await service
    .from('ad_placements')
    .insert({
      name: b.name,
      display_name: b.display_name || b.name,
      description: b.description || null,
      placement_type: b.placement_type,
      platform: b.platform || 'all',
      page: b.page,
      position: b.position,
      width: b.width || null,
      height: b.height || null,
      max_ads_per_page: b.max_ads_per_page || 1,
      hidden_for_tiers: b.hidden_for_tiers || ['verity_pro', 'verity_family', 'verity_family_xl'],
      reduced_for_tiers: b.reduced_for_tiers || ['verity'],
      is_kids_safe: b.is_kids_safe || false,
      is_active: true,
    })
    .select('id')
    .single();
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.ad_placements',
      fallbackStatus: 400,
    });
  return NextResponse.json({ id: data.id });
}
