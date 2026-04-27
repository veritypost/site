// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { recordAdminAction } from '@/lib/adminMutation';
import { safeErrorResponse } from '@/lib/apiErrors';

// GET — list recaps. POST — create a new recap skeleton.
// Body: { category_id?, week_start, week_end, title, description?, article_ids? }
export async function GET() {
  try {
    await requirePermission('admin.recap.edit');
  } catch (err) {
    if (err.status) {
      console.error('[admin.recap.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const { data, error } = await service
    .from('weekly_recap_quizzes')
    .select('*, categories(name)')
    .order('week_start', { ascending: false })
    .limit(50);
  if (error)
    return safeErrorResponse(NextResponse, error, { route: 'admin.recap', fallbackStatus: 400 });
  return NextResponse.json({ recaps: data || [] });
}

export async function POST(request) {
  let user;
  try {
    user = await requirePermission('admin.recap.create');
  } catch (err) {
    if (err.status) {
      console.error('[admin.recap.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.recap.create:${user.id}`,
    policyKey: 'admin.recap.create',
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
  if (!b.title || !b.week_start || !b.week_end) {
    return NextResponse.json({ error: 'title, week_start, week_end required' }, { status: 400 });
  }
  const { data, error } = await service
    .from('weekly_recap_quizzes')
    .insert({
      category_id: b.category_id || null,
      week_start: b.week_start,
      week_end: b.week_end,
      title: b.title,
      description: b.description || null,
      article_ids: b.article_ids || [],
      is_active: true,
    })
    .select('id')
    .single();
  if (error)
    return safeErrorResponse(NextResponse, error, { route: 'admin.recap', fallbackStatus: 400 });
  await recordAdminAction({
    action: 'recap.create',
    targetTable: 'weekly_recap_quizzes',
    targetId: data.id,
    newValue: {
      title: b.title,
      week_start: b.week_start,
      week_end: b.week_end,
      category_id: b.category_id || null,
    },
  });
  return NextResponse.json({ id: data.id });
}
