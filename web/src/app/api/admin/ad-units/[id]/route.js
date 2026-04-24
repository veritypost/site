// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';

const ALLOWED = [
  'name',
  'advertiser_name',
  'ad_network',
  'ad_network_unit_id',
  'ad_format',
  'placement_id',
  'campaign_id',
  'creative_url',
  'creative_html',
  'click_url',
  'alt_text',
  'cta_text',
  'targeting_categories',
  'frequency_cap_per_user',
  'frequency_cap_per_session',
  'start_date',
  'end_date',
  'weight',
  'approval_status',
  'is_active',
];

export async function PATCH(request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.ads.units.edit');
  } catch (err) {
    if (err.status) {
      console.error('[admin.ad-units.[id].permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.ad-units.update:${user.id}`,
    policyKey: 'admin.ad-units.update',
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
  if (b.approval_status === 'approved') update.approved_by = user.id;
  const { error } = await service.from('ad_units').update(update).eq('id', params.id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.ad_units.id',
      fallbackStatus: 400,
    });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.ads.units.delete');
  } catch (err) {
    if (err.status) {
      console.error('[admin.ad-units.[id].permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.ad-units.delete:${user.id}`,
    policyKey: 'admin.ad-units.delete',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }
  const { error } = await service.from('ad_units').delete().eq('id', params.id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.ad_units.id',
      fallbackStatus: 400,
    });
  return NextResponse.json({ ok: true });
}
