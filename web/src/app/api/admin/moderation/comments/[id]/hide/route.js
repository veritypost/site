// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

export async function POST(request, { params }) {
  let user;
  try { user = await requirePermission('admin.moderation.comment.remove'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { reason } = await request.json().catch(() => ({}));
  const service = createServiceClient();
  const { error } = await service.rpc('hide_comment', {
    p_mod_id: user.id,
    p_comment_id: params.id,
    p_reason: reason || 'moderator action',
  });
  if (error) return safeErrorResponse(NextResponse, error, { route: 'admin.moderation.comments.id.hide', fallbackStatus: 400 });
  return NextResponse.json({ ok: true });
}
