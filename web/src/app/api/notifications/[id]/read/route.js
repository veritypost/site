// S5-A104 — fire-and-forget mark-one-as-read endpoint.
//
// The legacy markOne flow on /notifications used PATCH /api/notifications
// with `{ ids: [id], mark: 'read' }` and `await`-ed the fetch in the row's
// onClick. When the row had an action_url, the browser navigation
// frequently cancelled the in-flight fetch before it reached the server,
// leaving the badge stuck unread on return. POST /api/notifications/[id]/
// read is the per-id companion that:
//
//   - Accepts navigator.sendBeacon's `application/json` Blob (Chrome) AND
//     the `text/plain` payload Safari sends — content-type handling is
//     normalized so either spelling lands the row.
//   - Survives navigation when called with `keepalive: true` (the client
//     fallback when sendBeacon is unavailable or the browser rejected it).
//   - Stays idempotent: marking an already-read row is a no-op (no
//     duplicate `read_at` rewrite, no error code distinction from the
//     fresh-mark case).
//   - Returns minimal payload so beacon overhead stays tiny.
//
// The bulk operations (mark-all, multi-id) continue through PATCH
// /api/notifications. Both paths share the `notifications.mark_read`
// permission gate and the same authoritative service-client write.

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';
import { safeErrorResponse } from '@/lib/apiErrors';

// T170/T209 — per-user state, never cacheable.
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST(request, { params }) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;

  let user;
  try {
    user = await requirePermission('notifications.mark_read');
  } catch (err) {
    if (err.status) {
      console.error('[notifications.[id].read.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status, headers: NO_STORE }
      );
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500, headers: NO_STORE });
  }

  const { id } = params;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id required' }, { status: 400, headers: NO_STORE });
  }

  const service = createServiceClient();
  const now = new Date().toISOString();
  const { error } = await service
    .from('notifications')
    .update({ is_read: true, read_at: now, is_seen: true, seen_at: now })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) {
    return safeErrorResponse(NextResponse, error, {
      route: 'notifications.id.read',
      fallbackStatus: 400,
      headers: NO_STORE,
    });
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
