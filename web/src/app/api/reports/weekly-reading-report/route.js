// @migrated-to-permissions 2026-04-18
// @feature-verified reports 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// GET /api/reports/weekly-reading-report — D25 per-user weekly data.
// Paid only; free users get an upsell hint.
export async function GET() {
  let user;
  try { user = await requirePermission('kids.parent.weekly_report.view'); }
  catch (err) { if (err.status) return NextResponse.json({ error: err.message }, { status: err.status }); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }

  const service = createServiceClient();
  const { data: paid } = await service.rpc('_user_is_paid', { p_user_id: user.id });
  if (!paid) return NextResponse.json({ paid: false, report: null });

  const { data, error } = await service.rpc('weekly_reading_report', { p_user_id: user.id });
  if (error) return safeErrorResponse(NextResponse, error, { route: 'reports.weekly_reading_report', fallbackStatus: 400 });
  return NextResponse.json({ paid: true, report: data });
}
