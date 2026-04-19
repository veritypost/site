// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// POST /api/admin/moderation/reports/[id]/resolve
// Body: { resolution, notes? }
export async function POST(request, { params }) {
  let user;
  try { user = await requirePermission('admin.moderation.reports.bulk_resolve'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { resolution, notes } = await request.json().catch(() => ({}));
  if (!resolution) return NextResponse.json({ error: 'resolution required' }, { status: 400 });

  const service = createServiceClient();
  const { error } = await service.rpc('resolve_report', {
    p_mod_id: user.id,
    p_report_id: params.id,
    p_resolution: resolution,
    p_notes: notes || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
