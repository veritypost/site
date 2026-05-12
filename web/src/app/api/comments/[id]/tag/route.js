import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';
import { safeErrorResponse } from '@/lib/apiErrors';
import { checkRateLimit } from '@/lib/rateLimit';
import { scoreReceiveHelpful } from '@/lib/scoring';

const ALLOWED_TAG_KINDS = new Set(['i_agree', 'helpful']);

export async function POST(request, { params }) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;
  let user;
  try {
    user = await requirePermission('comments.tag');
  } catch (err) {
    if (err.status) {
      console.error('[comments.[id].tag.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  let kind;
  try {
    const body = await request.json().catch(() => null);
    if (body && typeof body.kind === 'string') kind = body.kind;
  } catch {
    // No body — fall through to validation below.
  }
  if (!kind || !ALLOWED_TAG_KINDS.has(kind)) {
    return NextResponse.json({ error: 'invalid_tag_kind' }, { status: 400 });
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `comment_tag:${user.id}`,
    policyKey: 'comment_tag',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  try {
    const { data: comment } = await service
      .from('comments')
      .select('user_id')
      .eq('id', params.id)
      .maybeSingle();
    if (comment?.user_id === user.id) {
      return NextResponse.json({ error: 'cannot_tag_own_comment' }, { status: 403 });
    }
  } catch (e) {
    console.error('[comments.id.tag] self-tag precheck', e);
  }

  const { data, error } = await service.rpc('toggle_comment_tag', {
    p_user_id: user.id,
    p_comment_id: params.id,
    p_kind: kind,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'comments.id.tag',
      fallbackStatus: 400,
    });

  if (data?.tagged && data?.kind === 'helpful') {
    const { data: ctx } = await service
      .from('comments')
      .select('user_id, article_id, articles(category_id)')
      .eq('id', params.id)
      .maybeSingle();
    const authorId = ctx?.user_id;
    const articleId = ctx?.article_id || null;
    const categoryId = ctx?.articles?.category_id ?? null;
    if (authorId) {
      scoreReceiveHelpful(service, {
        actorId: user.id,
        authorId,
        commentId: params.id,
        articleId,
        categoryId,
      }).catch((e) => console.error('[comments.id.tag] scoreReceiveHelpful', e));
    }
  }

  return NextResponse.json(data);
}
