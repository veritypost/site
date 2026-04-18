import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { getMaxRoleLevel } from '@/lib/roles';

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
  try { user = await requireRole('moderator'); }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }

  const { level, reason } = await request.json().catch(() => ({}));
  if (!level || !reason) return NextResponse.json({ error: 'level and reason required' }, { status: 400 });
  const levelNum = Number(level);
  if (!Number.isInteger(levelNum) || levelNum < 1 || levelNum > 4) {
    return NextResponse.json({ error: 'level must be 1..4' }, { status: 400 });
  }

  const actorLevel = await getMaxRoleLevel(user.id);
  const targetLevel = await getMaxRoleLevel(params.id);
  if (actorLevel <= targetLevel) {
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
