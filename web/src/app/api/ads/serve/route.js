// @migrated-to-permissions 2026-04-18
// @feature-verified ads 2026-04-18
import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';
import { safeErrorResponse } from '@/lib/apiErrors';

// GET /api/ads/serve?placement=NAME&article_id=...&session_id=...&preview_tier=...
// Anon-friendly. Returns { ad_unit: {...} } or { ad_unit: null }.
// preview_tier is accepted but currently unused by the RPC; it is wired here
// so the admin preview tool can pass it and the RPC can start consuming it
// when the DB function is updated to accept p_preview_tier.
export async function GET(request) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;
  const url = new URL(request.url);
  const placement = url.searchParams.get('placement');
  const article_id = url.searchParams.get('article_id') || null;
  const session_id = url.searchParams.get('session_id') || null;
  // preview_tier — admin preview tool passes this to simulate a specific tier.
  // Not yet forwarded to the RPC; logged here for future RPC wiring.
  // eslint-disable-next-line no-unused-vars
  const preview_tier = url.searchParams.get('preview_tier') || null;
  if (!placement) return NextResponse.json({ error: 'placement required' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const service = createServiceClient();
  const { data, error } = await service.rpc('serve_ad', {
    p_placement_name: placement,
    p_user_id: authUser?.id || null,
    p_article_id: article_id,
    p_session_id: session_id,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, { route: 'ads.serve', fallbackStatus: 400 });

  // Ext-BB.3 — serve-time URL safety guard. Admin-side validation
  // (JJ.7) blocks new inserts, but a row pre-dating that constraint
  // or mutated via direct SQL could still carry an unsafe scheme.
  // Null out the URL fields when they fail the http(s)-only check;
  // the client-side render in Ad.jsx already tolerates null URLs
  // (it just won't render the link/image), so this fails closed
  // without a code change there.
  const isSafeAdUrl = (u) => {
    if (!u || typeof u !== 'string') return true; // nullable column — leave as-is
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
  };
  let safeUnit = data || null;
  if (safeUnit && typeof safeUnit === 'object') {
    if (!isSafeAdUrl(safeUnit.creative_url)) safeUnit = { ...safeUnit, creative_url: null };
    if (!isSafeAdUrl(safeUnit.click_url)) safeUnit = { ...safeUnit, click_url: null };
  }
  // D1 — Belt-and-suspenders frequency cap guard. The serve_ad() RPC is the
  // primary enforcement layer; this server-side check is a fallback in case
  // the RPC was deployed without cap logic. Runs only when a non-null unit is
  // returned by the RPC (no-op on misses). Wrapped in try/catch so any DB
  // error fails open (serves the ad) rather than failing closed — ad revenue
  // takes priority over perfect cap enforcement.
  if (safeUnit) {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // User-level cap: max impressions per user in the past 24 hours.
      if (safeUnit.frequency_cap_per_user > 0 && authUser?.id) {
        const { count: userCount } = await service
          .from('ad_impressions')
          .select('id', { count: 'exact', head: true })
          .eq('ad_unit_id', safeUnit.id)
          .eq('user_id', authUser.id)
          .gte('created_at', oneDayAgo);
        if (userCount >= safeUnit.frequency_cap_per_user) {
          return NextResponse.json({ ad_unit: null }, { headers: { 'Cache-Control': 'no-store' } });
        }
      }

      // Session-level cap: max impressions per session.
      if (safeUnit.frequency_cap_per_session > 0 && session_id) {
        const { count: sessionCount } = await service
          .from('ad_impressions')
          .select('id', { count: 'exact', head: true })
          .eq('ad_unit_id', safeUnit.id)
          .eq('session_id', session_id);
        if (sessionCount >= safeUnit.frequency_cap_per_session) {
          return NextResponse.json({ ad_unit: null }, { headers: { 'Cache-Control': 'no-store' } });
        }
      }
    } catch (capErr) {
      // Fail open: log the error but still serve the ad.
      console.warn('[ads.serve] frequency cap check failed, serving ad anyway:', capErr?.message);
    }
  }

  // Ad responses are user-specific (frequency caps, tier filtering). Must not
  // be cached by browsers or shared proxies — a cached response would serve
  // User A's ad to User B and skip per-user cap re-checks within the window.
  return NextResponse.json(
    { ad_unit: safeUnit },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
