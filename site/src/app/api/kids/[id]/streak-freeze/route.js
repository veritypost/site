import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// D19: kids get 2 streak freezes per week.
export async function POST(_request, { params }) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const service = createServiceClient();
  const { data, error } = await service.rpc('use_kid_streak_freeze', {
    p_parent_id: user.id,
    p_kid_profile_id: params.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
