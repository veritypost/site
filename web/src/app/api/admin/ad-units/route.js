// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';
import { isSafeAdUrl } from '@/lib/adUrlValidation';

export async function GET(request) {
  try {
    await requirePermission('admin.ads.view');
  } catch (err) {
    if (err.status) {
      console.error('[admin.ad-units.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const url = new URL(request.url);
  const placementId = url.searchParams.get('placement_id');
  const campaignId = url.searchParams.get('campaign_id');
  const service = createServiceClient();
  let q = service.from('ad_units').select('*').order('created_at', { ascending: false }).limit(500);
  if (placementId) q = q.eq('placement_id', placementId);
  if (campaignId) q = q.eq('campaign_id', campaignId);
  const { data, error } = await q;
  if (error)
    return safeErrorResponse(NextResponse, error, { route: 'admin.ad_units', fallbackStatus: 400 });
  return NextResponse.json({ units: data || [] });
}

export async function POST(request) {
  let user;
  try {
    user = await requirePermission('admin.ads.units.create');
  } catch (err) {
    if (err.status) {
      console.error('[admin.ad-units.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.ad-units.create:${user.id}`,
    policyKey: 'admin.ad-units.create',
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
  if (!b.name || !b.ad_network || !b.ad_format || !b.placement_id) {
    return NextResponse.json(
      { error: 'name, ad_network, ad_format, placement_id required' },
      { status: 400 }
    );
  }

  // Ext-JJ7 — server-side URL validation for ad creative/click via the
  // shared `isSafeAdUrl` helper (also called by PATCH). Ad.jsx filters at
  // render-time too, but validating at write-time keeps bad data out of
  // the DB so a render-filter regression can't turn into an XSS vector.
  if (!isSafeAdUrl(b.creative_url)) {
    return NextResponse.json({ error: 'creative_url must be http(s)' }, { status: 400 });
  }
  if (!isSafeAdUrl(b.click_url)) {
    return NextResponse.json({ error: 'click_url must be http(s)' }, { status: 400 });
  }
  const { data, error } = await service
    .from('ad_units')
    .insert({
      name: b.name,
      advertiser_name: b.advertiser_name || null,
      ad_network: b.ad_network,
      ad_network_unit_id: b.ad_network_unit_id || null,
      ad_format: b.ad_format,
      placement_id: b.placement_id,
      campaign_id: b.campaign_id || null,
      creative_url: b.creative_url || null,
      creative_html: b.creative_html || null,
      click_url: b.click_url || null,
      alt_text: b.alt_text || null,
      cta_text: b.cta_text || null,
      targeting_categories: b.targeting_categories || null,
      frequency_cap_per_user: b.frequency_cap_per_user || null,
      frequency_cap_per_session: b.frequency_cap_per_session || null,
      start_date: b.start_date || null,
      end_date: b.end_date || null,
      weight: b.weight || 100,
      approval_status: b.approval_status || 'pending',
      approved_by: b.approval_status === 'approved' ? user.id : null,
      is_active: true,
    })
    .select('id')
    .single();
  if (error)
    return safeErrorResponse(NextResponse, error, { route: 'admin.ad_units', fallbackStatus: 400 });
  return NextResponse.json({ id: data.id });
}
