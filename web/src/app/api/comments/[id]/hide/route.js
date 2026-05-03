// @migrated-to-permissions 2026-05-03
// @feature-verified comments 2026-05-03
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';

// POST /api/comments/[id]/hide — moderator fast-lane (comments.moderate).
// Distinct from /api/admin/moderation/comments/[id]/hide which requires
// the admin-only admin.moderation.comment.remove permission and writes
// the admin audit log. This route is the public moderator path used by
// the iOS comment-row "Hide" action — no `mode=redact`, no admin audit,
// reason defaults if the caller omits it.
export async function POST(request, { params }) {
  let user;
  try {
    user = await requirePermission('comments.moderate');
  } catch (err) {
    if (err.status) {
      console.error('[comments.[id].hide.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `comments.hide:${user.id}`,
    policyKey: 'comments.hide',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const reason = (body?.reason && String(body.reason).trim()) || 'Moderator hide';

  const { error } = await service.rpc('hide_comment', {
    p_mod_id: user.id,
    p_comment_id: params.id,
    p_reason: reason,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'comments.id.hide',
      fallbackStatus: 400,
    });

  await service.from('moderation_actions').insert({
    comment_id: params.id,
    moderator_id: user.id,
    action: 'hide',
    reason,
  });

  return NextResponse.json({ ok: true });
}
