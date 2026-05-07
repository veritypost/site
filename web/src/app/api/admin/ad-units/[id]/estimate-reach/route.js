import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';

// POST /api/admin/ad-units/[id]/estimate-reach
// Body: { ad_targets: Array<{target_type, target_id, mode?}> }
// Returns: { eligible_articles, total_articles, days }
//
// Lets the admin form preview how many recent articles would be
// eligible under a given targeting set, BEFORE saving. The id
// in the URL is for symmetry with the rest of the ad-unit
// endpoints — the predicate runs against the body, not the saved
// row.
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('admin.ads.units.edit');
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
    key: `admin.ad-units.estimate-reach:${user.id}`,
    policyKey: 'admin.ad-units.estimate-reach',
    max: 60,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } },
    );
  }

  const b = await request.json().catch(() => ({}));
  const targets = Array.isArray(b.ad_targets) ? b.ad_targets : [];
  const cleaned = [];
  for (const t of targets) {
    if (!t || typeof t !== 'object') continue;
    if (!['category', 'subcategory', 'article'].includes(t.target_type)) continue;
    if (typeof t.target_id !== 'string' || t.target_id.length < 8) continue;
    cleaned.push({
      target_type: t.target_type,
      target_id: t.target_id,
      mode: t.mode === 'exclude' ? 'exclude' : 'include',
    });
  }

  const { data, error } = await service.rpc('estimate_targeting_reach', {
    p_targets: cleaned,
    p_days: 7,
  });
  if (error) {
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.ad_units.estimate_reach',
      fallbackStatus: 400,
    });
  }
  return NextResponse.json(data || { eligible_articles: 0, total_articles: 0, days: 7 });
}
