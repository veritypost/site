// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// POST /api/admin/data-requests/[id]/approve
// Marks the requester's identity as verified so the export cron
// (process-data-exports) can pick up the row. Records the approving
// admin's id + timestamp. Does NOT change status — the cron transitions
// status pending -> processing -> completed via claim_next_export_request.
export async function POST(request, { params }) {
  let user;
  try { user = await requirePermission('admin.users.data_requests.process'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const now = new Date().toISOString();
  const { error } = await service
    .from('data_requests')
    .update({
      identity_verified: true,
      identity_verified_at: now,
      identity_verified_by: user.id,
      processed_by: user.id,
      updated_at: now,
    })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
