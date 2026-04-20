// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// GET — recap + its questions (full shape incl. is_correct for editor).
// PATCH — update recap fields.
// DELETE — remove the recap (cascades to questions via FK).
export async function GET(_request, { params }) {
  try { await requirePermission('admin.recap.edit'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const [{ data: recap }, { data: questions }] = await Promise.all([
    service.from('weekly_recap_quizzes').select('*').eq('id', params.id).maybeSingle(),
    service.from('weekly_recap_questions').select('*').eq('recap_quiz_id', params.id).order('sort_order'),
  ]);
  if (!recap) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ recap, questions: questions || [] });
}

const ALLOWED = ['category_id', 'week_start', 'week_end', 'title', 'description', 'article_ids', 'is_active'];

export async function PATCH(request, { params }) {
  try { await requirePermission('admin.recap.edit'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const b = await request.json().catch(() => ({}));
  const update = {};
  for (const k of ALLOWED) if (b[k] !== undefined) update[k] = b[k];
  const service = createServiceClient();
  const { error } = await service.from('weekly_recap_quizzes').update(update).eq('id', params.id);
  if (error) return safeErrorResponse(NextResponse, error, { route: 'admin.recap.id', fallbackStatus: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request, { params }) {
  try { await requirePermission('admin.recap.delete'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const { error } = await service.from('weekly_recap_quizzes').delete().eq('id', params.id);
  if (error) return safeErrorResponse(NextResponse, error, { route: 'admin.recap.id', fallbackStatus: 400 });
  return NextResponse.json({ ok: true });
}
