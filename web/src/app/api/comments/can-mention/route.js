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
// Wave 3 (EXPERT_THREADS.md §10) extends the route to enforce asker
// mention rate caps + per-expert quota when the kill switch is ON.
// When the kill switch is OFF the route falls through to the original
// legacy shape — composer behavior pre-Wave-3 is preserved exactly.
//
// Contract:
//   POST /api/comments/can-mention
//   Body (legacy):  { usernames: string[] }
//   Body (Wave 3):  { body: string, article_id?: string }
//                   When `body` is present, server parses the proposed
//                   comment body for both bare mentions and expert
//                   tokens (`@expert`, `@expert_<username>`).
//   Auth: bearer required.
//   Resp:
//     200 { allowed: true [, unresolved] }
//       OR
//     200 { allowed: false, reason: 'free_tier_mention_disabled' | 'mentioned_user_blocks_you' | 'mentioned_user_not_found',
//            usernames?: string[] }
//   Wave 3 (kill switch ON) extends 200 with:
//        { allowed: true, directed_targets: [{user_id, username}],
//          at_quota_targets: [{user_id, username}],
//          broadcast: boolean }
//   429 { error: 'mention_cap_hit', composer_message, detail }
//   401 unauthenticated. 400 bad request. 429 rate-limited (route-level too).
//
// Rate limit: 60/min per user. The composer fires this every keystroke
// settle, so the cap is high enough to allow live editing.

