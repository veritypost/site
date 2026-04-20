// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// POST /api/admin/broadcasts/breaking
// Body: { article_id, title, body }
// D14: fan out to every eligible user; create_notification enforces
// the per-user daily cap for free tier.
export async function POST(request) {
  try { await requirePermission('admin.broadcasts.breaking.send'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { article_id, title, body } = await request.json().catch(() => ({}));
  if (!article_id || !title) {
    return NextResponse.json({ error: 'article_id + title required' }, { status: 400 });
  }
  const service = createServiceClient();
  const { data, error } = await service.rpc('send_breaking_news', {
    p_article_id: article_id,
    p_title: title,
    p_body: body || null,
  });
  if (error) return safeErrorResponse(NextResponse, error, { route: 'admin.broadcasts.breaking', fallbackStatus: 400 });
  return NextResponse.json({ sent_count: data });
}
