import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// D24: weekly family report. Data endpoint only — the email send
// system lands in Phase 11.
export async function GET() {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const service = createServiceClient();
  let ownerId = user.id;
  const { data: subRow } = await service
    .from('subscriptions').select('family_owner_id')
    .eq('user_id', user.id).eq('status', 'active').maybeSingle();
  if (subRow?.family_owner_id) ownerId = subRow.family_owner_id;

  const { data, error } = await service.rpc('family_weekly_report', { p_owner_id: ownerId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data || {});
}
