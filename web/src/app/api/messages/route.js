// @migrated-to-permissions 2026-04-18
// @feature-verified messaging 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// T170/T209 — DM send is per-user authoritative state; never let a CDN
// or shared proxy hold any of it. Apply private/no-store to every
// response (success + error + 429 with Retry-After).
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

// POST /api/messages — authoritative send path. Bug 83 replaced the
// browser's direct `messages.insert` with this route so paid-tier,
// mute/ban, participant, rate-limit, and length checks all run server-
// side via the post_message RPC (migration 049).
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('messages.dm.compose');
  } catch (err) {
    if (err.status) {
      console.error('[messages.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status, headers: NO_STORE }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
  }

  // T171 — bound the request size before JSON.parse so a hostile caller
  // can't force the runtime to buffer/parse an unbounded body. 50 KB is
  // ample for any legitimate DM payload (post_message RPC enforces a
  // tighter content cap downstream).
  const text = await request.text().catch(() => '');
  if (text.length > 50_000) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413, headers: NO_STORE });
  }
  let parsed = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    /* malformed JSON falls through to the empty-object validation below */
  }
  const { conversation_id, body } = parsed;
  if (!conversation_id || !body) {
    return NextResponse.json(
      { error: 'conversation_id and body required' },
      { status: 400, headers: NO_STORE }
    );
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('post_message', {
    p_user_id: user.id,
    p_conversation_id: conversation_id,
    p_body: body,
  });
  if (error) {
    const msg = error.message || '';
    // Stable `[CODE]` prefix from schema/150 post_message RPC. The prefix
    // is server-internal; it never ships to the user (we send `userMsg`
    // from the lookup below).
    const codeMatch = msg.match(/^\[([A-Z_]+)\]/);
    const code = codeMatch?.[1] || null;
    // T17 — DM_BLOCKED joins the existing 403 set; folded with the
    // existing reasons to a single uniform user-facing message so the
    // response shape doesn't leak whether the gate fired on plan, mute,
    // participation, or block. Granular code stays in server logs only.
    let status;
    if (code === 'DM_PAID_PLAN') status = 403;
    else if (code === 'DM_MUTED') status = 403;
    else if (code === 'NOT_PARTICIPANT') status = 403;
    else if (code === 'DM_BLOCKED') status = 403;
    else if (code === 'DM_RATE_LIMIT') status = 429;
    else if (code === 'DM_EMPTY' || code === 'DM_TOO_LONG') status = 400;
    else status = 400;
    const userMsg =
      status === 429
        ? 'Too many messages. Please slow down.'
        : status === 403
          ? 'You cannot send messages in this conversation.'
          : 'Could not send message';
    console.error('[messages.post]', error);
    const headers = status === 429 ? { ...NO_STORE, 'Retry-After': '60' } : NO_STORE;
    return NextResponse.json({ error: userMsg }, { status, headers });
  }

  return NextResponse.json({ message: data }, { headers: NO_STORE });
}
