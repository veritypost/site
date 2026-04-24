// @migrated-to-permissions 2026-04-18
// @feature-verified messaging 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// POST /api/conversations -- authoritative convo-create path. Pairs with
// POST /api/messages. Replaces direct `conversations.insert` +
// `conversation_participants.insert` that let free accounts create empty
// solo-owner convos (Round 7 Bug 1). The start_conversation RPC enforces
// paid gate (user_has_dm_access), mute/ban, self-start guard, recipient
// existence, and dedupes on an existing direct conversation -- all in a
// single SECURITY DEFINER transaction so we never leave half-built convos.
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('messages.dm.compose');
  } catch (err) {
    if (err.status) {
      console.error('[conversations.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { other_user_id } = await request.json().catch(() => ({}));
  if (!other_user_id) {
    return NextResponse.json({ error: 'other_user_id required' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('start_conversation', {
    p_user_id: user.id,
    p_other_user_id: other_user_id,
  });
  if (error) {
    const msg = error.message || '';
    // Stable `[CODE]` prefix from schema/150 start_conversation RPC.
    // Substring fallback stays for the pre-migration window — delete
    // once 150 is applied. Prefix is server-internal (never shipped).
    const codeMatch = msg.match(/^\[([A-Z_]+)\]/);
    const code = codeMatch?.[1] || null;
    let status;
    if (code === 'DM_PAID_PLAN') status = 403;
    else if (code === 'DM_MUTED') status = 403;
    else if (code === 'USER_NOT_FOUND') status = 404;
    else if (code === 'SELF_CONV') status = 400;
    else if (code === 'DM_MISSING_IDS') status = 400;
    else if (msg.includes('paid plan')) status = 403;
    else if (msg.includes('muted') || msg.includes('banned')) status = 403;
    else if (msg.includes('not found')) status = 404;
    else if (msg.includes('yourself')) status = 400;
    else status = 400;
    const isSelf = code === 'SELF_CONV' || msg.includes('yourself');
    const userMsg =
      status === 404
        ? 'Recipient not found.'
        : status === 403
          ? 'You cannot start a conversation with this user.'
          : isSelf
            ? 'You cannot message yourself.'
            : 'Could not start conversation';
    console.error('[conversations.post]', error);
    return NextResponse.json({ error: userMsg }, { status });
  }
  return NextResponse.json({ conversation: data });
}
