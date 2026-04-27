// @migrated-to-permissions 2026-04-18
// @feature-verified comments 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';
import { checkRateLimit } from '@/lib/rateLimit';

// PATCH /api/comments/[id] — owner edit.
export async function PATCH(request, { params }) {
  let user;
  try {
    user = await requirePermission('comments.edit.own');
  } catch (err) {
    if (err.status) {
      console.error('[comments.[id].permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { id } = params;
  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `comment-edit:${user.id}`,
    policyKey: 'comment-edit',
    max: 5,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const { body } = await request.json().catch(() => ({}));
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 });

  // T280 — cap the self-edit window to 10 minutes so authors can fix typos
  // but can't silently rewrite a comment after it has been replied to,
  // quoted, or reported. Mods/admins use the moderation surface, which
  // gates on a different permission and isn't affected. The RPC is
  // SECURITY DEFINER so we read the row through the service client first.
  const EDIT_WINDOW_MS = 10 * 60 * 1000;
  const { data: existing, error: lookupErr } = await service
    .from('comments')
    .select('user_id, created_at')
    .eq('id', id)
    .maybeSingle();
  if (lookupErr || !existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (existing.user_id === user.id) {
    const createdAt = new Date(existing.created_at).getTime();
    if (Number.isFinite(createdAt) && Date.now() - createdAt > EDIT_WINDOW_MS) {
      return NextResponse.json({ error: 'edit_window_expired' }, { status: 403 });
    }
  }

  const { error } = await service.rpc('edit_comment', {
    p_user_id: user.id,
    p_comment_id: id,
    p_body: body,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, { route: 'comments.id', fallbackStatus: 400 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/comments/[id] — owner soft-delete.
export async function DELETE(_request, { params }) {
  let user;
  try {
    user = await requirePermission('comments.delete.own');
  } catch (err) {
    if (err.status) {
      console.error('[comments.[id].permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { id } = params;
  const service = createServiceClient();
  const { error } = await service.rpc('soft_delete_comment', {
    p_user_id: user.id,
    p_comment_id: id,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, { route: 'comments.id', fallbackStatus: 400 });
  return NextResponse.json({ ok: true });
}
