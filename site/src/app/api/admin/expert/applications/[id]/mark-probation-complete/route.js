import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// Phase 18.3: admin early-completes an expert's 30-day probation.
// Normally probation auto-closes when probation_ends_at passes.
export async function POST(request, { params }) {
  let user;
  try { user = await requireRole('admin'); }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }

  const body = await request.json().catch(() => ({}));
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';
  if (!notes) return NextResponse.json({ error: 'Admin notes required' }, { status: 400 });

  const service = createServiceClient();
  const { error } = await service.rpc('mark_probation_complete', {
    p_admin_id: user.id,
    p_application_id: params.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await service.from('audit_log').insert({
    actor_id: user.id,
    actor_type: 'user',
    action: 'expert.probation.complete',
    target_type: 'expert_application',
    target_id: params.id,
    metadata: { notes },
  });

  return NextResponse.json({ ok: true });
}
