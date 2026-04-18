import { NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// GET — list upcoming sessions (visible to family accounts; kids list these).
// POST — editor-only, schedule a new session.
// Body: { expert_id, category_id?, title, description?, scheduled_at,
//         duration_minutes?, max_questions? }
export async function GET(request) {
  try { await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'scheduled';

  const service = createServiceClient();
  const { data, error } = await service
    .from('kid_expert_sessions')
    .select('*, users!kid_expert_sessions_expert_id_fkey(username, display_name, expert_title), categories(name)')
    .eq('status', status)
    .eq('is_active', true)
    .order('scheduled_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ sessions: data || [] });
}

export async function POST(request) {
  let user;
  try { user = await requireRole('editor'); }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }

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
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}
