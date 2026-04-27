// @migrated-to-permissions 2026-04-18
// @feature-verified messaging 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

// T170/T209 — conversation state is per-user; never cacheable by a CDN
// or shared proxy. Apply to every response on this route.
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

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
        { status: err.status, headers: NO_STORE }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
  }

  const { other_user_id } = await request.json().catch(() => ({}));
  if (!other_user_id) {
    return NextResponse.json(
      { error: 'other_user_id required' },
      { status: 400, headers: NO_STORE }
    );
  }

  const service = createServiceClient();

  // H27 — throttle conversation starts. The underlying RPC dedupes
  // on an existing direct convo so re-tries don't create rows, but
  // a user enumerating other_user_ids would still probe the
  // self-start / paid-gate / muted-target error codes. Cap at 10/min
  // per caller. Composing messages within an existing convo is gated
  // separately by /api/messages rate limits.
  const rate = await checkRateLimit(service, {
    key: `conversations.start:${user.id}`,
    policyKey: 'conversations.start',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many conversation starts. Slow down.' },
      {
        status: 429,
        headers: { ...NO_STORE, 'Retry-After': String(rate.windowSec ?? 60) },
      }
    );
  }

  const { data, error } = await service.rpc('start_conversation', {
    p_user_id: user.id,
    p_other_user_id: other_user_id,
  });
  if (error) {
    const msg = error.message || '';
    // Stable `[CODE]` prefix from schema/150 start_conversation RPC.
    // Prefix is server-internal (never shipped to the client).
    const codeMatch = msg.match(/^\[([A-Z_]+)\]/);
    const code = codeMatch?.[1] || null;
    // T283 + T16 — collapse USER_NOT_FOUND / DM_PAID_PLAN / DM_MUTED /
    // DM_RECIPIENT_OPTED_OUT into a single `cannot_dm` 403.
    // Distinguishing them by status code lets a caller enumerate which
    // user_ids exist (404 vs 403), which are on a paid tier vs blocked,
    // and now (post T16 RPC patch) which recipients have toggled
    // allow_messages off. Keep the granular reason in server logs only;
    // the client-facing surface is uniform. Self-message and missing-ids
    // are caller-input shape errors and stay as 400 — they don't leak
    // target-user state.
    let status;
    let userMsg;
    if (
      code === 'DM_PAID_PLAN' ||
      code === 'DM_MUTED' ||
      code === 'USER_NOT_FOUND' ||
      code === 'DM_RECIPIENT_OPTED_OUT'
    ) {
      status = 403;
      userMsg = 'cannot_dm';
    } else if (code === 'SELF_CONV') {
      status = 400;
      userMsg = 'You cannot message yourself.';
    } else if (code === 'DM_MISSING_IDS') {
      status = 400;
      userMsg = 'Could not start conversation';
    } else {
      status = 400;
      userMsg = 'Could not start conversation';
    }
    console.error('[conversations.post]', { code, message: msg });
    return NextResponse.json({ error: userMsg }, { status, headers: NO_STORE });
  }
  return NextResponse.json({ conversation: data }, { headers: NO_STORE });
}
