// @migrated-to-permissions 2026-04-18
// @feature-verified comments 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// PATCH /api/comments/[id] — owner edit.
export async function PATCH(request, { params }) {
  let user;
  try { user = await requirePermission('comments.edit.own'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { id } = params;
  const { body } = await request.json().catch(() => ({}));
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const service = createServiceClient();
  const { error } = await service.rpc('edit_comment', {
    p_user_id: user.id,
    p_comment_id: id,
    p_body: body,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/comments/[id] — owner soft-delete.
export async function DELETE(_request, { params }) {
  let user;
  try { user = await requirePermission('comments.delete.own'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { id } = params;
  const service = createServiceClient();
  const { error } = await service.rpc('soft_delete_comment', {
    p_user_id: user.id,
    p_comment_id: id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
