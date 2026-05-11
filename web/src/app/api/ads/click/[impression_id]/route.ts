// @feature-verified ads 2026-05-10
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// GET /api/ads/click/[impression_id]
//
// Server-side ad-click logger + redirect. Replaces the JS-dependent
// POST /api/ads/click flow with a path-param GET so anchors can point
// straight at this endpoint: clicks log even with JS disabled, ad
// blockers, or prerender bots.
//
// Behavior:
//   - Validate impression_id is a UUID. Invalid → 302 to "/".
//   - Look up the impression's ad_unit and resolve click_url.
//     Missing impression or null click_url → 302 to "/".
//   - Per-IP rate limit (60/min). Over-limit → still 302 to click_url
//     but skip RPC logging so fraud-detection budget isn't depleted.
//   - Call log_ad_click RPC (errors logged, never block the redirect).
//   - Always Cache-Control: no-store, private.
//
// Auth: public; RLS gates impression lookup.

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fallbackRedirect(req: NextRequest): NextResponse {
  const url = new URL('/', req.url);
  const res = NextResponse.redirect(url, 302);
  res.headers.set('Cache-Control', 'no-store, private');
  return res;
}

function isSafeAdUrl(u: string | null | undefined): boolean {
  if (!u || typeof u !== 'string') return false;
  const trimmed = u.trim();
  // Same-origin relative URL — house ads (e.g. /pricing) must pass.
  // Must start with '/' but NOT '//' (protocol-relative).
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { impression_id: string } | Promise<{ impression_id: string }> }
): Promise<NextResponse> {
  const resolvedParams = await params;
  const impressionId = resolvedParams?.impression_id;

  if (!impressionId || !UUID_RX.test(impressionId)) {
    return fallbackRedirect(req);
  }

  const service = createServiceClient();

  // Look up impression → ad_unit → click_url. Failing any step is a
  // soft failure: bounce to home rather than 404, because the click
  // already happened from the user's perspective.
  let clickUrl: string | null = null;
  try {
    const { data: impression, error: impErr } = await service
      .from('ad_impressions')
      .select('ad_unit_id')
      .eq('id', impressionId)
      .maybeSingle();
    if (impErr || !impression?.ad_unit_id) {
      return fallbackRedirect(req);
    }

    const { data: unit, error: unitErr } = await service
      .from('ad_units')
      .select('click_url')
      .eq('id', impression.ad_unit_id)
      .maybeSingle();
    if (unitErr || !unit?.click_url || !isSafeAdUrl(unit.click_url)) {
      return fallbackRedirect(req);
    }
    clickUrl = unit.click_url;
  } catch (err) {
    console.warn(
      '[ads.click] impression/unit lookup failed:',
      err instanceof Error ? err.message : err
    );
    return fallbackRedirect(req);
  }

  // Resolve target URL. Relative paths must resolve against the request
  // origin for NextResponse.redirect.
  let redirectTarget: URL;
  try {
    redirectTarget = new URL(clickUrl, req.url);
  } catch {
    return fallbackRedirect(req);
  }

  // Per-IP rate limit. Over-limit still redirects (don't punish real
  // users), but skips logging so a click-bot can't flood the fraud
  // signal table.
  const ip = await getClientIp();
  let allowLog = true;
  try {
    const rl = await checkRateLimit(service, {
      key: `ads_click_redirect:ip:${ip}`,
      policyKey: 'ads_click_redirect',
      max: 60,
      windowSec: 60,
    });
    if (rl.limited) allowLog = false;
  } catch (err) {
    // Rate-limit failure: log and proceed (the redirect path must not
    // hang on rate-limit infra outages).
    console.warn(
      '[ads.click] rate-limit check threw, allowing log:',
      err instanceof Error ? err.message : err
    );
  }

  if (allowLog) {
    try {
      const { error } = await service.rpc('log_ad_click', {
        p_impression_id: impressionId,
      });
      if (error) {
        console.warn('[ads.click] log_ad_click RPC error:', error.message);
      }
    } catch (err) {
      console.warn(
        '[ads.click] log_ad_click threw:',
        err instanceof Error ? err.message : err
      );
    }
  }

  const res = NextResponse.redirect(redirectTarget, 302);
  res.headers.set('Cache-Control', 'no-store, private');
  return res;
}
