// @migrated-to-permissions 2026-04-18
// @feature-verified bookmarks 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';
import { checkRateLimit } from '@/lib/rateLimit';

// Shared rate-limit bucket across PATCH and DELETE — POST has its
// own bucket (bookmark-collections.create); the [id] mutations were
// ungated until this fix.
async function collectionMutateRateLimit(service, userId) {
  const rl = await checkRateLimit(service, {
    key: `bookmark_collection_mutate:${userId}`,
    policyKey: 'bookmark_collection_mutate',
    max: 30,
    windowSec: 60,
  });
  if (!rl.limited) return null;
  return NextResponse.json(
    { error: 'Too many requests' },
    { status: 429, headers: { 'Retry-After': String(rl.windowSec ?? 60) } }
  );
}

export async function PATCH(request, { params }) {
  let user;
  try {
    user = await requirePermission('bookmarks.collection.rename');
  } catch (err) {
    if (err.status) {
      console.error('[bookmark-collections.[id].permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const { name, description } = await request.json().catch(() => ({}));
  const service = createServiceClient();
  const limited = await collectionMutateRateLimit(service, user.id);
  if (limited) return limited;
  const { error } = await service.rpc('rename_bookmark_collection', {
    p_user_id: user.id,
    p_collection_id: params.id,
    p_name: name,
    p_description: description || null,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'bookmark_collections.id',
      fallbackStatus: 400,
    });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request, { params }) {
  let user;
  try {
    user = await requirePermission('bookmarks.collection.delete');
  } catch (err) {
    if (err.status) {
      console.error('[bookmark-collections.[id].permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const service = createServiceClient();
  const limited = await collectionMutateRateLimit(service, user.id);
  if (limited) return limited;
  const { error } = await service.rpc('delete_bookmark_collection', {
    p_user_id: user.id,
    p_collection_id: params.id,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'bookmark_collections.id',
      fallbackStatus: 400,
    });
  return NextResponse.json({ ok: true });
}
