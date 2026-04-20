// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

export async function POST(request, { params }) {
  let user;
  try { user = await requirePermission('admin.expert.applications.approve'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { review_notes } = await request.json().catch(() => ({}));
  const service = createServiceClient();
  const { error } = await service.rpc('approve_expert_application', {
    p_reviewer_id: user.id,
    p_application_id: params.id,
    p_review_notes: review_notes || null,
  });
  if (error) return safeErrorResponse(NextResponse, error, { route: 'admin.expert.applications.id.approve', fallbackStatus: 400 });
  return NextResponse.json({ ok: true });
}
