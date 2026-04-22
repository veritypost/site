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
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
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
    const status = msg.includes('paid plan')
      ? 403
      : msg.includes('muted') || msg.includes('banned')
        ? 403
        : msg.includes('not found')
          ? 404
          : msg.includes('yourself')
            ? 400
            : 400;
    const userMsg =
      status === 404
        ? 'Recipient not found.'
        : status === 403
          ? 'You cannot start a conversation with this user.'
          : msg.includes('yourself')
            ? 'You cannot message yourself.'
            : 'Could not start conversation';
    console.error('[conversations.post]', error);
    return NextResponse.json({ error: userMsg }, { status });
  }
  return NextResponse.json({ conversation: data });
}
