// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';

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
  try { user = await requirePermission('admin.moderation.penalty.warn'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { level, reason } = await request.json().catch(() => ({}));
  if (!level || !reason) return NextResponse.json({ error: 'level and reason required' }, { status: 400 });
  const levelNum = Number(level);
  if (!Number.isInteger(levelNum) || levelNum < 1 || levelNum > 4) {
    return NextResponse.json({ error: 'level must be 1..4' }, { status: 400 });
  }

  // Q6 — actor-outranks-target via server-side RPC (canonical
  // roles.hierarchy_level source; replaces the in-code ROLE_HIERARCHY map).
  // RPC reads auth.uid() on the authed supabase client, so we must call it
  // from `createClient()` (cookie-scoped to the caller), not the service role.
  const authed = createClient();
  const { data: outranks, error: rankErr } = await authed.rpc('require_outranks', {
    target_user_id: params.id,
  });
  if (rankErr) return NextResponse.json({ error: rankErr.message }, { status: 500 });
  if (!outranks) {
    return NextResponse.json(
      { error: 'Cannot penalize a user whose rank meets or exceeds your own' },
      { status: 403 }
    );
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('apply_penalty', {
    p_mod_id: user.id,
    p_target_id: params.id,
    p_level: levelNum,
    p_reason: reason,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ warning_id: data });
}
