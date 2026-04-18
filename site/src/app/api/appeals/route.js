import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// POST /api/appeals — user files an appeal on one of their warnings.
// Body: { warning_id, text }
export async function POST(request) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const { warning_id, text } = await request.json().catch(() => ({}));
  if (!warning_id || !text) return NextResponse.json({ error: 'warning_id and text required' }, { status: 400 });

  const service = createServiceClient();
  const { error } = await service.rpc('submit_appeal', {
    p_user_id: user.id,
    p_warning_id: warning_id,
    p_text: text,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
