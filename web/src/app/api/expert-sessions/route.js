// @migrated-to-permissions 2026-04-18
// @feature-verified expert_sessions 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// GET — list upcoming sessions (visible to family accounts; kids list these).
// POST — editor-only, schedule a new session.
// Body: { expert_id, category_id?, title, description?, scheduled_at,
//         duration_minutes?, max_questions? }
export async function GET(request) {
  try {
    await requirePermission('kids_expert.sessions.list.view');
  } catch (err) {
    if (err.status) {
      console.error('[expert-sessions.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'scheduled';

  const service = createServiceClient();
  const { data, error } = await service
    .from('kid_expert_sessions')
    .select(
      'id, title, description, session_type, scheduled_at, duration_minutes, status, max_questions, category_id, is_active, created_at, updated_at, users!fk_kid_expert_sessions_expert_id(username), categories(name)'
    )
    .eq('status', status)
    .eq('is_active', true)
    .order('scheduled_at');
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'expert_sessions',
      fallbackStatus: 400,
    });
  return NextResponse.json({ sessions: data || [] });
}

export async function POST(request) {
  try {
    await requirePermission('admin.expert_sessions.create');
  } catch (err) {
    if (err.status) {
      console.error('[expert-sessions.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const b = await request.json().catch(() => ({}));
  if (!b.expert_id || !b.title || !b.scheduled_at) {
    return NextResponse.json({ error: 'expert_id, title, scheduled_at required' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('kid_expert_sessions')
    .insert({
      expert_id: b.expert_id,
      category_id: b.category_id || null,
      title: b.title,
      description: b.description || null,
      scheduled_at: b.scheduled_at,
      duration_minutes: b.duration_minutes || 30,
      max_questions: b.max_questions || null,
      status: 'scheduled',
    })
    .select('id')
    .single();
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'expert_sessions',
      fallbackStatus: 400,
    });
  return NextResponse.json({ id: data.id });
}
