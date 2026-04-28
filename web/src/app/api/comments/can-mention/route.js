// S5-§H2 — pre-submit mention authorization probe.
//
// Pre-§H2 the post-comment RPC silently dropped mention fan-out for
// free-tier authors. The user saw their @reply syntax succeed visually
// (the resolved-mentions array was populated for tappable rendering)
// but the mentioned user was never notified. That breaks user
// expectation of "I see the @link in my own comment, therefore the
// other person sees it" and silently discriminates against free tier
// without telling either party.
//
// The genuine fix is a pre-submit lock at the composer: extract the
// `@username` tokens, ask the server "can I mention these?", and block
// the submit (with an actionable error) when the answer is no. Server-
// side defense-in-depth lives in the post_comment RPC (S1 territory)
// so a hand-crafted POST that bypasses the composer also fails.
//
// Contract:
//   POST /api/comments/can-mention
//   Body: { usernames: string[] }   // 1..50 names, deduped + lowercased server-side
//   Auth: bearer required.
//   Resp:
//     200 { allowed: true }
//       OR
//     200 { allowed: false, reason: 'free_tier_mention_disabled' | 'mentioned_user_blocks_you' | 'mentioned_user_not_found',
//            usernames?: string[] }
//   401 unauthenticated. 400 bad request. 429 rate-limited.
//
// Rate limit: 60/min per user. The composer fires this every keystroke
// settle, so the cap is high enough to allow live editing.

import { NextResponse } from 'next/server';
import { requireAuth, hasPermissionServer } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };
const MAX_USERNAMES_PER_REQUEST = 50;

export async function POST(request) {
  let user;
  try {
    user = await requireAuth();
  } catch (err) {
    if (err.status) {
      console.error('[comments.can-mention.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status, headers: NO_STORE }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `can-mention:${user.id}`,
    policyKey: 'comments_can_mention',
    max: 60,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  let parsed;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: NO_STORE });
  }
  const raw = parsed?.usernames;
  if (!Array.isArray(raw)) {
    return NextResponse.json(
      { error: 'usernames array required' },
      { status: 400, headers: NO_STORE }
    );
  }
  // Normalize: trim, drop blanks, lowercase, dedupe, cap.
  const usernames = Array.from(
    new Set(
      raw
        .filter((u) => typeof u === 'string')
        .map((u) => u.trim().replace(/^@/, '').toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, MAX_USERNAMES_PER_REQUEST);

  if (usernames.length === 0) {
    return NextResponse.json({ allowed: true }, { headers: NO_STORE });
  }

  // 1. Plan / permission gate. comments.mention.insert is the gate the
  //    composer's resolveMentions already consults; the post_comment RPC
  //    re-validates server-side.
  const canMention = await hasPermissionServer('comments.mention.insert');
  if (!canMention) {
    return NextResponse.json(
      { allowed: false, reason: 'free_tier_mention_disabled' },
      { headers: NO_STORE }
    );
  }

  // 2. Resolve each username → user_id and surface unresolved names so
  //    the composer can drop the @-token before submit. We don't fail
  //    the submit on unresolved (they'll render as plain text anyway);
  //    the composer chooses what to do.
  const { data: resolvedRows, error: resolveErr } = await service
    .from('users')
    .select('id, username')
    .in('username', usernames);
  if (resolveErr) {
    console.error('[comments.can-mention.resolve]', resolveErr);
    return NextResponse.json(
      { error: 'resolve_failed' },
      { status: 500, headers: NO_STORE }
    );
  }
  const resolved = (resolvedRows || []).filter(
    (r) => typeof r.id === 'string' && typeof r.username === 'string'
  );
  const resolvedNames = new Set(resolved.map((r) => r.username.toLowerCase()));
  const unresolved = usernames.filter((u) => !resolvedNames.has(u));

  // 3. Block check. blocked_users.blocker_id is the OTHER user (the
  //    mention target) blocking the caller; if any mentioned user has
  //    blocked the caller, the mention can't fan out to them.
  if (resolved.length > 0) {
    const targetIds = resolved.map((r) => r.id);
    const { data: blocks, error: blockErr } = await service
      .from('blocked_users')
      .select('blocker_id')
      .in('blocker_id', targetIds)
      .eq('blocked_id', user.id);
    if (blockErr) {
      console.error('[comments.can-mention.blocks]', blockErr);
      return NextResponse.json(
        { error: 'block_check_failed' },
        { status: 500, headers: NO_STORE }
      );
    }
    if (Array.isArray(blocks) && blocks.length > 0) {
      const blockerIds = new Set(blocks.map((b) => b.blocker_id));
      const blockingUsernames = resolved
        .filter((r) => blockerIds.has(r.id))
        .map((r) => r.username);
      return NextResponse.json(
        {
          allowed: false,
          reason: 'mentioned_user_blocks_you',
          usernames: blockingUsernames,
        },
        { headers: NO_STORE }
      );
    }
  }

  // 4. Soft-fail on unresolved — return allowed=true with the unresolved
  //    list so the composer can hint the user. Plain text without an
  //    array entry already renders as text in CommentRow.
  if (unresolved.length > 0) {
    return NextResponse.json(
      { allowed: true, unresolved },
      { headers: NO_STORE }
    );
  }
  return NextResponse.json({ allowed: true }, { headers: NO_STORE });
}
