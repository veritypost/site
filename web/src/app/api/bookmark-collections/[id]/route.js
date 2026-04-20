// @migrated-to-permissions 2026-04-18
// @feature-verified bookmarks 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

export async function PATCH(request, { params }) {
  let user;
  try { user = await requirePermission('bookmarks.collection.rename'); }
  catch (err) { if (err.status) return NextResponse.json({ error: err.message }, { status: err.status }); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }

  const { name, description } = await request.json().catch(() => ({}));
  const service = createServiceClient();
  const { error } = await service.rpc('rename_bookmark_collection', {
    p_user_id: user.id,
    p_collection_id: params.id,
    p_name: name,
    p_description: description || null,
  });
  if (error) return safeErrorResponse(NextResponse, error, { route: 'bookmark_collections.id', fallbackStatus: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request, { params }) {
  let user;
  try { user = await requirePermission('bookmarks.collection.delete'); }
  catch (err) { if (err.status) return NextResponse.json({ error: err.message }, { status: err.status }); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }

  const service = createServiceClient();
  const { error } = await service.rpc('delete_bookmark_collection', {
    p_user_id: user.id,
    p_collection_id: params.id,
  });
  if (error) return safeErrorResponse(NextResponse, error, { route: 'bookmark_collections.id', fallbackStatus: 400 });
  return NextResponse.json({ ok: true });
}
