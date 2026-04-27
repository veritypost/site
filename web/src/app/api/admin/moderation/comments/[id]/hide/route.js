// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';
import { recordAdminAction } from '@/lib/adminMutation';

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
  const body = await request.json().catch(() => ({}));
  const reason = body?.reason;
  // T279 — two-mode soft-removal. 'hide' is the routine moderator path
  // (status flips to hidden, body preserved for unhide / appeals). 'redact'
  // additionally overwrites the body so that on a legal/safety action the
  // text isn't recoverable from the comment row itself — closes a subpoena
  // exposure where 'hide' alone left the original content sitting on disk.
  // Default 'hide' keeps every existing caller backward-compatible.
  const mode = body?.mode === 'redact' ? 'redact' : 'hide';

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

  if (mode === 'redact') {
    const { error: redactErr } = await service
      .from('comments')
      .update({ body: '[redacted by moderator]', body_html: null })
      .eq('id', params.id);
    if (redactErr) {
      // Hide already landed; surface the partial-failure so the caller
      // can retry redact without re-hiding.
      return safeErrorResponse(NextResponse, redactErr, {
        route: 'admin.moderation.comments.id.hide.redact',
        fallbackStatus: 500,
      });
    }
  }

  // C21 — audit the comment hide. Pre-fix, comment removal left zero
  // audit trail. T279 adds the chosen mode to the trail.
  await recordAdminAction({
    action: 'moderation.comment.hide',
    targetTable: 'comments',
    targetId: params.id,
    newValue: { reason: reason || 'moderator action', mode },
  });

  return NextResponse.json({ ok: true, mode });
}
