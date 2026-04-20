// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

const ALLOWED = ['article_id', 'question_text', 'options', 'explanation', 'sort_order'];

export async function PATCH(request, { params }) {
  try { await requirePermission('admin.recap.questions_manage'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const b = await request.json().catch(() => ({}));
  const update = {};
  for (const k of ALLOWED) if (b[k] !== undefined) update[k] = b[k];
  const service = createServiceClient();
  const { error } = await service.from('weekly_recap_questions').update(update).eq('id', params.id);
  if (error) return safeErrorResponse(NextResponse, error, { route: 'admin.recap.questions.id', fallbackStatus: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request, { params }) {
  try { await requirePermission('admin.recap.questions_manage'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const { error } = await service.from('weekly_recap_questions').delete().eq('id', params.id);
  if (error) return safeErrorResponse(NextResponse, error, { route: 'admin.recap.questions.id', fallbackStatus: 400 });
  return NextResponse.json({ ok: true });
}
