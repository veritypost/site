// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';

export async function POST(request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.moderation.comment.remove');
  } catch (err) {
    if (err.status) {
      console.error('[admin.moderation.comments.[id].hide.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.moderation.comments.hide:${user.id}`,
    policyKey: 'admin.moderation.comments.hide',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }
  const { reason } = await request.json().catch(() => ({}));
  const { error } = await service.rpc('hide_comment', {
    p_mod_id: user.id,
    p_comment_id: params.id,
    p_reason: reason || 'moderator action',
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.moderation.comments.id.hide',
      fallbackStatus: 400,
    });
  return NextResponse.json({ ok: true });
}
