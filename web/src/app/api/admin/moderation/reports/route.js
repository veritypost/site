// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// GET /api/admin/moderation/reports?status=pending&supervisor=true
export async function GET(request) {
  try {
    await requirePermission('admin.moderation.reports.bulk_resolve');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'pending';
  const supervisorOnly = url.searchParams.get('supervisor') === 'true';

  const service = createServiceClient();
  let q = service
    .from('reports')
    .select('*, reporter:users!fk_reports_reporter_id(id, username, avatar_color)')
    .eq('status', status)
    // D22: supervisor-flagged reports jump the queue.
    .order('is_supervisor_flag', { ascending: false })
    .order('created_at', { ascending: false });
  if (supervisorOnly) q = q.eq('is_supervisor_flag', true);

  const { data, error } = await q;
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.moderation.reports',
      fallbackStatus: 400,
    });
  return NextResponse.json({ reports: data || [] });
}
