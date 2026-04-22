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
  const { data, error } = await service
    .from('ad_campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.ad_campaigns',
      fallbackStatus: 400,
    });
  return NextResponse.json({ campaigns: data || [] });
}

export async function POST(request) {
  let user;
  try {
    user = await requirePermission('admin.ads.campaigns.create');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const b = await request.json().catch(() => ({}));
  if (!b.name || !b.advertiser_name || !b.campaign_type || !b.start_date || !b.pricing_model) {
    return NextResponse.json(
      { error: 'name, advertiser_name, campaign_type, start_date, pricing_model required' },
      { status: 400 }
    );
  }
  const service = createServiceClient();
  const { data, error } = await service
    .from('ad_campaigns')
    .insert({
      name: b.name,
      advertiser_name: b.advertiser_name,
      advertiser_contact: b.advertiser_contact || null,
      campaign_type: b.campaign_type,
      objective: b.objective || null,
      status: b.status || 'draft',
      start_date: b.start_date,
      end_date: b.end_date || null,
      total_budget_cents: b.total_budget_cents || null,
      daily_budget_cents: b.daily_budget_cents || null,
      pricing_model: b.pricing_model,
      rate_cents: b.rate_cents || null,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.ad_campaigns',
      fallbackStatus: 400,
    });
  return NextResponse.json({ id: data.id });
}
