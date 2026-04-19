// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

async function ownKid(service, userId, kidId) {
  const { data } = await service.from('kid_profiles').select('id, parent_user_id').eq('id', kidId).maybeSingle();
  return data && data.parent_user_id === userId ? data : null;
}

export async function PATCH(request, { params }) {
  let user;
  try { user = await requirePermission('kids.profile.update'); }
  catch (err) { return NextResponse.json({ error: err.message }, { status: err.status || 401 }); }

  const service = createServiceClient();
  if (!await ownKid(service, user.id, params.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const b = await request.json().catch(() => ({}));
  const allowed = ['display_name', 'avatar_color', 'date_of_birth', 'max_daily_minutes', 'reading_level'];
  const update = {};
  for (const k of allowed) if (b[k] !== undefined) update[k] = b[k];
  if (b.paused !== undefined) {
    update.paused_at = b.paused ? new Date().toISOString() : null;
  }
  if (b.global_leaderboard_opt_in !== undefined) {
    update.global_leaderboard_opt_in = !!b.global_leaderboard_opt_in;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true });

  const { error } = await service.from('kid_profiles').update(update).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request, { params }) {
  let user;
  try { user = await requirePermission('kids.profile.delete'); }
  catch (err) { return NextResponse.json({ error: err.message }, { status: err.status || 401 }); }

  const service = createServiceClient();
  if (!await ownKid(service, user.id, params.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { error } = await service.from('kid_profiles').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
