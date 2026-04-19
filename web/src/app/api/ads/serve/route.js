// @migrated-to-permissions 2026-04-18
// @feature-verified ads 2026-04-18
import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';

// GET /api/ads/serve?placement=NAME&article_id=...&session_id=...
// Anon-friendly. Returns { ad_unit: {...} } or { ad_unit: null }.
export async function GET(request) {
  const blocked = await v2LiveGuard(); if (blocked) return blocked;
  const url = new URL(request.url);
  const placement = url.searchParams.get('placement');
  const article_id = url.searchParams.get('article_id') || null;
  const session_id = url.searchParams.get('session_id') || null;
  if (!placement) return NextResponse.json({ error: 'placement required' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  const service = createServiceClient();
  const { data, error } = await service.rpc('serve_ad', {
    p_placement_name: placement,
    p_user_id: authUser?.id || null,
    p_article_id: article_id,
    p_session_id: session_id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ad_unit: data || null });
}
