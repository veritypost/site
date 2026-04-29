// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { recordAdminAction } from '@/lib/adminMutation';
import { safeErrorResponse } from '@/lib/apiErrors';

export async function POST(_request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.moderation.comment.approve');
  } catch (err) {
    if (err.status) {
      console.error('[admin.moderation.comments.[id].unhide.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.moderation.comments.unhide:${user.id}`,
    policyKey: 'admin.moderation.comments.unhide',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }
  const { error } = await service.rpc('unhide_comment', {
    p_mod_id: user.id,
    p_comment_id: params.id,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.moderation.comments.id.unhide',
      fallbackStatus: 400,
    });

  await service.from('moderation_actions').insert({
    comment_id: params.id,
    moderator_id: user.id,
    action: 'unhide',
    reason: null,
  });

  // Pairs with `moderation.comment.hide` from comments/[id]/hide/route.js
  // — same dotted resource path, opposite verb.
  await recordAdminAction({
    action: 'moderation.comment.unhide',
    targetTable: 'comments',
    targetId: params.id,
  });
  return NextResponse.json({ ok: true });
}
