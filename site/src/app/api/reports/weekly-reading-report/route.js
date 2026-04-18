import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// GET /api/reports/weekly-reading-report — D25 per-user weekly data.
// Paid only; free users get an upsell hint.
export async function GET() {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const service = createServiceClient();
  const { data: paid } = await service.rpc('_user_is_paid', { p_user_id: user.id });
  if (!paid) return NextResponse.json({ paid: false, report: null });

  const { data, error } = await service.rpc('weekly_reading_report', { p_user_id: user.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ paid: true, report: data });
}
