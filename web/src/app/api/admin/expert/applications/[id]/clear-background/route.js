// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// Phase 18.1: admin clears a journalist's background check so
// approve_expert_application will accept them. Journalist approvals
// refuse until background_check_status='cleared'.
export async function POST(request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.expert.applications.clear_background');
  } catch (err) {
    if (err.status) {
      console.error('[admin.expert.applications.[id].clear-background.permission]', err?.message || err);
      return NextResponse.json({ error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' }, { status: err.status });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';
  if (!notes) return NextResponse.json({ error: 'Admin notes required' }, { status: 400 });

  const service = createServiceClient();
  const { data, error } = await service
    .from('expert_applications')
    .update({ background_check_status: 'cleared' })
    .eq('id', params.id)
    .select('id, background_check_status')
    .maybeSingle();

  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.expert.applications.id.clear_background',
      fallbackStatus: 400,
    });
  if (!data) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  await service.from('audit_log').insert({
    actor_id: user.id,
    actor_type: 'user',
    action: 'expert.background_check.cleared',
    target_type: 'expert_application',
    target_id: params.id,
    metadata: { notes },
  });

  return NextResponse.json({ ok: true, background_check_status: data.background_check_status });
}
