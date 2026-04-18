import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request, { params }) {
  let user;
  try { user = await requireRole('moderator'); }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }

  const { reason } = await request.json().catch(() => ({}));
  const service = createServiceClient();
  const { error } = await service.rpc('hide_comment', {
    p_mod_id: user.id,
    p_comment_id: params.id,
    p_reason: reason || 'moderator action',
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
