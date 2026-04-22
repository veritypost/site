// @migrated-to-permissions 2026-04-18
// @feature-verified expert 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// GET  /api/expert/back-channel?category_id=...&source_comment_id=... — read messages
// POST /api/expert/back-channel — { category_id, body, source_comment_id?, parent_id?, title? }
export async function GET(request) {
  try {
    await requirePermission('expert.back_channel.read');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const category_id = url.searchParams.get('category_id');
  const source_comment_id = url.searchParams.get('source_comment_id');
  if (!category_id) return NextResponse.json({ error: 'category_id required' }, { status: 400 });

  const service = createServiceClient();
  let q = service
    .from('expert_discussions')
    .select('*, users(id, username, avatar_color)')
    .eq('category_id', category_id)
    .eq('status', 'visible')
    .order('created_at', { ascending: true });
  if (source_comment_id) q = q.eq('source_comment_id', source_comment_id);
  else q = q.is('source_comment_id', null);

  const { data, error } = await q;
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'expert.back_channel',
      fallbackStatus: 400,
    });
  return NextResponse.json({ messages: data || [] });
}

export async function POST(request) {
  let user;
  try {
    user = await requirePermission('expert.back_channel.post');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { category_id, body, source_comment_id, parent_id, title } = await request
    .json()
    .catch(() => ({}));
  if (!category_id || !body)
    return NextResponse.json({ error: 'category_id and body required' }, { status: 400 });

  const service = createServiceClient();
  const { data, error } = await service.rpc('post_back_channel_message', {
    p_user_id: user.id,
    p_category_id: category_id,
    p_body: body,
    p_source_comment_id: source_comment_id || null,
    p_parent_id: parent_id || null,
    p_title: title || null,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'expert.back_channel',
      fallbackStatus: 400,
    });
  return NextResponse.json({ id: data });
}