import { NextResponse } from 'next/server';
import { requireAuth, hasPermissionServer } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { parseMentions } from '@/lib/mentions';
import { getExpertConfigSnapshot } from '@/lib/expertConfig';

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

  // ──────────────────────────────────────────────────────────────────────
  // Wave 3 kill-switch read-once-per-TXN (mitigation §2 #12).
  // Snapshot pinned for the rest of this request.
  // ──────────────────────────────────────────────────────────────────────
  const expertConfig = await getExpertConfigSnapshot();

  // Determine input shape. Wave 3 callers send `{body, article_id}`; legacy
  // callers send `{usernames}`. When the body is present we parse it for
  // both bare + expert tokens; otherwise we honor the legacy usernames
  // payload exactly.
  const rawBody = typeof parsed?.body === 'string' ? parsed.body : null;
  const articleId = typeof parsed?.article_id === 'string' ? parsed.article_id : null;
  const rawUsernames = parsed?.usernames;

  let bareUsernames = [];
  let expertDirected = [];
  let expertBroadcast = false;

  if (rawBody !== null) {
    const parts = parseMentions(rawBody);
    bareUsernames = parts.bare;
    expertDirected = parts.expertDirected;
    expertBroadcast = parts.expertBroadcast;
  } else if (Array.isArray(rawUsernames)) {
    bareUsernames = Array.from(
      new Set(
        rawUsernames
          .filter((u) => typeof u === 'string')
          .map((u) => u.trim().replace(/^@/, '').toLowerCase())
          .filter(Boolean)
      )
    );
  } else {
    return NextResponse.json(
      { error: 'usernames array or body string required' },
      { status: 400, headers: NO_STORE }
    );
  }

  // Cap inputs.
  bareUsernames = bareUsernames.slice(0, MAX_USERNAMES_PER_REQUEST);
  expertDirected = expertDirected.slice(0, MAX_USERNAMES_PER_REQUEST);

  // No mentions of any kind → nothing to authorize.
  if (
    bareUsernames.length === 0 &&
    expertDirected.length === 0 &&
    !expertBroadcast
  ) {
    return NextResponse.json({ allowed: true }, { headers: NO_STORE });
  }

  // 1. Plan / permission gate. comments.mention.insert is the gate the
  //    composer's resolveMentions already consults; the post_comment RPC
  //    re-validates server-side. Expert mentions require the same gate
  //    (they're a kind of mention; broadcast permission is checked later
  //    inside the post_comment RPC per spec §2.5).
  const canMention = await hasPermissionServer('comments.mention.insert');
  if (!canMention) {
    return NextResponse.json(
      { allowed: false, reason: 'free_tier_mention_disabled' },
      { headers: NO_STORE }
    );
  }

  // 2. Resolve bare + directed-expert usernames → ids in a single query.
  const allUsernames = Array.from(
    new Set([...bareUsernames, ...expertDirected].map((u) => u.toLowerCase()))
  );

  let resolvedRows = [];
  if (allUsernames.length > 0) {
    const { data, error: resolveErr } = await service
      .from('users')
      .select('id, username')
      .in('username', allUsernames);
    if (resolveErr) {
      console.error('[comments.can-mention.resolve]', resolveErr);
      return NextResponse.json(
        { error: 'resolve_failed' },
        { status: 500, headers: NO_STORE }
      );
    }
    resolvedRows = (data || []).filter(
      (r) => typeof r.id === 'string' && typeof r.username === 'string'
    );
  }

  const usernameToId = new Map();
  for (const r of resolvedRows) {
    usernameToId.set(r.username.toLowerCase(), r.id);
  }
  const resolvedNames = new Set(usernameToId.keys());
  const unresolved = bareUsernames.filter((u) => !resolvedNames.has(u));

  // 3. Block check on bare mentions only. Expert mentions don't honor
  //    individual blocks — picker visibility is governed by pause/quiet/quota.
  const bareTargetIds = bareUsernames
    .map((u) => usernameToId.get(u))
    .filter((id) => typeof id === 'string');
  if (bareTargetIds.length > 0) {
    const { data: blocks, error: blockErr } = await service
      .from('blocked_users')
      .select('blocker_id')
      .in('blocker_id', bareTargetIds)
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
      const blockingUsernames = bareUsernames.filter((u) => {
        const id = usernameToId.get(u);
        return id && blockerIds.has(id);
      });
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

  // ──────────────────────────────────────────────────────────────────────
  // Wave 3 kill-switch fall-through. When OFF, return legacy shape —
  // expert tokens are passed through but not enforced (post_comment RPC
  // is the defense-in-depth layer; this route just doesn't gate them).
  // ──────────────────────────────────────────────────────────────────────
  if (!expertConfig.killSwitch) {
    if (unresolved.length > 0) {
      return NextResponse.json(
        { allowed: true, unresolved },
        { headers: NO_STORE }
      );
    }
    return NextResponse.json({ allowed: true }, { headers: NO_STORE });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Wave 3 expert enforcement (kill switch ON).
  // Only fires when there's an expert mention to gate; bare-only drafts
  // skip the new RPCs entirely so legacy non-expert mention paths see no
  // added latency.
  // ──────────────────────────────────────────────────────────────────────
  const directedIds = expertDirected
    .map((u) => usernameToId.get(u))
    .filter((id) => typeof id === 'string');

  if (directedIds.length === 0 && !expertBroadcast) {
    if (unresolved.length > 0) {
      return NextResponse.json(
        { allowed: true, unresolved },
        { headers: NO_STORE }
      );
    }
    return NextResponse.json({ allowed: true }, { headers: NO_STORE });
  }

  // Asker cap reservation. Broadcast counts as a single "target slot" at
  // this layer; the RPC multiplies by `broadcast_cost` internally.
  const nTargets = directedIds.length + (expertBroadcast ? 1 : 0);
  const { data: capData, error: capErr } = await service.rpc(
    'check_and_reserve_asker_mention_cap',
    {
      p_user_id: user.id,
      p_n_targets: nTargets,
      p_is_broadcast: expertBroadcast,
    }
  );
  if (capErr) {
    console.error('[comments.can-mention.cap]', capErr);
    return NextResponse.json(
      { error: 'cap_check_failed' },
      { status: 500, headers: NO_STORE }
    );
  }
  if (capData && capData.allowed === false) {
    return NextResponse.json(
      {
        error: 'mention_cap_hit',
        composer_message: 'you reached your mentions for today.',
        detail: capData,
      },
      { status: 429, headers: NO_STORE }
    );
  }

  // Per-expert quota check. We split directed targets into "live" vs
  // "at_quota" — at_quota are inert per spec §2 (composer doesn't reject;
  // post_comment RPC will skip notification fan-out for them).
  let atQuotaSet = new Set();
  if (directedIds.length > 0) {
    const { data: quotaData, error: quotaErr } = await service.rpc(
      'check_expert_mention_quota',
      {
        p_target_user_ids: directedIds,
        p_article_id: articleId,
      }
    );
    if (quotaErr) {
      console.error('[comments.can-mention.quota]', quotaErr);
      return NextResponse.json(
        { error: 'quota_check_failed' },
        { status: 500, headers: NO_STORE }
      );
    }
    const atQuota = Array.isArray(quotaData?.at_quota) ? quotaData.at_quota : [];
    atQuotaSet = new Set(atQuota);
  }

  const directedTargets = [];
  const atQuotaTargets = [];
  for (const username of expertDirected) {
    const id = usernameToId.get(username);
    if (!id) continue;
    if (atQuotaSet.has(id)) {
      atQuotaTargets.push({ user_id: id, username });
    } else {
      directedTargets.push({ user_id: id, username });
    }
  }

  return NextResponse.json(
    {
      allowed: true,
      directed_targets: directedTargets,
      at_quota_targets: atQuotaTargets,
      broadcast: expertBroadcast,
      ...(unresolved.length > 0 ? { unresolved } : {}),
    },
    { headers: NO_STORE }
  );
}
