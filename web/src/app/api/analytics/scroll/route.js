// POST /api/analytics/scroll — record an article scroll-depth milestone.
// Body: { article_id: string (UUID), milestone: 25 | 50 | 75 | 100 }
//
// Writes an analytics_events row with event_name='scroll_depth' and the
// milestone in event_properties. Fire-and-forget from the client; errors
// are not surfaced to the reader.
import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_MILESTONES = new Set([25, 50, 75, 100]);

export async function POST(request) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;

  const b = await request.json().catch(() => ({}));

  const articleId =
    typeof b.article_id === 'string' && UUID_RX.test(b.article_id) ? b.article_id : null;
  const milestone = VALID_MILESTONES.has(b.milestone) ? b.milestone : null;

  if (!articleId || !milestone) {
    return NextResponse.json({ error: 'article_id + milestone required' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const service = createServiceClient();
  const ip = await getClientIp();
  const rl = await checkRateLimit(service, {
    key: `scroll_depth:ip:${ip}`,
    policyKey: 'ads_impression', // reuse the permissive 300/min policy
    max: 300,
    windowSec: 60,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  // Validate that the article_id refers to a published article before writing.
  // Silently drop scroll events for non-published/missing articles — the client
  // fires these events and should not receive errors that surface in console.
  const { data: article } = await service
    .from('articles')
    .select('id')
    .eq('id', articleId)
    .eq('status', 'published')
    .maybeSingle();
  if (!article) return NextResponse.json({ ok: true });

  const { error } = await service.from('analytics_events').insert({
    event_name: 'scroll_depth',
    event_category: 'article',
    article_id: articleId,
    user_id: user?.id ?? null,
    platform: 'web',
    value_numeric: milestone,
    event_properties: { milestone },
  });

  if (error) {
    return safeErrorResponse(NextResponse, error, {
      route: 'analytics/scroll',
      fallbackStatus: 400,
    });
  }

  return NextResponse.json({ ok: true });
}
