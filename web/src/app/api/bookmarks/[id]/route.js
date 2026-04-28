// @migrated-to-permissions 2026-04-18
// @feature-verified bookmarks 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';
import { checkRateLimit } from '@/lib/rateLimit';

// T170/T209 — authenticated user data must never be cacheable by a CDN
// or shared proxy. Apply private/no-store to every response on this
// route (success + error paths).
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

// S5-Notification-table-cleanup audit — checklist:
//   1. Idempotency       — DELETE on a missing/foreign row is a no-op
//                          (RLS limits the delete to user's own rows;
//                          PATCH on a foreign row 404s before the write).
//   2. Rate limits       — POST is gated upstream at /api/bookmarks
//                          (60/min). PATCH/DELETE add 60/min keyed per
//                          user here so a runaway client editing notes
//                          or thrashing collection moves can't fan out.
//   3. Error hygiene     — generic { error: 'reason' }; safeErrorResponse
//                          maps RPC codes uniformly.
//   4. RLS coherence     — service client used; ownership check pre-write
//                          on PATCH; DELETE limited by .eq('user_id',
//                          user.id) so RLS-bypass-via-service is bounded.
//   5. Service-role audit — service client only after auth.uid()-bound
//                          permission resolved; no public-data writes.
const PATCH_RATE = { policyKey: 'bookmarks_edit', max: 60, windowSec: 60 };
const DELETE_RATE = { policyKey: 'bookmarks_remove', max: 60, windowSec: 60 };

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
        { status: err.status, headers: NO_STORE }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `bookmarks-edit:${user.id}`,
    policyKey: PATCH_RATE.policyKey,
    max: PATCH_RATE.max,
    windowSec: PATCH_RATE.windowSec,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': String(PATCH_RATE.windowSec) } }
    );
  }

  // Verify ownership before the paid-feature check so we can return the
  // right status code.
  const { data: bm } = await service
    .from('bookmarks')
    .select('id, user_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!bm || bm.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }

  if (notes !== undefined || collection_id !== undefined) {
    const { data: isPaid } = await service.rpc('_user_is_paid', { p_user_id: user.id });
    if (!isPaid) {
      return NextResponse.json(
        { error: 'Collections and notes are available on paid plans' },
        { status: 403, headers: NO_STORE }
      );
    }
  }

  const update = {};
  if (notes !== undefined) update.notes = notes;
  if (collection_id !== undefined) update.collection_id = collection_id || null;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  const { error } = await service.from('bookmarks').update(update).eq('id', params.id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'bookmarks.id',
      fallbackStatus: 400,
      headers: NO_STORE,
    });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
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
        { status: err.status, headers: NO_STORE }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `bookmarks-remove:${user.id}`,
    policyKey: DELETE_RATE.policyKey,
    max: DELETE_RATE.max,
    windowSec: DELETE_RATE.windowSec,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': String(DELETE_RATE.windowSec) } }
    );
  }

  const { error } = await service
    .from('bookmarks')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'bookmarks.id',
      fallbackStatus: 400,
      headers: NO_STORE,
    });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
