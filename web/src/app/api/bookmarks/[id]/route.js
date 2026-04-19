// @migrated-to-permissions 2026-04-18
// @feature-verified bookmarks 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// PATCH /api/bookmarks/[id] — update notes / move between collections.
// Notes + collections are paid-only (D13) — we refuse on the server
// for free users trying to sneak these fields in.
export async function PATCH(request, { params }) {
  let user;
  try { user = await requirePermission('bookmarks.note.edit'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { notes, collection_id } = await request.json().catch(() => ({}));
  const service = createServiceClient();

  // Verify ownership before the paid-feature check so we can return the
  // right status code.
  const { data: bm } = await service
    .from('bookmarks').select('id, user_id')
    .eq('id', params.id).maybeSingle();
  if (!bm || bm.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (notes !== undefined || collection_id !== undefined) {
    const { data: isPaid } = await service.rpc('_user_is_paid', { p_user_id: user.id });
    if (!isPaid) {
      return NextResponse.json({ error: 'Collections and notes are available on paid plans' }, { status: 403 });
    }
  }

  const update = {};
  if (notes !== undefined) update.notes = notes;
  if (collection_id !== undefined) update.collection_id = collection_id || null;
  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true });

  const { error } = await service.from('bookmarks').update(update).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/bookmarks/[id]
export async function DELETE(_request, { params }) {
  let user;
  try { user = await requirePermission('article.bookmark.remove'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from('bookmarks')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
