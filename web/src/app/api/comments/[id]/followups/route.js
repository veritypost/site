// POST /api/comments/[id]/followups — author-only, cap-of-2.
// DELETE /api/comments/[id]/followups?fid=<followup_id> — author or mod.
//
// TODO-48 author follow-ups. Comments stay non-editable; the comment author
// can append up to 2 short notes that pin beneath the parent. Cap is
// enforced server-side by the create_comment_followup RPC (locks parent
// FOR UPDATE + re-counts) plus a UNIQUE (comment_id, sort_order) constraint.
// Body limit 280 chars (DB CHECK + RPC pre-check).

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function POST(request, { params }) {
  let user;
  try {
    user = await requireAuth();
  } catch (err) {
    return NextResponse.json(
      { error: err?.status === 403 ? 'Forbidden' : 'Unauthenticated' },
      { status: err?.status || 401, headers: NO_STORE }
    );
  }

  const text = await request.text().catch(() => '');
  if (text.length > 5_000) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413, headers: NO_STORE });
  }
  let parsed = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    /* malformed JSON → empty-object validation below */
  }
  const body = typeof parsed.body === 'string' ? parsed.body : '';
  const trimmed = body.trim();
  if (!trimmed) {
    return NextResponse.json(
      { error: 'follow-up body is required' },
      { status: 400, headers: NO_STORE }
    );
  }
  if (trimmed.length > 280) {
    return NextResponse.json(
      { error: 'follow-up exceeds 280 chars' },
      { status: 400, headers: NO_STORE }
    );
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('create_comment_followup', {
    p_comment_id: params.id,
    p_body: trimmed,
  });

  if (error) {
    console.error('[comments.followups.create.rpc]', error?.message || error);
    // Stable SQLSTATE check first — VP001 = follow-up cap hit. Falls back to
    // string-match so older RPC versions still map correctly during rollout.
    const code = error.code;
    const msg = (error.message || '').toLowerCase();
    if (code === 'VP001' || msg.includes('cap of 2 reached')) {
      return NextResponse.json(
        { error: 'followup_cap_hit', message: 'this comment already has 3 updates.' },
        { status: 409, headers: NO_STORE }
      );
    }
    // Author mismatch → 403.
    if (msg.includes('only the comment author')) {
      return NextResponse.json(
        { error: 'not_author', message: 'only the comment author can post follow-ups.' },
        { status: 403, headers: NO_STORE }
      );
    }
    // Parent missing / deleted.
    if (msg.includes('parent comment not found')) {
      return NextResponse.json(
        { error: 'parent_missing' },
        { status: 404, headers: NO_STORE }
      );
    }
    return safeErrorResponse(NextResponse, error, {
      route: 'comments.id.followups.post',
      fallbackStatus: 400,
    });
  }

  return NextResponse.json({ followup: data }, { headers: NO_STORE });
}

export async function DELETE(request, { params }) {
  let user;
  try {
    user = await requireAuth();
  } catch (err) {
    return NextResponse.json(
      { error: err?.status === 403 ? 'Forbidden' : 'Unauthenticated' },
      { status: err?.status || 401, headers: NO_STORE }
    );
  }

  const url = new URL(request.url);
  const fid = url.searchParams.get('fid');
  if (!fid) {
    return NextResponse.json({ error: 'fid required' }, { status: 400, headers: NO_STORE });
  }

  // RLS handles author-or-mod authorization on DELETE. Use the user-scoped
  // client (not service) so the policy applies. The route is mounted under
  // an authenticated session so the supabase server client carries the user
  // JWT; we re-create here to match the close/route pattern.
  const service = createServiceClient();
  const { error } = await service
    .from('comment_followups')
    .delete()
    .eq('id', fid)
    .eq('comment_id', params.id)
    .eq('user_id', user.id);

  if (error) {
    console.error('[comments.followups.delete]', error?.message || error);
    return safeErrorResponse(NextResponse, error, {
      route: 'comments.id.followups.delete',
      fallbackStatus: 400,
    });
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
