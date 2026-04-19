// @migrated-to-permissions 2026-04-18
// @feature-verified messaging 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// POST /api/messages — authoritative send path. Bug 83 replaced the
// browser's direct `messages.insert` with this route so paid-tier,
// mute/ban, participant, rate-limit, and length checks all run server-
// side via the post_message RPC (migration 049).
export async function POST(request) {
  let user;
  try { user = await requirePermission('messages.dm.compose'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { conversation_id, body } = await request.json().catch(() => ({}));
  if (!conversation_id || !body) {
    return NextResponse.json({ error: 'conversation_id and body required' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('post_message', {
    p_user_id: user.id,
    p_conversation_id: conversation_id,
    p_body: body,
  });
  if (error) {
    const msg = error.message || 'send failed';
    const status = msg.includes('paid plan') ? 403
      : msg.includes('muted') || msg.includes('banned') ? 403
      : msg.includes('rate limit') ? 429
      : msg.includes('participant') ? 403
      : 400;
    return NextResponse.json({ error: msg }, { status });
  }

  return NextResponse.json({ message: data });
}
