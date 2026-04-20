// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// Editor approves a probation-state expert answer, flipping it
// to visible. D3: 30-day probation.
export async function POST(_request, { params }) {
  let user;
  try { user = await requirePermission('admin.expert.answers.approve'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const { error } = await service.rpc('approve_expert_answer', {
    p_editor_id: user.id,
    p_comment_id: params.id,
  });
  if (error) return safeErrorResponse(NextResponse, error, { route: 'expert.answers.id.approve', fallbackStatus: 400 });
  return NextResponse.json({ ok: true });
}
