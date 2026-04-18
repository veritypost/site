import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

async function ownKid(service, userId, kidId) {
  const { data } = await service.from('kid_profiles').select('id, parent_user_id').eq('id', kidId).maybeSingle();
  return data && data.parent_user_id === userId ? data : null;
}

export async function PATCH(request, { params }) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const service = createServiceClient();
  if (!await ownKid(service, user.id, params.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const b = await request.json().catch(() => ({}));
  // F-086 continuation: PATCH may no longer write pin_hash / pin_salt /
  // pin_hash_algo. PIN changes go through /api/kids/set-pin which hashes
  // server-side (lib/kidPin).
  const allowed = ['display_name', 'avatar_color', 'date_of_birth', 'max_daily_minutes', 'reading_level'];
  const update = {};
  for (const k of allowed) if (b[k] !== undefined) update[k] = b[k];
  if (b.paused !== undefined) {
    update.paused_at = b.paused ? new Date().toISOString() : null;
  }
  // D12 2026-04-16 opt-in flag. Parent-controlled, per-kid.
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
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const service = createServiceClient();
  if (!await ownKid(service, user.id, params.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { error } = await service.from('kid_profiles').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
