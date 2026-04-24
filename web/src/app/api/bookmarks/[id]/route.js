// @migrated-to-permissions 2026-04-18
// @feature-verified bookmarks 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// PATCH /api/bookmarks/[id] — update notes / move between collections.
// Notes + collections are paid-only (D13) — we refuse on the server
// for free users trying to sneak these fields in.
//
// C10 — the PATCH previously hard-required `bookmarks.note.edit` for
// every call, including pure collection moves. UI gates the
// "move to collection" action on `bookmarks.collection.create`, so a
// user with collection permission but without note-edit permission
// hit a cryptic 403 after clicking the move UI that the client said
// they could use. Fix: parse the body first, then require the
// appropriate permission for the field actually being modified.
export async function PATCH(request, { params }) {
  const { notes, collection_id } = await request.json().catch(() => ({}));

  const editingNotes = notes !== undefined;
  const movingCollection = collection_id !== undefined;

  // If the caller is moving a collection but not editing notes, gate on
  // the collection permission (matching the UI check). Otherwise fall
  // back to note-edit permission. If both fields are present, note-edit
  // is the broader ask and implies collection-edit on every paid tier
  // in the current matrix; punt the "collection-only perm but also
  // editing notes" edge case — UI doesn't surface it.
  const requiredPerm =
    movingCollection && !editingNotes ? 'bookmarks.collection.create' : 'bookmarks.note.edit';

  let user;
  try {
    user = await requirePermission(requiredPerm);
  } catch (err) {
    if (err.status) {
      console.error('[bookmarks.[id].permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const service = createServiceClient();

  // Verify ownership before the paid-feature check so we can return the
  // right status code.
  const { data: bm } = await service
    .from('bookmarks')
    .select('id, user_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!bm || bm.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (notes !== undefined || collection_id !== undefined) {
    const { data: isPaid } = await service.rpc('_user_is_paid', { p_user_id: user.id });
    if (!isPaid) {
      return NextResponse.json(
        { error: 'Collections and notes are available on paid plans' },
        { status: 403 }
      );
    }
  }

  const update = {};
  if (notes !== undefined) update.notes = notes;
  if (collection_id !== undefined) update.collection_id = collection_id || null;
  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true });

  const { error } = await service.from('bookmarks').update(update).eq('id', params.id);
  if (error)
    return safeErrorResponse(NextResponse, error, { route: 'bookmarks.id', fallbackStatus: 400 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/bookmarks/[id]
export async function DELETE(_request, { params }) {
  let user;
  try {
    user = await requirePermission('article.bookmark.remove');
  } catch (err) {
    if (err.status) {
      console.error('[bookmarks.[id].permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from('bookmarks')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id);
  if (error)
    return safeErrorResponse(NextResponse, error, { route: 'bookmarks.id', fallbackStatus: 400 });
  return NextResponse.json({ ok: true });
}
