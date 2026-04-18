import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request, { params }) {
  let user;
  try { user = await requireRole('editor'); }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }

  const { rejection_reason } = await request.json().catch(() => ({}));
  if (!rejection_reason) {
    return NextResponse.json({ error: 'rejection_reason required' }, { status: 400 });
  }
  const service = createServiceClient();
  const { error } = await service.rpc('reject_expert_application', {
    p_reviewer_id: user.id,
    p_application_id: params.id,
    p_rejection_reason: rejection_reason,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
