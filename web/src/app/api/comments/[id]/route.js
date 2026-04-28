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

// =====================================================================
// S5-iOS-parity (A123 / A124 / A125 / A126) — comment edit + delete
// API contract published for S9 to cite by file:line.
//
// Contract: edit (A123)
// ---------------------
//   PATCH /api/comments/[id]
//   Body:    { body: string }                  // 1..comment_max_length chars after trim
//   Auth:    bearer required.
//   Perms:   comments.edit.own (owner) — mods/admins use the moderation
//            surface, gated on a different permission key.
//   Window:  EDIT_WINDOW_MS = 10 minutes from comments.created_at for the
//            owner branch (T280). Mods bypass via the moderation surface.
//   Server:  edit_comment RPC sets body, body_html (re-render), is_edited,
//            edited_at, mentions (re-extracted from new body); mentions
//            unresolved against users.username get dropped.
//   Resp:    200 { ok: true } | 400 { error: 'body required' | 'comment_too_long' (+ max_length) }
//                              | 403 { error: 'edit_window_expired' (+ message), or 'Forbidden' }
//                              | 404 { error: 'not_found' }
//                              | 429 { error: 'Too many requests', Retry-After header }
//   Realtime: server emits an UPDATE on comments via Postgres realtime;
//             web's CommentThread.tsx UPDATE handler merges. iOS must
//             subscribe to the same UPDATE channel to receive parity.
//
// Contract: soft-delete (A126)
// -----------------------------
//   DELETE /api/comments/[id]
//   Auth:    bearer required.
//   Perms:   comments.delete.own (owner) — mods use moderation surface.
//   Server:  soft_delete_comment RPC sets deleted_at = now(),
//            body = '[deleted]', body_html = NULL, mentions = '[]'::jsonb
//            (T2.2 anonymize pattern).
//   Resp:    200 { ok: true } | 400 { error: '...' } | 401/403 | 404
//   Render:  clients render `[deleted]` tombstone when deleted_at IS NOT
//            NULL. iOS VPComment model decodes deleted_at, status,
//            is_edited, mentions, context_tag_count, is_context_pinned
//            per A126 to reach parity with the web row.
//
// Contract: mention array (A126 / §H2)
// -------------------------------------
//   comments.mentions is jsonb array of { user_id: uuid, username: string }.
//   Server populates on insert (POST /api/comments) and on edit (PATCH
//   above) by extracting `@<username>` tokens via MENTION_RE, looking
//   them up in users.username, writing the resolved pair. Unresolved
//   mentions get dropped from the array. Free-tier authors are gated at
//   pre-submit by /api/comments/can-mention (S5-§H2); the post_comment
//   RPC re-validates plan to defend against hand-crafted POSTs that
//   bypass the composer.
//
//   iOS contract: decode the array; render each `@username` as a
//   tappable element that opens /card/<username>. Plain `@username`
//   text without a corresponding array entry renders as plain text.
//
// Contract: threading depth (A125)
// ---------------------------------
//   Server allows arbitrary depth via comments.parent_id chain. Web caps
//   visual nesting via /api/settings/public.comment_max_depth (default
//   2). Owner-locked Q4.15 = B (iOS-native "Continue this thread →"
//   affordance at depth 3 that opens the rest in a fullscreen sheet).
//   iOS keeps maxThreadDepth = 3 in StoryDetailView.swift; at depth 3
//   it renders a "Continue this thread →" button that re-roots a sheet
//   at that comment and renders depth 0..3 of the subtree, recursive.
// =====================================================================

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
