// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';
import { recordAdminAction, requireAdminOutranks } from '@/lib/adminMutation';

// Blueprint §10 progressive stack:
//   level 1 = warn
//   level 2 = 24h comment mute
//   level 3 = 7-day full mute
//   level 4 = ban (user can appeal)
//
// F-036: the pre-fix route let any moderator (60) issue any penalty
// level against any target, including admins (80). Add the actor-
// outranks-target gate so a moderator cannot ban an admin, an editor
// cannot ban an admin, etc. Self-penalty is blocked outright because
// an actor does not strictly outrank themselves.
export async function POST(request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.moderation.penalty.warn');
  } catch (err) {
    if (err.status) {
      console.error('[admin.moderation.users.[id].penalty.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { level, reason } = await request.json().catch(() => ({}));
  if (!reason) {
    return NextResponse.json({ error: 'reason required' }, { status: 400 });
  }

  // T276 — auto-escalate when caller omits level (or sends 'auto' / null).
  // Manual override path: explicit numeric level 1..4 is respected as-is.
  const isAuto = level === undefined || level === null || level === 'auto' || level === '';
  let levelNum;
  let priorCount = null;
  if (!isAuto) {
    levelNum = Number(level);
    if (!Number.isInteger(levelNum) || levelNum < 1 || levelNum > 4) {
      return NextResponse.json({ error: 'level must be 1..4 or "auto"' }, { status: 400 });
    }
  }

  // Q6 — actor-outranks-target via server-side RPC (canonical
  // roles.hierarchy_level source; replaces the in-code ROLE_HIERARCHY map).
  // RPC reads auth.uid() on the authed supabase client, so we must call it
  const rankErr = await requireAdminOutranks(params.id, user.id);
  if (rankErr) return rankErr;

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.moderation.users.penalty:${user.id}`,
    policyKey: 'admin.moderation.users.penalty',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  // T276 — count user_warnings against this target in the last 60 days
  // and derive the next escalation step:
  //   0 prior  -> 1 (warn)
  //   1 prior  -> 2 (24h comment mute)
  //   2 prior  -> 3 (7-day full mute)
  //   3+ prior -> 4 (permanent ban)
  if (isAuto) {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countErr } = await service
      .from('user_warnings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', params.id)
      .gte('created_at', sixtyDaysAgo);
    if (countErr) {
      return safeErrorResponse(NextResponse, countErr, {
        route: 'admin.moderation.users.id.penalty',
        fallbackStatus: 400,
      });
    }
    priorCount = count ?? 0;
    if (priorCount <= 0) levelNum = 1;
    else if (priorCount === 1) levelNum = 2;
    else if (priorCount === 2) levelNum = 3;
    else levelNum = 4;
  }

  const { data, error } = await service.rpc('apply_penalty', {
    p_mod_id: user.id,
    p_target_id: params.id,
    p_level: levelNum,
    p_reason: reason,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.moderation.users.id.penalty',
      fallbackStatus: 400,
    });

  // C21 — audit the moderation action. Pre-fix, penalties (warn /
  // 24h mute / 7d mute / ban) executed with zero audit trail, breaking
  // chain-of-custody for moderation decisions + compliance review.
  // T276 — record auto-escalation provenance in metadata.
  await recordAdminAction({
    action: 'moderation.penalty',
    targetTable: 'users',
    targetId: params.id,
    newValue: {
      level: levelNum,
      reason,
      warning_id: data,
      auto_escalated: isAuto,
      ...(isAuto ? { escalated_from_count: priorCount } : {}),
    },
  });

  return NextResponse.json({
    warning_id: data,
    level: levelNum,
    auto_escalated: isAuto,
    ...(isAuto ? { escalated_from_count: priorCount } : {}),
  });
}
