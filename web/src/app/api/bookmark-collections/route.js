// @migrated-to-permissions 2026-04-18
// @feature-verified bookmarks 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';

// GET  — list the caller's collections.
// POST — create one (paid-only; RPC enforces).
export async function GET() {
  let user;
  try {
    user = await requirePermission('bookmarks.list.view');
  } catch (err) {
    if (err.status) {
      console.error('[bookmark-collections.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('bookmark_collections')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order')
    .order('created_at');
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'bookmark_collections',
      fallbackStatus: 400,
    });
  return NextResponse.json({ collections: data || [] });
}

export async function POST(request) {
  let user;
  try {
    user = await requirePermission('bookmarks.collection.create');
  } catch (err) {
    if (err.status) {
      console.error('[bookmark-collections.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const { name, description } = await request.json().catch(() => ({}));
  const service = createServiceClient();

  // H27 — cap collection creation so a paid user can't spam the
  // bookmark_collections table. 20 collections created in 60s is
  // ample for reasonable organization; anything faster is almost
  // certainly bot / automation.
  const rate = await checkRateLimit(service, {
    key: `bookmark-collections:${user.id}`,
    policyKey: 'bookmark-collections.create',
    max: 20,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Slow down — too many collections created too fast.' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const { data, error } = await service.rpc('create_bookmark_collection', {
    p_user_id: user.id,
    p_name: name,
    p_description: description || null,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'bookmark_collections',
      fallbackStatus: 400,
    });
  return NextResponse.json({ id: data });
}
