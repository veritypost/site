import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// Editor approves a probation-state expert answer, flipping it
// to visible. D3: 30-day probation.
export async function POST(_request, { params }) {
  let user;
  try { user = await requireRole('editor'); }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }

  const service = createServiceClient();
  const { error } = await service.rpc('approve_expert_answer', {
    p_editor_id: user.id,
    p_comment_id: params.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
