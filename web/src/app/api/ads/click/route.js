// @migrated-to-permissions 2026-04-18
// @feature-verified ads 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';

// POST /api/ads/click — body: { impression_id }
//
// F-070 — unauthenticated caller could POST any impression_id to
// inflate click counts. Defenses:
//   - UUID shape check on impression_id (the RPC will also verify it
//     exists and belongs to a live impression).
//   - Per-IP rate limit (120/min — higher than errors because ad
//     clicks are legitimate at read scale, lower than free because an
//     attacker bulk-posting is abuse).
// Keeps the unauthenticated path because anon users still read pages
// with ads; the RPC enforces impression ownership.
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const impressionId = body?.impression_id;
  if (!impressionId || typeof impressionId !== 'string' || !UUID_RX.test(impressionId)) {
    return NextResponse.json({ error: 'impression_id required' }, { status: 400 });
  }

  const service = createServiceClient();
  const ip = await getClientIp();
  const rl = await checkRateLimit(service, {
    key: `ads_click:ip:${ip}`,
    policyKey: 'ads_click',
    max: 120,
    windowSec: 60,
  });
  if (rl.limited)
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );

  const { error } = await service.rpc('log_ad_click', { p_impression_id: impressionId });
  if (error)
    return safeErrorResponse(NextResponse, error, { route: 'ads/click', fallbackStatus: 400 });
  return NextResponse.json({ ok: true });
}
