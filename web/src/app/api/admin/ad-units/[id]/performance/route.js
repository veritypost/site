import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';

// GET /api/admin/ad-units/[id]/performance?days=30
// Returns: { days, impressions, clicks, ctr, revenue_cents, by_category, daily }
//
// Read-only summary backed by the ad_unit_performance RPC. Admin-only.
export async function GET(request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.ads.view');
  } catch (err) {
    if (err.status) {
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status },
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.ad-units.performance:${user.id}`,
    policyKey: 'admin.ad-units.performance',
    max: 60,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } },
    );
  }

  const url = new URL(request.url);
  const daysRaw = parseInt(url.searchParams.get('days') ?? '30', 10);
  const days = Number.isFinite(daysRaw) && daysRaw >= 1 && daysRaw <= 365 ? daysRaw : 30;

  const { data, error } = await service.rpc('ad_unit_performance', {
    p_unit_id: params.id,
    p_days: days,
  });
  if (error) {
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.ad_units.performance',
      fallbackStatus: 400,
    });
  }
  return NextResponse.json(data || { days, impressions: 0, clicks: 0, ctr: 0, revenue_cents: 0, by_category: [], daily: [] });
}
