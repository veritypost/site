// T-005 — server route for admin/users "Award achievement" action.
// Replaces direct `supabase.from('user_achievements').insert(...)`.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

type Body = { achievement_name?: string };

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const targetId = params?.id;
  if (!targetId) return NextResponse.json({ error: 'user id required' }, { status: 400 });

  let actor;
  try { actor = await requirePermission('admin.users.award_achievement'); }
  catch (err) { return permissionError(err); }
  void actor;

  const body = (await request.json().catch(() => ({}))) as Body;
  const name = typeof body.achievement_name === 'string' ? body.achievement_name.trim() : '';
  if (!name) return NextResponse.json({ error: 'achievement_name required' }, { status: 400 });

  const service = createServiceClient();
  const { data: row } = await service
    .from('achievements')
    .select('id, name')
    .eq('name', name)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: `No achievement named "${name}"` }, { status: 404 });

  const { error } = await service.from('user_achievements').insert({
    user_id: targetId,
    achievement_id: row.id,
  });
  if (error) {
    console.error('[admin.users.achievements.award]', error.message);
    return NextResponse.json({ error: 'Could not award achievement' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'user.achievement.award',
    targetTable: 'user_achievements',
    targetId: null,
    newValue: { user_id: targetId, achievement_id: row.id, achievement_name: row.name },
  });

  return NextResponse.json({ ok: true });
}
