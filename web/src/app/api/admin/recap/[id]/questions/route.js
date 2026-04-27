// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { recordAdminAction } from '@/lib/adminMutation';
import { safeErrorResponse } from '@/lib/apiErrors';

// POST /api/admin/recap/[id]/questions — add a question.
// Body: { article_id?, question_text, options: [{text, is_correct}], explanation?, sort_order? }
export async function POST(request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.recap.questions_manage');
  } catch (err) {
    if (err.status) {
      console.error('[admin.recap.[id].questions.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.recap.questions.create:${user.id}`,
    policyKey: 'admin.recap.questions.create',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const b = await request.json().catch(() => ({}));
  if (!b.question_text || !Array.isArray(b.options) || b.options.length < 2) {
    return NextResponse.json({ error: 'question_text + 2+ options required' }, { status: 400 });
  }
  if (b.options.filter((o) => o.is_correct).length !== 1) {
    return NextResponse.json(
      { error: 'exactly one option must be marked correct' },
      { status: 400 }
    );
  }
  const { data, error } = await service
    .from('weekly_recap_questions')
    .insert({
      recap_quiz_id: params.id,
      article_id: b.article_id || null,
      question_text: b.question_text,
      options: b.options,
      explanation: b.explanation || null,
      sort_order: b.sort_order || 0,
    })
    .select('id')
    .single();
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.recap.id.questions',
      fallbackStatus: 400,
    });
  await recordAdminAction({
    action: 'recap.question.create',
    targetTable: 'weekly_recap_questions',
    targetId: data.id,
    newValue: {
      recap_quiz_id: params.id,
      question_text: b.question_text,
      article_id: b.article_id || null,
    },
  });
  return NextResponse.json({ id: data.id });
}
