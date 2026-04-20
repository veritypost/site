// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// Phase 18.3: admin early-completes an expert's 30-day probation.
// Normally probation auto-closes when probation_ends_at passes.
export async function POST(request, { params }) {
  let user;
  try { user = await requirePermission('admin.expert.applications.mark_probation_complete'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';
  if (!notes) return NextResponse.json({ error: 'Admin notes required' }, { status: 400 });

  const service = createServiceClient();
  const { error } = await service.rpc('mark_probation_complete', {
    p_admin_id: user.id,
    p_application_id: params.id,
  });
  if (error) return safeErrorResponse(NextResponse, error, { route: 'admin.expert.applications.id.mark_probation_complete', fallbackStatus: 400 });

  await service.from('audit_log').insert({
    actor_id: user.id,
    actor_type: 'user',
    action: 'expert.probation.complete',
    target_type: 'expert_application',
    target_id: params.id,
    metadata: { notes },
  });

  return NextResponse.json({ ok: true });
}
