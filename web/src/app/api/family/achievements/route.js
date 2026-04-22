// @migrated-to-permissions 2026-04-18
// @feature-verified family 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// D24: shared family achievements. List the defined achievements
// + the caller's household progress. Writes happen server-side
// via cron rollups (Phase 11-era); this endpoint is read-only.
export async function GET() {
  let user;
  try {
    user = await requirePermission('kids.achievements.view');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const service = createServiceClient();
  let ownerId = user.id;
  const { data: subRow } = await service
    .from('subscriptions')
    .select('family_owner_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (subRow?.family_owner_id) ownerId = subRow.family_owner_id;

  const { data: defs } = await service
    .from('family_achievements')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  const { data: progress } = await service
    .from('family_achievement_progress')
    .select('*')
    .eq('family_owner_id', ownerId);

  const progressById = Object.fromEntries(
    (progress || []).map((p) => [p.family_achievement_id, p])
  );
  const merged = (defs || []).map((d) => ({
    ...d,
    progress: progressById[d.id]?.progress || null,
    earned_at: progressById[d.id]?.earned_at || null,
  }));

  return NextResponse.json({ achievements: merged, owner_id: ownerId });
}
