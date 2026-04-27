// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { recordAdminAction } from '@/lib/adminMutation';
import { safeErrorResponse } from '@/lib/apiErrors';

// POST /api/admin/broadcasts/breaking
// Body: { article_id, title, body }
// D14: fan out to every eligible user; create_notification enforces
// the per-user daily cap for free tier.
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('admin.broadcasts.breaking.send');
  } catch (err) {
    if (err.status) {
      console.error('[admin.broadcasts.breaking.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.broadcasts.breaking:${user.id}`,
    policyKey: 'admin.broadcasts.breaking',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const { article_id, title, body } = await request.json().catch(() => ({}));
  if (!article_id || !title) {
    return NextResponse.json({ error: 'article_id + title required' }, { status: 400 });
  }
  const { data, error } = await service.rpc('send_breaking_news', {
    p_article_id: article_id,
    p_title: title,
    p_body: body || null,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.broadcasts.breaking',
      fallbackStatus: 400,
    });
  await recordAdminAction({
    action: 'breaking_news.send',
    targetTable: 'articles',
    targetId: article_id,
    newValue: { title, body: body || null, sent_count: data },
  });
  return NextResponse.json({ sent_count: data });
}
