// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(_request, { params }) {
  let user;
  try { user = await requirePermission('kids.streak.freeze.use'); }
  catch (err) { return NextResponse.json({ error: err.message }, { status: err.status || 401 }); }

  const service = createServiceClient();
  const { data, error } = await service.rpc('use_kid_streak_freeze', {
    p_parent_id: user.id,
    p_kid_profile_id: params.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
