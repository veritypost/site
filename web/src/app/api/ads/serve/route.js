// @migrated-to-permissions 2026-04-18
// @feature-verified ads 2026-04-18
import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';
import { safeErrorResponse } from '@/lib/apiErrors';

// GET /api/ads/serve?placement=NAME&article_id=...&session_id=...
// Anon-friendly. Returns { ad_unit: {...} } or { ad_unit: null }.
export async function GET(request) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;
  const url = new URL(request.url);
  const placement = url.searchParams.get('placement');
  const article_id = url.searchParams.get('article_id') || null;
  const session_id = url.searchParams.get('session_id') || null;
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
    try {
      const parsed = new URL(u);
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
  return NextResponse.json({ ad_unit: safeUnit });
}
