// @migrated-to-permissions 2026-04-18
// @feature-verified ads 2026-04-18
import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';

// POST /api/ads/impression — body: { ad_unit_id, placement_id, campaign_id?,
//                                    session_id?, article_id?, page, position }
//
// F-070 — defenses: UUID shape check on the required ids, bounded
// string lengths on the free-text page/position fields, per-IP rate
// limit. The RPC owns the authoritative impression-counting logic;
// this route is the input-sanitation layer.
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeUuid(value) {
  return typeof value === 'string' && UUID_RX.test(value) ? value : null;
}

function safeShortString(value, max = 80) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;
  const b = await request.json().catch(() => ({}));

  const adUnitId = safeUuid(b.ad_unit_id);
  const placementId = safeUuid(b.placement_id);
  if (!adUnitId || !placementId) {
    return NextResponse.json({ error: 'ad_unit_id + placement_id required' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const service = createServiceClient();
  const ip = await getClientIp();
  const rl = await checkRateLimit(service, {
    key: `ads_impression:ip:${ip}`,
    policyKey: 'ads_impression',
    max: 300,
    windowSec: 60,
  });
  if (rl.limited)
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );

  const { data, error } = await service.rpc('log_ad_impression', {
    p_ad_unit_id: adUnitId,
    p_placement_id: placementId,
    p_campaign_id: safeUuid(b.campaign_id),
    p_user_id: authUser?.id || null,
    p_session_id: safeShortString(b.session_id, 100),
    p_article_id: safeUuid(b.article_id),
    p_page: safeShortString(b.page, 80) || 'unknown',
    p_position: safeShortString(b.position, 40) || 'unknown',
  });
  if (error)
    return safeErrorResponse(NextResponse, error, { route: 'ads/impression', fallbackStatus: 400 });
  return NextResponse.json({ impression_id: data });
}
