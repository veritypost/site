import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// D24: private family leaderboard. Only the family owner + members
// can view. Ordered by Verity Score.
export async function GET() {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const service = createServiceClient();

  // Family owner = the user themselves if they own, OR the owner referenced
  // by the caller's family subscription.
  let ownerId = user.id;
  const { data: subRow } = await service
    .from('subscriptions')
    .select('family_owner_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (subRow?.family_owner_id) ownerId = subRow.family_owner_id;

  const { data, error } = await service.rpc('family_members', { p_owner_id: ownerId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Sort by score desc for the leaderboard.
  const sorted = (data || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0));
  return NextResponse.json({ members: sorted, owner_id: ownerId });
}
