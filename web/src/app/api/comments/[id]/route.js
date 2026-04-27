// @migrated-to-permissions 2026-04-18
// @feature-verified comments 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';
import { checkRateLimit } from '@/lib/rateLimit';
import { getSettings, getNumber } from '@/lib/settings';
import { COPY } from '@/lib/copy';

// T173 — defense-in-depth body length cap mirroring POST /api/comments. The
// edit_comment RPC enforces internally; this fast-fails hostile or runaway
// clients before we burn the lookup + RPC round-trip. Same fallback as POST.
const COMMENT_MAX_LENGTH_FALLBACK = 4000;

// T170/T209 — authenticated user data must never be cacheable by a CDN
// or shared proxy. Apply private/no-store to every response on this
// route (success + error paths).
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

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
        { status: err.status, headers: NO_STORE }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
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
      { status: 429, headers: { ...NO_STORE, 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const { body } = await request.json().catch(() => ({}));
  if (!body) {
    return NextResponse.json({ error: 'body required' }, { status: 400, headers: NO_STORE });
  }

  // T173 — body-length cap matching POST. RPC enforces internally; this is
  // route-level parity so PATCH and POST short-circuit the same way.
  const settings = await getSettings(service).catch(() => ({}));
  const commentMaxLength = getNumber(settings, 'comment_max_length', COMMENT_MAX_LENGTH_FALLBACK);
  if (typeof body !== 'string' || body.length > commentMaxLength) {
    return NextResponse.json(
      { error: 'comment_too_long', max_length: commentMaxLength },
      { status: 400, headers: NO_STORE }
    );
  }

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
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  }
  if (existing.user_id === user.id) {
    const createdAt = new Date(existing.created_at).getTime();
    if (Number.isFinite(createdAt) && Date.now() - createdAt > EDIT_WINDOW_MS) {
      // `error` stays a stable machine code so existing clients keep working;
      // `message` is the user-facing copy sourced from the i18n seed so any
      // client that wants to surface the text inline reads it from a single
      // place.
      return NextResponse.json(
        { error: 'edit_window_expired', message: COPY.comments.editWindowExpired },
        { status: 403, headers: NO_STORE }
      );
    }
  }

  const { error } = await service.rpc('edit_comment', {
    p_user_id: user.id,
    p_comment_id: id,
    p_body: body,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'comments.id',
      fallbackStatus: 400,
      headers: NO_STORE,
    });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
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
        { status: err.status, headers: NO_STORE }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
  }

  const { id } = params;
  const service = createServiceClient();
  const { error } = await service.rpc('soft_delete_comment', {
    p_user_id: user.id,
    p_comment_id: id,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'comments.id',
      fallbackStatus: 400,
      headers: NO_STORE,
    });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
