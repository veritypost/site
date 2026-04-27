// @migrated-to-permissions 2026-04-18
// @feature-verified notifications 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';
import { safeErrorResponse } from '@/lib/apiErrors';

const MAX_IDS_PER_PATCH = 200;

// GET /api/notifications?unread=1&limit=50
/**
 * @param {import('next/server').NextRequest} request
 * @returns {Promise<import('next/server').NextResponse>}
 */
export async function GET(request) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;
  let user;
  try {
    user = await requirePermission('notifications.inbox.view');
  } catch (err) {
    if (err.status) {
      console.error('[notifications.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const url = new URL(request.url);
  const unread = url.searchParams.get('unread') === '1';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);

  const service = createServiceClient();
  let q = service
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (unread) q = q.eq('is_read', false);

  const { data, error } = await q;
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'notifications.get',
      fallbackStatus: 400,
    });

  const { count } = await service
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false);

  return NextResponse.json({ notifications: data || [], unread_count: count || 0 });
}

// PATCH /api/notifications — body: { ids?: [], mark: 'read'|'seen', all?: bool }
export async function PATCH(request) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;
  let user;
  try {
    user = await requirePermission('notifications.mark_read');
  } catch (err) {
    if (err.status) {
      console.error('[notifications.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const { ids, mark, all } = await request.json().catch(() => ({}));
  const service = createServiceClient();
  const now = new Date().toISOString();
  const update =
    mark === 'seen'
      ? { is_seen: true, seen_at: now }
      : { is_read: true, read_at: now, is_seen: true, seen_at: now };

  let q = service.from('notifications').update(update).eq('user_id', user.id);
  if (all) {
    // affects all of this user's rows
  } else if (Array.isArray(ids) && ids.length > 0) {
    // F-075 — cap unbounded ids[] payloads. Callers can still mark
    // many rows read via multiple requests or {all: true}.
    if (ids.length > MAX_IDS_PER_PATCH) {
      return NextResponse.json(
        { error: `Too many ids (max ${MAX_IDS_PER_PATCH} per request)` },
        { status: 413 }
      );
    }
    q = q.in('id', ids);
  } else {
    return NextResponse.json({ error: 'ids or all required' }, { status: 400 });
  }
  const { error } = await q;
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'notifications.patch',
      fallbackStatus: 400,
    });
  return NextResponse.json({ ok: true });
}
